// Server-Side Event Bus for real-time data push
import db from './db.js';
import { Response } from 'express';

interface SSEClient {
  id: string;
  userId: number;
  role: string;
  storeId: string | null;
  res: Response;
}

// Pre-compiled SQL statements for performance
const stmtUnread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0');
const stmtUnreadBatch = db.prepare('SELECT user_id, COUNT(*) as c FROM notifications WHERE user_id IN (SELECT value FROM json_each(?)) AND read = 0 GROUP BY user_id');

class EventBus {
  private clients: Map<string, SSEClient> = new Map();
  private counter = 0;

  addClient(userId: number, role: string, storeId: string | null, res: Response): string {
    const id = 'client_' + (++this.counter);
    this.clients.set(id, { id, userId, role, storeId, res });
    console.log('[SSE] Client connected: ' + id + ' (user ' + userId + '), total: ' + this.clients.size);
    return id;
  }

  removeClient(id: string) {
    this.clients.delete(id);
    console.log('[SSE] Client disconnected: ' + id + ', total: ' + this.clients.size);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  /** Broadcast a data change event to all connected clients */
  broadcast(event: { type: string; action: string; storeId?: string; data?: any; excludeUserId?: number }) {
    if (this.clients.size === 0) return;

    // Batch query unread counts for all connected users
    const userIds = [...new Set([...this.clients.values()].map(c => c.userId))];
    const unreadMap = new Map<number, number>();

    try {
      if (userIds.length > 0) {
        const jsonArr = JSON.stringify(userIds);
        const rows = stmtUnreadBatch.all(jsonArr) as any[];
        for (const row of rows) {
          unreadMap.set(row.user_id, row.c);
        }
      }
    } catch (e) {


    }

    const dead: string[] = [];
    for (const [id, client] of this.clients) {
      if (event.excludeUserId && client.userId === event.excludeUserId) continue;
      try {
        const enriched = JSON.stringify({ ...event, unreadCount: unreadMap.get(client.userId) || 0 });
        client.res.write('event: data-change\ndata: ' + enriched + '\n\n');

      } catch {
        dead.push(id);
      }
    }
    dead.forEach(id => this.clients.delete(id));
  }

  /** Broadcast a system event to all connected clients */
  broadcastSystem(action: string, data?: any) {
    if (this.clients.size === 0) return;
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
