/**
 * Backfill Script: primaryModelPath
 * 
 * Populates Model.primaryModelPath from ModelFile[isPrimary=true].filePath
 * for all existing models that don't have it set yet.
 * 
 * Run once after the rename_file_path_to_primary_model_path migration:
 *   node server/scripts/backfill-primary-model-path.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID_3D = /\.(stl|3mf|obj)$/i;

async function backfill() {
    console.log('Starting primaryModelPath backfill...');

    const models = await prisma.model.findMany({
        include: {
            files: {
                where: { isPrimary: true }
            }
        }
    });

    console.log(`Found ${models.length} models to process`);

    let updated = 0;
    let alreadySet = 0;
    let noPrimaryFile = 0;

    for (const m of models) {
        // Find the first isPrimary file with a valid 3D extension
        const primary = m.files.find(f => VALID_3D.test(f.filePath || ''));

        if (!primary) {
            noPrimaryFile++;
            // If primaryModelPath already had a junk value (old .json path), clear it
            if (m.primaryModelPath && !VALID_3D.test(m.primaryModelPath)) {
                await prisma.model.update({
                    where: { id: m.id },
                    data: { primaryModelPath: null }
                });
            }
            continue;
        }

        // Already correct — skip
        if (m.primaryModelPath === primary.filePath) {
            alreadySet++;
            continue;
        }

        await prisma.model.update({
            where: { id: m.id },
            data: { primaryModelPath: primary.filePath }
        });
        updated++;
    }

    console.log(`\n✓ Backfill complete:`);
    console.log(`  Updated:         ${updated}`);
    console.log(`  Already correct: ${alreadySet}`);
    console.log(`  No primary file: ${noPrimaryFile}`);
    console.log(`  Total:           ${models.length}`);
}

backfill()
    .catch(err => {
        console.error('Backfill failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
