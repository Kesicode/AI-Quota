/**
 * AI-Quota — Quota Sidebar WebviewView Provider
 *
 * Renders the main quota view in the Activity Bar sidebar panel.
 * Shows: current account, quota bars, reset timer, switch button, account cards.
 */

import * as vscode from "vscode";
import type { AgentClient, AccountData } from "../agent_client";

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

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case "switch":
          await vscode.commands.executeCommand("ai-quota.switchAccount");
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
      }
    });

    // Initial data load
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._view) return;
    try {
      const accounts = await this._client.getAccounts();
      this._view.webview.postMessage({ type: "accounts", data: accounts });
    } catch {
      this._view.webview.postMessage({ type: "error", message: "Agent offline" });
    }
  }

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
      --bg: var(--vscode-sideBar-background, #0a0b0e);
      --surface: var(--vscode-editor-background, #0f1115);
      --fg: var(--vscode-foreground, #e8eaed);
      --fg-muted: var(--vscode-descriptionForeground, #9aa0a6);
      --accent: #1a9e5c;
      --accent-glow: rgba(26, 158, 92, 0.15);
      --warn: #f0a500;
      --error: #e53935;
      --radius: 6px;
      --font: var(--vscode-font-family, 'Inter', system-ui, sans-serif);
      --font-mono: var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: 12px;
      line-height: 1.5;
      padding: 8px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .header h1 {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--fg-muted);
    }
    .btn-icon {
      background: none;
      border: none;
      color: var(--fg-muted);
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 11px;
      transition: background 0.15s, color 0.15s;
    }
    .btn-icon:hover { background: rgba(255,255,255,0.06); color: var(--fg); }
    .account-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: var(--radius);
      padding: 10px 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .account-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }
    .account-card.best {
      border-color: var(--accent);
      background: var(--accent-glow);
    }
    .account-card .name {
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .account-card .provider-tag {
      font-size: 10px;
      color: var(--fg-muted);
      font-family: var(--font-mono);
      margin-bottom: 6px;
    }
    .quota-bar-wrap { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .quota-label { font-size: 10px; color: var(--fg-muted); width: 44px; flex-shrink: 0; }
    .quota-bar {
      flex: 1;
      height: 4px;
      background: rgba(255,255,255,0.08);
      border-radius: 2px;
      overflow: hidden;
    }
    .quota-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--accent);
      transition: width 0.3s;
    }
    .quota-bar-fill.warn { background: var(--warn); }
    .quota-bar-fill.critical { background: var(--error); }
    .quota-pct { font-size: 10px; font-family: var(--font-mono); width: 28px; text-align: right; }
    .reset-row { font-size: 10px; color: var(--fg-muted); margin-top: 4px; }
    .status-dot {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      margin-right: 4px; vertical-align: middle;
    }
    .status-dot.live { background: var(--accent); box-shadow: 0 0 4px var(--accent); }
    .status-dot.stale { background: var(--warn); }
    .status-dot.offline { background: rgba(255,255,255,0.2); }
    .btn-switch {
      display: block;
      width: 100%;
      margin-top: 8px;
      padding: 6px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.04em;
      transition: opacity 0.15s;
    }
    .btn-switch:hover { opacity: 0.85; }
    .empty-state { text-align: center; color: var(--fg-muted); padding: 32px 8px; font-size: 11px; }
    .offline-banner {
      background: rgba(229, 57, 53, 0.1);
      border: 1px solid rgba(229, 57, 53, 0.25);
      border-radius: var(--radius);
      padding: 8px 10px;
      font-size: 11px;
      color: #ef9a9a;
      margin-bottom: 8px;
    }
    .actions { display: flex; gap: 4px; margin-bottom: 8px; }
    .btn-sm {
      flex: 1;
      padding: 5px 4px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: var(--radius);
      color: var(--fg-muted);
      font-size: 10px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      text-align: center;
    }
    .btn-sm:hover { background: rgba(255,255,255,0.08); color: var(--fg); }
  </style>
</head>
<body>
  <div class="header">
    <h1>AI-Quota</h1>
    <button class="btn-icon" id="refreshBtn" title="Refresh">↻</button>
  </div>
  <div class="actions">
    <button class="btn-sm" id="dashboardBtn">Dashboard</button>
    <button class="btn-sm" id="matrixBtn">Matrix</button>
  </div>
  <div id="content">
    <div class="empty-state">Loading...</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('refreshBtn').onclick = () => vscode.postMessage({ command: 'refresh' });
    document.getElementById('dashboardBtn').onclick = () => vscode.postMessage({ command: 'openDashboard' });
    document.getElementById('matrixBtn').onclick = () => vscode.postMessage({ command: 'showMatrix' });

    function formatReset(resetAt) {
      if (!resetAt) return '';
      const diff = new Date(resetAt).getTime() - Date.now();
      if (diff <= 0) return 'Reset soon';
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return h > 0 ? \`Resets in \${h}h\${m}m\` : \`Resets in \${m}m\`;
    }

    function barClass(pct) {
      if (pct <= 10) return 'critical';
      if (pct <= 20) return 'warn';
      return '';
    }

    function statusClass(status) {
      if (status === 'live') return 'live';
      if (status === 'stale' || status === 'recent') return 'stale';
      return 'offline';
    }

    function renderAccounts(accounts) {
      const container = document.getElementById('content');
      if (!accounts || accounts.length === 0) {
        container.innerHTML = '<div class="empty-state">No accounts registered.<br>Add an account via the command palette.</div>';
        return;
      }

      // Rank: best remaining first
      const sorted = [...accounts].sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (b.status === 'live' && a.status !== 'live') return 1;
        return (b.best_remaining ?? 0) - (a.best_remaining ?? 0);
      });

      container.innerHTML = sorted.map((acc, i) => {
        const isBest = i === 0 && acc.best_remaining !== null && acc.status === 'live';
        const name = acc.label || acc.display_name || acc.email;
        const pct = acc.best_remaining ?? 0;
        const bc = barClass(pct);
        const sc = statusClass(acc.status);

        const quotaBars = acc.snapshots.slice(0, 3).map(s => {
          const sp = s.remaining_percent ?? 0;
          const sbc = barClass(sp);
          return \`
            <div class="quota-bar-wrap">
              <span class="quota-label">\${s.window_name}</span>
              <div class="quota-bar"><div class="quota-bar-fill \${sbc}" style="width:\${sp}%"></div></div>
              <span class="quota-pct">\${sp.toFixed(0)}%</span>
            </div>
            \${s.reset_at ? \`<div class="reset-row">\${formatReset(s.reset_at)}</div>\` : ''}
          \`;
        }).join('');

        return \`
          <div class="account-card \${isBest ? 'best' : ''}" data-id="\${acc.id}">
            <div class="name">
              <span class="status-dot \${sc}"></span>
              \${name}
            </div>
            <div class="provider-tag">\${acc.provider} · \${acc.client}</div>
            \${quotaBars || '<div style="color:var(--fg-muted);font-size:10px">No quota data yet</div>'}
            \${isBest ? '<button class="btn-switch" data-id="' + acc.id + '">Switch to this account</button>' : ''}
          </div>
        \`;
      }).join('');

      // Attach switch button handlers
      container.querySelectorAll('.btn-switch').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ command: 'switch', accountId: btn.dataset.id });
        });
      });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'accounts') {
        renderAccounts(msg.data);
      } else if (msg.type === 'error') {
        document.getElementById('content').innerHTML =
          '<div class="offline-banner">⚠ AI-Quota agent offline<br><small>Start: python -m app.main</small></div>';
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
