// test-path-logic.js (or .ts)

const path = require('path');

// --- MOCK INPUTS FROM YOUR PRODUCTION ENVIRONMENT ---
// These must be absolute paths matching the server's context.

// 1. The absolute root path where Express is serving static files from.
const MODELS_DIR = '/app/models'; 
console.log(`MOCK: modelsDir = ${MODELS_DIR}`);

// 2. The absolute file path that is passed into generateThumbnail.
const MODEL_URL_WITH_SPACES = '/app/models/3D Printer/ADXL/ADXL mount.stl'; 
console.log(`MOCK: modelUrl = ${MODEL_URL_WITH_SPACES}`);

// 3. The absolute file path for a nested model (for robustness check)
const MODEL_URL_NESTED = '/app/models/SciFi/Bases/Outpost.stl';
console.log(`MOCK: modelUrl Nested = ${MODEL_URL_NESTED}`);

// --- PATH CLEANING LOGIC TO TEST ---
function generateCleanUrl(modelUrl, modelsDir) {
    let cleanUrl;

    // 1. Calculate the path relative to the models root directory
    let relativePath = path.relative(modelsDir, modelUrl);

    // 2. Normalize and Clean the path string for URL use (Your Fix)
    // We use path.posix.sep instead of backslash just to be explicit
    let normalizedRelative = relativePath.replace(/\\/g, path.posix.sep).replace(/^\/+|\/+$/g, '');

    // 3. Prepend the web server context path (`/models`)
    cleanUrl = path.posix.join('/models', normalizedRelative); 
    
    // 4. Ensure it starts with a single leading slash
    if (!cleanUrl.startsWith('/')) {
        cleanUrl = '/' + cleanUrl;
    }
    
    // The final URL should include the original space/special characters, NOT the %20 encoding.
    // The final encodeURIComponent() call in thumbnailGenerator.ts handles the encoding later.

    return cleanUrl;
}

// --- RUN TESTS ---

// Test 1: File with spaces
const cleanedUrl1 = generateCleanUrl(MODEL_URL_WITH_SPACES, MODELS_DIR);
console.log('\n--- TEST 1: File with Spaces ---');
console.log('EXPECTED (Raw URL Path): /models/3D Printer/ADXL/ADXL mount.stl');
console.log('ACTUAL (Raw URL Path):   ' + cleanedUrl1);

// Test 2: Nested file
const cleanedUrl2 = generateCleanUrl(MODEL_URL_NESTED, MODELS_DIR);
console.log('\n--- TEST 2: Nested File ---');
console.log('EXPECTED (Raw URL Path): /models/SciFi/Bases/Outpost.stl');
console.log('ACTUAL (Raw URL Path):   ' + cleanedUrl2);