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

    const best = candidates[0] || null;

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
            <small>${crit ? `${esc(crit.window_name)} · renews ${reset.countdown}` : 'no reset data'}</small>
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
          ${next ? `${esc(next.account.client || next.account.provider)} · ${formatDuration((next.resetTime - now) / 1000)}` : 'A provider must report a reset timestamp first.'}
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

  function updateCountdowns() {
    const clock = $('#localClock');
    if (clock) clock.textContent = new Date().toLocaleTimeString();

    $$('[data-reset]').forEach((el) => {
      const raw = el.dataset.reset;
      if (raw) {
        el.textContent = resetInfo(raw).countdown;
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

  // Startup
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    load(false);

    // 1-second countdown interval (updates DOM in place)
    setInterval(updateCountdowns, 1000);

    // 5-second background refresh (fetches cached dashboard state without triggering sync)
    setInterval(() => load(true), 5000);

    // Re-check when window regains focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) load(true);
    });
  });
})();
