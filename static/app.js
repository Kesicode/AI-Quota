const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

let dashboard = {summary:{}, accounts:[], ranking:[]};
let liveTimer = null;
let refreshTimer = null;
let lastDataAt = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.headers || {}),
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch (_) {}
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

function formatReset(resetAt) {
  if (!resetAt) return { countdown: '—', timestamp: '—' };
  const ms = new Date(resetAt).getTime() - Date.now();
  return {
    countdown: formatDuration(ms / 1000),
    timestamp: new Date(resetAt).toLocaleString(),
  };
}

function statusLabel(status) {
  return ({live:'LIVE', stale:'STALE', not_connected:'NOT CONNECTED', exhausted:'EXHAUSTED'}[status] || 'UNKNOWN');
}

function statusClass(status) {
  return ({live:'live', stale:'stale', not_connected:'not-connected', exhausted:'exhausted'}[status] || 'unknown');
}

function bestQuota(account) {
  const candidates = (account.snapshots || []).filter(s => s.remaining_percent != null && s.window_name !== 'Context Window');
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => Number(current.remaining_percent) > Number(best.remaining_percent) ? current : best);
}

function renderSummary() {
  const summary = dashboard.summary || {};
  $('#accountCount').textContent = summary.accounts ?? 0;
  $('#liveCount').textContent = summary.live ?? 0;
  $('#accountStates').textContent = `${summary.live ?? 0} live · ${summary.stale ?? 0} stale · ${summary.not_connected ?? 0} not connected · ${summary.exhausted ?? 0} exhausted`;

  const bestId = summary.best_account_id;
  const best = dashboard.ranking?.find(a => a.id === bestId) || null;
  if (!best) {
    $('#bestAccount').textContent = 'No live quota yet';
    $('#bestDetails').textContent = 'Connect at least one Antigravity CLI account to get a real provider reading.';
    return;
  }
  const quota = bestQuota(best);
  $('#bestAccount').textContent = best.display_name || best.email;
  $('#bestDetails').textContent = quota
    ? `${best.email} · ${quota.window_name} · ${Number(quota.remaining_percent).toFixed(1)}% remaining · resets ${formatReset(quota.reset_at).countdown}`
    : `${best.email} · ${statusLabel(best.status)}`;
}

function renderQuotaRow(snapshot) {
  const pct = snapshot.remaining_percent == null ? null : Number(snapshot.remaining_percent);
  const reset = formatReset(snapshot.reset_at);
  const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const pctLabel = pct == null ? 'Unknown' : `${pct.toFixed(pct % 1 ? 1 : 0)}%`;
  const unitLine = snapshot.limit_units != null
    ? `${snapshot.used_units != null ? Number(snapshot.used_units).toLocaleString() : '—'} / ${Number(snapshot.limit_units).toLocaleString()} ${esc(snapshot.unit || '')}`
    : (snapshot.unit ? esc(snapshot.unit) : 'Provider quota');
  return `<div class="quota-row">
    <div class="quota-main">
      <div class="quota-name">${esc(snapshot.window_name)} <span>${esc(snapshot.model || '')}</span></div>
      <div class="meter"><i style="width:${width}%"></i></div>
      <small>${unitLine}</small>
    </div>
    <div class="quota-side"><strong>${pctLabel}</strong><span data-reset="${esc(snapshot.reset_at || '')}">${reset.countdown}</span><small>${reset.timestamp}</small></div>
  </div>`;
}

function renderAccounts() {
  const container = $('#accounts');
  const accounts = dashboard.accounts || [];
  if (!accounts.length) {
    container.innerHTML = `<div class="empty">No accounts yet. Add your 10–15 accounts here.</div>`;
    return;
  }

  container.innerHTML = accounts.map(account => {
    const quota = bestQuota(account);
    const status = account.status || 'not_connected';
    const snapshots = account.snapshots || [];
    const context = snapshots.find(s => s.window_name === 'Context Window');
    const credits = account.credits_remaining == null ? '—' : Number(account.credits_remaining).toLocaleString();
    const liveAge = account.telemetry_age_seconds == null ? null : Number(account.telemetry_age_seconds);
    const lastSeen = account.last_seen_at ? new Date(account.last_seen_at).toLocaleString() : 'Never';
    const staleNote = liveAge == null ? 'No telemetry received' : `Last payload ${formatDuration(liveAge)} ago`;
    const connectText = status === 'live' ? 'Connected' : 'Connect source';
    return `<article class="account-card ${statusClass(status)}">
      <div class="account-card-head">
        <div class="account-title-wrap">
          <span class="status-indicator"></span>
          <div><div class="account-name">${esc(account.display_name || account.email)}</div><div class="account-email">${esc(account.email)}</div></div>
        </div>
        <div class="account-actions"><span class="state-badge">${statusLabel(status)}</span><button class="tiny-button details" data-id="${account.id}">Details</button></div>
      </div>
      <div class="account-meta"><span>${esc(account.provider)}</span><span>${esc(account.client || 'Provider')}</span>${account.plan_tier ? `<span>Plan: ${esc(account.plan_tier)}</span>` : ''}</div>
      <div class="quota-summary">
        ${quota ? `<div class="summary-box"><span>Best remaining</span><strong>${Number(quota.remaining_percent).toFixed(1)}%</strong><small>${esc(quota.window_name)} · reset ${formatReset(quota.reset_at).countdown}</small></div>` : `<div class="summary-box muted"><span>Quota</span><strong>Unknown</strong><small>${esc(staleNote)}</small></div>`}
        <div class="summary-box"><span>Credits</span><strong>${credits}</strong><small>Only shown when a real balance is collected</small></div>
        <div class="summary-box"><span>Context</span><strong>${context?.remaining_percent != null ? `${Number(context.remaining_percent).toFixed(1)}%` : '—'}</strong><small>${context?.used_units != null && context?.limit_units != null ? `${Number(context.used_units).toLocaleString()} / ${Number(context.limit_units).toLocaleString()} tokens` : 'Not reported'}</small></div>
      </div>
      <div class="account-foot"><span>Last sync: ${esc(lastSeen)}</span>${account.provider.toLowerCase() === 'antigravity' && (account.client || '').toLowerCase().includes('cli') ? `<button class="button ${status === 'live' ? '' : 'primary'} connect" data-id="${account.id}">${connectText}</button>` : `<button class="button connect unsupported" data-id="${account.id}">Source setup</button>`}</div>
    </article>`;
  }).join('');

  container.querySelectorAll('.details').forEach(btn => btn.addEventListener('click', () => openDetails(Number(btn.dataset.id))));
  container.querySelectorAll('.connect').forEach(btn => btn.addEventListener('click', () => connect(Number(btn.dataset.id), btn)));
}

function updateCountdowns() {
  document.querySelectorAll('[data-reset]').forEach(el => {
    el.textContent = formatReset(el.dataset.reset).countdown;
  });
  const now = new Date();
  $('#localClock').textContent = now.toLocaleTimeString();
}

async function load(silent = false) {
  try {
    dashboard = await api('/api/dashboard');
    lastDataAt = new Date();
    renderSummary();
    renderAccounts();
    updateCountdowns();
  } catch (error) {
    console.error(error);
    if (!silent) alert(`Could not load AI Quota: ${error.message}`);
  }
}

async function syncNow() {
  const button = $('#sync');
  button.disabled = true;
  const old = button.textContent;
  button.textContent = 'Syncing…';
  try {
    await api('/api/sync', {method:'POST'});
    await load(false);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

async function connect(id, button) {
  button.disabled = true;
  const old = button.textContent;
  button.textContent = 'Installing…';
  try {
    const result = await api(`/api/accounts/${id}/connect`, {method:'POST'});
    if (!result.ok) {
      alert(result.message);
      return;
    }
    alert(`${result.message}\n\nSettings: ${result.settings_path}`);
    await load(false);
  } catch (error) {
    alert(`Could not connect source: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

function findAccount(id) {
  return dashboard.accounts.find(account => Number(account.id) === Number(id));
}

function openDetails(id) {
  const account = findAccount(id);
  if (!account) return;
  $('#detailName').textContent = account.display_name || account.email;
  $('#detailMeta').textContent = `${account.email} · ${account.provider} · ${account.client || 'Provider'}`;
  const body = $('#detailBody');
  const snapshots = account.snapshots || [];
  const context = snapshots.find(s => s.window_name === 'Context Window');
  const quotaSnapshots = snapshots.filter(s => s.window_name !== 'Context Window');
  body.innerHTML = `<div class="detail-grid">
    <div class="detail-stat"><span>Status</span><strong class="${statusClass(account.status)}-text">${statusLabel(account.status)}</strong></div>
    <div class="detail-stat"><span>Plan</span><strong>${esc(account.plan_tier || 'Unknown')}</strong></div>
    <div class="detail-stat"><span>Credits</span><strong>${account.credits_remaining == null ? 'Unknown' : Number(account.credits_remaining).toLocaleString()}</strong></div>
    <div class="detail-stat"><span>Last telemetry</span><strong>${account.last_seen_at ? new Date(account.last_seen_at).toLocaleString() : 'Never'}</strong></div>
  </div>
  <section class="detail-section"><h3>Quota windows</h3>${quotaSnapshots.length ? quotaSnapshots.map(renderQuotaRow).join('') : '<div class="empty compact">No provider quota snapshot collected yet.</div>'}</section>
  <section class="detail-section"><h3>Context window</h3>${context ? renderQuotaRow(context) : '<div class="empty compact">No context token data collected yet.</div>'}</section>`;
  $('#detailDialog').showModal();
}

$('#addAccount').onclick = () => $('#accountDialog').showModal();
$('#closeDetail').onclick = () => $('#detailDialog').close();
$('#sync').onclick = syncNow;

$('#accountForm').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[value="default"]');
  const data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    await api('/api/accounts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    form.reset();
    $('#accountDialog').close();
    await load(false);
  } catch (error) {
    alert(`Could not add account: ${error.message}`);
  } finally {
    button.disabled = false;
  }
};

if (!liveTimer) liveTimer = setInterval(updateCountdowns, 1000);
if (!refreshTimer) refreshTimer = setInterval(() => load(true), 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
load(true);
