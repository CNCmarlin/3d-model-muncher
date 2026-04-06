const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanUpLooseModels() {
    console.log("Cleaning up loose models...");

    // Update models
    const result = await prisma.model.updateMany({
        where: {
            OR: [
                { collectionId: 'uncategorized' },
                { collectionId: 'root' }
            ]
        },
        data: {
            collectionId: null
        }
    });
    console.log(`Updated ${result.count} models to have null collectionId.`);

    // Delete 'uncategorized' or 'root' collections if they exist and are empty
    for (const id of ['uncategorized', 'root']) {
        try {
            const count = await prisma.model.count({ where: { collectionId: id } });
            if (count === 0) {
                await prisma.collection.delete({ where: { id } });
                console.log(`Deleted empty collection '${id}'.`);
            } else {
                console.log(`Collection '${id}' still has ${count} models, skipping delete.`);
            }
        } catch (e) {
            if (e.code === 'P2025') {
                // Record to delete does not exist, which is fine
            } else {
                console.error(`Error deleting collection ${id}:`, e.message);
            }
        }
    }
}

cleanUpLooseModels()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
