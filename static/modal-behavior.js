(() => {
  const modalHistoryKey = '__aiquota_modal';
  let suppressHistoryClose = false;

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

  function handleDialogClosed(dialog) {
    if (suppressHistoryClose) return;
    if (history.state?.[modalHistoryKey] === dialog.id) {
      window.setTimeout(() => history.back(), 0);
    }
  }

  function wireDialog(dialog) {
    if (dialog.dataset.aiquotaModalWired === '1') return;
    dialog.dataset.aiquotaModalWired = '1';

    dialog.addEventListener('pointerdown', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener('cancel', () => {
      // Allow the browser's native Escape handling to close the dialog.
      // The close event below removes the modal history entry.
    });

    dialog.addEventListener('close', () => handleDialogClosed(dialog));
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
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              if (node.matches?.('dialog')) wireDialog(node);
              node.querySelectorAll?.('dialog').forEach(wireDialog);
            }
          });
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'open' && mutation.target.matches?.('dialog') && mutation.target.open) {
          pushModalHistory(mutation.target);
        }
      }
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open']});
    restoreModalFromHistory();
  });
})();
