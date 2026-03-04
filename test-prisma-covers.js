const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
    const colls = await prisma.collection.findMany({ select: { name: true, coverImagePath: true } });
    console.log(colls.filter(c => c.coverImagePath));
}
check().catch(console.error).finally(() => prisma.$disconnect());
