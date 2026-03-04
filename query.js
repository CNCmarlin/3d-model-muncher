const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const ids = ['tv-4702633', 'tv-4702633-1', 'tv-4702633-2', 'tv-4702633-3', 'tv-4702633-4'];
    const models = await prisma.model.findMany({
        where: { id: { in: ids } },
        include: {
            images: true,
            relatedFiles: true,
            files: true
        }
    });

    const output = JSON.stringify(models, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2);
    fs.writeFileSync('out.json', output, 'utf8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
