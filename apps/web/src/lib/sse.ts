import { useEffect, useRef, useState } from 'react';
import { invalidateCache } from './api';
import { useDataSync } from '../stores/data-sync';
import { useNotificationStore } from '../stores/notification';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export function useSSE(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tokenRaw = localStorage.getItem('token');
    if (!tokenRaw) return;
    const token: string = tokenRaw;
    let stopped = false;

    function connect() {
      if (stopped) return;
      setStatus('connecting');
      const es = new EventSource('/api/sse?token=' + encodeURIComponent(token));
      esRef.current = es;

      es.addEventListener('open', () => setStatus('connected'));

      es.addEventListener('system', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.action === 'server-ready') {
            // Server has restarted, dispatch custom event
            window.dispatchEvent(new CustomEvent('server-ready', { detail: data }));
          }
        } catch {}
      });

      es.addEventListener('data-change', (e) => {
        try {
          const data = JSON.parse(e.data);
          const { bumpGlobal, bumpStore, bumpNotifications } = useDataSync.getState();
          const { fetchUnread } = useNotificationStore.getState();

          if (data.storeId) {
            invalidateCache('/stores/' + data.storeId);
            invalidateCache('/stores/' + data.storeId + '/entries');
            invalidateCache('/stores/' + data.storeId + '/entries/stats');
            invalidateCache('/stores/' + data.storeId + '/inventory');
            invalidateCache('/stores/' + data.storeId + '/report');
            bumpStore(data.storeId);
          }
          invalidateCache('/notifications');
          invalidateCache('/unread-count');
          invalidateCache('/stores');
          invalidateCache('/dashboard');
          bumpGlobal();
          bumpNotifications();
          fetchUnread();
        } catch {}
      });

      es.onopen = () => {
        setStatus('connected');
        // Dispatch server-ready event when SSE reconnects after server restart
        window.dispatchEvent(new CustomEvent('server-ready'));
      };
      es.onerror = () => {
        setStatus('disconnected');
        es.close();
        if (!stopped) reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      stopped = true;
      setStatus('disconnected');
      if (esRef.current) esRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  return status;
}
