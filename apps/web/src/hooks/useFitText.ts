import { useRef, useState, useLayoutEffect } from 'react';

interface FitTextOptions {
  /** 最小字号 px */
  minFontSize?: number;
  /** 最大字号 px */
  maxFontSize?: number;
  /** 安全系数（<1 留出余量），默认 0.92 */
  safety?: number;
}

/**
 * 自适应文字 hook：让单行文字根据容器宽度自动缩放字号，撑满可用宽度。
 * 原理：用 canvas 测量文字在某个字号下的宽度，二分查找最大可容纳字号。
 *
 * @returns ref 挂到容器，fontSize 用于文字 style
 */
export function useFitText<T extends HTMLElement = HTMLDivElement>(
  text: string,
  options: FitTextOptions = {}
) {
  const { minFontSize = 8, maxFontSize = 16, safety = 0.92 } = options;
  const containerRef = useRef<T>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !text) return;

    const measure = () => {
      const containerWidth = el.clientWidth;
      if (containerWidth <= 0) return;

      // 用 canvas 测量文字宽度（比 DOM 测量快且无副作用）
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 二分查找最大可容纳字号
      let lo = minFontSize;
      let hi = maxFontSize;
      let best = minFontSize;
      while (lo <= hi) {
        const mid = (lo + hi) / 2;
        ctx.font = `600 ${mid}px sans-serif`;
        const textWidth = ctx.measureText(text).width;
        if (textWidth <= containerWidth * safety) {
          best = mid;
          lo = mid + 0.5;
        } else {
          hi = mid - 0.5;
        }
      }
      setFontSize(Math.max(minFontSize, Math.min(maxFontSize, best)));
    };

    measure();

    // 监听容器宽度变化（窗口 resize、父级布局变化等）
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, minFontSize, maxFontSize, safety]);

  return { ref: containerRef, fontSize };
}
