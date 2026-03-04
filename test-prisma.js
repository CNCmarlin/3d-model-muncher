const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
    const cols = await prisma.collection.findMany({ include: { models: true } });
    for (const col of cols) {
        if (col.models.length >= 4) {
            console.log(col.name + ' has ' + col.models.length + ' models');
            for (const m of col.models.slice(0, 4)) {
                console.log(' - ' + m.id + ' coverImagePath: ' + m.coverImagePath);
            }
        }
    }
}
test().catch(console.error).finally(() => prisma.$disconnect());
