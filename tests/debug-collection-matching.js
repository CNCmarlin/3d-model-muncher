const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const p = path.join(process.cwd(), 'data', 'images', 'collections');
    const folders = fs.existsSync(p) ? fs.readdirSync(p) : [];

    const cols = await prisma.collection.findMany({ select: { id: true, name: true, pathHash: true } });

    console.log('Total Disk Folders (in data/images/collections):', folders.length);
    console.log('Total Prisma Collections:', cols.length);
    console.log('Sample Disk Folders:', folders.slice(0, 5));
    console.log('Sample Prisma IDs:', cols.slice(0, 5).map(c => c.id));

    const matched = folders.filter(f => cols.some(c => c.id === f));
    console.log('Direct ID matches:', matched.length);

    const hashMatched = folders.filter(f => cols.some(c => c.pathHash === f));
    console.log('PathHash matches:', hashMatched.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
