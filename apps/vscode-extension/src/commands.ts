/**
 * AI-Quota — VS Code Extension Commands
 * Registers all 11 commands and wires them to agent client + UI providers.
 */

import * as vscode from "vscode";
import type { AgentClient, AccountData } from "./agent_client";
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
    try {
      const accounts = await client.getAccounts();
      const panel = vscode.window.createWebviewPanel(
        "ai-quota.matrix",
        "AI-Quota — Account Matrix",
        vscode.ViewColumn.One,
        { enableScripts: false }
      );
      const rows = accounts.map((a) => {
        const snaps = a.snapshots.map((s) =>
          `<td>${s.window_name}</td><td>${s.remaining_percent?.toFixed(0) ?? "?"}%</td><td>${s.reset_at ?? "—"}</td>`
        ).join("");
        return `<tr><td>${a.label || a.display_name || a.email}</td><td>${a.provider}</td><td>${a.status}</td>${snaps}</tr>`;
      }).join("");
      panel.webview.html = `<!DOCTYPE html><html><body style="font-family:system-ui;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Matrix</h2>
        <table border="1" style="border-collapse:collapse;width:100%;font-size:12px">
          <tr style="background:#1a9e5c22"><th>Account</th><th>Provider</th><th>Status</th><th colspan="3">Quota Windows</th></tr>
          ${rows || "<tr><td colspan='6'>No accounts</td></tr>"}
        </table>
      </body></html>`;
    } catch {
      vscode.window.showErrorMessage("AI-Quota: Agent offline.");
    }
  });

  // ── Add Account ───────────────────────────────────────────────────────────
  reg("ai-quota.addAccount", async () => {
    vscode.env.openExternal(vscode.Uri.parse(client.getDashboardUrl()));
    vscode.window.showInformationMessage("AI-Quota: Add accounts via the dashboard.");
  });
}
