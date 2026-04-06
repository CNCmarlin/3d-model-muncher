const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const collections = await prisma.collection.findMany();
    console.log('--- Collections ---');
    console.log(collections.map(c => ({ id: c.id, name: c.name, parentId: c.parentId })));

    const models = await prisma.model.findMany({ select: { id: true, name: true, collectionId: true } });
    console.log('\n--- Missing collectionId Models ---');
    console.log(models.filter(m => !m.collectionId).map(m => m.name));

    console.log('\n--- Models in "Uncategorized" or "Root" ---');
    console.log(models.filter(m => m.collectionId === 'uncategorized' || m.collectionId === 'root').length);
}

run()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
