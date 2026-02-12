const fs = require('fs');
const path = require('path');

// --- MOCK ENVIRONMENT ---
const MODELS_DIR = path.resolve('W:/3D Files Cabinet - Copy');
const TEST_DIR_REL = '_ClaimConflictTest/C-270';
const TEST_DIR_ABS = path.join(MODELS_DIR, TEST_DIR_REL);

// Helpers
function createInitialModelMetadata(overrides) {
    return {
        id: `local-${Date.now()}`,
        name: overrides.name || "New Model",
        filePath: overrides.filePath || "",
        parsedImages: [],
        items: [],
        isProjectRoot: false,
        userDefined: { thumbnail: "parsed:0" },
        ...overrides
    };
}

// Ensure the function is exported or we have to copy it again.
// Since admin.js is a module, we can try to import it if it exports runHealLogic?
// No, admin.js exports the router. runHealLogic is internal.
// So we must COPY the entire runHealLogic again (ugh). 
// But wait, I can modify admin.js to export it for testing? 
// No, that requires restart.
// I will copy-paste the relevant Claim Logic block into a mini-runner here.

async function runTest() {
    console.log("Setting up Claim Conflict Test...");
    if (fs.existsSync(TEST_DIR_ABS)) fs.rmSync(TEST_DIR_ABS, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR_ABS, { recursive: true });

    // 1. Create Project Marker
    fs.writeFileSync(path.join(TEST_DIR_ABS, 'project.json'), JSON.stringify({ name: "C-270 Project" }));

    // 2. Create Models
    // Lagarto
    fs.writeFileSync(path.join(TEST_DIR_ABS, 'Lagarto_v4s.stl'), 'content');
    fs.writeFileSync(path.join(TEST_DIR_ABS, 'Lagarto_v4s-stl-munchie.json'), JSON.stringify(createInitialModelMetadata({
        name: 'Lagarto_v4s',
        filePath: 'Lagarto_v4s.stl'
    })));

    // Articulated Slug (The polluter)
    fs.writeFileSync(path.join(TEST_DIR_ABS, 'Articulated_Slug.stl'), 'content');
    fs.writeFileSync(path.join(TEST_DIR_ABS, 'Articulated_Slug.stl-thumb.png'), 'thumb content');
    fs.writeFileSync(path.join(TEST_DIR_ABS, 'Articulated_Slug-stl-munchie.json'), JSON.stringify(createInitialModelMetadata({
        name: 'Articulated_Slug',
        filePath: 'Articulated_Slug.stl'
    })));

    console.log("Files created. Running Claim Logic Simulation...");

    // --- SIMULATED CLAIM LOGIC ---
    // This mimics admin.js iteration
    const dir = TEST_DIR_ABS;
    const siblings = fs.readdirSync(dir);
    const isProject = true; // explicitly true here

    // Simulate processing Lagarto
    const lagartoData = JSON.parse(fs.readFileSync(path.join(dir, 'Lagarto_v4s-stl-munchie.json'), 'utf8'));
    const modelFileName = 'Lagarto_v4s';
    const proposal = { additions: [] };

    siblings.forEach(file => {
        if (file.endsWith('.json') || file === 'project.json') return;

        // --- LOGIC UNDER TEST ---
        const lowerFile = file.toLowerCase();
        const isMatch = modelFileName && lowerFile.startsWith(modelFileName.toLowerCase());
        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(file);
        const isGeneratedThumb = lowerFile.endsWith('-thumb.png');
        const isSystemFile = lowerFile.includes('.bak') || lowerFile.includes('.tmp') || file.startsWith('.');

        let shouldClaim = false;
        if (!isSystemFile) {
            if (isProject) {
                const isGcode = lowerFile.endsWith('.gcode');
                shouldClaim = !((isGeneratedThumb || isGcode) && !isMatch);
            } else {
                if (isMatch) shouldClaim = true;
            }
        }
        // -----------------------

        if (file === 'Articulated_Slug.stl-thumb.png') {
            console.log(`Checking ${file} for Lagarto:`);
            console.log(`  isGeneratedThumb: ${isGeneratedThumb}`);
            console.log(`  isMatch: ${isMatch}`);
            console.log(`  shouldClaim: ${shouldClaim}`);
        }

        if (shouldClaim && isImage) {
            if (file === 'Articulated_Slug.stl-thumb.png') {
                console.log(">>> FAILURE: Claimed unrelated thumbnail!");
            }
            proposal.additions.push(file);
        }
    });

    console.log("\nAdditions Proposed for Lagarto:", proposal.additions);

    // Cleanup
    // fs.rmSync(TEST_DIR_ABS, { recursive: true, force: true });
}

runTest();
