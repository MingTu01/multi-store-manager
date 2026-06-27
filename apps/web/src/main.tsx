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

  // =====================================================
  // 全局 removeChild 错误拦截（三层防御）
  // =====================================================

  // 第一层：DOM 层拦截
  var originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function<T extends Node>(child: T): T {
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (e) {
      return child;
    }
  };

  // 第二层：console.error 拦截
  var originalConsoleError = console.error;
  var removeChildCount = 0;
  console.error = function(...args: unknown[]) {
    var msg = args.map(function(a) { return typeof a === 'string' ? a : String(a); }).join(' ');
    if ((msg.indexOf('removeChild') !== -1 || msg.indexOf('not a child of this node') !== -1) && removeChildCount < 20) {
      removeChildCount++;
      return;
    }
    originalConsoleError.apply(console, args);
  };

  // 第三层：window.onerror 拦截
  window.addEventListener('error', function(e) {
    if (e.message && (e.message.indexOf('removeChild') !== -1 || e.message.indexOf('not a child of this node') !== -1)) {
      e.preventDefault();
      return true;
    }
  });

  // =====================================================
  // SW 清理 + 注册
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
    if (err.message && err.message.indexOf('__msl_duplicate') !== -1) return;

  });
})();