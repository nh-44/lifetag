/**
 * Vitest global setup — runs once before any test file is loaded.
 * Must set all environment variables BEFORE any server module is imported,
 * because src/config/env.ts calls process.exit(1) on missing DATABASE_URL.
 *
 * We set vars DIRECTLY on process.env first, then load .env.test.
 * dotenv.config() does NOT overwrite already-set env vars, so direct
 * assignment here takes priority over anything in .env.test or .env.
 */
import path from 'path';
import dotenv from 'dotenv';

export async function setup() {
  // Direct assignment takes priority — ensures the test DB is used even if
  // src/config/env.ts re-runs dotenv.config({ path: '.env' }) later
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/lifetag_test?schema=public';
  process.env.JWT_SECRET = 'lifetag_test_jwt_secret_do_not_use_in_production';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.PORT = '9001';

  // Also load .env.test to pick up any other vars we might have missed
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
}

