const { z } = require('zod');
const {
    IdSchema,
    CuidSchema,
    NonEmptyStringSchema,
    OptionalStringSchema,
    BooleanSchema,
    TimestampSchema,
    PathHashSchema,
    ApiResponseSchema,
    StringArraySchema,
} = require('./core_db');

// Base Collection schema
const CollectionSchema = z.object({
    id: CuidSchema,
    name: NonEmptyStringSchema,
    parentId: IdSchema.nullable().optional(),
    path: OptionalStringSchema,
    description: OptionalStringSchema,
    coverImage: OptionalStringSchema, // Legacy/Frontend
    coverImagePath: OptionalStringSchema, // DB field
    pathHash: PathHashSchema,
    modelIds: z.array(IdSchema).default([]),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    models: z.array(z.any()).optional(),
    children: z.array(z.any()).optional(),
    parent: z.any().optional(),

    // DB Specific fields
    category: OptionalStringSchema,
    type: z.enum(['standard', 'project']).optional().default('standard'),
    metadata: z.string().optional(), // JSON string for buildPlates etc

    _count: z.object({
        models: z.number(),
    }).optional(),
});

// Collection Form Schema
const CollectionFormSchema = z.object({
    name: NonEmptyStringSchema,
    parentId: IdSchema.nullable().optional(),
    description: OptionalStringSchema,
    coverImage: OptionalStringSchema,
    modelIds: StringArraySchema.optional(),
    // DB Specific
    createOnDisk: BooleanSchema.optional(),
    type: z.enum(['standard', 'project']).optional(),
    category: OptionalStringSchema,
});

// Collection Update Schema
const CollectionUpdateSchema = z.object({
    id: CuidSchema,
    name: NonEmptyStringSchema.optional(),
    parentId: IdSchema.nullable().optional(),
    description: OptionalStringSchema,
    coverImage: OptionalStringSchema,
    modelIds: StringArraySchema.optional(),
    // DB Specific update fields
    category: OptionalStringSchema,
    type: z.enum(['standard', 'project']).optional(),
});

// Move Collection Schema
const MoveCollectionSchema = z.object({
    collectionId: CuidSchema,
    newParentId: IdSchema.nullable(),
});

// Collection Query Schema
const CollectionQuerySchema = z.object({
    parentId: IdSchema.nullable().optional(),
    includeModels: BooleanSchema.default(false),
    includeChildren: BooleanSchema.default(false),
    includeCount: BooleanSchema.default(true),
    flattenHierarchy: BooleanSchema.default(false),
});

// API Response Schemas
const CollectionResponseSchema = ApiResponseSchema(CollectionSchema);
const CollectionsListResponseSchema = ApiResponseSchema(z.array(CollectionSchema));

// Collection Tree Node (recursive)
const CollectionTreeNodeSchema = z.lazy(() =>
    CollectionSchema.extend({
        children: z.array(CollectionTreeNodeSchema).optional(),
    })
);

module.exports = {
    CollectionSchema,
    CollectionFormSchema,
    CollectionUpdateSchema,
    MoveCollectionSchema,
    CollectionQuerySchema,
    CollectionResponseSchema,
    CollectionsListResponseSchema,
    CollectionTreeNodeSchema,
};
