const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const models = await prisma.model.findMany({
        where: {
            id: { startsWith: 'tv-4702633' }
        },
        include: {
            collections: true,
            images: true,
            tags: true,
            files: true
        }
    });

    const replacer = (key, value) => typeof value === 'bigint' ? value.toString() : value;
    console.log(JSON.stringify(models, replacer, 2));

    // Also check if the instruction file exists
    const fs = require('fs');
    const path = require('path');
    console.log("-------------------");
    console.log("Files generated in output directory:");
    if (models[0] && models[0].modelUrl) {
        const dir = path.dirname(path.join(process.cwd(), models[0].modelUrl));
        try {
            console.log("Looking in:", dir);
            console.log(fs.readdirSync(dir));
        } catch (e) { console.log(e); }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
