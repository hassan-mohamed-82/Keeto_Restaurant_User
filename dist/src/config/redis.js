"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redisOptions = {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    // If using an Upstash cloud instance, TLS is required
    tls: process.env.REDIS_HOST?.includes('upstash.io') ? {} : undefined,
    maxRetriesPerRequest: null, // Often needed for queues like BullMQ
};
const redis = new ioredis_1.default(redisOptions);
redis.on('connect', () => {
    console.log('Redis connected successfully');
});
redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});
exports.default = redis;
