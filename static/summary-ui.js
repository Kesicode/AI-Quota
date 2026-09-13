(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const byId = (id) => document.getElementById(id);
  const statusOf = (a) => {
    const raw = String(a?.status || 'not_connected');
    const age = Number(a?.telemetry_age_seconds);
    if ((raw === 'live' || raw === 'exhausted') && Number.isFinite(age) && age > 90) return 'stale';
    return raw;
  };
  const windowsOf = (a) => (Array.isArray(a?.snapshots) ? a.snapshots : []).filter(s => s?.remaining_percent != null && s?.window_name !== 'Context Window');
  const scoreOf = (a) => { const v = windowsOf(a).map(s => Number(s.remaining_percent)).filter(Number.isFinite); return v.length ? Math.min(...v) : null; };
  const nextReset = (a) => {
    const now = Date.now();
    const rows = windowsOf(a).filter(s => s?.reset_at && new Date(s.reset_at).getTime() > now);
    return rows.length ? rows.reduce((x,y) => new Date(y.reset_at) < new Date(x.reset_at) ? y : x) : null;
  };
  const countdown = (at) => {
    const ms = new Date(at).getTime() - Date.now();
    if (!Number.isFinite(ms)) return 'Unknown';
    if (ms <= 0) return 'Ready';
    let s = Math.ceil(ms / 1000);
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(m).padStart(2,'0')}m`;
    if (m) return `${m}m ${String(s).padStart(2,'0')}s`;
    return `${s}s`;
  };
  const clientOf = (a) => a?.client || a?.provider || 'Provider';
  const emailOf = (a) => a?.email || 'Unknown account';

  function render() {
    const accounts = Array.isArray(window.__aiQuotaDashboard?.accounts) ? window.__aiQuotaDashboard.accounts : [];
    if (!accounts.length) return;

    const states = accounts.reduce((m, a) => {
      const s = statusOf(a); m[s] = (m[s] || 0) + 1; return m;
    }, {});
    const live = accounts.filter(a => statusOf(a) === 'live');
    const candidates = (live.length ? live : accounts.filter(a => statusOf(a) === 'stale'))
      .filter(a => scoreOf(a) != null)
      .sort((a,b) => scoreOf(b) - scoreOf(a));
    const best = candidates[0] || null;
    const renewals = accounts
      .map(a => ({a, r: nextReset(a)}))
      .filter(x => x.r)
      .sort((x,y) => new Date(x.r.reset_at) - new Date(y.r.reset_at));
    const next = renewals[0] || null;

    const liveEmails = live.length
      ? live.map(a => `<span class="summary-email-chip">${esc(emailOf(a))}</span>`).join('')
      : '<span class="summary-empty">No live account yet.</span>';
    const suggestions = candidates.slice(0, 3).map((a, i) => {
      const s = scoreOf(a), r = nextReset(a);
      return `<div class="recommend-row"><span class="recommend-rank">${i + 1}</span><div class="recommend-main"><strong>${esc(emailOf(a))}</strong><small>${esc(clientOf(a))} · ${statusOf(a).toUpperCase()}</small></div><div class="recommend-metric"><strong>${s == null ? 'Unknown' : `${s.toFixed(s % 1 ? 1 : 0)}%`}</strong><small>${r ? `renews ${countdown(r.reset_at)}` : 'no reset data'}</small></div></div>`;
    }).join('') || '<div class="summary-empty">Connect a provider to receive suggestions.</div>';

    const root = byId('smart-summary');
    if (!root) return;
    root.innerHTML = `
      <div class="smart-card"><div class="smart-label">REGISTERED ACCOUNTS</div><div class="smart-number">${accounts.length}</div><div class="smart-sub">${states.live || 0} live · ${states.stale || 0} stale · ${states.not_connected || 0} not connected · ${states.exhausted || 0} exhausted</div><div class="smart-email-list">${liveEmails}</div></div>
      <div class="smart-card smart-best"><div class="smart-label">BEST ACCOUNT TO USE NOW</div><div class="smart-title">${esc(best ? emailOf(best) : 'No live quota')}</div><div class="smart-sub">${best ? `${esc(clientOf(best))} · ${scoreOf(best).toFixed(scoreOf(best) % 1 ? 1 : 0)}% remaining` : 'Only accounts with reported quota can be ranked.'}</div><div class="smart-reason">${best ? 'Prefers live provider telemetry and compares the most constrained reported window.' : 'No authoritative remaining quota is available yet.'}</div></div>
      <div class="smart-card smart-renew"><div class="smart-label">NEXT FASTEST RENEWAL</div><div class="smart-title">${esc(next ? emailOf(next.a) : 'No reset data')}</div><div class="smart-sub">${next ? `${esc(clientOf(next.a))} · ${countdown(next.r.reset_at)}` : 'A provider must report a reset timestamp first.'}</div><div class="smart-reason">${next ? `Window: ${esc(next.r.window_name || 'Quota')}` : 'No authoritative reset timestamp is available.'}</div></div>
      <div class="smart-card smart-recommendations"><div class="smart-label">ACCOUNT SUGGESTIONS</div><div class="recommend-list">${suggestions}</div></div>`;
  }

  async function refresh() {
    try {
      // The main dashboard performs the provider sync. This read-only request
      // prevents the summary from triggering a second provider sync loop.
      const r = await fetch('/api/dashboard?sync=false', {cache:'no-store', headers:{'Cache-Control':'no-cache'}});
      if (!r.ok) return;
      window.__aiQuotaDashboard = await r.json();
      render();
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    refresh();
    setInterval(refresh, 5000);
    setInterval(render, 1000);
  }, {once:true});
})();
