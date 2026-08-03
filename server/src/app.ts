import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { prisma } from './config/database';
import v1Router from './routes/v1';
import { errorHandler } from './middlewares/error.middleware';
import { apiLimiter } from './middlewares/rateLimit.middleware';

const app: Express = express();

// Security & Middleware Stack
app.use(helmet());
app.use(
	cors({
		origin: env.CORS_ORIGIN,
		credentials: true,
	})
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Base Root Route
app.get('/', (req: Request, res: Response) => {
	res.json({
		name: 'LifeTag Emergency Medical API',
		version: '1.0.0',
		status: 'online',
		timestamp: new Date().toISOString(),
	});
});

// Health Check Endpoint (Includes PostgreSQL DB Check)
app.get('/api/v1/health', async (req: Request, res: Response) => {
	let dbStatus = 'disconnected';
	try {
		// Perform light ping query on DB
		await prisma.$queryRaw`SELECT 1`;
		dbStatus = 'connected';
	} catch (error) {
		dbStatus = 'unreachable';
	}

	res.json({
		status: 'ok',
		environment: env.NODE_ENV,
		database: dbStatus,
		uptime: process.uptime(),
		timestamp: new Date().toISOString(),
	});
});

// Mount API Routes
app.use('/api/v1', apiLimiter, v1Router);

// 404 Handler
app.use((req: Request, res: Response) => {
	res.status(404).json({
		success: false,
		error: {
			code: 'NOT_FOUND',
			message: `Route ${req.method} ${req.originalUrl} not found`,
		},
	});
});

// Global Error Handler
app.use(errorHandler);

export default app;
