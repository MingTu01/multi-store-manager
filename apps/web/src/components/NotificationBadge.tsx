import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface NotificationBadgeProps {
  count?: number;
  poll?: boolean;
  interval?: number;
}

export function NotificationBadge({ count: propCount, poll = false, interval = 30000 }: NotificationBadgeProps) {
  const [count, setCount] = useState(propCount ?? 0);

  useEffect(() => {
    if (propCount !== undefined) {
      setCount(propCount);
      return;
    }
    if (!poll) return;

    const fetchCount = () => {
      api.get('/notifications/unread-count').then((d: any) => {
        setCount(d.count || 0);
      }).catch(() => {});
    };

    fetchCount();
    const timer = setInterval(fetchCount, interval);
    return () => clearInterval(timer);
  }, [propCount, poll, interval]);

  if (count <= 0) return null;

  const display = count > 99 ? '99+' : String(count);

  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
      {display}
    </span>
  );
}

export default NotificationBadge;
