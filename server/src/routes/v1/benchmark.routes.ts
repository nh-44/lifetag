import { Router } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response.utils';

const router = Router();

// Log a benchmark result
router.post('/log', async (req, res, next) => {
  try {
    const { operation, payloadSizeRaw, payloadSizeCompressed, timeElapsedMs, deviceMeta } = req.body;

    if (!operation || typeof payloadSizeRaw !== 'number' || typeof payloadSizeCompressed !== 'number' || typeof timeElapsedMs !== 'number') {
      throw { statusCode: 400, message: 'Invalid benchmark telemetry data' };
    }

    const log = await prisma.benchmarkLog.create({
      data: {
        operation,
        payloadSizeRaw,
        payloadSizeCompressed,
        timeElapsedMs,
        deviceMeta: deviceMeta || req.headers['user-agent'] || 'Unknown Device',
      }
    });

    sendSuccess(res, log, 201);
  } catch (error) {
    next(error);
  }
});

// Get all logged benchmark results (for LaTeX paper compilation & statistics)
router.get('/', async (req, res, next) => {
  try {
    const logs = await prisma.benchmarkLog.findMany({
      orderBy: { timestamp: 'desc' }
    });

    // Calculate basic statistics
    const stats = {
      totalRuns: logs.length,
      read: {
        count: logs.filter(l => l.operation === 'READ').length,
        avgTimeMs: logs.filter(l => l.operation === 'READ').reduce((acc, l) => acc + l.timeElapsedMs, 0) / (logs.filter(l => l.operation === 'READ').length || 1),
      },
      write: {
        count: logs.filter(l => l.operation === 'WRITE').length,
        avgTimeMs: logs.filter(l => l.operation === 'WRITE').reduce((acc, l) => acc + l.timeElapsedMs, 0) / (logs.filter(l => l.operation === 'WRITE').length || 1),
      },
      compressionEfficiency: logs.length > 0
        ? logs.reduce((acc, l) => acc + ((l.payloadSizeRaw - l.payloadSizeCompressed) / l.payloadSizeRaw), 0) / logs.length * 100
        : 0
    };

    sendSuccess(res, { stats, logs });
  } catch (error) {
    next(error);
  }
});

export default router;
