
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: `file:${dbPath}`,
        },
    },
});

async function main() {
    console.log("🔍 Checking SocketStrip records for paths...");

    const models = await prisma.model.findMany({
        where: { name: { contains: 'Socket' } },
        include: { files: true }
    });

    const output = models.map(m => ({
        name: m.name,
        files: m.files.map(f => f.filePath)
    }));

    const fs = require('fs');
    fs.writeFileSync(path.join(process.cwd(), 'data', 'socket_paths.json'), JSON.stringify(output, null, 2));
    console.log("✅ Wrote to data/socket_paths.json");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
