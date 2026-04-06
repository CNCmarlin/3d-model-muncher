const { PrismaClient } = require('@prisma/client');
const path = require('path');
const { performDbBackup } = require('./dbBackup');

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = global;

const baseDb = globalForPrisma.prisma || new PrismaClient({
    log: ['error', 'warn'], // 'query' can be noisy, enable if needed
});

// Calculate path to standard modellibrary.db defined in .env
// We do this relative to the process working dir since sqlite is generated in prisma/
const defaultDbPath = path.join(process.cwd(), 'prisma', 'modellibrary.db');

// Inject our Auto-Backup Middleware
const db = baseDb.$extends({
    query: {
        $allModels: {
            async $allOperations({ operation, model, args, query }) {
                // Trigger auto-backup before destructive structural changes
                if (operation === 'deleteMany' || operation === 'updateMany') {
                    performDbBackup(defaultDbPath, `${operation} on ${model}`);
                }
                return query(args);
            },
        },
    },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = baseDb;

module.exports = db;
