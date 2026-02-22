const fs = require('fs');
const path = require('path');

const dirsToProcess = [
    'src/components/admin',
    'src/components/bulk-edit',
    'src/components/collections',
    'src/components/common',
    'src/components/dialogs',
    'src/components/layout',
    'src/components/management',
    'src/components/modals',
    'src/components/models',
    'src/components/onboarding',
    'src/components/settings',
    'src/components/shared',
    'src/components/views',
    'src/hooks',
    'src/pages',
    'src/utils'
];

const dirsFull = dirsToProcess.map(d => path.join(__dirname, '..', '..', d));

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, fileList);
        } else {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

let allFiles = [];
for (const d of dirsFull) {
    if (fs.existsSync(d)) {
        allFiles = allFiles.concat(getAllFiles(d));
    }
}

const dbFiles = allFiles.filter(f => f.endsWith('_DB.tsx'));

// Re-copy from base file to overwrite botched copies
dbFiles.forEach(dest => {
    const src = dest.replace('_DB.tsx', '.tsx');
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('Restored untracked ' + dest);
    }
});

// Step 2: Apply safe regexes to ALL dbFiles
dbFiles.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    let orig = content;

    // Components (skip ui)
    content = content.replace(/(@\/components\/(?!ui\/)[a-zA-Z0-9\-\/]+)(['"])/g, (match, p1, p2) => {
        if (p1.endsWith('_DB')) return match;
        return `${p1}_DB${p2}`;
    });

    // Local JS/TS imports
    content = content.replace(/(from\s+['"]\.\.?\/[a-zA-Z0-9\-\/]+)(['"])/g, (match, p1, p2) => {
        if (p1.endsWith('_DB')) return match;
        return `${p1}_DB${p2}`;
    });

    // Hooks -> _db
    content = content.replace(/(@\/hooks\/(?!ui\/|data\/)[a-zA-Z0-9\-\/]+)(['"])/g, (match, p1, p2) => {
        if (p1.endsWith('_db') || p1.endsWith('_DB')) return match;
        let suffix = p1.includes('useModelMutations') || p1.includes('useBulkOperations') || p1.includes('useModelGallery') ? '_DB' : '_db';

        // Wait! The copied hooks end in _db.ts, except for pre-existing ones which end in _DB or _db.
        // I will just append _db to most,, and let typescript complain if it's _DB instead of _db or vice versa.
        // Actually earlier grep proved none ended in _DB except those 3.
        return `${p1}_db${p2}`.replace('_db_db', '_db').replace('_DB_db', '_DB').replace('useModelMutations_db', 'useModelMutations_DB').replace('useBulkOperations_db', 'useBulkOperations_DB').replace('useModelGallery_db', 'useModelGallery_db');
    });

    // API -> _db
    content = content.replace(/(@\/api\/services\/[a-zA-Z0-9\-\/]+)(['"])/g, (match, p1, p2) => {
        if (p1.endsWith('_db')) return match;
        return `${p1}_db${p2}`;
    });

    if (content !== orig) {
        fs.writeFileSync(f, content, 'utf8');
        console.log('Patched imports in ' + f);
    }
});
