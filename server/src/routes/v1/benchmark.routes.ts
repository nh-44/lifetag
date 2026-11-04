import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { sendSuccess, sendError } from '../../utils/response.utils';
import { ErrorCodes } from '../../constants/errorCodes';
import { validate } from '../../middlewares/validate.middleware';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { telemetryLimiter } from '../../middlewares/rateLimit.middleware';

const router = Router();

const BenchmarkLogSchema = z.object({
  operation: z.enum(['READ', 'WRITE']),
  payloadSizeRaw: z.number().int().min(0).max(100_000),
  payloadSizeCompressed: z.number().int().min(0).max(100_000),
  timeElapsedMs: z.number().min(0).max(600_000),
  deviceMeta: z.string().max(300).optional(),
});

/**
 * NFC timing telemetry. It is unauthenticated (responders may scan without logging in),
 * so it is validated, rate-limited, and disabled in production unless BENCHMARK_LOGGING=true:
 * an open write endpoint is otherwise a free way to fill the database.
 */
router.post('/log', telemetryLimiter, (req, res, next) => {
  const enabled = env.BENCHMARK_LOGGING ? env.BENCHMARK_LOGGING === 'true' : env.NODE_ENV !== 'production';
  if (!enabled) return sendError(res, ErrorCodes.FORBIDDEN, 'Telemetry logging is disabled', 403);
  next();
}, validate(BenchmarkLogSchema), async (req, res, next) => {
  try {
    const { operation, payloadSizeRaw, payloadSizeCompressed, timeElapsedMs, deviceMeta } = req.body;
    const log = await prisma.benchmarkLog.create({
      data: {
        operation,
        payloadSizeRaw,
        payloadSizeCompressed,
        timeElapsedMs,
        deviceMeta: (deviceMeta || req.headers['user-agent'] || 'Unknown Device').slice(0, 300),
      },
    });
    sendSuccess(res, { id: log.id }, 201);
  } catch (error) {
    next(error);
  }
});

// Aggregated results for the paper's statistics. Requires a logged-in user: the raw rows
// include device user-agent strings.
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const logs = await prisma.benchmarkLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 5000,
    });
    const of = (op: string) => logs.filter((l) => l.operation === op);
    const avg = (xs: typeof logs) => xs.reduce((acc, l) => acc + l.timeElapsedMs, 0) / (xs.length || 1);
    const withRaw = logs.filter((l) => l.payloadSizeRaw > 0);

    const stats = {
      totalRuns: logs.length,
      read: { count: of('READ').length, avgTimeMs: avg(of('READ')) },
      write: { count: of('WRITE').length, avgTimeMs: avg(of('WRITE')) },
      compressionEfficiency: withRaw.length
        ? (withRaw.reduce((acc, l) => acc + (l.payloadSizeRaw - l.payloadSizeCompressed) / l.payloadSizeRaw, 0) / withRaw.length) * 100
        : 0,
    };

    sendSuccess(res, { stats, logs });
  } catch (error) {
    next(error);
  }
});

export default router;
