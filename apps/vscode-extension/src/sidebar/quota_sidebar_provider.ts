/**
 * AI-Quota — Quota Sidebar WebviewView Provider
 *
 * COMPLETE REWRITE — v3.1 (Polished)
 * Merges best features from all 5 community repos:
 *   - Antigravity Account Switcher (design baseline, dark green accent #1a9e5c)
 *   - AntigravityQuotaWatcher (wusimpl) — weekly limit detection, real-time monitoring
 *   - vscode-antigravity-cockpit (jlcodes99) — model grouping, privacy mode, trend indicators,
 *       auto-refresh countdown, notification threshold display
 *   - AntigravityQuota (Henrik-3) — per-model progress bars, reset countdowns, pinned models
 *   - AntigravityManager (Draculabo) — connected tools status, account management, auto-switch
 *
 * New in v3.1:
 *   - Interactive 📌 Pin Model directly on model cards to bind to Status Bar
 *   - ⚡ Auto-Switch Toggle Pill in footer (shows ON/OFF status, clickable)
 *   - 📋 Copy Quota Summary button in usage header
 *   - 📤 Export Accounts shortcut button in Saved Accounts header
 *   - Polished gradient progress fills, micro-interactions, subtle elevations
 */

import * as vscode from "vscode";
import type {
  AgentClient,
  AccountData,
  PredictionItem,
  PredictionsData,
} from "../agent_client";

export class QuotaSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _client: AgentClient;
  private _context: vscode.ExtensionContext;
  private _privacyMode = false;
  private _lastRefresh: Date | null = null;

  constructor(context: vscode.ExtensionContext, client: AgentClient) {
    this._context = context;
    this._client = client;
    this._privacyMode = context.globalState.get<boolean>("ai-quota.privacyMode", false);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, "media"),
        vscode.Uri.joinPath(this._context.extensionUri, "dist"),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case "switch":
          await vscode.commands.executeCommand("ai-quota.switchAccount");
          break;

        case "switchTo":
          if (msg.accountId) {
            try {
              await this._client.switchAccount(Number(msg.accountId));
              await this.refresh();
              vscode.window.showInformationMessage("AI-Quota: Account switched.");
            } catch (e: unknown) {
              vscode.window.showErrorMessage(
                `Switch failed: ${e instanceof Error ? e.message : String(e)}`
              );
            }
          }
          break;

        case "refresh":
          await this.refresh();
          break;

        case "openDashboard":
          await vscode.commands.executeCommand("ai-quota.openDashboard");
          break;

        case "showMatrix":
          await vscode.commands.executeCommand("ai-quota.showQuotaMatrix");
          break;

        case "showQuickPick":
          await vscode.commands.executeCommand("ai-quota.showQuotaQuickPick");
          break;

        case "reAuth":
          await vscode.commands.executeCommand("ai-quota.reAuth");
          break;

        case "signOut":
          await vscode.commands.executeCommand("ai-quota.signOut");
          break;

        case "openSettings":
          await vscode.commands.executeCommand("ai-quota.openSettings");
          break;

        case "exportAccounts":
          await vscode.commands.executeCommand("ai-quota.exportAccounts");
          break;

        case "togglePrivacy":
          this._privacyMode = !this._privacyMode;
          this._context.globalState.update("ai-quota.privacyMode", this._privacyMode);
          await this.refresh();
          break;

        case "pinModel": {
          if (msg.modelName) {
            await this._context.globalState.update("ai-quota.pinnedModel", msg.modelName);
            vscode.window.showInformationMessage(`AI-Quota: Pinned "${msg.modelName}" to status bar. 📌`);
            await vscode.commands.executeCommand("ai-quota.refresh");
          }
          break;
        }

        case "unpinModel": {
          await this._context.globalState.update("ai-quota.pinnedModel", "");
          vscode.window.showInformationMessage("AI-Quota: Unpinned model from status bar.");
          await vscode.commands.executeCommand("ai-quota.refresh");
          break;
        }

        case "toggleAutoSwitch": {
          const config = vscode.workspace.getConfiguration("ai-quota");
          const cur = config.get<boolean>("autoSwitch", false);
          await config.update("autoSwitch", !cur, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`AI-Quota: Auto-switch is now ${!cur ? "ON ⚡" : "OFF"}.`);
          await this.refresh();
          break;
        }

        case "copyQuota": {
          if (msg.text) {
            await vscode.env.clipboard.writeText(msg.text);
            vscode.window.showInformationMessage("AI-Quota: Quota summary copied to clipboard.");
          }
          break;
        }

        case "deleteAccount": {
          const { accountId, accountName } = msg;
          if (!accountId) break;
          const confirmed = await vscode.window.showWarningMessage(
            `Remove "${accountName || `Account ${accountId}`}" from AI-Quota?`,
            { modal: true },
            "Remove"
          );
          if (confirmed !== "Remove") break;
          try {
            await this._client.deleteAccount(Number(accountId));
            await this.refresh();
            vscode.window.showInformationMessage("AI-Quota: Account removed.");
          } catch (e: unknown) {
            vscode.window.showErrorMessage(
              `Delete failed: ${e instanceof Error ? e.message : String(e)}`
            );
          }
          break;
        }

        case "saveLabel": {
          const { accountId, label, notes, color } = msg;
          if (accountId) {
            try {
              await this._client.updateAccountLabel(Number(accountId), {
                label: label || undefined,
                notes: notes || undefined,
                color: color || undefined,
              });
              await this.refresh();
            } catch {
              // silent
            }
          }
          break;
        }

        case "refreshAccount": {
          if (msg.accountId) {
            try {
              await this._client.refreshAccount(Number(msg.accountId));
              await this.refresh();
            } catch {
              // silent
            }
          }
          break;
        }
      }
    });

    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._view) return;
    this._lastRefresh = new Date();
    try {
      const [accounts, predictions] = await Promise.all([
        this._client.getAccounts(),
        this._client.getPredictions("24h").catch(() => null),
      ]);

      const predMap = new Map<number, PredictionItem>();
      if (predictions) {
        for (const p of predictions.predictions) {
          predMap.set(p.account_id, p);
        }
      }
      const enriched = accounts.map((a) => ({
        ...a,
        prediction: predMap.get(a.id) ?? null,
      }));

      const config = vscode.workspace.getConfiguration("ai-quota");
      const threshold = config.get<number>("notificationThreshold", 20);
      const pollInterval = config.get<number>("pollInterval", 30);
      const autoSwitch = config.get<boolean>("autoSwitch", false);
      const pinnedModel = this._context.globalState.get<string>("ai-quota.pinnedModel", "");

      this._view!.webview.postMessage({
        type: "accounts",
        data: enriched,
        recommendation: predictions
          ? { id: predictions.best_account_id, reason: predictions.reason }
          : null,
        privacyMode: this._privacyMode,
        threshold,
        pollInterval,
        autoSwitch,
        pinnedModel,
        lastRefresh: this._lastRefresh?.toISOString() ?? null,
      });
    } catch {
      this._view!.webview.postMessage({ type: "error", message: "Agent offline" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HTML
  // ─────────────────────────────────────────────────────────────────────────

  private _getHtml(webview: vscode.Webview): string {
    const nonce = _nonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI-Quota</title>
  <style>
    :root {
      --bg:        var(--vscode-sideBar-background, #1e1e1e);
      --surface:   var(--vscode-editor-background, #252526);
      --surface2:  rgba(255,255,255,0.045);
      --border:    rgba(255,255,255,0.08);
      --fg:        var(--vscode-foreground, #cccccc);
      --muted:     var(--vscode-descriptionForeground, #7f7f7f);
      --accent:    #1a9e5c;
      --accent-bg: rgba(26,158,92,0.14);
      --accent-bd: rgba(26,158,92,0.38);
      --warn:      #e5a000;
      --warn-bg:   rgba(229,160,0,0.14);
      --error:     #e53935;
      --blue:      #4da3ff;
      --blue-bg:   rgba(77,163,255,0.14);
      --purple:    #a78bfa;
      --purple-bg: rgba(167,139,250,0.16);
      --r:         6px;
      --r-sm:      4px;
      --font:      var(--vscode-font-family, 'Segoe UI', system-ui, -apple-system, sans-serif);
      --mono:      var(--vscode-editor-font-family, 'Cascadia Code', 'Consolas', monospace);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: 12px;
      line-height: 1.5;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    }

    /* ── Scrollable body ── */
    #scroll-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0 0 10px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.12) transparent;
    }
    #scroll-body::-webkit-scrollbar { width: 4px; }
    #scroll-body::-webkit-scrollbar-track { background: transparent; }
    #scroll-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

    /* ── Top header bar ── */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px 7px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      gap: 6px;
      background: rgba(0,0,0,0.08);
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 500;
      flex: 1;
      min-width: 0;
    }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--muted);
      flex-shrink: 0;
      transition: all .2s;
    }
    .status-dot.online  { background: var(--accent); box-shadow: 0 0 7px var(--accent); }
    .status-dot.offline { background: rgba(255,255,255,0.25); }
    .status-label { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
    .status-label strong { color: var(--fg); font-weight: 600; }

    .top-actions { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .btn-icon {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 13px; line-height: 1;
      padding: 4px 5px; border-radius: var(--r-sm);
      transition: background .15s, color .15s, transform .1s;
      display: flex; align-items: center; justify-content: center;
    }
    .btn-icon:hover { background: var(--surface2); color: var(--fg); }
    .btn-icon:active { transform: scale(0.95); }
    .btn-icon.active { color: var(--accent); background: var(--accent-bg); }
    .btn-icon[title] { cursor: pointer; }

    .btn-matrix {
      display: flex; align-items: center; gap: 4px;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--muted);
      font-size: 10px; font-weight: 600; padding: 3px 7px;
      cursor: pointer; transition: all .15s;
      white-space: nowrap;
    }
    .btn-matrix:hover { background: rgba(255,255,255,0.08); color: var(--fg); border-color: rgba(255,255,255,0.15); }

    /* Refresh countdown */
    .refresh-info {
      font-size: 9px; color: var(--muted); text-align: right;
      padding: 3px 10px 0; font-family: var(--mono);
      opacity: 0.8;
    }

    /* ── Section label ── */
    .section-label {
      font-size: 10px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: var(--muted);
      padding: 10px 12px 4px;
    }

    /* ── Current Account ── */
    .current-account {
      margin: 0 10px 4px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r);
      padding: 11px 12px;
      transition: border-color .15s;
    }
    .current-account:hover {
      border-color: rgba(255,255,255,0.12);
    }
    .acct-row { display: flex; align-items: flex-start; gap: 10px; }
    .avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: linear-gradient(135deg, #1a9e5c, #0e6b3e);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700; color: #fff;
      flex-shrink: 0; text-transform: uppercase;
      border: 2px solid rgba(26,158,92,0.45);
      box-shadow: 0 0 10px rgba(26,158,92,0.3);
    }
    .acct-info { flex: 1; min-width: 0; }
    .acct-name {
      font-size: 13px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-bottom: 1px;
    }
    .acct-email {
      font-size: 10px; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-bottom: 5px;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
    .badge {
      font-size: 9px; font-weight: 600; letter-spacing: .03em;
      padding: 2px 6px; border-radius: 3px;
      display: flex; align-items: center; gap: 3px;
    }
    .badge-plan   { background: rgba(255,193,7,0.15); color: #f5c842; border: 1px solid rgba(245,200,66,0.3); }
    .badge-instant { background: var(--blue-bg); color: var(--blue); border: 1px solid rgba(77,163,255,0.3); }
    .badge-connected { background: var(--accent-bg); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
    .badge-offline { background: rgba(229,57,53,0.12); color: #ef9a9a; border: 1px solid rgba(229,57,53,0.3); }
    .badge-weekly { background: var(--warn-bg); color: var(--warn); border: 1px solid rgba(229,160,0,0.3); }
    .badge-rec    { background: var(--purple-bg); color: var(--purple); border: 1px solid rgba(167,139,250,0.3); }
    .acct-btns { display: flex; gap: 6px; }
    .btn-reauth {
      padding: 4px 10px; font-size: 10px; font-weight: 500;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg);
      cursor: pointer; transition: all .15s;
    }
    .btn-reauth:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
    .btn-signout {
      padding: 4px 10px; font-size: 10px; font-weight: 500;
      background: none; border: 1px solid rgba(229,57,53,0.35);
      border-radius: var(--r-sm); color: #ef9a9a;
      cursor: pointer; transition: all .15s;
    }
    .btn-signout:hover { background: rgba(229,57,53,0.12); border-color: rgba(229,57,53,0.5); }
    .edit-acct-btn {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 12px; padding: 2px 4px;
      border-radius: var(--r-sm); flex-shrink: 0;
      transition: color .15s;
    }
    .edit-acct-btn:hover { color: var(--fg); }

    /* Prediction bar */
    .prediction-bar {
      margin-top: 6px; padding: 6px 8px;
      background: rgba(0,0,0,0.22); border-radius: var(--r-sm);
      border: 1px solid var(--border);
    }
    .pred-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
    .pred-label { font-size: 9px; color: var(--muted); }
    .pred-value { font-size: 9px; font-weight: 600; font-family: var(--mono); }
    .pred-value.good { color: var(--accent); }
    .pred-value.warn { color: var(--warn); }
    .pred-value.crit { color: var(--error); }

    /* ── Usage section ── */
    .usage-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px 4px;
    }
    .usage-label { font-size: 11px; font-weight: 600; }
    .usage-controls { display: flex; align-items: center; gap: 6px; }
    .usage-time { font-size: 9px; color: var(--muted); }
    .btn-text-action {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 10px; padding: 2px 4px;
      border-radius: var(--r-sm); transition: color .15s;
    }
    .btn-text-action:hover { color: var(--fg); }

    /* Model list */
    .model-list { padding: 0 10px 4px; display: flex; flex-direction: column; gap: 5px; }
    .model-card {
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r); padding: 8px 10px;
      transition: transform .15s, border-color .15s;
    }
    .model-card:hover {
      border-color: rgba(255,255,255,0.12);
      transform: translateY(-1px);
    }
    .model-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .model-name { font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 5px; min-width: 0; }
    .model-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .trend-icon { font-size: 11px; }
    .trend-consuming { color: var(--error); }
    .trend-recovering { color: var(--accent); }
    .trend-stable     { color: var(--muted); }
    .trend-exhausted  { color: var(--error); }
    .model-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .model-pct {
      font-size: 13px; font-weight: 700; font-family: var(--mono);
    }
    .model-pct.good { color: var(--accent); }
    .model-pct.warn { color: var(--warn); }
    .model-pct.crit { color: var(--error); }
    .model-countdown { font-size: 9px; color: var(--muted); font-family: var(--mono); }
    
    /* Pin button on model card */
    .btn-pin {
      background: none; border: none; cursor: pointer;
      font-size: 11px; padding: 1px 4px; border-radius: var(--r-sm);
      opacity: 0.45; transition: all .15s ease;
      display: inline-flex; align-items: center; justify-content: center;
      line-height: 1;
    }
    .btn-pin:hover { opacity: 1; background: rgba(255,255,255,0.08); }
    .btn-pin.pinned {
      opacity: 1;
      background: rgba(167,139,250,0.18);
      border: 1px solid rgba(167,139,250,0.4);
      color: #a78bfa;
    }

    .model-bar-track {
      height: 4px; background: rgba(255,255,255,0.08);
      border-radius: 2px; overflow: hidden; margin-bottom: 4px;
    }
    .model-bar-fill { height: 100%; border-radius: 2px; transition: width .4s ease; }
    .model-bar-fill.good { background: linear-gradient(90deg, #1a9e5c 0%, #2bd980 100%); }
    .model-bar-fill.warn { background: linear-gradient(90deg, #d98200 0%, #ffb300 100%); }
    .model-bar-fill.crit { background: linear-gradient(90deg, #d32f2f 0%, #ff5252 100%); }
    .model-details { display: flex; align-items: center; justify-content: space-between; }
    .model-window { font-size: 9px; color: var(--muted); }
    .model-reset  { font-size: 9px; color: var(--muted); font-family: var(--mono); }
    .model-bucket { font-size: 9px; color: rgba(255,255,255,0.28); }
    .weekly-tag {
      font-size: 8px; font-weight: 600; padding: 1px 4px;
      border-radius: 2px; background: var(--warn-bg); color: var(--warn);
      border: 1px solid rgba(229,160,0,0.3); flex-shrink: 0;
    }

    /* Privacy overlay */
    .blurred { filter: blur(5px); user-select: none; pointer-events: none; }

    /* ── Saved accounts section ── */
    .saved-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 12px 6px; cursor: pointer; user-select: none;
      transition: background .15s;
    }
    .saved-header:hover { background: var(--surface2); }
    .saved-header-left { display: flex; align-items: center; gap: 6px; }
    .saved-chevron { font-size: 10px; color: var(--muted); transition: transform .2s; }
    .saved-chevron.open   { transform: rotate(0deg); }
    .saved-chevron.closed { transform: rotate(-90deg); }
    .saved-label { font-size: 11px; font-weight: 600; }
    .saved-count {
      font-size: 10px; background: var(--surface2); border: 1px solid var(--border);
      border-radius: 3px; padding: 0 5px; color: var(--muted);
    }
    .saved-header-right { display: flex; align-items: center; gap: 4px; }
    .btn-header-action {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 13px; line-height: 1;
      width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
      border-radius: var(--r-sm); transition: background .15s, color .15s;
    }
    .btn-header-action:hover { background: var(--surface2); color: var(--fg); }

    .saved-body { padding: 0 10px; }
    .search-row { display: flex; gap: 6px; margin-bottom: 8px; }
    .search-wrap {
      flex: 1; position: relative;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r-sm); display: flex; align-items: center;
    }
    .search-wrap:focus-within { border-color: rgba(255,255,255,0.2); }
    .search-icon { padding: 0 6px; color: var(--muted); font-size: 11px; }
    .search-input {
      flex: 1; background: none; border: none; outline: none;
      color: var(--fg); font-size: 11px; padding: 4px 0;
      font-family: var(--font);
    }
    .search-input::placeholder { color: var(--muted); }
    .search-clear {
      background: none; border: none; cursor: pointer;
      color: var(--muted); padding: 0 6px; font-size: 12px;
      line-height: 1; display: none;
    }
    .search-clear.visible { display: block; }

    .sort-btn {
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--muted); font-size: 10px;
      padding: 4px 8px; cursor: pointer; white-space: nowrap;
      display: flex; align-items: center; gap: 3px;
      transition: background .15s, color .15s;
    }
    .sort-btn:hover { background: rgba(255,255,255,0.08); color: var(--fg); }

    /* ── Account card ── */
    .acct-card {
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r); margin-bottom: 6px;
      border-left: 3px solid transparent;
      transition: border-color .15s, background .15s, transform .15s;
    }
    .acct-card.active { border-left-color: var(--accent); }
    .acct-card.recommended { border-left-color: var(--purple); }
    .acct-card:hover {
      background: rgba(255,255,255,0.06);
      transform: translateY(-1px);
    }

    .acct-card-head { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px 6px; }
    .card-avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: linear-gradient(135deg, #444, #262626);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #fff;
      flex-shrink: 0; text-transform: uppercase; position: relative;
    }
    .card-avatar.active-acc {
      background: linear-gradient(135deg, #1a9e5c, #0e6b3e);
      border: 1px solid rgba(26,158,92,0.4);
    }
    .card-avatar.active-acc::after {
      content: ''; position: absolute; bottom: -1px; right: -1px;
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--accent); border: 2px solid var(--bg);
    }
    .card-acct-info { flex: 1; min-width: 0; }
    .card-acct-name {
      font-size: 11px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .card-acct-email { font-size: 10px; color: var(--muted); margin-bottom: 3px; }
    .card-badges { display: flex; flex-wrap: wrap; gap: 3px; }
    .card-badge {
      font-size: 9px; font-weight: 600; padding: 1px 5px;
      border-radius: 3px; display: flex; align-items: center; gap: 2px;
    }
    .active-tag  { background: var(--accent-bg); color: #4ade80; border: 1px solid var(--accent-bd); }
    .plan-tag    { background: rgba(255,193,7,0.12); color: #f5c842; border: 1px solid rgba(245,200,66,0.25); }
    .instant-tag { background: var(--blue-bg); color: var(--blue); border: 1px solid rgba(77,163,255,0.25); }
    .rec-tag     { background: var(--purple-bg); color: var(--purple); border: 1px solid rgba(167,139,250,0.25); }
    .stale-tag   { background: var(--warn-bg); color: var(--warn); border: 1px solid rgba(229,160,0,0.3); }

    .card-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .card-btn {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 12px; padding: 3px 4px;
      border-radius: var(--r-sm); transition: background .15s, color .15s;
    }
    .card-btn:hover { background: var(--surface2); color: var(--fg); }
    .card-btn.delete:hover { color: var(--error); }
    .card-btn.refresh-acc:hover { color: var(--accent); }

    /* Card model mini-grid */
    .card-models {
      display: flex; flex-direction: column; gap: 3px;
      padding: 0 10px 8px;
    }
    .card-model-row {
      display: flex; align-items: center; gap: 6px;
    }
    .cm-name   { font-size: 9px; color: var(--muted); width: 70px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cm-bar    { flex: 1; height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; }
    .cm-fill   { height: 100%; border-radius: 2px; }
    .cm-fill.good { background: linear-gradient(90deg, #1a9e5c, #2bd980); }
    .cm-fill.warn { background: linear-gradient(90deg, #d98200, #ffb300); }
    .cm-fill.crit { background: linear-gradient(90deg, #d32f2f, #ff5252); }
    .cm-pct    { font-size: 9px; font-weight: 700; font-family: var(--mono); width: 30px; text-align: right; flex-shrink: 0; }
    .cm-pct.good { color: var(--accent); }
    .cm-pct.warn { color: var(--warn); }
    .cm-pct.crit { color: var(--error); }
    .cm-rst    { font-size: 8px; color: var(--muted); width: 44px; text-align: right; font-family: var(--mono); flex-shrink: 0; }

    /* Switch button */
    .btn-switch-to {
      display: block; width: calc(100% - 20px); margin: 0 10px 8px;
      padding: 5px; background: var(--accent); color: #fff;
      border: none; border-radius: var(--r-sm); font-size: 10px;
      font-weight: 600; cursor: pointer; letter-spacing: .04em;
      transition: opacity .15s, transform .1s;
    }
    .btn-switch-to:hover { opacity: .88; }
    .btn-switch-to:active { transform: scale(0.98); }

    /* Label editor */
    .label-editor {
      margin: 0 10px 8px; padding: 6px 8px;
      background: rgba(255,255,255,0.03); border: 1px solid var(--border);
      border-radius: var(--r-sm); display: none;
    }
    .label-editor.open { display: block; }
    .label-editor input, .label-editor select {
      width: 100%; background: rgba(255,255,255,0.05);
      border: 1px solid var(--border); border-radius: 3px;
      color: var(--fg); font-size: 10px; padding: 3px 6px;
      margin-bottom: 4px; outline: none; font-family: var(--font);
    }
    .label-editor input:focus, .label-editor select:focus { border-color: var(--accent); }
    .le-actions { display: flex; gap: 4px; }
    .le-save {
      flex: 1; padding: 3px; background: var(--accent);
      border: none; border-radius: 3px; color: #fff;
      font-size: 10px; cursor: pointer;
    }
    .le-cancel {
      flex: 1; padding: 3px; background: var(--surface2);
      border: 1px solid var(--border); border-radius: 3px;
      color: var(--muted); font-size: 10px; cursor: pointer;
    }

    /* Empty states */
    .empty { text-align: center; color: var(--muted); padding: 20px 8px; font-size: 11px; }
    .offline-banner {
      margin: 8px 10px;
      background: rgba(229,57,53,.10); border: 1px solid rgba(229,57,53,.25);
      border-radius: var(--r); padding: 10px 12px;
      font-size: 11px; color: #ef9a9a;
    }
    .offline-banner code {
      display: inline-block; margin-top: 4px;
      background: rgba(0,0,0,.3); padding: 2px 6px;
      border-radius: 3px; font-size: 10px; font-family: var(--mono);
    }
    .offline-banner .btn-restart {
      display: inline-block; margin-top: 8px; padding: 4px 12px;
      background: rgba(26,158,92,0.2); border: 1px solid var(--accent-bd);
      border-radius: var(--r-sm); color: #4ade80;
      font-size: 10px; cursor: pointer;
    }

    /* ── Footer ── */
    .footer {
      flex-shrink: 0; padding: 7px 10px;
      border-top: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      gap: 6px;
      background: rgba(0,0,0,0.06);
    }
    .footer-left  { display: flex; align-items: center; gap: 5px; }
    .footer-credit { font-size: 10px; color: var(--muted); }
    .footer-credit a { color: var(--blue); text-decoration: none; }
    .footer-credit a:hover { text-decoration: underline; }
    .footer-version { font-size: 10px; color: var(--muted); font-family: var(--mono); }
    .pill-btn {
      font-size: 9px; font-weight: 600; padding: 2px 6px;
      border-radius: 3px; background: var(--surface2);
      border: 1px solid var(--border); color: var(--muted);
      cursor: pointer; transition: all .15s; white-space: nowrap;
    }
    .pill-btn:hover { border-color: rgba(255,255,255,0.2); color: var(--fg); }
    .pill-btn.active {
      background: var(--accent-bg);
      border-color: var(--accent-bd);
      color: #4ade80;
    }

    /* Animations */
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    .pulsing { animation: pulse 2s infinite; }
    @keyframes fadeIn { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
    .fade-in { animation: fadeIn .2s ease; }
  </style>
</head>
<body>

  <!-- ── Top bar ── -->
  <div class="top-bar">
    <div class="status-pill">
      <span class="status-dot offline pulsing" id="statusDot"></span>
      <span class="status-label">AI-Quota: <strong id="statusText">Connecting…</strong></span>
    </div>
    <div class="top-actions">
      <button class="btn-icon" id="privacyBtn" title="Toggle privacy mode">👁</button>
      <button class="btn-icon" id="refreshBtn" title="Refresh quota">↻</button>
      <button class="btn-icon" id="quickPickBtn" title="QuickPick quota view (Alt+Q)">⌨</button>
      <button class="btn-matrix" id="matrixBtn">⊞ Matrix</button>
    </div>
  </div>
  <div class="refresh-info" id="refreshInfo"></div>

  <!-- ── Scrollable body ── -->
  <div id="scroll-body">

    <!-- Current account -->
    <div class="section-label">Current account</div>
    <div id="currentAccount"></div>

    <!-- Usage: per-model -->
    <div class="usage-header">
      <span class="usage-label">Model Quotas</span>
      <div class="usage-controls">
        <button class="btn-text-action" id="copyQuotaBtn" title="Copy quota summary to clipboard">📋 Copy</button>
        <span class="usage-time" id="usageTime"></span>
      </div>
    </div>
    <div class="model-list" id="modelList">
      <div class="model-card">
        <div class="empty" style="padding:8px 0;font-size:10px">No data</div>
      </div>
    </div>

    <!-- Saved accounts -->
    <div class="saved-header" id="savedToggle">
      <div class="saved-header-left">
        <span class="saved-chevron open" id="savedChevron">∨</span>
        <span class="saved-label">Saved accounts</span>
        <span class="saved-count" id="savedCount">0</span>
      </div>
      <div class="saved-header-right">
        <button class="btn-header-action" id="exportBtn" title="Export accounts backup (JSON)">📤</button>
        <button class="btn-header-action" id="addBtn" title="Add / Switch account">+</button>
      </div>
    </div>

    <div id="savedBody" class="saved-body">
      <div class="search-row">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input class="search-input" type="text" id="searchInput" placeholder="Search accounts">
          <button class="search-clear" id="searchClear">✕</button>
        </div>
        <button class="sort-btn" id="sortBtn">Recently used ⌄</button>
      </div>
      <div id="accountsList"></div>
    </div>

    <!-- Offline fallback -->
    <div id="offlineBanner" style="display:none"></div>

  </div><!-- /#scroll-body -->

  <!-- ── Footer ── -->
  <div class="footer">
    <div class="footer-left">
      <span class="footer-credit">Developed by <a href="https://github.com/Kesicode/AI-Quota" target="_blank">Kesicode</a></span>
      <button class="pill-btn" id="thresholdPill" title="Open settings to change low quota alert threshold">⚠ 20%</button>
      <button class="pill-btn" id="autoSwitchPill" title="Toggle automatic switching on low quota">⚡ Auto: OFF</button>
    </div>
    <span class="footer-version" id="footerVersion">v2.0.4</span>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let _accounts = [];
    let _recommendation = null;
    let _savedOpen = true;
    let _sortMode = 'recent';
    let _searchQ = '';
    let _privacy = false;
    let _threshold = 20;
    let _pollInterval = 30;
    let _autoSwitch = false;
    let _pinnedModel = '';
    let _lastRefresh = null;
    let _countdownTimer = null;

    // ── Buttons ────────────────────────────────────────────────────────────
    document.getElementById('refreshBtn').onclick    = () => vscode.postMessage({ command: 'refresh' });
    document.getElementById('matrixBtn').onclick     = () => vscode.postMessage({ command: 'showMatrix' });
    document.getElementById('quickPickBtn').onclick  = () => vscode.postMessage({ command: 'showQuickPick' });
    document.getElementById('addBtn').onclick        = (e) => { e.stopPropagation(); vscode.postMessage({ command: 'switch' }); };
    document.getElementById('exportBtn').onclick     = (e) => { e.stopPropagation(); vscode.postMessage({ command: 'exportAccounts' }); };
    document.getElementById('privacyBtn').onclick    = () => vscode.postMessage({ command: 'togglePrivacy' });
    document.getElementById('thresholdPill').onclick = () => vscode.postMessage({ command: 'openSettings' });
    document.getElementById('autoSwitchPill').onclick= () => vscode.postMessage({ command: 'toggleAutoSwitch' });

    document.getElementById('copyQuotaBtn').onclick = () => {
      const active = _accounts.find(a => a.status === 'live') || _accounts[0];
      if (!active) return;
      const name = active.label || active.display_name || active.email || 'Account';
      let text = 'AI-Quota Status: [' + name + ' - ' + active.provider + ']\n';
      text += 'Overall: ' + (active.best_remaining != null ? active.best_remaining.toFixed(0) + '%' : 'N/A') + '\n';
      for (const s of (active.snapshots || [])) {
        const wn = s.window_name || s.quota_bucket || 'Usage';
        const pct = s.remaining_percent != null ? s.remaining_percent.toFixed(0) + '%' : '?';
        const rst = s.reset_at ? fmtReset(s.reset_at) : '';
        text += '  • ' + wn + ': ' + pct + (rst ? ' (' + rst + ')' : '') + '\n';
      }
      vscode.postMessage({ command: 'copyQuota', text });
    };

    document.getElementById('savedToggle').onclick = (e) => {
      if (e.target.closest('#addBtn') || e.target.closest('#exportBtn')) return;
      _savedOpen = !_savedOpen;
      document.getElementById('savedBody').style.display = _savedOpen ? '' : 'none';
      const ch = document.getElementById('savedChevron');
      ch.className = 'saved-chevron ' + (_savedOpen ? 'open' : 'closed');
      ch.textContent = _savedOpen ? '∨' : '›';
    };

    // Search
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    searchInput.oninput = () => {
      _searchQ = searchInput.value.toLowerCase();
      searchClear.className = 'search-clear' + (_searchQ ? ' visible' : '');
      renderAccounts();
    };
    searchClear.onclick = () => {
      searchInput.value = ''; _searchQ = '';
      searchClear.className = 'search-clear';
      renderAccounts();
    };

    // Sort
    const SORT_LABELS = { recent: 'Recently used', quota: 'Quota %', name: 'Name' };
    const SORT_ORDER  = ['recent','quota','name'];
    document.getElementById('sortBtn').onclick = () => {
      const idx = SORT_ORDER.indexOf(_sortMode);
      _sortMode = SORT_ORDER[(idx + 1) % SORT_ORDER.length];
      document.getElementById('sortBtn').textContent = SORT_LABELS[_sortMode] + ' ⌄';
      renderAccounts();
    };

    // ── Formatters ─────────────────────────────────────────────────────────
    function fmtCountdown(iso) {
      if (!iso) return '';
      const diff = new Date(iso).getTime() - Date.now();
      if (diff <= 0) return 'Reset!';
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    }
    function fmtReset(iso) {
      if (!iso) return '';
      const diff = new Date(iso).getTime() - Date.now();
      if (diff <= 0) return 'Resets soon';
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return 'in ' + (h > 0 ? h + 'h ' + m + 'm' : m + 'm');
    }
    function pctClass(pct) {
      if (pct == null) return 'good';
      if (pct <= 10) return 'crit';
      if (pct <= 25) return 'warn';
      return 'good';
    }
    function initials(name) {
      if (!name) return '?';
      const parts = name.trim().split(/\\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0,2).toUpperCase();
    }
    function timeAgo(dateStr) {
      if (!dateStr) return '';
      const diff = Date.now() - new Date(dateStr).getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
      return Math.floor(diff/86400000) + 'd ago';
    }
    function providerLabel(p) {
      const MAP = {
        gemini:'Gemini', google:'Gemini', anthropic:'Claude', claude:'Claude',
        openai:'GPT', gpt:'GPT', copilot:'Copilot', cursor:'Cursor', antigravity:'Antigravity',
      };
      if (!p) return 'Unknown';
      return MAP[p.toLowerCase()] || (p.charAt(0).toUpperCase() + p.slice(1));
    }
    function trendIcon(trend) {
      if (!trend) return '';
      const MAP = {
        consuming:  { icon: '↓', cls: 'trend-consuming' },
        recovering: { icon: '↑', cls: 'trend-recovering' },
        stable:     { icon: '→', cls: 'trend-stable' },
        exhausted:  { icon: '✕', cls: 'trend-exhausted' },
        unknown:    { icon: '', cls: '' },
      };
      const t = MAP[trend] || { icon: '', cls: '' };
      if (!t.icon) return '';
      return '<span class="trend-icon ' + t.cls + '">' + t.icon + '</span>';
    }
    function blurWrap(html, cls) {
      return _privacy ? '<span class="' + cls + ' blurred">' + html + '</span>' : html;
    }
    function pctText(pct) {
      if (pct == null) return '?%';
      return pct.toFixed(0) + '%';
    }
    function isWeeklyLimited(snap) {
      const b = (snap.quota_bucket || '').toLowerCase();
      const w = (snap.window_name || '').toLowerCase();
      return b.includes('week') || w.includes('week');
    }

    // ── Render current account ──────────────────────────────────────────────
    function renderCurrentAccount() {
      const el = document.getElementById('currentAccount');
      const active = _accounts.find(a => a.status === 'live') || _accounts[0];
      if (!active) {
        el.innerHTML = '<div class="empty">No active account</div>';
        return;
      }
      const name   = active.label || active.display_name || active.email || 'Account';
      const email  = active.email || '';
      const prov   = providerLabel(active.provider);
      const isInst = (active.snapshots || []).length > 0;
      const isConn = active.status === 'live';
      const initStr = initials(name);
      const isRec  = _recommendation && _recommendation.id === active.id;
      const pred   = active.prediction;
      const hasWeekly = (active.snapshots || []).some(s => isWeeklyLimited(s) && (s.remaining_percent ?? 100) < 5);

      let predHtml = '';
      if (pred && pred.trend && pred.trend !== 'unknown') {
        const velText = pred.velocity_pph != null
          ? (pred.velocity_pph > 0 ? '-' : '+') + Math.abs(pred.velocity_pph).toFixed(1) + '%/h'
          : '';
        const riskCls = { none:'good', low:'good', medium:'warn', high:'warn', critical:'crit' }[pred.risk_level] || 'good';
        const exhText = pred.hours_until_exhausted != null && pred.hours_until_exhausted > 0
          ? 'Exhausts in ~' + pred.hours_until_exhausted.toFixed(1) + 'h'
          : '';
        predHtml = \`<div class="prediction-bar">
          <div class="pred-row">
            <span class="pred-label">Trend: \${trendIcon(pred.trend)} \${pred.trend}</span>
            <span class="pred-value \${riskCls}">\${velText}</span>
          </div>
          \${exhText ? '<div class="pred-row"><span class="pred-label">' + exhText + '</span><span class="pred-value ' + riskCls + '">' + (pred.warning || '') + '</span></div>' : ''}
        </div>\`;
      }

      el.innerHTML = \`<div class="current-account fade-in">
        <div class="acct-row">
          <div class="avatar">\${initStr}</div>
          <div class="acct-info">
            <div class="acct-name">\${_esc(name)}</div>
            <div class="acct-email">\${_esc(email)}</div>
            <div class="badges">
              <span class="badge badge-plan">⭐ \${_esc(prov)}</span>
              \${isInst   ? '<span class="badge badge-instant">⚡ Instant</span>' : ''}
              \${isConn   ? '<span class="badge badge-connected">● Connected</span>'
                         : '<span class="badge badge-offline">● Offline</span>'}
              \${isRec    ? '<span class="badge badge-rec">★ Best</span>' : ''}
              \${hasWeekly ? '<span class="badge badge-weekly">⚠ Weekly limit</span>' : ''}
            </div>
            \${predHtml}
            <div class="acct-btns" style="margin-top:7px">
              <button class="btn-reauth" id="reauthBtn">Re-auth</button>
              <button class="btn-signout" id="signoutBtn">Sign out</button>
            </div>
          </div>
          <button class="edit-acct-btn" id="editCurrBtn" title="Edit label">✎</button>
        </div>
      </div>\`;

      document.getElementById('reauthBtn').onclick  = () => vscode.postMessage({ command: 'reAuth' });
      document.getElementById('signoutBtn').onclick = () => vscode.postMessage({ command: 'signOut' });
      document.getElementById('editCurrBtn').onclick = () => {
        const le = document.getElementById('le-' + active.id);
        if (le) le.classList.toggle('open');
      };
    }

    // ── Render model quota list ─────────────────────────────────────────────
    function renderModelList() {
      const active = _accounts.find(a => a.status === 'live') || _accounts[0];
      const timeEl = document.getElementById('usageTime');
      const list   = document.getElementById('modelList');

      if (!active || !(active.snapshots || []).length) {
        list.innerHTML = '<div class="model-card"><div class="empty" style="padding:10px 0;font-size:10px">No quota data yet — try refreshing</div></div>';
        timeEl.textContent = '';
        return;
      }

      timeEl.textContent = timeAgo(_lastRefresh);

      const snaps = active.snapshots;
      const pred  = active.prediction;

      list.innerHTML = snaps.map(s => {
        const pct    = s.remaining_percent ?? 0;
        const cls    = pctClass(pct);
        const wname  = s.window_name || s.quota_bucket || 'Usage';
        const rst    = fmtReset(s.reset_at);
        const cntdn  = fmtCountdown(s.reset_at);
        const weekly = isWeeklyLimited(s);

        // Pin check
        const isPinned = _pinnedModel && (_pinnedModel === s.window_name || _pinnedModel === s.quota_bucket);

        // Trend from prediction if available
        const trend = pred && pred.window_name === s.window_name ? pred.trend : null;
        const tIcon = trendIcon(trend);

        const pctDisplay = blurWrap(\`<span class="model-pct \${cls}">\${pctText(pct)}</span>\`, 'model-pct-wrap');

        return \`<div class="model-card fade-in">
          <div class="model-header">
            <div class="model-name">
              <button class="btn-pin \${isPinned ? 'pinned' : ''}" data-model="\${_esc(wname)}" title="\${isPinned ? 'Pinned to status bar (click to unpin)' : 'Pin this model to status bar'}">
                \${isPinned ? '📌' : '📍'}
              </button>
              \${tIcon}
              <span class="model-title-text">\${_esc(wname)}</span>
              \${weekly ? '<span class="weekly-tag">WEEKLY</span>' : ''}
            </div>
            <div class="model-meta">
              \${pctDisplay}
              \${cntdn ? '<span class="model-countdown">· ' + cntdn + '</span>' : ''}
            </div>
          </div>
          <div class="model-bar-track">
            <div class="model-bar-fill \${cls}" style="width:\${pct}%"></div>
          </div>
          <div class="model-details">
            \${s.quota_bucket && s.quota_bucket !== s.window_name
              ? '<span class="model-bucket">' + _esc(s.quota_bucket) + '</span>'
              : '<span></span>'}
            \${rst ? '<span class="model-reset">Resets ' + rst + '</span>' : '<span></span>'}
          </div>
        </div>\`;
      }).join('');

      // Wire pin buttons
      list.querySelectorAll('.btn-pin').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const m = btn.dataset.model;
          const isPinned = btn.classList.contains('pinned');
          if (isPinned) {
            vscode.postMessage({ command: 'unpinModel' });
          } else {
            vscode.postMessage({ command: 'pinModel', modelName: m });
          }
        });
      });
    }

    // ── Render accounts list ────────────────────────────────────────────────
    function renderAccounts() {
      const countEl = document.getElementById('savedCount');
      countEl.textContent = _accounts.length;

      let sorted = [..._accounts];
      if (_sortMode === 'quota') {
        sorted.sort((a,b) => (b.best_remaining ?? 0) - (a.best_remaining ?? 0));
      } else if (_sortMode === 'name') {
        sorted.sort((a,b) => {
          const na = (a.label || a.display_name || a.email || '').toLowerCase();
          const nb = (b.label || b.display_name || b.email || '').toLowerCase();
          return na < nb ? -1 : na > nb ? 1 : 0;
        });
      } else {
        sorted.sort((a,b) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (b.status === 'live' && a.status !== 'live') return 1;
          return (b.best_remaining ?? 0) - (a.best_remaining ?? 0);
        });
      }

      if (_searchQ) {
        sorted = sorted.filter(a => {
          const haystack = [a.label, a.display_name, a.email, a.provider, a.client, a.group_name]
            .filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(_searchQ);
        });
      }

      const container = document.getElementById('accountsList');
      if (!sorted.length) {
        container.innerHTML = '<div class="empty">' +
          (_searchQ ? 'No matching accounts.' : 'No accounts yet.<br>Add via Command Palette or + button.') +
          '</div>';
        return;
      }

      container.innerHTML = sorted.map(acc => {
        const isActive = acc.status === 'live';
        const isRec    = _recommendation && _recommendation.id === acc.id;
        const name     = acc.label || acc.display_name || acc.email || ('Account ' + acc.id);
        const email    = acc.email || '';
        const initStr  = initials(name);
        const prov     = providerLabel(acc.provider);
        const isInst   = (acc.snapshots || []).length > 0;

        const badges = [
          isActive ? '<span class="card-badge active-tag">Active</span>' : '',
          '<span class="card-badge plan-tag">⭐ ' + _esc(prov) + '</span>',
          isInst   ? '<span class="card-badge instant-tag">⚡ Instant</span>' : '',
          isRec    ? '<span class="card-badge rec-tag">★ Best</span>' : '',
          acc.status === 'stale' ? '<span class="card-badge stale-tag">⚠ Stale</span>' : '',
        ].filter(Boolean).join('');

        // Per-model mini rows
        const snaps = acc.snapshots || [];
        let modelsHtml = '';
        if (snaps.length) {
          const rows = snaps.slice(0,4).map(s => {
            const pct = s.remaining_percent ?? 0;
            const cls = pctClass(pct);
            const wn  = (s.window_name || s.quota_bucket || 'Usage').slice(0,14);
            const rst = s.reset_at ? fmtCountdown(s.reset_at) : '';
            const pDisp = blurWrap(pctText(pct), 'cm-pct-wrap');
            return \`<div class="card-model-row">
              <span class="cm-name">\${_esc(wn)}</span>
              <div class="cm-bar"><div class="cm-fill \${cls}" style="width:\${pct}%"></div></div>
              <span class="cm-pct \${cls}">\${pDisp}</span>
              <span class="cm-rst">\${rst}</span>
            </div>\`;
          }).join('');
          modelsHtml = '<div class="card-models">' + rows + '</div>';
        }

        const cardCls = isActive ? 'acct-card active' : isRec ? 'acct-card recommended' : 'acct-card';
        const switchBtn = !isActive
          ? \`<button class="btn-switch-to" data-id="\${acc.id}">⇄ Switch to this account</button>\`
          : '';

        return \`<div class="\${cardCls}" data-id="\${acc.id}">
          <div class="acct-card-head">
            <div class="card-avatar \${isActive ? 'active-acc' : ''}">\${initStr}</div>
            <div class="card-acct-info">
              <div class="card-acct-name">\${_esc(name)}</div>
              <div class="card-acct-email">\${_esc(email)}</div>
              <div class="card-badges">\${badges}</div>
            </div>
            <div class="card-actions">
              <button class="card-btn refresh-acc" data-id="\${acc.id}" title="Refresh account quota">↻</button>
              <button class="card-btn edit-btn" data-id="\${acc.id}" title="Edit label">✎</button>
              <button class="card-btn delete" data-id="\${acc.id}" data-name="\${_esc(name)}" title="Remove account">🗑</button>
            </div>
          </div>
          \${modelsHtml}
          \${switchBtn}
          <div class="label-editor" id="le-\${acc.id}">
            <input type="text" placeholder="Label (e.g. Work, Primary)" id="le-label-\${acc.id}" value="\${_esc(acc.label || '')}">
            <input type="text" placeholder="Notes (optional)" id="le-notes-\${acc.id}" value="">
            <div class="le-actions">
              <button class="le-save" data-id="\${acc.id}">Save</button>
              <button class="le-cancel" data-id="\${acc.id}">Cancel</button>
            </div>
          </div>
        </div>\`;
      }).join('');

      // Wire events
      container.querySelectorAll('.btn-switch-to').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          vscode.postMessage({ command: 'switchTo', accountId: btn.dataset.id });
        });
      });
      container.querySelectorAll('.refresh-acc').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          vscode.postMessage({ command: 'refreshAccount', accountId: btn.dataset.id });
        });
      });
      container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const le = document.getElementById('le-' + btn.dataset.id);
          if (le) le.classList.toggle('open');
        });
      });
      container.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          vscode.postMessage({ command: 'deleteAccount', accountId: btn.dataset.id, accountName: btn.dataset.name });
        });
      });
      container.querySelectorAll('.le-save').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          vscode.postMessage({
            command: 'saveLabel', accountId: id,
            label: document.getElementById('le-label-' + id)?.value || '',
            notes: document.getElementById('le-notes-' + id)?.value || '',
          });
          const le = document.getElementById('le-' + id);
          if (le) le.classList.remove('open');
        });
      });
      container.querySelectorAll('.le-cancel').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const le = document.getElementById('le-' + btn.dataset.id);
          if (le) le.classList.remove('open');
        });
      });
    }

    // ── Countdown updater ───────────────────────────────────────────────────
    function startCountdownTimer() {
      if (_countdownTimer) clearInterval(_countdownTimer);
      _countdownTimer = setInterval(() => {
        const active = _accounts.find(a => a.status === 'live') || _accounts[0];
        if (!active) return;
        renderModelList();
        updateRefreshInfo();
      }, 10000);
    }

    function updateRefreshInfo() {
      const el = document.getElementById('refreshInfo');
      if (!_lastRefresh) { el.textContent = ''; return; }
      const secSince = Math.floor((Date.now() - new Date(_lastRefresh).getTime()) / 1000);
      const remaining = Math.max(0, _pollInterval - secSince);
      if (remaining > 0) {
        el.textContent = 'Next refresh in ' + remaining + 's';
      } else {
        el.textContent = 'Refreshing…';
      }
    }

    // ── Master render ───────────────────────────────────────────────────────
    function render() {
      const dot  = document.getElementById('statusDot');
      const txt  = document.getElementById('statusText');
      const active = _accounts.find(a => a.status === 'live');

      if (_accounts.length > 0) {
        dot.className = 'status-dot online';
        txt.textContent = active
          ? (active.label || active.display_name || active.email || 'Connected')
          : 'Ready';
      }

      // Privacy button state
      const privBtn = document.getElementById('privacyBtn');
      privBtn.className = 'btn-icon' + (_privacy ? ' active' : '');
      privBtn.title = _privacy ? 'Privacy mode ON — click to show values' : 'Privacy mode OFF — click to hide values';

      // Threshold & Auto-switch pills
      document.getElementById('thresholdPill').textContent = '⚠ Alert <' + _threshold + '%';
      
      const autoPill = document.getElementById('autoSwitchPill');
      autoPill.textContent = _autoSwitch ? '⚡ Auto: ON' : '⚡ Auto: OFF';
      autoPill.className = 'pill-btn' + (_autoSwitch ? ' active' : '');

      document.getElementById('offlineBanner').style.display = 'none';
      renderCurrentAccount();
      renderModelList();
      renderAccounts();
      updateRefreshInfo();
      startCountdownTimer();
    }

    function renderOffline() {
      const dot = document.getElementById('statusDot');
      dot.className = 'status-dot offline pulsing';
      document.getElementById('statusText').textContent = 'Offline';
      document.getElementById('currentAccount').innerHTML =
        \`<div class="offline-banner">⚠ AI-Quota agent offline<br><code>python -m app.main</code>
        <br><button class="btn-restart" onclick="vscode.postMessage({command:'refresh'})">↻ Retry</button></div>\`;
      document.getElementById('modelList').innerHTML =
        '<div class="model-card"><div class="empty" style="padding:10px 0;font-size:10px">Agent not running</div></div>';
      document.getElementById('accountsList').innerHTML = '';
    }

    // ── Escape helper ───────────────────────────────────────────────────────
    function _esc(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Message handler ─────────────────────────────────────────────────────
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'accounts') {
        _accounts       = msg.data || [];
        _recommendation = msg.recommendation || null;
        _privacy        = msg.privacyMode ?? false;
        _threshold      = msg.threshold ?? 20;
        _pollInterval   = msg.pollInterval ?? 30;
        _autoSwitch     = msg.autoSwitch ?? false;
        _pinnedModel    = msg.pinnedModel ?? '';
        _lastRefresh    = msg.lastRefresh ?? null;
        render();
      } else if (msg.type === 'error') {
        renderOffline();
      }
    });
  </script>
</body>
</html>`;
  }
}

function _nonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
