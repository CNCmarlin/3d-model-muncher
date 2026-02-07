// server-utils/modelUtils.js

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

module.exports = {
    createInitialModelMetadata
};
