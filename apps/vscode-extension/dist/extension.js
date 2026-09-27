"use strict";var Q=Object.create;var _=Object.defineProperty;var E=Object.getOwnPropertyDescriptor;var B=Object.getOwnPropertyNames;var R=Object.getPrototypeOf,U=Object.prototype.hasOwnProperty;var N=(i,e)=>{for(var t in e)_(i,t,{get:e[t],enumerable:!0})},S=(i,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of B(e))!U.call(i,n)&&n!==t&&_(i,n,{get:()=>e[n],enumerable:!(o=E(e,n))||o.enumerable});return i};var b=(i,e,t)=>(t=i!=null?Q(R(i)):{},S(e||!i||!i.__esModule?_(t,"default",{value:i,enumerable:!0}):t,i)),O=i=>S(_({},"__esModule",{value:!0}),i);var H={};N(H,{activate:()=>W,deactivate:()=>j});module.exports=O(H);var h=b(require("vscode"));var x=class{constructor(e,t=8e3){this.baseUrl=e.replace(/\/$/,""),this.timeout=t}async fetch(e,t){let o=`${this.baseUrl}${e}`,n=new AbortController,a=setTimeout(()=>n.abort(),this.timeout);try{let d=await globalThis.fetch(o,{...t,signal:n.signal,headers:{"Content-Type":"application/json",Accept:"application/json",...t?.headers}});if(!d.ok)throw new Error(`HTTP ${d.status} from ${e}`);return await d.json()}finally{clearTimeout(a)}}async isAgentRunning(){try{return await this.fetch("/api/v1/health"),!0}catch{return!1}}async getAccounts(){return this.fetch("/api/v1/accounts")}async getProviders(){return this.fetch("/api/v1/providers")}async sync(){return this.fetch("/api/v1/sync",{method:"POST"})}async switchAccount(e,t=!1){return this.fetch(`/api/v1/accounts/${e}/switch?force=${t}`,{method:"POST"})}async refreshAccount(e){return this.fetch(`/api/v1/accounts/${e}/refresh`,{method:"POST"})}async getDiagnostics(){return this.fetch("/api/v1/diagnostics")}async getSettings(){return this.fetch("/api/v1/settings")}async updateSettings(e){return this.fetch("/api/v1/settings",{method:"PUT",body:JSON.stringify(e)})}async addAccount(e){return this.fetch("/api/v1/accounts",{method:"POST",body:JSON.stringify(e)})}async deleteAccount(e){await this.fetch(`/api/v1/accounts/${e}`,{method:"DELETE"})}getDashboardUrl(){return`${this.baseUrl}/`}};var v=b(require("vscode")),A=class{constructor(e,t){this._disposed=!1;this.client=e,this.item=v.window.createStatusBarItem(v.StatusBarAlignment.Right,100),this.item.command="ai-quota.switchAccount",this.item.tooltip="AI-Quota \u2014 click to switch account",t.subscriptions.push(this.item)}show(){this.item.text="$(sync~spin) AI-Quota",this.item.show()}async refresh(){if(!this._disposed)try{let e=await this.client.getAccounts(),t=this._bestAccount(e);if(!t){this.item.text="$(account) AI-Quota",this.item.tooltip="AI-Quota \u2014 no accounts registered",this.item.backgroundColor=void 0;return}let o=t.best_remaining??0,n=this._nextReset(t),a=t.label||t.display_name||t.email,d=o>50?"$(pulse)":o>20?"$(warning)":"$(error)";this.item.text=`${d} ${o.toFixed(0)}%${n?` \xB7 ${n}`:""}`,this.item.tooltip=`AI-Quota: ${a} \u2014 ${o.toFixed(1)}% remaining
${n?`Resets in: ${n}`:""}`,o<=10?this.item.backgroundColor=new v.ThemeColor("statusBarItem.errorBackground"):o<=20?this.item.backgroundColor=new v.ThemeColor("statusBarItem.warningBackground"):this.item.backgroundColor=void 0}catch{this.setOffline()}}setOffline(){this._disposed||(this.item.text="$(circle-slash) AI-Quota",this.item.tooltip="AI-Quota agent offline \u2014 start with: python -m app.main",this.item.backgroundColor=void 0)}dispose(){this._disposed=!0,this.item.dispose()}_bestAccount(e){let t=e.filter(o=>o.status==="live"&&o.best_remaining!==null&&o.best_remaining!==void 0);return t.length?t.reduce((o,n)=>(n.best_remaining??0)>(o.best_remaining??0)?n:o):e[0]??null}_nextReset(e){let t=e.snapshots.map(c=>c.reset_at).filter(c=>!!c).map(c=>new Date(c).getTime()).filter(c=>!isNaN(c)&&c>Date.now());if(!t.length)return"";let o=Math.min(...t),n=Math.max(0,o-Date.now()),a=Math.floor(n/36e5),d=Math.floor(n%36e5/6e4);return a>0?`${a}h${d}m`:`${d}m`}};var f=b(require("vscode")),I=class{constructor(e,t){this._context=e,this._client=t}resolveWebviewView(e,t,o){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[f.Uri.joinPath(this._context.extensionUri,"media"),f.Uri.joinPath(this._context.extensionUri,"dist")]},e.webview.html=this._getHtml(e.webview),e.webview.onDidReceiveMessage(async n=>{switch(n.command){case"switch":await f.commands.executeCommand("ai-quota.switchAccount");break;case"refresh":await this.refresh();break;case"openDashboard":await f.commands.executeCommand("ai-quota.openDashboard");break;case"showMatrix":await f.commands.executeCommand("ai-quota.showQuotaMatrix");break}}),this.refresh()}async refresh(){if(this._view)try{let e=await this._client.getAccounts();this._view.webview.postMessage({type:"accounts",data:e})}catch{this._view.webview.postMessage({type:"error",message:"Agent offline"})}}_getHtml(e){let t=z();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${t}';">
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
    <button class="btn-icon" id="refreshBtn" title="Refresh">\u21BB</button>
  </div>
  <div class="actions">
    <button class="btn-sm" id="dashboardBtn">Dashboard</button>
    <button class="btn-sm" id="matrixBtn">Matrix</button>
  </div>
  <div id="content">
    <div class="empty-state">Loading...</div>
  </div>
  <script nonce="${t}">
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
            <div class="provider-tag">\${acc.provider} \xB7 \${acc.client}</div>
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
          '<div class="offline-banner">\u26A0 AI-Quota agent offline<br><small>Start: python -m app.main</small></div>';
      }
    });
  </script>
</body>
</html>`}};function z(){let i="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)i+=e.charAt(Math.floor(Math.random()*e.length));return i}var l=b(require("vscode")),$=class extends l.TreeItem{constructor(t,o){let n=t.label||t.display_name||t.email;super(n,o);this.account=t;this.collapsibleState=o;let a=t.best_remaining;this.description=a!=null?`${a.toFixed(0)}% \xB7 ${t.status}`:t.status,this.tooltip=[`Email: ${t.email}`,`Provider: ${t.provider}`,`Client: ${t.client}`,a!=null?`Quota: ${a.toFixed(1)}%`:""].filter(Boolean).join(`
`),this.iconPath=this._icon(t.status,a),this.contextValue="account",this.command={command:"ai-quota.switchAccount",title:"Switch",arguments:[]}}_icon(t,o){return t==="live"?o!=null&&o<=10?new l.ThemeIcon("error"):o!=null&&o<=20?new l.ThemeIcon("warning"):new l.ThemeIcon("circle-filled"):t==="stale"?new l.ThemeIcon("clock"):new l.ThemeIcon("circle-outline")}},k=class extends l.TreeItem{constructor(e){let t=e.remaining_percent?.toFixed(0)??"?";super(`${e.window_name}: ${t}%`,l.TreeItemCollapsibleState.None),this.description=e.reset_at?`Resets ${new Date(e.reset_at).toLocaleTimeString()}`:"",this.iconPath=new l.ThemeIcon("graph"),this.contextValue="snapshot"}},C=class{constructor(e){this.client=e;this._onDidChangeTreeData=new l.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._accounts=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._accounts=await this.client.getAccounts()}catch{this._accounts=[]}}getTreeItem(e){return e}async getChildren(e){return e?e instanceof $?e.account.snapshots.map(t=>new k(t)):[]:(this._accounts.length||await this._load(),this._accounts.map(t=>new $(t,t.snapshots?.length?l.TreeItemCollapsibleState.Collapsed:l.TreeItemCollapsibleState.None)))}};var u=b(require("vscode")),D=class extends u.TreeItem{constructor(t){super(t.display_name,u.TreeItemCollapsibleState.Collapsed);this.provider=t;let o=t.detected;this.description=o?"\u25CF detected":"\u25CB not running",this.tooltip=[`ID: ${t.id}`,`Detected: ${o?"Yes":"No"}`,t.hub_url?`Hub: ${t.hub_url}`:"",`Switching: ${t.capabilities?.switching?t.capabilities.switch_method:"not supported"}`,`Truth: ${t.truth?.authority_type??"unknown"}`].filter(Boolean).join(`
`),this.iconPath=o?new u.ThemeIcon("plug",new u.ThemeColor("charts.green")):new u.ThemeIcon("plug"),this.contextValue="provider"}},m=class extends u.TreeItem{constructor(e,t){let o=typeof t=="boolean"?t?"\u2713":"\u2717":t;super(`${e}: ${o}`,u.TreeItemCollapsibleState.None),this.iconPath=new u.ThemeIcon(typeof t=="boolean"?t?"check":"close":"info"),this.contextValue="capability"}},T=class{constructor(e){this.client=e;this._onDidChangeTreeData=new u.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._providers=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._providers=await this.client.getProviders()}catch{this._providers=[]}}getTreeItem(e){return e}async getChildren(e){if(!e)return this._providers.length||await this._load(),[...this._providers].sort((t,o)=>Number(o.detected)-Number(t.detected)).map(t=>new D(t));if(e instanceof D){let t=e.provider,o=t.capabilities??{};return[new m("Quota",o.quota??!1),new m("Detection",o.detection??!1),new m("Switching",o.switching??!1),new m("Instant Switch",o.instant_switch??!1),new m("Method",o.switch_method??"n/a"),new m("Hub URL",t.hub_url??"\u2014"),new m("Authority",t.truth?.authority_type??"unknown")]}return[]}};var s=b(require("vscode"));function q(i,e,t){let o=(n,a)=>i.subscriptions.push(s.commands.registerCommand(n,a));o("ai-quota.openDashboard",()=>{s.env.openExternal(s.Uri.parse(e.getDashboardUrl()))}),o("ai-quota.switchAccount",async()=>{let n;try{n=await e.getAccounts()}catch{s.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot switch account.");return}if(!n.length){s.window.showInformationMessage("AI-Quota: No accounts registered.");return}let d=[...n].sort((r,P)=>r.status==="live"&&P.status!=="live"?-1:P.status==="live"&&r.status!=="live"?1:(P.best_remaining??0)-(r.best_remaining??0)).map(r=>({label:r.label||r.display_name||r.email,description:`${r.provider} \xB7 ${r.best_remaining?.toFixed(0)??"?"}% remaining`,detail:`Status: ${r.status} | Client: ${r.client}`,accountId:r.id})),c=await s.window.showQuickPick(d,{title:"AI-Quota: Switch Account",placeHolder:"Select account to switch to\u2026",matchOnDescription:!0});!c||await s.window.showWarningMessage(`Switch to "${c.label}"?`,{modal:!0},"Switch")!=="Switch"||await s.window.withProgress({location:s.ProgressLocation.Notification,title:"AI-Quota: Switching account\u2026",cancellable:!1},async()=>{try{let r=await e.switchAccount(c.accountId);r.status==="success"&&r.verified?s.window.showInformationMessage(`\u2713 Switched to ${c.label} (verified via ${r.method_used})`):r.status==="verification_failed"?s.window.showWarningMessage(`\u26A0 Switch attempted but not verified \u2014 active account may differ. Reason: ${r.reason}`):s.window.showErrorMessage(`\u2717 Switch failed: ${r.reason}`)}catch(r){s.window.showErrorMessage(`AI-Quota: Switch error \u2014 ${String(r)}`)}t.statusBar?.refresh(),t.accountsProvider.refresh(),t.quotaSidebarProvider.refresh()})}),o("ai-quota.saveCurrentAccount",async()=>{let n=await s.window.showInputBox({prompt:"Enter the email address for this account",placeHolder:"user@example.com"});if(!n)return;let a=await s.window.showInputBox({prompt:"Label for this account (optional)",placeHolder:"Work / Personal / Project X\u2026"});try{await e.addAccount({email:n,provider:"Antigravity",client:"Antigravity",display_name:a||n,label:a||""}),s.window.showInformationMessage(`AI-Quota: Account "${n}" saved.`),t.accountsProvider.refresh(),t.quotaSidebarProvider.refresh()}catch(d){s.window.showErrorMessage(`AI-Quota: Failed to save account \u2014 ${String(d)}`)}}),o("ai-quota.refresh",async()=>{try{await e.sync(),t.statusBar?.refresh(),t.accountsProvider.refresh(),t.providersProvider.refresh(),t.quotaSidebarProvider.refresh()}catch{s.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot refresh.")}}),o("ai-quota.showStatus",async()=>{try{let a=(await e.getAccounts()).map(d=>`${d.label||d.display_name||d.email}: ${d.best_remaining?.toFixed(0)??"?"}% (${d.status})`);s.window.showInformationMessage(a.length?a.join(`
`):"No accounts registered.",{modal:!1})}catch{s.window.showErrorMessage("AI-Quota: Agent offline.")}}),o("ai-quota.showDiagnostics",async()=>{try{let n=await e.getDiagnostics(),a=s.window.createWebviewPanel("ai-quota.diagnostics","AI-Quota Diagnostics",s.ViewColumn.One,{enableScripts:!1});a.webview.html=`<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Diagnostics</h2>
        <pre>${JSON.stringify(n,null,2)}</pre>
      </body></html>`}catch{s.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot fetch diagnostics.")}}),o("ai-quota.signIn",async()=>{s.env.openExternal(s.Uri.parse(`${e.getDashboardUrl()}`)),s.window.showInformationMessage("AI-Quota: Complete sign-in in the dashboard, then refresh.")}),o("ai-quota.signOut",async()=>{s.window.showWarningMessage(`AI-Quota: Sign-out removes the account from the local registry.
Your provider account is unaffected.`,"Continue","Cancel").then(n=>{n==="Continue"&&s.commands.executeCommand("ai-quota.openDashboard")})}),o("ai-quota.reAuth",async()=>{s.env.openExternal(s.Uri.parse(e.getDashboardUrl())),s.window.showInformationMessage("AI-Quota: Re-authenticate via the dashboard.")}),o("ai-quota.showQuotaMatrix",async()=>{try{let n=await e.getAccounts(),a=s.window.createWebviewPanel("ai-quota.matrix","AI-Quota \u2014 Account Matrix",s.ViewColumn.One,{enableScripts:!1}),d=n.map(c=>{let w=c.snapshots.map(r=>`<td>${r.window_name}</td><td>${r.remaining_percent?.toFixed(0)??"?"}%</td><td>${r.reset_at??"\u2014"}</td>`).join("");return`<tr><td>${c.label||c.display_name||c.email}</td><td>${c.provider}</td><td>${c.status}</td>${w}</tr>`}).join("");a.webview.html=`<!DOCTYPE html><html><body style="font-family:system-ui;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Matrix</h2>
        <table border="1" style="border-collapse:collapse;width:100%;font-size:12px">
          <tr style="background:#1a9e5c22"><th>Account</th><th>Provider</th><th>Status</th><th colspan="3">Quota Windows</th></tr>
          ${d||"<tr><td colspan='6'>No accounts</td></tr>"}
        </table>
      </body></html>`}catch{s.window.showErrorMessage("AI-Quota: Agent offline.")}}),o("ai-quota.addAccount",async()=>{s.env.openExternal(s.Uri.parse(e.getDashboardUrl())),s.window.showInformationMessage("AI-Quota: Add accounts via the dashboard.")})}var y=null,p=null,g=null;async function W(i){let e=h.workspace.getConfiguration("ai-quota"),t=e.get("agentUrl","http://127.0.0.1:8765"),o=e.get("pollInterval",30)*1e3;p=new x(t),y=new A(p,i),y.show();let n=new I(i,p),a=new C(p),d=new T(p);i.subscriptions.push(h.window.registerWebviewViewProvider("ai-quota.quotaView",n,{webviewOptions:{retainContextWhenHidden:!0}}),h.window.registerTreeDataProvider("ai-quota.accountsView",a),h.window.registerTreeDataProvider("ai-quota.providersView",d)),q(i,p,{statusBar:y,accountsProvider:a,providersProvider:d,quotaSidebarProvider:n});let c=async()=>{try{await p.sync(),y?.refresh(),a.refresh(),d.refresh(),n.refresh();let w=e.get("notificationThreshold",20);await F(p,w)}catch{y?.setOffline()}};await c(),g=setInterval(c,o),i.subscriptions.push({dispose:()=>g&&clearInterval(g)}),i.subscriptions.push(h.workspace.onDidChangeConfiguration(w=>{if(w.affectsConfiguration("ai-quota.pollInterval")){g&&clearInterval(g);let r=h.workspace.getConfiguration("ai-quota").get("pollInterval",30)*1e3;g=setInterval(c,r)}}))}function j(){g&&(clearInterval(g),g=null),y?.dispose()}async function F(i,e){try{let t=await i.getAccounts();for(let o of t){let n=o.best_remaining;if(n!=null&&n<=e){let a=`notified_${o.id}_${Math.floor(n/5)*5}`;M.has(a)||(M.add(a),h.window.showWarningMessage(`AI-Quota: ${o.display_name||o.email} quota at ${n.toFixed(0)}%`,"Switch Account","Dismiss").then(c=>{c==="Switch Account"&&h.commands.executeCommand("ai-quota.switchAccount")}))}}}catch{}}var M=new Set;0&&(module.exports={activate,deactivate});
