const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
let accounts = [];
let snapshots = [];
let lastSyncAt = null;
let refreshTimer = null;
let liveTimer = null;

async function api(url, options = {}) {
  const r = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.headers || {}),
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  });
  if (!r.ok) {
    let message = `${r.status} ${r.statusText}`;
    try { message = (await r.json()).detail || message; } catch (_) {}
    throw new Error(message);
  }
  return r.status === 204 ? null : r.json();
}

function formatReset(value) {
  if (!value) return 'Not available';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const seconds = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 1000));
  if (seconds <= 0) return 'Ready';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days) return `${days}d ${hours}h ${mins}m`;
  if (hours) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  if (mins) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function pctClass(pct) {
  if (pct == null) return '';
  if (pct <= 10) return 'danger';
  if (pct <= 25) return 'warning';
  return 'good';
}

function providerSnapshotsFor(accountId) {
  return snapshots.filter(s => s.account_id === accountId && s.service === 'Antigravity');
}

function renderAccounts() {
  $('#accountCount').textContent = accounts.length;
  if (!accounts.length) {
    $('#accounts').innerHTML = '<div class="empty">No accounts yet. Add your first account.</div>';
    return;
  }

  $('#accounts').innerHTML = accounts.map(a => {
    const isAg = String(a.provider).toLowerCase().includes('antigravity');
    const connected = a.antigravity_connected;
    return `<article class="account">
      <div class="account-head">
        <div>
          <div class="account-name">${esc(a.display_name || a.email)}</div>
          <div class="account-email">${esc(a.email)}</div>
        </div>
        <span class="pill">${esc(a.provider)}</span>
      </div>
      <div class="account-actions">
        ${isAg ? `<span class="connection ${connected ? 'connected' : 'disconnected'}">${connected ? '● Live bridge' : '○ Not connected'}</span>
        <button class="button small" data-connect="${a.id}">${connected ? 'Reconnect' : 'Connect Antigravity'}</button>` : '<span class="muted">Provider integration coming next</span>'}
      </div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-connect]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Installing…';
      try {
        const result = await api(`/api/accounts/${btn.dataset.connect}/antigravity/connect`, {method: 'POST'});
        alert(`${result.message}\n\nSettings: ${result.settings_path}`);
        await load({silent: true});
      } catch (err) {
        alert(`Could not connect Antigravity: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Connect Antigravity';
      }
    };
  });
}

function renderQuotaCards() {
  $('#windowCount').textContent = snapshots.length;
  if (!snapshots.length) {
    $('#quotaCards').innerHTML = `<div class="empty quota-empty">
      <strong>No provider quota has arrived yet.</strong>
      <span>Add an Antigravity account, click <b>Connect Antigravity</b>, then restart/reload Antigravity CLI. Its official status-line telemetry will feed the dashboard.</span>
    </div>`;
    return;
  }

  const names = Object.fromEntries(accounts.map(a => [a.id, a.display_name || a.email]));
  const groups = {};
  for (const s of snapshots) {
    if (!groups[s.account_id]) groups[s.account_id] = [];
    groups[s.account_id].push(s);
  }

  $('#quotaCards').innerHTML = Object.entries(groups).map(([accountId, rows]) => `
    <article class="quota-account">
      <div class="quota-account-head"><div><h3>${esc(names[accountId] || accountId)}</h3><small>${esc(accounts.find(a => String(a.id) === String(accountId))?.email || '')}</small></div><span class="pill">Antigravity</span></div>
      <div class="quota-grid">
        ${rows.map(s => {
          const pct = s.remaining_percent == null ? null : Number(s.remaining_percent);
          const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
          const units = s.used_units != null && s.limit_units != null ? `${s.used_units.toLocaleString()} / ${s.limit_units.toLocaleString()} ${esc(s.unit || '')}` : '';
          return `<div class="quota-card ${pctClass(pct)}">
            <div class="quota-card-top"><span>${esc(s.window_name)}</span><strong>${pct == null ? '—' : `${pct.toFixed(1)}%`}</strong></div>
            <div class="quota-model">${esc(s.model || 'Provider bucket')}</div>
            <div class="meter"><i style="width:${width}%"></i></div>
            <div class="quota-meta"><span>Remaining</span><b>${pct == null ? 'Not available' : `${pct.toFixed(1)}%`}</b></div>
            <div class="quota-meta"><span>Reset in</span><b class="reset" data-reset="${esc(s.reset_at || '')}">${formatReset(s.reset_at)}</b></div>
            ${units ? `<div class="quota-meta"><span>Units</span><b>${units}</b></div>` : ''}
            <div class="quota-source">${esc(s.source)} · ${new Date(s.captured_at).toLocaleTimeString()}</div>
          </div>`;
        }).join('')}
      </div>
    </article>`).join('');
}

function renderSnapshots() {
  if (!snapshots.length) {
    $('#snapshots').innerHTML = '<div class="empty">No captured quota snapshots yet.</div>';
    return;
  }
  const names = Object.fromEntries(accounts.map(a => [a.id, a.display_name || a.email]));
  $('#snapshots').innerHTML = `<table class="quota-table"><thead><tr><th>Account</th><th>Service / model</th><th>Window</th><th>Remaining</th><th>Reset</th><th>Captured</th></tr></thead><tbody>${snapshots.map(s => {
    const pct = s.remaining_percent == null ? null : Number(s.remaining_percent);
    const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    return `<tr><td>${esc(names[s.account_id] || s.account_id)}</td><td>${esc(s.service)}<br><small>${esc(s.model || 'All models')}</small></td><td>${esc(s.window_name)}</td><td>${pct == null ? '—' : `<b>${pct.toFixed(1)}%</b><div class="meter"><i style="width:${width}%"></i></div>`}</td><td class="reset" data-reset="${esc(s.reset_at || '')}">${formatReset(s.reset_at)}</td><td>${new Date(s.captured_at).toLocaleTimeString()}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function updateLiveClock() {
  const now = new Date();
  const clock = $('#localClock');
  if (clock) clock.textContent = now.toLocaleTimeString();
  if (lastSyncAt) $('#lastSync').textContent = lastSyncAt.toLocaleTimeString();
  document.querySelectorAll('[data-reset]').forEach(el => { el.textContent = formatReset(el.dataset.reset); });
  document.title = `AI Quota • ${now.toLocaleTimeString()}`;
}

async function load({silent = false} = {}) {
  try {
    await api('/api/sync', {method: 'POST'});
    const [nextAccounts, nextSnapshots] = await Promise.all([api('/api/accounts'), api('/api/snapshots')]);
    accounts = nextAccounts;
    snapshots = nextSnapshots;
    lastSyncAt = new Date();
    renderAccounts();
    renderQuotaCards();
    renderSnapshots();
    updateLiveClock();
  } catch (e) {
    console.error(e);
    if (!silent) alert(`Could not load AI Quota data: ${e.message}`);
  }
}

$('#addAccount').onclick = () => $('#accountDialog').showModal();

$('#accountForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const submitButton = form.querySelector('button[value="default"]');
  const data = Object.fromEntries(new FormData(form));
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Saving…'; }
  try {
    await api('/api/accounts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    form.reset();
    form.querySelector('[name="provider"]').value = 'Antigravity';
    $('#accountDialog').close();
    await load({silent: true});
  } catch (err) {
    alert(`Could not add account: ${err.message}`);
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Save'; }
  }
};

$('#refresh').onclick = async () => {
  const button = $('#refresh');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Refreshing…';
  try { await load(); } finally { button.disabled = false; button.textContent = original; }
};

function startLiveUpdates() {
  if (!liveTimer) liveTimer = setInterval(updateLiveClock, 1000);
  if (!refreshTimer) refreshTimer = setInterval(() => load({silent: true}), 5000);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) load({silent: true}); });
startLiveUpdates();
load({silent: true});
