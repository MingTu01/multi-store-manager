import { useEffect } from 'react';
import { useNotificationStore } from '../stores/notification';

/**
 * 共享的未读通知轮询钩子
 * 使用 SSE 事件驱动更新，降级为 30s 轮询
 * 避免 BottomNav 和 Sidebar 各自独立轮询
 */
export function useUnreadPolling() {
  const fetchUnread = useNotificationStore((s) => s.fetchUnread);

  useEffect(() => {
    // 初始获取
    fetchUnread();
    // 降级轮询（SSE 断开时兜底）
    const timer = setInterval(fetchUnread, 30000);
    return () => clearInterval(timer);
  }, [fetchUnread]);
}