import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Nuclear SW cleanup: unregister ALL old service workers, clear ALL caches
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    var promises = [];
    for (var i = 0; i < regs.length; i++) {
      console.log('[SW] Unregistering old SW:', regs[i].scope);
      promises.push(regs[i].unregister());
    }
    return Promise.all(promises);
  }).then(function() {
    return caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) {
        console.log('[SW] Deleting cache:', n);
        return caches.delete(n);
      }));
    });
  }).then(function() {
    return navigator.serviceWorker.register('/msl-sw.js', { scope: '/' });
  }).then(function(reg) {
    console.log('[SW] Registered push-only SW:', reg.scope);
  }).catch(function(err) {
    console.warn('[SW] Error:', err.message);
  });
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);