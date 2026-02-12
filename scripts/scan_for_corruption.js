const fs = require('fs');
const path = require('path');

const MODELS_DIR = 'W:/3D Files Cabinet - Copy';

console.log(`🚀 Starting Corruption Scan on: ${MODELS_DIR}`);

let issueCount = 0;
let checkedCount = 0;
let filePathMap = new Map(); // path -> list of model names using it

function scanDir(dir) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        console.error(`Error reading ${dir}: ${e.message}`);
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== 'node_modules') {
                scanDir(fullPath);
            }
        } else if (entry.name.endsWith('-munchie.json')) {
            checkedCount++;
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const json = JSON.parse(content);

                // Check 1: File Path Mismatch
                // The expected file path should usually contain the model name (from the json filename)
                // e.g. "MyModel-munchie.json" -> Expect "MyModel.stl" or similar
                const jsonBasename = entry.name.replace(/-munchie\.json$/, '').replace(/-stl$/, '').replace(/-obj$/, '');
                const filePath = json.filePath || "";
                const filePathBasename = path.basename(filePath, path.extname(filePath));

                // Loose check: Does the filePath contain the model name?
                // Or does the model name contain the filePath?
                // This is heuristic, but safe for flagging potential issues.

                // Corruption Signature from User: "Lagarto" points to "Slug"
                // So if the names are totally different (Levenshtein distance high? or just !includes)

                let isSuspicious = false;
                if (!filePath) {
                    // console.log(`[WARN] Empty filePath: ${entry.name}`);
                } else {
                    const cleanJsonName = jsonBasename.toLowerCase().replace(/_/g, '').replace(/-/g, '');
                    const cleanPathName = filePathBasename.toLowerCase().replace(/_/g, '').replace(/-/g, '');

                    if (!cleanJsonName.includes(cleanPathName) && !cleanPathName.includes(cleanJsonName)) {
                        console.log(`🚩 [MISMATCH] ${entry.name} -> Points to: ${filePath}`);
                        isSuspicious = true;
                        issueCount++;
                    }

                    // Check 2: Duplication
                    if (!filePathMap.has(filePath)) {
                        filePathMap.set(filePath, []);
                    }
                    filePathMap.get(filePath).push(fullPath);
                }
            } catch (e) {
                console.error(`Failed to parse ${entry.name}`);
            }
        }
    }
}

scanDir(MODELS_DIR);

console.log(`\nChecking for Duplicates...`);
filePathMap.forEach((paths, filePath) => {
    if (paths.length > 1) {
        console.log(`🔥 [DUPLICATE] filePath "${filePath}" is claimed by ${paths.length} models:`);
        paths.forEach(p => console.log(`    - ${p}`));
        issueCount++;
    }
});

console.log(`\nScan Complete.`);
console.log(`Checked: ${checkedCount} files.`);
console.log(`Issues Found: ${issueCount}`);
