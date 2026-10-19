"use strict";var ee=Object.create;var E=Object.defineProperty;var te=Object.getOwnPropertyDescriptor;var ae=Object.getOwnPropertyNames;var oe=Object.getPrototypeOf,ne=Object.prototype.hasOwnProperty;var se=(l,t)=>{for(var e in t)E(l,e,{get:t[e],enumerable:!0})},J=(l,t,e,s)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of ae(t))!ne.call(l,n)&&n!==e&&E(l,n,{get:()=>t[n],enumerable:!(s=te(t,n))||s.enumerable});return l};var C=(l,t,e)=>(e=l!=null?ee(oe(l)):{},J(t||!l||!l.__esModule?E(e,"default",{value:l,enumerable:!0}):e,l)),re=l=>J(E({},"__esModule",{value:!0}),l);var me={};se(me,{activate:()=>le,deactivate:()=>ue});module.exports=re(me);var b=C(require("vscode"));var q=class{constructor(t,e=8e3){this.baseUrl=t.replace(/\/$/,""),this.timeout=e}async fetch(t,e){let s=`${this.baseUrl}${t}`,n=new AbortController,a=setTimeout(()=>n.abort(),this.timeout);try{let r=await globalThis.fetch(s,{...e,signal:n.signal,headers:{"Content-Type":"application/json",Accept:"application/json",...e?.headers}});if(!r.ok)throw new Error(`HTTP ${r.status} from ${t}`);return await r.json()}finally{clearTimeout(a)}}async fetchText(t,e){let s=`${this.baseUrl}${t}`,n=new AbortController,a=setTimeout(()=>n.abort(),this.timeout);try{let r=await globalThis.fetch(s,{...e,signal:n.signal,headers:{...e?.headers}});if(!r.ok)throw new Error(`HTTP ${r.status} from ${t}`);return await r.text()}finally{clearTimeout(a)}}async isAgentRunning(){try{return await this.fetch("/api/v1/health"),!0}catch{return!1}}async getAccounts(){return this.fetch("/api/v1/accounts")}async getProviders(){return this.fetch("/api/v1/providers")}async sync(){return this.fetch("/api/v1/sync",{method:"POST"})}async switchAccount(t,e=!1){return this.fetch(`/api/v1/accounts/${t}/switch?force=${e}`,{method:"POST"})}async refreshAccount(t){return this.fetch(`/api/v1/accounts/${t}/refresh`,{method:"POST"})}async getDiagnostics(){return this.fetch("/api/v1/diagnostics")}async getSettings(){return this.fetch("/api/v1/settings")}async updateSettings(t){return this.fetch("/api/v1/settings",{method:"PUT",body:JSON.stringify(t)})}async addAccount(t){return this.fetch("/api/v1/accounts",{method:"POST",body:JSON.stringify(t)})}async deleteAccount(t){await this.fetch(`/api/v1/accounts/${t}`,{method:"DELETE"})}getDashboardUrl(){return`${this.baseUrl}/`}async getPredictions(t="24h"){return this.fetch(`/api/v1/predictions?period=${t}`)}async updateAccountLabel(t,e){return this.fetch(`/api/v1/accounts/${t}/label`,{method:"PATCH",body:JSON.stringify(e)})}async getWebhookConfig(){return this.fetch("/api/v1/webhooks/config")}async updateWebhookConfig(t){return this.fetch("/api/v1/webhooks/config",{method:"PUT",body:JSON.stringify(t)})}async testWebhook(){return this.fetch("/api/v1/webhooks/test",{method:"POST"})}async getMatrix(t=""){let e=t?`?provider=${encodeURIComponent(t)}`:"";return this.fetch(`/api/v1/matrix${e}`)}async exportAccounts(){return this.fetch("/api/v1/accounts/backup/export")}async importAccounts(t){return this.fetch("/api/v1/accounts/backup/import",{method:"POST",body:JSON.stringify({accounts:t})})}async restartBackend(){return this.fetch("/api/v1/system/restart-backend",{method:"POST"})}async purgeVault(){return this.fetch("/api/v1/vault/purge",{method:"POST"})}async exportAnalytics(t="7d",e="json"){return this.fetchText(`/api/v1/analytics/export?period=${encodeURIComponent(t)}&format=${encodeURIComponent(e)}`)}};var k=C(require("vscode")),Q=class{constructor(t,e){this._disposed=!1;this.client=t,this.context=e,this.item=k.window.createStatusBarItem(k.StatusBarAlignment.Right,100),this.item.command="ai-quota.showQuotaQuickPick",this.item.tooltip="AI-Quota \u2014 click for quota overview (Alt+Q)",e.subscriptions.push(this.item)}show(){this.item.text="$(sync~spin) AI-Quota",this.item.show()}getPinnedModel(){return this.context.globalState.get("ai-quota.pinnedModel","")||null}async setPinnedModel(t){await this.context.globalState.update("ai-quota.pinnedModel",t||""),await this.refresh()}async refresh(){if(!this._disposed)try{let t=await this.client.getAccounts(),e=t.find(h=>h.status==="live")??t[0];if(!e){this.item.text="$(account) AI-Quota",this.item.tooltip="AI-Quota \u2014 no accounts registered",this.item.backgroundColor=void 0;return}let s=this.getPinnedModel(),a=k.workspace.getConfiguration("ai-quota").get("statusBarFormat","$(pulse) AI-Quota {percent}% \xB7 {reset}"),r,i,u=null;if(s){let h=[e,...t.filter(v=>v!==e)];for(let v of h){let x=(v.snapshots??[]).find(_=>_.window_name===s||_.quota_bucket===s);if(x){u=x;break}}r=u?.remaining_percent??e.best_remaining??0,i=u?.reset_at?this._fmtReset(u.reset_at):this._nextReset(e)}else r=e.best_remaining??0,i=this._nextReset(e);let c=e.label||e.display_name||e.email||"Account",d=r>50?"$(pulse)":r>25?"$(warning)":"$(error)",m=u?`\u{1F4CC} ${ie(s)} `:"",p=a.replace("{percent}",r.toFixed(0)).replace("{reset}",i||"\u2014").replace("{account}",c.slice(0,12)).replace("{provider}",e.provider||"").replace("$(pulse)",d);u&&(p=`${d} ${m}${r.toFixed(0)}%${i?` \xB7 ${i}`:""}`),this.item.text=p;let g=[];u&&g.push(`\u{1F4CC} Pinned: ${s}`,`Remaining: ${r.toFixed(1)}%${i?` | Resets in: ${i}`:""}`,""),g.push(`AI-Quota \u2014 Active: ${c}`,`Overall: ${(e.best_remaining??0).toFixed(1)}%`,"","All accounts:");for(let h of t.slice(0,6)){let v=h.best_remaining,x=h.label||h.display_name||h.email||`#${h.id}`,_=h.status==="live";g.push(`  ${_?"\u25CF":"\u25CB"} ${x}: ${v!=null?v.toFixed(0)+"%":"?"}`)}t.length>6&&g.push(`  \u2026 and ${t.length-6} more`),g.push("",s?`\u{1F4CC} Pinned: ${s} \u2014 run "AI-Quota: Unpin Model" to clear`:"Alt+Q = Quick View | Alt+A = Switch | Pin a model via command palette"),this.item.tooltip=g.join(`
`),r<=10?this.item.backgroundColor=new k.ThemeColor("statusBarItem.errorBackground"):r<=20?this.item.backgroundColor=new k.ThemeColor("statusBarItem.warningBackground"):this.item.backgroundColor=void 0}catch{this.setOffline()}}setOffline(){this._disposed||(this.item.text="$(circle-slash) AI-Quota",this.item.tooltip=`AI-Quota agent offline
Start with: python -m app.main
Alt+Q = Quick Quota View`,this.item.backgroundColor=void 0)}dispose(){this._disposed=!0,this.item.dispose()}_nextReset(t){let e=t.snapshots.map(r=>r.reset_at).filter(r=>!!r).map(r=>new Date(r).getTime()).filter(r=>!isNaN(r)&&r>Date.now());if(!e.length)return"";let s=Math.max(0,Math.min(...e)-Date.now()),n=Math.floor(s/36e5),a=Math.floor(s%36e5/6e4);return n>0?`${n}h${a}m`:`${a}m`}_fmtReset(t){let e=Math.max(0,new Date(t).getTime()-Date.now());if(!e)return"";let s=Math.floor(e/36e5),n=Math.floor(e%36e5/6e4);return s>0?`${s}h${n}m`:`${n}m`}};function ie(l){return l.length>14?l.slice(0,12)+"\u2026":l}var f=C(require("vscode")),R=class{constructor(t,e){this._privacyMode=!1;this._lastRefresh=null;this._context=t,this._client=e,this._privacyMode=t.globalState.get("ai-quota.privacyMode",!1)}resolveWebviewView(t,e,s){this._view=t,t.webview.options={enableScripts:!0,localResourceRoots:[f.Uri.joinPath(this._context.extensionUri,"media"),f.Uri.joinPath(this._context.extensionUri,"dist")]},t.webview.html=this._getHtml(t.webview),t.webview.onDidReceiveMessage(async n=>{switch(n.command){case"switch":await f.commands.executeCommand("ai-quota.switchAccount");break;case"switchTo":if(n.accountId)try{await this._client.switchAccount(Number(n.accountId)),await this.refresh(),f.window.showInformationMessage("AI-Quota: Account switched.")}catch(a){f.window.showErrorMessage(`Switch failed: ${a instanceof Error?a.message:String(a)}`)}break;case"refresh":await this.refresh();break;case"openDashboard":await f.commands.executeCommand("ai-quota.openDashboard");break;case"showMatrix":await f.commands.executeCommand("ai-quota.showQuotaMatrix");break;case"showQuickPick":await f.commands.executeCommand("ai-quota.showQuotaQuickPick");break;case"reAuth":await f.commands.executeCommand("ai-quota.reAuth");break;case"signOut":await f.commands.executeCommand("ai-quota.signOut");break;case"openSettings":await f.commands.executeCommand("ai-quota.openSettings");break;case"exportAccounts":await f.commands.executeCommand("ai-quota.exportAccounts");break;case"togglePrivacy":this._privacyMode=!this._privacyMode,this._context.globalState.update("ai-quota.privacyMode",this._privacyMode),await this.refresh();break;case"pinModel":{n.modelName&&(await this._context.globalState.update("ai-quota.pinnedModel",n.modelName),f.window.showInformationMessage(`AI-Quota: Pinned "${n.modelName}" to status bar. \u{1F4CC}`),await f.commands.executeCommand("ai-quota.refresh"));break}case"unpinModel":{await this._context.globalState.update("ai-quota.pinnedModel",""),f.window.showInformationMessage("AI-Quota: Unpinned model from status bar."),await f.commands.executeCommand("ai-quota.refresh");break}case"toggleAutoSwitch":{let a=f.workspace.getConfiguration("ai-quota"),r=a.get("autoSwitch",!1);await a.update("autoSwitch",!r,f.ConfigurationTarget.Global),f.window.showInformationMessage(`AI-Quota: Auto-switch is now ${r?"OFF":"ON \u26A1"}.`),await this.refresh();break}case"copyQuota":{n.text&&(await f.env.clipboard.writeText(n.text),f.window.showInformationMessage("AI-Quota: Quota summary copied to clipboard."));break}case"deleteAccount":{let{accountId:a,accountName:r}=n;if(!a||await f.window.showWarningMessage(`Remove "${r||`Account ${a}`}" from AI-Quota?`,{modal:!0},"Remove")!=="Remove")break;try{await this._client.deleteAccount(Number(a)),await this.refresh(),f.window.showInformationMessage("AI-Quota: Account removed.")}catch(u){f.window.showErrorMessage(`Delete failed: ${u instanceof Error?u.message:String(u)}`)}break}case"saveLabel":{let{accountId:a,label:r,notes:i,color:u}=n;if(a)try{await this._client.updateAccountLabel(Number(a),{label:r||void 0,notes:i||void 0,color:u||void 0}),await this.refresh()}catch{}break}case"refreshAccount":{if(n.accountId)try{await this._client.refreshAccount(Number(n.accountId)),await this.refresh()}catch{}break}}}),this.refresh()}async refresh(){if(this._view){this._lastRefresh=new Date;try{let[t,e]=await Promise.all([this._client.getAccounts(),this._client.getPredictions("24h").catch(()=>null)]),s=new Map;if(e)for(let d of e.predictions)s.set(d.account_id,d);let n=t.map(d=>({...d,prediction:s.get(d.id)??null})),a=f.workspace.getConfiguration("ai-quota"),r=a.get("notificationThreshold",20),i=a.get("pollInterval",30),u=a.get("autoSwitch",!1),c=this._context.globalState.get("ai-quota.pinnedModel","");this._view.webview.postMessage({type:"accounts",data:n,recommendation:e?{id:e.best_account_id,reason:e.reason}:null,privacyMode:this._privacyMode,threshold:r,pollInterval:i,autoSwitch:u,pinnedModel:c,lastRefresh:this._lastRefresh?.toISOString()??null})}catch{this._view.webview.postMessage({type:"error",message:"Agent offline"})}}}_getHtml(t){let e=ce();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${e}';">
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

    /* \u2500\u2500 Scrollable body \u2500\u2500 */
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

    /* \u2500\u2500 Top header bar \u2500\u2500 */
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

    /* \u2500\u2500 Section label \u2500\u2500 */
    .section-label {
      font-size: 10px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; color: var(--muted);
      padding: 10px 12px 4px;
    }

    /* \u2500\u2500 Current Account \u2500\u2500 */
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

    /* \u2500\u2500 Usage section \u2500\u2500 */
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

    /* \u2500\u2500 Saved accounts section \u2500\u2500 */
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

    /* \u2500\u2500 Account card \u2500\u2500 */
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

    /* \u2500\u2500 Footer \u2500\u2500 */
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

  <!-- \u2500\u2500 Top bar \u2500\u2500 -->
  <div class="top-bar">
    <div class="status-pill">
      <span class="status-dot offline pulsing" id="statusDot"></span>
      <span class="status-label">AI-Quota: <strong id="statusText">Connecting\u2026</strong></span>
    </div>
    <div class="top-actions">
      <button class="btn-icon" id="privacyBtn" title="Toggle privacy mode">\u{1F441}</button>
      <button class="btn-icon" id="refreshBtn" title="Refresh quota">\u21BB</button>
      <button class="btn-icon" id="quickPickBtn" title="QuickPick quota view (Alt+Q)">\u2328</button>
      <button class="btn-matrix" id="matrixBtn">\u229E Matrix</button>
    </div>
  </div>
  <div class="refresh-info" id="refreshInfo"></div>

  <!-- \u2500\u2500 Scrollable body \u2500\u2500 -->
  <div id="scroll-body">

    <!-- Current account -->
    <div class="section-label">Current account</div>
    <div id="currentAccount"></div>

    <!-- Usage: per-model -->
    <div class="usage-header">
      <span class="usage-label">Model Quotas</span>
      <div class="usage-controls">
        <button class="btn-text-action" id="copyQuotaBtn" title="Copy quota summary to clipboard">\u{1F4CB} Copy</button>
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
        <span class="saved-chevron open" id="savedChevron">\u2228</span>
        <span class="saved-label">Saved accounts</span>
        <span class="saved-count" id="savedCount">0</span>
      </div>
      <div class="saved-header-right">
        <button class="btn-header-action" id="exportBtn" title="Export accounts backup (JSON)">\u{1F4E4}</button>
        <button class="btn-header-action" id="addBtn" title="Add / Switch account">+</button>
      </div>
    </div>

    <div id="savedBody" class="saved-body">
      <div class="search-row">
        <div class="search-wrap">
          <span class="search-icon">\u{1F50D}</span>
          <input class="search-input" type="text" id="searchInput" placeholder="Search accounts">
          <button class="search-clear" id="searchClear">\u2715</button>
        </div>
        <button class="sort-btn" id="sortBtn">Recently used \u2304</button>
      </div>
      <div id="accountsList"></div>
    </div>

    <!-- Offline fallback -->
    <div id="offlineBanner" style="display:none"></div>

  </div><!-- /#scroll-body -->

  <!-- \u2500\u2500 Footer \u2500\u2500 -->
  <div class="footer">
    <div class="footer-left">
      <span class="footer-credit">Developed by <a href="https://github.com/Kesicode/AI-Quota" target="_blank">Kesicode</a></span>
      <button class="pill-btn" id="thresholdPill" title="Open settings to change low quota alert threshold">\u26A0 20%</button>
      <button class="pill-btn" id="autoSwitchPill" title="Toggle automatic switching on low quota">\u26A1 Auto: OFF</button>
    </div>
    <span class="footer-version" id="footerVersion">v2.0.4</span>
  </div>

  <script nonce="${e}">
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

    // \u2500\u2500 Buttons \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
      let text = 'AI-Quota Status: [' + name + ' - ' + active.provider + ']
';
      text += 'Overall: ' + (active.best_remaining != null ? active.best_remaining.toFixed(0) + '%' : 'N/A') + '
';
      for (const s of (active.snapshots || [])) {
        const wn = s.window_name || s.quota_bucket || 'Usage';
        const pct = s.remaining_percent != null ? s.remaining_percent.toFixed(0) + '%' : '?';
        const rst = s.reset_at ? fmtReset(s.reset_at) : '';
        text += '  \u2022 ' + wn + ': ' + pct + (rst ? ' (' + rst + ')' : '') + '
';
      }
      vscode.postMessage({ command: 'copyQuota', text });
    };

    document.getElementById('savedToggle').onclick = (e) => {
      if (e.target.closest('#addBtn') || e.target.closest('#exportBtn')) return;
      _savedOpen = !_savedOpen;
      document.getElementById('savedBody').style.display = _savedOpen ? '' : 'none';
      const ch = document.getElementById('savedChevron');
      ch.className = 'saved-chevron ' + (_savedOpen ? 'open' : 'closed');
      ch.textContent = _savedOpen ? '\u2228' : '\u203A';
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
      document.getElementById('sortBtn').textContent = SORT_LABELS[_sortMode] + ' \u2304';
      renderAccounts();
    };

    // \u2500\u2500 Formatters \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
        consuming:  { icon: '\u2193', cls: 'trend-consuming' },
        recovering: { icon: '\u2191', cls: 'trend-recovering' },
        stable:     { icon: '\u2192', cls: 'trend-stable' },
        exhausted:  { icon: '\u2715', cls: 'trend-exhausted' },
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

    // \u2500\u2500 Render current account \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
              <span class="badge badge-plan">\u2B50 \${_esc(prov)}</span>
              \${isInst   ? '<span class="badge badge-instant">\u26A1 Instant</span>' : ''}
              \${isConn   ? '<span class="badge badge-connected">\u25CF Connected</span>'
                         : '<span class="badge badge-offline">\u25CF Offline</span>'}
              \${isRec    ? '<span class="badge badge-rec">\u2605 Best</span>' : ''}
              \${hasWeekly ? '<span class="badge badge-weekly">\u26A0 Weekly limit</span>' : ''}
            </div>
            \${predHtml}
            <div class="acct-btns" style="margin-top:7px">
              <button class="btn-reauth" id="reauthBtn">Re-auth</button>
              <button class="btn-signout" id="signoutBtn">Sign out</button>
            </div>
          </div>
          <button class="edit-acct-btn" id="editCurrBtn" title="Edit label">\u270E</button>
        </div>
      </div>\`;

      document.getElementById('reauthBtn').onclick  = () => vscode.postMessage({ command: 'reAuth' });
      document.getElementById('signoutBtn').onclick = () => vscode.postMessage({ command: 'signOut' });
      document.getElementById('editCurrBtn').onclick = () => {
        const le = document.getElementById('le-' + active.id);
        if (le) le.classList.toggle('open');
      };
    }

    // \u2500\u2500 Render model quota list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function renderModelList() {
      const active = _accounts.find(a => a.status === 'live') || _accounts[0];
      const timeEl = document.getElementById('usageTime');
      const list   = document.getElementById('modelList');

      if (!active || !(active.snapshots || []).length) {
        list.innerHTML = '<div class="model-card"><div class="empty" style="padding:10px 0;font-size:10px">No quota data yet \u2014 try refreshing</div></div>';
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
                \${isPinned ? '\u{1F4CC}' : '\u{1F4CD}'}
              </button>
              \${tIcon}
              <span class="model-title-text">\${_esc(wname)}</span>
              \${weekly ? '<span class="weekly-tag">WEEKLY</span>' : ''}
            </div>
            <div class="model-meta">
              \${pctDisplay}
              \${cntdn ? '<span class="model-countdown">\xB7 ' + cntdn + '</span>' : ''}
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

    // \u2500\u2500 Render accounts list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
          '<span class="card-badge plan-tag">\u2B50 ' + _esc(prov) + '</span>',
          isInst   ? '<span class="card-badge instant-tag">\u26A1 Instant</span>' : '',
          isRec    ? '<span class="card-badge rec-tag">\u2605 Best</span>' : '',
          acc.status === 'stale' ? '<span class="card-badge stale-tag">\u26A0 Stale</span>' : '',
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
          ? \`<button class="btn-switch-to" data-id="\${acc.id}">\u21C4 Switch to this account</button>\`
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
              <button class="card-btn refresh-acc" data-id="\${acc.id}" title="Refresh account quota">\u21BB</button>
              <button class="card-btn edit-btn" data-id="\${acc.id}" title="Edit label">\u270E</button>
              <button class="card-btn delete" data-id="\${acc.id}" data-name="\${_esc(name)}" title="Remove account">\u{1F5D1}</button>
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

    // \u2500\u2500 Countdown updater \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
        el.textContent = 'Refreshing\u2026';
      }
    }

    // \u2500\u2500 Master render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
      privBtn.title = _privacy ? 'Privacy mode ON \u2014 click to show values' : 'Privacy mode OFF \u2014 click to hide values';

      // Threshold & Auto-switch pills
      document.getElementById('thresholdPill').textContent = '\u26A0 Alert <' + _threshold + '%';
      
      const autoPill = document.getElementById('autoSwitchPill');
      autoPill.textContent = _autoSwitch ? '\u26A1 Auto: ON' : '\u26A1 Auto: OFF';
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
        \`<div class="offline-banner">\u26A0 AI-Quota agent offline<br><code>python -m app.main</code>
        <br><button class="btn-restart" onclick="vscode.postMessage({command:'refresh'})">\u21BB Retry</button></div>\`;
      document.getElementById('modelList').innerHTML =
        '<div class="model-card"><div class="empty" style="padding:10px 0;font-size:10px">Agent not running</div></div>';
      document.getElementById('accountsList').innerHTML = '';
    }

    // \u2500\u2500 Escape helper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    function _esc(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // \u2500\u2500 Message handler \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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
</html>`}};function ce(){let l="",t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let e=0;e<32;e++)l+=t.charAt(Math.floor(Math.random()*t.length));return l}var w=C(require("vscode")),O=class extends w.TreeItem{constructor(e,s){let n=e.label||e.display_name||e.email;super(n,s);this.account=e;this.collapsibleState=s;let a=e.best_remaining;this.description=a!=null?`${a.toFixed(0)}% \xB7 ${e.status}`:e.status,this.tooltip=[`Email: ${e.email}`,`Provider: ${e.provider}`,`Client: ${e.client}`,a!=null?`Quota: ${a.toFixed(1)}%`:""].filter(Boolean).join(`
`),this.iconPath=this._icon(e.status,a),this.contextValue="account",this.command={command:"ai-quota.switchAccount",title:"Switch",arguments:[]}}_icon(e,s){return e==="live"?s!=null&&s<=10?new w.ThemeIcon("error"):s!=null&&s<=20?new w.ThemeIcon("warning"):new w.ThemeIcon("circle-filled"):e==="stale"?new w.ThemeIcon("clock"):new w.ThemeIcon("circle-outline")}},W=class extends w.TreeItem{constructor(t){let e=t.remaining_percent?.toFixed(0)??"?";super(`${t.window_name}: ${e}%`,w.TreeItemCollapsibleState.None),this.description=t.reset_at?`Resets ${new Date(t.reset_at).toLocaleTimeString()}`:"",this.iconPath=new w.ThemeIcon("graph"),this.contextValue="snapshot"}},z=class{constructor(t){this.client=t;this._onDidChangeTreeData=new w.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._accounts=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._accounts=await this.client.getAccounts()}catch{this._accounts=[]}}getTreeItem(t){return t}async getChildren(t){return t?t instanceof O?t.account.snapshots.map(e=>new W(e)):[]:(this._accounts.length||await this._load(),this._accounts.map(e=>new O(e,e.snapshots?.length?w.TreeItemCollapsibleState.Collapsed:w.TreeItemCollapsibleState.None)))}};var y=C(require("vscode")),L=class extends y.TreeItem{constructor(e){super(e.display_name,y.TreeItemCollapsibleState.Collapsed);this.provider=e;let s=e.detected;this.description=s?"\u25CF detected":"\u25CB not running",this.tooltip=[`ID: ${e.id}`,`Detected: ${s?"Yes":"No"}`,e.hub_url?`Hub: ${e.hub_url}`:"",`Switching: ${e.capabilities?.switching?e.capabilities.switch_method:"not supported"}`,`Truth: ${e.truth?.authority_type??"unknown"}`].filter(Boolean).join(`
`),this.iconPath=s?new y.ThemeIcon("plug",new y.ThemeColor("charts.green")):new y.ThemeIcon("plug"),this.contextValue="provider"}},A=class extends y.TreeItem{constructor(t,e){let s=typeof e=="boolean"?e?"\u2713":"\u2717":e;super(`${t}: ${s}`,y.TreeItemCollapsibleState.None),this.iconPath=new y.ThemeIcon(typeof e=="boolean"?e?"check":"close":"info"),this.contextValue="capability"}},N=class{constructor(t){this.client=t;this._onDidChangeTreeData=new y.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this._providers=[]}refresh(){this._load().then(()=>this._onDidChangeTreeData.fire())}async _load(){try{this._providers=await this.client.getProviders()}catch{this._providers=[]}}getTreeItem(t){return t}async getChildren(t){if(!t)return this._providers.length||await this._load(),[...this._providers].sort((e,s)=>Number(s.detected)-Number(e.detected)).map(e=>new L(e));if(t instanceof L){let e=t.provider,s=e.capabilities??{};return[new A("Quota",s.quota??!1),new A("Detection",s.detection??!1),new A("Switching",s.switching??!1),new A("Instant Switch",s.instant_switch??!1),new A("Method",s.switch_method??"n/a"),new A("Hub URL",e.hub_url??"\u2014"),new A("Authority",e.truth?.authority_type??"unknown")]}return[]}};var o=C(require("vscode"));function Y(l,t,e){let s=(n,a)=>l.subscriptions.push(o.commands.registerCommand(n,a));s("ai-quota.openDashboard",()=>{o.env.openExternal(o.Uri.parse(t.getDashboardUrl()))}),s("ai-quota.switchAccount",async()=>{let n;try{n=await t.getAccounts()}catch{o.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot switch account.");return}if(!n.length){o.window.showInformationMessage("AI-Quota: No accounts registered.");return}let r=[...n].sort((c,d)=>c.status==="live"&&d.status!=="live"?-1:d.status==="live"&&c.status!=="live"?1:(d.best_remaining??0)-(c.best_remaining??0)).map(c=>({label:c.label||c.display_name||c.email,description:`${c.provider} \xB7 ${c.best_remaining?.toFixed(0)??"?"}% remaining`,detail:`Status: ${c.status} | Client: ${c.client}`,accountId:c.id})),i=await o.window.showQuickPick(r,{title:"AI-Quota: Switch Account",placeHolder:"Select account to switch to\u2026",matchOnDescription:!0});!i||await o.window.showWarningMessage(`Switch to "${i.label}"?`,{modal:!0},"Switch")!=="Switch"||await o.window.withProgress({location:o.ProgressLocation.Notification,title:"AI-Quota: Switching account\u2026",cancellable:!1},async()=>{try{let c=await t.switchAccount(i.accountId);if(c.status==="success"&&c.verified){try{(await o.commands.getCommands(!0)).includes("antigravity.handleAuthRefresh")&&await o.commands.executeCommand("antigravity.handleAuthRefresh")}catch{}o.window.showInformationMessage(`\u2713 Switched to ${i.label} (verified via ${c.method_used})`)}else c.status==="verification_failed"?o.window.showWarningMessage(`\u26A0 Switch attempted but not verified \u2014 active account may differ. Reason: ${c.reason}`):o.window.showErrorMessage(`\u2717 Switch failed: ${c.reason}`)}catch(c){o.window.showErrorMessage(`AI-Quota: Switch error \u2014 ${String(c)}`)}e.statusBar?.refresh(),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh()})}),s("ai-quota.saveCurrentAccount",async()=>{let n=await o.window.showInputBox({prompt:"Enter the email address for this account",placeHolder:"user@example.com"});if(!n)return;let a=await o.window.showInputBox({prompt:"Label for this account (optional)",placeHolder:"Work / Personal / Project X\u2026"});try{await t.addAccount({email:n,provider:"Antigravity",client:"Antigravity",display_name:a||n,label:a||""}),o.window.showInformationMessage(`AI-Quota: Account "${n}" saved.`),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh()}catch(r){o.window.showErrorMessage(`AI-Quota: Failed to save account \u2014 ${String(r)}`)}}),s("ai-quota.refresh",async()=>{try{await t.sync(),e.statusBar?.refresh(),e.accountsProvider.refresh(),e.providersProvider.refresh(),e.quotaSidebarProvider.refresh()}catch{o.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot refresh.")}}),s("ai-quota.showStatus",async()=>{try{let a=(await t.getAccounts()).map(r=>`${r.label||r.display_name||r.email}: ${r.best_remaining?.toFixed(0)??"?"}% (${r.status})`);o.window.showInformationMessage(a.length?a.join(`
`):"No accounts registered.",{modal:!1})}catch{o.window.showErrorMessage("AI-Quota: Agent offline.")}}),s("ai-quota.showDiagnostics",async()=>{try{let n=await t.getDiagnostics(),a=o.window.createWebviewPanel("ai-quota.diagnostics","AI-Quota Diagnostics",o.ViewColumn.One,{enableScripts:!1});a.webview.html=`<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#0a0b0e;color:#e8eaed">
        <h2 style="color:#1a9e5c">AI-Quota Diagnostics</h2>
        <pre>${JSON.stringify(n,null,2)}</pre>
      </body></html>`}catch{o.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot fetch diagnostics.")}}),s("ai-quota.signIn",async()=>{o.env.openExternal(o.Uri.parse(`${t.getDashboardUrl()}`)),o.window.showInformationMessage("AI-Quota: Complete sign-in in the dashboard, then refresh.")}),s("ai-quota.signOut",async()=>{o.window.showWarningMessage(`AI-Quota: Sign-out removes the account from the local registry.
Your provider account is unaffected.`,"Continue","Cancel").then(n=>{n==="Continue"&&o.commands.executeCommand("ai-quota.openDashboard")})}),s("ai-quota.reAuth",async()=>{o.env.openExternal(o.Uri.parse(t.getDashboardUrl())),o.window.showInformationMessage("AI-Quota: Re-authenticate via the dashboard.")}),s("ai-quota.showQuotaMatrix",async()=>{let n;try{n=await t.getMatrix()}catch{o.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot load matrix.");return}let a=o.window.createWebviewPanel("ai-quota.matrix","AI-Quota \u2014 Quota Matrix",o.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0});a.webview.html=de(n),a.webview.onDidReceiveMessage(async r=>{if(r.command==="refresh")try{let i=await t.getMatrix();a.webview.postMessage({type:"matrix",data:i})}catch{a.webview.postMessage({type:"error"})}})}),s("ai-quota.addAccount",async()=>{o.env.openExternal(o.Uri.parse(t.getDashboardUrl())),o.window.showInformationMessage("AI-Quota: Add accounts via the dashboard.")}),s("ai-quota.focusView",async()=>{try{await o.commands.executeCommand("ai-quota.quotaView.focus")}catch{await o.commands.executeCommand("workbench.view.extension.ai-quota-sidebar")}}),s("ai-quota.statusBarMenu",async()=>{await o.commands.executeCommand("ai-quota.switchAccount")}),s("ai-quota.exportAccounts",async()=>{try{let n=await t.exportAccounts(),a=await o.window.showSaveDialog({filters:{"JSON Files":["json"]},defaultUri:o.Uri.file("ai-quota-accounts-backup.json"),saveLabel:"Export Accounts"});if(!a)return;let r=Buffer.from(JSON.stringify(n,null,2),"utf8");await o.workspace.fs.writeFile(a,r),o.window.showInformationMessage(`AI-Quota: Successfully exported ${n.total} accounts to ${a.fsPath}`)}catch(n){o.window.showErrorMessage(`AI-Quota: Failed to export accounts \u2014 ${String(n)}`)}}),s("ai-quota.importAccounts",async()=>{try{let n=await o.window.showOpenDialog({filters:{"JSON Files":["json"]},canSelectMany:!1,openLabel:"Import Accounts"});if(!n||!n.length)return;let a=await o.workspace.fs.readFile(n[0]),r=JSON.parse(Buffer.from(a).toString("utf8")),i=Array.isArray(r)?r:r.accounts||[];if(!i.length){o.window.showWarningMessage("AI-Quota: No accounts found in selected file.");return}let u=await t.importAccounts(i);o.window.showInformationMessage(`AI-Quota: Imported ${u.total} accounts (${u.added} added, ${u.updated} updated).`),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh(),e.statusBar?.refresh()}catch(n){o.window.showErrorMessage(`AI-Quota: Failed to import accounts \u2014 ${String(n)}`)}}),s("ai-quota.exportAnalytics",async()=>{let n=await o.window.showQuickPick([{label:"7d",description:"Past 7 days (Recommended)"},{label:"24h",description:"Past 24 hours"},{label:"30d",description:"Past 30 days"}],{title:"AI-Quota: Select Analytics Period"});if(!n)return;let a=await o.window.showQuickPick([{label:"json",description:"JSON format (full structure)"},{label:"csv",description:"CSV format (table / spreadsheet)"}],{title:"AI-Quota: Select Export Format"});if(a)try{let r=await o.window.showSaveDialog({filters:a.label==="csv"?{"CSV Files":["csv"]}:{"JSON Files":["json"]},defaultUri:o.Uri.file(`ai-quota-analytics-${n.label}.${a.label}`),saveLabel:"Export Analytics"});if(!r)return;let i=await t.exportAnalytics(n.label,a.label),u=Buffer.from(i,"utf8");await o.workspace.fs.writeFile(r,u),o.window.showInformationMessage(`AI-Quota: Analytics exported to ${r.fsPath}`)}catch(r){o.window.showErrorMessage(`AI-Quota: Export error \u2014 ${String(r)}`)}}),s("ai-quota.restartBackend",async()=>{if(await o.window.showWarningMessage("Restart local Antigravity Language Server / backend process? Active completions will briefly pause.",{modal:!0},"Restart Process")==="Restart Process")try{let a=await t.restartBackend();o.window.showInformationMessage(a.terminated?"AI-Quota: Antigravity language server process terminated and reloading.":"AI-Quota: Restart signal processed (no active server process needed termination)."),e.statusBar?.refresh(),e.quotaSidebarProvider.refresh()}catch(a){o.window.showErrorMessage(`AI-Quota: Restart failed \u2014 ${String(a)}`)}}),s("ai-quota.clearTokenVault",async()=>{if(await o.window.showWarningMessage("Clear stored encrypted tokens from the local OS Token Vault? You will need to re-authenticate accounts.",{modal:!0},"Purge Vault")==="Purge Vault")try{let a=await t.purgeVault();o.window.showInformationMessage(`AI-Quota: Token vault cleared (${a.purged} credentials removed).`),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh(),e.statusBar?.refresh()}catch(a){o.window.showErrorMessage(`AI-Quota: Purge failed \u2014 ${String(a)}`)}}),s("ai-quota.showQuotaQuickPick",async()=>{let n;try{n=await t.getAccounts()}catch{o.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot show quota.");return}if(!n.length){o.window.showInformationMessage("AI-Quota: No accounts registered.");return}let a=o.window.createQuickPick();a.title="AI-Quota \u2014 Quota Overview",a.placeholder="Select account to switch to, or press Escape to close",a.matchOnDescription=!0,a.matchOnDetail=!0;function r(i){let u=[],c=[...i].sort((d,m)=>d.status==="live"&&m.status!=="live"?-1:m.status==="live"&&d.status!=="live"?1:(m.best_remaining??0)-(d.best_remaining??0));for(let d of c){let m=d.status==="live",p=d.label||d.display_name||d.email||`Account ${d.id}`,g=d.best_remaining,h=g!=null?`${g.toFixed(0)}%`:"?%",v=12,x=g!=null?Math.round(g/100*v):0,_="\u2588".repeat(x)+"\u2591".repeat(v-x),T=m?"$(check)":d.status==="stale"?"$(warning)":"$(circle-outline)",B=d.snapshots||[];u.push({label:`${T} ${p}`,description:`${_}  ${h}  \u2022  ${d.provider}`,detail:m?"  \u2726 Currently active account":d.email&&d.email!==p?`  ${d.email}`:void 0,alwaysShow:!0});for(let S of B.slice(0,4)){let D=S.remaining_percent??0,j=Math.round(D/100*8),G="\u25AA".repeat(j)+"\xB7".repeat(8-j),X=S.window_name||S.quota_bucket||"Usage",U="";if(S.reset_at){let F=new Date(S.reset_at).getTime()-Date.now();if(F>0){let H=Math.floor(F/36e5),V=Math.floor(F%36e5/6e4);U=H>0?`${H}h ${V}m`:`${V}m`}}let Z=D<=10?"$(error)":D<=25?"$(warning)":"$(check)";u.push({label:`    ${Z}  ${X}`,description:`${G}  ${D.toFixed(0)}%${U?"  \u21BA "+U:""}`,detail:void 0,alwaysShow:!0})}m||u.push({label:`    $(arrow-right) Switch to "${p}"`,description:"",alwaysShow:!0}),u.push({label:"",kind:o.QuickPickItemKind.Separator})}return u}a.items=r(n),a.buttons=[{iconPath:new o.ThemeIcon("refresh"),tooltip:"Refresh quota"},{iconPath:new o.ThemeIcon("dashboard"),tooltip:"Open Dashboard"},{iconPath:new o.ThemeIcon("gear"),tooltip:"Settings"}],a.onDidTriggerButton(async i=>{if(i.tooltip==="Refresh quota")try{await t.sync(),n=await t.getAccounts(),a.items=r(n),e.quotaSidebarProvider.refresh()}catch{o.window.showErrorMessage("AI-Quota: Refresh failed.")}else i.tooltip==="Open Dashboard"?(o.env.openExternal(o.Uri.parse(t.getDashboardUrl())),a.hide()):i.tooltip==="Settings"&&(o.commands.executeCommand("workbench.action.openSettings","ai-quota"),a.hide())}),a.onDidChangeSelection(async i=>{if(!i.length)return;let u=i[0];if(u.label.includes("$(arrow-right) Switch to")){a.hide();let c=u.label.match(/Switch to "(.+?)"/);if(c){let d=c[1],m=n.find(p=>(p.label||p.display_name||p.email||`Account ${p.id}`)===d);m&&await o.window.withProgress({location:o.ProgressLocation.Notification,title:`AI-Quota: Switching to ${d}\u2026`,cancellable:!1},async()=>{try{let p=await t.switchAccount(m.id);p.status==="success"&&p.verified?o.window.showInformationMessage(`\u2713 Switched to ${d}`):o.window.showWarningMessage(`\u26A0 Switch result: ${p.reason}`),e.statusBar?.refresh(),e.accountsProvider.refresh(),e.quotaSidebarProvider.refresh()}catch(p){o.window.showErrorMessage(`AI-Quota: Switch error \u2014 ${String(p)}`)}})}}}),a.onDidHide(()=>a.dispose()),a.show()}),s("ai-quota.pinModelToStatusBar",async()=>{let n;try{n=await t.getAccounts()}catch{o.window.showErrorMessage("AI-Quota: Agent offline \u2014 cannot load models.");return}let a=new Map;for(let c of n){let d=c.label||c.display_name||c.email||`#${c.id}`;for(let m of c.snapshots??[]){let p=m.window_name||m.quota_bucket||"Usage";a.has(p)||a.set(p,{pct:m.remaining_percent,account:d})}}if(!a.size){o.window.showInformationMessage("AI-Quota: No quota windows found \u2014 try refreshing first.");return}let r=e.statusBar?.getPinnedModel()??null,i=[];r&&(i.push({label:"$(pinned-dirty) Unpin current model",description:`Currently pinned: ${r}`,detail:"Remove pin \u2014 status bar will revert to overall best account quota",alwaysShow:!0}),i.push({label:"",kind:o.QuickPickItemKind.Separator}));for(let[c,d]of a.entries()){let m=c===r,p=d.pct!=null?`${d.pct.toFixed(0)}%`:"?%";i.push({label:`${m?"$(pinned) ":"$(pin) "}${c}`,description:`${p}  \xB7  ${d.account}`,detail:m?"  \u2726 Currently pinned":void 0,alwaysShow:!0})}let u=await o.window.showQuickPick(i,{title:"AI-Quota: Pin Model to Status Bar",placeHolder:"Select a quota window to pin, or unpin current\u2026",matchOnDescription:!0});if(u)if(u.label.startsWith("$(pinned-dirty)"))await e.statusBar?.setPinnedModel(null),o.window.showInformationMessage("AI-Quota: Status bar pin removed.");else{let c=u.label.replace(/^\$\([^)]+\)\s*/,"").trim();await e.statusBar?.setPinnedModel(c),o.window.showInformationMessage(`AI-Quota: Pinned "${c}" to status bar. \u{1F4CC}`)}}),s("ai-quota.unpinStatusBarModel",async()=>{let n=e.statusBar?.getPinnedModel();if(!n){o.window.showInformationMessage("AI-Quota: No model is pinned.");return}await e.statusBar?.setPinnedModel(null),o.window.showInformationMessage(`AI-Quota: Unpinned "${n}" from status bar.`)}),s("ai-quota.openSettings",()=>{o.commands.executeCommand("workbench.action.openSettings","ai-quota")})}function de(l){let t=Array.from({length:24},()=>"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random()*62)]).join(""),e=l.windows,s=l.accounts,n=JSON.stringify(l),a=e.map(i=>`<th class="win-th">${i}</th>`).join(""),r=s.map(i=>{let u=i.best_remaining!==null&&i.best_remaining===Math.max(...s.map(p=>p.best_remaining??-1)),c=i.status==="live"?"live":i.status==="stale"?"stale":"off",d=i.label||i.display_name||i.email||`Account ${i.id}`,m=e.map(p=>{let g=i.windows[p];if(!g||g.remaining_pct===null)return'<td class="win-td"><span class="na">\u2014</span></td>';let h=g.remaining_pct,v=h>=60?"hi":h>=30?"mid":h>=15?"lo":"cr",x=h>=60?"#4fa84f":h>=30?"#1a9e5c":h>=15?"#f0a500":"#e53935",_=g.reset_at?new Date(g.reset_at).getTime()-Date.now():0,T=_>0?(()=>{let B=Math.floor(_/36e5),S=Math.floor(_%36e5/6e4);return B>0?`\u21BA ${B}h${S}m`:`\u21BA ${S}m`})():"";return`<td class="win-td">
        <div class="pct ${v}">${h.toFixed(0)}%</div>
        <div class="bar-t"><div class="bar-f" style="width:${h}%;background:${x}"></div></div>
        ${T?`<div class="rst">${T}</div>`:""}
      </td>`}).join("");return`<tr class="${u?"best":""}">
      <td class="name-td">
        <div class="nm" title="${i.email??""}">${d}</div>
        <div class="tg">${i.provider} \xB7 ${i.client}</div>
      </td>
      <td><span class="st"><span class="dot ${c}"></span>${i.status}</span></td>
      ${m}
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
    <thead><tr><th>Account</th><th>Status</th>${a}</tr></thead>
    <tbody>${r}</tbody>
  </table>
</div>

<script nonce="${t}">
  const vscode = acquireVsCodeApi();
  let _data = ${n};
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
</html>`}var P=null,M=null,I=null,$=null,K=0;async function le(l){let t=b.workspace.getConfiguration("ai-quota"),e=t.get("agentUrl","http://127.0.0.1:8765"),s=t.get("pollInterval",30)*1e3,n=t.get("syncIntervalMinutes",5)*60*1e3;M=new q(e),P=new Q(M,l),P.show();let a=new R(l,M),r=new z(M),i=new N(M);l.subscriptions.push(b.window.registerWebviewViewProvider("ai-quota.quotaView",a,{webviewOptions:{retainContextWhenHidden:!0}}),b.window.registerTreeDataProvider("ai-quota.accountsView",r),b.window.registerTreeDataProvider("ai-quota.providersView",i)),Y(l,M,{statusBar:P,accountsProvider:r,providersProvider:i,quotaSidebarProvider:a});let u=async()=>{try{await P?.refresh(),r.refresh(),i.refresh(),a.refresh();let d=b.workspace.getConfiguration("ai-quota"),m=d.get("notificationThreshold",20),p=d.get("autoSwitch",!1),g=d.get("autoSwitchCooldownMinutes",5);await pe(M,m,l,p,g,P)}catch{P?.setOffline()}},c=async()=>{try{await M.sync(),await u()}catch{P?.setOffline()}};await c(),I=setInterval(u,s),l.subscriptions.push({dispose:()=>I&&clearInterval(I)}),$=setInterval(c,n),l.subscriptions.push({dispose:()=>$&&clearInterval($)}),l.subscriptions.push(b.workspace.onDidChangeConfiguration(d=>{if(d.affectsConfiguration("ai-quota.pollInterval")){I&&clearInterval(I);let m=b.workspace.getConfiguration("ai-quota").get("pollInterval",30)*1e3;I=setInterval(u,m)}if(d.affectsConfiguration("ai-quota.syncIntervalMinutes")){$&&clearInterval($);let m=b.workspace.getConfiguration("ai-quota").get("syncIntervalMinutes",5)*60*1e3;$=setInterval(c,m)}}))}function ue(){I&&(clearInterval(I),I=null),$&&(clearInterval($),$=null),P?.dispose()}async function pe(l,t,e,s,n,a){try{let r=await l.getAccounts(),i=e.globalState.get("ai-quota.notifiedKeys",[]),u=new Set(i),c=r.find(m=>m.status==="live"),d=c?.best_remaining??null;if(s&&d!==null&&d<=t&&Date.now()-K>n*6e4){let m=r.filter(g=>g.status!=="live"&&g.best_remaining!==null&&g.best_remaining>d+10);m.sort((g,h)=>(h.best_remaining??0)-(g.best_remaining??0));let p=m[0];if(p){K=Date.now();let g=p.label||p.display_name||p.email||`#${p.id}`,h=c?.label||c?.display_name||c?.email||"current";try{let v=await l.switchAccount(p.id);if(v.status==="success"&&v.verified){try{(await b.commands.getCommands(!0)).includes("antigravity.handleAuthRefresh")&&await b.commands.executeCommand("antigravity.handleAuthRefresh")}catch{}b.window.showInformationMessage(`\u26A1 AI-Quota Auto-Switch: "${h}" at ${d.toFixed(0)}% \u2192 switched to "${g}" (${(p.best_remaining??0).toFixed(0)}%)`,"Undo Switch","Dismiss").then(async x=>{if(x==="Undo Switch"&&c)try{await l.switchAccount(c.id),a?.refresh()}catch{}}),a?.refresh()}else b.window.showWarningMessage(`AI-Quota Auto-Switch failed for "${g}": ${v.reason}`)}catch(v){b.window.showWarningMessage(`AI-Quota Auto-Switch error: ${String(v)}`)}return}}for(let m of r){let p=m.best_remaining;if(p!=null){if(p<=t){let g=`notified_${m.id}_${Math.floor(p/5)*5}`;if(!u.has(g)){u.add(g),e.globalState.update("ai-quota.notifiedKeys",Array.from(u));let h=m.label||m.display_name||m.email,v=s?["Dismiss"]:["Switch Account","Dismiss"];b.window.showWarningMessage(`\u26A0 AI-Quota: "${h}" quota at ${p.toFixed(0)}%`+(s?" (auto-switch enabled \u2014 will switch automatically)":""),...v).then(x=>{x==="Switch Account"&&b.commands.executeCommand("ai-quota.switchAccount")})}}else if(p>t+10){let g=!1;for(let h of Array.from(u))h.startsWith(`notified_${m.id}_`)&&(u.delete(h),g=!0);g&&e.globalState.update("ai-quota.notifiedKeys",Array.from(u))}}}}catch{}}0&&(module.exports={activate,deactivate});
