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
    try {
      const body = await r.json();
      message = body.detail || message;
    } catch (_) {}
    throw new Error(message);
  }
  return r.status === 204 ? null : r.json();
}

function formatReset(value) {
  if (!value) return '—';
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

function renderAccounts() {
  $('#accountCount').textContent = accounts.length;

  if (!accounts.length) {
    $('#accounts').innerHTML = '<div class="empty">No accounts yet. Add your first account metadata.</div>';
    return;
  }

  $('#accounts').innerHTML = accounts.map(a => `
    <article class="account">
      <div class="account-head">
        <div>
          <div class="account-name">${esc(a.display_name || a.email)}</div>
          <div class="account-email">${esc(a.email)}</div>
        </div>
        <span class="pill">${esc(a.provider)}</span>
      </div>
    </article>`).join('');
}

function renderSnapshots() {
  $('#windowCount').textContent = snapshots.length;

  if (!snapshots.length) {
    $('#snapshots').innerHTML = '<div class="empty">No quota snapshots yet. Provider adapters will populate this table.</div>';
    return;
  }

  const names = Object.fromEntries(accounts.map(a => [a.id, a.display_name || a.email]));

  $('#snapshots').innerHTML = `
    <table class="quota-table">
      <thead>
        <tr>
          <th>Account</th>
          <th>Service / model</th>
          <th>Window</th>
          <th>Remaining</th>
          <th>Reset</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${snapshots.map(s => {
          const pct = s.remaining_percent == null ? null : Number(s.remaining_percent);
          const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
          return `<tr>
            <td>${esc(names[s.account_id] || s.account_id)}</td>
            <td>${esc(s.service)}<br><small>${esc(s.model || 'All models')}</small></td>
            <td>${esc(s.window_name)}</td>
            <td>${pct == null ? '—' : `<b>${pct}%</b><div class="meter"><i style="width:${width}%"></i></div>`}</td>
            <td class="reset" data-reset="${esc(s.reset_at || '')}">${formatReset(s.reset_at)}</td>
            <td>${esc(s.source)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function updateLiveClock() {
  const now = new Date();

  if (lastSyncAt) {
    $('#lastSync').textContent = lastSyncAt.toLocaleTimeString();
  }

  document.querySelectorAll('[data-reset]').forEach(el => {
    el.textContent = formatReset(el.dataset.reset);
  });

  document.title = `AI Quota • ${now.toLocaleTimeString()}`;
}

async function load({silent = false} = {}) {
  try {
    const [nextAccounts, nextSnapshots] = await Promise.all([
      api('/api/accounts'),
      api('/api/snapshots'),
    ]);

    accounts = nextAccounts;
    snapshots = nextSnapshots;
    lastSyncAt = new Date();

    renderAccounts();
    renderSnapshots();
    updateLiveClock();
  } catch (e) {
    console.error(e);
    if (!silent) {
      alert(`Could not load AI Quota data: ${e.message}`);
    }
  }
}

$('#addAccount').onclick = () => $('#accountDialog').showModal();

$('#accountForm').onsubmit = async (e) => {
  e.preventDefault();

  // Keep a stable reference before awaiting. Native Event.currentTarget can become
  // null after an awaited promise, which caused the old "reading 'reset'" error.
  const form = e.currentTarget;
  const submitButton = form.querySelector('button[value="default"]');
  const data = Object.fromEntries(new FormData(form));

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';
  }

  try {
    await api('/api/accounts', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });

    form.reset();
    $('#accountDialog').close();
    await load({silent: true});
  } catch (err) {
    alert(`Could not add account: ${err.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Save';
    }
  }
};

$('#refresh').onclick = async () => {
  const button = $('#refresh');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Refreshing…';
  try {
    await load();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
};

function startLiveUpdates() {
  if (!liveTimer) {
    liveTimer = setInterval(updateLiveClock, 1000);
  }

  if (!refreshTimer) {
    // Poll the local backend so provider-collected snapshots can appear without
    // requiring a page reload. The countdown itself remains entirely local.
    refreshTimer = setInterval(() => load({silent: true}), 30000);
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    load({silent: true});
  }
});

startLiveUpdates();
load({silent: true});
