# 🗺️ Munchie Master Migration Plan

> **Goal**: Migrate from Filesystem/JSON to **SQLite + Prisma**.
> **Strategy**: "Dual-Running" (Shadow Ingestion) ensuring zero data loss.
> **Philosophy**: The Database is the Source of Truth. Folders are just storage.

---

## 🏗️ The Schema (Target State)
*Consolidated from `schema_brainstorm.md`*

### 1. `Collection` (Folders)
Recursive structure for infinite nesting.
- `id`: Int (PK)
- `parent_id`: Int (FK -> Collection)
- `name`: String
- `path_hash`: String (Unique, for fast ingestor lookup)

### 2. `Model` (The Item)
The abstract entity shown in the grid.
- `id`: Int (PK)
- `collection_id`: Int (FK -> Collection)
- `name`: String
- `description`, `license`, `print_time`, `filament_usage`
- `is_printed`, `is_favorite`
- `path_hash`: String (Unique linkage to disk folder)
- `cover_image_path`: String

### 3. `ModelFile` (The Assets)
Solves the "Thingiverse Project" One-to-Many problem.
- `id`: Int (PK)
- `model_id`: Int (FK -> Model)
- `filename`: String (`head.stl`)
- `file_path`: String (Relative path for streaming)
- `is_primary`: Boolean (The main file for preview)
- `is_supported`: Boolean

### 4. `Tag` / `ModelTag`
Many-to-Many relationship for fast filtering.

---

## 📝 Phase 1: Foundation & Infrastructure
*Goal: The App starts with a DB, but doesn't use it yet.*

1.  **Dependencies**: Install `prisma`, `@prisma/client`, `sqlite3`.
    *   *Why Prisma?* Type safety and migration management.
2.  **Init Schema**: Create `prisma/schema.prisma` matching the target state.
3.  **Generate Client**: Run `npx prisma generate`.
4.  **Singleton**: Create `server-utils/db.js` to expose the Prisma Client.

## 🔄 Phase 2: The "Shadow Ingestor"
*Goal: Populate the DB without breaking the current App.*

1.  **Create `scripts/migrate-munchies.ts`**:
    *   **Logic**: Recursive scan of `models/`.
    *   **Collections**: Mirror the folder structure into `Collection` table.
    *   **Models**: Insert `*-munchie.json` data into `Model` table.
    *   **Edge Case: Project Folders**:
        *   If `project.json` exists OR `isProjectRoot=true`:
        *   Create **One Model** for the folder.
        *   Insert all files in that folder as `ModelFile` records.
    *   **Edge Case: Mixed Bags**:
        *   Check for sub-collections. If found, log warning but default to "Leaf Node" logic (files are assets).
2.  **Verify**: Run script. Compare DB counts vs File counts.

## 🔀 Phase 3: The "Flip" (API Switchover)
*Goal: The Frontend reads from the DB.*

1.  **Refactor `GET /api/models`**:
    *   **OLD**: Scan disk, filter hidden.
    *   **NEW**: `prisma.model.findMany({ include: { files: true, tags: true } })`.
    *   **Adaptor**: Map the Prisma result to the expected Frontend JSON shape (preserve `userDefined` structure for now to avoid breaking UI).
2.  **Refactor `POST /api/save-model`**:
    *   Update DB record.
    *   *Critical*: Start ignoring `*-munchie.json` writes.
3.  **Refactor `collectionScanner.js`**:
    *   Replace the recursive scanner with a **Path-Based Watcher**.
    *   *New Logic*: `chokidar` watches for file add/remove -> updates DB.

## 🧹 Phase 4: Cleanup (Burning the Bridge)
*Goal: Remove the legacy system.*

1.  **Delete Sidecars**: Script to delete all `*-munchie.json` files.
2.  **Delete `project.json`**: No longer needed.
3.  **Optimize**: Add DB indexes on `tags` and `category`.

## ✨ Phase 5: UI Polish (New Capabilities)
*Goal: Expose new power.*

1.  **"Promote Selection"**: Add UI action to select loose files -> "Create Model from Selection".
2.  **Instant Search**: Update search bar to query DB (server-side filtering) instead of client-side filtering.

---

## 🛡️ Risk Assessment & Mitigation

| Risk | Mitigation |
| :--- | :--- |
| **Data Loss** | **Step 0**: Zip `models/` folder. DB is populated *non-destructively* in Phase 2. |
| **"Mixed Bag" Folders** | The Ingestor defaults to "Safe Mode" (Treat as Collection). User manually promotes later. |
| **Performance** | SQLite is extremely fast. We will index foreign keys. |
| **Downtime** | None. The "Flip" happens in one deployment. |
