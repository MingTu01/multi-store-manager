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

  addClient(userId: number, res: Response): string {
    const id = 'client_' + (++this.counter);
    this.clients.set(id, { id, userId, res });
    console.log('[SSE] Client connected: ' + id + ' (user ' + userId + '), total: ' + this.clients.size);
    return id;
  }

  removeClient(id: string) {
    this.clients.delete(id);
    console.log('[SSE] Client disconnected: ' + id + ', total: ' + this.clients.size);
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
}

export const eventBus = new EventBus();
