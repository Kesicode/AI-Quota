/**
 * AI-Quota — Accounts TreeDataProvider
 * Shows saved accounts in the IDE sidebar tree view with quota info.
 */

import * as vscode from "vscode";
import type { AgentClient, AccountData } from "../agent_client";

class AccountItem extends vscode.TreeItem {
  constructor(
    public readonly account: AccountData,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    const label = account.label || account.display_name || account.email;
    super(label, collapsibleState);
    const pct = account.best_remaining;
    this.description = pct !== null && pct !== undefined
      ? `${pct.toFixed(0)}% · ${account.status}`
      : account.status;
    this.tooltip = [
      `Email: ${account.email}`,
      `Provider: ${account.provider}`,
      `Client: ${account.client}`,
      pct !== null && pct !== undefined ? `Quota: ${pct.toFixed(1)}%` : "",
    ].filter(Boolean).join("\n");
    this.iconPath = this._icon(account.status, pct);
    this.contextValue = "account";
    this.command = {
      command: "ai-quota.switchAccount",
      title: "Switch",
      arguments: [],
    };
  }

  private _icon(
    status: string,
    pct: number | null | undefined
  ): vscode.ThemeIcon {
    if (status === "live") {
      if (pct !== null && pct !== undefined && pct <= 10) return new vscode.ThemeIcon("error");
      if (pct !== null && pct !== undefined && pct <= 20) return new vscode.ThemeIcon("warning");
      return new vscode.ThemeIcon("circle-filled");
    }
    if (status === "stale") return new vscode.ThemeIcon("clock");
    return new vscode.ThemeIcon("circle-outline");
  }
}

class SnapshotItem extends vscode.TreeItem {
  constructor(snap: { window_name: string; remaining_percent: number | null; reset_at: string | null }) {
    const pct = snap.remaining_percent?.toFixed(0) ?? "?";
    super(`${snap.window_name}: ${pct}%`, vscode.TreeItemCollapsibleState.None);
    this.description = snap.reset_at
      ? `Resets ${new Date(snap.reset_at).toLocaleTimeString()}`
      : "";
    this.iconPath = new vscode.ThemeIcon("graph");
    this.contextValue = "snapshot";
  }
}

export class AccountsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _accounts: AccountData[] = [];

  constructor(private client: AgentClient) {}

  refresh(): void {
    this._load().then(() => this._onDidChangeTreeData.fire());
  }

  private async _load(): Promise<void> {
    try {
      this._accounts = await this.client.getAccounts();
    } catch {
      this._accounts = [];
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      if (!this._accounts.length) {
        await this._load();
      }
      return this._accounts.map(
        (a) => new AccountItem(a, a.snapshots?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)
      );
    }
    // Children of an account: its snapshots
    if (element instanceof AccountItem) {
      return element.account.snapshots.map((s) => new SnapshotItem(s));
    }
    return [];
  }
}
