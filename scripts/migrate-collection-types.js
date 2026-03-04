const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Helper to get models path from config
function getModelsDir() {
    try {
        const configPath = path.join(__dirname, '../data/config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        let modelsDir = config.settings?.modelDirectory;
        if (!modelsDir) return null;

        if (!path.isAbsolute(modelsDir)) {
            const rootDrive = process.platform === 'win32' ? process.cwd().split(path.sep)[0] + path.sep : '/';
            // Simple fallback logic similar to backend
            const tryPath = path.join('W:', modelsDir);
            if (fs.existsSync(tryPath)) return tryPath;
            return path.join(process.cwd(), modelsDir);
        }
        return modelsDir;
    } catch (e) {
        console.error("Could not load config:", e);
        return null;
    }
}

async function runMigration() {
    console.log('Starting Phase 2 Migration (Pure DB Arch Transition)...');

    const modelsDir = getModelsDir();
    if (!modelsDir || !fs.existsSync(modelsDir)) {
        console.warn("\n⚠️ WARNING: Could not find physical Model Directory. Falling back to DB-only `isComponent` heuristics.");
    } else {
        console.log(`📁 Using base model directory: ${modelsDir}`);
    }

    try {
        const collections = await prisma.collection.findMany({
            include: { models: true } // Fetching models to update them
        });
        let projectCount = 0;

        for (const col of collections) {
            let isProject = false;

            // 1. Try physical project.json if we have pathHash
            if (modelsDir && col.pathHash && col.pathHash.startsWith('col_')) {
                try {
                    // Try decoding base64
                    let base64str = col.pathHash.replace('col_', '').replace(/-/g, '+').replace(/_/g, '/');
                    // Add padding
                    while (base64str.length % 4 !== 0) base64str += '=';

                    const relPath = Buffer.from(base64str, 'base64').toString('utf8');
                    const fullPath = path.join(modelsDir, relPath);

                    if (fs.existsSync(path.join(fullPath, 'project.json'))) {
                        isProject = true;
                    }
                } catch (e) {
                    console.warn(`Could not decode path for collection ${col.name}`);
                }
            }

            // 2. Fallback heuristic: does this collection contain any models with isComponent = true?
            if (!isProject) {
                if (col.models.some(m => m.isComponent === true)) {
                    isProject = true;
                }
            }

            // --- Update the Collection ---
            await prisma.collection.update({
                where: { id: col.id },
                data: {
                    isModelFolder: isProject,
                    type: col.type || 'Auto-Imported'
                }
            });

            // --- Update the Models in this Project ---
            if (isProject && col.models.length > 0) {
                projectCount++;

                // Identify the main model vs components
                // If it already has `isComponent`, we assume the one that is NOT a component is the main model.
                let mainModel = col.models.find(m => m.isComponent === false);

                if (!mainModel) {
                    // If everything is somehow a component, pick the first one as a fallback
                    mainModel = col.models[0];
                }

                for (const m of col.models) {
                    const isMain = m.id === mainModel.id;
                    await prisma.model.update({
                        where: { id: m.id },
                        data: {
                            isMainModel: isMain,
                            isComponent: !isMain
                        }
                    });
                }
            }
        }

        console.log(`\n✅ Migration Complete!`);
        console.log(` - Translated ${projectCount} Folders into native DB ModelFolders.`);
        console.log(` - Assigned isMainModel and isComponent securely.`);
        console.log(` - Ready to drop project.json reliance!`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

runMigration();
