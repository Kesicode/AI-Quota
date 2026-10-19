/**
 * AI-Quota — VS Code Extension Commands
 * Registers all 11 commands and wires them to agent client + UI providers.
 */

import * as vscode from "vscode";
import type { AgentClient, AccountData, MatrixData } from "./agent_client";
import type { QuotaStatusBar } from "./status_bar";
import type { QuotaSidebarProvider } from "./sidebar/quota_sidebar_provider";

interface CommandContext {
  statusBar: QuotaStatusBar | null;
  accountsProvider: { refresh(): void };
  providersProvider: { refresh(): void };
  quotaSidebarProvider: QuotaSidebarProvider;
}

export function registerAllCommands(
  context: vscode.ExtensionContext,
  client: AgentClient,
  ctx: CommandContext
): void {
  const reg = (id: string, fn: () => Promise<void> | void) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  // ── Open Dashboard ────────────────────────────────────────────────────────
  reg("ai-quota.openDashboard", () => {
    vscode.env.openExternal(vscode.Uri.parse(client.getDashboardUrl()));
  });

  // ── Switch Account ────────────────────────────────────────────────────────
  reg("ai-quota.switchAccount", async () => {
    let accounts: AccountData[];
    try {
      accounts = await client.getAccounts();
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline — cannot switch account.");
      return;
    }

    if (!accounts.length) {
      vscode.window.showInformationMessage("AI-Quota: No accounts registered.");
      return;
    }

    // Sort: live accounts first, then by remaining quota
    const sorted = [...accounts].sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return (b.best_remaining ?? 0) - (a.best_remaining ?? 0);
    });

    const items = sorted.map((acc) => ({
      label: acc.label || acc.display_name || acc.email,
      description: `${acc.provider} · ${acc.best_remaining?.toFixed(0) ?? "?"}% remaining`,
      detail: `Status: ${acc.status} | Client: ${acc.client}`,
      accountId: acc.id,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: "AI-Quota: Switch Account",
      placeHolder: "Select account to switch to…",
      matchOnDescription: true,
    });

    if (!selected) return;

    const confirmed = await vscode.window.showWarningMessage(
      `Switch to "${selected.label}"?`,
      { modal: true },
      "Switch"
    );
    if (confirmed !== "Switch") return;

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "AI-Quota: Switching account…", cancellable: false },
      async () => {
        try {
          const result = await client.switchAccount(selected.accountId);
          if (result.status === "success" && result.verified) {
            // Signal official extension UI panels to refresh immediately without window reload
            try {
              const allCmds = await vscode.commands.getCommands(true);
              if (allCmds.includes("antigravity.handleAuthRefresh")) {
                await vscode.commands.executeCommand("antigravity.handleAuthRefresh");
              }
            } catch {
              // best effort
            }
            vscode.window.showInformationMessage(
              `✓ Switched to ${selected.label} (verified via ${result.method_used})`
            );
          } else if (result.status === "verification_failed") {
            vscode.window.showWarningMessage(
              `⚠ Switch attempted but not verified — active account may differ. Reason: ${result.reason}`
            );
          } else {
            vscode.window.showErrorMessage(`✗ Switch failed: ${result.reason}`);
          }
        } catch (err: unknown) {
          vscode.window.showErrorMessage(`AI-Quota: Switch error — ${String(err)}`);
        }
        ctx.statusBar?.refresh();
        ctx.accountsProvider.refresh();
        ctx.quotaSidebarProvider.refresh();
      }
    );
  });

  // ── Save Current Account ──────────────────────────────────────────────────
  reg("ai-quota.saveCurrentAccount", async () => {
    const email = await vscode.window.showInputBox({
      prompt: "Enter the email address for this account",
      placeHolder: "user@example.com",
    });
    if (!email) return;
    const label = await vscode.window.showInputBox({
      prompt: "Label for this account (optional)",
      placeHolder: "Work / Personal / Project X…",
    });
    try {
      await client.addAccount({
        email,
        provider: "Antigravity",
        client: "Antigravity",
        display_name: label || email,
        label: label || "",
      });
      vscode.window.showInformationMessage(`AI-Quota: Account "${email}" saved.`);
      ctx.accountsProvider.refresh();
      ctx.quotaSidebarProvider.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`AI-Quota: Failed to save account — ${String(err)}`);
    }
  });

  // ── Refresh ───────────────────────────────────────────────────────────────
  reg("ai-quota.refresh", async () => {
    try {
      await client.sync();
      ctx.statusBar?.refresh();
      ctx.accountsProvider.refresh();
      ctx.providersProvider.refresh();
      ctx.quotaSidebarProvider.refresh();
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline — cannot refresh.");
    }
  });

  // ── Show Status ───────────────────────────────────────────────────────────
  reg("ai-quota.showStatus", async () => {
    try {
      const accounts = await client.getAccounts();
      const lines = accounts.map((a) =>
        `${a.label || a.display_name || a.email}: ${a.best_remaining?.toFixed(0) ?? "?"}% (${a.status})`
      );
      vscode.window.showInformationMessage(
        lines.length ? lines.join("\n") : "No accounts registered.",
        { modal: false }
      );
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline.");
    }
  });

  // ── Diagnostics ───────────────────────────────────────────────────────────
  reg("ai-quota.showDiagnostics", async () => {
    try {
      const diag = await client.getDiagnostics();
      const panel = vscode.window.createWebviewPanel(
        "ai-quota.diagnostics",
        "AI-Quota Diagnostics",
        vscode.ViewColumn.One,
        { enableScripts: false }
      );
      panel.webview.html = `<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Diagnostics</h2>
        <pre>${JSON.stringify(diag, null, 2)}</pre>
      </body></html>`;
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline — cannot fetch diagnostics.");
    }
  });

  // ── Sign In ───────────────────────────────────────────────────────────────
  reg("ai-quota.signIn", async () => {
    vscode.env.openExternal(vscode.Uri.parse(`${client.getDashboardUrl()}`));
    vscode.window.showInformationMessage("AI-Quota: Complete sign-in in the dashboard, then refresh.");
  });

  // ── Sign Out ──────────────────────────────────────────────────────────────
  reg("ai-quota.signOut", async () => {
    vscode.window.showWarningMessage(
      "AI-Quota: Sign-out removes the account from the local registry.\nYour provider account is unaffected.",
      "Continue",
      "Cancel"
    ).then((action) => {
      if (action === "Continue") {
        vscode.commands.executeCommand("ai-quota.openDashboard");
      }
    });
  });

  // ── Re-authenticate ───────────────────────────────────────────────────────
  reg("ai-quota.reAuth", async () => {
    vscode.env.openExternal(vscode.Uri.parse(client.getDashboardUrl()));
    vscode.window.showInformationMessage("AI-Quota: Re-authenticate via the dashboard.");
  });

  // ── Quota Matrix ──────────────────────────────────────────────────────────
  reg("ai-quota.showQuotaMatrix", async () => {
    let matrix: MatrixData;
    try {
      matrix = await client.getMatrix();
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline — cannot load matrix.");
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "ai-quota.matrix",
      "AI-Quota — Quota Matrix",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = _buildMatrixHtml(matrix);

    // Allow webview to request a refresh
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "refresh") {
        try {
          const fresh = await client.getMatrix();
          panel.webview.postMessage({ type: "matrix", data: fresh });
        } catch {
          panel.webview.postMessage({ type: "error" });
        }
      }
    });
  });

  // ── Add Account ───────────────────────────────────────────────────────────
  reg("ai-quota.addAccount", async () => {
    vscode.env.openExternal(vscode.Uri.parse(client.getDashboardUrl()));
    vscode.window.showInformationMessage("AI-Quota: Add accounts via the dashboard.");
  });

  // ── Focus View ─────────────────────────────────────────────────────────────
  reg("ai-quota.focusView", async () => {
    try {
      await vscode.commands.executeCommand("ai-quota.quotaView.focus");
    } catch {
      // fallback to focus sidebar container
      await vscode.commands.executeCommand("workbench.view.extension.ai-quota-sidebar");
    }
  });

  // ── Status Bar Menu ────────────────────────────────────────────────────────
  reg("ai-quota.statusBarMenu", async () => {
    await vscode.commands.executeCommand("ai-quota.switchAccount");
  });

  // ── Export Accounts ────────────────────────────────────────────────────────
  reg("ai-quota.exportAccounts", async () => {
    try {
      const data = await client.exportAccounts();
      const uri = await vscode.window.showSaveDialog({
        filters: { "JSON Files": ["json"] },
        defaultUri: vscode.Uri.file("ai-quota-accounts-backup.json"),
        saveLabel: "Export Accounts",
      });
      if (!uri) return;
      const content = Buffer.from(JSON.stringify(data, null, 2), "utf8");
      await vscode.workspace.fs.writeFile(uri, content);
      vscode.window.showInformationMessage(`AI-Quota: Successfully exported ${data.total} accounts to ${uri.fsPath}`);
    } catch (err) {
      vscode.window.showErrorMessage(`AI-Quota: Failed to export accounts — ${String(err)}`);
    }
  });

  // ── Import Accounts ────────────────────────────────────────────────────────
  reg("ai-quota.importAccounts", async () => {
    try {
      const uris = await vscode.window.showOpenDialog({
        filters: { "JSON Files": ["json"] },
        canSelectMany: false,
        openLabel: "Import Accounts",
      });
      if (!uris || !uris.length) return;
      const fileBytes = await vscode.workspace.fs.readFile(uris[0]);
      const json = JSON.parse(Buffer.from(fileBytes).toString("utf8"));
      const accounts = Array.isArray(json) ? json : (json.accounts || []);
      if (!accounts.length) {
        vscode.window.showWarningMessage("AI-Quota: No accounts found in selected file.");
        return;
      }
      const res = await client.importAccounts(accounts);
      vscode.window.showInformationMessage(
        `AI-Quota: Imported ${res.total} accounts (${res.added} added, ${res.updated} updated).`
      );
      ctx.accountsProvider.refresh();
      ctx.quotaSidebarProvider.refresh();
      ctx.statusBar?.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`AI-Quota: Failed to import accounts — ${String(err)}`);
    }
  });

  // ── Export Analytics ───────────────────────────────────────────────────────
  reg("ai-quota.exportAnalytics", async () => {
    const period = await vscode.window.showQuickPick(
      [
        { label: "7d", description: "Past 7 days (Recommended)" },
        { label: "24h", description: "Past 24 hours" },
        { label: "30d", description: "Past 30 days" },
      ],
      { title: "AI-Quota: Select Analytics Period" }
    );
    if (!period) return;

    const format = await vscode.window.showQuickPick(
      [
        { label: "json", description: "JSON format (full structure)" },
        { label: "csv", description: "CSV format (table / spreadsheet)" },
      ],
      { title: "AI-Quota: Select Export Format" }
    );
    if (!format) return;

    try {
      const uri = await vscode.window.showSaveDialog({
        filters: format.label === "csv" ? { "CSV Files": ["csv"] } : { "JSON Files": ["json"] },
        defaultUri: vscode.Uri.file(`ai-quota-analytics-${period.label}.${format.label}`),
        saveLabel: "Export Analytics",
      });
      if (!uri) return;

      const contentStr = await client.exportAnalytics(period.label, format.label);
      const content = Buffer.from(contentStr, "utf8");
      await vscode.workspace.fs.writeFile(uri, content);
      vscode.window.showInformationMessage(`AI-Quota: Analytics exported to ${uri.fsPath}`);
    } catch (err) {
      vscode.window.showErrorMessage(`AI-Quota: Export error — ${String(err)}`);
    }
  });

  // ── Restart Backend Process ────────────────────────────────────────────────
  reg("ai-quota.restartBackend", async () => {
    const confirmed = await vscode.window.showWarningMessage(
      "Restart local Antigravity Language Server / backend process? Active completions will briefly pause.",
      { modal: true },
      "Restart Process"
    );
    if (confirmed !== "Restart Process") return;

    try {
      const res = await client.restartBackend();
      vscode.window.showInformationMessage(
        res.terminated
          ? "AI-Quota: Antigravity language server process terminated and reloading."
          : "AI-Quota: Restart signal processed (no active server process needed termination)."
      );
      ctx.statusBar?.refresh();
      ctx.quotaSidebarProvider.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`AI-Quota: Restart failed — ${String(err)}`);
    }
  });

  // ── Clear Token Vault ──────────────────────────────────────────────────────
  reg("ai-quota.clearTokenVault", async () => {
    const confirmed = await vscode.window.showWarningMessage(
      "Clear stored encrypted tokens from the local OS Token Vault? You will need to re-authenticate accounts.",
      { modal: true },
      "Purge Vault"
    );
    if (confirmed !== "Purge Vault") return;

    try {
      const res = await client.purgeVault();
      vscode.window.showInformationMessage(`AI-Quota: Token vault cleared (${res.purged} credentials removed).`);
      ctx.accountsProvider.refresh();
      ctx.quotaSidebarProvider.refresh();
      ctx.statusBar?.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`AI-Quota: Purge failed — ${String(err)}`);
    }
  });

  // ── QuickPick Quota View ────────────────────────────────────────────────────
  reg("ai-quota.showQuotaQuickPick", async () => {
    let accounts: AccountData[];
    try {
      accounts = await client.getAccounts();
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline — cannot show quota.");
      return;
    }

    if (!accounts.length) {
      vscode.window.showInformationMessage("AI-Quota: No accounts registered.");
      return;
    }

    const qp = vscode.window.createQuickPick();
    qp.title = "AI-Quota — Quota Overview";
    qp.placeholder = "Select account to switch to, or press Escape to close";
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;

    function buildItems(accs: AccountData[]) {
      const items: vscode.QuickPickItem[] = [];
      const sorted = [...accs].sort((a, b) => {
        if (a.status === "live" && b.status !== "live") return -1;
        if (b.status === "live" && a.status !== "live") return 1;
        return (b.best_remaining ?? 0) - (a.best_remaining ?? 0);
      });

      for (const acc of sorted) {
        const isActive = acc.status === "live";
        const name = acc.label || acc.display_name || acc.email || `Account ${acc.id}`;
        const rem = acc.best_remaining;
        const remStr = rem != null ? `${rem.toFixed(0)}%` : "?%";

        // Bar visualization (10 chars)
        const barLen = 12;
        const filled = rem != null ? Math.round((rem / 100) * barLen) : 0;
        const bar = "█".repeat(filled) + "░".repeat(barLen - filled);

        const statusIcon = isActive ? "$(check)" :
          (acc.status === "stale" ? "$(warning)" : "$(circle-outline)");

        // Per-model rows from snapshots
        const snapshots = acc.snapshots || [];

        items.push({
          label: `${statusIcon} ${name}`,
          description: `${bar}  ${remStr}  •  ${acc.provider}`,
          detail: isActive ? "  ✦ Currently active account" :
            (acc.email && acc.email !== name ? `  ${acc.email}` : undefined),
          alwaysShow: true,
        } as vscode.QuickPickItem & { _accountId?: number; _isAccount?: boolean });

        // Per-model sub-items
        for (const s of snapshots.slice(0, 4)) {
          const pct = s.remaining_percent ?? 0;
          const filledM = Math.round((pct / 100) * 8);
          const barM = "▪".repeat(filledM) + "·".repeat(8 - filledM);
          const wname = s.window_name || s.quota_bucket || "Usage";

          // Countdown
          let cntdn = "";
          if (s.reset_at) {
            const diff = new Date(s.reset_at).getTime() - Date.now();
            if (diff > 0) {
              const h = Math.floor(diff / 3600000);
              const m = Math.floor((diff % 3600000) / 60000);
              cntdn = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }
          }

          const pctIcon = pct <= 10 ? "$(error)" : pct <= 25 ? "$(warning)" : "$(check)";

          items.push({
            label: `    ${pctIcon}  ${wname}`,
            description: `${barM}  ${pct.toFixed(0)}%${cntdn ? "  ↺ " + cntdn : ""}`,
            detail: undefined,
            alwaysShow: true,
          });
        }

        if (!isActive) {
          items.push({
            label: `    $(arrow-right) Switch to "${name}"`,
            description: "",
            alwaysShow: true,
          });
        }

        // Separator
        items.push({ label: "", kind: vscode.QuickPickItemKind.Separator } as vscode.QuickPickItem);
      }

      return items;
    }

    qp.items = buildItems(accounts);

    // Header buttons
    qp.buttons = [
      { iconPath: new vscode.ThemeIcon("refresh"), tooltip: "Refresh quota" },
      { iconPath: new vscode.ThemeIcon("dashboard"), tooltip: "Open Dashboard" },
      { iconPath: new vscode.ThemeIcon("gear"), tooltip: "Settings" },
    ];

    qp.onDidTriggerButton(async (btn) => {
      if ((btn as vscode.QuickInputButton & { tooltip?: string }).tooltip === "Refresh quota") {
        try {
          await client.sync();
          accounts = await client.getAccounts();
          qp.items = buildItems(accounts);
          ctx.quotaSidebarProvider.refresh();
        } catch {
          vscode.window.showErrorMessage("AI-Quota: Refresh failed.");
        }
      } else if ((btn as vscode.QuickInputButton & { tooltip?: string }).tooltip === "Open Dashboard") {
        vscode.env.openExternal(vscode.Uri.parse(client.getDashboardUrl()));
        qp.hide();
      } else if ((btn as vscode.QuickInputButton & { tooltip?: string }).tooltip === "Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "ai-quota");
        qp.hide();
      }
    });

    qp.onDidChangeSelection(async (selected) => {
      if (!selected.length) return;
      const item = selected[0];
      // Check if it's a "Switch to" item
      if (item.label.includes("$(arrow-right) Switch to")) {
        qp.hide();
        // Find account by name in label
        const match = item.label.match(/Switch to "(.+?)"/);
        if (match) {
          const targetName = match[1];
          const target = accounts.find(
            a => (a.label || a.display_name || a.email || `Account ${a.id}`) === targetName
          );
          if (target) {
            await vscode.window.withProgress(
              { location: vscode.ProgressLocation.Notification, title: `AI-Quota: Switching to ${targetName}…`, cancellable: false },
              async () => {
                try {
                  const result = await client.switchAccount(target.id);
                  if (result.status === "success" && result.verified) {
                    vscode.window.showInformationMessage(`✓ Switched to ${targetName}`);
                  } else {
                    vscode.window.showWarningMessage(`⚠ Switch result: ${result.reason}`);
                  }
                  ctx.statusBar?.refresh();
                  ctx.accountsProvider.refresh();
                  ctx.quotaSidebarProvider.refresh();
                } catch (err) {
                  vscode.window.showErrorMessage(`AI-Quota: Switch error — ${String(err)}`);
                }
              }
            );
          }
        }
      }
    });

    qp.onDidHide(() => qp.dispose());
    qp.show();
  });

  // ── Pin Model to Status Bar ────────────────────────────────────────────────
  reg("ai-quota.pinModelToStatusBar", async () => {
    let accounts: AccountData[];
    try {
      accounts = await client.getAccounts();
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline — cannot load models.");
      return;
    }

    // Gather all unique window/model names from snapshots across all accounts
    const modelSet = new Map<string, { pct: number | null; account: string }>();
    for (const acc of accounts) {
      const name = acc.label || acc.display_name || acc.email || `#${acc.id}`;
      for (const snap of acc.snapshots ?? []) {
        const key = snap.window_name || snap.quota_bucket || "Usage";
        if (!modelSet.has(key)) {
          modelSet.set(key, { pct: snap.remaining_percent, account: name });
        }
      }
    }

    if (!modelSet.size) {
      vscode.window.showInformationMessage("AI-Quota: No quota windows found — try refreshing first.");
      return;
    }

    const currentPin = ctx.statusBar?.getPinnedModel() ?? null;

    const items: vscode.QuickPickItem[] = [];

    // Option to unpin if currently pinned
    if (currentPin) {
      items.push({
        label: "$(pinned-dirty) Unpin current model",
        description: `Currently pinned: ${currentPin}`,
        detail: "Remove pin — status bar will revert to overall best account quota",
        alwaysShow: true,
      });
      items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    }

    for (const [modelName, info] of modelSet.entries()) {
      const isPinned = modelName === currentPin;
      const pctStr = info.pct != null ? `${info.pct.toFixed(0)}%` : "?%";
      items.push({
        label: `${isPinned ? "$(pinned) " : "$(pin) "}${modelName}`,
        description: `${pctStr}  ·  ${info.account}`,
        detail: isPinned ? "  ✦ Currently pinned" : undefined,
        alwaysShow: true,
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: "AI-Quota: Pin Model to Status Bar",
      placeHolder: "Select a quota window to pin, or unpin current…",
      matchOnDescription: true,
    });

    if (!picked) return;

    if (picked.label.startsWith("$(pinned-dirty)")) {
      // Unpin
      await ctx.statusBar?.setPinnedModel(null);
      vscode.window.showInformationMessage("AI-Quota: Status bar pin removed.");
    } else {
      // Extract model name (strip icon prefix)
      const modelName = picked.label.replace(/^\$\([^)]+\)\s*/, "").trim();
      await ctx.statusBar?.setPinnedModel(modelName);
      vscode.window.showInformationMessage(`AI-Quota: Pinned "${modelName}" to status bar. 📌`);
    }
  });

  // ── Unpin Status Bar Model ─────────────────────────────────────────────────
  reg("ai-quota.unpinStatusBarModel", async () => {
    const current = ctx.statusBar?.getPinnedModel();
    if (!current) {
      vscode.window.showInformationMessage("AI-Quota: No model is pinned.");
      return;
    }
    await ctx.statusBar?.setPinnedModel(null);
    vscode.window.showInformationMessage(`AI-Quota: Unpinned "${current}" from status bar.`);
  });

  // ── Settings ───────────────────────────────────────────────────────────────
  reg("ai-quota.openSettings", () => {
    vscode.commands.executeCommand("workbench.action.openSettings", "ai-quota");
  });
}

/** Build the full quota matrix HTML for the webview panel. */
function _buildMatrixHtml(matrix: MatrixData): string {
  const nonce = Array.from({ length: 24 }, () =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
      Math.floor(Math.random() * 62)
    ]
  ).join("");

  const windows = matrix.windows;
  const accounts = matrix.accounts;

  // Pre-serialise to JSON for live refresh
  const matrixJson = JSON.stringify(matrix);

  const headerCols = windows.map(w => `<th class="win-th">${w}</th>`).join("");

  const rows = accounts.map(acc => {
    const isBest = acc.best_remaining !== null &&
      acc.best_remaining === Math.max(...accounts.map(a => a.best_remaining ?? -1));
    const dotCls = acc.status === "live" ? "live" : acc.status === "stale" ? "stale" : "off";
    const name = acc.label || acc.display_name || acc.email || `Account ${acc.id}`;

    const cells = windows.map(w => {
      const win = acc.windows[w];
      if (!win || win.remaining_pct === null) return `<td class="win-td"><span class="na">—</span></td>`;
      const p = win.remaining_pct;
      const cls = p >= 60 ? "hi" : p >= 30 ? "mid" : p >= 15 ? "lo" : "cr";
      const col = p >= 60 ? "#4fa84f" : p >= 30 ? "#1a9e5c" : p >= 15 ? "#f0a500" : "#e53935";
      const diff = win.reset_at ? new Date(win.reset_at).getTime() - Date.now() : 0;
      const rst = diff > 0 ? (() => {
        const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
        return h > 0 ? `↺ ${h}h${m}m` : `↺ ${m}m`;
      })() : "";
      return `<td class="win-td">
        <div class="pct ${cls}">${p.toFixed(0)}%</div>
        <div class="bar-t"><div class="bar-f" style="width:${p}%;background:${col}"></div></div>
        ${rst ? `<div class="rst">${rst}</div>` : ""}
      </td>`;
    }).join("");

    return `<tr class="${isBest ? "best" : ""}">
      <td class="name-td">
        <div class="nm" title="${acc.email ?? ""}">${name}</div>
        <div class="tg">${acc.provider} · ${acc.client}</div>
      </td>
      <td><span class="st"><span class="dot ${dotCls}"></span>${acc.status}</span></td>
      ${cells}
    </tr>`;
  }).join("") || `<tr><td colspan="${windows.length + 2}" class="empty">No accounts</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI-Quota Matrix</title>
<style>
  :root { --bg:#090a0d; --surf:#0f1115; --fg:#e8eaed; --mu:#9aa0a6; --ac:#1a9e5c; --bd:rgba(255,255,255,.07); --r:6px; }
  *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--fg); font-family:system-ui,'Inter',sans-serif; font-size:12px; padding:20px; }
  h1 { font-size:15px; font-weight:700; color:var(--ac); margin-bottom:4px; }
  .sub { font-size:11px; color:var(--mu); margin-bottom:16px; }

  /* Summary */
  .summary { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
  .stat { background:var(--surf); border:1px solid var(--bd); border-radius:var(--r); padding:8px 12px; }
  .sv { font-size:18px; font-weight:700; font-family:monospace; color:var(--ac); }
  .sl { font-size:10px; color:var(--mu); margin-top:2px; }

  /* Toolbar */
  .toolbar { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
  .chip { padding:3px 10px; border-radius:20px; border:1px solid var(--bd); background:rgba(255,255,255,.03); color:var(--mu); cursor:pointer; font-size:11px; font-weight:500; }
  .chip.active { background:var(--ac); border-color:var(--ac); color:#fff; }
  .refresh-btn { margin-left:auto; padding:4px 12px; background:rgba(26,158,92,.15); border:1px solid var(--ac); border-radius:var(--r); color:var(--ac); font-size:11px; cursor:pointer; }
  .refresh-btn:hover { background:rgba(26,158,92,.25); }

  /* Table */
  .wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; min-width:400px; }
  th { background:rgba(26,158,92,.07); border:1px solid var(--bd); padding:6px 10px; text-align:left; font-size:10px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--mu); white-space:nowrap; }
  td { border:1px solid var(--bd); padding:6px 10px; vertical-align:middle; }
  tr:hover td { background:rgba(255,255,255,.02); }
  tr.best td { background:rgba(26,158,92,.04); }
  tr.best td:first-child { border-left:2px solid var(--ac); }

  /* Name cell */
  .nm { font-weight:500; white-space:nowrap; max-width:160px; overflow:hidden; text-overflow:ellipsis; }
  .tg { font-size:10px; color:var(--mu); font-family:monospace; }

  /* Status */
  .st { display:inline-flex; align-items:center; gap:4px; font-size:10px; }
  .dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .dot.live  { background:#4fa84f; box-shadow:0 0 4px #4fa84f; }
  .dot.stale { background:#f0a500; }
  .dot.off   { background:rgba(255,255,255,.2); }

  /* Window cells */
  .win-th,.win-td { text-align:center; min-width:78px; }
  .pct { font-family:monospace; font-size:12px; font-weight:600; }
  .pct.hi { color:#4fa84f; } .pct.mid { color:var(--ac); }
  .pct.lo  { color:#f0a500; } .pct.cr  { color:#e53935; }
  .na { color:rgba(255,255,255,.2); }
  .bar-t { width:100%; height:3px; background:rgba(255,255,255,.06); border-radius:2px; margin:3px 0; }
  .bar-f { height:3px; border-radius:2px; }
  .rst { font-size:10px; color:var(--mu); }
  .empty { text-align:center; color:var(--mu); padding:24px; }
  .name-td { min-width:150px; }
</style>
</head>
<body>
<h1>AI-Quota — Quota Matrix</h1>
<p class="sub">All accounts × all quota windows. Provider truth preserved — quotas are never mixed across providers.</p>

<div class="summary" id="summary"></div>
<div class="toolbar" id="toolbar">
  <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
</div>
<div class="wrap">
  <table id="matrixTable">
    <thead><tr><th>Account</th><th>Status</th>${headerCols}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let _data = ${matrixJson};
  let _filter = '';

  function fmtRst(iso) {
    if (!iso) return '';
    const d = new Date(iso).getTime() - Date.now();
    if (d <= 0) return '↺ soon';
    const h = Math.floor(d/3600000), m = Math.floor((d%3600000)/60000);
    return h > 0 ? \`↺ \${h}h\${m}m\` : \`↺ \${m}m\`;
  }

  function render(data, filter) {
    const wins = data.windows;
    let accs = filter ? data.accounts.filter(a => a.provider === filter) : data.accounts;
    const bestVal = Math.max(...accs.map(a => a.best_remaining ?? -1));

    // Summary
    const live = accs.filter(a => a.status === 'live').length;
    const avgArr = accs.filter(a => a.best_remaining !== null);
    const avg = avgArr.length ? (avgArr.reduce((s,a) => s + a.best_remaining, 0) / avgArr.length).toFixed(0) : '—';
    const top = accs.find(a => a.best_remaining === bestVal);
    document.getElementById('summary').innerHTML = \`
      <div class="stat"><div class="sv">\${accs.length}</div><div class="sl">Accounts</div></div>
      <div class="stat"><div class="sv" style="color:#4fa84f">\${live}</div><div class="sl">Live</div></div>
      <div class="stat"><div class="sv">\${avg}%</div><div class="sl">Avg quota</div></div>
      <div class="stat"><div class="sv" style="font-size:13px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${top ? (top.label || top.display_name) : '—'}</div><div class="sl">Top account</div></div>\`;

    // Provider chips
    const tb = document.getElementById('toolbar');
    tb.querySelectorAll('.chip').forEach(c => c.remove());
    const refBtn = document.getElementById('refreshBtn');
    ['', ...data.providers].forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (filter === p ? ' active' : '');
      btn.textContent = p || 'All';
      btn.onclick = () => { _filter = p; render(_data, p); };
      tb.insertBefore(btn, refBtn);
    });

    // Table
    const hdr = wins.map(w => \`<th class="win-th">\${w}</th>\`).join('');
    const body = accs.map(acc => {
      const isBest = acc.best_remaining !== null && acc.best_remaining === bestVal && bestVal >= 0;
      const dc = acc.status === 'live' ? 'live' : acc.status === 'stale' ? 'stale' : 'off';
      const nm = acc.label || acc.display_name || acc.email || \`Account \${acc.id}\`;
      const cells = wins.map(w => {
        const win = acc.windows[w];
        if (!win || win.remaining_pct === null) return '<td class="win-td"><span class="na">—</span></td>';
        const p = win.remaining_pct;
        const cls = p >= 60 ? 'hi' : p >= 30 ? 'mid' : p >= 15 ? 'lo' : 'cr';
        const col = p >= 60 ? '#4fa84f' : p >= 30 ? '#1a9e5c' : p >= 15 ? '#f0a500' : '#e53935';
        const rst = fmtRst(win.reset_at);
        return \`<td class="win-td">
          <div class="pct \${cls}">\${p.toFixed(0)}%</div>
          <div class="bar-t"><div class="bar-f" style="width:\${p}%;background:\${col}"></div></div>
          \${rst ? '<div class="rst">'+rst+'</div>' : ''}
        </td>\`;
      }).join('');
      return \`<tr class="\${isBest ? 'best' : ''}">
        <td class="name-td"><div class="nm" title="\${acc.email ?? ''}">\${nm}</div><div class="tg">\${acc.provider} · \${acc.client}</div></td>
        <td><span class="st"><span class="dot \${dc}"></span>\${acc.status}</span></td>
        \${cells}
      </tr>\`;
    }).join('') || \`<tr><td colspan="\${wins.length + 2}" class="empty">No accounts</td></tr>\`;

    document.getElementById('matrixTable').innerHTML =
      \`<thead><tr><th>Account</th><th>Status</th>\${hdr}</tr></thead><tbody>\${body}</tbody>\`;
  }

  document.getElementById('refreshBtn').onclick = () => vscode.postMessage({ command: 'refresh' });

  window.addEventListener('message', e => {
    if (e.data.type === 'matrix') { _data = e.data.data; render(_data, _filter); }
    if (e.data.type === 'error') { document.getElementById('summary').innerHTML = '<p style="color:#e53935">Agent offline</p>'; }
  });

  // Initial render
  render(_data, _filter);
</script>
</body>
</html>`;
}
