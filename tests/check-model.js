const prisma = require('./server-utils/db');
const fs = require('fs');

async function main() {
    const models = await prisma.model.findMany({
        where: {
            name: { contains: 'Sonos' }
        },
        select: {
            id: true,
            name: true,
            modelUrl: true,
            isMainModel: true,
            isComponent: true,
            thumbnailPath: true,
            images: true
        }
    });

    fs.writeFileSync('test-sonos.json', JSON.stringify(models, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
