const fs = require('fs');
const cp = require('child_process');

const files = cp.execSync('dir /s /b *_DB.tsx', { encoding: 'utf8' })
    .split('\r\n')
    .filter(Boolean);

const componentsRegex = /(@\/components\/[a-zA-Z0-9\-\/]+)(?!_DB|['"])/g;
const hooksRegex = /(@\/hooks\/[a-zA-Z0-9\-\/]+)(?!_db|['"])/g;
const apiRegex = /(@\/api\/services\/[a-zA-Z0-9\-\/]+)(?!_db|['"])/g;

files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    let orig = content;

    // Replace components
    // If it imports a component, append _DB to the import path.
    // e.g. @/components/shared/ModelCard -> @/components/shared/ModelCard_DB
    // For local imports like './BufferedFields', we also need to handle them.
    content = content.replace(/(from ['"]\.\.?\/[a-zA-Z0-9\-\/]+)(?!_DB)(['"])/g, '$1_DB$2');
    content = content.replace(componentsRegex, '$1_DB');

    // Replace hooks -> _db
    content = content.replace(hooksRegex, '$1_db');

    // Replace API -> _db
    content = content.replace(apiRegex, '$1_db');

    if (content !== orig) {
        fs.writeFileSync(f, content, 'utf8');
        console.log('Updated ' + f);
    }
});
