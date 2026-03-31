// ============================================
// api/lib/rate-limiter.js v2.0 — Redis Persistente
// Fallback in-memory para dev local
// ============================================
import { createClient } from 'redis';

const WINDOW_SEC = 15 * 60;  // 15 minutos
const MAX_REQUESTS = 100;

let redisClient = null;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    redisClient = createClient({ url });
    redisClient.on('error', (err) => {
      console.error('Redis error:', err.message);
      redisClient = null;
    });
    await redisClient.connect();
    return redisClient;
  } catch (err) {
    console.error('Redis connect failed:', err.message);
    redisClient = null;
    return null;
  }
}

const localStore = new Map();

export class RateLimiter {
  async isAllowed(identifier) {
    const key = `rate:${identifier}`;
    const redis = await getRedis();

    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, WINDOW_SEC);

        if (count > MAX_REQUESTS) {
          const ttl = await redis.ttl(key);
          return { allowed: false, retryAfter: ttl > 0 ? ttl : WINDOW_SEC, source: 'redis' };
        }

        return { allowed: true, remaining: MAX_REQUESTS - count, source: 'redis' };

      } catch (err) {
        console.error('Redis op failed, fallback:', err.message);
        redisClient = null;
      }
    }

    // Fallback in-memory
    const now = Date.now();
    const data = localStore.get(identifier);

    if (!data || now > data.resetTime) {
      localStore.set(identifier, { count: 1, resetTime: now + WINDOW_SEC * 1000 });
      return { allowed: true, remaining: MAX_REQUESTS - 1, source: 'memory' };
    }

    data.count++;

    if (data.count > MAX_REQUESTS) {
      return { allowed: false, retryAfter: Math.ceil((data.resetTime - now) / 1000), source: 'memory' };
    }

    return { allowed: true, remaining: MAX_REQUESTS - data.count, source: 'memory' };
  }
}

export const rateLimiter = new RateLimiter();
