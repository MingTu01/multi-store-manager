import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// One-time cleanup: remove ALL old VitePWA service workers and caches
// Uses localStorage flag so this only runs ONCE per browser
if ('serviceWorker' in navigator) {
  var CLEANUP_KEY = '_sw_migrated_v2';
  var needsCleanup = !localStorage.getItem(CLEANUP_KEY);

  if (needsCleanup) {
    // Step 1: unregister all existing SWs and clear all caches
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      return Promise.all(regs.map(function(reg) { return reg.unregister(); }));
    }).then(function() {
      return caches.keys().then(function(names) {
        return Promise.all(names.map(function(n) { return caches.delete(n); }));
      });
    }).then(function() {
      localStorage.setItem(CLEANUP_KEY, '1');
      // Step 2: register new push-only SW
      return navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }).then(function(reg) {
      console.log('[SW] Migrated to push-only SW:', reg.scope);
    }).catch(function(err) {
      console.warn('[SW] Migration failed:', err);
      // Mark as done anyway to avoid infinite retry loop
      localStorage.setItem(CLEANUP_KEY, '1');
    });
  } else {
    // Normal path: just register the push-only SW (already cleaned up)
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function(reg) {
      console.log('[SW] Registered push-only SW:', reg.scope);
    }).catch(function(err) {
      console.warn('[SW] Registration failed:', err);
    });
  }

  // Periodic SW update check (every 60s)
  setInterval(function() {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      regs.forEach(function(reg) { reg.update(); });
    });
  }, 60000);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);