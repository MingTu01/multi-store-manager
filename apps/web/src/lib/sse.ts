import { useEffect, useRef, useState } from 'react';
import { invalidateCache } from './api';
import { useDataSync } from '../stores/data-sync';
import { useNotificationStore } from '../stores/notification';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

// Global singleton - one SSE connection for the entire app
let globalES: EventSource | null = null;
let globalStatus: ConnectionStatus = 'disconnected';
let globalReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let globalStopped = false;
const listeners = new Set<(s: ConnectionStatus) => void>();

function notifyListeners(s: ConnectionStatus) {
  globalStatus = s;
  listeners.forEach(fn => fn(s));
}

function globalConnect() {
  if (globalStopped) return;
  if (globalES) { try { globalES.close(); } catch {} globalES = null; }
  notifyListeners('connecting');
  try {
    const es = new EventSource('/api/sse', { withCredentials: true });
    globalES = es;

    es.onopen = () => {
      notifyListeners('connected');
      document.body.dataset.sseStatus = 'connected';
      (window as any).__sseReconnected = true;
      window.dispatchEvent(new CustomEvent('server-ready'));
    };

    es.addEventListener('system', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.action === 'server-ready') {
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

    es.onerror = () => {
      notifyListeners('disconnected');
      try { es.close(); } catch {}
      if (globalES === es) globalES = null;
      if (globalReconnectTimer) clearTimeout(globalReconnectTimer);
      if (!globalStopped) globalReconnectTimer = setTimeout(globalConnect, 5000);
    };
  } catch {
    notifyListeners('disconnected');
    if (!globalStopped) globalReconnectTimer = setTimeout(globalConnect, 5000);
  }
}

export function disconnectSSE() {
  globalStopped = true;
  if (globalES) { try { globalES.close(); } catch {} globalES = null; }
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }
  notifyListeners('disconnected');
}

export function reconnectSSE() {
  globalStopped = false;
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }
  globalConnect();
}

export function useSSE(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(globalStatus);

  useEffect(() => {
    listeners.add(setStatus);
    // Start connection if not already running
    if (!globalStopped && !globalES && globalStatus === 'disconnected') {
      globalConnect();
    }
    return () => { listeners.delete(setStatus); };
  }, []);

  return status;
}
