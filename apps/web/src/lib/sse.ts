import { useEffect, useState } from 'react';
import { invalidateCache } from './api';
import { getBaseURL } from './config';
import { useDataSync } from '../stores/data-sync';
import { useNotificationStore } from '../stores/notification';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

// ── BroadcastChannel multi-tab support ─────────────────────────────
const channel = new BroadcastChannel('msl-sse');
const LEADER_KEY = 'msl_sse_leader';
const HEARTBEAT_KEY = 'msl_sse_heartbeat';
const HEARTBEAT_INTERVAL = 2000;
const HEARTBEAT_TTL = 5000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function isLeaderAlive(): boolean {
  const ts = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0');
  return Date.now() - ts < HEARTBEAT_TTL;
}

const tabId = Math.random().toString(36).slice(2, 10);
function amILeader(): boolean {
  return localStorage.getItem(LEADER_KEY) === tabId;
}

function tryBecomeLeader(): boolean {
  if (isLeaderAlive()) return false;
  localStorage.setItem(LEADER_KEY, tabId);
  localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
  return true;
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (amILeader()) {
      localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// ── BroadcastChannel message handling (follower tabs) ──────────────
channel.onmessage = (e: MessageEvent) => {
  const { eventName, data } = e.data;
  if (eventName && data) handleEvent(eventName, data, true);
};

// ── SSE connection (leader only) ───────────────────────────────────
let globalSource: EventSource | null = null;
let globalStatus: ConnectionStatus = 'disconnected';
let globalReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let globalStopped = false;
let reconnectDelay = 3000;
const MAX_RECONNECT_DELAY = 60000;
const MAX_RECONNECT_ATTEMPTS = 20;
let reconnectAttempts = 0;
let isConnecting = false;
const listeners = new Set<(s: ConnectionStatus) => void>();

function notifyListeners(s: ConnectionStatus) {
  globalStatus = s;
  listeners.forEach(fn => fn(s));
}

function globalConnect() {
  if (globalStopped) return;
  if (isConnecting) return;
  if (globalSource) { globalSource.close(); globalSource = null; }
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }

  // Leader election: if another tab is already leader, just listen
  if (!amILeader() && !tryBecomeLeader()) {
    notifyListeners('connected');
    return;
  }

  isConnecting = true;
  notifyListeners('connecting');
  startHeartbeat();

  const source = new EventSource(getBaseURL() + '/api/sse', { withCredentials: true });
  globalSource = source;

  source.onopen = function() {
    isConnecting = false;
    notifyListeners('connected');
    reconnectDelay = 3000;
    reconnectAttempts = 0;
  };

  source.onmessage = function(e) {
    try {
      const data = JSON.parse(e.data);
      handleEvent('message', data);
      channel.postMessage({ eventName: 'message', data });
    } catch (err) { console.warn('[SSE] message parse error:', err); }
  };

  source.addEventListener('data-change', function(e: MessageEvent) {
    try {
      const data = JSON.parse(e.data);
      handleEvent('data-change', data);
      channel.postMessage({ eventName: 'data-change', data });
    } catch (err) { console.warn('[SSE] data-change parse error:', err); }
  });

  source.addEventListener('system', function(e: MessageEvent) {
    try {
      const data = JSON.parse(e.data);
      handleEvent('system', data);
      channel.postMessage({ eventName: 'system', data });
    } catch (err) { console.warn('[SSE] system parse error:', err); }
  });

  source.onerror = function() {
    isConnecting = false;
    source.close();
    globalSource = null;
    notifyListeners('disconnected');

    if (!globalStopped) {
      reconnectAttempts++;
      if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        console.error('[SSE] Max reconnect attempts reached, stopping');
        return;
      }
      globalReconnectTimer = setTimeout(globalConnect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }
  };
}

function handleEvent(eventName: string, data: any, _fromBroadcast = false) {
  if (data && data.type === 'heartbeat') return;

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
      const eventType = data.type || '';
      if (data.storeId) {
        bumpStore(data.storeId);
        invalidateCache('/stores/' + data.storeId);
        if (eventType === 'entry' || eventType === 'purchase') {
          invalidateCache('/stores/' + data.storeId + '/entries');
          invalidateCache('/stores/' + data.storeId + '/entries/stats');
          invalidateCache('/stores/' + data.storeId + '/report');
        }
        if (eventType === 'inventory') {
          invalidateCache('/stores/' + data.storeId + '/inventory');
        }
        if (eventType === 'shift') {
          invalidateCache('/stores/' + data.storeId + '/shifts');
        }
      }
      if (eventType === 'notification') {
        invalidateCache('/notifications');
        invalidateCache('/unread-count');
        bumpNotifications();
      }
      if (['entry', 'payroll', 'dividend'].includes(eventType)) {
        invalidateCache('/dashboard');
        bumpGlobal();
      }
    } catch (e) { console.error('[SSE] handleEvent error:', e); }
  }
}

export function disconnectSSE() {
  globalStopped = true;
  isConnecting = false;
  if (globalSource) { globalSource.close(); globalSource = null; }
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }
  stopHeartbeat();
  if (amILeader()) localStorage.removeItem(LEADER_KEY);
  notifyListeners('disconnected');
}

export function reconnectSSE() {
  globalStopped = false;
  isConnecting = false;
  reconnectDelay = 3000;
  reconnectAttempts = 0;
  if (globalReconnectTimer) { clearTimeout(globalReconnectTimer); globalReconnectTimer = null; }
  if (globalSource) { globalSource.close(); globalSource = null; }
  globalConnect();
}

// ── Leader takeover on tab close ───────────────────────────────────
// 命名处理器：便于在 cleanupSSEListeners 中移除，避免内存泄漏
const beforeUnloadHandler = () => {
  disconnectSSE();
};

// When the leader tab closes, storage events let followers take over
const storageHandler = (e: StorageEvent) => {
  if (e.key === LEADER_KEY && e.newValue === null) {
    if (!globalStopped) {
      setTimeout(() => {
        if (!isLeaderAlive()) {
          globalConnect();
        }
      }, 100);
    }
  }
};

window.addEventListener('beforeunload', beforeUnloadHandler);
window.addEventListener('storage', storageHandler);

// 移除模块级 window 事件监听器，供需要清理时（如热更新/测试）手动调用，避免内存泄漏
export function cleanupSSEListeners() {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  window.removeEventListener('storage', storageHandler);
}

export function useSSE(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(globalStatus);

  useEffect(() => {
    listeners.add(setStatus);
    if (!globalStopped && !globalSource && !isConnecting && globalStatus === 'disconnected') {
      globalConnect();
    }
    return () => { listeners.delete(setStatus); };
  }, []);

  return status;
}
