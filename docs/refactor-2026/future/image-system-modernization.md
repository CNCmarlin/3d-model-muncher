# Future: Image System Modernization

## Problem Statement

Currently, user-uploaded images are stored as base64-encoded data URLs directly in the database metadata JSON. This causes:
- **Massive metadata bloat** (1-5MB per image)
- **Poor performance** (parsing/serializing huge strings)
- **Database inefficiency** (not queryable, not cacheable)
- **Memory waste** (base64 is 33% larger than binary)

## Proposed Solution

Convert base64 images to actual file storage with database references.

### Architecture

```
data/
├── images/
│   ├── {modelId}/
│   │   ├── user-upload-1.jpg    # Extracted from userDefined.images
│   │   ├── user-upload-2.png
│   │   └── thumb-custom.jpg
models/
├── {folder}/
│   ├── model.stl
│   └── model.stl-thumb.png       # Auto-generated thumbnails
```

### Database Schema (No Changes Needed!)

Store image references in metadata JSON:

```json
{
  "metadata": {
    "gallery": [
      {
        "id": "img-001",
        "path": "data/images/model-abc/thumb.jpg",
        "type": "generated",
        "isPrimary": true,
        "order": 0
      },
      {
        "id": "img-002", 
        "path": "data/images/model-abc/custom-1.png",
        "type": "uploaded",
        "order": 1
      }
    ]
  }
}
```

## Implementation Plan

### Phase 1: Background Migration Script

**File**: `scripts/migrate-images-to-files.ts`

```typescript
// Pseudocode
for each model in database:
  if model.metadata.userDefined.images exists:
    for each base64Image in userDefined.images:
      1. Decode base64 to binary
      2. Detect format (PNG/JPG/WebP)
      3. Save to data/images/{modelId}/user-{index}.{ext}
      4. Add to metadata.gallery array
    
    // Clear bloated data
    delete model.metadata.userDefined.images
    
    // Keep imageOrder for reference
    migrate model.metadata.userDefined.imageOrder to gallery.order
```

### Phase 2: Update Frontend Gallery

**Files to Modify**:
- `src/hooks/hub/useModelGallery.ts` - Read from unified `metadata.gallery`
- `src/hooks/hub/useModelEdit.ts` - Save uploaded images as files via API
- `src/utils/galleryUtils.ts` - Simplify image resolution logic

**New Upload Flow**:
```typescript
// Before (bloated):
userDefined.images.push("data:image/png;base64,iVBORw0KG...")  // 2MB string!

// After (efficient):
const formData = new FormData();
formData.append('image', file);
const response = await fetch(`/api/models/${id}/images`, {
  method: 'POST',
  body: formData
});
// Server saves file, returns path
// Frontend updates metadata.gallery with path
```

### Phase 3: API Endpoints

**New Endpoints**:
```
POST   /api/models/:id/images          - Upload image
DELETE /api/models/:id/images/:imageId - Delete image
PATCH  /api/models/:id/images/order    - Reorder gallery
```

**Backend Logic** (`server/routes/images_db.js`):
```javascript
router.post('/models/:id/images', upload.single('image'), async (req, res) => {
  // 1. Save uploaded file to data/images/{modelId}/
  // 2. Add reference to model.metadata.gallery
  // 3. Return updated gallery array
});
```

### Phase 4: Cleanup Legacy Fields

Once migration is complete:
- Deprecate `parsedImages` (merge into `metadata.gallery`)
- Deprecate `userDefined.images` (now files)
- Deprecate `userDefined.imageOrder` (now `gallery[].order`)

## Benefits

- **90% reduction** in database size (remove base64)
- **Faster queries** (smaller metadata JSON)
- **CDN-ready** (serve images directly from disk/S3)
- **Better caching** (browser can cache image files)
- **Cleaner architecture** (separation of concerns)

## Risks & Mitigation

**Risk**: Image file loss during migration
**Mitigation**: Keep base64 data until verified, then clean up

**Risk**: Broken references if files deleted
**Mitigation**: Validation script to check file existence

**Risk**: Performance during migration (1000+ models)
**Mitigation**: Process in batches, run during off-hours

## Estimated Effort

- **Migration Script**: 4-6 hours
- **Frontend Updates**: 6-8 hours
- **API Endpoints**: 3-4 hours
- **Testing & Validation**: 4-6 hours
- **Total**: 2-3 days of focused work

## Dependencies

- None - can start anytime after current migration is stable

## Success Metrics

- Database size reduced by >80%
- Page load time improved by 50%+
- Image upload working in <2 seconds
- Zero data loss (all images preserved)
