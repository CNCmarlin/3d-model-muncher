const { z } = require('zod');
const {
    IdSchema,
    CuidSchema,
    NonEmptyStringSchema,
    OptionalStringSchema,
    NonNegativeIntSchema,
    NonNegativeFloatSchema,
    BooleanSchema,
    QueryIntSchema,
    QueryBooleanSchema,
    PathHashSchema,
    TimestampSchema,
    MetadataJsonSchema,
    StringArraySchema,
    ApiResponseSchema,
    PaginatedResponseSchema,
    CommonFiltersSchema,
    SortOptionsSchema,
} = require('./core_db');

// Base Model schema
const ModelSchema = z.object({
    id: CuidSchema,
    collectionId: IdSchema,
    name: NonEmptyStringSchema,
    description: OptionalStringSchema,
    license: OptionalStringSchema,
    printTime: NonNegativeIntSchema.nullable().optional(),
    filamentUsage: NonNegativeFloatSchema.nullable().optional(),
    isPrinted: BooleanSchema.default(false),
    isFavorite: BooleanSchema.default(false),
    isDeleted: BooleanSchema.default(false),
    designer: OptionalStringSchema,
    source: OptionalStringSchema,
    notes: OptionalStringSchema,
    // Promoted from metadata (Batch 1)
    category: OptionalStringSchema,
    modelUrl: OptionalStringSchema,
    price: NonNegativeFloatSchema.nullable().optional(),
    // Promoted from metadata (Batch 2 - print settings)
    layerHeight: OptionalStringSchema,
    infill: OptionalStringSchema,
    nozzle: OptionalStringSchema,
    printer: OptionalStringSchema,
    material: OptionalStringSchema,
    fileSize: OptionalStringSchema,
    // Promoted from metadata (Batch 3 - G-code Analysis)
    gcodeFilePath: OptionalStringSchema,
    gcodePrintTime: OptionalStringSchema,
    gcodeTotalWeight: OptionalStringSchema,
    gcodeFilaments: OptionalStringSchema,

    pathHash: PathHashSchema,
    thumbnailPath: OptionalStringSchema,
    filePath: OptionalStringSchema,
    metadata: MetadataJsonSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    files: z.array(z.any()).optional(),
    tags: z.array(z.any()).optional(),
    collection: z.any().optional(),
});

// Model Form Schema
const ModelFormSchema = z.object({
    name: NonEmptyStringSchema,
    description: OptionalStringSchema,
    license: OptionalStringSchema,
    printTime: NonNegativeIntSchema.nullable().optional(),
    filamentUsage: NonNegativeFloatSchema.nullable().optional(),
    isPrinted: BooleanSchema.optional(),
    isFavorite: BooleanSchema.optional(),
    // Promoted from metadata (Batch 1)
    category: OptionalStringSchema,
    modelUrl: OptionalStringSchema,
    price: NonNegativeFloatSchema.nullable().optional(),
    // Promoted from metadata (Batch 2 - print settings)
    layerHeight: OptionalStringSchema,
    infill: OptionalStringSchema,
    nozzle: OptionalStringSchema,
    printer: OptionalStringSchema,
    material: OptionalStringSchema,
    fileSize: OptionalStringSchema,
    // Promoted from metadata (Batch 3 - G-code Analysis)
    gcodeFilePath: OptionalStringSchema,
    gcodePrintTime: OptionalStringSchema,
    gcodeTotalWeight: OptionalStringSchema,
    gcodeFilaments: OptionalStringSchema,

    tags: StringArraySchema.optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

// Model Update Schema (for PATCH - all fields optional, id comes from route param)
// Uses coercion for numeric fields to handle string inputs from frontend
const ModelUpdateSchema = z.object({
    name: NonEmptyStringSchema.optional(),
    description: z.string().nullable().optional(),  // Can be null or undefined
    license: z.string().nullable().optional(),       // Can be null or undefined
    designer: z.string().nullable().optional(),      // Can be null or undefined
    printTime: z.union([z.number(), z.string()]).nullable().optional(),
    filamentUsage: z.union([z.number(), z.string()]).nullable().optional(),
    isPrinted: BooleanSchema.optional(),
    isFavorite: BooleanSchema.optional(),
    isDeleted: BooleanSchema.optional(),
    isHidden: BooleanSchema.optional(),
    isComponent: BooleanSchema.optional(),
    tags: StringArraySchema.optional(),
    // Fields stored in metadata JSON
    category: OptionalStringSchema,
    price: z.number().nullable().optional(),
    source: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    filePath: z.string().nullable().optional(),
    // Batch 2: Flat print setting columns
    layerHeight: OptionalStringSchema,
    infill: OptionalStringSchema,
    nozzle: OptionalStringSchema,
    printer: OptionalStringSchema,
    material: OptionalStringSchema,
    fileSize: OptionalStringSchema,
    // Batch 3: Flat G-code data columns
    gcodeFilePath: OptionalStringSchema,
    gcodePrintTime: OptionalStringSchema,
    gcodeTotalWeight: OptionalStringSchema,
    gcodeFilaments: OptionalStringSchema,
    // gcodeData group still accepted for backward compat (exploded in service layer)
    gcodeData: z.object({
        gcodeFilePath: OptionalStringSchema,
        printTime: OptionalStringSchema,
        totalFilamentWeight: OptionalStringSchema,
        filaments: z.array(z.any()).optional(),
    }).optional(),

    // printSettings group still accepted for backward compat (exploded in service layer)
    printSettings: z.object({
        layerHeight: OptionalStringSchema,
        infill: OptionalStringSchema,
        nozzle: OptionalStringSchema,
        printer: OptionalStringSchema,
        material: OptionalStringSchema,
    }).optional(),
    // Metadata: accept either object or JSON string, transform to object
    metadata: z.union([
        z.record(z.string(), z.any()),
        z.string().transform(str => JSON.parse(str))
    ]).optional(),

    // Legacy support for userDefined wrapper
    userDefined: z.record(z.string(), z.any()).optional(),

    // Legacy relation wrapper from ModelEdit hook
    related_files: z.array(z.string()).optional(),
});

// Model Query Schema (uses coerced types for URL query parameters)
const ModelQuerySchema = CommonFiltersSchema.merge(SortOptionsSchema).extend({
    includeFiles: QueryBooleanSchema.default(true), // CRITICAL: Frontend adapter needs files for modelUrl
    includeTags: QueryBooleanSchema.default(true), // Frontend adapter needs tags for display
    includeCollection: QueryBooleanSchema.default(false),
    page: QueryIntSchema.default(0),
    limit: QueryIntSchema.default(10000), // High default to match legacy
    ids: z.union([z.string(), z.array(z.string())]).optional().transform(val => {
        if (!val) return undefined;
        if (Array.isArray(val)) return val;
        return val.includes(',') ? val.split(',') : [val];
    }),
});

// Bulk Edit Schema
const BulkEditSchema = z.object({
    modelIds: z.array(IdSchema).min(1, 'Must provide at least one model ID'),
    updates: z.object({
        category: NonEmptyStringSchema.optional(),
        license: OptionalStringSchema,
        designer: OptionalStringSchema,
        description: OptionalStringSchema,
        notes: OptionalStringSchema,
        source: OptionalStringSchema,
        price: NonNegativeFloatSchema.nullable().optional(),
        printTime: NonNegativeIntSchema.nullable().optional(),
        filamentUsage: NonNegativeFloatSchema.nullable().optional(),
        isPrinted: BooleanSchema.optional(),
        isFavorite: BooleanSchema.optional(),
        hidden: BooleanSchema.optional(),
        collectionId: z.string().nullable().optional(),
        moveFiles: BooleanSchema.optional(),
        printSettings: z.object({
            layerHeight: OptionalStringSchema,
            infill: OptionalStringSchema,
            nozzle: OptionalStringSchema,
            printer: OptionalStringSchema,
            material: OptionalStringSchema,
        }).optional(),
        tags: z.object({
            add: StringArraySchema.optional(),
            remove: StringArraySchema.optional(),
        }).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
    }),
});

// API Response Schemas
const ModelResponseSchema = ApiResponseSchema(ModelSchema);
const ModelsListResponseSchema = PaginatedResponseSchema(ModelSchema);

// Model Search Schema
const ModelSearchSchema = z.object({
    query: NonEmptyStringSchema,
    filters: CommonFiltersSchema.optional(),
    limit: NonNegativeIntSchema.default(20),
});

module.exports = {
    ModelSchema,
    ModelFormSchema,
    ModelUpdateSchema,
    ModelQuerySchema,
    BulkEditSchema,
    ModelResponseSchema,
    ModelsListResponseSchema,
    ModelSearchSchema,
};
