const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const p = path.join(process.cwd(), 'data', 'covers');
    if (!fs.existsSync(p)) return console.log('No covers directory');

    const files = fs.readdirSync(p);
    let count = 0;

    for (const file of files) {
        const match = file.match(/^(.+)_cover\.jpg$/);
        if (match) {
            const id = match[1];
            await prisma.collection.updateMany({
                where: { id },
                data: { coverImagePath: `/data/covers/${file}` }
            });
            count++;
        }
    }

    console.log(`Migrated ${count} existing generated covers from /data/covers into DB`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
