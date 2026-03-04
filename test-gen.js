const { generateThumbnail } = require('./src/utils/thumbnailGenerator_db');
const path = require('path');

async function testGen() {
    const modelsRoot = 'W:/3D Files Cabinet - Copy';
    const sourcePath = 'W:/3D Files Cabinet - Copy/3D Printer/Sonos_One__gen2__floorstands/Grommet2.stl';
    const thumbPath = 'W:/3D Files Cabinet - Copy/3D Printer/Sonos_One__gen2__floorstands/Grommet2.stl-thumb.png';
    const BASE_URL = 'http://127.0.0.1:3001';

    try {
        await generateThumbnail(sourcePath, thumbPath, BASE_URL, undefined, modelsRoot);
        console.log("Success");
    } catch (e) {
        console.error("Error:", e);
    }
}

testGen();
