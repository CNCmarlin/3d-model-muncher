const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting DB-First Related Files Sync...");
    const models = await prisma.model.findMany({
        include: { relatedFiles: true }
    });

    let fixedCount = 0;

    for (const model of models) {
        let meta = {};
        try {
            meta = typeof model.metadata === 'string' ? JSON.parse(model.metadata) : (model.metadata || {});
        } catch (e) { continue; }

        if (Array.isArray(meta.related_files) && meta.related_files.length > 0) {
            const existingPaths = new Set(model.relatedFiles.map(r => r.path));

            for (const path of meta.related_files) {
                if (typeof path === 'string' && !existingPaths.has(path)) {
                    console.log(`Adding missing related file record for model ${model.id}: ${path}`);
                    await prisma.modelRelatedFile.create({
                        data: {
                            modelId: model.id,
                            path: path
                        }
                    });
                    existingPaths.add(path);
                    fixedCount++;
                }
            }
        }
    }

    console.log(`Finished. Added ${fixedCount} missing related file records.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
