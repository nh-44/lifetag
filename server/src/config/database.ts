import { PrismaClient } from '@prisma/client';

// Singleton instance of PrismaClient
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
	globalForPrisma.prisma ||
	new PrismaClient({
		log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
	});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Connect to PostgreSQL database using Prisma Client
 */
export const connectDatabase = async (): Promise<boolean> => {
	try {
		await prisma.$connect();
		console.log('✅ Connected to PostgreSQL database successfully via Prisma');
		return true;
	} catch (error) {
		console.error('⚠️ Could not connect to PostgreSQL database:', (error as Error).message);
		console.warn('Please ensure your DATABASE_URL in server/.env points to an active PostgreSQL instance.');
		return false;
	}
};

/**
 * Disconnect from PostgreSQL database
 */
export const disconnectDatabase = async (): Promise<void> => {
	await prisma.$disconnect();
	console.log('🔌 Disconnected from PostgreSQL database');
};
