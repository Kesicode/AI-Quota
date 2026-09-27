/**
 * AI-Quota Status Bar Item
 *
 * Shows: "AI-Quota 84% · 1h42m" — click opens quick account switcher.
 * Color coding:
 *   - Green  (> 50%): normal
 *   - Yellow (20–50%): warning
 *   - Red    (< 20%): critical
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
    this.item.command = "ai-quota.switchAccount";
    this.item.tooltip = "AI-Quota — click to switch account";
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
      const label = best.label || best.display_name || best.email;

      const icon = remaining > 50 ? "$(pulse)" : remaining > 20 ? "$(warning)" : "$(error)";
      this.item.text = `${icon} ${remaining.toFixed(0)}%${resetText ? ` · ${resetText}` : ""}`;
      this.item.tooltip = `AI-Quota: ${label} — ${remaining.toFixed(1)}% remaining\n${resetText ? `Resets in: ${resetText}` : ""}`;

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
    this.item.tooltip = "AI-Quota agent offline — start with: python -m app.main";
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
    // Find the earliest reset time across all snapshots
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
