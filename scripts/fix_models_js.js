const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../server/routes/models.js');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// We want to remove lines 404 to 569 (1-based index from view_file).
// Arrays are 0-based.
// Line 404 in 1-based is index 403.
// Line 569 in 1-based is index 568.

// Let's verify context.
// Index 403 should start with "// PATCH"
// Index 568 should start with "});"
// Index 569 should be empty or start of POST

const startIdx = 403;
const endIdx = 568;

console.log('Line 404 (Index 403):', lines[startIdx]);
console.log('Line 569 (Index 568):', lines[endIdx]);

if (lines[startIdx].trim().startsWith('// PATCH') && lines[endIdx].trim() === '});') {
    console.log('Confirmed range. Deleting...');
    const newLines = [
        ...lines.slice(0, startIdx),
        ...lines.slice(endIdx + 1)
    ];
    fs.writeFileSync(filePath, newLines.join('\n'));
    console.log('Done.');
} else {
    console.log('Mismatch! Aborting.');
    console.log('Expected // PATCH at 403, got:', lines[startIdx]);
    console.log('Expected }); at 568, got:', lines[endIdx]);
}
