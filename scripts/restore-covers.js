const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function restoreCovers() {
    const coverDir = path.join(__dirname, '../data/covers');
    if (!fs.existsSync(coverDir)) {
        console.log('No covers directory found.');
        return;
    }

    const files = fs.readdirSync(coverDir);
    let restored = 0;

    for (const file of files) {
        if (file.endsWith('_cover.jpg')) {
            // Decode URL encoding in case the ID in the filename was encoded
            const id = decodeURIComponent(file.replace('_cover.jpg', ''));
            try {
                await prisma.collection.update({
                    where: { id },
                    data: { coverImagePath: `/data/covers/${file}` }
                });
                restored++;
                console.log(`Restored cover for: ${id}`);
            } catch (e) {
                // Collection might have been deleted or id mismatch.
                // Ignore silent failures if record doesn't exist
            }
        }
    }

    console.log(`Successfully restored ${restored} collection covers!`);
}

restoreCovers()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
