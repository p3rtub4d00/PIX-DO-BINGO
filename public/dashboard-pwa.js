(() => {
  let deferredPrompt = null;

  const ensureInstallButton = () => {
    let btn = document.getElementById('btn-instalar-dashboard');
    if (btn) return btn;

    btn = document.createElement('button');
    btn.id = 'btn-instalar-dashboard';
    btn.type = 'button';
    btn.textContent = 'Instalar app';
    btn.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:9999',
      'padding:10px 14px',
      'border:none',
      'border-radius:8px',
      'background:#00c853',
      'color:#fff',
      'font-weight:700',
      'font-family:Montserrat,sans-serif',
      'cursor:pointer',
      'display:none'
    ].join(';');

    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.style.display = 'none';
    });

    document.body.appendChild(btn);
    return btn;
  };

  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('Falha ao registrar service worker no dashboard:', err);
    }
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    const btn = ensureInstallButton();
    btn.style.display = 'block';
  });

  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('btn-instalar-dashboard');
    if (btn) btn.style.display = 'none';
    deferredPrompt = null;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerServiceWorker);
  } else {
    registerServiceWorker();
  }
})();
