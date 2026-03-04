const prisma = require('./server-utils/db');
async function test() {
    console.log("Mocking updateMany...");
    await prisma.tag.updateMany({
        where: { id: -999 },
        data: { name: 'dummy' }
    });
    console.log("Done.");
}
test().catch(console.error).finally(() => prisma.$disconnect());
