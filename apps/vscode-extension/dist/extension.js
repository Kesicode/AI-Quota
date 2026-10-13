"use strict";var q=Object.create;var x=Object.defineProperty;var B=Object.getOwnPropertyDescriptor;var Q=Object.getOwnPropertyNames;var R=Object.getPrototypeOf,W=Object.prototype.hasOwnProperty;var L=(a,t)=>{for(var e in t)x(a,e,{get:t[e],enumerable:!0})},S=(a,t,e,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of Q(t))!W.call(a,n)&&n!==e&&x(a,n,{get:()=>t[n],enumerable:!(o=B(t,n))||o.enumerable});return a};var w=(a,t,e)=>(e=a!=null?q(R(a)):{},S(t||!a||!a.__esModule?x(e,"default",{value:a,enumerable:!0}):e,a)),N=a=>S(x({},"__esModule",{value:!0}),a);var F={};L(F,{activate:()=>z,deactivate:()=>H});module.exports=N(F);var m=w(require("vscode"));var _=class{constructor(t,e=8e3){this.baseUrl=t.replace(/\/$/,""),this.timeout=e}async fetch(t,e){let o=`${this.baseUrl}${t}`,n=new AbortController,i=setTimeout(()=>n.abort(),this.timeout);try{let c=await globalThis.fetch(o,{...e,signal:n.signal,headers:{"Content-Type":"application/json",Accept:"application/json",...e?.headers}});if(!c.ok)throw new Error(`HTTP ${c.status} from ${t}`);return await c.json()}finally{clearTimeout(i)}}async isAgentRunning(){try{return await this.fetch("/api/v1/health"),!0}catch{return!1}}async getAccounts(){return this.fetch("/api/v1/accounts")}async getProviders(){return this.fetch("/api/v1/providers")}async sync(){return this.fetch("/api/v1/sync",{method:"POST"})}async switchAccount(t,e=!1){return this.fetch(`/api/v1/accounts/${t}/switch?force=${e}`,{method:"POST"})}async refreshAccount(t){return this.fetch(`/api/v1/accounts/${t}/refresh`,{method:"POST"})}async getDiagnostics(){return this.fetch("/api/v1/diagnostics")}async getSettings(){return this.fetch("/api/v1/settings")}async updateSettings(t){return this.fetch("/api/v1/settings",{method:"PUT",body:JSON.stringify(t)})}async addAccount(t){return this.fetch("/api/v1/accounts",{method:"POST",body:JSON.stringify(t)})}async deleteAccount(t){await this.fetch(`/api/v1/accounts/${t}`,{method:"DELETE"})}getDashboardUrl(){return`${this.baseUrl}/`}async getPredictions(t="24h"){return this.fetch(`/api/v1/predictions?period=${t}`)}async updateAccountLabel(t,e){return this.fetch(`/api/v1/accounts/${t}/label`,{method:"PATCH",body:JSON.stringify(e)})}async getWebhookConfig(){return this.fetch("/api/v1/webhooks/config")}async updateWebhookConfig(t){return this.fetch("/api/v1/webhooks/config",{method:"PUT",body:JSON.stringify(t)})}async testWebhook(){return this.fetch("/api/v1/webhooks/test",{method:"POST"})}};var f=w(require("vscode")),A=class{constructor(t,e){this._disposed=!1;this.client=t,this.item=f.window.createStatusBarItem(f.StatusBarAlignment.Right,100),this.item.command="ai-quota.switchAccount",this.item.tooltip="AI-Quota \u2014 click to switch account",e.subscriptions.push(this.item)}show(){this.item.text="$(sync~spin) AI-Quota",this.item.show()}async refresh(){if(!this._disposed)try{let t=await this.client.getAccounts(),e=this._bestAccount(t);if(!e){this.item.text="$(account) AI-Quota",this.item.tooltip="AI-Quota \u2014 no accounts registered",this.item.backgroundColor=void 0;return}let o=e.best_remaining??0,n=this._nextReset(e),i=e.label||e.display_name||e.email,c=o>50?"$(pulse)":o>20?"$(warning)":"$(error)";this.item.text=`${c} ${o.toFixed(0)}%${n?` \xB7 ${n}`:""}`,this.item.tooltip=`AI-Quota: ${i} \u2014 ${o.toFixed(1)}% remaining
${n?`Resets in: ${n}`:""}`,o<=10?this.item.backgroundColor=new f.ThemeColor("statusBarItem.errorBackground"):o<=20?this.item.backgroundColor=new f.ThemeColor("statusBarItem.warningBackground"):this.item.backgroundColor=void 0}catch{this.setOffline()}}setOffline(){this._disposed||(this.item.text="$(circle-slash) AI-Quota",this.item.tooltip="AI-Quota agent offline \u2014 start with: python -m app.main",this.item.backgroundColor=void 0)}dispose(){this._disposed=!0,this.item.dispose()}_bestAccount(t){let e=t.filter(o=>o.status==="live"&&o.best_remaining!==null&&o.best_remaining!==void 0);return e.length?e.reduce((o,n)=>(n.best_remaining??0)>(o.best_remaining??0)?n:o):t[0]??null}_nextReset(t){let e=t.snapshots.map(s=>s.reset_at).filter(s=>!!s).map(s=>new Date(s).getTime()).filter(s=>!isNaN(s)&&s>Date.now());if(!e.length)return"";let o=Math.min(...e),n=Math.max(0,o-Date.now()),i=Math.floor(n/36e5),c=Math.floor(n%36e5/6e4);return i>0?`${i}h${c}m`:`${c}m`}};var p=w(require("vscode")),k=class{constructor(t,e){this._context=t,this._client=e}resolveWebviewView(t,e,o){this._view=t,t.webview.options={enableScripts:!0,localResourceRoots:[p.Uri.joinPath(this._context.extensionUri,"media"),p.Uri.joinPath(this._context.extensionUri,"dist")]},t.webview.html=this._getHtml(t.webview),t.webview.onDidReceiveMessage(async n=>{switch(n.command){case"switch":await p.commands.executeCommand("ai-quota.switchAccount");break;case"switchTo":if(n.accountId)try{await this._client.switchAccount(Number(n.accountId)),await this.refresh(),p.window.showInformationMessage("AI-Quota: Account switched.")}catch(i){p.window.showErrorMessage(`Switch failed: ${i instanceof Error?i.message:String(i)}`)}break;case"refresh":await this.refresh();break;case"openDashboard":await p.commands.executeCommand("ai-quota.openDashboard");break;case"showMatrix":await p.commands.executeCommand("ai-quota.showQuotaMatrix");break;case"saveLabel":{let{accountId:i,label:c,notes:s,color:v}=n;if(i)try{await this._client.updateAccountLabel(Number(i),{label:c||void 0,notes:s||void 0,color:v||void 0}),await this.refresh()}catch{}break}case"testWebhook":{try{let i=await this._client.testWebhook();i.ok?p.window.showInformationMessage(`Webhook test: HTTP ${i.http_status} \u2014 OK`):p.window.showWarningMessage(`Webhook test failed: ${i.error}`)}catch(i){p.window.showErrorMessage(`Webhook test error: ${i instanceof Error?i.message:String(i)}`)}break}}}),this.refresh()}async refresh(){if(this._view)try{let[t,e]=await Promise.all([this._client.getAccounts(),this._client.getPredictions("24h").catch(()=>null)]),o=new Map;if(e)for(let i of e.predictions)o.set(i.account_id,i);let n=t.map(i=>({...i,prediction:o.get(i.id)??null}));this._view.webview.postMessage({type:"accounts",data:n,recommendation:e?{id:e.best_account_id,reason:e.reason}:null})}catch{this._view.webview.postMessage({type:"error",message:"Agent offline"})}}_getHtml(t){let e=U();return`<!DOCTYPE html>
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
</html>`}};function U(){let a="",t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let e=0;e<32;e++)a+=t.charAt(Math.floor(Math.random()*t.length));return a}var l=w(require("vscode")),$=class extends l.TreeItem{constructor(e,o){let n=e.label||e.display_name||e.email;super(n,o);this.account=e;this.collapsibleState=o;let i=e.best_remaining;this.description=i!=null?`${i.toFixed(0)}% \xB7 ${e.status}`:e.status,this.tooltip=[`Email: ${e.email}`,`Provider: ${e.provider}`,`Client: ${e.client}`,i!=null?`Quota: ${i.toFixed(1)}%`:""].filter(Boolean).join(`
`),this.iconPath=this._icon(e.status,i),this.contextValue="account",this.command={command:"ai-quota.switchAccount",title:"Switch",arguments:[]}}_icon(e,o){return e==="live"?o!=null&&o<=10?new l.ThemeIcon("error"):o!=null&&o<=20?new l.ThemeIcon("warning"):new l.ThemeIcon("circle-filled"):e==="stale"?new l.ThemeIcon("clock"):new l.ThemeIcon("circle-outline")}},D=class extends l.TreeItem{constructor(t){let e=t.remaining_percent?.toFixed(0)??"?";super(`${t.window_name}: ${e}%`,l.TreeItemCollapsibleState.None),this.description=t.reset_at?`Resets ${new Date(t.reset_at).toLocaleTimeString()}`:"",this.iconPath=new l.ThemeIcon("graph"),this.contextValue="snapshot"}},I=class{constructor(t){this.client=t;this._onDidChangeTreeData=new l.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._accounts=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._accounts=await this.client.getAccounts()}catch{this._accounts=[]}}getTreeItem(t){return t}async getChildren(t){return t?t instanceof $?t.account.snapshots.map(e=>new D(e)):[]:(this._accounts.length||await this._load(),this._accounts.map(e=>new $(e,e.snapshots?.length?l.TreeItemCollapsibleState.Collapsed:l.TreeItemCollapsibleState.None)))}};var u=w(require("vscode")),P=class extends u.TreeItem{constructor(e){super(e.display_name,u.TreeItemCollapsibleState.Collapsed);this.provider=e;let o=e.detected;this.description=o?"\u25CF detected":"\u25CB not running",this.tooltip=[`ID: ${e.id}`,`Detected: ${o?"Yes":"No"}`,e.hub_url?`Hub: ${e.hub_url}`:"",`Switching: ${e.capabilities?.switching?e.capabilities.switch_method:"not supported"}`,`Truth: ${e.truth?.authority_type??"unknown"}`].filter(Boolean).join(`
`),this.iconPath=o?new u.ThemeIcon("plug",new u.ThemeColor("charts.green")):new u.ThemeIcon("plug"),this.contextValue="provider"}},h=class extends u.TreeItem{constructor(t,e){let o=typeof e=="boolean"?e?"\u2713":"\u2717":e;super(`${t}: ${o}`,u.TreeItemCollapsibleState.None),this.iconPath=new u.ThemeIcon(typeof e=="boolean"?e?"check":"close":"info"),this.contextValue="capability"}},T=class{constructor(t){this.client=t;this._onDidChangeTreeData=new u.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._providers=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._providers=await this.client.getProviders()}catch{this._providers=[]}}getTreeItem(t){return t}async getChildren(t){if(!t)return this._providers.length||await this._load(),[...this._providers].sort((e,o)=>Number(o.detected)-Number(e.detected)).map(e=>new P(e));if(t instanceof P){let e=t.provider,o=e.capabilities??{};return[new h("Quota",o.quota??!1),new h("Detection",o.detection??!1),new h("Switching",o.switching??!1),new h("Instant Switch",o.instant_switch??!1),new h("Method",o.switch_method??"n/a"),new h("Hub URL",e.hub_url??"\u2014"),new h("Authority",e.truth?.authority_type??"unknown")]}return[]}};var r=w(require("vscode"));function E(a,t,e){let o=(n,i)=>a.subscriptions.push(r.commands.registerCommand(n,i));o("ai-quota.openDashboard",()=>{r.env.openExternal(r.Uri.parse(t.getDashboardUrl()))}),o("ai-quota.switchAccount",async()=>{let n;try{n=await t.getAccounts()}catch{r.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot switch account.");return}if(!n.length){r.window.showInformationMessage("AI-Quota: No accounts registered.");return}let c=[...n].sort((d,C)=>d.status==="live"&&C.status!=="live"?-1:C.status==="live"&&d.status!=="live"?1:(C.best_remaining??0)-(d.best_remaining??0)).map(d=>({label:d.label||d.display_name||d.email,description:`${d.provider} \xB7 ${d.best_remaining?.toFixed(0)??"?"}% remaining`,detail:`Status: ${d.status} | Client: ${d.client}`,accountId:d.id})),s=await r.window.showQuickPick(c,{title:"AI-Quota: Switch Account",placeHolder:"Select account to switch to\u2026",matchOnDescription:!0});!s||await r.window.showWarningMessage(`Switch to "${s.label}"?`,{modal:!0},"Switch")!=="Switch"||await r.window.withProgress({location:r.ProgressLocation.Notification,title:"AI-Quota: Switching account\u2026",cancellable:!1},async()=>{try{let d=await t.switchAccount(s.accountId);d.status==="success"&&d.verified?r.window.showInformationMessage(`\u2713 Switched to ${s.label} (verified via ${d.method_used})`):d.status==="verification_failed"?r.window.showWarningMessage(`\u26A0 Switch attempted but not verified \u2014 active account may differ. Reason: ${d.reason}`):r.window.showErrorMessage(`\u2717 Switch failed: ${d.reason}`)}catch(d){r.window.showErrorMessage(`AI-Quota: Switch error \u2014 ${String(d)}`)}e.statusBar?.refresh(),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh()})}),o("ai-quota.saveCurrentAccount",async()=>{let n=await r.window.showInputBox({prompt:"Enter the email address for this account",placeHolder:"user@example.com"});if(!n)return;let i=await r.window.showInputBox({prompt:"Label for this account (optional)",placeHolder:"Work / Personal / Project X\u2026"});try{await t.addAccount({email:n,provider:"Antigravity",client:"Antigravity",display_name:i||n,label:i||""}),r.window.showInformationMessage(`AI-Quota: Account "${n}" saved.`),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh()}catch(c){r.window.showErrorMessage(`AI-Quota: Failed to save account \u2014 ${String(c)}`)}}),o("ai-quota.refresh",async()=>{try{await t.sync(),e.statusBar?.refresh(),e.accountsProvider.refresh(),e.providersProvider.refresh(),e.quotaSidebarProvider.refresh()}catch{r.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot refresh.")}}),o("ai-quota.showStatus",async()=>{try{let i=(await t.getAccounts()).map(c=>`${c.label||c.display_name||c.email}: ${c.best_remaining?.toFixed(0)??"?"}% (${c.status})`);r.window.showInformationMessage(i.length?i.join(`
`):"No accounts registered.",{modal:!1})}catch{r.window.showErrorMessage("AI-Quota: Agent offline.")}}),o("ai-quota.showDiagnostics",async()=>{try{let n=await t.getDiagnostics(),i=r.window.createWebviewPanel("ai-quota.diagnostics","AI-Quota Diagnostics",r.ViewColumn.One,{enableScripts:!1});i.webview.html=`<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Diagnostics</h2>
        <pre>${JSON.stringify(n,null,2)}</pre>
      </body></html>`}catch{r.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot fetch diagnostics.")}}),o("ai-quota.signIn",async()=>{r.env.openExternal(r.Uri.parse(`${t.getDashboardUrl()}`)),r.window.showInformationMessage("AI-Quota: Complete sign-in in the dashboard, then refresh.")}),o("ai-quota.signOut",async()=>{r.window.showWarningMessage(`AI-Quota: Sign-out removes the account from the local registry.
Your provider account is unaffected.`,"Continue","Cancel").then(n=>{n==="Continue"&&r.commands.executeCommand("ai-quota.openDashboard")})}),o("ai-quota.reAuth",async()=>{r.env.openExternal(r.Uri.parse(t.getDashboardUrl())),r.window.showInformationMessage("AI-Quota: Re-authenticate via the dashboard.")}),o("ai-quota.showQuotaMatrix",async()=>{try{let n=await t.getAccounts(),i=r.window.createWebviewPanel("ai-quota.matrix","AI-Quota \u2014 Account Matrix",r.ViewColumn.One,{enableScripts:!1}),c=n.map(s=>{let v=s.snapshots.map(d=>`<td>${d.window_name}</td><td>${d.remaining_percent?.toFixed(0)??"?"}%</td><td>${d.reset_at??"\u2014"}</td>`).join("");return`<tr><td>${s.label||s.display_name||s.email}</td><td>${s.provider}</td><td>${s.status}</td>${v}</tr>`}).join("");i.webview.html=`<!DOCTYPE html><html><body style="font-family:system-ui;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Matrix</h2>
        <table border="1" style="border-collapse:collapse;width:100%;font-size:12px">
          <tr style="background:#1a9e5c22"><th>Account</th><th>Provider</th><th>Status</th><th colspan="3">Quota Windows</th></tr>
          ${c||"<tr><td colspan='6'>No accounts</td></tr>"}
        </table>
      </body></html>`}catch{r.window.showErrorMessage("AI-Quota: Agent offline.")}}),o("ai-quota.addAccount",async()=>{r.env.openExternal(r.Uri.parse(t.getDashboardUrl())),r.window.showInformationMessage("AI-Quota: Add accounts via the dashboard.")})}var y=null,b=null,g=null;async function z(a){let t=m.workspace.getConfiguration("ai-quota"),e=t.get("agentUrl","http://127.0.0.1:8765"),o=t.get("pollInterval",30)*1e3;b=new _(e),y=new A(b,a),y.show();let n=new k(a,b),i=new I(b),c=new T(b);a.subscriptions.push(m.window.registerWebviewViewProvider("ai-quota.quotaView",n,{webviewOptions:{retainContextWhenHidden:!0}}),m.window.registerTreeDataProvider("ai-quota.accountsView",i),m.window.registerTreeDataProvider("ai-quota.providersView",c)),E(a,b,{statusBar:y,accountsProvider:i,providersProvider:c,quotaSidebarProvider:n});let s=async()=>{try{await b.sync(),y?.refresh(),i.refresh(),c.refresh(),n.refresh();let v=t.get("notificationThreshold",20);await O(b,v)}catch{y?.setOffline()}};await s(),g=setInterval(s,o),a.subscriptions.push({dispose:()=>g&&clearInterval(g)}),a.subscriptions.push(m.workspace.onDidChangeConfiguration(v=>{if(v.affectsConfiguration("ai-quota.pollInterval")){g&&clearInterval(g);let d=m.workspace.getConfiguration("ai-quota").get("pollInterval",30)*1e3;g=setInterval(s,d)}}))}function H(){g&&(clearInterval(g),g=null),y?.dispose()}async function O(a,t){try{let e=await a.getAccounts();for(let o of e){let n=o.best_remaining;if(n!=null&&n<=t){let i=`notified_${o.id}_${Math.floor(n/5)*5}`;M.has(i)||(M.add(i),m.window.showWarningMessage(`AI-Quota: ${o.display_name||o.email} quota at ${n.toFixed(0)}%`,"Switch Account","Dismiss").then(s=>{s==="Switch Account"&&m.commands.executeCommand("ai-quota.switchAccount")}))}}}catch{}}var M=new Set;0&&(module.exports={activate,deactivate});
