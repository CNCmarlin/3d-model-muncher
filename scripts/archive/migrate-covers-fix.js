const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const p = path.join(process.cwd(), 'data', 'covers');
    if (!fs.existsSync(p)) return console.log('No covers directory');

    const files = fs.readdirSync(p);
    let count = 0;

    for (const file of files) {
        // The files are named simply [collectionId].jpg
        const match = file.match(/^(col_.+)\.jpg$/i); // Case-insensitive just in case

        // Fallback: the files might also be named [id]_cover.jpg depending on when they were made
        const oldMatch = file.match(/^(col_.+)_cover\.jpg$/i);

        let id = null;
        if (match) id = match[1];
        else if (oldMatch) id = oldMatch[1];

        if (id) {
            const res = await prisma.collection.updateMany({
                where: { id },
                data: { coverImagePath: `/data/covers/${file}` }
            });
            if (res.count > 0) count++;
        }
    }

    console.log(`Successfully mapped ${count} generated covers from /data/covers into DB`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
