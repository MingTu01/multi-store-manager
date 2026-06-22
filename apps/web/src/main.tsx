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
      reg.update();
      if (reg.waiting && !swReloaded) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
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
