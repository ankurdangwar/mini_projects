import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load root .env if present, then local .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(16).default('backeri-dev-jwt-secret-change-in-production-32chars'),
  WEBHOOK_SECRET: z.string().min(16).default('backeri-dev-webhook-hmac-secret-change-in-prod'),
  UPLOAD_SIGNING_SECRET: z.string().min(16).default('backeri-dev-upload-signing-secret-change-in-prod'),
  PAYMENT_PROVIDER: z.enum(['sandbox', 'stripe', 'razorpay']).default('sandbox'),
  NOTIFICATION_PROVIDER: z.enum(['sandbox', 'twilio_resend']).default('sandbox'),
  STORAGE_PROVIDER: z.enum(['sandbox', 's3']).default('sandbox'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
});

export const env = envSchema.parse(process.env);
