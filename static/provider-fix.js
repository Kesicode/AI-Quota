(() => {
  const escSafe = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const cloudMeta = (account) => {
    const provider = String(account?.provider || '').toLowerCase();
    const client = String(account?.client || '').toLowerCase();
    return provider === 'cloud code' || client.includes('cloud code') || client.includes('cloud shell');
  };
  const cloudSnapshots = (account) => (account?.snapshots || []).filter((s) => {
    const client = String(s?.client || '').toLowerCase();
    const service = String(s?.service || '').toLowerCase();
    const model = String(s?.model || '').toLowerCase();
    const name = String(s?.window_name || '').toLowerCase();
    return client.includes('cloud code') || client.includes('cloud shell') || service.includes('cloud code') || model.includes('cloud code') || name.includes('cloud code');
  });
  const cloudWeekly = (account) => {
    const rows = cloudSnapshots(account).filter((s) => {
      const n = String(s?.window_name || '').toLowerCase();
      return n.includes('weekly') || n.includes('week');
    });
    return rows.find((s) => s?.remaining_percent != null) || rows[0] || null;
  };

  window.renderPriorityHeroes = function renderPriorityHeroesFixed() {
    const accounts = window.dashboard?.accounts || [];
    const cloud = accounts.filter(cloudMeta);
    const codex = accounts.filter((a) => String(a?.client || '').toLowerCase().includes('codex') || String(a?.provider || '').toLowerCase().includes('openai / codex'));
    const cloudLive = cloud.find((a) => typeof window.effectiveStatus === 'function' && window.effectiveStatus(a) === 'live');
    const codexLive = codex.find((a) => typeof window.effectiveStatus === 'function' && window.effectiveStatus(a) === 'live');
    const cloudEl = document.querySelector('#cloudCodeHero');
    const cloudDetailEl = document.querySelector('#cloudCodeHeroDetails');
    const codexEl = document.querySelector('#codexHero');
    const codexDetailEl = document.querySelector('#codexHeroDetails');
    if (cloudEl) cloudEl.textContent = cloudLive ? (cloudLive.display_name || cloudLive.email) : (cloud.length ? 'Registered · not connected' : 'Not connected');
    if (cloudDetailEl) {
      const snap = cloudLive ? cloudWeekly(cloudLive) : null;
      cloudDetailEl.textContent = snap?.remaining_percent != null
        ? `Cloud Code weekly: ${Number(snap.remaining_percent).toFixed(1)}% remaining · reset ${typeof window.resetInfo === 'function' ? window.resetInfo(snap.reset_at).countdown : '—'}`
        : 'Cloud Code weekly allowance: 50 hours. Current hours are shown only when an authoritative Cloud Code source is collected.';
    }
    if (codexEl) codexEl.textContent = codexLive ? (codexLive.display_name || codexLive.email) : (codex.length ? 'Registered · not connected' : 'Not connected');
    if (codexDetailEl) codexDetailEl.textContent = codexLive ? `${codexLive.email} · provider telemetry` : 'Codex usage is tracked separately from OpenAI API limits.';
  };

  window.criticalQuota = function criticalQuotaFixed(account) {
    if (cloudMeta(account)) return cloudWeekly(account);
    const list = typeof window.quotaWindows === 'function' ? window.quotaWindows(account) : [];
    if (!list.length) return null;
    return list.reduce((min, cur) => Number(cur.remaining_percent) < Number(min.remaining_percent) ? cur : min);
  };

  window.healthScore = function healthScoreFixed(account) {
    const list = cloudMeta(account) ? (cloudWeekly(account) ? [cloudWeekly(account)] : []) : (typeof window.quotaWindows === 'function' ? window.quotaWindows(account) : []);
    if (!list.length) return -1;
    return Math.min(...list.map((s) => Number(s.remaining_percent)));
  };

  window.renderAccounts = function renderAccountsFixed() {
    const container = document.querySelector('#accounts');
    const all = window.dashboard?.accounts || [];
    const filtered = typeof window.filteredAccounts === 'function' ? window.filteredAccounts() : all;
    const visible = document.querySelector('#visibleCount');
    if (visible) visible.textContent = `${filtered.length} shown`;
    const controls = document.querySelector('.toolbar-controls');
    const subbar = document.querySelector('.account-subbar');
    if (controls) controls.style.display = all.length ? '' : 'none';
    if (subbar) subbar.style.display = all.length ? '' : 'none';
    if (!container) return;
    if (!all.length) { container.innerHTML = '<div class="empty">No accounts yet.</div>'; return; }
    if (!filtered.length) { container.innerHTML = '<div class="empty">No accounts match your search/filter.</div>'; return; }

    container.innerHTML = filtered.map((account) => {
      const status = typeof window.effectiveStatus === 'function' ? window.effectiveStatus(account) : (account.status || 'not_connected');
      const isCloud = cloudMeta(account);
      const cloud = isCloud ? cloudWeekly(account) : null;
      const critical = isCloud ? cloud : (typeof window.criticalQuota === 'function' ? window.criticalQuota(account) : null);
      const snapshots = account.snapshots || [];
      const context = snapshots.find((s) => s.window_name === 'Context Window');
      const credits = account.credits_remaining == null ? '—' : Number(account.credits_remaining).toLocaleString();
      const lastSeen = account.last_seen_at ? new Date(account.last_seen_at).toLocaleString() : 'Never';
      const provider = escSafe(account.provider || 'Provider');
      const client = escSafe(account.client || 'Provider');
      const cloudUnit = isCloud ? 'hours' : '';
      const cloudTitle = isCloud ? 'Cloud Code weekly' : 'Most constrained';
      let quotaBox;
      if (isCloud) {
        if (cloud?.remaining_percent != null) {
          const pct = Math.max(0, Math.min(100, Number(cloud.remaining_percent)));
          const remainingHours = cloud.remaining_hours != null ? Number(cloud.remaining_hours) : (cloud.limit_units != null ? Number(cloud.limit_units) * pct / 100 : null);
          const hoursLabel = remainingHours != null ? `${remainingHours.toFixed(1)} h remaining` : `${pct.toFixed(1)}% remaining`;
          quotaBox = `<div class="summary-box cloud-code-summary"><span>${cloudTitle}</span><strong>${hoursLabel}</strong><small>50 h weekly allowance · reset ${typeof window.resetInfo === 'function' ? window.resetInfo(cloud.reset_at).countdown : '—'}</small></div>`;
        } else {
          quotaBox = `<div class="summary-box muted cloud-code-summary"><span>${cloudTitle}</span><strong>50 h / week</strong><small>Current remaining hours not yet collected from the Cloud Code Usage Quota source.</small></div>`;
        }
      } else if (critical) {
        quotaBox = `<div class="summary-box"><span>${cloudTitle}</span><strong>${Number(critical.remaining_percent).toFixed(1)}%</strong><small>${escSafe(critical.window_name)} · reset ${typeof window.resetInfo === 'function' ? window.resetInfo(critical.reset_at).countdown : '—'}</small></div>`;
      } else {
        quotaBox = `<div class="summary-box muted"><span>Quota</span><strong>Unknown</strong><small>${account.telemetry_age_seconds == null ? 'No telemetry received' : `Last telemetry ${typeof window.formatDuration === 'function' ? window.formatDuration(account.telemetry_age_seconds) : '—'} ago`}</small></div>`;
      }
      const connect = typeof window.connectButton === 'function' ? window.connectButton(account, status, window.clientKind(account)) : {text:'Source setup',enabled:false,primary:false};
      const actionClass = `${connect.primary ? ' primary' : ''}${connect.enabled ? '' : ' disabled-button'}`;
      const truth = isCloud ? '<span class="truth-chip">official UI-derived</span>' : '';
      return `<article class="account-card ${(typeof window.statusClass === 'function' ? window.statusClass(status) : status)} ${isCloud ? 'cloud-code-card' : ''}">
        <div class="account-card-head"><div class="account-title-wrap"><span class="status-indicator"></span><div><div class="account-name">${escSafe(account.display_name || account.email)}</div><div class="account-email">${escSafe(account.email)}</div></div></div>
          <div class="account-actions"><span class="state-badge">${typeof window.statusLabel === 'function' ? window.statusLabel(status) : status.toUpperCase()}</span><button class="tiny-button details" data-id="${account.id}">Details</button></div>
        </div>
        <div class="account-meta"><span>${provider}</span><span>${client}</span>${account.plan_tier ? `<span>Plan: ${escSafe(account.plan_tier)}</span>` : ''}${truth}</div>
        <div class="provider-note">${isCloud ? 'Cloud Code weekly usage is measured in hours, not Gemini model quota.' : escSafe((window.providerMeta && window.providerMeta(account)?.note) || '')}</div>
        <div class="quota-summary">${quotaBox}<div class="summary-box"><span>Credits</span><strong>${credits}</strong><small>${isCloud ? 'Cloud Code weekly usage is not Gemini credit balance' : 'Only shown when collected from a real provider source'}</small></div><div class="summary-box"><span>Context</span><strong>${context?.remaining_percent != null ? `${Number(context.remaining_percent).toFixed(1)}%` : '—'}</strong><small>${context?.used_units != null && context?.limit_units != null ? `${Number(context.used_units).toLocaleString()} / ${Number(context.limit_units).toLocaleString()} tokens` : 'Not reported'}</small></div></div>
        <div class="account-foot"><span>Last sync: ${escSafe(lastSeen)}</span><div class="account-foot-actions"><button class="button danger-outline delete-account" data-id="${account.id}">Delete</button><button class="button${actionClass} connect" data-id="${account.id}" data-kind="${window.clientKind(account)}" ${connect.enabled ? '' : 'disabled'}>${connect.text}</button></div></div>
      </article>`;
    }).join('');
    container.querySelectorAll('.details').forEach((b) => b.onclick = () => window.openDetails(Number(b.dataset.id)));
    container.querySelectorAll('.connect').forEach((b) => b.onclick = () => window.connect(Number(b.dataset.id), b, b.dataset.kind));
    container.querySelectorAll('.delete-account').forEach((b) => b.onclick = () => window.openDelete(Number(b.dataset.id)));
  };
})();
