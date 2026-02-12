const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkImages() {
    try {
        const count = await prisma.model.count();
        const withImage = await prisma.model.count({
            where: { coverImagePath: { not: null } }
        });

        console.log(`Total Models: ${count}`);
        console.log(`Models with Cover Image: ${withImage}`);

        const sample = await prisma.model.findFirst({
            where: { coverImagePath: { not: null } }
        });

        if (sample) {
            console.log('Sample with image:', {
                id: sample.id,
                name: sample.name,
                coverImagePath: sample.coverImagePath
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkImages();
