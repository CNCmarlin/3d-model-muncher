const path = require('path');

function testClaimLogic(filename, modelName, isProject) {
    const file = filename;
    const modelFileName = modelName;
    const lowerFile = file.toLowerCase();

    // Exact logic from admin.js lines 222-231
    const isMatch = modelFileName && lowerFile.startsWith(modelFileName.toLowerCase());
    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(file);
    const isGeneratedThumb = lowerFile.endsWith('-thumb.png');
    const isSystemFile = lowerFile.includes('.bak') || lowerFile.includes('.tmp') || file.startsWith('.'); // simplified

    let shouldClaim = false;
    if (!isSystemFile) {
        if (isProject) {
            const isGcode = lowerFile.endsWith('.gcode');
            shouldClaim = !((isGeneratedThumb || isGcode) && !isMatch);
        } else {
            if (isMatch) shouldClaim = true;
        }
    }

    let out = "";
    out += `\nTesting: File="${file}", Model="${modelName}", Project=${isProject}\n`;
    out += `  isMatch: ${isMatch}\n`;
    out += `  isGeneratedThumb: ${isGeneratedThumb}\n`;
    out += `  shouldClaim: ${shouldClaim}\n`;
    console.log(out);
    return out;
}

// Scenario from User Screenshot
let result = "";
result += testClaimLogic("Articulated_Slug.stl-thumb.png", "Lagarto_v4s", true);
result += testClaimLogic("Articulated_Slug.stl-thumb.png", "Articulated_Slug", true);
const fs = require('fs');
fs.writeFileSync('claim_logic_output_utf8.txt', result);
