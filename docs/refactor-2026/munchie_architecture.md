# Munchie Architecture & Interaction Map

This document analyzes the current "Munchie" (Sidecar JSON) architecture to assess the complexity of migrating to a Database (SQLite).

## 🧩 The Core Concept
The application currently uses the **Filesystem as the Database**.
- **Models**: Every 3D file (`.stl`, `.3mf`) has a corresponding `*-munchie.json` sidecar file containing metadata (name, description, tags, print settings).
- **Collections**: Folders on disk are interpreted as Collections *unless* they are marked as "Project Folders".

## 🗺️ Interaction Map (The "sprawl")

### 1. The Scanner (`server-utils/collectionScanner.js`)
**Complexity: Critical 🔴**
This is the migration's "Final Boss". It traverses the filesystem and decides what is a Collection vs. a Model.
- **Logic**:
    - Recursive directory walk.
    - **Project Folder Detection**: Checks for `project.json`.
        - If found: **DOES NOT** create a collection. Instead, it finds the "Root Model" (marked `isProjectRoot: true`) in that folder and reports *that single ID* to the parent collection.
        - **Implication**: A folder with 10 files (e.g. `X-Wing/`) appears as 1 item in the UI.
    - **Collection Creation**: If *not* a project folder, creates a Collection entry in memory (and eventually `data/collections.json`).

### 2. The API Layer (`server/routes/models.js`)
**Complexity: High 🔴**
Every endpoint manually reads/writes JSON files.
- `GET /api/models`:
    - **Behavior**: Recursively scans `models/` for `*-munchie.json`.
    - **Migration**: Would be replaced by `SELECT * FROM models`.
- `POST /api/save-model`:
    - **Behavior**: Writes to `*-munchie.json`.
    - **Project Logic**: Has specific code (lines 437-453) to "Demote" other models in a folder if `isProjectRoot` is set on one (ensuring only one King per project folder).
- `POST /api/models/scan`:
    - **Behavior**: Parses raw 3MF/STL files and *generates* `munchie.json` files if missing.
    - **Migration**: Scanner would insert rows into DB instead of writing files.

### 3. Data Access Utilities
- `protectModelFileWrite` (`server-utils/dataAccess.js`):
    - Ensures we never overwrite a `.3mf` source file, redirecting writes to `-munchie.json`.
- `backup/restore`:
    - Currently zips up thousands of JSON files. Would need to change to database dump.

## ⚠️ The "Thingiverse Style" Complexity
You are absolutely correct about the "Project Folder" complexity.
- **Current State**: A folder is a "Collection" by default, *unless* it contains `project.json`.
- **The Ambiguity**:
    - Users often download a zip, extract it, and get `CoolThing/files/part1.stl`, `CoolThing/files/part2.stl`.
    - Is `CoolThing` a collection? Or a single Model with parts?
    - Currently, the app relies on the implicit `project.json` marker + `isProjectRoot` metadata to distinguish this.
- **Migration Risk**:
    - In a Database, we must explicitly model this.
    - **Schema Idea**:
        - User -> Collection -> Model
        - If "Thingiverse Style", the "Model" is actually a container (Project) that has "Parts" (Files).
        - **Option A**: `Models` have a `parent_model_id` (Recursive).
        - **Option B**: `Collections` have a type (`'folder'`, `'project'`).

## 🏁 Verdict
Your plan to map this out was **NOT overkill**. The "Project Folder" logic is baked into the file scanner and save endpoints. A naive migration to SQLite that ignores this would flatten your library (destroying project groupings) or turn every multi-part model into a Folder/Collection.

**Migration Strategy Request**:
1.  **Phase 1**: Formalize the Schema (Must support "Projects" vs "Collections").
2.  **Phase 2**: Write the "Ingestor" (Script to read Munchies -> Insert to SQLite).
3.  **Phase 3**: Rewrite API to read SQLite.
