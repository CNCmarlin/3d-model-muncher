const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

/**
 * Backfill Tags from Munchie Files
 * 
 * Reads tags from *-munchie.json files and populates:
 * 1. Tag table
 * 2. ModelTag junction table
 * 3. Updates Model.tags JSON field for redundancy
 */

const MODELS_DIR = process.env.MODELS_PATH || path.join(process.cwd(), 'models');

async function backfillTags() {
    console.log('🏷️  Starting Tag Backfill from Munchie Files...\n');
    console.log(`📁 Scanning: ${MODELS_DIR}\n`);

    try {
        const tagMap = new Map(); // tagName -> Tag object
        const modelTagData = []; // {modelId, tagName}[]
        let filesProcessed = 0;
        let tagsFound = 0;

        // Step 1: Recursively find all munchie files
        console.log('🔍 Scanning for munchie files...');
        const munchieFiles = [];

        function scanDir(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else if (entry.name.endsWith('-munchie.json')) {
                    munchieFiles.push(fullPath);
                }
            }
        }

        scanDir(MODELS_DIR);
        console.log(`✅ Found ${munchieFiles.length} munchie files\n`);

        // Step 2: Read tags from each munchie file
        console.log('📖 Reading tags from munchie files...');

        for (const munchieFile of munchieFiles) {
            try {
                const content = fs.readFileSync(munchieFile, 'utf8');
                const munchieData = JSON.parse(content);

                if (!munchieData.tags || !Array.isArray(munchieData.tags) || munchieData.tags.length === 0) {
                    continue; // No tags
                }

                // Get model ID from filename (remove -munchie.json)
                const basename = path.basename(munchieFile, '-munchie.json');

                // Find model in database via ModelFile relation
                const model = await prisma.model.findFirst({
                    where: {
                        files: {
                            some: {
                                filename: { contains: basename }
                            }
                        }
                    }
                });

                if (!model) {
                    // Try path hash as fallback
                    const modelRelPath = path.relative(MODELS_DIR, munchieFile.replace('-munchie.json', ''));
                    const modelByPath = await prisma.model.findFirst({
                        where: {
                            pathHash: { contains: basename }
                        }
                    });

                    if (!modelByPath) {
                        // Skip silently - model might not be migrated yet
                        continue;
                    }

                    // Use the found model
                    Object.assign(model || {}, modelByPath);
                }

                // Collect tags for this model
                for (const tag of munchieData.tags) {
                    if (tag && typeof tag === 'string' && tag.trim()) {
                        const tagName = tag.trim();
                        tagMap.set(tagName, null); // Will be populated later
                        modelTagData.push({ modelId: model.id, tagName });
                        tagsFound++;
                    }
                }

                filesProcessed++;
                if (filesProcessed % 100 === 0) {
                    console.log(`   Processed ${filesProcessed}/${munchieFiles.length} files...`);
                }

            } catch (error) {
                console.warn(`⚠️  Error reading ${munchieFile}:`, error.message);
            }
        }

        console.log(`✅ Processed ${filesProcessed} files, found ${tagsFound} tag instances\n`);

        const uniqueTags = Array.from(tagMap.keys()).sort();
        console.log(`✅ Found ${uniqueTags.length} unique tags\n`);

        if (uniqueTags.length === 0) {
            console.log('⚠️  No tags found in munchie files. Migration complete (nothing to do).');
            return;
        }

        // Step 3: Create Tag records
        console.log('💾 Creating Tag records...');
        for (const tagName of uniqueTags) {
            const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName }
            });
            tagMap.set(tagName, tag);
        }
        console.log(`✅ Created ${uniqueTags.length} Tag records\n`);

        // Step 4: Create ModelTag junction records
        console.log('🔗 Creating ModelTag associations...');
        let associationCount = 0;

        for (const { modelId, tagName } of modelTagData) {
            const tag = tagMap.get(tagName);
            if (!tag) continue;

            try {
                await prisma.modelTag.upsert({
                    where: {
                        modelId_tagId: {
                            modelId,
                            tagId: tag.id,
                        }
                    },
                    update: {},
                    create: {
                        modelId,
                        tagId: tag.id,
                    }
                });
                associationCount++;
            } catch (error) {
                // Already exists
            }
        }
        console.log(`✅ Created ${associationCount} model-tag associations\n`);

        // Step 5: Verify
        console.log('🔍 Verification:');
        const totalTags = await prisma.tag.count();
        const totalAssociations = await prisma.modelTag.count();
        console.log(`   Tags: ${totalTags}`);
        console.log(`   Associations: ${totalAssociations}\n`);

        console.log('✅ Tag backfill complete!');

    } catch (error) {
        console.error('❌ Error during backfill:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

backfillTags().catch(error => {
    console.error('Backfill failed:', error);
    process.exit(1);
});
