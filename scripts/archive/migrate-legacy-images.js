const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const p = path.join(process.cwd(), 'data', 'images', 'collections');
    if (!fs.existsSync(p)) return console.log('No images directory');

    const folders = fs.readdirSync(p);
    let count = 0;

    for (const folder of folders) {
        const folderPath = path.join(p, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        // Legacy mapping: files inside are typically the cover
        const files = fs.readdirSync(folderPath).filter(f => f.match(/\.(jpg|jpeg|png|webp|gif)$/i));
        if (files.length === 0) continue;

        // Sort to get the most recent or consistently the first one if multiple
        const imgFile = files[0];
        const imagePath = `/data/images/collections/${folder}/${imgFile}`;

        // Update DB explicitly using the folder name which matches the collection ID
        const res = await prisma.collection.updateMany({
            where: { id: folder },
            data: { coverImagePath: imagePath }
        });

        if (res.count > 0) count += res.count;
    }

    console.log(`Successfully mapped ${count} legacy images to Prisma coverImagePath column.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
