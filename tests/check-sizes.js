const fs = require('fs');
const path = require('path');

const modelsDir = 'W:/3D Files Cabinet - Copy';

function findThumbnails(dir) {
    let results = [];
    try {
        const list = fs.readdirSync(dir, { withFileTypes: true });
        list.forEach(item => {
            const p = path.join(dir, item.name);
            if (item.isDirectory()) {
                if (item.name.includes('Sonos')) {
                    results = results.concat(findThumbnails(p));
                } else if (dir === modelsDir) { // only search top level folders that might contain Sonos
                    results = results.concat(findThumbnails(p));
                }
            } else if (item.name.endsWith('-thumb.png')) {
                if (p.includes('Sonos')) {
                    results.push(p);
                }
            }
        });
    } catch (e) { }
    return results;
}

const files = findThumbnails(modelsDir);

files.forEach(f => {
    const stat = fs.statSync(f);
    console.log(`${path.relative(modelsDir, f)}: ${stat.size} bytes`);
});
