import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL environment variable is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET environment variable is required'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTHORITY_PRIVATE_KEY: z.string().optional(),
  // Number of reverse proxies in front of the app (Render/Heroku: 1). Without it every
  // client appears to come from the proxy IP and shares one rate-limit bucket.
  TRUST_PROXY: z.string().optional(),
  // Unauthenticated NFC telemetry (POST /benchmarks/log) is off in production unless enabled.
  BENCHMARK_LOGGING: z.enum(['true', 'false']).optional(),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV === 'production' && e.JWT_SECRET.length < 32) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'must be at least 32 characters in production' });
  }
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
