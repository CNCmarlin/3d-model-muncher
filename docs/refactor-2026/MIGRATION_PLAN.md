# 🗺️ Munchie Master Migration Plan

> **Goal**: Migrate from Filesystem/JSON to **SQLite + Prisma**.
> **Strategy**: "Dual-Running" (Shadow Ingestion) ensuring zero data loss.
> **Philosophy**: The Database is the Source of Truth. Folders are just storage.
> **Tech Stack**:
> *   **Backend**: Node.js + Express + Prisma + Zod
> *   **Frontend**: React + TanStack Query + React Hook Form + Zod + dnd-kit

---

## 🏗️ The Schema (Target State)
*Consolidated from `schema_brainstorm.md`*

### 1. `Collection` (Folders)
- `id`: Int (PK)
- `parent_id`: Int (FK -> Collection)
- `name`: String
- `path_hash`: String (Unique, for fast ingestor lookup)

### 2. `Model` (The Item)
- `id`: Int (PK)
- `collection_id`: Int (FK -> Collection)
- `name`: String
- `path_hash`: String (Unique linkage to disk folder)
- `cover_image_path`: String (**Relative** to `LIBRARY_ROOT`)
- `is_deleted`: Boolean (Soft delete to handle reconciliation)

### 3. `ModelFile` (The Assets)
- `id`: Int (PK)
- `model_id`: Int (FK -> Model)
- `filename`: String (`head.stl`)
- `file_path`: String (**Relative** path)
- `is_primary`: Boolean (Enforced via Middleware/Zod)
- `mime_type`: String (e.g., `model/stl`, `image/png`, `text/gcode`)
- `size_bytes`: BigInt (For duplicate detection)

---

## 📝 Phase 1: Foundation & Infrastructure
*Goal: The App starts with a DB, but doesn't use it yet.*

1.  **Dependencies**: `prisma`, `@prisma/client`, `sqlite3`, `zod`, `@tanstack/react-query`.
2.  **Init Schema**: Create `prisma/schema.prisma` matching the target state.
3.  **Zod Bridge**: Create shared Zod schemas for validation (Backend) and Forms (Frontend).
4.  **Singleton**: Create `server-utils/db.js`.

## 🔄 Phase 2: The "Shadow Ingestor"
*Goal: Populate the DB without breaking the current App.*

1.  **Create `scripts/migrate-munchies.ts`**:
    *   **Dry Run Mode**: Flag `--dry-run` to output JSON summary ("Will create 450 Models...").
    *   **Logic**: Recursive scan of `models/`.
    *   **Reconciliation & Renames**:
        *   If a path disappears but a new one appears with same file size/name -> **Refactor** (Move), don't Delete + Add.
        *   Use `size_bytes` + `filename` hash to detect "Same Model, New Folder".
    *   **Relative Paths**: Strip `absolute` paths. Store relative to library root.
    *   **Edge Case: Project Folders** (Restored Detail):
        *   If `project.json` exists OR `isProjectRoot=true`:
        *   Create **One Model** for the folder.
        *   Insert all files in that folder as `ModelFile` records.
    *   **Edge Case: Mixed Bags** (Restored Detail):
        *   Check for sub-collections. If found, log warning but default to "Leaf Node" logic (files are assets).
        *   Goal: Be non-destructive. If in doubt, create a generic Collection.
2.  **Verify**: Run script in Dry Run, then Live.

## 🚦 Phase 2.5: Verification UI
*Goal: A "Health Check" Dashboard before the switch.*

1.  **Admin Page**: `/admin/migration-status`
2.  **Logic**:
    *   Scan DB rows vs. Disk files.
    *   Red Row: File exists on disk, missing in DB.
    *   Yellow Row: Metadata mismatch (DB says "printed", JSON says "not printed").
3.  **Approval**: "Flip Model" button only active when Health > 99%.

## 🔀 Phase 3: The "Flip" (API Switchover)
*Goal: The Frontend reads from the DB.*

1.  **Refactor `GET /api/models`**:
    *   **NEW**: `prisma.model.findMany(...)`.
    *   **Adaptor**: Map Prisma result to Zod-validated JSON.
2.  **Refactor Frontend Hooks**:
    *   Replace `useModelData` with `useQuery`.
    *   Implement **Optimistic Updates**.
3.  **Legacy Guard**: Keep `*-munchie.json` files as read-only backups for 2 weeks.

## 🧹 Phase 4: Cleanup (Burning the Bridge)
1.  **Delete Sidecars**: Delete `*-munchie.json`.
2.  **Watcher Upgrade**: Switch `chokidar` to update DB directly.
3.  **Optimize**: Index `tags`, `category`, and `path_hash`.

## ✨ Phase 5: UI Polish (New Capabilities)
*Goal: Expose new power enabled by the DB.*

1.  **"Promote Selection"**: Add UI action to select loose files -> "Create Model from Selection".
2.  **Instant Search**: Update search bar to query DB (server-side filtering) instead of client-side filtering.
3.  **Virtual Collections**: Allow creating collections based on Tag queries (e.g. "All printed sci-fi models") regardless of folder structure.

---

## 🛡️ Risk Assessment & Mitigation

| Risk | Mitigation |
| :--- | :--- |
| **Path Renames** | **Reconciliation Logic**: Check file hash/size before assuming deletion. |
| **Absolute Paths** | **Relative Storage**: Store paths relative to `LIBRARY_ROOT`. |
| **Primary Ambiguity** | **Zod/Prisma Middleware**: Enforce single `is_primary` per model on write. |
| **Data Loss** | **Dry Run + Health Check**: Zero destructive actions until verified. |
