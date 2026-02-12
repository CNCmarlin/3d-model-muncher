const fs = require('fs');

try {
    const data = fs.readFileSync('heal_preview_full.json', 'utf8');
    const json = JSON.parse(data);

    // Find C-270 models AND the specific user examples
    const modelsOfInterest = json.previewResults.details.filter(d =>
        d.model.includes('c270') ||
        d.model.includes('C-270') ||
        d.model.toLowerCase().includes('lagarto') ||
        d.model.toLowerCase().includes('articulated_slug')
    );

    let output = `Found ${modelsOfInterest.length} models of interest.\n`;

    modelsOfInterest.forEach(item => {
        output += `\nModel: ${item.model} (PATH: ${item.filePath || 'Unknown'})\n`;
        output += `  Additions: ${JSON.stringify(item.additions)}\n`;
        output += `  Deletions: ${JSON.stringify(item.deletions)}\n`;
    });

    fs.writeFileSync('preview_analysis_utf8.txt', output);
    console.log('Analysis written to preview_analysis_utf8.txt');

} catch (e) {
    console.error(e);
}
