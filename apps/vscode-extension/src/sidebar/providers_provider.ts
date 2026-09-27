/**
 * AI-Quota — Providers TreeDataProvider
 * Shows all provider adapters and their detection/health status.
 */

import * as vscode from "vscode";
import type { AgentClient, ProviderData } from "../agent_client";

class ProviderItem extends vscode.TreeItem {
  constructor(public readonly provider: ProviderData) {
    super(provider.display_name, vscode.TreeItemCollapsibleState.Collapsed);
    const detected = provider.detected;
    this.description = detected ? "● detected" : "○ not running";
    this.tooltip = [
      `ID: ${provider.id}`,
      `Detected: ${detected ? "Yes" : "No"}`,
      provider.hub_url ? `Hub: ${provider.hub_url}` : "",
      `Switching: ${provider.capabilities?.switching ? provider.capabilities.switch_method : "not supported"}`,
      `Truth: ${provider.truth?.authority_type ?? "unknown"}`,
    ].filter(Boolean).join("\n");
    this.iconPath = detected
      ? new vscode.ThemeIcon("plug", new vscode.ThemeColor("charts.green"))
      : new vscode.ThemeIcon("plug");
    this.contextValue = "provider";
  }
}

class CapabilityItem extends vscode.TreeItem {
  constructor(label: string, value: string | boolean) {
    const display = typeof value === "boolean" ? (value ? "✓" : "✗") : value;
    super(`${label}: ${display}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      typeof value === "boolean" ? (value ? "check" : "close") : "info"
    );
    this.contextValue = "capability";
  }
}

export class ProvidersProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _providers: ProviderData[] = [];

  constructor(private client: AgentClient) {}

  refresh(): void {
    this._load().then(() => this._onDidChangeTreeData.fire());
  }

  private async _load(): Promise<void> {
    try {
      this._providers = await this.client.getProviders();
    } catch {
      this._providers = [];
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      if (!this._providers.length) await this._load();
      // Detected providers first
      return [...this._providers].sort((a, b) => Number(b.detected) - Number(a.detected))
        .map((p) => new ProviderItem(p));
    }
    if (element instanceof ProviderItem) {
      const p = element.provider;
      const caps = p.capabilities ?? {};
      return [
        new CapabilityItem("Quota", caps.quota ?? false),
        new CapabilityItem("Detection", caps.detection ?? false),
        new CapabilityItem("Switching", caps.switching ?? false),
        new CapabilityItem("Instant Switch", caps.instant_switch ?? false),
        new CapabilityItem("Method", caps.switch_method ?? "n/a"),
        new CapabilityItem("Hub URL", p.hub_url ?? "—"),
        new CapabilityItem("Authority", p.truth?.authority_type ?? "unknown"),
      ];
    }
    return [];
  }
}
