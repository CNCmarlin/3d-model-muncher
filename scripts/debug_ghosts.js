const fs = require('fs');
const path = require('path');

const MODELS_ROOT = path.join(process.cwd(), 'models');
console.log('--- GHOST MODEL CHECK ---');

function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scan(fullPath);
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
            try {
                // Determine Expected Source File
                let sourceFile;
                if (entry.name.endsWith('-stl-munchie.json')) {
                    sourceFile = fullPath.replace('-stl-munchie.json', '.stl');
                    if (!fs.existsSync(sourceFile)) sourceFile = fullPath.replace('-stl-munchie.json', '.STL');
                } else {
                    sourceFile = fullPath.replace('-munchie.json', '.3mf');
                }

                if (!fs.existsSync(sourceFile)) {
                    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    console.log(`❌ GHOST FOUND: ${data.name || entry.name}`);
                    console.log(`   ID: ${data.id}`);
                    console.log(`   Json: ${entry.name}`);
                    console.log(`   Expected Source: ${path.basename(sourceFile)} (MISSING)`);
                    console.log(`   Path: ${fullPath}`);
                }
            } catch (e) {
                console.error('Error checking:', fullPath, e.message);
            }
        }
    }
}

if (fs.existsSync(MODELS_ROOT)) {
    console.log('Scanning for ghost models (Metadata exists, but 3D file missing)...');
    scan(MODELS_ROOT);
} else {
    console.error('Models root not found');
}
console.log('--- SCAN COMPLETE ---');
