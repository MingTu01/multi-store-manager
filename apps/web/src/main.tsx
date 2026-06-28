// =====================================================
// 最高优先级：单实例检查（在所有代码之前）
// 用 IIFE 包裹，避免变量泄露到全局
// =====================================================
(function() {
  var marker = '__msl_app_loaded__';
  if ((window as any)[marker]) {

    // 创建一个空的 div 替代 root，防止后续脚本报错
    return;
  }
  (window as any)[marker] = true;

  // Capacitor native status bar
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: Style.Light });
      StatusBar.setBackgroundColor({ color: '#3b63f7' });
      StatusBar.setOverlaysWebView({ overlay: false });
    }).catch(() => {});
  }

  // =====================================================
  if ('serviceWorker' in navigator) {
    // Clean old caches but keep SW registration (preserves push subscriptions)
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) { return caches.delete(n); }));
    }).then(function() {
      return navigator.serviceWorker.register('/msl-sw.js', { scope: '/' });
    }).then(function(reg) {
      reg.update();
      if (reg.installing) { reg.installing.postMessage({ type: 'SKIP_WAITING' }); }
      if (reg.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
    }).catch(function() {});
  }

  // =====================================================
  // 动态加载 React 应用（确保单实例检查在前）
  // =====================================================
  Promise.all([
    import('react-dom/client'),
    import('react-router-dom'),
    import('./App'),
    import('./index.css')
  ]).then(function(mods) {
    var createRoot = mods[0].createRoot;
    var BrowserRouter = mods[1].BrowserRouter;
    var App = mods[2].default;

    createRoot(document.getElementById('root')!).render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
  }).catch(function(err) {
    console.error('[MSL] Failed to load application:', err);
  });
})();