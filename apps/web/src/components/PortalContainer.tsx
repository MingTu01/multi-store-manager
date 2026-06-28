import { useEffect, useLayoutEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * PortalContainer - React 19 安全的 Portal 容器
 * 
 * 使用 useState + useLayoutEffect 确保容器创建后触发重渲染
 * 避免 useRef + useEffect 模式下 ref 变化不触发渲染的问题
 */

let portalRoot: HTMLDivElement | null = null;

function getPortalRoot(): HTMLDivElement {
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'msl-portal-root';
    portalRoot.style.cssText = 'position:relative;z-index:9999;';
    document.body.appendChild(portalRoot);
  }
  return portalRoot;
}

interface PortalContainerProps {
  children: ReactNode;
}

export function PortalContainer({ children }: PortalContainerProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:relative;z-index:9999;';
    const root = getPortalRoot();
    root.appendChild(el);
    setContainer(el);

    return () => {
      if (el.parentNode === root) {
        root.removeChild(el);
      }
      setContainer(null);
    };
  }, []);

  if (!container) return null;
  return createPortal(children, container);
}