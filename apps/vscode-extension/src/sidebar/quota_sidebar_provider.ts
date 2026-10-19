/**
 * AI-Quota — Quota Sidebar WebviewView Provider
 *
 * Renders the main quota view in the Activity Bar sidebar.
 *
 * Layout (matches Antigravity Account Switcher design):
 *   - Header: agent status pill + Quota Matrix button
 *   - Current Account: avatar initials, name, email, plan/connection badges,
 *     Re-auth and Sign out action buttons
 *   - Usage: provider-grouped quota cards (Gemini, Claude+GPT, etc.)
 *   - Saved Accounts: collapsible section with search + sort,
 *     account cards with left-border active indicator
 *   - Footer: "Developed by Kesicode"
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

  constructor(context: vscode.ExtensionContext, client: AgentClient) {
    this._context = context;
    this._client = client;
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

        case "reAuth":
          await vscode.commands.executeCommand("ai-quota.reAuth");
          break;

        case "signOut":
          await vscode.commands.executeCommand("ai-quota.signOut");
          break;

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

        case "testWebhook": {
          try {
            const result = await this._client.testWebhook();
            if (result.ok) {
              vscode.window.showInformationMessage(
                `Webhook test: HTTP ${result.http_status} — OK`
              );
            } else {
              vscode.window.showWarningMessage(`Webhook test failed: ${result.error}`);
            }
          } catch (e: unknown) {
            vscode.window.showErrorMessage(
              `Webhook test error: ${e instanceof Error ? e.message : String(e)}`
            );
          }
          break;
        }
      }
    });

    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._view) return;
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

      this._view!.webview.postMessage({
        type: "accounts",
        data: enriched,
        recommendation: predictions
          ? { id: predictions.best_account_id, reason: predictions.reason }
          : null,
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
      --surface2:  rgba(255,255,255,0.04);
      --border:    rgba(255,255,255,0.07);
      --fg:        var(--vscode-foreground, #cccccc);
      --muted:     var(--vscode-descriptionForeground, #7f7f7f);
      --accent:    #1a9e5c;
      --accent-bg: rgba(26,158,92,0.12);
      --accent-bd: rgba(26,158,92,0.35);
      --warn:      #e5a000;
      --warn-bg:   rgba(229,160,0,0.12);
      --error:     #e53935;
      --blue:      #4da3ff;
      --blue-bg:   rgba(77,163,255,0.12);
      --r:         6px;
      --r-sm:      4px;
      --font:      var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
      --mono:      var(--vscode-editor-font-family, 'Consolas', monospace);
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
    }

    /* ── Scrollable body ── */
    #scroll-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0 0 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    #scroll-body::-webkit-scrollbar { width: 4px; }
    #scroll-body::-webkit-scrollbar-track { background: transparent; }
    #scroll-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    /* ── Top header bar ── */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px 6px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 500;
    }
    .status-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--muted);
      flex-shrink: 0;
    }
    .status-dot.online  { background: var(--accent); box-shadow: 0 0 5px var(--accent); }
    .status-dot.offline { background: rgba(255,255,255,0.2); }
    .status-label { color: var(--muted); }
    .status-label strong { color: var(--fg); }

    .top-actions { display: flex; align-items: center; gap: 4px; }
    .btn-icon {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 14px; line-height: 1;
      padding: 3px 5px; border-radius: var(--r-sm);
      transition: background .15s, color .15s;
      display: flex; align-items: center;
    }
    .btn-icon:hover { background: var(--surface2); color: var(--fg); }

    .btn-matrix {
      display: flex; align-items: center; gap: 5px;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--muted);
      font-size: 10px; font-weight: 500; padding: 3px 8px;
      cursor: pointer; transition: background .15s, color .15s;
    }
    .btn-matrix:hover { background: rgba(255,255,255,0.08); color: var(--fg); }

    /* ── Section label ── */
    .section-label {
      font-size: 10px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: var(--muted);
      padding: 10px 12px 5px;
    }

    /* ── Current Account ── */
    .current-account {
      margin: 0 10px 4px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r);
      padding: 10px 12px;
    }
    .acct-row { display: flex; align-items: flex-start; gap: 10px; }
    .avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: linear-gradient(135deg, #1a9e5c, #0e6b3e);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700; color: #fff;
      flex-shrink: 0; text-transform: uppercase;
      border: 2px solid rgba(26,158,92,0.4);
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
    .badge-plan {
      background: rgba(255,193,7,0.15); color: #f5c842;
      border: 1px solid rgba(245,200,66,0.3);
    }
    .badge-instant {
      background: var(--blue-bg); color: var(--blue);
      border: 1px solid rgba(77,163,255,0.3);
    }
    .badge-connected {
      background: var(--accent-bg); color: #4ade80;
      border: 1px solid rgba(74,222,128,0.3);
    }
    .badge-offline {
      background: rgba(229,57,53,0.12); color: #ef9a9a;
      border: 1px solid rgba(229,57,53,0.3);
    }
    .acct-btns { display: flex; gap: 6px; margin-top: 4px; }
    .btn-reauth {
      padding: 4px 10px; font-size: 10px; font-weight: 500;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--fg);
      cursor: pointer; transition: background .15s;
    }
    .btn-reauth:hover { background: rgba(255,255,255,0.08); }
    .btn-signout {
      padding: 4px 10px; font-size: 10px; font-weight: 500;
      background: none; border: 1px solid rgba(229,57,53,0.35);
      border-radius: var(--r-sm); color: #ef9a9a;
      cursor: pointer; transition: background .15s;
    }
    .btn-signout:hover { background: rgba(229,57,53,0.10); }
    .edit-acct-btn {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 12px; padding: 2px 4px;
      border-radius: var(--r-sm); flex-shrink: 0;
      transition: color .15s;
    }
    .edit-acct-btn:hover { color: var(--fg); }

    /* ── Usage section ── */
    .usage-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px 4px;
    }
    .usage-label { font-size: 11px; font-weight: 600; }
    .usage-time { font-size: 10px; color: var(--muted); }
    .usage-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 6px; padding: 0 10px 4px;
    }
    .usage-card {
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--r); padding: 8px 10px;
    }
    .usage-provider {
      font-size: 11px; font-weight: 600; margin-bottom: 6px;
    }
    .usage-window { margin-bottom: 3px; }
    .usage-pct {
      font-size: 12px; font-weight: 700;
      display: inline;
    }
    .usage-pct.good  { color: var(--accent); }
    .usage-pct.warn  { color: var(--warn); }
    .usage-pct.crit  { color: var(--error); }
    .usage-win-name  { font-size: 10px; color: var(--muted); display: inline; margin-left: 1px; }
    .usage-reset { font-size: 9px; color: var(--muted); margin-bottom: 3px; }
    .usage-bar-track {
      height: 3px; background: rgba(255,255,255,0.08);
      border-radius: 2px; overflow: hidden; margin-bottom: 6px;
    }
    .usage-bar-fill {
      height: 100%; border-radius: 2px;
      transition: width .4s ease;
    }
    .usage-bar-fill.good { background: var(--accent); }
    .usage-bar-fill.warn { background: var(--warn); }
    .usage-bar-fill.crit { background: var(--error); }

    /* ── Saved accounts section ── */
    .saved-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px 6px; cursor: pointer; user-select: none;
    }
    .saved-header:hover { background: var(--surface2); }
    .saved-header-left { display: flex; align-items: center; gap: 6px; }
    .saved-chevron { font-size: 10px; color: var(--muted); transition: transform .2s; }
    .saved-chevron.open { transform: rotate(0deg); }
    .saved-chevron.closed { transform: rotate(-90deg); }
    .saved-label { font-size: 11px; font-weight: 600; }
    .saved-count {
      font-size: 10px; background: var(--surface2); border: 1px solid var(--border);
      border-radius: 3px; padding: 0 5px; color: var(--muted);
    }
    .saved-header-right { display: flex; align-items: center; gap: 4px; }
    .btn-add {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 15px; line-height: 1;
      width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
      border-radius: var(--r-sm); transition: background .15s, color .15s;
    }
    .btn-add:hover { background: var(--surface2); color: var(--fg); }

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
      transition: border-color .15s, background .15s;
    }
    .acct-card.active { border-left-color: var(--accent); }
    .acct-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); border-left-width: 3px; }
    .acct-card.active:hover { border-left-color: var(--accent); }

    .acct-card-head { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px 6px; }
    .card-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg, #555, #333);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #fff;
      flex-shrink: 0; text-transform: uppercase; position: relative;
    }
    .card-avatar.active-acc::after {
      content: ''; position: absolute; bottom: 0; right: 0;
      width: 9px; height: 9px; border-radius: 50%;
      background: var(--accent); border: 2px solid var(--bg);
    }
    .card-acct-info { flex: 1; min-width: 0; }
    .card-acct-name {
      font-size: 11px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .card-acct-email { font-size: 10px; color: var(--muted); margin-bottom: 4px; }
    .card-badges { display: flex; flex-wrap: wrap; gap: 3px; }
    .card-badge {
      font-size: 9px; font-weight: 600; padding: 1px 5px;
      border-radius: 3px; display: flex; align-items: center; gap: 2px;
    }
    .active-tag {
      background: var(--accent-bg); color: #4ade80;
      border: 1px solid var(--accent-bd);
    }
    .plan-tag { background: rgba(255,193,7,0.12); color: #f5c842; border: 1px solid rgba(245,200,66,0.25); }
    .instant-tag { background: var(--blue-bg); color: var(--blue); border: 1px solid rgba(77,163,255,0.25); }
    .actnow-tag { background: var(--accent-bg); color: #4ade80; border: 1px solid var(--accent-bd); }
    .stale-tag { background: var(--warn-bg); color: var(--warn); border: 1px solid rgba(229,160,0,0.3); }

    .card-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .card-btn {
      background: none; border: none; cursor: pointer;
      color: var(--muted); font-size: 12px; padding: 3px 4px;
      border-radius: var(--r-sm); transition: background .15s, color .15s;
    }
    .card-btn:hover { background: var(--surface2); color: var(--fg); }
    .card-btn.delete:hover { color: var(--error); }

    /* Card usage mini-grid */
    .card-usage {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 4px; padding: 0 10px 8px;
    }
    .card-usage-box {
      background: rgba(0,0,0,0.15); border: 1px solid var(--border);
      border-radius: var(--r-sm); padding: 5px 7px;
    }
    .cu-provider { font-size: 9px; font-weight: 600; color: var(--muted); margin-bottom: 3px; }
    .cu-window { margin-bottom: 2px; }
    .cu-pct { font-size: 11px; font-weight: 700; }
    .cu-pct.good { color: var(--accent); }
    .cu-pct.warn { color: var(--warn); }
    .cu-pct.crit { color: var(--error); }
    .cu-win  { font-size: 9px; color: var(--muted); }
    .cu-reset { font-size: 8px; color: var(--muted); }

    /* Switch button (non-active accounts) */
    .btn-switch-to {
      display: block; width: calc(100% - 20px); margin: 0 10px 8px;
      padding: 5px; background: var(--accent); color: #fff;
      border: none; border-radius: var(--r-sm); font-size: 10px;
      font-weight: 600; cursor: pointer; letter-spacing: .04em;
      transition: opacity .15s;
    }
    .btn-switch-to:hover { opacity: .82; }

    /* Label editor */
    .label-editor {
      margin: 0 10px 8px; padding: 6px 8px;
      background: rgba(255,255,255,0.03); border: 1px solid var(--border);
      border-radius: var(--r-sm); display: none;
    }
    .label-editor.open { display: block; }
    .label-editor input {
      width: 100%; background: rgba(255,255,255,0.05);
      border: 1px solid var(--border); border-radius: 3px;
      color: var(--fg); font-size: 10px; padding: 3px 6px;
      margin-bottom: 4px; outline: none; font-family: var(--font);
    }
    .label-editor input:focus { border-color: var(--accent); }
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
      border-radius: var(--r); padding: 8px 12px;
      font-size: 11px; color: #ef9a9a;
    }
    .offline-banner code {
      display: inline-block; margin-top: 4px;
      background: rgba(0,0,0,.3); padding: 2px 6px;
      border-radius: 3px; font-size: 10px; font-family: var(--mono);
    }

    /* ── Footer ── */
    .footer {
      flex-shrink: 0; padding: 8px 12px;
      border-top: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .footer-credit { font-size: 10px; color: var(--muted); }
    .footer-credit a { color: #4da3ff; text-decoration: none; }
    .footer-version { font-size: 10px; color: var(--muted); font-family: var(--mono); }

    /* Animations */
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    .pulsing { animation: pulse 2s infinite; }
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
      <button class="btn-icon" id="refreshBtn" title="Refresh">↻</button>
      <button class="btn-matrix" id="matrixBtn">⊞ Quota Matrix</button>
    </div>
  </div>

  <!-- ── Scrollable body ── -->
  <div id="scroll-body">

    <!-- Current account -->
    <div class="section-label">Current account</div>
    <div id="currentAccount"></div>

    <!-- Usage -->
    <div class="usage-header">
      <span class="usage-label">Usage</span>
      <span class="usage-time" id="usageTime"></span>
    </div>
    <div class="usage-grid" id="usageGrid">
      <div class="usage-card">
        <div class="usage-provider">—</div>
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
        <button class="btn-add" id="addBtn" title="Add account">+</button>
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

    <!-- Offline fallback (hidden unless error) -->
    <div id="offlineBanner" style="display:none"></div>

  </div><!-- /#scroll-body -->

  <!-- ── Footer ── -->
  <div class="footer">
    <span class="footer-credit">Developed by <a href="#">Kesicode</a></span>
    <span class="footer-version" id="footerVersion">v2.0</span>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let _accounts = [];
    let _recommendation = null;
    let _savedOpen = true;
    let _sortMode = 'recent'; // 'recent' | 'quota' | 'name'
    let _searchQ = '';

    // ── Buttons ────────────────────────────────────────────────────────────
    document.getElementById('refreshBtn').onclick = () => vscode.postMessage({ command: 'refresh' });
    document.getElementById('matrixBtn').onclick   = () => vscode.postMessage({ command: 'showMatrix' });
    document.getElementById('addBtn').onclick      = () => vscode.postMessage({ command: 'switch' });

    document.getElementById('savedToggle').onclick = (e) => {
      if (e.target.closest('#addBtn')) return;
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
    function fmtReset(iso) {
      if (!iso) return '';
      const diff = new Date(iso).getTime() - Date.now();
      if (diff <= 0) return 'Reset soon';
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return h > 0 ? 'Resets in ' + h + 'h ' + m + 'm' : 'Resets in ' + m + 'm';
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
    function timeAgo(date) {
      if (!date) return 'just now';
      const diff = Date.now() - new Date(date).getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
      return Math.floor(diff/86400000) + 'd ago';
    }
    function providerLabel(p) {
      const MAP = {
        gemini: 'Gemini', google: 'Gemini',
        anthropic: 'Claude', claude: 'Claude',
        openai: 'GPT', gpt: 'GPT', copilot: 'Copilot',
        cursor: 'Cursor',
      };
      if (!p) return 'Unknown';
      return MAP[p.toLowerCase()] || (p.charAt(0).toUpperCase() + p.slice(1));
    }
    function groupByProvider(snapshots) {
      const groups = {};
      for (const s of (snapshots || [])) {
        const key = s.quota_bucket || s.window_name || 'Other';
        // Try to detect provider from bucket name
        let prov = 'Other';
        const kl = key.toLowerCase();
        if (kl.includes('gemini') || kl.includes('google')) prov = 'Gemini';
        else if (kl.includes('claude') || kl.includes('anthropic')) prov = 'Claude + GPT';
        else if (kl.includes('openai') || kl.includes('gpt') || kl.includes('copilot')) prov = 'Claude + GPT';
        else if (kl.includes('cursor')) prov = 'Cursor';
        if (!groups[prov]) groups[prov] = [];
        groups[prov].push(s);
      }
      return groups;
    }

    // ── Render current account ──────────────────────────────────────────────
    function renderCurrentAccount() {
      const el = document.getElementById('currentAccount');
      const active = _accounts.find(a => a.status === 'live') || _accounts[0];
      if (!active) {
        el.innerHTML = '<div class="empty">No active account</div>';
        return;
      }
      const name  = active.label || active.display_name || active.email || 'Account';
      const email = active.email || '';
      const prov  = providerLabel(active.provider);
      const isInstant = active.provider_truth?.authority_type === 'live' ||
                        (active.snapshots || []).length > 0;
      const isConn  = active.status === 'live';
      const initStr = initials(name);

      el.innerHTML = \`<div class="current-account">
        <div class="acct-row">
          <div class="avatar">\${initStr}</div>
          <div class="acct-info">
            <div class="acct-name">\${_esc(name)}</div>
            <div class="acct-email">\${_esc(email)}</div>
            <div class="badges">
              <span class="badge badge-plan">⭐ \${_esc(prov)}</span>
              \${isInstant ? '<span class="badge badge-instant">⚡ Instant</span>' : ''}
              \${isConn    ? '<span class="badge badge-connected">● Connected</span>'
                           : '<span class="badge badge-offline">● Offline</span>'}
            </div>
            <div class="acct-btns">
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
        // toggle the label editor of the active card in the accounts list
        const le = document.getElementById('le-' + active.id);
        if (le) le.classList.toggle('open');
      };
    }

    // ── Render usage cards ──────────────────────────────────────────────────
    function renderUsage() {
      const active = _accounts.find(a => a.status === 'live') || _accounts[0];
      const timeEl = document.getElementById('usageTime');
      timeEl.textContent = active ? timeAgo(null) : '';

      const grid = document.getElementById('usageGrid');
      if (!active || !(active.snapshots || []).length) {
        grid.innerHTML = '<div class="usage-card" style="grid-column:1/-1"><div class="empty" style="padding:10px 0;font-size:10px">No quota data yet</div></div>';
        return;
      }

      const groups = groupByProvider(active.snapshots);
      const provKeys = Object.keys(groups);
      if (!provKeys.length) {
        grid.innerHTML = '<div class="usage-card" style="grid-column:1/-1"><div class="empty" style="padding:10px 0">No quota data</div></div>';
        return;
      }

      grid.innerHTML = provKeys.map(prov => {
        const snaps = groups[prov];
        const rows  = snaps.slice(0, 2).map(s => {
          const pct   = s.remaining_percent ?? 0;
          const cls   = pctClass(pct);
          const rst   = fmtReset(s.reset_at);
          const wname = s.window_name || 'Usage';
          return \`<div class="usage-window">
            <span class="usage-pct \${cls}">\${pct.toFixed(0)}%</span>
            <span class="usage-win-name">\${_esc(wname)}</span>
          </div>
          <div class="usage-bar-track"><div class="usage-bar-fill \${cls}" style="width:\${pct}%"></div></div>
          \${rst ? '<div class="usage-reset">' + _esc(rst) + '</div>' : ''}\`;
        }).join('');

        return \`<div class="usage-card">
          <div class="usage-provider">\${_esc(prov)}</div>
          \${rows}
        </div>\`;
      }).join('');
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
        // recently used: active first, then by best_remaining
        sorted.sort((a,b) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (b.status === 'live' && a.status !== 'live') return 1;
          return (b.best_remaining ?? 0) - (a.best_remaining ?? 0);
        });
      }

      if (_searchQ) {
        sorted = sorted.filter(a => {
          const haystack = [a.label, a.display_name, a.email, a.provider, a.client]
            .filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(_searchQ);
        });
      }

      const container = document.getElementById('accountsList');
      if (!sorted.length) {
        container.innerHTML = '<div class="empty">' +
          (_searchQ ? 'No matching accounts.' : 'No accounts yet.<br>Add via Command Palette.') +
          '</div>';
        return;
      }

      container.innerHTML = sorted.map(acc => {
        const isActive = acc.status === 'live';
        const name     = acc.label || acc.display_name || acc.email || ('Account ' + acc.id);
        const email    = acc.email || '';
        const initStr  = initials(name);
        const prov     = providerLabel(acc.provider);
        const isInstant = acc.provider_truth?.authority_type === 'live' ||
                          (acc.snapshots || []).length > 0;

        // Card badges
        const badges = [
          isActive  ? '<span class="card-badge active-tag">Active</span>' : '',
          '<span class="card-badge plan-tag">⭐ ' + _esc(prov) + '</span>',
          isInstant ? '<span class="card-badge instant-tag">⚡ Instant</span>' : '',
          isActive  ? '<span class="card-badge actnow-tag">⊙ Active now</span>' : '',
          acc.status === 'stale' ? '<span class="card-badge stale-tag">⚠ Stale</span>' : '',
        ].filter(Boolean).join('');

        // Mini usage boxes
        const groups = groupByProvider(acc.snapshots || []);
        const provKeys = Object.keys(groups);
        let usageBoxes = '';
        if (provKeys.length) {
          usageBoxes = '<div class="card-usage">' + provKeys.slice(0,2).map(p => {
            const snaps = groups[p];
            const rows  = snaps.slice(0,2).map(s => {
              const pct = s.remaining_percent ?? 0;
              const cls = pctClass(pct);
              const rst = fmtReset(s.reset_at);
              return \`<div class="cu-window">
                <span class="cu-pct \${cls}">\${pct.toFixed(0)}%</span>
                <span class="cu-win"> \${_esc(s.window_name || '')}</span>
              </div>
              \${rst ? '<div class="cu-reset">' + _esc(rst) + '</div>' : ''}\`;
            }).join('');
            return \`<div class="card-usage-box">
              <div class="cu-provider">\${_esc(p)}</div>
              \${rows}
            </div>\`;
          }).join('') + '</div>';
        }

        const switchBtn = !isActive
          ? \`<button class="btn-switch-to" data-id="\${acc.id}">⇄ Switch to this account</button>\`
          : '';

        return \`<div class="acct-card \${isActive ? 'active' : ''}" data-id="\${acc.id}">
          <div class="acct-card-head">
            <div class="card-avatar \${isActive ? 'active-acc' : ''}">\${initStr}</div>
            <div class="card-acct-info">
              <div class="card-acct-name">\${_esc(name)}</div>
              <div class="card-acct-email">\${_esc(email)}</div>
              <div class="card-badges">\${badges}</div>
            </div>
            <div class="card-actions">
              <button class="card-btn edit-btn" data-id="\${acc.id}" title="Edit label">✎</button>
              <button class="card-btn delete" data-id="\${acc.id}" title="Remove">🗑</button>
            </div>
          </div>
          \${usageBoxes}
          \${switchBtn}
          <div class="label-editor" id="le-\${acc.id}">
            <input type="text" placeholder="Label (e.g. Work, Primary)" id="le-label-\${acc.id}" value="\${_esc(acc.label || '')}">
            <input type="text" placeholder="Notes" id="le-notes-\${acc.id}" value="">
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
      container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const le = document.getElementById('le-' + btn.dataset.id);
          if (le) le.classList.toggle('open');
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

    // ── Master render ───────────────────────────────────────────────────────
    function render() {
      // Status pill
      const dot  = document.getElementById('statusDot');
      const txt  = document.getElementById('statusText');
      const active = _accounts.find(a => a.status === 'live');
      if (_accounts.length > 0) {
        dot.className = 'status-dot online';
        txt.textContent = 'Ready';
      }

      document.getElementById('offlineBanner').style.display = 'none';
      renderCurrentAccount();
      renderUsage();
      renderAccounts();
    }

    function renderOffline() {
      const dot = document.getElementById('statusDot');
      dot.className = 'status-dot offline';
      dot.classList.add('pulsing');
      document.getElementById('statusText').textContent = 'Offline';
      document.getElementById('currentAccount').innerHTML =
        '<div class="offline-banner">⚠ AI-Quota agent offline<br><code>python -m app.main</code></div>';
      document.getElementById('usageGrid').innerHTML =
        '<div class="usage-card" style="grid-column:1/-1"><div class="empty" style="padding:10px 0;font-size:10px">Agent not running</div></div>';
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
        _accounts = msg.data || [];
        _recommendation = msg.recommendation || null;
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
