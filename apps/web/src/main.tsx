import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Clean up old VitePWA service workers and caches, then register minimal push-only SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    // Unregister ALL old service workers first
    var promises = regs.map(function(reg) { return reg.unregister(); });
    return Promise.all(promises);
  }).then(function() {
    // Clear ALL caches (old VitePWA precache)
    return caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) { return caches.delete(n); }));
    });
  }).then(function() {
    // Register the new minimal push-only SW
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }).then(function(reg) {
    console.log('[SW] Registered push-only SW:', reg.scope);
    // Check for updates every 60 seconds
    setInterval(function() { reg.update(); }, 60000);
  }).catch(function(err) {
    console.warn('[SW] Registration failed:', err);
  });

  // Listen for server-ready event from SSE to trigger SW update check
  window.addEventListener('server-ready', function() {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      regs.forEach(function(reg) { reg.update(); });
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);