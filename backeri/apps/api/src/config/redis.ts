import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

export const redisSub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err) => {
  if (env.NODE_ENV !== 'test') {
    console.error('[Redis] Error:', err.message);
  }
});

redisSub.on('error', (err) => {
  if (env.NODE_ENV !== 'test') {
    console.error('[RedisSub] Error:', err.message);
  }
});

export const REALTIME_CHANNEL = 'backeri:events';

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), redisSub.quit()]);
}
