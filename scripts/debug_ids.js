const fs = require('fs');
const path = require('path');

const COLLECTIONS_PATH = path.join(process.cwd(), 'data', 'collections.json');
const MODELS_ROOT = path.join(process.cwd(), 'models');

console.log('--- ID PARITY CHECK ---');

if (!fs.existsSync(COLLECTIONS_PATH)) {
    console.error('Collections file not found:', COLLECTIONS_PATH);
    process.exit(1);
}

const collections = JSON.parse(fs.readFileSync(COLLECTIONS_PATH, 'utf8'));
const modelIdsOnDisk = new Set();
const modelIdToPath = new Map();

function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scan(fullPath);
        } else if (entry.name.endsWith('-munchie.json')) {
            try {
                const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                if (data.id) {
                    modelIdsOnDisk.add(data.id);
                    modelIdToPath.set(data.id, fullPath);
                }
            } catch (e) {
                console.error('Failed to parse:', fullPath);
            }
        }
    }
}

if (fs.existsSync(MODELS_ROOT)) {
    console.log('Scanning models directory...');
    scan(MODELS_ROOT);
    console.log(`Found ${modelIdsOnDisk.size} unique models on disk.`);
} else {
    console.error('Models root not found:', MODELS_ROOT);
}

console.log('\nChecking Collections:');
let totalMissing = 0;
for (const col of collections) {
    if (col.modelIds && col.modelIds.length > 0) {
        const missing = col.modelIds.filter(id => !modelIdsOnDisk.has(id));
        if (missing.length > 0) {
            console.log(`❌ Collection "${col.name}" has ${missing.length} missing IDs:`);
            missing.forEach(id => console.log(`   - ${id}`));
            totalMissing += missing.length;
        } else {
            console.log(`✅ Collection "${col.name}" OK (${col.modelIds.length} models)`);
        }
    }
}

console.log(`\nTotal Missing References: ${totalMissing}`);
