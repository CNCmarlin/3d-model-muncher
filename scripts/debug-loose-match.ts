
import fs from 'fs';
import path from 'path';

// Target directory
const targetDir = 'W:/3D Files Cabinet/3D Printer/ADXL';

console.log(`🔍 Debugging loose match in: ${targetDir}`);

if (!fs.existsSync(targetDir)) {
    console.error("❌ Directory does not exist!");
    process.exit(1);
}

const entries = fs.readdirSync(targetDir);
console.log(`📂 Found ${entries.length} entries.`);

let munchieFound = false;

for (const entry of entries) {
    console.log(` - "${entry}"`);
    if (entry.endsWith('-munchie.json')) {
        munchieFound = true;
        const baseName = entry.replace('-munchie.json', '');
        console.log(`   🔸 Testing baseName: "${baseName}"`);

        // Simulate logic
        const potentialFiles = [
            baseName + '.stl',
            baseName + '.obj',
            baseName + '.3mf',
            baseName + '.gcode',
            baseName + '.png',
            baseName + '.jpg',
            baseName + '.jpeg',
            baseName + '.webp'
        ];

        let foundCount = 0;
        for (const candidate of potentialFiles) {
            // Check existence in list (case-sensitive as per fs.readdir on Linux/Node usually, 
            // but Windows is permissive... wait, node logic uses fs.existsSync usually)

            // Logic in migrate-munchies.ts:
            // if (fs.existsSync(path.join(dir, candidate))) { ... }

            const candidatePath = path.join(targetDir, candidate);
            const exists = fs.existsSync(candidatePath);
            console.log(`      ❓ Checking: "${candidate}" -> ${exists ? '✅ FOUND' : '❌ MISSING'}`);
            if (exists) foundCount++;
        }
        console.log(`   🏁 Found ${foundCount} associated files.`);
    }
}

if (!munchieFound) {
    console.warn("⚠️ No munchie file found in this folder!");
}
