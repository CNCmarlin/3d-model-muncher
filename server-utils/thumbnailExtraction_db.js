const fs = require('fs');
const { unzipSync } = require('fflate');

/**
 * Checks if a 3MF file has an embedded thumbnail without fully parsing it.
 * @param {string} filePath - Absolute path to the .3mf file
 * @returns {boolean} - True if Metadata/thumbnail.png or Metadata/plate_1.png exists
 */
function hasEmbeddedThumbnail(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const buffer = fs.readFileSync(filePath);
        // Peek using fflate's unzipSync (it reads the central directory)
        const unzipped = unzipSync(new Uint8Array(buffer), { filter: (file) => file.name.startsWith('Metadata/') });
        return !!(unzipped['Metadata/thumbnail.png'] || unzipped['Metadata/plate_1.png']);
    } catch (e) {
        console.warn(`[ThumbnailExtraction] Failed to check ${filePath}:`, e.message);
        return false;
    }
}

/**
 * Extracts the embedded thumbnail from a 3MF file to a target path.
 * @param {string} filePath - Absolute path to the .3mf file
 * @param {string} outputPath - Target path to save the .png file
 * @returns {Promise<boolean>} - True if successful, False otherwise
 */
async function extractEmbeddedThumbnail(filePath, outputPath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const buffer = fs.readFileSync(filePath);
        const unzipped = unzipSync(new Uint8Array(buffer), {
            filter: (file) => file.name === 'Metadata/thumbnail.png' || file.name === 'Metadata/plate_1.png'
        });

        let thumbData = unzipped['Metadata/plate_1.png'] || unzipped['Metadata/thumbnail.png'];

        if (thumbData) {
            fs.writeFileSync(outputPath, thumbData);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`[ThumbnailExtraction] Failed to extract from ${filePath}:`, e.message);
        return false;
    }
}

module.exports = {
    hasEmbeddedThumbnail,
    extractEmbeddedThumbnail
};
