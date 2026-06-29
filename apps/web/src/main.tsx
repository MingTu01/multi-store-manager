// =====================================================
// 最高优先级：单实例检查（在所有代码之前）
// 用 IIFE 包裹，避免变量泄露到全局
// =====================================================
(function() {
  const marker = '__msl_app_loaded__';
  if ((window as any)[marker]) {

    // 创建一个空的 div 替代 root，防止后续脚本报错
    return;
  }
  (window as any)[marker] = true;

  // Re-apply status bar when app resumes
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          try {
            const mod = await import('@capacitor/status-bar');
            await mod.StatusBar.setStyle({ style: mod.Style.Dark });
            await mod.StatusBar.setBackgroundColor({ color: '#ffffff' });
            await mod.StatusBar.setOverlaysWebView({ overlay: false });
          } catch (e) { console.warn('[MSL] Status bar style on resume failed:', e); }
        }
      });
    }).catch((e) => { console.warn('[MSL] Capacitor app import failed:', e); });
  }

  // Capacitor native status bar
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#ffffff' });
      StatusBar.setOverlaysWebView({ overlay: false });
    }).catch((e) => { console.warn('[MSL] Status bar setup failed:', e); });
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
    }).catch(function(err) { console.warn('[MSL] ServiceWorker registration failed:', err); });
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
    const createRoot = mods[0].createRoot;
    const BrowserRouter = mods[1].BrowserRouter;
    const App = mods[2].default;

    createRoot(document.getElementById('root')!).render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
  }).catch(function(err) {
    console.error('[MSL] Failed to load application:', err);
  });
})();