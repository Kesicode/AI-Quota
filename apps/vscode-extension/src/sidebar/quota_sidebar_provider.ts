/**
 * AI-Quota — Quota Sidebar WebviewView Provider (Phase 18)
 *
 * Renders the main quota view in the Activity Bar sidebar panel.
 *
 * Surfaces:
 *   - Account cards with real-time quota bars
 *   - Predictions panel (velocity, risk, ETA, recommended)
 *   - Quick label editor (click pencil icon)
 *   - SSE live feed indicator (green dot pulses when agent pushes events)
 *   - Webhook alert status indicator
 *   - Offline banner with restart command
 *
 * Live updates: extension polls on a configurable interval AND listens to
 * SSE /api/v1/events for push-style updates from the agent.
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

    // ── Handle messages from webview ────────────────────────────────────
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
              vscode.window.showErrorMessage(`Switch failed: ${e instanceof Error ? e.message : String(e)}`);
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
              // silent — UI still updates optimistically
            }
          }
          break;
        }

        case "testWebhook": {
          try {
            const result = await this._client.testWebhook();
            if (result.ok) {
              vscode.window.showInformationMessage(`Webhook test: HTTP ${result.http_status} — OK`);
            } else {
              vscode.window.showWarningMessage(`Webhook test failed: ${result.error}`);
            }
          } catch (e: unknown) {
            vscode.window.showErrorMessage(`Webhook test error: ${e instanceof Error ? e.message : String(e)}`);
          }
          break;
        }
      }
    });

    // Initial data load
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._view) return;
    try {
      const [accounts, predictions] = await Promise.all([
        this._client.getAccounts(),
        this._client.getPredictions("24h").catch(() => null),
      ]);

      // Attach prediction data onto account objects for easy rendering
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

  // ── HTML ──────────────────────────────────────────────────────────────

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
      --bg:       var(--vscode-sideBar-background, #0a0b0e);
      --surface:  var(--vscode-editor-background, #0f1115);
      --fg:       var(--vscode-foreground, #e8eaed);
      --muted:    var(--vscode-descriptionForeground, #9aa0a6);
      --accent:   #1a9e5c;
      --accent-g: rgba(26,158,92,0.15);
      --warn:     #f0a500;
      --error:    #e53935;
      --r:        6px;
      --font:     var(--vscode-font-family, 'Inter', system-ui, sans-serif);
      --mono:     var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: 12px;
      line-height: 1.5;
      padding: 8px;
    }

    /* Header */
    .hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06); }
    .hd-title { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
    .live-dot { width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 4px var(--accent); animation:pulse 2s infinite; }
    .live-dot.offline { background:rgba(255,255,255,0.2); box-shadow:none; animation:none; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .btn-icon { background:none; border:none; color:var(--muted); cursor:pointer; padding:3px 6px; border-radius:4px; font-size:11px; transition:background .15s,color .15s; }
    .btn-icon:hover { background:rgba(255,255,255,0.06); color:var(--fg); }

    /* Action strip */
    .actions { display:flex; gap:4px; margin-bottom:8px; }
    .btn-sm { flex:1; padding:5px 4px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:var(--r); color:var(--muted); font-size:10px; cursor:pointer; transition:background .15s,color .15s; text-align:center; }
    .btn-sm:hover { background:rgba(255,255,255,0.08); color:var(--fg); }

    /* Recommendation banner */
    .rec-banner { background:rgba(26,158,92,.10); border:1px solid rgba(26,158,92,.25); border-radius:var(--r); padding:6px 10px; margin-bottom:8px; font-size:10px; color:var(--accent); }
    .rec-banner strong { display:block; font-size:11px; margin-bottom:2px; }

    /* Account cards */
    .card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:var(--r); padding:10px 12px; margin-bottom:7px; transition:border-color .15s,background .15s; }
    .card:hover { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.12); }
    .card.best { border-color:var(--accent); background:var(--accent-g); }

    .card-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:6px; }
    .card-name { font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; display:flex; align-items:center; }
    .active-badge { font-size:9px; font-weight:700; letter-spacing:0.06em; background:rgba(26,158,92,0.25); color:#4fa84f; border:1px solid rgba(79,168,79,0.4); padding:1px 5px; border-radius:3px; margin-left:6px; text-transform:uppercase; flex-shrink:0; }
    .card-actions { display:flex; gap:3px; flex-shrink:0; }
    .card-tag { font-size:10px; color:var(--muted); font-family:var(--mono); margin-bottom:6px; }

    /* Quota bar */
    .bar-wrap { display:flex; align-items:center; gap:6px; margin-bottom:3px; }
    .bar-lbl { font-size:10px; color:var(--muted); width:52px; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .bar-track { flex:1; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:2px; background:var(--accent); transition:width .3s; }
    .bar-fill.warn { background:var(--warn); }
    .bar-fill.crit { background:var(--error); }
    .bar-pct { font-size:10px; font-family:var(--mono); width:28px; text-align:right; }

    /* Status dot */
    .dot { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:4px; vertical-align:middle; flex-shrink:0; }
    .dot.live { background:var(--accent); box-shadow:0 0 4px var(--accent); }
    .dot.stale { background:var(--warn); }
    .dot.offline { background:rgba(255,255,255,0.2); }

    /* Prediction row */
    .pred-row { display:flex; gap:6px; margin-top:5px; flex-wrap:wrap; }
    .pred-chip { font-size:9px; padding:2px 5px; border-radius:3px; font-family:var(--mono); }
    .pred-chip.none,.pred-chip.low { background:rgba(26,158,92,.15); color:#4fa84f; }
    .pred-chip.medium { background:rgba(240,165,0,.15); color:var(--warn); }
    .pred-chip.high,.pred-chip.critical { background:rgba(229,57,53,.15); color:var(--error); }
    .pred-warn { font-size:9px; color:var(--warn); margin-top:3px; }

    /* Switch button */
    .btn-switch { display:block; width:100%; margin-top:8px; padding:5px; background:var(--accent); color:#fff; border:none; border-radius:var(--r); font-size:11px; font-weight:600; cursor:pointer; letter-spacing:.04em; transition:opacity .15s; }
    .btn-switch:hover { opacity:.85; }

    /* Label editor */
    .label-editor { margin-top:6px; padding:6px 8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:var(--r); display:none; }
    .label-editor.open { display:block; }
    .label-editor input { width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:3px; color:var(--fg); font-size:10px; padding:3px 6px; margin-bottom:4px; outline:none; }
    .label-editor input:focus { border-color:var(--accent); }
    .le-actions { display:flex; gap:4px; }
    .le-save { flex:1; padding:3px; background:var(--accent); border:none; border-radius:3px; color:#fff; font-size:10px; cursor:pointer; }
    .le-cancel { flex:1; padding:3px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:3px; color:var(--muted); font-size:10px; cursor:pointer; }

    /* Empty / offline */
    .empty { text-align:center; color:var(--muted); padding:28px 8px; font-size:11px; }
    .offline-banner { background:rgba(229,57,53,.1); border:1px solid rgba(229,57,53,.25); border-radius:var(--r); padding:8px 10px; font-size:11px; color:#ef9a9a; margin-bottom:8px; }

    /* Reset countdown */
    .reset-row { font-size:9px; color:var(--muted); margin-top:2px; }
  </style>
</head>
<body>
  <div class="hd">
    <div class="hd-title">
      <span class="live-dot offline" id="liveDot"></span>
      AI-Quota
    </div>
    <button class="btn-icon" id="refreshBtn" title="Refresh">↻</button>
  </div>

  <div class="actions">
    <button class="btn-sm" id="dashboardBtn">Dashboard</button>
    <button class="btn-sm" id="matrixBtn">Matrix</button>
    <button class="btn-sm" id="webhookBtn" title="Test webhook">🔔</button>
  </div>

  <div id="rec"></div>
  <div id="content"><div class="empty">Loading…</div></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let _accounts = [];
    let _recommendation = null;

    document.getElementById('refreshBtn').onclick  = () => vscode.postMessage({ command: 'refresh' });
    document.getElementById('dashboardBtn').onclick = () => vscode.postMessage({ command: 'openDashboard' });
    document.getElementById('matrixBtn').onclick    = () => vscode.postMessage({ command: 'showMatrix' });
    document.getElementById('webhookBtn').onclick   = () => vscode.postMessage({ command: 'testWebhook' });

    // ── Formatters ──────────────────────────────────────────────────────
    function fmtReset(iso) {
      if (!iso) return '';
      const diff = new Date(iso).getTime() - Date.now();
      if (diff <= 0) return 'Reset soon';
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return h > 0 ? \`↺ \${h}h\${m}m\` : \`↺ \${m}m\`;
    }
    function barCls(pct) {
      if (pct <= 10) return 'crit';
      if (pct <= 20) return 'warn';
      return '';
    }
    function dotCls(status) {
      if (status === 'live') return 'live';
      if (status === 'stale' || status === 'recent') return 'stale';
      return 'offline';
    }
    function trendIcon(t) {
      return { stable:'━', consuming:'↘', recovering:'↗', exhausted:'✗', unknown:'?' }[t] || '?';
    }
    function fmtEta(h) {
      if (h == null) return null;
      if (h < 1) return \`\${Math.round(h*60)}m\`;
      return \`\${h.toFixed(1)}h\`;
    }

    // ── Render ──────────────────────────────────────────────────────────
    function render() {
      const dot = document.getElementById('liveDot');
      dot.className = 'live-dot';  // online

      // Recommendation banner
      const recEl = document.getElementById('rec');
      if (_recommendation && _recommendation.id) {
        const bestAcc = _accounts.find(a => a.id === _recommendation.id);
        const name = bestAcc ? (bestAcc.label || bestAcc.display_name || bestAcc.email) : \`Account \${_recommendation.id}\`;
        recEl.innerHTML = \`<div class="rec-banner"><strong>✓ Recommended: \${name}</strong>\${_recommendation.reason}</div>\`;
      } else {
        recEl.innerHTML = '';
      }

      const container = document.getElementById('content');
      if (!_accounts || !_accounts.length) {
        container.innerHTML = '<div class="empty">No accounts registered.<br>Add via Command Palette.</div>';
        return;
      }

      const sorted = [..._accounts].sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (b.status === 'live' && a.status !== 'live') return 1;
        return (b.best_remaining ?? 0) - (a.best_remaining ?? 0);
      });

      container.innerHTML = sorted.map((acc, i) => {
        const isBest = _recommendation && _recommendation.id === acc.id;
        const name   = acc.label || acc.display_name || acc.email || \`Account \${acc.id}\`;
        const pred   = acc.prediction;

        // Quota bars (up to 3 snapshots)
        const bars = (acc.snapshots || []).slice(0, 3).map(s => {
          const sp  = s.remaining_percent ?? 0;
          const rst = fmtReset(s.reset_at);
          return \`<div class="bar-wrap">
            <span class="bar-lbl" title="\${s.window_name}">\${s.window_name}</span>
            <div class="bar-track"><div class="bar-fill \${barCls(sp)}" style="width:\${sp}%"></div></div>
            <span class="bar-pct">\${sp.toFixed(0)}%</span>
          </div>\${rst ? '<div class="reset-row">'+rst+'</div>' : ''}\`;
        }).join('') || '<div style="color:var(--muted);font-size:10px">No quota data yet</div>';

        // Prediction chips
        let predHtml = '';
        if (pred) {
          const eta  = fmtEta(pred.hours_until_exhausted);
          const rst  = fmtEta(pred.hours_until_reset);
          predHtml = \`<div class="pred-row">
            <span class="pred-chip \${pred.risk_level}" title="Risk">\${pred.risk_level.toUpperCase()}</span>
            <span class="pred-chip \${pred.risk_level}" title="Trend">\${trendIcon(pred.trend)} \${pred.trend}</span>
            \${pred.velocity_pph != null ? '<span class="pred-chip '+pred.risk_level+'" title="Velocity">'+( pred.velocity_pph > 0 ? '+' : '')+pred.velocity_pph.toFixed(1)+'%/h</span>' : ''}
            \${eta ? '<span class="pred-chip '+pred.risk_level+'" title="Exhaustion ETA">💀 '+eta+'</span>' : ''}
            \${rst ? '<span class="pred-chip none" title="Reset in">↺ '+rst+'</span>' : ''}
          </div>\`;
          if (pred.warning) predHtml += \`<div class="pred-warn">⚠ \${pred.warning}</div>\`;
        }

        return \`<div class="card \${isBest ? 'best' : ''}" data-id="\${acc.id}">
          <div class="card-head">
            <div class="card-name">
              <span class="dot \${dotCls(acc.status)}"></span>\${name}
              \${acc.status === 'live' ? '<span class="active-badge">ACTIVE</span>' : ''}
            </div>
            <div class="card-actions">
              <button class="btn-icon edit-btn" data-id="\${acc.id}" title="Edit label">✏</button>
            </div>
          </div>
          <div class="card-tag">\${acc.provider || '—'} · \${acc.client || '—'}</div>
          \${bars}
          \${predHtml}
          <div class="label-editor" id="le-\${acc.id}">
            <input type="text" placeholder="Label (e.g. Work, Primary)" id="le-label-\${acc.id}" value="\${acc.label || ''}">
            <input type="text" placeholder="Notes" id="le-notes-\${acc.id}" value="\${acc.notes || ''}">
            <div class="le-actions">
              <button class="le-save" data-id="\${acc.id}">Save</button>
              <button class="le-cancel" data-id="\${acc.id}">Cancel</button>
            </div>
          </div>
          \${acc.status !== 'live' ? '<button class="btn-switch" data-id="'+acc.id+'">⇄ Switch to this account</button>' : ''}
        </div>\`;
      }).join('');

      // Switch buttons
      container.querySelectorAll('.btn-switch').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          vscode.postMessage({ command: 'switchTo', accountId: btn.dataset.id });
        });
      });

      // Edit label toggles
      container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const le = document.getElementById('le-' + btn.dataset.id);
          if (le) le.classList.toggle('open');
        });
      });

      // Label save
      container.querySelectorAll('.le-save').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          vscode.postMessage({
            command: 'saveLabel',
            accountId: id,
            label: document.getElementById('le-label-' + id)?.value || '',
            notes: document.getElementById('le-notes-' + id)?.value || '',
          });
          const le = document.getElementById('le-' + id);
          if (le) le.classList.remove('open');
        });
      });

      // Label cancel
      container.querySelectorAll('.le-cancel').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const le = document.getElementById('le-' + btn.dataset.id);
          if (le) le.classList.remove('open');
        });
      });
    }

    // ── Message handler ──────────────────────────────────────────────────
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'accounts') {
        _accounts = msg.data || [];
        _recommendation = msg.recommendation || null;
        render();
      } else if (msg.type === 'error') {
        document.getElementById('liveDot').className = 'live-dot offline';
        document.getElementById('rec').innerHTML = '';
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
