const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
    const cols = await prisma.collection.findMany({ select: { id: true, name: true, pathHash: true } });
    console.log(cols.slice(0, 10));
}
check().catch(console.error).finally(() => prisma.$disconnect());
