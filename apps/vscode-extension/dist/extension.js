"use strict";var O=Object.create;var A=Object.defineProperty;var j=Object.getOwnPropertyDescriptor;var F=Object.getOwnPropertyNames;var V=Object.getPrototypeOf,J=Object.prototype.hasOwnProperty;var Y=(r,t)=>{for(var e in t)A(r,e,{get:t[e],enumerable:!0})},z=(r,t,e,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of F(t))!J.call(r,a)&&a!==e&&A(r,a,{get:()=>t[a],enumerable:!(n=j(t,a))||n.enumerable});return r};var x=(r,t,e)=>(e=r!=null?O(V(r)):{},z(t||!r||!r.__esModule?A(e,"default",{value:r,enumerable:!0}):e,r)),K=r=>z(A({},"__esModule",{value:!0}),r);var ne={};Y(ne,{activate:()=>Z,deactivate:()=>ee});module.exports=K(ne);var m=x(require("vscode"));var k=class{constructor(t,e=8e3){this.baseUrl=t.replace(/\/$/,""),this.timeout=e}async fetch(t,e){let n=`${this.baseUrl}${t}`,a=new AbortController,o=setTimeout(()=>a.abort(),this.timeout);try{let c=await globalThis.fetch(n,{...e,signal:a.signal,headers:{"Content-Type":"application/json",Accept:"application/json",...e?.headers}});if(!c.ok)throw new Error(`HTTP ${c.status} from ${t}`);return await c.json()}finally{clearTimeout(o)}}async isAgentRunning(){try{return await this.fetch("/api/v1/health"),!0}catch{return!1}}async getAccounts(){return this.fetch("/api/v1/accounts")}async getProviders(){return this.fetch("/api/v1/providers")}async sync(){return this.fetch("/api/v1/sync",{method:"POST"})}async switchAccount(t,e=!1){return this.fetch(`/api/v1/accounts/${t}/switch?force=${e}`,{method:"POST"})}async refreshAccount(t){return this.fetch(`/api/v1/accounts/${t}/refresh`,{method:"POST"})}async getDiagnostics(){return this.fetch("/api/v1/diagnostics")}async getSettings(){return this.fetch("/api/v1/settings")}async updateSettings(t){return this.fetch("/api/v1/settings",{method:"PUT",body:JSON.stringify(t)})}async addAccount(t){return this.fetch("/api/v1/accounts",{method:"POST",body:JSON.stringify(t)})}async deleteAccount(t){await this.fetch(`/api/v1/accounts/${t}`,{method:"DELETE"})}getDashboardUrl(){return`${this.baseUrl}/`}async getPredictions(t="24h"){return this.fetch(`/api/v1/predictions?period=${t}`)}async updateAccountLabel(t,e){return this.fetch(`/api/v1/accounts/${t}/label`,{method:"PATCH",body:JSON.stringify(e)})}async getWebhookConfig(){return this.fetch("/api/v1/webhooks/config")}async updateWebhookConfig(t){return this.fetch("/api/v1/webhooks/config",{method:"PUT",body:JSON.stringify(t)})}async testWebhook(){return this.fetch("/api/v1/webhooks/test",{method:"POST"})}async getMatrix(t=""){let e=t?`?provider=${encodeURIComponent(t)}`:"";return this.fetch(`/api/v1/matrix${e}`)}};var w=x(require("vscode")),I=class{constructor(t,e){this._disposed=!1;this.client=t,this.item=w.window.createStatusBarItem(w.StatusBarAlignment.Right,100),this.item.command="ai-quota.switchAccount",this.item.tooltip="AI-Quota \u2014 click to switch account",e.subscriptions.push(this.item)}show(){this.item.text="$(sync~spin) AI-Quota",this.item.show()}async refresh(){if(!this._disposed)try{let t=await this.client.getAccounts(),e=this._bestAccount(t);if(!e){this.item.text="$(account) AI-Quota",this.item.tooltip="AI-Quota \u2014 no accounts registered",this.item.backgroundColor=void 0;return}let n=e.best_remaining??0,a=this._nextReset(e),o=e.label||e.display_name||e.email,c=n>50?"$(pulse)":n>20?"$(warning)":"$(error)";this.item.text=`${c} ${n.toFixed(0)}%${a?` \xB7 ${a}`:""}`,this.item.tooltip=`AI-Quota: ${o} \u2014 ${n.toFixed(1)}% remaining
${a?`Resets in: ${a}`:""}`,n<=10?this.item.backgroundColor=new w.ThemeColor("statusBarItem.errorBackground"):n<=20?this.item.backgroundColor=new w.ThemeColor("statusBarItem.warningBackground"):this.item.backgroundColor=void 0}catch{this.setOffline()}}setOffline(){this._disposed||(this.item.text="$(circle-slash) AI-Quota",this.item.tooltip="AI-Quota agent offline \u2014 start with: python -m app.main",this.item.backgroundColor=void 0)}dispose(){this._disposed=!0,this.item.dispose()}_bestAccount(t){let e=t.filter(n=>n.status==="live"&&n.best_remaining!==null&&n.best_remaining!==void 0);return e.length?e.reduce((n,a)=>(a.best_remaining??0)>(n.best_remaining??0)?a:n):t[0]??null}_nextReset(t){let e=t.snapshots.map(s=>s.reset_at).filter(s=>!!s).map(s=>new Date(s).getTime()).filter(s=>!isNaN(s)&&s>Date.now());if(!e.length)return"";let n=Math.min(...e),a=Math.max(0,n-Date.now()),o=Math.floor(a/36e5),c=Math.floor(a%36e5/6e4);return o>0?`${o}h${c}m`:`${c}m`}};var p=x(require("vscode")),P=class{constructor(t,e){this._context=t,this._client=e}resolveWebviewView(t,e,n){this._view=t,t.webview.options={enableScripts:!0,localResourceRoots:[p.Uri.joinPath(this._context.extensionUri,"media"),p.Uri.joinPath(this._context.extensionUri,"dist")]},t.webview.html=this._getHtml(t.webview),t.webview.onDidReceiveMessage(async a=>{switch(a.command){case"switch":await p.commands.executeCommand("ai-quota.switchAccount");break;case"switchTo":if(a.accountId)try{await this._client.switchAccount(Number(a.accountId)),await this.refresh(),p.window.showInformationMessage("AI-Quota: Account switched.")}catch(o){p.window.showErrorMessage(`Switch failed: ${o instanceof Error?o.message:String(o)}`)}break;case"refresh":await this.refresh();break;case"openDashboard":await p.commands.executeCommand("ai-quota.openDashboard");break;case"showMatrix":await p.commands.executeCommand("ai-quota.showQuotaMatrix");break;case"saveLabel":{let{accountId:o,label:c,notes:s,color:v}=a;if(o)try{await this._client.updateAccountLabel(Number(o),{label:c||void 0,notes:s||void 0,color:v||void 0}),await this.refresh()}catch{}break}case"testWebhook":{try{let o=await this._client.testWebhook();o.ok?p.window.showInformationMessage(`Webhook test: HTTP ${o.http_status} \u2014 OK`):p.window.showWarningMessage(`Webhook test failed: ${o.error}`)}catch(o){p.window.showErrorMessage(`Webhook test error: ${o instanceof Error?o.message:String(o)}`)}break}}}),this.refresh()}async refresh(){if(this._view)try{let[t,e]=await Promise.all([this._client.getAccounts(),this._client.getPredictions("24h").catch(()=>null)]),n=new Map;if(e)for(let o of e.predictions)n.set(o.account_id,o);let a=t.map(o=>({...o,prediction:n.get(o.id)??null}));this._view.webview.postMessage({type:"accounts",data:a,recommendation:e?{id:e.best_account_id,reason:e.reason}:null})}catch{this._view.webview.postMessage({type:"error",message:"Agent offline"})}}_getHtml(t){let e=X();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${e}';">
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
    .card-name { font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; }
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
    <button class="btn-icon" id="refreshBtn" title="Refresh">\u21BB</button>
  </div>

  <div class="actions">
    <button class="btn-sm" id="dashboardBtn">Dashboard</button>
    <button class="btn-sm" id="matrixBtn">Matrix</button>
    <button class="btn-sm" id="webhookBtn" title="Test webhook">\u{1F514}</button>
  </div>

  <div id="rec"></div>
  <div id="content"><div class="empty">Loading\u2026</div></div>

  <script nonce="${e}">
    const vscode = acquireVsCodeApi();
    let _accounts = [];
    let _recommendation = null;

    document.getElementById('refreshBtn').onclick  = () => vscode.postMessage({ command: 'refresh' });
    document.getElementById('dashboardBtn').onclick = () => vscode.postMessage({ command: 'openDashboard' });
    document.getElementById('matrixBtn').onclick    = () => vscode.postMessage({ command: 'showMatrix' });
    document.getElementById('webhookBtn').onclick   = () => vscode.postMessage({ command: 'testWebhook' });

    // \u2500\u2500 Formatters \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function fmtReset(iso) {
      if (!iso) return '';
      const diff = new Date(iso).getTime() - Date.now();
      if (diff <= 0) return 'Reset soon';
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return h > 0 ? \`\u21BA \${h}h\${m}m\` : \`\u21BA \${m}m\`;
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
      return { stable:'\u2501', consuming:'\u2198', recovering:'\u2197', exhausted:'\u2717', unknown:'?' }[t] || '?';
    }
    function fmtEta(h) {
      if (h == null) return null;
      if (h < 1) return \`\${Math.round(h*60)}m\`;
      return \`\${h.toFixed(1)}h\`;
    }

    // \u2500\u2500 Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function render() {
      const dot = document.getElementById('liveDot');
      dot.className = 'live-dot';  // online

      // Recommendation banner
      const recEl = document.getElementById('rec');
      if (_recommendation && _recommendation.id) {
        const bestAcc = _accounts.find(a => a.id === _recommendation.id);
        const name = bestAcc ? (bestAcc.label || bestAcc.display_name || bestAcc.email) : \`Account \${_recommendation.id}\`;
        recEl.innerHTML = \`<div class="rec-banner"><strong>\u2713 Recommended: \${name}</strong>\${_recommendation.reason}</div>\`;
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
            \${eta ? '<span class="pred-chip '+pred.risk_level+'" title="Exhaustion ETA">\u{1F480} '+eta+'</span>' : ''}
            \${rst ? '<span class="pred-chip none" title="Reset in">\u21BA '+rst+'</span>' : ''}
          </div>\`;
          if (pred.warning) predHtml += \`<div class="pred-warn">\u26A0 \${pred.warning}</div>\`;
        }

        return \`<div class="card \${isBest ? 'best' : ''}" data-id="\${acc.id}">
          <div class="card-head">
            <div class="card-name">
              <span class="dot \${dotCls(acc.status)}"></span>\${name}
            </div>
            <div class="card-actions">
              <button class="btn-icon edit-btn" data-id="\${acc.id}" title="Edit label">\u270F</button>
            </div>
          </div>
          <div class="card-tag">\${acc.provider || '\u2014'} \xB7 \${acc.client || '\u2014'}</div>
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
          \${isBest ? '<button class="btn-switch" data-id="'+acc.id+'">\u21C4 Switch to this account</button>' : ''}
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

    // \u2500\u2500 Message handler \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
          '<div class="offline-banner">\u26A0 AI-Quota agent offline<br><small>Start: python -m app.main</small></div>';
      }
    });
  </script>
</body>
</html>`}};function X(){let r="",t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let e=0;e<32;e++)r+=t.charAt(Math.floor(Math.random()*t.length));return r}var l=x(require("vscode")),T=class extends l.TreeItem{constructor(e,n){let a=e.label||e.display_name||e.email;super(a,n);this.account=e;this.collapsibleState=n;let o=e.best_remaining;this.description=o!=null?`${o.toFixed(0)}% \xB7 ${e.status}`:e.status,this.tooltip=[`Email: ${e.email}`,`Provider: ${e.provider}`,`Client: ${e.client}`,o!=null?`Quota: ${o.toFixed(1)}%`:""].filter(Boolean).join(`
`),this.iconPath=this._icon(e.status,o),this.contextValue="account",this.command={command:"ai-quota.switchAccount",title:"Switch",arguments:[]}}_icon(e,n){return e==="live"?n!=null&&n<=10?new l.ThemeIcon("error"):n!=null&&n<=20?new l.ThemeIcon("warning"):new l.ThemeIcon("circle-filled"):e==="stale"?new l.ThemeIcon("clock"):new l.ThemeIcon("circle-outline")}},B=class extends l.TreeItem{constructor(t){let e=t.remaining_percent?.toFixed(0)??"?";super(`${t.window_name}: ${e}%`,l.TreeItemCollapsibleState.None),this.description=t.reset_at?`Resets ${new Date(t.reset_at).toLocaleTimeString()}`:"",this.iconPath=new l.ThemeIcon("graph"),this.contextValue="snapshot"}},D=class{constructor(t){this.client=t;this._onDidChangeTreeData=new l.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._accounts=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._accounts=await this.client.getAccounts()}catch{this._accounts=[]}}getTreeItem(t){return t}async getChildren(t){return t?t instanceof T?t.account.snapshots.map(e=>new B(e)):[]:(this._accounts.length||await this._load(),this._accounts.map(e=>new T(e,e.snapshots?.length?l.TreeItemCollapsibleState.Collapsed:l.TreeItemCollapsibleState.None)))}};var u=x(require("vscode")),C=class extends u.TreeItem{constructor(e){super(e.display_name,u.TreeItemCollapsibleState.Collapsed);this.provider=e;let n=e.detected;this.description=n?"\u25CF detected":"\u25CB not running",this.tooltip=[`ID: ${e.id}`,`Detected: ${n?"Yes":"No"}`,e.hub_url?`Hub: ${e.hub_url}`:"",`Switching: ${e.capabilities?.switching?e.capabilities.switch_method:"not supported"}`,`Truth: ${e.truth?.authority_type??"unknown"}`].filter(Boolean).join(`
`),this.iconPath=n?new u.ThemeIcon("plug",new u.ThemeColor("charts.green")):new u.ThemeIcon("plug"),this.contextValue="provider"}},h=class extends u.TreeItem{constructor(t,e){let n=typeof e=="boolean"?e?"\u2713":"\u2717":e;super(`${t}: ${n}`,u.TreeItemCollapsibleState.None),this.iconPath=new u.ThemeIcon(typeof e=="boolean"?e?"check":"close":"info"),this.contextValue="capability"}},M=class{constructor(t){this.client=t;this._onDidChangeTreeData=new u.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._providers=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._providers=await this.client.getProviders()}catch{this._providers=[]}}getTreeItem(t){return t}async getChildren(t){if(!t)return this._providers.length||await this._load(),[...this._providers].sort((e,n)=>Number(n.detected)-Number(e.detected)).map(e=>new C(e));if(t instanceof C){let e=t.provider,n=e.capabilities??{};return[new h("Quota",n.quota??!1),new h("Detection",n.detection??!1),new h("Switching",n.switching??!1),new h("Instant Switch",n.instant_switch??!1),new h("Method",n.switch_method??"n/a"),new h("Hub URL",e.hub_url??"\u2014"),new h("Authority",e.truth?.authority_type??"unknown")]}return[]}};var i=x(require("vscode"));function L(r,t,e){let n=(a,o)=>r.subscriptions.push(i.commands.registerCommand(a,o));n("ai-quota.openDashboard",()=>{i.env.openExternal(i.Uri.parse(t.getDashboardUrl()))}),n("ai-quota.switchAccount",async()=>{let a;try{a=await t.getAccounts()}catch{i.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot switch account.");return}if(!a.length){i.window.showInformationMessage("AI-Quota: No accounts registered.");return}let c=[...a].sort((d,_)=>d.status==="live"&&_.status!=="live"?-1:_.status==="live"&&d.status!=="live"?1:(_.best_remaining??0)-(d.best_remaining??0)).map(d=>({label:d.label||d.display_name||d.email,description:`${d.provider} \xB7 ${d.best_remaining?.toFixed(0)??"?"}% remaining`,detail:`Status: ${d.status} | Client: ${d.client}`,accountId:d.id})),s=await i.window.showQuickPick(c,{title:"AI-Quota: Switch Account",placeHolder:"Select account to switch to\u2026",matchOnDescription:!0});!s||await i.window.showWarningMessage(`Switch to "${s.label}"?`,{modal:!0},"Switch")!=="Switch"||await i.window.withProgress({location:i.ProgressLocation.Notification,title:"AI-Quota: Switching account\u2026",cancellable:!1},async()=>{try{let d=await t.switchAccount(s.accountId);d.status==="success"&&d.verified?i.window.showInformationMessage(`\u2713 Switched to ${s.label} (verified via ${d.method_used})`):d.status==="verification_failed"?i.window.showWarningMessage(`\u26A0 Switch attempted but not verified \u2014 active account may differ. Reason: ${d.reason}`):i.window.showErrorMessage(`\u2717 Switch failed: ${d.reason}`)}catch(d){i.window.showErrorMessage(`AI-Quota: Switch error \u2014 ${String(d)}`)}e.statusBar?.refresh(),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh()})}),n("ai-quota.saveCurrentAccount",async()=>{let a=await i.window.showInputBox({prompt:"Enter the email address for this account",placeHolder:"user@example.com"});if(!a)return;let o=await i.window.showInputBox({prompt:"Label for this account (optional)",placeHolder:"Work / Personal / Project X\u2026"});try{await t.addAccount({email:a,provider:"Antigravity",client:"Antigravity",display_name:o||a,label:o||""}),i.window.showInformationMessage(`AI-Quota: Account "${a}" saved.`),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh()}catch(c){i.window.showErrorMessage(`AI-Quota: Failed to save account \u2014 ${String(c)}`)}}),n("ai-quota.refresh",async()=>{try{await t.sync(),e.statusBar?.refresh(),e.accountsProvider.refresh(),e.providersProvider.refresh(),e.quotaSidebarProvider.refresh()}catch{i.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot refresh.")}}),n("ai-quota.showStatus",async()=>{try{let o=(await t.getAccounts()).map(c=>`${c.label||c.display_name||c.email}: ${c.best_remaining?.toFixed(0)??"?"}% (${c.status})`);i.window.showInformationMessage(o.length?o.join(`
`):"No accounts registered.",{modal:!1})}catch{i.window.showErrorMessage("AI-Quota: Agent offline.")}}),n("ai-quota.showDiagnostics",async()=>{try{let a=await t.getDiagnostics(),o=i.window.createWebviewPanel("ai-quota.diagnostics","AI-Quota Diagnostics",i.ViewColumn.One,{enableScripts:!1});o.webview.html=`<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Diagnostics</h2>
        <pre>${JSON.stringify(a,null,2)}</pre>
      </body></html>`}catch{i.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot fetch diagnostics.")}}),n("ai-quota.signIn",async()=>{i.env.openExternal(i.Uri.parse(`${t.getDashboardUrl()}`)),i.window.showInformationMessage("AI-Quota: Complete sign-in in the dashboard, then refresh.")}),n("ai-quota.signOut",async()=>{i.window.showWarningMessage(`AI-Quota: Sign-out removes the account from the local registry.
Your provider account is unaffected.`,"Continue","Cancel").then(a=>{a==="Continue"&&i.commands.executeCommand("ai-quota.openDashboard")})}),n("ai-quota.reAuth",async()=>{i.env.openExternal(i.Uri.parse(t.getDashboardUrl())),i.window.showInformationMessage("AI-Quota: Re-authenticate via the dashboard.")}),n("ai-quota.showQuotaMatrix",async()=>{let a;try{a=await t.getMatrix()}catch{i.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot load matrix.");return}let o=i.window.createWebviewPanel("ai-quota.matrix","AI-Quota \u2014 Quota Matrix",i.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0});o.webview.html=G(a),o.webview.onDidReceiveMessage(async c=>{if(c.command==="refresh")try{let s=await t.getMatrix();o.webview.postMessage({type:"matrix",data:s})}catch{o.webview.postMessage({type:"error"})}})}),n("ai-quota.addAccount",async()=>{i.env.openExternal(i.Uri.parse(t.getDashboardUrl())),i.window.showInformationMessage("AI-Quota: Add accounts via the dashboard.")})}function G(r){let t=Array.from({length:24},()=>"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random()*62)]).join(""),e=r.windows,n=r.accounts,a=JSON.stringify(r),o=e.map(s=>`<th class="win-th">${s}</th>`).join(""),c=n.map(s=>{let v=s.best_remaining!==null&&s.best_remaining===Math.max(...n.map(S=>S.best_remaining??-1)),d=s.status==="live"?"live":s.status==="stale"?"stale":"off",_=s.label||s.display_name||s.email||`Account ${s.id}`,N=e.map(S=>{let $=s.windows[S];if(!$||$.remaining_pct===null)return'<td class="win-td"><span class="na">\u2014</span></td>';let b=$.remaining_pct,H=b>=60?"hi":b>=30?"mid":b>=15?"lo":"cr",U=b>=60?"#4fa84f":b>=30?"#1a9e5c":b>=15?"#f0a500":"#e53935",E=$.reset_at?new Date($.reset_at).getTime()-Date.now():0,q=E>0?(()=>{let Q=Math.floor(E/36e5),R=Math.floor(E%36e5/6e4);return Q>0?`\u21BA ${Q}h${R}m`:`\u21BA ${R}m`})():"";return`<td class="win-td">
        <div class="pct ${H}">${b.toFixed(0)}%</div>
        <div class="bar-t"><div class="bar-f" style="width:${b}%;background:${U}"></div></div>
        ${q?`<div class="rst">${q}</div>`:""}
      </td>`}).join("");return`<tr class="${v?"best":""}">
      <td class="name-td">
        <div class="nm" title="${s.email??""}">${_}</div>
        <div class="tg">${s.provider} \xB7 ${s.client}</div>
      </td>
      <td><span class="st"><span class="dot ${d}"></span>${s.status}</span></td>
      ${N}
    </tr>`}).join("")||`<tr><td colspan="${e.length+2}" class="empty">No accounts</td></tr>`;return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${t}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI-Quota Matrix</title>
<style>
  :root { --bg:#090a0d; --surf:#0f1115; --fg:#e8eaed; --mu:#9aa0a6; --ac:#1a9e5c; --bd:rgba(255,255,255,.07); --r:6px; }
  *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--fg); font-family:system-ui,'Inter',sans-serif; font-size:12px; padding:20px; }
  h1 { font-size:15px; font-weight:700; color:var(--ac); margin-bottom:4px; }
  .sub { font-size:11px; color:var(--mu); margin-bottom:16px; }

  /* Summary */
  .summary { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
  .stat { background:var(--surf); border:1px solid var(--bd); border-radius:var(--r); padding:8px 12px; }
  .sv { font-size:18px; font-weight:700; font-family:monospace; color:var(--ac); }
  .sl { font-size:10px; color:var(--mu); margin-top:2px; }

  /* Toolbar */
  .toolbar { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
  .chip { padding:3px 10px; border-radius:20px; border:1px solid var(--bd); background:rgba(255,255,255,.03); color:var(--mu); cursor:pointer; font-size:11px; font-weight:500; }
  .chip.active { background:var(--ac); border-color:var(--ac); color:#fff; }
  .refresh-btn { margin-left:auto; padding:4px 12px; background:rgba(26,158,92,.15); border:1px solid var(--ac); border-radius:var(--r); color:var(--ac); font-size:11px; cursor:pointer; }
  .refresh-btn:hover { background:rgba(26,158,92,.25); }

  /* Table */
  .wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; min-width:400px; }
  th { background:rgba(26,158,92,.07); border:1px solid var(--bd); padding:6px 10px; text-align:left; font-size:10px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--mu); white-space:nowrap; }
  td { border:1px solid var(--bd); padding:6px 10px; vertical-align:middle; }
  tr:hover td { background:rgba(255,255,255,.02); }
  tr.best td { background:rgba(26,158,92,.04); }
  tr.best td:first-child { border-left:2px solid var(--ac); }

  /* Name cell */
  .nm { font-weight:500; white-space:nowrap; max-width:160px; overflow:hidden; text-overflow:ellipsis; }
  .tg { font-size:10px; color:var(--mu); font-family:monospace; }

  /* Status */
  .st { display:inline-flex; align-items:center; gap:4px; font-size:10px; }
  .dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .dot.live  { background:#4fa84f; box-shadow:0 0 4px #4fa84f; }
  .dot.stale { background:#f0a500; }
  .dot.off   { background:rgba(255,255,255,.2); }

  /* Window cells */
  .win-th,.win-td { text-align:center; min-width:78px; }
  .pct { font-family:monospace; font-size:12px; font-weight:600; }
  .pct.hi { color:#4fa84f; } .pct.mid { color:var(--ac); }
  .pct.lo  { color:#f0a500; } .pct.cr  { color:#e53935; }
  .na { color:rgba(255,255,255,.2); }
  .bar-t { width:100%; height:3px; background:rgba(255,255,255,.06); border-radius:2px; margin:3px 0; }
  .bar-f { height:3px; border-radius:2px; }
  .rst { font-size:10px; color:var(--mu); }
  .empty { text-align:center; color:var(--mu); padding:24px; }
  .name-td { min-width:150px; }
</style>
</head>
<body>
<h1>AI-Quota \u2014 Quota Matrix</h1>
<p class="sub">All accounts \xD7 all quota windows. Provider truth preserved \u2014 quotas are never mixed across providers.</p>

<div class="summary" id="summary"></div>
<div class="toolbar" id="toolbar">
  <button class="refresh-btn" id="refreshBtn">\u21BB Refresh</button>
</div>
<div class="wrap">
  <table id="matrixTable">
    <thead><tr><th>Account</th><th>Status</th>${o}</tr></thead>
    <tbody>${c}</tbody>
  </table>
</div>

<script nonce="${t}">
  const vscode = acquireVsCodeApi();
  let _data = ${a};
  let _filter = '';

  function fmtRst(iso) {
    if (!iso) return '';
    const d = new Date(iso).getTime() - Date.now();
    if (d <= 0) return '\u21BA soon';
    const h = Math.floor(d/3600000), m = Math.floor((d%3600000)/60000);
    return h > 0 ? \`\u21BA \${h}h\${m}m\` : \`\u21BA \${m}m\`;
  }

  function render(data, filter) {
    const wins = data.windows;
    let accs = filter ? data.accounts.filter(a => a.provider === filter) : data.accounts;
    const bestVal = Math.max(...accs.map(a => a.best_remaining ?? -1));

    // Summary
    const live = accs.filter(a => a.status === 'live').length;
    const avgArr = accs.filter(a => a.best_remaining !== null);
    const avg = avgArr.length ? (avgArr.reduce((s,a) => s + a.best_remaining, 0) / avgArr.length).toFixed(0) : '\u2014';
    const top = accs.find(a => a.best_remaining === bestVal);
    document.getElementById('summary').innerHTML = \`
      <div class="stat"><div class="sv">\${accs.length}</div><div class="sl">Accounts</div></div>
      <div class="stat"><div class="sv" style="color:#4fa84f">\${live}</div><div class="sl">Live</div></div>
      <div class="stat"><div class="sv">\${avg}%</div><div class="sl">Avg quota</div></div>
      <div class="stat"><div class="sv" style="font-size:13px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${top ? (top.label || top.display_name) : '\u2014'}</div><div class="sl">Top account</div></div>\`;

    // Provider chips
    const tb = document.getElementById('toolbar');
    tb.querySelectorAll('.chip').forEach(c => c.remove());
    const refBtn = document.getElementById('refreshBtn');
    ['', ...data.providers].forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (filter === p ? ' active' : '');
      btn.textContent = p || 'All';
      btn.onclick = () => { _filter = p; render(_data, p); };
      tb.insertBefore(btn, refBtn);
    });

    // Table
    const hdr = wins.map(w => \`<th class="win-th">\${w}</th>\`).join('');
    const body = accs.map(acc => {
      const isBest = acc.best_remaining !== null && acc.best_remaining === bestVal && bestVal >= 0;
      const dc = acc.status === 'live' ? 'live' : acc.status === 'stale' ? 'stale' : 'off';
      const nm = acc.label || acc.display_name || acc.email || \`Account \${acc.id}\`;
      const cells = wins.map(w => {
        const win = acc.windows[w];
        if (!win || win.remaining_pct === null) return '<td class="win-td"><span class="na">\u2014</span></td>';
        const p = win.remaining_pct;
        const cls = p >= 60 ? 'hi' : p >= 30 ? 'mid' : p >= 15 ? 'lo' : 'cr';
        const col = p >= 60 ? '#4fa84f' : p >= 30 ? '#1a9e5c' : p >= 15 ? '#f0a500' : '#e53935';
        const rst = fmtRst(win.reset_at);
        return \`<td class="win-td">
          <div class="pct \${cls}">\${p.toFixed(0)}%</div>
          <div class="bar-t"><div class="bar-f" style="width:\${p}%;background:\${col}"></div></div>
          \${rst ? '<div class="rst">'+rst+'</div>' : ''}
        </td>\`;
      }).join('');
      return \`<tr class="\${isBest ? 'best' : ''}">
        <td class="name-td"><div class="nm" title="\${acc.email ?? ''}">\${nm}</div><div class="tg">\${acc.provider} \xB7 \${acc.client}</div></td>
        <td><span class="st"><span class="dot \${dc}"></span>\${acc.status}</span></td>
        \${cells}
      </tr>\`;
    }).join('') || \`<tr><td colspan="\${wins.length + 2}" class="empty">No accounts</td></tr>\`;

    document.getElementById('matrixTable').innerHTML =
      \`<thead><tr><th>Account</th><th>Status</th>\${hdr}</tr></thead><tbody>\${body}</tbody>\`;
  }

  document.getElementById('refreshBtn').onclick = () => vscode.postMessage({ command: 'refresh' });

  window.addEventListener('message', e => {
    if (e.data.type === 'matrix') { _data = e.data.data; render(_data, _filter); }
    if (e.data.type === 'error') { document.getElementById('summary').innerHTML = '<p style="color:#e53935">Agent offline</p>'; }
  });

  // Initial render
  render(_data, _filter);
</script>
</body>
</html>`}var y=null,f=null,g=null;async function Z(r){let t=m.workspace.getConfiguration("ai-quota"),e=t.get("agentUrl","http://127.0.0.1:8765"),n=t.get("pollInterval",30)*1e3;f=new k(e),y=new I(f,r),y.show();let a=new P(r,f),o=new D(f),c=new M(f);r.subscriptions.push(m.window.registerWebviewViewProvider("ai-quota.quotaView",a,{webviewOptions:{retainContextWhenHidden:!0}}),m.window.registerTreeDataProvider("ai-quota.accountsView",o),m.window.registerTreeDataProvider("ai-quota.providersView",c)),L(r,f,{statusBar:y,accountsProvider:o,providersProvider:c,quotaSidebarProvider:a});let s=async()=>{try{await f.sync(),y?.refresh(),o.refresh(),c.refresh(),a.refresh();let v=t.get("notificationThreshold",20);await te(f,v)}catch{y?.setOffline()}};await s(),g=setInterval(s,n),r.subscriptions.push({dispose:()=>g&&clearInterval(g)}),r.subscriptions.push(m.workspace.onDidChangeConfiguration(v=>{if(v.affectsConfiguration("ai-quota.pollInterval")){g&&clearInterval(g);let d=m.workspace.getConfiguration("ai-quota").get("pollInterval",30)*1e3;g=setInterval(s,d)}}))}function ee(){g&&(clearInterval(g),g=null),y?.dispose()}async function te(r,t){try{let e=await r.getAccounts();for(let n of e){let a=n.best_remaining;if(a!=null&&a<=t){let o=`notified_${n.id}_${Math.floor(a/5)*5}`;W.has(o)||(W.add(o),m.window.showWarningMessage(`AI-Quota: ${n.display_name||n.email} quota at ${a.toFixed(0)}%`,"Switch Account","Dismiss").then(s=>{s==="Switch Account"&&m.commands.executeCommand("ai-quota.switchAccount")}))}}}catch{}}var W=new Set;0&&(module.exports={activate,deactivate});
