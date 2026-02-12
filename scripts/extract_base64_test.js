const fs = require('fs');
const path = require('path');

const inputPath = 'W:\\3D Files Cabinet - Copy\\3D Printer\\rail_100mm_200um_mgn9-munchie.json';
const outputPath = path.join(__dirname, '..', 'rail_test_thumb.png');

console.log(`Reading from: ${inputPath}`);

try {
    if (!fs.existsSync(inputPath)) {
        console.error("❌ File not found!");
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const images = data.parsedImages || data.images || [];
    let found = false;

    images.forEach((img, idx) => {
        if (img.startsWith('data:image')) {
            console.log(`Found Base64 image at index ${idx}`);
            const base64Data = img.replace(/^data:image\/[a-z]+;base64,/, "");
            fs.writeFileSync(outputPath, base64Data, 'base64');
            console.log(`✅ Extracted to: ${outputPath}`);
            found = true;
        }
    });

    if (!found) {
        console.log("⚠️ No Base64 images found in file.");
    }

} catch (e) {
    console.error("❌ Error:", e);
}
