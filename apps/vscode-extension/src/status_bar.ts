/**
 * AI-Quota Status Bar Item — v3
 *
 * Features:
 *   - Pin a specific model window to always show in status bar
 *     (stored in globalState "ai-quota.pinnedModel")
 *   - Format string from config ai-quota.statusBarFormat
 *   - Click: opens QuickPick quota view (Alt+Q)
 *   - Tooltip: all accounts summary + pinned model indicator
 *   - Color coding: green > 50 %, yellow 20–50 %, red < 20 %
 */

import * as vscode from "vscode";
import type { AgentClient, AccountData, SnapshotData } from "./agent_client";

export class QuotaStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private client: AgentClient;
  private context: vscode.ExtensionContext;
  private _disposed = false;

  constructor(client: AgentClient, context: vscode.ExtensionContext) {
    this.client = client;
    this.context = context;
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "ai-quota.showQuotaQuickPick";
    this.item.tooltip = "AI-Quota — click for quota overview (Alt+Q)";
    context.subscriptions.push(this.item);
  }

  show(): void {
    this.item.text = "$(sync~spin) AI-Quota";
    this.item.show();
  }

  /** Return the currently pinned model name, or null. */
  getPinnedModel(): string | null {
    return this.context.globalState.get<string>("ai-quota.pinnedModel", "") || null;
  }

  /** Pin a model window name to the status bar. Pass null/empty to unpin. */
  async setPinnedModel(modelName: string | null): Promise<void> {
    await this.context.globalState.update(
      "ai-quota.pinnedModel",
      modelName || ""
    );
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this._disposed) return;
    try {
      const accounts = await this.client.getAccounts();
      const active = accounts.find((a) => a.status === "live") ?? accounts[0];

      if (!active) {
        this.item.text = "$(account) AI-Quota";
        this.item.tooltip = "AI-Quota — no accounts registered";
        this.item.backgroundColor = undefined;
        return;
      }

      const pinnedModel = this.getPinnedModel();
      const config = vscode.workspace.getConfiguration("ai-quota");
      const fmt = config.get<string>(
        "statusBarFormat",
        "$(pulse) AI-Quota {percent}% · {reset}"
      );

      // ── Determine the value to show ─────────────────────────────────────────
      let remaining: number;
      let resetText: string;
      let pinnedSnap: SnapshotData | null = null;

      if (pinnedModel) {
        // Find pinned model snapshot across ALL accounts (prefer active)
        const allAccounts = [active, ...accounts.filter((a) => a !== active)];
        for (const acc of allAccounts) {
          const snap = (acc.snapshots ?? []).find(
            (s) =>
              s.window_name === pinnedModel ||
              s.quota_bucket === pinnedModel
          );
          if (snap) {
            pinnedSnap = snap;
            break;
          }
        }
        remaining = pinnedSnap?.remaining_percent ?? active.best_remaining ?? 0;
        resetText = pinnedSnap?.reset_at ? this._fmtReset(pinnedSnap.reset_at) : this._nextReset(active);
      } else {
        remaining = active.best_remaining ?? 0;
        resetText = this._nextReset(active);
      }

      const label = active.label || active.display_name || active.email || "Account";
      const icon =
        remaining > 50 ? "$(pulse)" : remaining > 25 ? "$(warning)" : "$(error)";

      // Build the pin prefix if pinned
      const pinPrefix = pinnedSnap ? `📌 ${_shortModelName(pinnedModel!)} ` : "";

      let text = fmt
        .replace("{percent}", remaining.toFixed(0))
        .replace("{reset}", resetText || "—")
        .replace("{account}", label.slice(0, 12))
        .replace("{provider}", active.provider || "")
        .replace("$(pulse)", icon);

      // Prepend pin prefix when a model is pinned
      if (pinnedSnap) {
        // Replace the default icon with the pin prefix + icon
        text = `${icon} ${pinPrefix}${remaining.toFixed(0)}%${resetText ? ` · ${resetText}` : ""}`;
      }

      this.item.text = text;

      // ── Rich tooltip ────────────────────────────────────────────────────────
      const tooltipLines: string[] = [];

      if (pinnedSnap) {
        tooltipLines.push(
          `📌 Pinned: ${pinnedModel}`,
          `Remaining: ${remaining.toFixed(1)}%${resetText ? ` | Resets in: ${resetText}` : ""}`,
          ""
        );
      }

      tooltipLines.push(
        `AI-Quota — Active: ${label}`,
        `Overall: ${(active.best_remaining ?? 0).toFixed(1)}%`,
        "",
        "All accounts:"
      );
      for (const acc of accounts.slice(0, 6)) {
        const r = acc.best_remaining;
        const n = acc.label || acc.display_name || acc.email || `#${acc.id}`;
        const isLive = acc.status === "live";
        tooltipLines.push(
          `  ${isLive ? "●" : "○"} ${n}: ${r != null ? r.toFixed(0) + "%" : "?"}`
        );
      }
      if (accounts.length > 6) {
        tooltipLines.push(`  … and ${accounts.length - 6} more`);
      }
      tooltipLines.push(
        "",
        pinnedModel
          ? `📌 Pinned: ${pinnedModel} — run "AI-Quota: Unpin Model" to clear`
          : "Alt+Q = Quick View | Alt+A = Switch | Pin a model via command palette"
      );

      this.item.tooltip = tooltipLines.join("\n");

      // ── Color coding ────────────────────────────────────────────────────────
      if (remaining <= 10) {
        this.item.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.errorBackground"
        );
      } else if (remaining <= 20) {
        this.item.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground"
        );
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
    this.item.tooltip =
      "AI-Quota agent offline\nStart with: python -m app.main\nAlt+Q = Quick Quota View";
    this.item.backgroundColor = undefined;
  }

  dispose(): void {
    this._disposed = true;
    this.item.dispose();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _nextReset(account: AccountData): string {
    const resets = account.snapshots
      .map((s) => s.reset_at)
      .filter((r): r is string => !!r)
      .map((r) => new Date(r).getTime())
      .filter((t) => !isNaN(t) && t > Date.now());
    if (!resets.length) return "";
    const diff = Math.max(0, Math.min(...resets) - Date.now());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  }

  private _fmtReset(iso: string): string {
    const diff = Math.max(0, new Date(iso).getTime() - Date.now());
    if (!diff) return "";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  }
}

/** Shorten a model window name for the compact status bar */
function _shortModelName(name: string): string {
  // e.g. "gemini-pro-daily" → "gemini-pro" (max 14 chars)
  return name.length > 14 ? name.slice(0, 12) + "…" : name;
}
