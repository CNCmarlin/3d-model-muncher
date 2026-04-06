const LegacySourceScanner = require('../server-utils/LegacySourceScanner');
const path = require('path');
const fs = require('fs');
try { require('dotenv').config(); } catch (e) { }

// Helper to get Models Path (same as server.js)
function getModelsDirectory() {
    if (process.env.MODELS_PATH) {
        console.log(`[Debug] Using env.MODELS_PATH: ${process.env.MODELS_PATH}`);
        return process.env.MODELS_PATH;
    }
    return './models';
}

async function debugThumbnails() {
    console.log('--- Debugging Thumbnail Collection ---');

    let modelsDir = getModelsDirectory();
    if (!path.isAbsolute(modelsDir)) {
        modelsDir = path.join(process.cwd(), modelsDir);
    }

    console.log(`Scanning Models Directory: ${modelsDir}`);

    if (!fs.existsSync(modelsDir)) {
        console.error('Models directory does not exist!');
        return;
    }

    const scanner = new LegacySourceScanner(modelsDir);
    const entities = await scanner.scan();

    console.log(`Scanned ${entities.length} entities.`);

    let withExtraImages = 0;
    let examples = [];

    for (const entity of entities) {
        // Check if images array is populated in metadata
        const images = entity.mapped.metadata.images || [];

        if (images.length > 0) {
            withExtraImages++;
            if (examples.length < 5) {
                examples.push({
                    name: entity.name,
                    images: images
                });
            }
        }
    }

    console.log(`\nResults:`);
    console.log(`Models with available images: ${withExtraImages}`);

    if (examples.length > 0) {
        console.log(`\nExamples:`);
        examples.forEach(ex => {
            console.log(`\n- Model: ${ex.name}`);
            console.log(`  Available Images: ${ex.images.join(', ')}`);
        });
    }
}

debugThumbnails();
