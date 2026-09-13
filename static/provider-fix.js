(() => {
  const clean = (s) => String(s || '').trim().toLowerCase();

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
      if (label) label.textContent = 'Cloud Code weekly';
      if (strong && (!strong.textContent.includes('h') || clean(strong.textContent).includes('%') || clean(strong.textContent).includes('unknown'))) {
        strong.textContent = '50 h / week';
      }
      if (small) {
        const text = clean(small.textContent);
        if (text.includes('gemini') || text.includes('weekly limit') || text.includes('most constrained') || !text.includes('cloud code')) {
          small.textContent = '50-hour weekly allowance · current remaining hours are shown only when collected from the official Cloud Code Usage Quota source.';
        }
      }
      const note = card.querySelector('.provider-note');
      if (note) note.textContent = 'Cloud Code weekly usage is measured in hours, not Gemini model quota.';
      card.classList.add('cloud-code-card');
    });
  }

  function patchPriorityCard() {
    const hero = document.querySelector('#cloudCodeHeroDetails');
    if (hero) {
      hero.textContent = 'Cloud Code / Cloud Shell: 50 hours per week. The official Usage Quota view shows hours remaining, total hours and the weekly reset date/time.';
    }
    document.querySelectorAll('.provider-card-primary p').forEach((p) => {
      p.innerHTML = 'Cloud Code has a default weekly quota of <strong>50 hours</strong>. The official Usage Quota view shows hours remaining, total hours and the weekly reset date/time.';
    });
  }

  function patchProviderOrdering() {
    const accounts = document.querySelector('.account-panel');
    const priority = document.querySelector('.provider-priority-panel');
    const coverage = [...document.querySelectorAll('.panel')].find((el) => el.querySelector('h2')?.textContent.trim() === 'Provider / client coverage');
    if (accounts && priority && coverage) {
      accounts.insertAdjacentElement('afterend', priority);
      priority.insertAdjacentElement('afterend', coverage);
    }
  }

  function patchAll() {
    patchProviderOrdering();
    patchPriorityCard();
    patchCloudCodeCards();
  }

  const observer = new MutationObserver(patchAll);
  observer.observe(document.body, {subtree:true, childList:true});
  patchAll();
  setInterval(patchAll, 1000);
})();
