import { useEffect, useState } from 'react';
import { invalidateCache } from './api';
import { useDataSync } from '../stores/data-sync';
import { useNotificationStore } from '../stores/notification';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

let globalController: AbortController | null = null;
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
  if (globalController) { try { globalController.abort(); } catch {} globalController = null; }
  notifyListeners('connecting');

  const controller = new AbortController();
  globalController = controller;

  fetch('/api/sse', {
    credentials: 'include',
    signal: controller.signal,
    cache: 'no-store',
  }).then(response => {
    if (!response.ok) { throw new Error('SSE HTTP ' + response.status); }
    notifyListeners('connected');
    document.body.dataset.sseStatus = 'connected';

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    function processBuffer() {
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const rawData = line.slice(5).trim();
          try {
            const data = JSON.parse(rawData);
            handleEvent(currentEvent, data);
          } catch {}
          currentEvent = 'message';
        } else if (line.startsWith(':')) {
          // SSE comment (heartbeat) — ignore
        } else if (line.trim() === '') {
          currentEvent = 'message';
        }
      }
    }

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
        read();
      }).catch(() => {
        // Stream ended
      });
    }
    read();

    // Handle reconnect on stream close
    reader.closed.catch(() => {}).finally(() => {
      if (globalController === controller) {
        globalController = null;
        notifyListeners('disconnected');
        if (!globalStopped) globalReconnectTimer = setTimeout(globalConnect, 5000);
      }
    });
  }).catch(() => {
    if (globalController === controller) {
      globalController = null;
      notifyListeners('disconnected');
      if (!globalStopped) globalReconnectTimer = setTimeout(globalConnect, 5000);
    }
  });
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
      // Update badge directly from SSE event data
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
    } catch {}
  }
}

export function disconnectSSE() {
  globalStopped = true;
  if (globalController) { try { globalController.abort(); } catch {} globalController = null; }
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
    if (!globalStopped && !globalController && globalStatus === 'disconnected') {
      globalConnect();
    }
    return () => { listeners.delete(setStatus); };
  }, []);

  return status;
}