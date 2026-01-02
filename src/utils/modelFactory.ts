import { Model } from '../types/model';

/**
 * The "Single Source of Truth" for creating model identities.
 * Use this in Importers, manual uploads, and promotion logic.
 */
export function createStandardModelIdentity(overrides: Partial<Model>): Model {
    const description = overrides.description || "";
    const name = overrides.name || "New_Project";
    
    return {
        id: crypto.randomUUID(),
        name,
        filePath: "",
        modelUrl: "",
        fileSize: "0",
        description,
        category: "Uncategorized",
        tags: [],
        isPrinted: false,
        printTime: "",
        filamentUsed: "",
        license: "Unknown",
        source: "",
        designer: "Unknown",
        printSettings: {
            layerHeight: "",
            infill: "",
            nozzle: "",
            material: "",
            printer: ""
        },
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        parsedImages: [],
        related_files: [],
        hidden: false,
        isRelatedPart: false,
        price: 0,
        userDefined: {
            thumbnail: "parsed:0",
            imageOrder: [],
            description,
            images: []
        },
        ...overrides // Apply specific data (IDs, Paths, etc.)
    } as Model;
}