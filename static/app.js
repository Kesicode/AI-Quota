const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

let dashboard = {summary:{}, accounts:[], ranking:[]};
let liveTimer;
let refreshTimer;
let pendingDeleteId = null;

const PROVIDERS = {
  cloud_code: {key:'cloud_code', label:'Cloud Code / Cloud Shell', priority:100, live:false, truth:'official UI-derived', note:'Cloud Code weekly usage is separate from Gemini and Google Cloud project quotas.'},
  google_cloud: {key:'google_cloud', label:'Google Cloud quotas', priority:90, live:false, truth:'official API/CLI-derived', note:'Project/service quotas are a different data class from Cloud Code weekly hours.'},
  codex: {key:'codex', label:'OpenAI / Codex', priority:80, live:false, truth:'supported provider surface', note:'Codex usage and API usage are separate authorities.'},
  antigravity: {key:'antigravity', label:'Antigravity', priority:70, live:true, truth:'provider-local', note:'Live collectors are implemented for supported Antigravity surfaces.'},
  gemini: {key:'gemini', label:'Gemini API', priority:60, live:false, truth:'project/API-derived', note:'Do not use Gemini API values as Cloud Code values.'},
  copilot: {key:'copilot', label:'GitHub Copilot', priority:50, live:false, truth:'provider surface', note:'Usage/credits depend on current Copilot plan and supported surfaces.'},
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {'Cache-Control':'no-cache','Pragma':'no-cache',...(options.headers || {})},
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try { message = (await response.json()).detail || message; } catch (_) {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  let s = Math.max(0, Math.ceil(Number(seconds)));
  if (s <= 0) return 'Ready';
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${String(m).padStart(2,'0')}m`;
  if (m) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

function resetInfo(resetAt) {
  if (!resetAt) return {countdown:'—', timestamp:'—'};
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return {countdown:'—', timestamp:'—'};
  return {countdown:formatDuration((date.getTime() - Date.now()) / 1000), timestamp:date.toLocaleString()};
}

function providerMeta(account) {
  const provider = String(account.provider || '').trim().toLowerCase();
  const client = String(account.client || '').trim().toLowerCase();
  if (client.includes('cloud code') || client.includes('cloud shell')) return PROVIDERS.cloud_code;
  if (client.includes('google cloud quotas') || client.includes('project quota')) return PROVIDERS.google_cloud;
  if (client.includes('codex') || provider === 'openai / codex') return PROVIDERS.codex;
  if (provider === 'antigravity') return PROVIDERS.antigravity;
  if (client.includes('gemini') || provider === 'gemini api') return PROVIDERS.gemini;
  if (client.includes('copilot') || provider === 'github copilot') return PROVIDERS.copilot;
  if (provider === 'cloud code') return PROVIDERS.cloud_code;
  if (provider === 'google cloud') return PROVIDERS.google_cloud;
  return {key:'other', label:account.provider || 'Other', priority:10, live:false, truth:'unknown', note:'No authoritative collector is implemented yet.'};
}

function clientKind(account) {
  const c = String(account.client || '').toLowerCase();
  if (c.includes('antigravity 2.0')) return 'antigravity2';
  if (c.includes('cli')) return 'cli';
  return 'other';
}

function effectiveStatus(account) {
  const raw = account.status || 'not_connected';
  const age = Number(account.telemetry_age_seconds);
  if ((raw === 'live' || raw === 'exhausted') && Number.isFinite(age) && age > 90) return 'stale';
  return raw;
}

function quotaWindows(account) {
  return (account.snapshots || []).filter(s => s.remaining_percent != null && s.window_name !== 'Context Window');
}

function criticalQuota(account) {
  const list = quotaWindows(account);
  if (!list.length) return null;
  return list.reduce((min, cur) => Number(cur.remaining_percent) < Number(min.remaining_percent) ? cur : min);
}

function healthScore(account) {
  const list = quotaWindows(account);
  if (!list.length) return -1;
  return Math.min(...list.map(s => Number(s.remaining_percent)));
}

function statusLabel(s) {
  return ({live:'LIVE',stale:'STALE',not_connected:'NOT CONNECTED',exhausted:'EXHAUSTED'}[s] || 'UNKNOWN');
}

function statusClass(s) {
  return ({live:'live',stale:'stale',not_connected:'not-connected',exhausted:'exhausted'}[s] || 'unknown');
}

function providerAccounts(key) {
  return (dashboard.accounts || []).filter(a => providerMeta(a).key === key);
}

function renderPriorityHeroes() {
  const cloud = providerAccounts('cloud_code');
  const codex = providerAccounts('codex');
  const cloudLive = cloud.find(a => effectiveStatus(a) === 'live');
  const codexLive = codex.find(a => effectiveStatus(a) === 'live');
  $('#cloudCodeHero').textContent = cloudLive ? (cloudLive.display_name || cloudLive.email) : (cloud.length ? 'Registered · not connected' : 'Not connected');
  $('#cloudCodeHeroDetails').textContent = cloudLive ? `${cloudLive.email} · authoritative telemetry` : 'Cloud Code is intentionally separated from Gemini API and Google Cloud project quotas.';
  $('#codexHero').textContent = codexLive ? (codexLive.display_name || codexLive.email) : (codex.length ? 'Registered · not connected' : 'Not connected');
  $('#codexHeroDetails').textContent = codexLive ? `${codexLive.email} · provider telemetry` : 'Codex usage is tracked separately from OpenAI API limits.';
}

function renderSummary() {
  const accounts = dashboard.accounts || [];
  const states = accounts.reduce((m,a) => { const s=effectiveStatus(a); m[s]=(m[s]||0)+1; return m; }, {});
  $('#accountCount').textContent = accounts.length;
  $('#liveCount').textContent = states.live || 0;
  $('#accountStates').textContent = `${states.live||0} live · ${states.stale||0} stale · ${states.not_connected||0} not connected · ${states.exhausted||0} exhausted`;
  renderPriorityHeroes();
}

function renderQuotaRow(snapshot) {
  const pct = snapshot.remaining_percent == null ? null : Number(snapshot.remaining_percent);
  const reset = resetInfo(snapshot.reset_at);
  const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const label = pct == null ? 'Unknown' : `${pct.toFixed(pct % 1 ? 1 : 0)}%`;
  const units = snapshot.limit_units != null
    ? `${snapshot.used_units != null ? Number(snapshot.used_units).toLocaleString() : '—'} / ${Number(snapshot.limit_units).toLocaleString()} ${esc(snapshot.unit || '')}`
    : (snapshot.unit ? esc(snapshot.unit) : 'Provider quota');
  return `<div class="quota-row"><div class="quota-main"><div class="quota-name">${esc(snapshot.window_name)} <span>${esc(snapshot.model || '')}</span></div><div class="meter"><i style="width:${width}%"></i></div><small>${units}</small></div><div class="quota-side"><strong>${label}</strong><span data-reset="${esc(snapshot.reset_at || '')}">${reset.countdown}</span><small>${reset.timestamp}</small></div></div>`;
}

function filteredAccounts() {
  const q = ($('#accountSearch')?.value || '').trim().toLowerCase();
  const filter = $('#statusFilter')?.value || 'all';
  const sort = $('#sortAccounts')?.value || 'best';
  let list = [...(dashboard.accounts || [])];
  if (q) list = list.filter(a => `${a.email} ${a.display_name||''} ${a.provider||''} ${a.client||''}`.toLowerCase().includes(q));
  if (filter !== 'all') list = list.filter(a => effectiveStatus(a) === filter);
  const statusRank = {live:4,stale:3,not_connected:2,exhausted:1};
  list.sort((a,b) => {
    if (sort === 'priority') return providerMeta(b).priority - providerMeta(a).priority || healthScore(b) - healthScore(a);
    if (sort === 'name') return String(a.display_name||a.email).localeCompare(String(b.display_name||b.email));
    if (sort === 'status') return (statusRank[effectiveStatus(b)]||0)-(statusRank[effectiveStatus(a)]||0);
    if (sort === 'client') return String(a.client||'').localeCompare(String(b.client||''));
    return healthScore(b)-healthScore(a) || providerMeta(b).priority-providerMeta(a).priority;
  });
  return list;
}

function setEmptyState(isEmpty) {
  const controls = $('.toolbar-controls');
  const subbar = $('.account-subbar');
  if (controls) controls.style.display = isEmpty ? 'none' : '';
  if (subbar) subbar.style.display = isEmpty ? 'none' : '';
}

function connectButton(account, status, kind) {
  if (kind === 'cli') return {text:status === 'live' ? 'CLI collector on' : 'Enable CLI collector', enabled:true, primary:status !== 'live'};
  if (kind === 'antigravity2') return {text:status === 'live' ? '2.0 connected · Sync' : 'Connect 2.0', enabled:true, primary:true};
  const meta = providerMeta(account);
  return {text:meta.live ? 'Source setup' : 'Collector unavailable', enabled:false, primary:false};
}

function renderAccounts() {
  const container = $('#accounts');
  const all = dashboard.accounts || [];
  const list = filteredAccounts();
  $('#visibleCount').textContent = `${list.length} shown`;
  setEmptyState(all.length === 0);
  if (!all.length) { container.innerHTML = '<div class="empty">No accounts yet.</div>'; return; }
  if (!list.length) { container.innerHTML = '<div class="empty">No accounts match your search/filter.</div>'; return; }
  container.innerHTML = list.map(account => {
    const status = effectiveStatus(account);
    const critical = criticalQuota(account);
    const snapshots = account.snapshots || [];
    const context = snapshots.find(s => s.window_name === 'Context Window');
    const credits = account.credits_remaining == null ? '—' : Number(account.credits_remaining).toLocaleString();
    const lastSeen = account.last_seen_at ? new Date(account.last_seen_at).toLocaleString() : 'Never';
    const kind = clientKind(account);
    const meta = providerMeta(account);
    const connect = connectButton(account, status, kind);
    const priority = meta.priority >= 80 ? '<span class="priority-chip">PRIORITY</span>' : '';
    const truth = `<span class="truth-chip">${esc(meta.truth)}</span>`;
    const actionClass = `${connect.primary ? ' primary' : ''}${connect.enabled ? '' : ' disabled-button'}`;
    return `<article class="account-card ${statusClass(status)}">
      <div class="account-card-head"><div class="account-title-wrap"><span class="status-indicator"></span><div><div class="account-name">${esc(account.display_name || account.email)}</div><div class="account-email">${esc(account.email)}</div></div></div>
        <div class="account-actions"><span class="state-badge">${statusLabel(status)}</span><button class="tiny-button details" data-id="${account.id}">Details</button></div>
      </div>
      <div class="account-meta"><span>${esc(account.provider)}</span><span>${esc(account.client || 'Provider')}</span>${account.plan_tier ? `<span>Plan: ${esc(account.plan_tier)}</span>` : ''}${priority}${truth}</div>
      <div class="provider-note">${esc(meta.note)}</div>
      <div class="quota-summary">${critical ? `<div class="summary-box"><span>Most constrained</span><strong>${Number(critical.remaining_percent).toFixed(1)}%</strong><small>${esc(critical.window_name)} · reset ${resetInfo(critical.reset_at).countdown}</small></div>` : `<div class="summary-box muted"><span>Quota</span><strong>Unknown</strong><small>${account.telemetry_age_seconds == null ? 'No telemetry received' : `Last telemetry ${formatDuration(account.telemetry_age_seconds)} ago`}</small></div>`}<div class="summary-box"><span>Credits</span><strong>${credits}</strong><small>Only shown when collected from a real provider source</small></div><div class="summary-box"><span>Context</span><strong>${context?.remaining_percent != null ? `${Number(context.remaining_percent).toFixed(1)}%` : '—'}</strong><small>${context?.used_units != null && context?.limit_units != null ? `${Number(context.used_units).toLocaleString()} / ${Number(context.limit_units).toLocaleString()} tokens` : 'Not reported'}</small></div></div>
      <div class="account-foot"><span>Last sync: ${esc(lastSeen)}</span><div class="account-foot-actions"><button class="button danger-outline delete-account" data-id="${account.id}">Delete</button><button class="button${actionClass} connect" data-id="${account.id}" data-kind="${kind}" ${connect.enabled ? '' : 'disabled'}>${connect.text}</button></div></div>
    </article>`;
  }).join('');
  container.querySelectorAll('.details').forEach(b => b.onclick = () => openDetails(Number(b.dataset.id)));
  container.querySelectorAll('.connect').forEach(b => b.onclick = () => connect(Number(b.dataset.id), b, b.dataset.kind));
  container.querySelectorAll('.delete-account').forEach(b => b.onclick = () => openDelete(Number(b.dataset.id)));
}

function updateCountdowns() {
  $('#localClock').textContent = new Date().toLocaleTimeString();
  document.querySelectorAll('[data-reset]').forEach(el => el.textContent = resetInfo(el.dataset.reset).countdown);
}

async function load(silent = false) {
  try {
    dashboard = await api('/api/dashboard');
    renderSummary();
    renderAccounts();
    updateCountdowns();
  } catch (e) {
    console.error(e);
    if (!silent) alert(`Could not load AI Quota: ${e.message}`);
  }
}

async function syncNow() {
  const b = $('#sync'); const old = b.textContent; b.disabled = true; b.textContent = 'Syncing…';
  try { await api('/api/sync',{method:'POST'}); await load(false); }
  catch(e) { alert(`Sync failed: ${e.message}`); }
  finally { b.disabled = false; b.textContent = old; }
}

async function installCliCollector(id,b) {
  const old=b.textContent; b.disabled=true; b.textContent='Installing…';
  try { const r=await api(`/api/accounts/${id}/connect`,{method:'POST'}); if(!r.ok){alert(r.message);return;} alert(`${r.message}\n\nRestart Antigravity CLI, then return here.`); await load(false); }
  catch(e){alert(`Could not enable the CLI collector: ${e.message}`);} finally{b.disabled=false;b.textContent=old;}
}

async function connectDesktop(id,b) {
  const old=b.textContent; b.disabled=true; b.textContent='Connecting…';
  try { const r=await api(`/api/accounts/${id}/connect`,{method:'POST'}); if(!r.ok){alert(`${r.message || 'Antigravity 2.0 is not ready.'}${r.error ? `\n\n${r.error}`:''}`);return;} await load(false); alert(`Connected to Antigravity 2.0 for ${r.email}.`); }
  catch(e){alert(`Could not connect Antigravity 2.0: ${e.message}`);} finally{b.disabled=false;b.textContent=old;}
}

function connect(id,b,kind){ if(kind==='cli') return installCliCollector(id,b); if(kind==='antigravity2') return connectDesktop(id,b); }

async function enableGlobalCollector(){
  const account=(dashboard.accounts||[]).find(a=>String(a.provider||'').toLowerCase()==='antigravity' && String(a.client||'').toLowerCase().includes('cli'));
  if(!account){alert('Add at least one Antigravity CLI account first.');$('#accountDialog')?.showModal();return;}
  await installCliCollector(account.id,$('#enableAntigravity'));
}

function findAccount(id){return (dashboard.accounts||[]).find(a=>Number(a.id)===Number(id));}

function openDetails(id){
  const a=findAccount(id); if(!a) return;
  const meta=providerMeta(a);
  $('#detailName').textContent=a.display_name||a.email;
  $('#detailMeta').textContent=`${a.email} · ${a.provider} · ${a.client||'Provider'}`;
  const rows=(a.snapshots||[]).filter(s=>s.window_name!=='Context Window');
  const context=(a.snapshots||[]).find(s=>s.window_name==='Context Window');
  $('#detailBody').innerHTML=`<div class="detail-grid"><div class="detail-stat"><span>Status</span><strong class="${statusClass(effectiveStatus(a))}-text">${statusLabel(effectiveStatus(a))}</strong></div><div class="detail-stat"><span>Authority</span><strong>${esc(meta.truth)}</strong></div><div class="detail-stat"><span>Plan</span><strong>${esc(a.plan_tier||'Unknown')}</strong></div><div class="detail-stat"><span>Last telemetry</span><strong>${a.last_seen_at?new Date(a.last_seen_at).toLocaleString():'Never'}</strong></div></div><section class="detail-section"><h3>Provider truth</h3><p>${esc(meta.note)}</p></section><section class="detail-section"><h3>Quota windows</h3>${rows.length?rows.map(renderQuotaRow).join(''):'<div class="empty compact">No provider quota snapshot collected yet.</div>'}</section><section class="detail-section"><h3>Context window</h3>${context?renderQuotaRow(context):'<div class="empty compact">No context token data collected yet.</div>'}</section>`;
  $('#detailDialog')?.showModal();
}

function openDelete(id){
  const a=findAccount(id); if(!a) return;
  pendingDeleteId=id;
  $('#deleteMessage').textContent=`This will permanently remove “${a.display_name||a.email}” (${a.email} · ${a.client||a.provider}) and its stored quota history from this local AI Quota instance.`;
  $('#deleteDialog')?.showModal();
}

async function confirmDeleteAccount(){
  if(!pendingDeleteId) return;
  const b=$('#confirmDelete'); b.disabled=true;
  try{await api(`/api/accounts/${pendingDeleteId}`,{method:'DELETE'}); pendingDeleteId=null; $('#deleteDialog')?.close(); await load(false);}
  catch(e){alert(`Could not delete the account: ${e.message}`);} finally{b.disabled=false;}
}

$('#addAccount')?.addEventListener('click',()=>$('#accountDialog')?.showModal());
$('#closeDetail')?.addEventListener('click',()=>$('#detailDialog')?.close());
$('#sync')?.addEventListener('click',syncNow);
$('#enableAntigravity')?.addEventListener('click',enableGlobalCollector);
$('#confirmDelete')?.addEventListener('click',(e)=>{e.preventDefault();confirmDeleteAccount();});
$('#accountForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.currentTarget; const button=form.querySelector('button[value="default"]'); const data=Object.fromEntries(new FormData(form)); button.disabled=true;
  try{await api('/api/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); form.reset(); $('#accountDialog')?.close(); await load(false);}
  catch(err){alert(`Could not add account: ${err.message}`);} finally{button.disabled=false;}
});
$('#accountSearch')?.addEventListener('input',renderAccounts);
$('#statusFilter')?.addEventListener('change',renderAccounts);
$('#sortAccounts')?.addEventListener('change',renderAccounts);

// Close native dialogs by clicking the backdrop (outside the dialog frame).
// This applies to Add Account, Account Details and Delete dialogs.
['accountDialog', 'detailDialog', 'deleteDialog'].forEach((id) => {
  const dialog = document.getElementById(id);
  if (!dialog) return;
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    dialog.close();
    if (id === 'deleteDialog') pendingDeleteId = null;
  });
});

// Escape closes dialogs naturally; keep the delete state in sync when it does.
$('#deleteDialog')?.addEventListener('close', () => { pendingDeleteId = null; });

liveTimer=setInterval(updateCountdowns,1000);
refreshTimer=setInterval(()=>load(true),5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(true);});
load(true);