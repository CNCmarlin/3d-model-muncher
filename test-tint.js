const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function testTint() {
    const inputPath = 'W:\\3D Files Cabinet - Copy\\uploads\\Sonos_One__gen2__floorstands\\Grommet2.stl-thumb.png';
    const outputPath = path.join(__dirname, 'test-tinted.png');

    if (!fs.existsSync(inputPath)) {
        console.log('Test image not found at', inputPath);
        return;
    }

    try {
        await sharp(inputPath)
            .resize(400, 400, { fit: 'cover', position: 'center' })
            .tint('#b30000') // Try coloring it red
            .png()
            .toFile(outputPath);

        console.log('✅ Generated tinted test image at', outputPath);
    } catch (e) {
        console.error('Error tinting:', e);
    }
}

testTint();
