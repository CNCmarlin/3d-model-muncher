const prisma = require('./server-utils/db');
const MigrationEngine = require('./server-utils/MigrationEngine');

async function testWipe() {
    try {
        console.log("Wiping...");
        await prisma.$transaction([
            prisma.modelFile.deleteMany(),
            prisma.modelTag.deleteMany(),
            prisma.modelCollection.deleteMany(),
            prisma.model.deleteMany(),
            prisma.collection.deleteMany(),
            prisma.tag.deleteMany(),
        ]);
        console.log("Wipe successful. Running Migration...");

        const m = new MigrationEngine();
        await m.run(false);
        console.log("Migration successful.");

    } catch (e) {
        console.error("Wipe/Migration failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

testWipe();
