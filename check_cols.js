const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const allCols = await prisma.collection.findMany();
    const importedCols = allCols.filter(c => c.name.toLowerCase() === 'imported');
    console.log("DB COLLECTIONS NAMED IMPORTED:");
    console.log(importedCols);
}

main().catch(console.error).finally(() => prisma.$disconnect());
