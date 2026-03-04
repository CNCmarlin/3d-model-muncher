const prisma = require('./server-utils/db');
const fs = require('fs');

async function main() {
    const model = await prisma.model.findUnique({
        where: {
            id: "tv-4702633-dXBsb2Fk-1"
        }
    });

    if (model) {
        fs.writeFileSync('test-meta.json', JSON.parse(JSON.stringify(model.metadata)));
    } else {
        console.log("Not found");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
