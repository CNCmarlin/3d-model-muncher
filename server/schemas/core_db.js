const { z } = require('zod');

/**
 * Core Schema Primitives (JavaScript/CommonJS version)
 * Reusable Zod schemas for common types used across the application
 */

// --- ID Types ---
const IdSchema = z.string().min(1, 'ID cannot be empty');
const CuidSchema = z.string().cuid('Invalid CUID format');
const OptionalIdSchema = z.string().optional();

// --- Path Types ---
const FilePathSchema = z.string().min(1, 'File path cannot be empty');
const RelativePathSchema = z.string();
const PathHashSchema = z.string().optional();

// --- Timestamp Types ---
const TimestampSchema = z.coerce.date();
const ISODateStringSchema = z.string().datetime();

// --- Numeric Constraints ---
const PositiveIntSchema = z.number().int().positive();
const NonNegativeIntSchema = z.number().int().min(0);
const PositiveFloatSchema = z.number().positive();
const NonNegativeFloatSchema = z.number().min(0);

// --- Query Parameter Numeric (Coerced from strings) ---
const QueryIntSchema = z.coerce.number().int().min(0);
const QueryBooleanSchema = z.coerce.boolean();


// --- String Constraints ---
const NonEmptyStringSchema = z.string().min(1, 'Cannot be empty');
const OptionalStringSchema = z.string().optional();
const NullableStringSchema = z.string().nullable();
const UrlSchema = z.string().url('Invalid URL format');

// --- Array Constraints ---
const StringArraySchema = z.array(z.string());
const NonEmptyStringArraySchema = z.array(z.string()).min(1, 'Array cannot be empty');

// --- Boolean ---
const BooleanSchema = z.boolean();
const OptionalBooleanSchema = z.boolean().optional();

// --- Enums ---
const FileTypeEnum = z.enum(['stl', '3mf', 'obj', 'gcode', 'image', 'other']);
const PrintStatusEnum = z.enum(['not_printed', 'printed', 'failed']);

// --- Common Metadata ---
const MetadataJsonSchema = z.string().optional();

// --- API Response Envelope ---
const ApiResponseSchema = (dataSchema) =>
    z.object({
        success: z.boolean(),
        data: dataSchema.optional(),
        error: z.string().optional(),
        message: z.string().optional(),
    });

// --- Pagination Schema ---
const PaginationSchema = z.object({
    page: NonNegativeIntSchema.default(0),
    limit: PositiveIntSchema.default(50),
    total: NonNegativeIntSchema.optional(),
});

// --- Common Query Filters ---
const CommonFiltersSchema = z.object({
    search: OptionalStringSchema,
    tags: z.union([z.string(), z.array(z.string())]).transform(val =>
        Array.isArray(val) ? val : (val ? [val] : [])
    ).optional(), // Handle ?tags=foo&tags=bar AND ?tags=foo
    collectionId: OptionalStringSchema,
    isPrinted: QueryBooleanSchema.optional(),
    isFavorite: QueryBooleanSchema.optional(),
    isDeleted: QueryBooleanSchema.default(false),
    isComponent: QueryBooleanSchema.optional(), // New: Filter by component status
});

// --- Sort Options ---
const SortOrderEnum = z.enum(['asc', 'desc']);
const SortByEnum = z.enum(['name', 'createdAt', 'updatedAt', 'printTime', 'filamentUsage']);

const SortOptionsSchema = z.object({
    // Allow 'none' or empty string and transform to undefined
    sortBy: z.union([
        SortByEnum,
        z.literal('none'),
        z.literal(''),
        z.null(),
        z.undefined()
    ]).transform(val => (val === 'none' || val === '' ? undefined : val)),
    sortOrder: SortOrderEnum.default('asc'),
});

// --- Generic response with pagination ---
const PaginatedResponseSchema = (itemSchema) =>
    z.object({
        success: z.boolean(),
        data: z.array(itemSchema),
        pagination: PaginationSchema,
        error: z.string().optional(),
    });

module.exports = {
    IdSchema,
    CuidSchema,
    OptionalIdSchema,
    FilePathSchema,
    RelativePathSchema,
    PathHashSchema,
    TimestampSchema,
    ISODateStringSchema,
    PositiveIntSchema,
    NonNegativeIntSchema,
    PositiveFloatSchema,
    NonNegativeFloatSchema,
    QueryIntSchema,
    QueryBooleanSchema,
    NonEmptyStringSchema,
    OptionalStringSchema,
    NullableStringSchema,
    UrlSchema,
    StringArraySchema,
    NonEmptyStringArraySchema,
    BooleanSchema,
    OptionalBooleanSchema,
    FileTypeEnum,
    PrintStatusEnum,
    MetadataJsonSchema,
    ApiResponseSchema,
    PaginationSchema,
    CommonFiltersSchema,
    SortOrderEnum,
    SortByEnum,
    SortOptionsSchema,
    PaginatedResponseSchema,
};
