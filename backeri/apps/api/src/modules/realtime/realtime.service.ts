import type { Response } from 'express';
import { REALTIME_CHANNEL, redis, redisSub } from '../../config/redis';

export type RealtimeEventType =
  | 'order.created'
  | 'order.status_updated'
  | 'slot.updated'
  | 'catalog.updated';

export interface RealtimeEvent {
  type: RealtimeEventType;
  timestamp: string;
  payload: unknown;
}

class RealtimeService {
  private clients = new Set<Response>();
  private subscribed = false;

  async init(): Promise<void> {
    if (this.subscribed) return;
    this.subscribed = true;

    await redisSub.subscribe(REALTIME_CHANNEL);
    redisSub.on('message', (channel, message) => {
      if (channel !== REALTIME_CHANNEL) return;
      this.broadcastRaw(message);
    });
  }

  addClient(res: Response): () => void {
    this.clients.add(res);
    return () => {
      this.clients.delete(res);
    };
  }

  async publish(type: RealtimeEventType, payload: unknown): Promise<void> {
    const event: RealtimeEvent = {
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    const serialized = JSON.stringify(event);
    try {
      await redis.publish(REALTIME_CHANNEL, serialized);
    } catch (err) {
      console.error('[Realtime] Redis publish failed, falling back to local broadcast:', err);
      this.broadcastRaw(serialized);
    }
  }

  private broadcastRaw(serialized: string): void {
    let eventName = 'message';
    try {
      const parsed = JSON.parse(serialized) as { type?: string };
      if (parsed.type) eventName = parsed.type;
    } catch {
      // ignore parse failure
    }

    const frame = `event: ${eventName}\ndata: ${serialized}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const realtimeService = new RealtimeService();
