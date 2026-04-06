const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            walk(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const srcDir = path.join(__dirname, 'src');
const dbFiles = walk(srcDir).filter(f => f.endsWith('_DB.tsx') || f.endsWith('_db.ts') || f.endsWith('_DB.ts') || f.endsWith('_db.tsx'));

let changedCount = 0;

for (const file of dbFiles) {
    let content = fs.readFileSync(file, 'utf8');

    // Get the base name without _DB.tsx or _db.ts
    const fileName = path.basename(file);
    const suffix = fileName.includes('_DB') ? '_DB' : '_db';
    const baseNameMatch = fileName.match(/^(.+?)(_DB|_db)\.(tsx|ts)$/i);

    if (!baseNameMatch) continue;

    const baseName = baseNameMatch[1];
    const targetName = `${baseName}${suffix}`;

    let modified = false;

    // Fix exports
    const exportRegex = new RegExp(`export\\s+(function|const|class)\\s+${baseName}\\b`, 'g');
    if (exportRegex.test(content)) {
        content = content.replace(exportRegex, `export $1 ${targetName}`);
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Fixed export in ${file}`);
        changedCount++;
    }
}

console.log(`\nFixed exports in ${changedCount} files.`);
