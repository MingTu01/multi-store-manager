import { useEffect, useRef, useState } from 'react';
import { invalidateCache } from './api';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * SSE hook for real-time data sync and connection status.
 * Returns current connection status for UI display.
 */
export function useSSE(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let stopped = false;

    function connect() {
      if (stopped) return;
      setStatus('connecting');

      const es = new EventSource('/api/sse?token=' + encodeURIComponent(token));
      esRef.current = es;

      es.addEventListener('open', () => {
        setStatus('connected');
      });

      es.addEventListener('data-change', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.storeId) {
            invalidateCache('/stores/' + data.storeId);
            invalidateCache('/stores/' + data.storeId + '/entries');
            invalidateCache('/stores/' + data.storeId + '/entries/stats');
            invalidateCache('/stores/' + data.storeId + '/inventory');
            invalidateCache('/stores/' + data.storeId + '/report');
          }
          invalidateCache('/notifications');
          invalidateCache('/stores');
        } catch {}
      });

      es.onopen = () => {
        setStatus('connected');
      };

      es.onerror = () => {
        setStatus('disconnected');
        es.close();
        if (!stopped) {
          reconnectTimer.current = setTimeout(connect, 5000);
        }
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
