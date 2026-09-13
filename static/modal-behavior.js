(() => {
  const modalHistoryKey = '__aiquota_modal';
  let suppressHistoryClose = false;
  let observer;

  const dialogs = () => Array.from(document.querySelectorAll('dialog'));
  const openDialog = () => dialogs().find((dialog) => dialog.open) || null;

  function closeDialog(dialog, {restoreHistory = true} = {}) {
    if (!dialog || !dialog.open) return;
    suppressHistoryClose = !restoreHistory;
    try { dialog.close(); } finally {
      window.setTimeout(() => { suppressHistoryClose = false; }, 0);
    }
  }

  function pushModalHistory(dialog) {
    const id = dialog.id || 'dialog';
    const current = history.state;
    if (current && current[modalHistoryKey] === id) return;
    history.pushState({...current, [modalHistoryKey]: id}, '', window.location.href);
  }

  function restoreModalFromHistory() {
    const id = history.state?.[modalHistoryKey];
    const dialog = id ? document.getElementById(id) : null;
    if (dialog && !dialog.open) {
      try { dialog.showModal(); } catch (_) { return; }
    }
  }

  function handleDialogStateChange(dialog) {
    if (dialog.open) {
      pushModalHistory(dialog);
      return;
    }
    if (suppressHistoryClose) return;
    if (history.state?.[modalHistoryKey] === dialog.id) {
      window.setTimeout(() => history.back(), 0);
    }
  }

  function wireDialog(dialog) {
    if (dialog.dataset.aiquotaModalWired === '1') return;
    dialog.dataset.aiquotaModalWired = '1';

    dialog.addEventListener('pointerdown', (event) => {
      // Native <dialog> exposes the backdrop as the dialog itself in browsers that
      // support ::backdrop. Clicking exactly outside the dialog contents closes it.
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener('cancel', () => {
      // Esc is treated like an ordinary close; the observer will clean the
      // corresponding history entry.
    });

    dialog.addEventListener('close', () => handleDialogStateChange(dialog));
  }

  function wireAll() {
    dialogs().forEach(wireDialog);
  }

  window.addEventListener('popstate', () => {
    const dialog = openDialog();
    const wanted = history.state?.[modalHistoryKey];
    if (dialog && dialog.id !== wanted) {
      suppressHistoryClose = true;
      dialog.close();
      window.setTimeout(() => { suppressHistoryClose = false; }, 0);
    }
    restoreModalFromHistory();
  });

  document.addEventListener('DOMContentLoaded', () => {
    wireAll();
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              if (node.matches?.('dialog')) wireDialog(node);
              node.querySelectorAll?.('dialog').forEach(wireDialog);
            }
          });
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'open' && mutation.target.matches?.('dialog')) {
          handleDialogStateChange(mutation.target);
        }
      }
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open']});

    // If the page was restored with a modal history state, restore the modal.
    restoreModalFromHistory();
  });
})();
