const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkModel() {
    try {
        const model = await prisma.model.findFirst({
            where: { name: { contains: 'rail_100mm_200um_mgn9' } },
            include: { images: true }
        });
        console.log(JSON.stringify(model, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkModel();
