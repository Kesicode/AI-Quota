const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
let accounts = [];
let snapshots = [];

async function api(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}

function formatReset(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const seconds = Math.max(0, Math.floor((d - Date.now()) / 1000));
  if (seconds <= 0) return 'Ready';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const mins = Math.floor(seconds % 3600 / 60);
  return `${days ? days + 'd ' : ''}${hours ? hours + 'h ' : ''}${mins}m`;
}

function renderAccounts() {
  $('#accountCount').textContent = accounts.length;
  if (!accounts.length) {
    $('#accounts').innerHTML = '<div class="empty">No accounts yet. Add your first account metadata.</div>';
    return;
  }
  $('#accounts').innerHTML = accounts.map(a => `
    <article class="account">
      <div class="account-head"><div><div class="account-name">${esc(a.display_name || a.email)}</div><div class="account-email">${esc(a.email)}</div></div><span class="pill">${esc(a.provider)}</span></div>
    </article>`).join('');
}

function renderSnapshots() {
  $('#windowCount').textContent = snapshots.length;
  if (!snapshots.length) {
    $('#snapshots').innerHTML = '<div class="empty">No quota snapshots yet. Provider adapters will populate this table.</div>';
    return;
  }
  const names = Object.fromEntries(accounts.map(a => [a.id, a.display_name || a.email]));
  $('#snapshots').innerHTML = `<table class="quota-table"><thead><tr><th>Account</th><th>Service / model</th><th>Window</th><th>Remaining</th><th>Reset</th><th>Source</th></tr></thead><tbody>${snapshots.map(s => {
    const pct = s.remaining_percent == null ? null : Number(s.remaining_percent);
    return `<tr><td>${esc(names[s.account_id] || s.account_id)}</td><td>${esc(s.service)}<br><small>${esc(s.model || 'All models')}</small></td><td>${esc(s.window_name)}</td><td>${pct == null ? '—' : `<b>${pct}%</b><div class="meter"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>`}</td><td class="reset" data-reset="${esc(s.reset_at || '')}">${formatReset(s.reset_at)}</td><td>${esc(s.source)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

async function load() {
  try {
    [accounts, snapshots] = await Promise.all([api('/api/accounts'), api('/api/snapshots')]);
    renderAccounts(); renderSnapshots();
    $('#lastSync').textContent = new Date().toLocaleTimeString();
  } catch (e) { console.error(e); }
}

$('#addAccount').onclick = () => $('#accountDialog').showModal();
$('#accountForm').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  try { await api('/api/accounts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)}); e.currentTarget.reset(); $('#accountDialog').close(); await load(); }
  catch (err) { alert('Could not add account: ' + err.message); }
};
$('#refresh').onclick = load;
setInterval(() => document.querySelectorAll('[data-reset]').forEach(el => el.textContent = formatReset(el.dataset.reset)), 1000);
load();
