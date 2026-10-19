/**
 * AI-Quota Status Bar Item — v2
 *
 * Inspired by vscode-antigravity-cockpit's 6-format status bar:
 *   - Default: "$(pulse) 84% · 1h42m"
 *   - Respects ai-quota.statusBarFormat config string
 *   - Click: opens QuickPick quota view (Alt+Q)
 *   - Tooltip: shows all accounts summary
 * Color coding:
 *   - Green (>50%): normal
 *   - Yellow (20-50%): warning
 *   - Red (<20%): critical
 */

import * as vscode from "vscode";
import type { AgentClient, AccountData } from "./agent_client";

export class QuotaStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private client: AgentClient;
  private _disposed = false;

  constructor(client: AgentClient, context: vscode.ExtensionContext) {
    this.client = client;
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    // Use QuickPick view for instant quota overview
    this.item.command = "ai-quota.showQuotaQuickPick";
    this.item.tooltip = "AI-Quota — click for quota overview (Alt+Q)";
    context.subscriptions.push(this.item);
  }

  show(): void {
    this.item.text = "$(sync~spin) AI-Quota";
    this.item.show();
  }

  async refresh(): Promise<void> {
    if (this._disposed) return;
    try {
      const accounts = await this.client.getAccounts();
      const best = this._bestAccount(accounts);
      if (!best) {
        this.item.text = "$(account) AI-Quota";
        this.item.tooltip = "AI-Quota — no accounts registered";
        this.item.backgroundColor = undefined;
        return;
      }

      const remaining = best.best_remaining ?? 0;
      const resetText = this._nextReset(best);
      const label = best.label || best.display_name || best.email || "Account";

      // Format string from config
      const config = vscode.workspace.getConfiguration("ai-quota");
      const fmt = config.get<string>("statusBarFormat", "$(pulse) AI-Quota {percent}% · {reset}");

      const icon = remaining > 50 ? "$(pulse)" : remaining > 25 ? "$(warning)" : "$(error)";

      let text = fmt
        .replace("{percent}", remaining.toFixed(0))
        .replace("{reset}", resetText || "—")
        .replace("{account}", label.slice(0, 12))
        .replace("{provider}", best.provider || "")
        .replace("$(pulse)", icon);

      // If format still has the default pulse icon placeholder, replace it
      if (!fmt.includes("{percent}") && !fmt.includes("$(pulse)")) {
        text = `${icon} ${remaining.toFixed(0)}%${resetText ? ` · ${resetText}` : ""}`;
      }

      this.item.text = text;

      // Rich tooltip: all accounts summary
      const lines: string[] = [
        `AI-Quota — Active: ${label}`,
        `Remaining: ${remaining.toFixed(1)}%${resetText ? ` | Reset in: ${resetText}` : ""}`,
        "",
        "All accounts:",
      ];
      for (const acc of accounts.slice(0, 5)) {
        const r = acc.best_remaining;
        const n = acc.label || acc.display_name || acc.email || `#${acc.id}`;
        const isLive = acc.status === "live";
        lines.push(`  ${isLive ? "●" : "○"} ${n}: ${r != null ? r.toFixed(0) + "%" : "?"}`);
      }
      if (accounts.length > 5) {
        lines.push(`  … and ${accounts.length - 5} more`);
      }
      lines.push("", "Alt+Q = Quick Quota View | Alt+A = Switch Account");
      this.item.tooltip = lines.join("\n");

      // Color coding
      if (remaining <= 10) {
        this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      } else if (remaining <= 20) {
        this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      } else {
        this.item.backgroundColor = undefined;
      }
    } catch {
      this.setOffline();
    }
  }

  setOffline(): void {
    if (this._disposed) return;
    this.item.text = "$(circle-slash) AI-Quota";
    this.item.tooltip = "AI-Quota agent offline\nStart with: python -m app.main\nAlt+Q = Quick Quota View";
    this.item.backgroundColor = undefined;
  }

  dispose(): void {
    this._disposed = true;
    this.item.dispose();
  }

  private _bestAccount(accounts: AccountData[]): AccountData | null {
    const live = accounts.filter(
      (a) => a.status === "live" && a.best_remaining !== null && a.best_remaining !== undefined
    );
    if (!live.length) return accounts[0] ?? null;
    return live.reduce((best, a) =>
      (a.best_remaining ?? 0) > (best.best_remaining ?? 0) ? a : best
    );
  }

  private _nextReset(account: AccountData): string {
    const resets = account.snapshots
      .map((s) => s.reset_at)
      .filter((r): r is string => !!r)
      .map((r) => new Date(r).getTime())
      .filter((t) => !isNaN(t) && t > Date.now());

    if (!resets.length) return "";
    const nearest = Math.min(...resets);
    const diff = Math.max(0, nearest - Date.now());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  }
}
