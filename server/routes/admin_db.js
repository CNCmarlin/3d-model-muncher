const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../../dist-backend/utils/configManager');
const { loadCollections, saveCollections } = require('../../server-utils/dataAccess');

// Lazy load thumbnail generator to avoid crash if sharp missing
let generateThumbnail;
try {
    generateThumbnail = require('../../dist-backend/utils/thumbnailGenerator').generateThumbnail;
} catch (e) {
    console.warn("Thumbnail generator not available:", e.message);
}

// --- Helpers ---
const { hasEmbeddedThumbnail, extractEmbeddedThumbnail } = require('../../server-utils/thumbnailExtraction');

function getModelsDirectory() {
    if (process.env.MODELS_PATH) return process.env.MODELS_PATH;
    try {
        const dataDir = path.join(process.cwd(), 'data');
        const globalPath = path.join(dataDir, 'config.json');
        if (fs.existsSync(globalPath)) {
            const parsed = JSON.parse(fs.readFileSync(globalPath, 'utf8') || '{}');
            if (parsed?.settings?.modelDirectory) return parsed.settings.modelDirectory;
        }
    } catch (e) { }
    const config = ConfigManager.loadConfig();
    return (config.settings && config.settings.modelDirectory) || './models';
}

function getAbsoluteModelsPath() {
    const dir = getModelsDirectory();
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function createInitialModelMetadata(overrides) {
    const now = new Date().toISOString();
    return {
        id: overrides.id || `local-${Date.now()}`,
        name: overrides.name || "New Model",
        filePath: overrides.filePath || "",
        modelUrl: overrides.modelUrl || "",
        fileSize: overrides.fileSize || "0",
        description: overrides.description || "",
        category: overrides.category || "Uncategorized",
        tags: overrides.tags || [],
        isPrinted: false,
        printTime: "",
        filamentUsed: "",
        license: overrides.license || "Private Use",
        source: "Upload",
        designer: "Local User",
        collections: overrides.collections || [],
        excludedCollections: overrides.excludedCollections || [],
        printSettings: {
            layerHeight: "", infill: "", nozzle: "", material: "", printer: ""
        },
        created: now,
        lastModified: now,
        parsedImages: [],
        related_files: overrides.related_files || [],
        hidden: overrides.hidden ?? true,
        isRelatedPart: overrides.isRelatedPart ?? false,
        isProjectRoot: overrides.isProjectRoot ?? false,
        price: 0,
        userDefined: {
            thumbnail: "parsed:0",
            imageOrder: [],
            description: overrides.description || "",
            images: []
        },
        ...overrides
    };
}

// --- Logic ---

async function runHealLogic(isDryRun = false, specificPath = null, thumbnailStrategy = 'prefer-embedded') {
    console.log("!!! HEAL LOGIC TRIGGERED !!!");
    console.log("Is Dry Run:", isDryRun, "Strategy:", thumbnailStrategy);

    const modelsDir = getAbsoluteModelsPath();

    if (!modelsDir || !fs.existsSync(modelsDir)) {
        console.error("❌ ERROR: Models directory does not exist or is undefined!");
        return { processed: 0, healed: 0, errors: ["Models directory missing"], details: [] };
    }

    const results = { processed: 0, healed: 0, errors: [], details: [] };

    // We don't really use actualCollections here for healing unrelated to collections, but original code had it.
    // const actualCollections = loadCollections() || []; 

    async function processDir(dir) {
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            console.error(`❌ Cannot read directory: ${dir}`);
            return;
        }

        // --- 📦 PROJECT MARKER CHECK ---
        const projectMarkerPath = path.join(dir, 'project.json');
        const projectData = fs.existsSync(projectMarkerPath) ? JSON.parse(fs.readFileSync(projectMarkerPath, 'utf8')) : null;
        const isProject = !!projectData;

        // Filter for Munchies, but be VERY inclusive
        const munchieFiles = entries.filter(e => {
            const name = e.name.toLowerCase();
            return e.isFile() &&
                name.endsWith('munchie.json') &&
                !name.includes('.bak');
        });
        const normalizedCurrentDir = dir.replace(/\\/g, '/');

        // NEW: "King of the Hill" Pre-Scan
        let folderMunchies = munchieFiles.map(f => {
            const p = path.join(dir, f.name);
            const d = JSON.parse(fs.readFileSync(p, 'utf8'));
            return { path: p, data: d, mtime: fs.statSync(p).mtime };
        });

        const roots = folderMunchies.filter(m => m.data.isProjectRoot === true);

        if (roots.length > 1) {
            console.log(`⚠️ Multiple Roots found in ${dir}. Enforcing single King...`);
            // Keep the most recently modified "King"
            roots.sort((a, b) => b.mtime - a.mtime);
            roots.slice(1).forEach(peer => {
                peer.data.isProjectRoot = false;
                // NEW: If we demote a king, it should now become a hidden related part
                peer.data.hidden = true;
                peer.data.isRelatedPart = true;

                if (!isDryRun) {
                    fs.writeFileSync(peer.path, JSON.stringify(peer.data, null, 2));
                }
                console.log(`    └─ Demoted redundant King: ${path.basename(peer.path)}`);
            });
        }

        for (const entry of munchieFiles) {
            const fullPath = path.join(dir, entry.name);

            try {
                const raw = fs.readFileSync(fullPath, 'utf8');
                let data = JSON.parse(raw);
                let hasChanged = false;


                data = createInitialModelMetadata(data);

                // FIX: Define proposal HERE so it's available for Visibility Logic
                const debugPath = path.relative(modelsDir, fullPath).replace(/\\/g, '/');
                const proposal = {
                    model: `${data.name || entry.name} (${debugPath})`,
                    additions: [],
                    deletions: [],
                    modifications: [], // For reordering or non-destructive changes
                    collectionSync: null,
                    visibilityFix: null
                };

                if (data.images) {
                    delete data.images;
                    hasChanged = true;
                }

                // --- 2. VISIBILITY LOGIC ---
                const isGlobalRoot = normalizedCurrentDir === '' || normalizedCurrentDir === '.';

                if (isGlobalRoot) {
                    const shouldBeHidden = !data.isProjectRoot;
                    if (data.hidden !== shouldBeHidden) {
                        data.hidden = shouldBeHidden;
                        hasChanged = true;
                    }
                } else {
                    if (data.hidden !== true) {
                        data.hidden = true;
                        hasChanged = true;
                    }
                }

                if (!data.parsedImages) data.parsedImages = [];
                if (!data.related_files) data.related_files = [];

                const originalImgCount = data.parsedImages.length;
                const originalRelatedCount = data.related_files.length;

                // Capture original state for preview
                const originalFilePath = data.filePath || null;
                proposal.originalFilePath = originalFilePath;

                // --- 3. IDENTITY & PROPOSAL ---
                // Ground truth: what the munchie FILENAME says the model should be.
                // This is immutable and always correct, unlike data.filePath which may be corrupted.
                const munchieBaseName = entry.name.replace(/(-stl)?-munchie\.json$/i, '');

                // Determine the "Model Name" based on the file path or the metadata filename
                // This is the anchor for all matching logic.
                let modelFileName = data.filePath
                    ? path.basename(data.filePath) // e.g. "MyFile.stl"
                    : entry.name.replace(/(-stl)?-munchie\.json$/i, '') + (entry.name.includes('-stl-') ? '.stl' : '.3mf'); // heuristic fallback

                // If fallback guess was wrong (e.g. guessed .3mf but file is .stl), we might fail to match.
                // Better approach: Use the "Clean Name" (no extension) for matching start of files.
                const modelBaseName = path.basename(modelFileName, path.extname(modelFileName)); // "MyFile"

                // --- PRE-CALCULATE SIBLING MODELS FOR COLLISION DETECTION ---
                // We need to know if "cam_bed_bottom" exists before "cam_bed" claims "cam_bed_bottom.stl"
                const folderBaseNames = folderMunchies.map(m => {
                    const fname = path.basename(m.path);
                    // Always derive from munchie filename — filePath may be corrupted
                    const name = fname.replace(/(-stl)?-munchie\.json$/i, '');
                    return name;
                }).filter(n => n);

                const siblings = fs.readdirSync(dir);

                // --- 4. PATH HEALING (STRICT) ---
                const isExplicitStl = entry.name.toLowerCase().includes('-stl-munchie.json');

                // MISMATCH DETECTION: Compare munchie filename to stored filePath.
                // e.g. "cam_bed-stl-munchie.json" implies model should be "cam_bed.*"
                // If filePath points to "c270_cam1.stl", that's a mismatch → corrupted.
                const existingFileBaseName = data.filePath
                    ? path.basename(data.filePath, path.extname(data.filePath)).toLowerCase()
                    : null;
                const isFilePathMismatch = data.filePath && data.filePath !== "" &&
                    existingFileBaseName !== munchieBaseName.toLowerCase() &&
                    !existingFileBaseName.startsWith(munchieBaseName.toLowerCase());

                if (!data.filePath || data.filePath === "" || isFilePathMismatch) {
                    if (isFilePathMismatch) {
                        proposal.deletions.push(
                            `filePath MISMATCH: Was "${data.filePath}" but munchie "${entry.name}" expects "${munchieBaseName}.*"`
                        );
                    }

                    // STRICT RULE: Only recover if the file explicitly starts with the model name
                    // This prevents "Lagarto" from claiming "Articulated_Slug" just because it's there.
                    const foundModel = siblings.find(f => {
                        const low = f.toLowerCase();
                        const isModel = low.endsWith('.stl') || low.endsWith('.3mf');

                        // Fix for cam_bed-stl claiming cam_bed.3mf:
                        if (isExplicitStl && !low.endsWith('.stl')) return false;

                        // Match using munchie-derived name (ground truth), not corrupted filePath
                        // AND MUST START WITH NAME
                        return isModel && f.toLowerCase().startsWith(munchieBaseName.toLowerCase());
                    });

                    if (foundModel) {
                        const newRelPath = path.join(path.relative(modelsDir, dir), foundModel).replace(/\\/g, '/');
                        const prevStatus = isFilePathMismatch ? `Mismatch (was "${path.basename(data.filePath)}")` :
                            (data.filePath === "" ? "Empty String" : "Missing/Null");
                        proposal.additions.push(`Recovered filePath: ${foundModel} (Matched '${modelBaseName}' - Was: ${prevStatus})`);
                        data.filePath = newRelPath;
                        data.modelUrl = `/models/${newRelPath}`;
                        modelFileName = foundModel; // Update our anchor
                        hasChanged = true;

                        // Also clear stale parsedImages and thumbnail that reference the wrong model
                        if (isFilePathMismatch) {
                            const oldBaseName = existingFileBaseName;
                            const staleImages = data.parsedImages.filter(img =>
                                path.basename(img).toLowerCase().startsWith(oldBaseName) &&
                                !path.basename(img).toLowerCase().startsWith(modelBaseName.toLowerCase())
                            );
                            if (staleImages.length > 0) {
                                data.parsedImages = data.parsedImages.filter(img => !staleImages.includes(img));
                                staleImages.forEach(img => {
                                    proposal.deletions.push(`${path.basename(img)} (Stale - belonged to mismatched "${oldBaseName}")`);
                                });
                                // Reset thumbnail pointer since parsedImages changed
                                if (data.userDefined) {
                                    data.userDefined.thumbnail = undefined;
                                    data.userDefined.imageOrder = [];
                                }
                            }
                        }
                    }
                }

                // Update BaseName in case it changed during recovery
                const currentBaseName = data.filePath
                    ? path.basename(data.filePath, path.extname(data.filePath))
                    : modelBaseName;

                // --- 5. ASSET CLAIMING (SMART) ---
                siblings.forEach(file => {
                    const lowerFile = file.toLowerCase();
                    if (lowerFile.endsWith('.json') || lowerFile === 'project.json' || lowerFile.endsWith('.bak')) return;

                    const relAssetPath = path.join(path.relative(modelsDir, dir), file).replace(/\\/g, '/');
                    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(file);

                    // STRICT MATCHING (Default): Start with Model Name
                    const isNameMatch = lowerFile.startsWith(currentBaseName.toLowerCase());

                    // RELAXED MATCHING (Project Mode): Claim everything in the folder
                    // If this is a Project, and we are the Project Root, we claim all orphans.
                    // If we are just a part in a project, we only claim name-matched stuff to avoid stealing from Root.
                    const isProjectAndRoot = isProject && data.isProjectRoot;

                    // COLLISION CHECK: Is there a "Better" (Longer) match in this folder?
                    // e.g. We are "cam_bed", file is "cam_bed_bottom.stl".
                    // If "cam_bed_bottom" exists as a model, IT should claim this, not us.
                    const betterMatch = folderBaseNames.find(other =>
                        other.length > currentBaseName.length &&
                        lowerFile.startsWith(other.toLowerCase())
                    );

                    let shouldClaim = (isNameMatch && !betterMatch);

                    // PROJECT MODE OVERRIDE:
                    // If we are the Project Root, and the file is NOT claimed by a specific part (betterMatch),
                    // then we claim it as a generic project asset/doc.
                    if (isProjectAndRoot && !betterMatch) {
                        shouldClaim = true;
                    }

                    const isGenericThumb = lowerFile === 'thumbnail.png' || lowerFile === 'cover.png' || lowerFile === 'plate_1.png';

                    // Special Case: Metadata files for OTHER models
                    if (lowerFile.endsWith('munchie.json')) return;

                    // If it's a generic name (thumbnail.png), and we are the ONLY model or it's a project root, maybe claim it?
                    if (isGenericThumb && data.isProjectRoot) {
                        shouldClaim = true;
                    }

                    // Fix for cam_bed-stl claiming cam_bed.3mf-thumb.png or embedded thumbnails:
                    const modelExt = data.filePath ? path.extname(data.filePath).toLowerCase() : '';
                    if ((isExplicitStl || modelExt === '.stl') && (lowerFile.includes('.3mf') || lowerFile.includes('-embedded-thumb'))) {
                        shouldClaim = false;
                    }

                    if (shouldClaim && relAssetPath !== data.filePath) {
                        if (isImage) {
                            const url = `/models/${relAssetPath}`;
                            if (!data.parsedImages.includes(url)) {
                                proposal.additions.push(`${file} (Gallery Link - ${isProjectAndRoot ? 'Project Asset' : "Matched '" + currentBaseName + "'"})`);
                                data.parsedImages.push(url);
                                hasChanged = true;
                            }
                        } else {
                            // Non-image assets (G-code, READMEs)
                            if (!data.related_files.includes(relAssetPath)) {
                                proposal.additions.push(`${file} (Related Part/Doc - ${isProjectAndRoot ? 'Project Asset' : "Matched '" + currentBaseName + "'"})`);
                                data.related_files.push(relAssetPath);
                                hasChanged = true;
                            }
                        }
                    }
                });

                // --- 5.0. 3MF EMBEDDED RESCUE (NEW) ---
                // If the model is a 3MF, ensure we have the embedded thumbnail extracted.
                // This handles cases where the scanner didn't populate parsedImages with base64.
                const modelRelPath = data.filePath || '';
                if (modelRelPath.toLowerCase().endsWith('.3mf')) {
                    const absModelPath = path.join(modelsDir, modelRelPath);
                    if (fs.existsSync(absModelPath)) {
                        // Use currentBaseName to ensure consistent naming with the rest of the logic
                        const reliableName = `${currentBaseName}-embedded-thumb.png`;
                        const embeddedPath = path.join(dir, reliableName);

                        // Check if we track it (either as a file reference or legacy base64)
                        const hasEmbeddedRef = data.parsedImages.some(img => img.includes('-embedded-thumb') || img.startsWith('data:image'));
                        const physicalExists = siblings.includes(reliableName); // siblings is a list of filenames in the folder

                        if (physicalExists && !hasEmbeddedRef) {
                            // File already extracted (from a previous heal run) but not tracked — just re-link it
                            const newRel = path.relative(modelsDir, embeddedPath).replace(/\\/g, '/');
                            const newUrl = `/models/${newRel}`;
                            data.parsedImages.push(newUrl);
                            proposal.additions.push(`${reliableName} (Re-linked existing embedded thumb)`);
                            hasChanged = true;
                            if (!siblings.includes(reliableName)) siblings.push(reliableName);
                        } else if (!hasEmbeddedRef && !physicalExists) {
                            // File doesn't exist at all — attempt extraction
                            // FIRST: Check if the 3MF actually HAS an embedded thumbnail!
                            if (hasEmbeddedThumbnail(absModelPath)) {
                                if (!isDryRun) {
                                    try {
                                        const extracted = await extractEmbeddedThumbnail(absModelPath, embeddedPath);
                                        if (extracted) {
                                            console.log(`      -> Action: Rescued Embedded Thumbnail from ${path.basename(absModelPath)}`);
                                            const newRel = path.relative(modelsDir, embeddedPath).replace(/\\/g, '/');
                                            const newUrl = `/models/${newRel}`;
                                            data.parsedImages.push(newUrl);
                                            proposal.additions.push(`${reliableName} (Rescued from 3MF Metadata)`);
                                            hasChanged = true;
                                            siblings.push(reliableName);
                                        }
                                    } catch (e) {
                                        console.warn("       Failed to rescue embedded thumb:", e.message);
                                    }
                                } else {
                                    proposal.additions.push(`${reliableName} (Would Rescue from 3MF Metadata)`);
                                }
                            }
                        }
                    }
                }

                // --- 5a. BASE64 EXTRACTION ---
                // Convert legacy Base64 thumbnails to files to reduce JSON size and fix "Stale" errors.
                data.parsedImages = data.parsedImages.map(imgUrl => {
                    if (imgUrl.startsWith('data:image')) {
                        try {
                            // 1. Determine Extension (png/jpg)
                            const match = imgUrl.match(/^data:image\/([a-zA-Z]+);base64,/);
                            const ext = match ? match[1] : 'png';
                            const base64Data = imgUrl.replace(/^data:image\/[a-z]+;base64,/, "");

                            // 2. Determine Filename (Defaults to -embedded-thumb.png)
                            // User requested cleanup of STL-specific logic.
                            let suffix = '-embedded-thumb';

                            const newFileName = `${currentBaseName}${suffix}.${ext}`;
                            const newFilePath = path.join(dir, newFileName);
                            const newRelPath = path.join(path.relative(modelsDir, dir), newFileName).replace(/\\/g, '/');
                            const newUrl = `/models/${newRelPath}`;

                            // 3. Mock existence for Scrubbing (so it doesn't get deleted immediately)
                            if (!siblings.includes(newFileName)) {
                                siblings.push(newFileName);
                            }

                            // 4. Write File (if not dry run)
                            if (!isDryRun) {
                                fs.writeFileSync(newFilePath, base64Data, 'base64');
                                console.log(`      -> Extracted Base64 to ${newFileName}`);
                            }

                            proposal.additions.push(`${newFileName} (Extracted Base64 & Linked via Strategy)`);
                            hasChanged = true;
                            return newUrl; // Replace the massive string with the new URL
                        } catch (e) {
                            console.error("Error extracting base64:", e);
                            return imgUrl; // Keep original if failed
                        }
                    }
                    return imgUrl;
                });

                // --- 6. SCRUBBING (SMART) ---
                const relDir = path.relative(modelsDir, dir).replace(/\\/g, '/');
                const expectedFolderUrl = relDir === '' ? '/models/' : `/models/${relDir}/`;
                data.parsedImages = data.parsedImages.filter(imgUrl => {
                    const fileName = path.basename(imgUrl);
                    const isPhysicallyHere = siblings.includes(fileName);
                    const isCorrectFolder = imgUrl.startsWith(expectedFolderUrl);

                    // Verification: Does it minimize pollution?
                    const isNameMatch = fileName.toLowerCase().startsWith(currentBaseName.toLowerCase());
                    const isGenericThumb = fileName.toLowerCase() === 'thumbnail.png' || fileName.toLowerCase() === 'cover.png';

                    // PROJECT RELAXATION:
                    // If we are in a Project, we assume the user put these images here for a reason.
                    // We only scrub if they are physically missing or explicitly wrong path.
                    // We DO NOT scrub for name mismatch in projects.
                    const isLegit = isNameMatch || (data.isProjectRoot && isGenericThumb) || isProject;

                    if (!isPhysicallyHere) {
                        proposal.deletions.push(`${imgUrl} (Stale - Not found in folder)`);
                        return false;
                    }
                    if (!isCorrectFolder) {
                        proposal.deletions.push(`${imgUrl} (Wrong Path - Expected '${expectedFolderUrl}')`);
                        return false;
                    }

                    // Check for STL improperly claiming 3MF resources
                    const modelExt = data.filePath ? path.extname(data.filePath).toLowerCase() : '';
                    if ((isExplicitStl || modelExt === '.stl') && (fileName.toLowerCase().includes('.3mf') || fileName.toLowerCase().includes('-embedded-thumb'))) {
                        proposal.deletions.push(`${imgUrl} (Pollution - STL claiming 3MF resource)`);
                        return false;
                    }

                    if (!isLegit) {
                        proposal.deletions.push(`${imgUrl} (Name Mismatch - Expected start '${currentBaseName}')`);
                        return false;
                    }
                    return true;
                });

                if (data.parsedImages.length !== originalImgCount) hasChanged = true;



                data.related_files = data.related_files.filter(p => {
                    const fileName = path.basename(p);
                    const isPhysicallyHere = siblings.includes(fileName);
                    const expectedRelPath = path.join(path.relative(modelsDir, dir), fileName).replace(/\\/g, '/');

                    const isNameMatch = fileName.toLowerCase().startsWith(currentBaseName.toLowerCase());
                    const isMetadata = fileName.toLowerCase().endsWith('munchie.json') || fileName === 'project.json' || fileName.endsWith('.bak');

                    if (fileName.toLowerCase().endsWith('munchie.json') || fileName === 'project.json') {
                        proposal.deletions.push(`${p} (Cleanup - Metadata pollution)`);
                        return false;
                    }

                    if (fileName.toLowerCase().endsWith('.bak')) {
                        proposal.deletions.push(`${p} (Cleanup - Backup file)`);
                        return false;
                    }
                    if (!isPhysicallyHere) {
                        proposal.deletions.push(`${p} (Stale - File not found)`);
                        return false;
                    }
                    if (p !== expectedRelPath) {
                        proposal.deletions.push(`${p} (Wrong Path - Expected '${expectedRelPath}')`);
                        return false;
                    }
                    // PROJECT RELAXATION:
                    if (!isNameMatch && !isMetadata && !isProject) {
                        proposal.deletions.push(`${p} (Name Mismatch - Expected start '${currentBaseName}')`);
                        return false;
                    }
                    return true;
                });

                if (data.related_files.length !== originalRelatedCount) hasChanged = true;

                // --- 7. THUMBNAIL REPAIR (EXPLICIT LOGGING) ---
                const actualFile = data.filePath ? path.basename(data.filePath) : "";
                if (actualFile) {
                    const expectedThumbName = `${actualFile}-thumb.png`;
                    const thumbWebUrl = `${expectedFolderUrl}${expectedThumbName}`;

                    if (siblings.includes(expectedThumbName)) {
                        // 1. Ensure it's in the gallery
                        if (!data.parsedImages.includes(thumbWebUrl)) {
                            // Double check strict match logic OR Project Check
                            if (expectedThumbName.toLowerCase().startsWith(currentBaseName.toLowerCase()) || isProject) {
                                proposal.additions.push(`${expectedThumbName} (Added to Gallery)`);
                                data.parsedImages.push(thumbWebUrl);
                                hasChanged = true;
                            }
                        }


                        // 2. Set as Primary Thumbnail (STRATEGY AWARE REORDERING)
                        if (data.parsedImages.length > 1 && thumbnailStrategy !== 'none') {

                            const embedded = data.parsedImages.find(img => img.includes('-embedded-thumb'));
                            const generated = data.parsedImages.find(img => {
                                const f = path.basename(img);
                                return f.endsWith('-thumb.png') &&
                                    f.toLowerCase().startsWith(currentBaseName.toLowerCase()) &&
                                    !f.includes('embedded');
                            });

                            if (embedded && generated) {
                                let preferred = null;
                                if (thumbnailStrategy === 'prefer-embedded') preferred = embedded;
                                else if (thumbnailStrategy === 'prefer-generated') preferred = generated;

                                // Force preferred to index 0
                                if (preferred && data.parsedImages[0] !== preferred) {
                                    const others = data.parsedImages.filter(img => img !== preferred);
                                    data.parsedImages = [preferred, ...others];
                                    proposal.modifications.push(`Strategized Thumbnail: Swapped to ${path.basename(preferred)} (Strategy: ${thumbnailStrategy})`);
                                    hasChanged = true;
                                }
                            }
                        }

                        let targetForPointer = thumbWebUrl; // Default to Generated
                        if (thumbnailStrategy === 'prefer-embedded') {
                            const embedded = data.parsedImages.find(img => img.includes('-embedded-thumb'));
                            if (embedded) targetForPointer = embedded;
                        }

                        const thumbIndex = data.parsedImages.indexOf(targetForPointer);
                        if (thumbIndex !== -1) {
                            const targetPointer = `parsed:${thumbIndex}`;
                            if (data.userDefined?.thumbnail !== targetPointer) {
                                proposal.additions.push(`Syncing thumbnail pointer to ${targetPointer} (${path.basename(targetForPointer)})`);
                                if (!data.userDefined) data.userDefined = { thumbnail: '', imageOrder: [], images: [] };
                                data.userDefined.thumbnail = targetPointer;
                                hasChanged = true;
                            }
                        }
                    }
                }

                // --- 8. FINAL SAVE ---
                const cleanPath = (p) => p ? p.replace(/\\/g, '/').replace(/\/+/g, '/').trim() : p;
                if (data.filePath !== cleanPath(data.filePath)) {
                    data.filePath = cleanPath(data.filePath);
                    data.modelUrl = cleanPath(data.modelUrl);
                    hasChanged = true;
                }

                if (hasChanged && !isDryRun) {
                    const backupPath = fullPath + '.bak';
                    fs.writeFileSync(backupPath, raw, 'utf8');
                    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
                    results.healed++;
                }

                if (proposal.additions.length > 0 || proposal.deletions.length > 0 || proposal.modifications.length > 0 || hasChanged) {
                    results.details.push(proposal);
                }
                results.processed++;

            } catch (err) {
                console.error(`   ❌ Error in ${entry.name}: ${err.message}`);
                results.errors.push({ file: entry.name, error: err.message });
            }
        } // End munchie loop

        for (const entry of entries) {
            if (entry.isDirectory()) {
                await processDir(path.join(dir, entry.name));
            }
        }
    } // End processDir

    const startDir = specificPath ? path.join(modelsDir, specificPath) : modelsDir;
    console.log(`🚀 Starting ${specificPath ? 'Micro' : 'Deep'} Heal at: ${startDir}`);

    await processDir(startDir);

    console.log(`✅ Heal Finished. Processed: ${results.processed}`);
    return results;
}

async function runRevertLogic() {
    const modelsDir = getAbsoluteModelsPath();
    const results = { restored: 0, errors: [] };

    async function revertDir(dir) {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await revertDir(fullPath);
            }
            else if (entry.name.endsWith('.json.bak')) {
                try {
                    const originalJsonPath = fullPath.replace('.bak', '');
                    // Restore the backup over the current file
                    fs.copyFileSync(fullPath, originalJsonPath);
                    // Delete the backup file
                    fs.unlinkSync(fullPath);
                    results.restored++;
                    console.log(`⏪ Restored: ${path.basename(originalJsonPath)}`);
                } catch (err) {
                    results.errors.push({ file: entry.name, error: err.message });
                }
            }
        }
    }

    console.log("⏪ Starting Library Revert...");
    await revertDir(modelsDir);
    return results;
}

// --- Routes ---

// POST /api/admin/library-heal-preview
router.post('/library-heal-preview', async (req, res) => {
    const { thumbnailStrategy } = req.body;
    console.log("➡️ API Request received: /api/admin/library-heal-preview", { thumbnailStrategy });
    try {
        const results = await runHealLogic(true, null, thumbnailStrategy);
        console.log("⬅️ HEAL PREVIEW COMPLETE. Found:", results.details.length, "changes.");
        res.json({ success: true, previewResults: results });
    } catch (err) {
        console.error("API ROUTE ERROR:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/library-heal
router.post('/library-heal', async (req, res) => {
    const { targetPath, thumbnailStrategy } = req.body;
    console.log(`➡️ API Request received: Library Heal ${targetPath ? `for ${targetPath}` : '(Full)'}`, { thumbnailStrategy });
    try {
        const results = await runHealLogic(false, targetPath, thumbnailStrategy);
        res.json({ success: true, results, message: "Heal applied successfully." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/library-revert
router.post('/library-revert', async (req, res) => {
    try {
        const results = await runRevertLogic();
        res.json({
            success: true,
            message: `Successfully reverted ${results.restored} models.`,
            results
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/library-check-backups
router.get('/library-check-backups', async (req, res) => {
    const modelsDir = getAbsoluteModelsPath();
    let hasBackups = false;
    const scanForBackups = (dir) => {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (scanForBackups(path.join(dir, entry.name))) return true;
                } else if (entry.name.endsWith('.json.bak')) {
                    hasBackups = true;
                    return true;
                }
            }
        } catch (e) { }
        return false;
    };
    scanForBackups(modelsDir);
    res.json({ hasBackups });
});

// GET /api/admin/migration-status
router.get('/migration-status', async (req, res) => {
    try {
        // 1. Get DB Stats
        // 1. Get DB Stats
        const prisma = require('../../server-utils/db'); // Lazy load
        const modelCount = await prisma.model.count();
        const collectionCount = await prisma.collection.count();

        // 2. Get File System Stats (Heuristic)
        // We assume "Legacy" means what's on disk.
        // Counting munchies is a good proxy for "known models"
        const modelsDir = getAbsoluteModelsPath();
        let munchieCount = 0;

        function countMunchies(dir) {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) countMunchies(path.join(dir, entry.name));
                else if (entry.name.endsWith('-munchie.json')) munchieCount++;
            }
        }
        countMunchies(modelsDir);

        res.json({
            success: true,
            db: {
                models: modelCount,
                files: 0, // Not tracking files strictly in this view yet
                collections: collectionCount
            },
            legacy: {
                models: munchieCount,
                files: 0
            },
            errors: []
        });
    } catch (err) {
        console.error("Migration Status Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/library-resync (read-only scan — compares filesystem vs Prisma DB)
router.post('/library-resync', async (req, res) => {
    try {
        const prisma = require('../../server-utils/db');
        const modelsDir = getAbsoluteModelsPath();

        if (!modelsDir || !fs.existsSync(modelsDir)) {
            return res.status(400).json({ success: false, error: 'Models directory not found' });
        }

        // ── 1. Scan filesystem recursively for model files ──
        const MODEL_EXTENSIONS = new Set(['.stl', '.3mf', '.obj', '.step', '.gcode', '.bgcode']);
        const diskFiles = new Map(); // relPath → { absPath, size, ext }

        function scanDir(dir) {
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (MODEL_EXTENSIONS.has(ext)) {
                        const relPath = path.relative(modelsDir, fullPath).replace(/\\/g, '/');
                        let size = 0;
                        try { size = fs.statSync(fullPath).size; } catch { }
                        diskFiles.set(relPath, { absPath: fullPath, size, ext });
                    }
                }
            }
        }
        scanDir(modelsDir);

        // ── 2. Query DB for all ModelFile records + Model.filePath ──
        const [dbFiles, dbModels] = await Promise.all([
            prisma.modelFile.findMany({ select: { id: true, filePath: true, modelId: true, filename: true } }),
            prisma.model.findMany({ select: { id: true, name: true, filePath: true } }),
        ]);

        // Build lookup sets
        const dbFilePathSet = new Set(dbFiles.map(f => f.filePath));
        const dbModelPathSet = new Set(dbModels.filter(m => m.filePath).map(m => m.filePath));

        // ── 3. Cross-reference: Orphans (on disk, no DB record) ──
        const orphans = [];
        for (const [relPath, info] of diskFiles) {
            if (!dbFilePathSet.has(relPath)) {
                // Also check if it matches a Model.filePath (some models use filePath as direct path)
                if (!dbModelPathSet.has(relPath)) {
                    orphans.push({
                        path: relPath,
                        size: info.size,
                        ext: info.ext,
                        sizeFormatted: info.size > 1048576
                            ? `${(info.size / 1048576).toFixed(1)} MB`
                            : `${(info.size / 1024).toFixed(1)} KB`,
                    });
                }
            }
        }

        // ── 4. Cross-reference: Ghosts (DB record, no file on disk) ──
        const ghosts = [];
        for (const dbFile of dbFiles) {
            const absPath = path.join(modelsDir, dbFile.filePath);
            if (!fs.existsSync(absPath)) {
                ghosts.push({
                    id: dbFile.id,
                    modelId: dbFile.modelId,
                    filePath: dbFile.filePath,
                    filename: dbFile.filename,
                });
            }
        }

        // ── 5. Cross-reference: Model path ghosts (Model.filePath missing on disk) ──
        const modelGhosts = [];
        for (const model of dbModels) {
            if (!model.filePath) continue;
            const absPath = path.join(modelsDir, model.filePath);
            if (!fs.existsSync(absPath)) {
                modelGhosts.push({
                    id: model.id,
                    name: model.name,
                    filePath: model.filePath,
                });
            }
        }

        res.json({
            success: true,
            stats: {
                totalDiskFiles: diskFiles.size,
                totalDbFiles: dbFiles.length,
                totalModels: dbModels.length,
                orphanCount: orphans.length,
                ghostCount: ghosts.length,
                modelGhostCount: modelGhosts.length,
            },
            orphans,
            ghosts,
            modelGhosts,
        });
    } catch (err) {
        console.error('Library Resync Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/resync-purge-ghosts (delete ghost ModelFile records that have no file on disk)
router.post('/resync-purge-ghosts', async (req, res) => {
    try {
        const prisma = require('../../server-utils/db');
        const { ids } = req.body; // Array of ModelFile IDs to delete
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No IDs provided' });
        }
        const result = await prisma.modelFile.deleteMany({ where: { id: { in: ids } } });
        res.json({ success: true, deleted: result.count });
    } catch (err) {
        console.error('Purge Ghosts Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/resync-purge-model-ghosts (delete Model records whose filePath points to missing files)
router.post('/resync-purge-model-ghosts', async (req, res) => {
    try {
        const prisma = require('../../server-utils/db');
        const { ids } = req.body; // Array of Model IDs to delete
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No IDs provided' });
        }
        const result = await prisma.model.deleteMany({ where: { id: { in: ids } } });
        res.json({ success: true, deleted: result.count });
    } catch (err) {
        console.error('Purge Model Ghosts Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/resync-link-orphans
// Links orphaned files to their parent models as ModelRelatedFile records.
// Matches orphan directory to Model's collection directory structure.
router.post('/resync-link-orphans', async (req, res) => {
    try {
        const prisma = require('../../server-utils/db');
        const modelsDir = getAbsoluteModelsPath();
        const { paths } = req.body; // Array of relative file paths (from orphan scan)

        if (!paths || !Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({ success: false, error: 'No paths provided' });
        }

        // Get all ModelFile records to find which model lives in which directory
        const allModelFiles = await prisma.modelFile.findMany({
            select: { filePath: true, modelId: true },
        });

        // Build a directory → modelId map
        // Each ModelFile.filePath like "CollectionA/ModelFolder/model.3mf"
        // We extract the directory part and map it to the modelId
        const dirToModelId = new Map();
        for (const mf of allModelFiles) {
            if (!mf.filePath) continue;
            const dir = mf.filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
            if (dir && !dirToModelId.has(dir)) {
                dirToModelId.set(dir, mf.modelId);
            }
        }

        let linked = 0;
        let skipped = 0;
        const errors = [];

        for (const orphanPath of paths) {
            const normalizedPath = orphanPath.replace(/\\/g, '/');
            const dir = normalizedPath.split('/').slice(0, -1).join('/');
            const modelId = dirToModelId.get(dir);

            if (!modelId) {
                skipped++;
                continue;
            }

            // Check if this related file already exists
            const existing = await prisma.modelRelatedFile.findFirst({
                where: { modelId, path: normalizedPath },
            });
            if (existing) {
                skipped++;
                continue;
            }

            try {
                await prisma.modelRelatedFile.create({
                    data: { modelId, path: normalizedPath },
                });
                linked++;
            } catch (e) {
                errors.push({ path: orphanPath, error: e.message });
            }
        }

        res.json({ success: true, linked, skipped, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
        console.error('Link Orphans Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/purge-thumbnails-preview (dry run — list files that would be deleted)
router.post('/purge-thumbnails-preview', async (req, res) => {
    try {
        const { only3mf = false } = req.body; // Extract flag
        const modelsDir = getAbsoluteModelsPath();

        // Define pattern based on flag
        const THUMB_PATTERN = only3mf
            ? /\.3mf-thumb\.png$/i
            : /\.(stl|3mf)-thumb\.png$/i;

        const files = [];
        let totalSize = 0;

        // ... (rest of logic handles filtering by pattern automatically)

        // Helper: check if a thumbnail's model has other images (embedded from .3mf)
        function checkForOtherImages(thumbFullPath) {
            // Derive the munchie path from the thumbnail path
            // e.g. "model.stl-thumb.png" -> model is "model.stl" -> munchie is "model-stl-munchie.json"
            // e.g. "model.3mf-thumb.png" -> model is "model.3mf" -> munchie is "model-munchie.json"
            const thumbName = path.basename(thumbFullPath); // e.g. "model.stl-thumb.png"
            const dir = path.dirname(thumbFullPath);

            // Strip "-thumb.png" to get the model filename
            const modelFile = thumbName.replace(/-thumb\.png$/i, ''); // e.g. "model.stl"

            // Derive munchie filename
            let munchiePath;
            if (/\.stl$/i.test(modelFile)) {
                munchiePath = path.join(dir, modelFile.replace(/\.stl$/i, '-stl-munchie.json'));
            } else if (/\.3mf$/i.test(modelFile)) {
                munchiePath = path.join(dir, modelFile.replace(/\.3mf$/i, '-munchie.json'));
            } else {
                return false;
            }

            try {
                // 1. Check sidecar JSON first (fastest)
                if (fs.existsSync(munchiePath)) {
                    const data = JSON.parse(fs.readFileSync(munchiePath, 'utf8'));

                    // Check parsedImages for non-thumb entries (these are embedded from .3mf)
                    const parsedNonThumb = (data.parsedImages || []).filter(img => !THUMB_PATTERN.test(img));
                    if (parsedNonThumb.length > 0) return true;

                    // Check images for non-thumb entries
                    const imagesNonThumb = (data.images || []).filter(img => !THUMB_PATTERN.test(img));
                    if (imagesNonThumb.length > 0) return true;
                }

                // 2. Deep Check: If it's a 3MF, does it HAVE an embedded thumbnail?
                // If so, that counts as "other image" (the source image)
                if (modelFile.toLowerCase().endsWith('.3mf')) {
                    const modelPath = path.join(dir, modelFile);
                    if (hasEmbeddedThumbnail(modelPath)) return true;
                }

                return false;
            } catch {
                return false;
            }
        }

        function scan(dir) {
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scan(full);
                } else if (THUMB_PATTERN.test(entry.name)) {
                    try {
                        const stat = fs.statSync(full);
                        const relPath = path.relative(modelsDir, full).replace(/\\/g, '/');
                        const hasOtherImages = checkForOtherImages(full);
                        files.push({
                            path: relPath,
                            absPath: full,
                            name: entry.name,
                            size: stat.size,
                            hasOtherImages
                        });
                        totalSize += stat.size;
                    } catch { /* skip unreadable files */ }
                }
            }
        }
        scan(modelsDir);

        const withOtherImages = files.filter(f => f.hasOtherImages).length;
        const withoutOtherImages = files.length - withOtherImages;

        res.json({
            success: true,
            files: files.map(f => ({ path: f.path, name: f.name, size: f.size, hasOtherImages: f.hasOtherImages })),
            totalCount: files.length,
            totalSize,
            withOtherImages,
            withoutOtherImages
        });
    } catch (error) {
        console.error('Purge preview error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/admin/purge-thumbnails (execute deletion)
router.post('/purge-thumbnails', async (req, res) => {
    try {
        const { skipWithoutOtherImages = false, only3mf = false } = req.body || {};
        const modelsDir = getAbsoluteModelsPath();

        // Define pattern based on flag
        const THUMB_PATTERN = only3mf
            ? /\.3mf-thumb\.png$/i
            : /\.(stl|3mf)-thumb\.png$/i;

        let deleted = 0;
        let skipped = 0;
        const errors = [];


        // Helper: check if a thumbnail's model has other images
        function checkForOtherImages(thumbFullPath) {
            const thumbName = path.basename(thumbFullPath);
            const dir = path.dirname(thumbFullPath);
            const modelFile = thumbName.replace(/-thumb\.png$/i, '');
            let munchiePath;
            if (/\.stl$/i.test(modelFile)) {
                munchiePath = path.join(dir, modelFile.replace(/\.stl$/i, '-stl-munchie.json'));
            } else if (/\.3mf$/i.test(modelFile)) {
                munchiePath = path.join(dir, modelFile.replace(/\.3mf$/i, '-munchie.json'));
            } else {
                return false;
            }

            try {
                // 1. Check sidecar JSON first (fastest)
                if (fs.existsSync(munchiePath)) {
                    const data = JSON.parse(fs.readFileSync(munchiePath, 'utf8'));
                    const parsedNonThumb = (data.parsedImages || []).filter(img => !THUMB_PATTERN.test(img));
                    if (parsedNonThumb.length > 0) return true;
                    const imagesNonThumb = (data.images || []).filter(img => !THUMB_PATTERN.test(img));
                    if (imagesNonThumb.length > 0) return true;
                }

                // 2. Deep Check: If it's a 3MF, does it HAVE an embedded thumbnail?
                if (modelFile.toLowerCase().endsWith('.3mf')) {
                    const modelPath = path.join(dir, modelFile);
                    if (hasEmbeddedThumbnail(modelPath)) return true;
                }

                return false;
            } catch {
                return false;
            }
        }

        // Re-scan to get fresh list (don't trust client-provided paths)
        const thumbFiles = [];
        function scan(dir) {
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scan(full);
                } else if (THUMB_PATTERN.test(entry.name)) {
                    try {
                        const hasOtherImages = checkForOtherImages(full);
                        // FIX: Delete if it HAS other images (safe) OR if we are forced to delete lone images
                        if (hasOtherImages || !skipWithoutOtherImages) {
                            fs.unlinkSync(full);
                            deleted++;
                        } else {
                            skipped++;
                        }
                    } catch (err) {
                        errors.push({ file: full, error: err.message });
                    }
                }
            }
        }
        scan(modelsDir);

        // Clean thumbnail references from munchie files (only for actually deleted thumbs)
        let munchiesCleaned = 0;
        function cleanMunchies(dir) {
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    cleanMunchies(full);
                } else if (entry.name.endsWith('-munchie.json') && !entry.name.endsWith('.bak')) {
                    try {
                        const raw = fs.readFileSync(full, 'utf8');
                        const data = JSON.parse(raw);
                        let changed = false;

                        // Remove thumb refs from parsedImages (only if the actual thumb file is gone)
                        if (Array.isArray(data.parsedImages)) {
                            const before = data.parsedImages.length;
                            data.parsedImages = data.parsedImages.filter(img => {
                                if (!THUMB_PATTERN.test(img)) return true;
                                // Check if the referenced thumb file still exists on disk
                                const cleanRel = img.replace(/^\/models\//, '').replace(/^models\//, '');
                                const absImgPath = path.join(modelsDir, cleanRel);
                                return fs.existsSync(absImgPath);
                            });
                            if (data.parsedImages.length !== before) changed = true;
                        }

                        // Remove thumb refs from images
                        if (Array.isArray(data.images)) {
                            const before = data.images.length;
                            data.images = data.images.filter(img => {
                                if (!THUMB_PATTERN.test(img)) return true;
                                const cleanRel = img.replace(/^\/models\//, '').replace(/^models\//, '');
                                const absImgPath = path.join(modelsDir, cleanRel);
                                return fs.existsSync(absImgPath);
                            });
                            if (data.images.length !== before) changed = true;
                        }

                        // Reset thumbnail pointer if it referenced a parsed image we removed
                        if (changed && data.userDefined?.thumbnail?.startsWith('parsed:')) {
                            const idx = parseInt(data.userDefined.thumbnail.split(':')[1], 10);
                            if (isNaN(idx) || idx >= (data.parsedImages?.length || 0)) {
                                data.userDefined.thumbnail = undefined;
                                data.userDefined.imageOrder = [];
                            }
                        }

                        if (changed) {
                            fs.writeFileSync(full, JSON.stringify(data, null, 2));
                            munchiesCleaned++;
                        }
                    } catch { /* skip */ }
                }
            }
        }
        cleanMunchies(modelsDir);

        console.log(`🧹 Purged ${deleted} generated thumbnails (skipped ${skipped}), cleaned ${munchiesCleaned} munchie files.`);
        res.json({ success: true, deleted, skipped, munchiesCleaned, errors });
    } catch (error) {
        console.error('Purge error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/admin/generate-thumbnails
let activeThumbnailJob = null;
let activeThumbnailStatus = { total: 0, current: 0, status: 'idle', startTime: null };

// GET /api/admin/thumbnail-status
router.get('/thumbnail-status', (req, res) => {
    res.json(activeThumbnailStatus);
});

router.post('/generate-thumbnails', async (req, res) => {
    if (activeThumbnailJob) {
        activeThumbnailJob.abort();
    }
    activeThumbnailJob = new AbortController();
    const signal = activeThumbnailJob.signal;

    try {
        const { modelIds, force = false } = req.body;
        const modelsDir = getAbsoluteModelsPath();
        // Assume port 3001 or standard PORT env (legacy used explicit port)
        const PORT = process.env.PORT || 3001;
        const baseUrl = `http://127.0.0.1:${PORT}`;

        if (!generateThumbnail) {
            return res.status(500).json({ success: false, error: "Thumbnail generator not available" });
        }

        const config = ConfigManager.loadConfig();
        const globalDefaultColor = config?.settings?.defaultModelColor || config?.defaultModelColor || '#6366f1';



        let processed = 0;
        let errors = [];
        let skipped = 0;
        let targets = [];

        // Reset Status
        activeThumbnailStatus = { total: 0, current: 0, status: 'scanning', startTime: Date.now() };

        function findTargets(dir) {
            if (signal.aborted) return;
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { }
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    findTargets(fullPath);
                } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                    try {
                        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        if (modelIds && modelIds.length > 0 && !modelIds.includes(data.id)) continue;
                        let sourceFile;
                        if (entry.name.endsWith('-stl-munchie.json')) {
                            sourceFile = fullPath.replace('-stl-munchie.json', '.stl');
                            if (!fs.existsSync(sourceFile)) sourceFile = fullPath.replace('-stl-munchie.json', '.STL');
                        } else {
                            sourceFile = fullPath.replace('-munchie.json', '.3mf');
                        }
                        if (fs.existsSync(sourceFile)) {
                            targets.push({ jsonPath: fullPath, sourcePath: sourceFile, data });
                        }
                    } catch (e) { }
                }
            }
        }
        findTargets(modelsDir);

        // Update Status with Total
        activeThumbnailStatus.total = targets.length;
        activeThumbnailStatus.status = 'generating';

        console.log(`📸 Starting photo shoot for ${targets.length} models...`);
        const MAX_CONSECUTIVE_ERRORS = 5;
        let consecutiveErrors = 0;

        for (const target of targets) {
            if (signal.aborted) {
                console.log('🛑 Job aborted by user.');
                break;
            }
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.warn(`🚨 Aborting thumbnail generation: ${MAX_CONSECUTIVE_ERRORS} consecutive errors detected.`);
                break;
            }
            try {
                const thumbName = path.basename(target.sourcePath) + '-thumb.png';
                const thumbPath = path.join(path.dirname(target.sourcePath), thumbName);
                const relativeThumbUrl = '/models/' + path.relative(modelsDir, thumbPath).replace(/\\/g, '/');

                if (fs.existsSync(thumbPath) && !force) {
                    skipped++;
                    continue;
                }

                const modelColor = target.data.userDefined?.color || target.data.color || globalDefaultColor;
                await generateThumbnail(target.sourcePath, thumbPath, baseUrl, modelColor, modelsDir, signal);

                let json = target.data;
                let changed = false;
                if (!json.images) json.images = [];
                if (!json.images.includes(relativeThumbUrl)) {
                    json.images.unshift(relativeThumbUrl);
                    changed = true;
                }
                if (changed) {
                    fs.writeFileSync(target.jsonPath, JSON.stringify(json, null, 2));
                }
                processed++;
                activeThumbnailStatus.current = processed; // Update Progress
                consecutiveErrors = 0;
            } catch (err) {
                if (err.message && err.message.includes('cancelled')) break;
                console.error("Thumbnail error:", err);
                errors.push({ id: target.data.id, error: err.message });
                consecutiveErrors++;
            }
        }

        activeThumbnailJob = null;
        activeThumbnailStatus.status = 'idle';
        res.json({
            success: true,
            processed,
            skipped,
            errors,
            aborted: signal.aborted || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
        });

    } catch (error) {
        activeThumbnailJob = null;
        activeThumbnailStatus.status = 'error';
        console.error('General generation error:', error);
        if (error.message && error.message.includes('cancelled')) {
            return res.json({ success: false, aborted: true, message: 'Cancelled by user' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/admin/cancel-thumbnails
router.post('/cancel-thumbnails', (req, res) => {
    if (activeThumbnailJob) {
        activeThumbnailJob.abort();
        activeThumbnailJob = null;
        activeThumbnailStatus.status = 'cancelled';
        return res.json({ success: true, message: 'Job Cancelled' });
    }
    res.json({ success: false, message: 'No active job' });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB-FIRST BACKUP / RESTORE
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/admin/backup-db
// Exports the entire Prisma database as a downloadable JSON snapshot.
// Includes: models (with files, tags, images, relatedFiles), collections.
router.post('/backup-db', async (req, res) => {
    try {
        const prisma = require('../../server-utils/db');

        const [models, collections] = await Promise.all([
            prisma.model.findMany({
                include: {
                    files: true,
                    tags: { include: { tag: true } }, // need tag.name for restore-by-name
                    images: true,
                    relatedFiles: true,
                }
            }),
            prisma.collection.findMany({
                include: { children: false } // flat export — tree is reconstructed via parentId
            })
        ]);

        const backup = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            counts: { models: models.length, collections: collections.length },
            models,
            collections,
        };

        const dateStr = new Date().toISOString().slice(0, 10);

        // Include library name in backup filename if configured
        let librarySlug = '';
        try {
            const configHelper = require('../../server-utils/configHelper');
            const appConfig = configHelper.readConfig();
            const name = appConfig?.settings?.libraryName?.trim();
            if (name) {
                librarySlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-';
            }
        } catch { /* non-critical — skip slug on error */ }

        const filename = `${librarySlug}db-backup-${dateStr}.json`;

        // Use a BigInt-safe serializer — Prisma/SQLite may return BigInt for some fields
        const safeJson = JSON.stringify(backup, (_key, value) =>
            typeof value === 'bigint' ? Number(value) : value
        );
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(safeJson);
    } catch (error) {
        console.error('[DB Admin] backup-db error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/admin/restore-db
// Restores models and collections from a JSON backup.
// Body (multipart): backupFile (JSON file), strategy ('merge' | 'replace')
// merge  → upsert by ID; existing records not in backup are kept
// replace → delete all records, then insert backup data (DESTRUCTIVE)
const multer = require('multer');
const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
router.post('/restore-db', restoreUpload.single('backupFile'), async (req, res) => {
    try {
        const prisma = require('../../server-utils/db');
        const strategy = req.body?.strategy || 'merge';

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No backup file uploaded' });
        }

        let backup;
        try {
            backup = JSON.parse(req.file.buffer.toString('utf8'));
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid JSON backup file' });
        }

        if (!backup.models || !backup.collections) {
            return res.status(400).json({ success: false, error: 'Backup file missing models or collections' });
        }

        let restored = 0;
        let skipped = 0;
        const errors = [];

        if (strategy === 'replace') {
            // Destructive: clear all existing data first
            await prisma.modelFile.deleteMany({});
            await prisma.modelTag.deleteMany({});
            await prisma.modelImage.deleteMany({});
            await prisma.relatedFile.deleteMany({});
            await prisma.model.deleteMany({});
            await prisma.collection.deleteMany({});
        }

        // Restore collections first (models reference collectionId)
        let restoredModels = 0;
        let restoredCollections = 0;
        for (const col of backup.collections || []) {
            try {
                await prisma.collection.upsert({
                    where: { id: col.id },
                    update: { name: col.name, description: col.description, parentId: col.parentId },
                    create: { id: col.id, name: col.name, description: col.description, parentId: col.parentId }
                });
                restoredCollections++;
                restored++;
            } catch (err) {
                errors.push({ id: col.id, type: 'collection', error: err.message });
                skipped++;
            }
        }

        // Restore models
        for (const model of backup.models || []) {
            try {
                const { files, tags, images, relatedFiles, ...modelData } = model;

                await prisma.model.upsert({
                    where: { id: modelData.id },
                    update: modelData,
                    create: modelData
                });

                if (strategy === 'merge') {
                    // ── TRUE MERGE ────────────────────────────────────────────────────────
                    // Upsert each relation record by its stable ID.
                    // Relations in the DB that are NOT in the backup are left untouched.
                    // This is safe — no data loss for changes made since the backup.

                    for (const f of (files || [])) {
                        const { modelId: _m, model: _mo, ...data } = f;
                        await prisma.modelFile.upsert({
                            where: { id: data.id },
                            update: { ...data, modelId: modelData.id },
                            create: { ...data, modelId: modelData.id }
                        });
                    }

                    for (const i of (images || [])) {
                        const { modelId: _m, model: _mo, ...data } = i;
                        await prisma.modelImage.upsert({
                            where: { id: data.id },
                            update: { ...data, modelId: modelData.id },
                            create: { ...data, modelId: modelData.id }
                        });
                    }

                    for (const r of (relatedFiles || [])) {
                        const { modelId: _m, model: _mo, ...data } = r;
                        await prisma.modelRelatedFile.upsert({
                            where: { id: data.id },
                            update: { ...data, modelId: modelData.id },
                            create: { ...data, modelId: modelData.id }
                        });
                    }

                } else {
                    // ── REPLACE (within model scope) ─────────────────────────────────────
                    // Delete all existing relations for THIS model, then bulk-insert from backup.
                    // (The parent replace already wiped the whole DB above — this path handles
                    //  any records that were added after the wipe by concurrent processes.)

                    if (files?.length) {
                        await prisma.modelFile.deleteMany({ where: { modelId: modelData.id } });
                        await prisma.modelFile.createMany({
                            data: files.map(({ modelId: _m, model: _mo, ...f }) => ({ ...f, modelId: modelData.id }))
                        });
                    }
                    if (images?.length) {
                        await prisma.modelImage.deleteMany({ where: { modelId: modelData.id } });
                        await prisma.modelImage.createMany({
                            data: images.map(({ modelId: _m, model: _mo, ...i }) => ({ ...i, modelId: modelData.id }))
                        });
                    }
                    if (relatedFiles?.length) {
                        await prisma.modelRelatedFile.deleteMany({ where: { modelId: modelData.id } });
                        await prisma.modelRelatedFile.createMany({
                            data: relatedFiles.map(({ modelId: _m, model: _mo, ...r }) => ({ ...r, modelId: modelData.id }))
                        });
                    }
                }

                // ── Tags (both strategies) ────────────────────────────────────────────
                // Tags use a join table keyed by auto-increment tagId — must upsert by name.
                // Merge: adds tags from backup without removing existing ones.
                // Replace: clears existing tags first, then re-adds from backup.
                if (tags?.length) {
                    if (strategy === 'replace') {
                        await prisma.modelTag.deleteMany({ where: { modelId: modelData.id } });
                    }

                    for (const tagRecord of tags) {
                        const tagName = tagRecord.tag?.name;
                        if (!tagName) continue;

                        const tag = await prisma.tag.upsert({
                            where: { name: tagName },
                            update: {},
                            create: { name: tagName }
                        });

                        await prisma.modelTag.upsert({
                            where: { modelId_tagId: { modelId: modelData.id, tagId: tag.id } },
                            update: {},
                            create: { modelId: modelData.id, tagId: tag.id }
                        });
                    }
                }

                restoredModels++;
                restored++;
            } catch (err) {
                errors.push({ id: model.id, type: 'model', error: err.message });
                skipped++;
            }
        }

        console.log(`[DB Admin] restore-db complete: collections=${restoredCollections}, models=${restoredModels}, skipped=${skipped}, errors=${errors.length}`);
        return res.json({
            success: true,
            strategy,
            restored,
            restoredModels,
            restoredCollections,
            skipped,
            errors: errors.slice(0, 20),
            summary: `Restored ${restoredModels} models and ${restoredCollections} collections (${skipped} skipped)`
        });
    } catch (error) {
        console.error('[DB Admin] restore-db error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

