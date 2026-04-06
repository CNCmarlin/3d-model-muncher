const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkHiddenStatus() {
    const models = await prisma.model.findMany({
        where: {
            name: {
                in: ['Lagarto_v4s', 'Articulated_Slug', 'Flexi_ocktopus-2', 'seaturtleflexi']
            }
        },
        select: {
            name: true,
            isHidden: true,
            collectionId: true
        }
    });

    console.log("Root Models Migration Status:");
    console.table(models);
    await prisma.$disconnect();
}

checkHiddenStatus();
