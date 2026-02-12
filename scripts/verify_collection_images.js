const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCollectionImages() {
    try {
        const count = await prisma.collection.count();
        const withImage = await prisma.collection.count({
            where: { coverImagePath: { not: null } }
        });

        console.log(`Total Collections: ${count}`);
        console.log(`Collections with Cover Image: ${withImage}`);

        const sample = await prisma.collection.findFirst({
            where: { coverImagePath: { not: null } }
        });

        if (sample) {
            console.log('Sample with image:', {
                id: sample.id,
                name: sample.name,
                coverImagePath: sample.coverImagePath
            });
        } else {
            const without = await prisma.collection.findFirst();
            console.log('Sample without image:', {
                id: without?.id,
                name: without?.name,
                coverImagePath: without?.coverImagePath
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkCollectionImages();
