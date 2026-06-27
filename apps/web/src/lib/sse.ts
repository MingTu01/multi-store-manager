import { useEffect, useState } from 'react';
import { invalidateCache } from './api';
import { useDataSync } from '../stores/data-sync';
import { useNotificationStore } from '../stores/notification';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

let globalSource: EventSource | null = null;
let globalStatus: ConnectionStatus = 'disconnected';
let globalReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let globalStopped = false;
let reconnectDelay = 3000;
const MAX_RECONNECT_DELAY = 60000;
const MAX_RECONNECT_ATTEMPTS = 50;
let reconnectAttempts = 0;
const listeners = new Set<(s: ConnectionStatus) => void>();

function notifyListeners(s: ConnectionStatus) {
  globalStatus = s;
  listeners.forEach(fn => fn(s));
}

function globalConnect() {
  if (globalStopped) return;
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }
  if (globalSource) { globalSource.close(); globalSource = null; }

  notifyListeners('connecting');
  console.log('[SSE] Connecting...');

  const source = new EventSource('/api/sse', { withCredentials: true });
  globalSource = source;

  source.onopen = function() {
    console.log('[SSE] Connected');
    notifyListeners('connected');
    reconnectDelay = 3000;
    reconnectAttempts = 0;
  };

  source.onmessage = function(e) {
    try {
      var data = JSON.parse(e.data);
      handleEvent('message', data);
    } catch {}
  };

  source.addEventListener('data-change', function(e: MessageEvent) {
    try {
      var data = JSON.parse(e.data);
      console.log('[SSE] data-change:', data.type, 'unreadCount:', data.unreadCount);
      handleEvent('data-change', data);
    } catch {}
  });

  source.addEventListener('system', function(e: MessageEvent) {
    try {
      var data = JSON.parse(e.data);
      console.log('[SSE] system:', data.action);
      handleEvent('system', data);
    } catch {}
  });

  source.onerror = function() {
    console.warn('[SSE] Connection error');
    source.close();
    globalSource = null;
    notifyListeners('disconnected');

    if (!globalStopped) {
      reconnectAttempts++;
      if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        console.error('[SSE] Max reconnect attempts reached, stopping');
        return;
      }
      console.log('[SSE] Reconnecting in ' + (reconnectDelay / 1000) + 's (attempt ' + reconnectAttempts + ')...');
      globalReconnectTimer = setTimeout(globalConnect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }
  };
}

function handleEvent(eventName: string, data: any) {
  if (eventName === 'system') {
    if (data.action === 'server-ready') {
      window.dispatchEvent(new CustomEvent('server-ready', { detail: data }));
    }
    return;
  }

  if (eventName === 'data-change') {
    try {
      const { bumpGlobal, bumpStore, bumpNotifications } = useDataSync.getState();
      if (typeof data.unreadCount === 'number') {
        useNotificationStore.setState({ unreadCount: data.unreadCount });
      }
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
    } catch (e) { console.error('[SSE] handleEvent error:', e); }
  }
}

export function disconnectSSE() {
  globalStopped = true;
  if (globalSource) { globalSource.close(); globalSource = null; }
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }
  notifyListeners('disconnected');
}

export function reconnectSSE() {
  globalStopped = false;
  reconnectDelay = 3000;
  reconnectAttempts = 0;
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }
  globalConnect();
}

export function useSSE(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(globalStatus);

  useEffect(() => {
    listeners.add(setStatus);
    if (!globalStopped && !globalSource && globalStatus === 'disconnected') {
      globalConnect();
    }
    return () => { listeners.delete(setStatus); };
  }, []);

  return status;
}
