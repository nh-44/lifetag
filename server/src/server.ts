import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';

const PORT = parseInt(env.PORT, 10) || 5000;

async function startServer() {
	console.log('🚀 Starting LifeTag Express Server...');

	// Attempt database connection
	await connectDatabase();

	const server = app.listen(PORT, () => {
		console.log(`🌐 Server is running in [${env.NODE_ENV}] mode on http://localhost:${PORT}`);
		console.log(`🏥 Health check endpoint available at http://localhost:${PORT}/api/v1/health`);
	});

	// Graceful shutdown handling
	const shutdown = async (signal: string) => {
		console.log(`\n⚠️ Received ${signal}. Shutting down gracefully...`);
		server.close(async () => {
			console.log('🛑 HTTP server closed.');
			await disconnectDatabase();
			process.exit(0);
		});
	};

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
	console.error('💥 Fatal error starting server:', error);
	process.exit(1);
});
