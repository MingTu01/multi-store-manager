// Server-Side Event Bus for real-time data push
import { Response } from 'express';

interface SSEClient {
  id: string;
  userId: number;
  res: Response;
}

class EventBus {
  private clients: Map<string, SSEClient> = new Map();
  private counter = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  addClient(userId: number, res: Response): string {
    const id = 'client_' + (++this.counter);
    this.clients.set(id, { id, userId, res });
    console.log('[SSE] Client connected: ' + id + ' (user ' + userId + '), total: ' + this.clients.size);
    // 第一个客户端连接时启动心跳
    if (this.clients.size === 1) {
      this.startHeartbeat();
    }
    return id;
  }

  removeClient(id: string) {
    this.clients.delete(id);
    console.log('[SSE] Client disconnected: ' + id + ', total: ' + this.clients.size);
    // 没有客户端时停止心跳
    if (this.clients.size === 0) {
      this.stopHeartbeat();
    }
  }

  /** 启动 SSE 心跳，每 30 秒发送一次 */
  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const [, client] of this.clients) {
        try {
          client.res.write(':heartbeat\n\n');
        } catch {
          // 忽略写入失败，dead client 会在下次 broadcast 时清理
        }
      }
    }, 30000);
    console.log('[SSE] Heartbeat started');
  }

  /** 停止心跳 */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('[SSE] Heartbeat stopped');
    }
  }

  /** Broadcast a data change event to all connected clients */
  broadcast(event: { type: string; action: string; storeId?: string; data?: any; excludeUserId?: number }) {
    const message = JSON.stringify(event);
    const dead: string[] = [];
    for (const [id, client] of this.clients) {
      if (event.excludeUserId && client.userId === event.excludeUserId) continue;
      try {
        client.res.write('event: data-change\ndata: ' + message + '\n\n');
      } catch {
        dead.push(id);
      }
    }
    dead.forEach(id => this.clients.delete(id));
  }
  /** Broadcast a system event to all connected clients */
  broadcastSystem(action: string, data?: any) {
    const message = JSON.stringify({ type: 'system', action, data });
    const dead: string[] = [];
    for (const [id, client] of this.clients) {
      try {
        client.res.write('event: system\ndata: ' + message + '\n\n');
      } catch {
        dead.push(id);
      }
    }
    dead.forEach(id => this.clients.delete(id));
  }
}

export const eventBus = new EventBus();
