# 🌉 Schema Bridge: The Zod Truth

> **Goal**: Define the "One True Validation Layer" shared between Backend (API/DB) and Frontend (Forms/React Query).
> **Principle**: `Runtime Validation > Compile Time Trust`.

---

## 🏗️ 1. Core Primitives (`schemas/core.ts`)
*Shared types used everywhere.*

```typescript
import { z } from 'zod';

export const ID = z.number().int().positive();
export const Path = z.string().min(1).trim(); // Relative paths only
export const Timestamp = z.date().or(z.string().datetime());

export const PRINT_STATUS = z.enum(['printed', 'not_printed', 'failed']);
```

---

## 📦 2. Model Schemas (`schemas/model.ts`)

### Base Schema (DB Shape)
```typescript
export const ModelSchema = z.object({
  id: ID,
  name: z.string().min(3, "Name must be at least 3 chars"),
  description: z.string().optional(),
  collection_id: ID.nullable(),
  
  // Metadata
  is_printed: z.boolean().default(false),
  is_favorite: z.boolean().default(false),
  cover_image: Path.nullable(), // Relative path
  
  // Print Stats (from JSON legacy)
  print_time_minutes: z.number().min(0).optional(),
  filament_usage_grams: z.number().min(0).optional(),
  
  created_at: Timestamp,
  updated_at: Timestamp,
});
```

### Form Schema (Frontend Input)
*Used by React Hook Form in `BulkEditDrawer` / `EditDialog`*
```typescript
export const ModelFormSchema = ModelSchema.pick({
  name: true,
  description: true,
  is_printed: true,
  is_favorite: true,
}).extend({
  // Transform "1h 30m" string input to minutes (backend logic)
  print_time_string: z.string().optional(), 
  tags: z.array(z.string()).default([]),
});

export type ModelFormValues = z.infer<typeof ModelFormSchema>;
```

---

## 📂 3. Collection Schemas (`schemas/collection.ts`)

```typescript
export const CollectionSchema = z.object({
  id: ID,
  name: z.string().min(1, "Collection name required"),
  parent_id: ID.nullable(),
});

// For Reordering / Drag-Drop
export const MoveCollectionSchema = z.object({
  collection_id: ID,
  target_parent_id: ID.nullable(),
});
```

---

## 📄 4. File Asset Schemas (`schemas/file.ts`)

```typescript
export const FileSchema = z.object({
  id: ID,
  model_id: ID,
  filename: z.string(),
  size: z.number().int(),
  mime_type: z.string(),
  is_primary: z.boolean(),
});

// Middleware Check Logic
export const PrimaryFileRule = z.array(FileSchema).refine(
  (files) => files.filter(f => f.is_primary).length <= 1,
  "A model cannot have more than one primary file."
);
```

---

## 🔌 5. API Response Envelopes
*Standardized responses for React Query.*

```typescript
export const ApiResponse = <T extends z.ZodTypeAny>(dataSchema: T) => 
  z.object({
    success: z.boolean(),
    data: dataSchema,
    error: z.string().optional(),
    meta: z.object({
      page: z.number().optional(),
      total: z.number().optional(),
    }).optional(),
  });
```

---

## 🛠️ Usage Example

### Backend (Express Endpoint)
```typescript
app.post('/api/models/:id', async (req, res) => {
  // 1. Validate Input
  const payload = ModelFormSchema.parse(req.body); 
  
  // 2. Validate Logic (Primary File uniqueness enforced by DB + Middleware)
  
  // 3. Update DB
  const updated = await prisma.model.update({ ... });
  
  // 4. Validate Output (Paranoia check)
  res.json(ApiResponse(ModelSchema).parse({ success: true, data: updated }));
});
```

### Frontend (React Hook Form)
```typescript
const form = useForm<ModelFormValues>({
  resolver: zodResolver(ModelFormSchema),
  defaultValues: { name: model.name }
});
```
