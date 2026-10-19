/**
 * AI-Quota VS Code Extension — Entry Point
 *
 * Architecture: thin HTTP client to the AI-Quota local agent at 127.0.0.1:8765
 * The extension does NOT contain quota logic — it delegates everything to the agent.
 *
 * Primary surfaces:
 *   - Activity Bar Sidebar (Quota / Accounts / Providers views)
 *   - Status Bar item ("AI-Quota 84% · 1h42m", pin-model aware)
 *   - Command Palette (all commands)
 *   - Native notifications (low quota threshold alerts + auto-switch)
 */

import * as vscode from "vscode";
import { AgentClient } from "./agent_client";
import { QuotaStatusBar } from "./status_bar";
import { QuotaSidebarProvider } from "./sidebar/quota_sidebar_provider";
import { AccountsProvider } from "./sidebar/accounts_provider";
import { ProvidersProvider } from "./sidebar/providers_provider";
import { registerAllCommands } from "./commands";

let statusBar: QuotaStatusBar | null = null;
let agentClient: AgentClient | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let syncTimer: NodeJS.Timeout | null = null;

// Track auto-switch cooldown — only switch once per cooldown window (default 5 min, configurable)
let _lastAutoSwitch = 0;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("ai-quota");
  const agentUrl = config.get<string>("agentUrl", "http://127.0.0.1:8765");
  const pollInterval = config.get<number>("pollInterval", 30) * 1000;
  const syncInterval = config.get<number>("syncIntervalMinutes", 5) * 60 * 1000;

  // ── Create the shared agent HTTP client ──────────────────────────────────
  agentClient = new AgentClient(agentUrl);

  // ── Status Bar ────────────────────────────────────────────────────────────
  statusBar = new QuotaStatusBar(agentClient, context);
  statusBar.show();

  // ── Sidebar views ─────────────────────────────────────────────────────────
  const quotaSidebarProvider = new QuotaSidebarProvider(context, agentClient);
  const accountsProvider = new AccountsProvider(agentClient);
  const providersProvider = new ProvidersProvider(agentClient);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "ai-quota.quotaView",
      quotaSidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerTreeDataProvider("ai-quota.accountsView", accountsProvider),
    vscode.window.registerTreeDataProvider("ai-quota.providersView", providersProvider)
  );

  // ── Commands ──────────────────────────────────────────────────────────────
  registerAllCommands(context, agentClient, {
    statusBar,
    accountsProvider,
    providersProvider,
    quotaSidebarProvider,
  });

  // ── Fast poll: refresh UI + run threshold checks ───────────────────────────
  const fastRefresh = async () => {
    try {
      await statusBar?.refresh();
      accountsProvider.refresh();
      providersProvider.refresh();
      quotaSidebarProvider.refresh();

      const cfg = vscode.workspace.getConfiguration("ai-quota");
      const threshold = cfg.get<number>("notificationThreshold", 20);
      const autoSwitch = cfg.get<boolean>("autoSwitch", false);
      const cooldownMin = cfg.get<number>("autoSwitchCooldownMinutes", 5);

      await checkLowQuotaNotifications(agentClient!, threshold, context, autoSwitch, cooldownMin, statusBar);
    } catch {
      statusBar?.setOffline();
    }
  };

  // ── Slow sync: triggers full provider scan ─────────────────────────────────
  const slowSync = async () => {
    try {
      await agentClient!.sync();
      await fastRefresh();
    } catch {
      statusBar?.setOffline();
    }
  };

  // Initial sync + refresh
  await slowSync();

  // Fast UI poll (default 30s)
  pollTimer = setInterval(fastRefresh, pollInterval);
  context.subscriptions.push({ dispose: () => pollTimer && clearInterval(pollTimer) });

  // Slow sync (default 5 min)
  syncTimer = setInterval(slowSync, syncInterval);
  context.subscriptions.push({ dispose: () => syncTimer && clearInterval(syncTimer) });

  // Config change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ai-quota.pollInterval")) {
        if (pollTimer) clearInterval(pollTimer);
        const newInterval =
          vscode.workspace.getConfiguration("ai-quota").get<number>("pollInterval", 30) * 1000;
        pollTimer = setInterval(fastRefresh, newInterval);
      }
      if (e.affectsConfiguration("ai-quota.syncIntervalMinutes")) {
        if (syncTimer) clearInterval(syncTimer);
        const newSync =
          vscode.workspace.getConfiguration("ai-quota").get<number>("syncIntervalMinutes", 5) *
          60 *
          1000;
        syncTimer = setInterval(slowSync, newSync);
      }
    })
  );
}

export function deactivate(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  statusBar?.dispose();
}

// ── Low quota notification + auto-switch ────────────────────────────────────

async function checkLowQuotaNotifications(
  client: AgentClient,
  threshold: number,
  context: vscode.ExtensionContext,
  autoSwitch: boolean,
  cooldownMin: number,
  statusBarRef: QuotaStatusBar | null
): Promise<void> {
  try {
    const accounts = await client.getAccounts();
    const stored = context.globalState.get<string[]>("ai-quota.notifiedKeys", []);
    const notified = new Set<string>(stored);

    const activeAccount = accounts.find((a) => a.status === "live");
    const activeRemaining = activeAccount?.best_remaining ?? null;

    // ── Auto-switch logic ──────────────────────────────────────────────────
    if (
      autoSwitch &&
      activeRemaining !== null &&
      activeRemaining <= threshold &&
      Date.now() - _lastAutoSwitch > cooldownMin * 60_000
    ) {
      // Find the best non-active account with significantly more quota
      const candidates = accounts.filter(
        (a) =>
          a.status !== "live" &&
          a.best_remaining !== null &&
          a.best_remaining > activeRemaining + 10
      );
      candidates.sort((a, b) => (b.best_remaining ?? 0) - (a.best_remaining ?? 0));
      const best = candidates[0];

      if (best) {
        _lastAutoSwitch = Date.now();
        const bestName = best.label || best.display_name || best.email || `#${best.id}`;
        const activeName =
          activeAccount?.label ||
          activeAccount?.display_name ||
          activeAccount?.email ||
          "current";

        try {
          const result = await client.switchAccount(best.id);
          if (result.status === "success" && result.verified) {
            // Notify official Antigravity UI if available
            try {
              const cmds = await vscode.commands.getCommands(true);
              if (cmds.includes("antigravity.handleAuthRefresh")) {
                await vscode.commands.executeCommand("antigravity.handleAuthRefresh");
              }
            } catch { /* best effort */ }

            vscode.window
              .showInformationMessage(
                `⚡ AI-Quota Auto-Switch: "${activeName}" at ${activeRemaining.toFixed(0)}% → switched to "${bestName}" (${(best.best_remaining ?? 0).toFixed(0)}%)`,
                "Undo Switch",
                "Dismiss"
              )
              .then(async (action) => {
                if (action === "Undo Switch" && activeAccount) {
                  try {
                    await client.switchAccount(activeAccount.id);
                    statusBarRef?.refresh();
                  } catch { /* ignore */ }
                }
              });

            statusBarRef?.refresh();
          } else {
            // Switch failed — fall through to normal notification
            vscode.window.showWarningMessage(
              `AI-Quota Auto-Switch failed for "${bestName}": ${result.reason}`
            );
          }
        } catch (err) {
          vscode.window.showWarningMessage(
            `AI-Quota Auto-Switch error: ${String(err)}`
          );
        }
        return; // Skip duplicate notification after auto-switch
      }
    }

    // ── Low quota notification (no auto-switch, or no candidate found) ─────
    for (const account of accounts) {
      const remaining = account.best_remaining;
      if (remaining !== null && remaining !== undefined) {
        if (remaining <= threshold) {
          const key = `notified_${account.id}_${Math.floor(remaining / 5) * 5}`;
          if (!notified.has(key)) {
            notified.add(key);
            context.globalState.update("ai-quota.notifiedKeys", Array.from(notified));

            const name = account.label || account.display_name || account.email;
            const actions = autoSwitch
              ? (["Dismiss"] as const)
              : (["Switch Account", "Dismiss"] as const);

            vscode.window
              .showWarningMessage(
                `⚠ AI-Quota: "${name}" quota at ${remaining.toFixed(0)}%` +
                  (autoSwitch ? " (auto-switch enabled — will switch automatically)" : ""),
                ...actions
              )
              .then((action) => {
                if (action === "Switch Account") {
                  vscode.commands.executeCommand("ai-quota.switchAccount");
                }
              });
          }
        } else if (remaining > threshold + 10) {
          // Quota recovered — clear notification debounce for this account
          let changed = false;
          for (const k of Array.from(notified)) {
            if (k.startsWith(`notified_${account.id}_`)) {
              notified.delete(k);
              changed = true;
            }
          }
          if (changed) {
            context.globalState.update("ai-quota.notifiedKeys", Array.from(notified));
          }
        }
      }
    }
  } catch {
    // silent — notification is best-effort
  }
}
