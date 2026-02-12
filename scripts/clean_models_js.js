const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../server/routes/models.js');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Target Range: Line 404 (Index 403) to Line 568 (Index 567)
// Expected Content:
// Index 403: // PATCH /api/models/:id - Update model (Modern)
// Index 567: });
// Index 569 (Line 570): // POST /api/save-model (Legacy Alias)

const startIdx = 403;
const endIdx = 567;

console.log('Checking boundaries...');
console.log(`Index ${startIdx}: "${lines[startIdx]}"`);
console.log(`Index ${endIdx}: "${lines[endIdx]}"`);

const startMatch = lines[startIdx].includes('PATCH') && lines[startIdx].includes('Update model');
const endMatch = lines[endIdx].trim() === '});';

if (startMatch && endMatch) {
    console.log('Boundaries match. Deleting lines ' + (startIdx + 1) + ' to ' + (endIdx + 1));
    lines.splice(startIdx, (endIdx - startIdx) + 1);
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log('Success.');
} else {
    console.error('Boundaries DO NOT match. Aborting.');
    // Check if maybe we already deleted one copy?
    // Let's print surroundings to debug
    console.log('Context around 403:');
    console.log(lines.slice(400, 405).join('\n'));
    console.log('Context around 567:');
    console.log(lines.slice(565, 570).join('\n'));
}
