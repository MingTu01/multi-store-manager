import { useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * PortalContainer - React 19 安全的 Portal 容器
 * 
 * 使用专用 div 容器代替直接渲染到 document.body，
 * 避免 React 19 commit 阶段的 removeChild 错误。
 * 
 * 用法：
 *   <PortalContainer>
 *     <MyModal />
 *   </PortalContainer>
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 创建专用容器 div，而不是直接渲染到 document.body
    const container = document.createElement('div');
    container.style.cssText = 'position:relative;z-index:9999;';
    const root = getPortalRoot();
    root.appendChild(container);
    containerRef.current = container;

    return () => {
      // 清理：从 portal root 移除容器
      if (container.parentNode === root) {
        root.removeChild(container);
      }
      containerRef.current = null;
    };
  }, []);

  if (!containerRef.current) return null;
  return createPortal(children, containerRef.current);
}