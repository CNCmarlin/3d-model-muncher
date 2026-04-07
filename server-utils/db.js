const { PrismaClient } = require('@prisma/client');
const path = require('path');
const { performDbBackup } = require('./dbBackup');

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = global;

const baseDb = globalForPrisma.prisma || new PrismaClient({
    log: ['error', 'warn'], // 'query' can be noisy, enable if needed
});

// Calculate path to the standard DB file
// In production, we MUST parse the custom location from DATABASE_URL if provided
let defaultDbPath = path.join(process.cwd(), 'prisma', 'modellibrary.db');
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:///')) {
    // Ex: "file:///app/data/modellibrary.db" -> "/app/data/modellibrary.db"
    defaultDbPath = process.env.DATABASE_URL.replace('file://', '');
} else if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:/')) {
    // Handle the single slash edge case just in case
    defaultDbPath = process.env.DATABASE_URL.replace('file:', '');
} else if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:../')) {
    // E.g. "file:../data/modellibrary.db" relative to prisma schema
    defaultDbPath = path.join(process.cwd(), 'prisma', process.env.DATABASE_URL.replace('file:', ''));
} else if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:./')) {
    defaultDbPath = path.join(process.cwd(), process.env.DATABASE_URL.replace('file:./', ''));
}

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
