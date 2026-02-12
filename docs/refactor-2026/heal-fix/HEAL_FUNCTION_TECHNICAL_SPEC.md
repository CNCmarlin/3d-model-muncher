# Legacy Heal Function - Complete Technical Specification

## Overview

The legacy heal function is a comprehensive filesystem-based repair system located in `server/routes/admin.js` (lines 80-389). It was designed for the original munchie JSON file architecture and is **incompatible with database mode**.

---

## Problem Statement

### Corruption Scenario: Multi-Model Folders

**Example: C-270 Tripod Collection**
- Location: `models/3D Printer/Camera/C-270 tripod/`
- Contains: **10 separate 3D models** in one folder
- Each model has: `<modelname>.stl` + `<modelname>-stl-munchie.json`

**What Heal Does (WRONG)**:
1. Scans folder and finds 10 munchie files
2. For each model, finds thumbnail: `c270_cam1.stl-thumb.png`
3. **Sets ALL 10 models to `userDefined.thumbnail = "parsed:0"`**
4. **Result**: All 10 models point to the FIRST thumbnail they find

**Why It Fails**:
- Heal assumes **one model per folder**
- Uses folder-level thumbnail scanning instead of per-model matching
- Line 305-313: Sets thumbnail pointer based on position in `parsedImages` array
- No validation that thumbnail filename matches model filename

---

## Technical Deep Dive

### Heal Function Architecture

**Location**: `server/routes/admin.js:80-389`

**Entry Points**:
- `POST /api/admin/library-heal-preview` (line 429) - Dry run
- `POST /api/admin/library-heal` (line 442) - Live execution

**Core Logic Flow**:

```javascript
async function runHealLogic(isDryRun = false, specificPath = null) {
    // 1. Scan models directory recursively
    // 2. For each folder:
    //    - Find all *-munchie.json files
    //    - Check for project.json marker
    //    - Enforce "King of the Hill" (single isProjectRoot)
    // 3. For each munchie file:
    //    - Apply visibility rules
    //    - Claim assets (images, related files)
    //    - Repair thumbnail pointers
    //    - Scrub stale paths
    // 4. Save changes (with .bak backup)
}
```

### Critical Code Sections

#### 1. **Asset Claiming** (Lines 217-253)

**Purpose**: Link images and files to models based on filename matching

**Logic**:
```javascript
siblings.forEach(file => {
    const isMatch = modelFileName && lowerFile.startsWith(modelFileName.toLowerCase());
    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(file);
    
    if (isMatch && isImage) {
        data.parsedImages.push(`/models/${relAssetPath}`);
    }
});
```

**Problem**: In multi-model folders, this works correctly - each model only claims files starting with its name.

#### 2. **Thumbnail Repair** (Lines 290-348) ⚠️ **CORRUPTION SOURCE**

**Purpose**: Ensure models have correct thumbnail pointer

**Buggy Logic**:
```javascript
const expectedThumbName = `${actualFile}-thumb.png`;
const thumbWebUrl = `${expectedFolderUrl}${expectedThumbName}`;

if (siblings.includes(expectedThumbName)) {
    // Add thumb to parsedImages
    if (!data.parsedImages.includes(thumbWebUrl)) {
        data.parsedImages.push(thumbWebUrl);
    }
    
    // BUG: Find thumb's index in parsedImages array
    const thumbIndex = data.parsedImages.indexOf(thumbWebUrl);
    const targetPointer = `parsed:${thumbIndex}`;
    
    // Set pointer
    data.userDefined.thumbnail = targetPointer;
}
```

**Why This Corrupts Multi-Model Folders**:
1. Model 1: Adds `cam1.stl-thumb.png` to `parsedImages[0]`, sets `thumbnail = "parsed:0"` ✅
2. Model 2: Adds `cam2.stl-thumb.png` to `parsedImages[1]`, sets `thumbnail = "parsed:1"` ✅
3. **BUT THEN**: Lines 317-327 override this:
   ```javascript
   const hasParsedImages = data.parsedImages && data.parsedImages.length > 0;
   const firstImageIsThumb = hasParsedImages && data.parsedImages[0].includes('-thumb.png');
   
   if (hasParsedImages && firstImageIsThumb) {
       if (data.userDefined?.thumbnail !== 'parsed:0') {
           data.userDefined.thumbnail = 'parsed:0'; // FORCES ALL TO FIRST THUMB
       }
   }
   ```

#### 3. **Scrubbing** (Lines 255-288)

**Purpose**: Remove stale/incorrect image/file references

**Logic**: Validates that referenced files:
- Physically exist in folder
- Match model filename (for non-projects)
- Have correct folder path

**Problem**: Works correctly, but can't fix thumbnails already corrupted by step 2.

---

## Database Mode Incompatibility

### Why Heal Can't Work with Database

1. **Munchie Files ≠ Database**
   - Heal modifies `-munchie.json` files directly
   - Database stores model data in PostgreSQL
   - No sync mechanism between the two

2. **Data Overwrites**
   - Running heal after migration would overwrite database with corrupted JSON
   - No way to merge changes back to database

3. **Architectural Mismatch**
   - Database: Relational with foreign keys
   - Munchie: Flat file with embedded paths
   - Heal assumes munchie structure

---

## Current Protection (Implemented)

### Backend Blocks (server/routes/admin.js)

**Lines 432-443** - Preview blocked:
```javascript
const config = ConfigManager.loadConfig();
if (config?.settings?.useDatabaseBackend) {
    return res.status(400).json({
        success: false,
        error: 'Heal function disabled in database mode',
        message: 'This operation modifies munchie JSON files...'
    });
}
```

**Lines 457-468** - Execution blocked:
Same check prevents actual heal

### Frontend Warning (src/components/settings/IntegritySettings.tsx)

**Lines 115-125** - Red alert when database mode active
**Line 145** - Heal button disabled when `useDatabaseBackend === true`

---

## Fixing C-270 Tripod Corruption

### Current State (Corrupted)

All 10 models in `models/3D Printer/Camera/C-270 tripod/` have:
```json
{
  "metadata": {
    "thumbnail": "/models/3D Printer/Camera/C-270 tripod/c270_cam1.stl-thumb.png"
  }
}
```

**Expected State**: Each model should have its own thumbnail:
- `c270_cam1.stl` → `c270_cam1.stl-thumb.png`
- `c270_cam2_shaped.stl` → `c270_cam2_shaped.stl-thumb.png`
- etc.

### Fix Options

#### Option 1: Manual Prisma Studio

1. Open Prisma Studio: `npx prisma studio`
2. Navigate to `Model` table
3. Filter: `collectionId = "col_M0QgUHJpbnRlci9DYW1lcmEvQy0yNzAgdHJpcG9k"`
4. For each model:
   - Find corresponding `.stl` file name
   - Update `coverImagePath` to match: `3D Printer/Camera/C-270 tripod/<filename>-thumb.png`

#### Option 2: SQL Script

```sql
-- Get all C-270 models
SELECT id, name, "coverImagePath", metadata 
FROM "Model" 
WHERE "collectionId" = 'col_M0QgUHJpbnRlci9DYW1lcmEvQy0yNzAgdHJpcG9k';

-- Update each manually or with dynamic SQL
UPDATE "Model"
SET "coverImagePath" = '3D Printer/Camera/C-270 tripod/c270_cam2_shaped.stl-thumb.png',
    metadata = jsonb_set(
        metadata::jsonb,
        '{thumbnail}',
        '"/models/3D Printer/Camera/C-270 tripod/c270_cam2_shaped.stl-thumb.png"'
    )
WHERE id = 'models-3D-Printer-Camera-C-270-tripod-c270_cam2_shaped-f53c2a6a';
```

#### Option 3: TypeScript Repair Script

Create `scripts/fix-c270-thumbnails.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function fixC270Thumbnails() {
    const collectionId = 'col_M0QgUHJpbnRlci9DYW1lcmEvQy0yNzAgdHJpcG9k';
    const modelDir = 'W:/3D Files Cabinet - Copy/3D Printer/Camera/C-270 tripod';
    
    // Get all models in collection
    const models = await prisma.model.findMany({
        where: { collectionId },
        include: { files: true }
    });
    
    for (const model of models) {
        // Find primary STL file
        const stlFile = model.files.find(f => 
            f.filePath.endsWith('.stl') && !f.filePath.includes('-thumb')
        );
        
        if (!stlFile) continue;
        
        const basename = path.basename(stlFile.filePath);
        const expectedThumb = `${basename}-thumb.png`;
        const thumbPath = `3D Printer/Camera/C-270 tripod/${expectedThumb}`;
        const fullThumbPath = path.join(modelDir, expectedThumb);
        
        // Verify thumbnail exists
        if (!fs.existsSync(fullThumbPath)) {
            console.error(`Missing thumbnail: ${expectedThumb}`);
            continue;
        }
        
        // Update model
        await prisma.model.update({
            where: { id: model.id },
            data: {
                coverImagePath: thumbPath,
                metadata: {
                    ...(model.metadata as any),
                    thumbnail: `/models/${thumbPath}`
                }
            }
        });
        
        console.log(`Fixed: ${model.name} → ${expectedThumb}`);
    }
}

fixC270Thumbnails()
    .then(() => console.log('Done!'))
    .catch(console.error)
    .finally(() => prisma.$disconnect());
```

Run: `tsx scripts/fix-c270-thumbnails.ts`

---

## Long-Term Solution: Database-Native Integrity Tools

### Proposed: `POST /api/admin/db-integrity-check`

Replace heal with database-native tools:

```typescript
interface IntegrityCheckResult {
    missingThumbnails: Array<{
        modelId: string;
        name: string;
        expectedPath: string;
        exists: boolean;
    }>;
    orphanedFiles: Array<{
        filePath: string;
        inDb: boolean;
    }>;
    duplicateCovers: Array<{
        coverImagePath: string;
        modelIds: string[];
    }>;
}

async function checkDatabaseIntegrity(): Promise<IntegrityCheckResult> {
    const models = await prisma.model.findMany({ include: { files: true } });
    const result: IntegrityCheckResult = { ... };
    
    for (const model of models) {
        // Check thumbnail exists
        const primaryFile = model.files[0];
        const expectedThumb = `${path.basename(primaryFile.filePath)}-thumb.png`;
        const thumbPath = path.join(MODELS_DIR, path.dirname(primaryFile.filePath), expectedThumb);
        
        if (!fs.existsSync(thumbPath)) {
            result.missingThumbnails.push({
                modelId: model.id,
                name: model.name,
                expectedPath: expectedThumb,
                exists: false
            });
        } else if (model.coverImagePath !== expectedThumb) {
            // Thumbnail exists but path is wrong - auto-fix
            await prisma.model.update({
                where: { id: model.id },
                data: { coverImagePath: expectedThumb }
            });
        }
    }
    
    return result;
}
```

---

## Testing the Fix

### Verification Steps

1. **Check C-270 Models**:
   ```sql
   SELECT id, name, "coverImagePath" 
   FROM "Model" 
   WHERE "collectionId" = 'col_M0QgUHJpbnRlci9DYW1lcmEvQy0yNzAgdHJpcG9k'
   ORDER BY name;
   ```

2. **Navigate in UI**:
   - Go to Collections → 3D Printer → Camera → C-270 tripod
   - Click each model
   - Verify thumbnail changes with each click

3. **Check Sibling Thumbnails**:
   - Open ModelHub for any C-270 model
   - Check SiblingsSection shows 9 unique thumbnails

---

## File Locations Reference

### Backend
- `server/routes/admin.js:80-389` - Heal function logic
- `server/routes/admin.js:429-440` - Preview endpoint (now blocked)
- `server/routes/admin.js:442-452` - Execution endpoint (now blocked)

### Frontend
- `src/components/settings/IntegritySettings.tsx:115-125` - Warning alert
- `src/components/settings/IntegritySettings.tsx:145` - Disabled button
- `src/hooks/settings/useIntegrityCheck.tsx` - Hook that calls heal endpoints

### Corruption Evidence
- `docs/refactor-2026/thumbnail_corruption_issue.md` - Original investigation

---

## Recommendations for Another AI

1. **Don't Try to Fix Heal** - It's fundamentally incompatible with database mode
2. **Create Database-Native Tools** - Build integrity checks using Prisma queries
3. **Focus on C-270 First** - Prove the repair script works on one collection
4. **Generalize After** - Extend to all models once C-270 is verified
5. **Add UI** - Create new Settings tab for "Database Integrity" (separate from legacy heal)

---

## Questions to Answer

1. **How many other collections have this issue?**
   ```sql
   SELECT "collectionId", COUNT(DISTINCT "coverImagePath") as unique_thumbs, COUNT(*) as total_models
   FROM "Model"
   WHERE "collectionId" IS NOT NULL
   GROUP BY "collectionId"
   HAVING COUNT(*) > COUNT(DISTINCT "coverImagePath");
   ```

2. **Can we auto-detect correct thumbnail from filename?**
   - Yes, if files table has correct `filePath` values

3. **Should we regenerate missing thumbnails?**
   - Option: Call existing `/api/admin/generate-thumbnails` (still works, doesn't corrupt)
