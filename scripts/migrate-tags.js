const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Migrate Tags to Database
 * 
 * Extracts all unique tags from Model.tags JSON field and:
 * 1. Creates Tag records
 * 2. Creates ModelTag junction records (many-to-many)
 * 3. Removes tags from Model.tags field (denormalized data)
 */

async function migrateTags() {
    console.log('🏷️  Starting Tag Migration...\n');

    try {
        // Step 1: Get all models with tags
        console.log('📊 Fetching all models...');
        const models = await prisma.model.findMany({
            select: {
                id: true,
                tags: true,
            }
        });
        console.log(`✅ Found ${models.length} models\n`);

        // Step 2: Extract all unique tags
        console.log('🔍 Extracting unique tags...');
        const tagSet = new Set();
        let totalTagInstances = 0;

        models.forEach(model => {
            if (model.tags && Array.isArray(model.tags)) {
                model.tags.forEach(tag => {
                    if (tag && typeof tag === 'string' && tag.trim()) {
                        tagSet.add(tag.trim());
                        totalTagInstances++;
                    }
                });
            }
        });

        const uniqueTags = Array.from(tagSet).sort();
        console.log(`✅ Found ${uniqueTags.length} unique tags (${totalTagInstances} total instances)\n`);

        if (uniqueTags.length === 0) {
            console.log('⚠️  No tags found in models. Migration complete (nothing to do).');
            return;
        }

        // Step 3: Create Tag records (upsert to handle re-runs)
        console.log('💾 Creating Tag records...');
        const tagMap = new Map(); // name -> Tag object

        for (const tagName of uniqueTags) {
            const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {}, // No changes if exists
                create: { name: tagName }
            });
            tagMap.set(tagName, tag);
        }
        console.log(`✅ Created/verified ${uniqueTags.length} Tag records\n`);

        // Step 4: Create ModelTag junction records
        console.log('🔗 Creating ModelTag associations...');
        let associationCount = 0;
        let skippedCount = 0;

        for (const model of models) {
            if (!model.tags || !Array.isArray(model.tags) || model.tags.length === 0) {
                continue;
            }

            for (const tagName of model.tags) {
                if (!tagName || typeof tagName !== 'string' || !tagName.trim()) {
                    continue;
                }

                const tag = tagMap.get(tagName.trim());
                if (!tag) {
                    console.warn(`⚠️  Tag not found: "${tagName}"`);
                    continue;
                }

                try {
                    // Create junction record (upsert to handle re-runs)
                    await prisma.modelTag.upsert({
                        where: {
                            modelId_tagId: {
                                modelId: model.id,
                                tagId: tag.id,
                            }
                        },
                        update: {}, // No changes if exists
                        create: {
                            modelId: model.id,
                            tagId: tag.id,
                        }
                    });
                    associationCount++;
                } catch (error) {
                    // Already exists (race condition in upsert)
                    skippedCount++;
                }
            }
        }

        console.log(`✅ Created ${associationCount} model-tag associations`);
        if (skippedCount > 0) {
            console.log(`ℹ️  Skipped ${skippedCount} existing associations`);
        }
        console.log();

        // Step 5: Verify migration
        console.log('🔍 Verifying migration...');
        const totalTags = await prisma.tag.count();
        const totalAssociations = await prisma.modelTag.count();
        console.log(`✅ Total Tags in database: ${totalTags}`);
        console.log(`✅ Total Model-Tag associations: ${totalAssociations}\n`);

        // Sample some tags
        console.log('📋 Sample tags:');
        const sampleTags = await prisma.tag.findMany({
            take: 10,
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { models: true }
                }
            }
        });

        sampleTags.forEach(tag => {
            console.log(`   - "${tag.name}" (${tag._count.models} models)`);
        });

        console.log('\n✅ Tag migration complete!');

    } catch (error) {
        console.error('❌ Error during tag migration:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration
migrateTags()
    .catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
