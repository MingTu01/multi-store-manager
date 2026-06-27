import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// =====================================================
// STEP 1: 全局 removeChild 错误拦截（三层防御）
// React 19 commit 阶段偶尔对已移除节点调用 removeChild
// =====================================================

// 第一层：DOM 层拦截
(function() {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function<T extends Node>(child: T): T {
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (e) {
      return child;
    }
  };
})();

// 第二层：console.error 拦截
(function() {
  const originalConsoleError = console.error;
  let removeChildErrorCount = 0;
  console.error = function(...args: unknown[]) {
    const msg = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
    if ((msg.includes('removeChild') || msg.includes('not a child of this node')) && removeChildErrorCount < 20) {
      removeChildErrorCount++;
      return; // 静默
    }
    originalConsoleError.apply(console, args);
  };
})();

// 第三层：window.onerror 拦截
window.addEventListener('error', function(e) {
  if (e.message && (e.message.includes('removeChild') || e.message.includes('not a child of this node'))) {
    e.preventDefault();
    return true;
  }
});

// =====================================================
// STEP 2: 强制单实例 - 防止多个 React 根同时运行
// 旧 SW 缓存可能导致同一脚本加载两次（带/不带 ?v= 参数）
// =====================================================
(function enforceSingleInstance() {
  var marker = '__msl_app_loaded__';
  if ((window as any)[marker]) {
    console.warn('[MSL] Duplicate script detected, aborting second instance');
    return;
  }
  (window as any)[marker] = true;

  // =====================================================
  // STEP 3: SW 清理 + 注册
  // =====================================================
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

  // =====================================================
  // STEP 4: 渲染 React 应用
  // =====================================================
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
})();