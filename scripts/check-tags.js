// Quick script to check tags in database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTags() {
    try {
        const tags = await prisma.tag.findMany({
            take: 10,
            orderBy: { name: 'asc' }
        });

        console.log(`Found ${tags.length} tags in database`);
        console.log('Sample tags:', tags.slice(0, 5));

        const totalCount = await prisma.tag.count();
        console.log(`Total tag count: ${totalCount}`);

    } catch (error) {
        console.error('Error querying tags:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkTags();
