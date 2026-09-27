/**
 * AI-Quota VS Code Extension — Entry Point
 *
 * Architecture: thin HTTP client to the AI-Quota local agent at 127.0.0.1:8765
 * The extension does NOT contain quota logic — it delegates everything to the agent.
 *
 * Primary surfaces:
 *   - Activity Bar Sidebar (Quota / Accounts / Providers views)
 *   - Status Bar item ("AI-Quota 84% · 1h42m")
 *   - Command Palette (11 commands)
 *   - Native notifications (low quota threshold alerts)
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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("ai-quota");
  const agentUrl = config.get<string>("agentUrl", "http://127.0.0.1:8765");
  const pollInterval = config.get<number>("pollInterval", 30) * 1000;

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

  // ── Polling ───────────────────────────────────────────────────────────────
  const refresh = async () => {
    try {
      await agentClient!.sync();
      statusBar?.refresh();
      accountsProvider.refresh();
      providersProvider.refresh();
      quotaSidebarProvider.refresh();

      // Low quota notification check
      const threshold = config.get<number>("notificationThreshold", 20);
      await checkLowQuotaNotifications(agentClient!, threshold);
    } catch {
      // Agent not running — show offline state in status bar
      statusBar?.setOffline();
    }
  };

  // Initial refresh
  await refresh();

  // Periodic refresh
  pollTimer = setInterval(refresh, pollInterval);
  context.subscriptions.push({ dispose: () => pollTimer && clearInterval(pollTimer) });

  // Config change listener — update poll interval if changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ai-quota.pollInterval")) {
        if (pollTimer) clearInterval(pollTimer);
        const newInterval = vscode.workspace.getConfiguration("ai-quota").get<number>("pollInterval", 30) * 1000;
        pollTimer = setInterval(refresh, newInterval);
      }
    })
  );
}

export function deactivate(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  statusBar?.dispose();
}

async function checkLowQuotaNotifications(
  client: AgentClient,
  threshold: number
): Promise<void> {
  try {
    const accounts = await client.getAccounts();
    for (const account of accounts) {
      const remaining = account.best_remaining;
      if (remaining !== null && remaining !== undefined && remaining <= threshold) {
        const key = `notified_${account.id}_${Math.floor(remaining / 5) * 5}`;
        // Simple dedup: only notify once per 5% band
        const alreadyNotified = _notifiedKeys.has(key);
        if (!alreadyNotified) {
          _notifiedKeys.add(key);
          vscode.window.showWarningMessage(
            `AI-Quota: ${account.display_name || account.email} quota at ${remaining.toFixed(0)}%`,
            "Switch Account",
            "Dismiss"
          ).then((action) => {
            if (action === "Switch Account") {
              vscode.commands.executeCommand("ai-quota.switchAccount");
            }
          });
        }
      }
    }
  } catch {
    // silent — notification is best-effort
  }
}

const _notifiedKeys = new Set<string>();
