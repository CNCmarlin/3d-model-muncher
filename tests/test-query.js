const prisma = require('./server-utils/db');

async function main() {
    let queryArgs = {
        where: {
            modelUrl: { not: null },
            OR: [
                { modelUrl: { endsWith: '.stl' } },
                { modelUrl: { endsWith: '.STL' } },
                { modelUrl: { endsWith: '.3mf' } },
                { modelUrl: { endsWith: '.3MF' } }
            ]
        }
    };

    const modelIds = ['tv-4702633-M0QgUHJp-1'];

    if (modelIds && modelIds.length > 0) {
        queryArgs.where.id = { in: modelIds };
    }

    const models = await prisma.model.findMany(queryArgs);
    console.log("Models found:", models.length);
    console.log(models);
}

main().catch(console.error).finally(() => prisma.$disconnect());
