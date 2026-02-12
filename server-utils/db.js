const { PrismaClient } = require('@prisma/client');

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = global;

const db = globalForPrisma.prisma || new PrismaClient({
    log: ['error', 'warn'], // 'query' can be noisy, enable if needed
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

module.exports = db;
