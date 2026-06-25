import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Service Worker: auto-update + auto-reload on new version
if ('serviceWorker' in navigator) {
  const swReloaded = sessionStorage.getItem('sw-reloaded');
  if (swReloaded) sessionStorage.removeItem('sw-reloaded');

  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      reg.update().catch(() => {});
      if (reg.waiting && !swReloaded) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      // If installing SW exists, wait for it
      if (reg.installing) {
        reg.installing.addEventListener('statechange', (e) => {
          const sw = e.target as ServiceWorker;
          if (sw.state === 'activated' && !swReloaded) {
            sessionStorage.setItem('sw-reloaded', '1');
            window.location.reload();
          }
          if (sw.state === 'redundant') {
            // SW failed to install - likely broken, unregister and reload
            reg.unregister().then(() => window.location.reload());
          }
        });
      }
    });
  }).catch(() => {
    // Registration fetch failed - try to recover
    navigator.serviceWorker.getRegistrations().then(regs =>
      Promise.all(regs.map(r => r.unregister()))
    ).then(() => window.location.reload());
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    sessionStorage.setItem('sw-reloaded', '1');
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
