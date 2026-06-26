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
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }

  if (globalController) {
    const old = globalController;
    globalController = null;
    try { old.abort(); } catch {}
  }

  notifyListeners('connecting');
  console.log('[SSE] Connecting...');
  const controller = new AbortController();
  globalController = controller;

  fetch('/api/sse', {
    credentials: 'include',
    signal: controller.signal,
    cache: 'no-store',
  }).then(response => {
    if (!response.ok) {
      console.error('[SSE] HTTP error:', response.status);
      throw new Error('SSE HTTP ' + response.status);
    }
    if (globalController !== controller) { console.log('[SSE] Stale connection, aborting'); return; }
    console.log('[SSE] Connected successfully');
    notifyListeners('connected');

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
            console.log('[SSE] Event:', currentEvent, 'unreadCount:', data.unreadCount, 'type:', data.type);
            handleEvent(currentEvent, data);
          } catch (e) { console.warn('[SSE] Parse error:', rawData.substring(0, 100)); }
          currentEvent = 'message';
        } else if (line.startsWith(':')) {
          // heartbeat
        } else if (line.trim() === '') {
          currentEvent = 'message';
        }
      }
    }

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) { console.log('[SSE] Stream ended'); return; }
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
        read();
      }).catch(function(e) { console.warn('[SSE] Read error:', e.message); });
    }
    read();

    reader.closed.catch(function() {}).finally(function() {
      if (globalController === controller) {
        console.log('[SSE] Connection closed, scheduling reconnect');
        globalController = null;
        notifyListeners('disconnected');
        if (!globalStopped) {
          globalReconnectTimer = setTimeout(globalConnect, 5000);
        }
      } else {
        console.log('[SSE] Old connection closed (not active), ignoring');
      }
    });
  }).catch(function(err) {
    if (globalController === controller) {
      globalController = null;
      notifyListeners('disconnected');
      if (!globalStopped && err.name !== 'AbortError') {
        console.error('[SSE] Fetch error:', err.message, '- reconnecting in 5s');
        globalReconnectTimer = setTimeout(globalConnect, 5000);
      }
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
      if (typeof data.unreadCount === 'number') {
        console.log('[SSE] Updating badge from SSE: unreadCount=' + data.unreadCount);
        useNotificationStore.setState({ unreadCount: data.unreadCount });
      } else {
        console.log('[SSE] No unreadCount in data-change event');
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
  if (globalController) {
    const c = globalController;
    globalController = null;
    try { c.abort(); } catch {}
  }
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