const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const cols = await prisma.collection.findMany();
    let count = 0;
    for (const c of cols) {
        let img = null;
        try {
            const meta = JSON.parse(c.metadata || '{}');
            if (meta.images && meta.images.length > 0) img = meta.images[0];
        } catch (e) { }

        if (img && !c.coverImagePath) {
            await prisma.collection.update({
                where: { id: c.id },
                data: { coverImagePath: img }
            });
            count++;
        }
    }
    console.log('Migrated', count, 'collection covers.');
}
run().finally(() => prisma.$disconnect());
