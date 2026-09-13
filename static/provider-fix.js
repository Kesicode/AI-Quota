(() => {
  // This module is deliberately non-destructive. Older versions of AI Quota
  // replaced a real quota value with the configured 50h Cloud Code allowance.
  // The allowance is a limit, not the live remaining amount.
  const clean = (s) => String(s || '').trim().toLowerCase();

  function patchCloudCodeLabels() {
    document.querySelectorAll('.account-card').forEach((card) => {
      const meta = clean(card.querySelector('.account-meta')?.textContent);
      const note = clean(card.querySelector('.provider-note')?.textContent);
      const isCloudCode = meta.includes('cloud code') || meta.includes('cloud shell') || note.includes('cloud code');
      if (!isCloudCode) return;
      card.classList.add('cloud-code-card');

      // Never replace .summary-box values here. They must come from snapshots.
      const first = card.querySelector('.quota-summary .summary-box');
      if (first && first.querySelector('span')?.textContent.trim() === 'Most constrained') {
        const small = first.querySelector('small');
        if (small && !small.textContent.toLowerCase().includes('reported')) {
          small.textContent = small.textContent.replace(/reset/i, 'reset');
        }
      }
    });
  }

  function start() {
    patchCloudCodeLabels();
    window.setInterval(patchCloudCodeLabels, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
