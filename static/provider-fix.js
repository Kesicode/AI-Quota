(() => {
  const clean = (s) => String(s || '').trim().toLowerCase();

  function setTextIfChanged(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function isCloudCodeCard(card) {
    const meta = clean(card.querySelector('.account-meta')?.textContent);
    const note = clean(card.querySelector('.provider-note')?.textContent);
    return meta.includes('cloud code') || meta.includes('cloud shell') || note.includes('cloud code weekly usage');
  }

  function patchCloudCodeCards() {
    document.querySelectorAll('.account-card').forEach((card) => {
      if (!isCloudCodeCard(card)) return;
      const summary = card.querySelector('.quota-summary');
      const first = summary?.querySelector('.summary-box');
      if (!first) return;

      const label = first.querySelector('span');
      const strong = first.querySelector('strong');
      const small = first.querySelector('small');
      const note = card.querySelector('.provider-note');

      setTextIfChanged(label, 'Cloud Code weekly');
      const currentValue = clean(strong?.textContent);
      if (strong && (currentValue.includes('%') || currentValue.includes('unknown') || !currentValue.includes('h'))) {
        setTextIfChanged(strong, '50 h / week');
      }
      setTextIfChanged(small, '50-hour weekly allowance · current remaining hours appear only when collected from the official Cloud Code Usage Quota source.');
      setTextIfChanged(note, 'Cloud Code weekly usage is measured in hours, not Gemini model quota.');
      card.classList.add('cloud-code-card');
    });
  }

  function patchPriorityCard() {
    const hero = document.querySelector('#cloudCodeHeroDetails');
    setTextIfChanged(hero, 'Cloud Code / Cloud Shell: 50 hours per week. The official Usage Quota view shows hours remaining, total hours and the weekly reset date/time.');

    document.querySelectorAll('.provider-card-primary p').forEach((p) => {
      const value = 'Cloud Code has a default weekly quota of 50 hours. The official Usage Quota view shows hours remaining, total hours and the weekly reset date/time.';
      setTextIfChanged(p, value);
    });
  }

  function patchProviderOrdering() {
    const accounts = document.querySelector('.account-panel');
    const priority = document.querySelector('.provider-priority-panel');
    const coverage = [...document.querySelectorAll('.panel')].find((el) => el.querySelector('h2')?.textContent.trim() === 'Provider / client coverage');
    if (!accounts || !priority || !coverage) return;
    if (accounts.nextElementSibling !== priority) accounts.insertAdjacentElement('afterend', priority);
    if (priority.nextElementSibling !== coverage) priority.insertAdjacentElement('afterend', coverage);
  }

  function patchAll() {
    patchProviderOrdering();
    patchPriorityCard();
    patchCloudCodeCards();
  }

  function start() {
    patchAll();
    // The main app re-renders account cards after every provider refresh.
    // Polling is intentionally used instead of observing the account subtree,
    // avoiding a MutationObserver feedback loop that can freeze the page.
    window.setInterval(patchAll, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
