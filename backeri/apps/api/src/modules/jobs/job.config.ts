import type { ConnectionOptions } from 'bullmq';
import { env } from '../../config/env';

export const QUEUE_NAMES = {
  NOTIFICATIONS: 'backeri-notifications',
  MAINTENANCE: 'backeri-maintenance',
} as const;

export const MAINTENANCE_JOBS = {
  ROLLING_SLOTS: 'rolling-slot-generator',
  STALE_PENDING_CLEANUP: 'stale-pending-cleanup',
} as const;

export const DEFAULT_SLOT_HORIZON_DAYS = 14;
export const DEFAULT_STALE_PENDING_MINUTES = 20;

export const DEFAULT_SLOT_WINDOWS = [
  { startTime: '08:00', endTime: '10:00', maxOrders: 8 },
  { startTime: '10:00', endTime: '12:00', maxOrders: 10 },
  { startTime: '12:00', endTime: '14:00', maxOrders: 10 },
  { startTime: '14:00', endTime: '16:00', maxOrders: 8 },
  { startTime: '16:00', endTime: '18:00', maxOrders: 6 },
] as const;

export function getBullMQConnection(): ConnectionOptions {
  const parsed = new URL(env.REDIS_URL);
  const dbNum =
    parsed.pathname && parsed.pathname.length > 1
      ? Number(parsed.pathname.slice(1))
      : 0;

  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number(parsed.port) : 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: Number.isFinite(dbNum) ? dbNum : 0,
    maxRetriesPerRequest: null,
  };
}
