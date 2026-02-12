const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../dist-backend/utils/configManager');

function getModelsDirectory() {
    if (process.env.MODELS_PATH) return process.env.MODELS_PATH;
    const config = ConfigManager.loadConfig();
    return (config.settings && config.settings.modelDirectory) || './models';
}

function getAbsoluteModelsPath() {
    const dir = getModelsDirectory();
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

/**
 * Scans the filesystem to produce "Source of Truth" stats
 * mimicking how the legacy system viewed the world, but aligned with DB logic.
 */
function auditLegacySystem() {
    const modelsDir = getAbsoluteModelsPath();
    const stats = {
        models: 0,      // *.json files
        files: 0,       // "Tracked" files (Geometries for loose, All for projects)
        collections: 0, // Directories (excluding projects)
        projects: 0     // Directories with project.json
    };

    if (!fs.existsSync(modelsDir)) return stats;

    function scan(dir) {
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) { return; }

        const isProject = fs.existsSync(path.join(dir, 'project.json'));

        if (isProject) {
            stats.projects++;
            // In a project, we count ALL non-system files as "Tracked Files"
            // (Matching migrate-munchies logic: "allFiles")
            for (const entry of entries) {
                if (entry.isFile()) {
                    if (entry.name.endsWith('.json')) continue;
                    if (entry.name.startsWith('.')) continue;
                    if (entry.name.toLowerCase().includes('.bak')) continue;
                    stats.files++;
                }
            }
            // Don't recurse into project subfolders for generic scanning usually?
            // But let's check entries for munches anyway just in case (though project should be flat-ish)
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('-munchie.json')) {
                    stats.models++;
                }
            }
            return; // Stop processing this branch as a "Project"
        }

        // Not a project
        if (dir !== modelsDir) {
            stats.collections++;
        }

        const looseGeometries = new Set();

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.')) {
                    scan(fullPath);
                }
            } else {
                // File
                if (entry.name.endsWith('-munchie.json')) {
                    stats.models++;
                    // For loose models, we only tracked the PRIMARY geometry as a ModelFile (initially)
                    // The migration script looked for .stl, .3mf, .obj, .gcode with same basename
                    const baseName = entry.name.replace('-munchie.json', '');
                    // Check neighbors for geometry
                    const exts = ['.stl', '.3mf', '.obj', '.gcode'];
                    for (const ext of exts) {
                        const candidate = baseName + ext;
                        // const candidateCase... (fs is sensitive? depends)
                        // We can't easily check existence case-insensitive here without re-scan, 
                        // but we are iterating entries.
                        const found = entries.find(e => e.name.toLowerCase() === candidate.toLowerCase());
                        if (found) {
                            looseGeometries.add(found.name);
                            break; // Only count one primary per munchie
                        }
                    }
                }
            }
        }
        stats.files += looseGeometries.size;
    }

    scan(modelsDir);
    return stats;
}

module.exports = { auditLegacySystem };
