import { useState, useEffect, memo } from 'react';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 独立的实时时钟组件
 * 使用 React.memo 避免不必要的重渲染
 */
export const Clock = memo(function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const weekStr = '星期' + weekdays[now.getDay()];

  return (
    <>
      <div className="mb-1 text-4xl font-mono font-bold text-slate-800">{timeStr}</div>
      <div className="mb-2 text-sm text-slate-500">{dateStr} {weekStr}</div>
    </>
  );
});
