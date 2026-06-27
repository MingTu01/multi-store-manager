import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Fix React 19 removeChild bug: monkey-patch Node.prototype.removeChild
// React 19's DOM reconciler sometimes tries to remove nodes that are already removed
(function() {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function<T extends Node>(child: T): T {
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (e) {
      // If the node is not a child, return it silently instead of throwing
      console.warn('[React19 fix] removeChild: node not a child, ignoring');
      return child;
    }
  };
})();

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
