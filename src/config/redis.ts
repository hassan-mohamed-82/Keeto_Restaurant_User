import Redis, { RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  // If using an Upstash cloud instance, TLS is required
  tls: process.env.REDIS_HOST?.includes('upstash.io') ? {} : undefined,
  maxRetriesPerRequest: null, // Often needed for queues like BullMQ
};

const redis = new Redis(redisOptions);

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;
