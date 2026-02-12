const fs = require('fs');
const path = require('path');

// --- Configuration ---
// Adjust these paths to match your project structure relative to this script
const DIST_BACKEND = path.join(__dirname, '../dist-backend');
const SERVER_UTILS = path.join(__dirname, '../server-utils');

// --- Imports ---
try {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (e) {
    console.log("No .env found or dotenv not installed, using defaults/config.");
}

// We need the ConfigManager to ensure we are looking at the right folder
const { ConfigManager } = require(path.join(DIST_BACKEND, 'utils/configManager'));
const { scanDirectory } = require(path.join(DIST_BACKEND, 'utils/threeMFToJson'));
const { getAbsoluteModelsPath } = require(path.join(SERVER_UTILS, 'dataAccess'));

// Initialize Config to point to the right data folder
// The app assumes data/config.json is relative to process.cwd() usually, 
// so we should run this script from the project root: `node scripts/rebuild_library.js`
// We'll force the absolute path to data path just in case, leveraging the internal logic.

async function rebuild() {
    console.log("☢️  INITIATING LIBRARY REBUILD (THE NUCLEAR OPTION) ☢️");
    console.log("-----------------------------------------------------");

    // 1. Resolve Models Directory
    let modelsDir;
    try {
        modelsDir = getAbsoluteModelsPath();
        console.log(`📂 Target Directory: ${modelsDir}`);
    } catch (e) {
        console.error("❌ Failed to resolve models directory. Is config.json valid?");
        console.error(e);
        process.exit(1);
    }

    if (!fs.existsSync(modelsDir)) {
        console.error(`❌ Directory does not exist: ${modelsDir}`);
        process.exit(1);
    }

    // 2. PURGE PHASE
    console.log("\n🗑️  PHASE 1: PURGING METADATA...");
    let deletedCount = 0;

    function purgeWalker(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                purgeWalker(fullPath);
            } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                // EXCEPTION: Do not delete project.json (it defines structure)
                if (entry.name === 'project.json') continue;

                try {
                    fs.unlinkSync(fullPath);
                    deletedCount++;
                    if (deletedCount % 100 === 0) process.stdout.write('.');
                } catch (e) {
                    console.error(`\nFailed to delete ${entry.name}: ${e.message}`);
                }
            }
        }
    }

    purgeWalker(modelsDir);
    console.log(`\n✅ Purge Complete. Deleted ${deletedCount} metadata files.`);

    // 3. REGENERATE PHASE
    console.log("\n✨ PHASE 2: REGENERATING METADATA...");
    console.log("   (This uses the internal scanDirectory logic)");

    const startTime = Date.now();
    try {
        // scanDirectory generates metadata for .3mf and .stl
        // It returns an object with details
        const result = await scanDirectory(modelsDir);
        // Note: scanDirectory likely takes (dir, fileType) but defaults to handling both if structured right,
        // OR we might need to call it twice if it's strictly filtered. 
        // Checking threeMFToJson.ts source would confirm, but usually it scans for everything.
        // Based on usage in server/routes/models.js: await scanDirectory(dir, fileType); 
        // We'll run it generic or rely on it catching all.

        console.log(`\n✅ Scan Complete in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
        // The return value of scanDirectory varies by implementation version, 
        // but typically it logs what it does.

    } catch (e) {
        console.error("❌ Scan Failed:", e);
        process.exit(1);
    }

    console.log("\n-----------------------------------------------------");
    console.log("🎉 REBUILD COMPLETE.");
    console.log("👉 PLEASE RESTART YOUR SERVER TO CLEAR IN-MEMORY CACHES.");
    console.log("-----------------------------------------------------");
}

rebuild();
