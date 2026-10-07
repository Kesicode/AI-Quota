(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  // State Store
  const state = {
    accounts: [],
    summary: {},
    ranking: [],
    sync: {},
    pendingDeleteId: null,
    search: '',
    statusFilter: 'all',
    sort: 'best',
    activeModal: null,
  };

  const PROVIDERS = {
    cloud_code: {
      key: 'cloud_code',
      label: 'Cloud Code / Cloud Shell',
      priority: 100,
      live: false,
      truth: 'official UI-derived',
      note: 'Cloud Code weekly usage (50h default allowance) is separate from Gemini and Google Cloud project quotas.',
    },
    antigravity_2: {
      key: 'antigravity_2',
      label: 'Antigravity 2.0',
      priority: 85,
      live: true,
      truth: 'provider-local',
      note: 'Reads live quota summary and user status from the local Antigravity 2.0 language server.',
    },
    antigravity_cli: {
      key: 'antigravity_cli',
      label: 'Antigravity CLI',
      priority: 80,
      live: true,
      truth: 'CLI-derived',
      note: 'Reads local status-line telemetry emitted by Antigravity CLI.',
    },
    codex: {
      key: 'codex',
      label: 'OpenAI / Codex',
      priority: 75,
      live: false,
      truth: 'supported provider surface',
      note: 'Codex usage windows and credits are separate from OpenAI API rate limits.',
    },
    google_cloud: {
      key: 'google_cloud',
      label: 'Google Cloud quotas',
      priority: 65,
      live: false,
      truth: 'API / CLI-derived',
      note: 'Project/service quotas belong to GCP projects and are distinct from Cloud Code weekly hours.',
    },
    gemini: {
      key: 'gemini',
      label: 'Gemini API',
      priority: 60,
      live: false,
      truth: 'project/API-derived',
      note: 'Gemini API rate limits (RPM, TPM, RPD) are project/model dependent and never substitute for Cloud Code.',
    },
    copilot: {
      key: 'copilot',
      label: 'GitHub Copilot',
      priority: 50,
      live: false,
      truth: 'provider surface',
      note: 'Usage and AI credits depend on current GitHub Copilot subscription.',
    },
    vscode: {
      key: 'vscode',
      label: 'VS Code',
      priority: 30,
      live: false,
      truth: 'host client only',
      note: 'VS Code is an IDE host. Quota authority belongs to the installed provider extension.',
    },
  };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        ...(options.headers || {})
      },
    });
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const data = await response.json();
        message = data.detail || data.message || message;
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
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  function resetInfo(resetAt) {
    if (!resetAt) return { countdown: '—', timestamp: '—' };
    const date = new Date(resetAt);
    if (Number.isNaN(date.getTime())) return { countdown: '—', timestamp: '—' };
    const diff = (date.getTime() - Date.now()) / 1000;
    return {
      countdown: formatDuration(diff),
      timestamp: date.toLocaleString()
    };
  }

  function providerMeta(account) {
    const provider = String(account.provider || '').trim().toLowerCase();
    const client = String(account.client || '').trim().toLowerCase();

    if (client.includes('cloud code') || client.includes('cloud shell') || provider === 'cloud code') {
      return PROVIDERS.cloud_code;
    }
    if (client.includes('antigravity 2.0') || client.includes('desktop')) {
      return PROVIDERS.antigravity_2;
    }
    if (client.includes('cli') && provider === 'antigravity') {
      return PROVIDERS.antigravity_cli;
    }
    if (client.includes('codex') || provider.includes('codex') || provider.includes('openai')) {
      return PROVIDERS.codex;
    }
    if (client.includes('google cloud quotas') || client.includes('project quota') || provider === 'google cloud') {
      return PROVIDERS.google_cloud;
    }
    if (client.includes('gemini') || provider.includes('gemini')) {
      return PROVIDERS.gemini;
    }
    if (client.includes('copilot') || provider.includes('copilot')) {
      return PROVIDERS.copilot;
    }
    if (client.includes('vs code') || provider.includes('vs code')) {
      return PROVIDERS.vscode;
    }
    return {
      key: 'other',
      label: account.provider || 'Other',
      priority: 10,
      live: false,
      truth: 'unknown',
      note: 'No authoritative collector is implemented yet.',
    };
  }

  function clientKind(account) {
    const c = String(account.client || '').toLowerCase();
    if (c.includes('antigravity 2.0') || c.includes('desktop')) return 'antigravity2';
    if (c.includes('cli')) return 'cli';
    return 'other';
  }

  function effectiveStatus(account) {
    const raw = account.status || 'not_connected';
    const age = Number(account.telemetry_age_seconds);
    if ((raw === 'live' || raw === 'exhausted') && Number.isFinite(age) && age > 90) {
      return 'stale';
    }
    return raw;
  }

  function quotaWindows(account) {
    return (account.snapshots || []).filter(
      (s) => s.remaining_percent != null && s.window_name !== 'Context Window'
    );
  }

  function criticalQuota(account) {
    const list = quotaWindows(account);
    if (!list.length) return null;
    return list.reduce((min, cur) =>
      Number(cur.remaining_percent) < Number(min.remaining_percent) ? cur : min
    );
  }

  function healthScore(account) {
    const list = quotaWindows(account);
    if (!list.length) return -1;
    return Math.min(...list.map((s) => Number(s.remaining_percent)));
  }

  function statusLabel(s) {
    return {
      live: 'LIVE',
      stale: 'STALE',
      not_connected: 'NOT CONNECTED',
      exhausted: 'EXHAUSTED',
    }[s] || 'UNKNOWN';
  }

  function statusClass(s) {
    return {
      live: 'live',
      stale: 'stale',
      not_connected: 'not-connected',
      exhausted: 'exhausted',
    }[s] || 'unknown';
  }

  // Smart Summary & Recommendations
  function renderSmartSummary() {
    const root = $('#smart-summary');
    if (!root) return;

    const accounts = state.accounts;
    const states = accounts.reduce((m, a) => {
      const s = effectiveStatus(a);
      m[s] = (m[s] || 0) + 1;
      return m;
    }, {});

    const live = accounts.filter((a) => effectiveStatus(a) === 'live');

    // Only compare candidates that have authoritative reported quota
    const candidates = accounts
      .filter((a) => healthScore(a) >= 0)
      .sort((a, b) => {
        const sDiff = (effectiveStatus(b) === 'live' ? 1 : 0) - (effectiveStatus(a) === 'live' ? 1 : 0);
        if (sDiff !== 0) return sDiff;
        return healthScore(b) - healthScore(a);
      });

    const best = candidates.find((a) => effectiveStatus(a) !== 'exhausted' && healthScore(a) > 0) || null;

    // Renewals: accounts with a future reset timestamp
    const now = Date.now();
    const renewals = accounts
      .flatMap((a) =>
        quotaWindows(a)
          .filter((s) => s.reset_at && new Date(s.reset_at).getTime() > now)
          .map((s) => ({ account: a, window: s, resetTime: new Date(s.reset_at).getTime() }))
      )
      .sort((x, y) => x.resetTime - y.resetTime);

    const next = renewals[0] || null;

    const liveEmails = live.length
      ? live.map((a) => `<span class="summary-email-chip">${esc(a.email)}</span>`).join('')
      : '<span class="summary-empty">No live account connected yet.</span>';

    const suggestions = candidates.slice(0, 3).map((a, i) => {
      const score = healthScore(a);
      const crit = criticalQuota(a);
      const reset = crit ? resetInfo(crit.reset_at) : { countdown: 'no reset data' };
      return `
        <div class="recommend-row">
          <span class="recommend-rank">${i + 1}</span>
          <div class="recommend-main">
            <strong>${esc(a.email)}</strong>
            <small>${esc(a.client || a.provider)} · ${statusLabel(effectiveStatus(a))}</small>
          </div>
          <div class="recommend-metric">
            <strong>${score < 0 ? 'Unknown' : `${score.toFixed(score % 1 ? 1 : 0)}%`}</strong>
            <small>${crit ? `${esc(crit.window_name)} · renews <span data-reset="${esc(crit.reset_at || '')}">${reset.countdown}</span>` : 'no reset data'}</small>
          </div>
        </div>`;
    }).join('') || '<div class="summary-empty">Connect a provider to view data-driven recommendations.</div>';

    root.innerHTML = `
      <div class="smart-card">
        <div class="smart-label">REGISTERED ACCOUNTS</div>
        <div class="smart-number">${accounts.length}</div>
        <div class="smart-sub">
          ${states.live || 0} live · ${states.stale || 0} stale · ${states.not_connected || 0} not connected · ${states.exhausted || 0} exhausted
        </div>
        <div class="smart-email-list">${liveEmails}</div>
      </div>

      <div class="smart-card smart-best">
        <div class="smart-label">BEST ACCOUNT TO USE NOW</div>
        <div class="smart-title">${esc(best ? (best.display_name || best.email) : 'No live quota')}</div>
        <div class="smart-sub">
          ${best ? `${esc(best.client || best.provider)} · ${healthScore(best).toFixed(healthScore(best) % 1 ? 1 : 0)}% remaining` : 'Only accounts with reported quota can be ranked.'}
        </div>
        <div class="smart-reason">
          ${best ? `Most constrained window: ${esc(criticalQuota(best)?.window_name || 'Quota')}` : 'No authoritative remaining quota is available yet.'}
        </div>
      </div>

      <div class="smart-card smart-renew">
        <div class="smart-label">NEXT FASTEST RENEWAL</div>
        <div class="smart-title">${esc(next ? (next.account.display_name || next.account.email) : 'No reset data')}</div>
        <div class="smart-sub">
          ${next ? `${esc(next.account.client || next.account.provider)} · <span data-reset="${esc(next.window.reset_at || '')}">${formatDuration((next.resetTime - now) / 1000)}</span>` : 'A provider must report a reset timestamp first.'}
        </div>
        <div class="smart-reason">
          ${next ? `Window: ${esc(next.window.window_name || 'Quota')}` : 'No authoritative reset timestamp is available.'}
        </div>
      </div>

      <div class="smart-card smart-recommendations">
        <div class="smart-label">ACCOUNT SUGGESTIONS</div>
        <div class="recommend-list">${suggestions}</div>
      </div>
    `;
  }

  function renderQuotaRow(snapshot) {
    const pct = snapshot.remaining_percent == null ? null : Number(snapshot.remaining_percent);
    const reset = resetInfo(snapshot.reset_at);
    const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    const label = pct == null ? 'Unknown' : `${pct.toFixed(pct % 1 ? 1 : 0)}%`;
    const units = snapshot.limit_units != null
      ? `${snapshot.used_units != null ? Number(snapshot.used_units).toLocaleString() : '—'} / ${Number(snapshot.limit_units).toLocaleString()} ${esc(snapshot.unit || '')}`
      : (snapshot.unit ? esc(snapshot.unit) : 'Provider quota');

    return `
      <div class="quota-row">
        <div class="quota-main">
          <div class="quota-name">${esc(snapshot.window_name)} <span>${esc(snapshot.model || '')}</span></div>
          <div class="meter"><i style="width:${width}%"></i></div>
          <small>${units}</small>
        </div>
        <div class="quota-side">
          <strong>${label}</strong>
          <span data-reset="${esc(snapshot.reset_at || '')}">${reset.countdown}</span>
          <small>${reset.timestamp}</small>
        </div>
      </div>`;
  }

  function filteredAccounts() {
    const q = (state.search || '').trim().toLowerCase();
    const filter = state.statusFilter || 'all';
    const sort = state.sort || 'best';

    let list = [...state.accounts];
    if (q) {
      list = list.filter((a) =>
        `${a.email} ${a.display_name || ''} ${a.provider || ''} ${a.client || ''}`
          .toLowerCase()
          .includes(q)
      );
    }
    if (filter !== 'all') {
      list = list.filter((a) => effectiveStatus(a) === filter);
    }

    const statusRank = { live: 4, stale: 3, not_connected: 2, exhausted: 1 };
    list.sort((a, b) => {
      if (sort === 'priority') {
        return providerMeta(b).priority - providerMeta(a).priority || healthScore(b) - healthScore(a);
      }
      if (sort === 'name') {
        return String(a.display_name || a.email).localeCompare(String(b.display_name || b.email));
      }
      if (sort === 'status') {
        return (statusRank[effectiveStatus(b)] || 0) - (statusRank[effectiveStatus(a)] || 0);
      }
      if (sort === 'client') {
        return String(a.client || '').localeCompare(String(b.client || ''));
      }
      // 'best'
      return healthScore(b) - healthScore(a) || providerMeta(b).priority - providerMeta(a).priority;
    });

    return list;
  }

  function connectButton(account, status, kind) {
    if (kind === 'cli') {
      return {
        text: status === 'live' ? 'CLI collector on' : 'Enable CLI collector',
        enabled: true,
        primary: status !== 'live'
      };
    }
    if (kind === 'antigravity2') {
      return {
        text: status === 'live' ? '2.0 connected · Sync' : 'Connect 2.0',
        enabled: true,
        primary: true
      };
    }
    const meta = providerMeta(account);
    return {
      text: meta.live ? 'Source setup' : 'Collector unavailable',
      enabled: false,
      primary: false
    };
  }

  function renderAccounts() {
    const container = $('#accounts');
    if (!container) return;

    const all = state.accounts;
    const list = filteredAccounts();

    const visibleCount = $('#visibleCount');
    if (visibleCount) visibleCount.textContent = `${list.length} shown`;

    const controls = $('.toolbar-controls');
    const subbar = $('.account-subbar');
    if (controls) controls.style.display = all.length === 0 ? 'none' : '';
    if (subbar) subbar.style.display = all.length === 0 ? 'none' : '';

    if (!all.length) {
      container.innerHTML = '<div class="empty">No registered accounts yet. Click "+ Add account" to add one.</div>';
      return;
    }
    if (!list.length) {
      container.innerHTML = '<div class="empty">No accounts match your search or filter.</div>';
      return;
    }

    container.innerHTML = list.map((account) => {
      const status = effectiveStatus(account);
      const critical = criticalQuota(account);
      const snapshots = account.snapshots || [];
      const context = snapshots.find((s) => s.window_name === 'Context Window');
      const credits = account.credits_remaining == null ? '—' : Number(account.credits_remaining).toLocaleString();
      const lastSeen = account.last_seen_at ? new Date(account.last_seen_at).toLocaleString() : 'Never';
      const kind = clientKind(account);
      const meta = providerMeta(account);
      const connect = connectButton(account, status, kind);
      const priority = meta.priority >= 80 ? '<span class="priority-chip">PRIORITY</span>' : '';
      const truth = `<span class="truth-chip">${esc(meta.truth)}</span>`;
      const actionClass = `${connect.primary ? ' primary' : ''}${connect.enabled ? '' : ' disabled-button'}`;

      const isCloudCode = meta.key === 'cloud_code';
      const extraClass = isCloudCode ? ' cloud-code-card' : '';

      return `
        <article class="account-card ${statusClass(status)}${extraClass}" data-id="${account.id}">
          <div class="account-card-head">
            <div class="account-title-wrap">
              <span class="status-indicator"></span>
              <div>
                <div class="account-name">${esc(account.display_name || account.email)}</div>
                <div class="account-email">${esc(account.email)}</div>
              </div>
            </div>
            <div class="account-actions">
              <span class="state-badge">${statusLabel(status)}</span>
              <button class="tiny-button details" data-id="${account.id}">Details</button>
            </div>
          </div>

          <div class="account-meta">
            <span>${esc(account.provider)}</span>
            <span>${esc(account.client || 'Provider')}</span>
            ${account.plan_tier ? `<span>Plan: ${esc(account.plan_tier)}</span>` : ''}
            ${priority}
            ${truth}
          </div>

          <div class="provider-note">${esc(meta.note)}</div>

          <div class="quota-summary">
            ${
              critical
                ? `<div class="summary-box">
                     <span>Most constrained</span>
                     <strong>${Number(critical.remaining_percent).toFixed(1)}%</strong>
                     <small>${esc(critical.window_name)} · reset <span data-reset="${esc(critical.reset_at || '')}">${resetInfo(critical.reset_at).countdown}</span></small>
                   </div>`
                : isCloudCode
                ? `<div class="summary-box">
                     <span>Weekly allowance</span>
                     <strong>50 h</strong>
                     <small>Official UI-derived · Live remaining unavailable</small>
                   </div>`
                : `<div class="summary-box muted">
                     <span>Quota</span>
                     <strong>Unknown</strong>
                     <small>${account.telemetry_age_seconds == null ? 'No telemetry received' : `Last telemetry ${formatDuration(account.telemetry_age_seconds)} ago`}</small>
                   </div>`
            }
            <div class="summary-box">
              <span>Credits</span>
              <strong>${credits}</strong>
              <small>Only shown when reported by provider</small>
            </div>
            <div class="summary-box">
              <span>Context</span>
              <strong>${context?.remaining_percent != null ? `${Number(context.remaining_percent).toFixed(1)}%` : '—'}</strong>
              <small>${context?.used_units != null && context?.limit_units != null ? `${Number(context.used_units).toLocaleString()} / ${Number(context.limit_units).toLocaleString()} tokens` : 'Not reported'}</small>
            </div>
          </div>

          <div class="account-foot">
            <span>Last sync: ${esc(lastSeen)}</span>
            <div class="account-foot-actions">
              <button class="button danger-outline delete-account" data-id="${account.id}">Delete</button>
              <button class="button${actionClass} connect" data-id="${account.id}" data-kind="${kind}" ${connect.enabled ? '' : 'disabled'}>${connect.text}</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  const expiredResets = new Set();

  function updateCountdowns() {
    const clock = $('#localClock');
    if (clock) clock.textContent = new Date().toLocaleTimeString();

    $$('[data-reset]').forEach((el) => {
      const raw = el.dataset.reset;
      if (raw) {
        const info = resetInfo(raw);
        el.textContent = info.countdown;
        if (info.countdown === 'Ready' && !expiredResets.has(raw)) {
          expiredResets.add(raw);
          load(true);
        }
      }
    });
  }

  // Modals & Dialog Handling
  function openModal(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;
    state.activeModal = dialogId;
    if (!dialog.open) {
      dialog.showModal();
    }
    const current = history.state || {};
    if (current.__modal !== dialogId) {
      history.pushState({ ...current, __modal: dialogId }, '', window.location.href);
    }
  }

  function closeModal(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (!dialog || !dialog.open) return;
    state.activeModal = null;
    dialog.close();
    if (history.state?.__modal === dialogId) {
      history.back();
    }
  }

  function wireModalBackdrops() {
    ['accountDialog', 'detailDialog', 'deleteDialog'].forEach((id) => {
      const dialog = document.getElementById(id);
      if (!dialog) return;

      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
          closeModal(id);
          if (id === 'deleteDialog') state.pendingDeleteId = null;
        }
      });

      dialog.addEventListener('cancel', () => {
        // Native Escape key
        state.activeModal = null;
        if (id === 'deleteDialog') state.pendingDeleteId = null;
        if (history.state?.__modal === id) {
          history.back();
        }
      });
    });
  }

  window.addEventListener('popstate', (e) => {
    const targetModal = e.state?.__modal;
    ['accountDialog', 'detailDialog', 'deleteDialog'].forEach((id) => {
      const dialog = document.getElementById(id);
      if (!dialog) return;
      if (targetModal === id) {
        if (!dialog.open) dialog.showModal();
        state.activeModal = id;
      } else {
        if (dialog.open) dialog.close();
      }
    });
    if (!targetModal) state.activeModal = null;
  });

  // Account Detail View
  function openDetails(id) {
    const a = state.accounts.find((acc) => Number(acc.id) === Number(id));
    if (!a) return;
    const meta = providerMeta(a);
    const status = effectiveStatus(a);

    $('#detailName').textContent = a.display_name || a.email;
    $('#detailMeta').textContent = `${a.email} · ${a.provider} · ${a.client || 'Provider'}`;

    const rows = (a.snapshots || []).filter((s) => s.window_name !== 'Context Window');
    const context = (a.snapshots || []).find((s) => s.window_name === 'Context Window');

    $('#detailBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-stat">
          <span>Status</span>
          <strong class="${statusClass(status)}-text">${statusLabel(status)}</strong>
        </div>
        <div class="detail-stat">
          <span>Authority</span>
          <strong>${esc(meta.truth)}</strong>
        </div>
        <div class="detail-stat">
          <span>Plan</span>
          <strong>${esc(a.plan_tier || 'Unknown')}</strong>
        </div>
        <div class="detail-stat">
          <span>Last telemetry</span>
          <strong>${a.last_seen_at ? new Date(a.last_seen_at).toLocaleString() : 'Never'}</strong>
        </div>
      </div>
      <section class="detail-section">
        <h3>Provider truth</h3>
        <p>${esc(meta.note)}</p>
      </section>
      <section class="detail-section">
        <h3>Quota windows</h3>
        ${rows.length ? rows.map(renderQuotaRow).join('') : '<div class="empty compact">No provider quota snapshot collected yet.</div>'}
      </section>
      <section class="detail-section">
        <h3>Context window</h3>
        ${context ? renderQuotaRow(context) : '<div class="empty compact">No context token data collected yet.</div>'}
      </section>
    `;

    openModal('detailDialog');
  }

  function openDelete(id) {
    const a = state.accounts.find((acc) => Number(acc.id) === Number(id));
    if (!a) return;
    state.pendingDeleteId = id;
    const msg = $('#deleteMessage');
    if (msg) {
      msg.textContent = `This will permanently remove “${a.display_name || a.email}” (${a.email} · ${a.client || a.provider}) and its stored quota history from this local AI Quota instance.`;
    }
    openModal('deleteDialog');
  }

  async function confirmDeleteAccount() {
    if (!state.pendingDeleteId) return;
    const btn = $('#confirmDelete');
    if (btn) btn.disabled = true;

    try {
      await api(`/api/accounts/${state.pendingDeleteId}`, { method: 'DELETE' });
      state.pendingDeleteId = null;
      closeModal('deleteDialog');
      await load(false);
    } catch (e) {
      alert(`Could not delete account: ${e.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleConnect(id, button, kind) {
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Connecting…';

    try {
      const res = await api(`/api/accounts/${id}/connect`, { method: 'POST' });
      await load(false);
      alert(res.message || 'Connected successfully.');
    } catch (e) {
      alert(`Connection failed: ${e.message}`);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function syncNow() {
    const btn = $('#sync');
    if (!btn) return;
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Syncing…';

    try {
      await api('/api/sync', { method: 'POST' });
      await load(false);
    } catch (e) {
      alert(`Sync failed: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  async function enableGlobalCollector() {
    const account = state.accounts.find(
      (a) => String(a.provider || '').toLowerCase() === 'antigravity' &&
             String(a.client || '').toLowerCase().includes('cli')
    );
    if (!account) {
      alert('Add an Antigravity CLI account first, then enable the collector.');
      openModal('accountDialog');
      return;
    }
    const btn = $('#enableAntigravity');
    await handleConnect(account.id, btn, 'cli');
  }

  // Load Dashboard Data
  async function load(silent = false) {
    try {
      const data = await api('/api/dashboard?sync=false');
      state.accounts = data.accounts || [];
      state.summary = data.summary || {};
      state.ranking = data.ranking || [];
      state.sync = data.sync || {};

      renderSmartSummary();
      renderAccounts();
      updateCountdowns();
    } catch (e) {
      console.error(e);
      if (!silent) {
        alert(`Could not load AI Quota: ${e.message}`);
      }
    }
  }

  // Event Listeners Initialization
  function initEventListeners() {
    $('#sync')?.addEventListener('click', syncNow);
    $('#enableAntigravity')?.addEventListener('click', enableGlobalCollector);
    $('#addAccount')?.addEventListener('click', () => openModal('accountDialog'));
    $('#closeDetail')?.addEventListener('click', () => closeModal('detailDialog'));

    $('#confirmDelete')?.addEventListener('click', (e) => {
      e.preventDefault();
      confirmDeleteAccount();
    });

    $('#accountForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const submitBtn = form.querySelector('button[value="default"]');
      const formData = Object.fromEntries(new FormData(form));

      if (submitBtn) submitBtn.disabled = true;
      try {
        await api('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        form.reset();
        closeModal('accountDialog');
        await load(false);
      } catch (err) {
        alert(`Could not add account: ${err.message}`);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    $('#accountSearch')?.addEventListener('input', (e) => {
      state.search = e.target.value;
      renderAccounts();
    });

    $('#statusFilter')?.addEventListener('change', (e) => {
      state.statusFilter = e.target.value;
      renderAccounts();
    });

    $('#sortAccounts')?.addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderAccounts();
    });

    // Event delegation on #accounts container
    const container = $('#accounts');
    if (container) {
      container.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('.details');
        if (detailsBtn) {
          openDetails(Number(detailsBtn.dataset.id));
          return;
        }

        const deleteBtn = e.target.closest('.delete-account');
        if (deleteBtn) {
          openDelete(Number(deleteBtn.dataset.id));
          return;
        }

        const connectBtn = e.target.closest('.connect');
        if (connectBtn && !connectBtn.disabled) {
          handleConnect(Number(connectBtn.dataset.id), connectBtn, connectBtn.dataset.kind);
          return;
        }
      });
    }

    wireModalBackdrops();
  }

  // ── Tab navigation ────────────────────────────────────────────────────────
  function initTabs() {
    const btns = $$('.tab-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        btns.forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
        $$('.tab-panel').forEach(p => { p.classList.toggle('active', p.id === `tab-${tab}`); p.hidden = p.id !== `tab-${tab}`; });
        if (tab === 'providers') loadProviders();
        if (tab === 'history') loadHistory();
        if (tab === 'settings') loadSettings();
        if (tab === 'diagnostics') loadDiagnostics();
      });
    });
  }

  // ── Providers tab ─────────────────────────────────────────────────────────
  async function loadProviders() {
    const el = $('#providers-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-row">Loading…</div>';
    try {
      const res = await fetch('/api/v1/providers');
      if (!res.ok) throw new Error(res.statusText);
      const providers = await res.json();
      if (!providers.length) { el.innerHTML = '<div class="loading-row">No providers registered.</div>'; return; }
      el.innerHTML = providers.map(p => {
        const det = p.detected
          ? `<span class="badge badge-live">● detected</span>`
          : `<span class="badge badge-muted">○ not running</span>`;
        const caps = p.capabilities || {};
        const capList = [
          caps.quota && '<span class="cap-tag">quota</span>',
          caps.detection && '<span class="cap-tag">detection</span>',
          caps.switching && `<span class="cap-tag">switching (${esc(caps.switch_method || '?')})</span>`,
          caps.instant_switch && '<span class="cap-tag cap-instant">instant</span>',
        ].filter(Boolean).join(' ');
        return `<div class="provider-row">
          <div class="provider-row-head">
            <strong>${esc(p.display_name)}</strong>${det}
            <code class="provider-id">${esc(p.id)}</code>
          </div>
          ${p.hub_url ? `<div class="provider-hub">Hub: <code>${esc(p.hub_url)}</code></div>` : ''}
          <div class="provider-caps">${capList || '<span class="cap-tag cap-none">read-only</span>'}</div>
          <div class="provider-truth">Authority: <em>${esc(p.truth?.authority_type || 'unknown')}</em> — ${esc(p.truth?.note || '')}</div>
        </div>`;
      }).join('');
    } catch (e) {
      el.innerHTML = `<div class="loading-row error-row">Failed to load providers: ${esc(String(e))}</div>`;
    }
  }
  $('#refreshProviders')?.addEventListener('click', loadProviders);

  // ── History tab ───────────────────────────────────────────────────────────
  async function populateHistoryAccountSelect() {
    const sel = $('#historyAccount');
    if (!sel || sel.options.length > 1) return;
    try {
      const res = await fetch('/api/accounts');
      const accs = await res.json();
      accs.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.display_name || a.email;
        sel.appendChild(opt);
      });
    } catch { /* silent */ }
  }

  async function loadHistory() {
    await populateHistoryAccountSelect();
    const accountId = $('#historyAccount')?.value || 'all';
    const period = $('#historyPeriod')?.value || '24h';
    const tableEl = $('#history-table');
    const canvas = $('#historyCanvas');
    if (!tableEl || !canvas) return;
    tableEl.innerHTML = '<div class="loading-row">Loading…</div>';
    try {
      const url = accountId === 'all'
        ? `/api/v1/history?period=${period}`
        : `/api/v1/history/${accountId}?period=${period}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      // Normalise to flat points array
      const points = Array.isArray(data) ? data.flatMap(d => d.points || []) : (data.points || []);
      drawHistoryChart(canvas, points);
      if (!points.length) { tableEl.innerHTML = '<div class="loading-row">No history recorded yet. Data accumulates as the agent polls.</div>'; return; }
      tableEl.innerHTML = `<table class="history-tbl">
        <thead><tr><th>Time</th><th>Window</th><th>Remaining %</th><th>Source</th><th>Freshness</th></tr></thead>
        <tbody>${points.slice(-50).reverse().map(p => `<tr>
          <td>${esc(new Date(p.captured_at||p.timestamp||'').toLocaleString())}</td>
          <td>${esc(p.window_name||'—')}</td>
          <td>${p.remaining_percent != null ? `${Number(p.remaining_percent).toFixed(1)}%` : '—'}</td>
          <td>${esc(p.source||'—')}</td>
          <td><span class="staleness-tag ${esc((p.staleness_tier||'UNKNOWN').toLowerCase())}">${esc(p.staleness_tier||'—')}</span></td>
        </tr>`).join('')}</tbody>
      </table>`;
    } catch (e) {
      tableEl.innerHTML = `<div class="loading-row error-row">${esc(String(e))}</div>`;
    }
  }

  function drawHistoryChart(canvas, points) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!points.length) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0,0,W,H); return; }
    // Filter numeric points
    const pts = points.filter(p => p.remaining_percent != null).map(p => ({
      t: new Date(p.captured_at || p.timestamp || '').getTime(),
      v: Number(p.remaining_percent),
    })).sort((a,b) => a.t - b.t);
    if (pts.length < 2) return;
    const minT = pts[0].t, maxT = pts[pts.length-1].t, rangeT = maxT - minT || 1;
    const pad = { l: 40, r: 16, t: 16, b: 32 };
    const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    [0,25,50,75,100].forEach(v => {
      const y = pad.t + iH - (v/100)*iH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l+iW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '10px system-ui';
      ctx.fillText(`${v}%`, 2, y+4);
    });
    // Line
    ctx.strokeStyle = '#1a9e5c'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = pad.l + ((p.t - minT) / rangeT) * iW;
      const y = pad.t + iH - (p.v / 100) * iH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Fill under line
    ctx.fillStyle = 'rgba(26,158,92,0.08)';
    ctx.lineTo(pad.l + iW, pad.t + iH); ctx.lineTo(pad.l, pad.t + iH); ctx.closePath(); ctx.fill();
  }

  $('#historyAccount')?.addEventListener('change', loadHistory);
  $('#historyPeriod')?.addEventListener('change', loadHistory);

  // ── Settings tab ──────────────────────────────────────────────────────────
  async function loadSettings() {
    const form = $('#settingsForm');
    if (!form) return;
    try {
      const res = await fetch('/api/v1/settings');
      if (!res.ok) return;
      const settings = await res.json();
      Object.entries(settings).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = v === 'true';
        else el.value = v;
      });
    } catch { /* silent */ }
  }

  $('#settingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const status = $('#settingsStatus');
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = String(v); });
    // checkboxes that are unchecked don't appear in FormData
    form.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (!data[cb.name]) data[cb.name] = 'false';
    });
    try {
      const res = await fetch('/api/v1/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
      const result = await res.json();
      if (status) { status.textContent = `Saved: ${result.updated?.join(', ') || 'none'}`; status.className = 'settings-status ok'; }
    } catch (err) {
      if (status) { status.textContent = `Error: ${err}`; status.className = 'settings-status error'; }
    }
  });

  // ── Diagnostics tab ───────────────────────────────────────────────────────
  async function loadDiagnostics() {
    const el = $('#diagnostics-body');
    if (!el) return;
    el.innerHTML = '<div class="loading-row">Loading…</div>';
    try {
      const res = await fetch('/api/v1/diagnostics');
      if (!res.ok) throw new Error(res.statusText);
      const d = await res.json();
      const provRows = (d.providers||[]).map(p => `<tr>
        <td>${esc(p.display_name||p.id)}</td>
        <td><span class="badge ${p.status==='ok'?'badge-live':'badge-muted'}">${esc(p.status)}</span></td>
        <td>${p.latency_ms != null ? `${Number(p.latency_ms).toFixed(0)}ms` : '—'}</td>
        <td>${esc(p.error||'—')}</td>
      </tr>`).join('');
      const settingRows = Object.entries(d.settings||{}).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
      el.innerHTML = `
        <div class="diag-meta">
          <span>Agent version: <strong>${esc(d.agent_version)}</strong></span>
          <span>DB size: <strong>${Number(d.db_size_bytes/1024).toFixed(1)} KB</strong></span>
          <span>Generated: <strong>${esc(new Date(d.generated_at).toLocaleString())}</strong></span>
        </div>
        <h3>Providers</h3>
        <table class="history-tbl"><thead><tr><th>Provider</th><th>Status</th><th>Latency</th><th>Error</th></tr></thead><tbody>${provRows||'<tr><td colspan=4>No providers</td></tr>'}</tbody></table>
        <h3>Settings</h3>
        <table class="history-tbl"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${settingRows||'<tr><td colspan=2>No settings</td></tr>'}</tbody></table>
      `;
    } catch (e) {
      el.innerHTML = `<div class="loading-row error-row">${esc(String(e))}</div>`;
    }
  }
  $('#refreshDiagnostics')?.addEventListener('click', loadDiagnostics);

  // Startup
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    load(false);

    setInterval(updateCountdowns, 1000);
    setInterval(() => load(true), 5000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) load(true);
    });
  });
})();
