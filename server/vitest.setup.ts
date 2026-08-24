/**
 * Vitest per-file setup — runs after globals are available but before each test file.
 * Disconnects Prisma after the entire suite finishes.
 */
import { afterAll } from 'vitest';

afterAll(async () => {
  // Lazy-import to avoid loading prisma before globalSetup sets env vars.
  // Guard against unit test files where prisma may be vi.mock'd (no $disconnect).
  const { prisma } = await import('./src/config/database');
  if (typeof prisma.$disconnect === 'function') {
    await prisma.$disconnect();
  }
});

