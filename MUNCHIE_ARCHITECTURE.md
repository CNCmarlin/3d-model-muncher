# Munchie Architecture & Migration Complexity Analysis

> **Status**: Current Architecture (Filesystem as Database)
> **Goal**: Map all dependencies on `*-munchie.json` to assess SQLite migration complexity.

## � Deep Dive: Genesis to Visualization Flow

The user asked to find the "Genesis Block" and trace how everything connects. Here is the full lifecycle of a Model in the Munchie system.

### 1. Genesis (Birth of a Munchie)
**File**: `dist-backend/utils/threeMFToJson.js` -> `generateUniqueId`
**Trigger**: User uploads a file OR pastes a file into `models/`.
1.  **Scanner**: The backend detects a new file.
2.  **ID Generation**: It mints a unique ID using `path-hash`.
    ```js
    id = ${cleanPath}-${md5Hash.substring(0,8)}
    ```
3.  **Persistence**: Writes `[filename]-munchie.json` to disk.

### 2. The "Project" Mutation (The Magic Trick)
**File**: `server/routes/models.js` -> `POST /save-model`
This is how the system handles "Thingiverse Style" projects without a real database relationship.
**Behavior**: When you set a model as **Primary** (Project Root):
1.  Backend iterates all *other* munchie files in that same folder.
2.  **Mutation**: It explicitly updates them to set:
    ```json
    {
      "isProjectRoot": false,
      "hidden": true,  // <--- THE SMOKING GUN
      "isRelatedPart": true
    }
    ```
3.  **Result**: The "Child Parts" exist on disk but are explicitly marked hidden in their own metadata.

### 3. The Organizer (Collection Scanner)
**File**: `server-utils/collectionScanner.js`
1.  Walks directories.
2.  Checks for `project.json` marker.
3.  **Filtration**: If inside a project folder, it *ignores* any file that isn't the Root.
    - *Note*: This affects the **Collection View** hierarchy.

### 4. Visualization (Frontend)
**File**: `src/utils/filterUtils.ts`
1.  Receives ALL models (including hidden ones) from `GET /api/models`.
2.  **Runtime Filter**:
    ```typescript
    if (!filters.showHidden) {
      filtered = filtered.filter(model => !model.hidden);
    }
    ```
3.  **Result**: The "Child Parts" vanish from the grid because they were mutated in Step 2.

---

## 🏗️ Backend Interaction Map

### 1. The Creator: "The Engine" (`dist-backend/utils/threeMFToJson.js`)
**Role**: Data Ingestion & Integrity
**Complexity**: Medium
 This is the process that actually **writes** the data to disk.
- **Trigger**: `POST /api/models/scan` or `performHashCheck`.
- **Logic**:
    - Walks the disk looking for `.stl` or `.3mf` files.
    - **Creation**: If a sidecar JSON is missing, it parses the geometry file and **writes a new `*-munchie.json`**.
    - **Generates IDs**: Uses `path + hash` to generate unique IDs.
- **Migration**: This logic moves to an "Ingestor" script that inserts rows into the DB instead of writing files.

### 2. The Organizer: "The Librarian" (`server-utils/collectionScanner.js`)
**Role**: Read Model & Hierarchy Builder
**Complexity**: Critical (10/10) 🔴
This process **reads** the data to build the application state.
- **Logic**:
    - Recursive directory walk.
    - **Project Folder Logic**:
        - Detects `project.json` or `isProjectRoot` flag in munchie files.
        - **Logic**: If a folder is a "Project", it aggregates all 10+ models inside it into **One Model Entry** (the Root).
        - **Migration**: A relational DB must strictly model `Collection` vs `Project`. A "Project" is effectively a "Model Group".
    - **Collection Creation**:
        - Auto-generates IDs based on folder paths (`col_M0...`).
        - **Migration**: DB IDs would replace these base64 path IDs.

### 3. The API Layer (`server/routes/models.js`)
**Migration Complexity: High (8/10)** 🔴
Endpoints manually read/write JSON files.
- `GET /api/models`: Performs a full recursive disk scan using the "Librarian" logic.
    - **Refactor**: Replace with `SELECT * FROM models`.
- `POST /api/save-model`: Writes partial updates to `*-munchie.json`.
    - **Project Demotion Logic**: Contains specific logic (lines 437-453) to ensure only one "Project Root" exists per folder.
- `DELETE /api/models/delete`: Deletes the munchie + source file + images.

---

## 🖥️ Frontend Interaction (Component Mapping)
The Frontend does not read files directly, but its **Types and Components are coupled to the Munchie JSON Schema**.

### 1. Data Types (`src/types/model.ts`)
The `Model` interface is a 1:1 mirror of the Munchie JSON.
```typescript
interface Model {
  // Legacy fields (must be migrated or supported in DB)
  thumbnal?: string;
  images?: string[];
  
  // New Structure
  userDefined?: { ... }; // Stores user overrides
  isProjectRoot?: boolean; // Critical navigation flag
  related_files?: string[];
}
```

### 2. Component Coupling
These components rely on specific "Munchie" fields. A DB migration must return data in this *exact shape* or these must be refactored.

| Component | Dependency | Risk |
| :--- | :--- | :--- |
| `App.tsx` | Uses `isProjectRoot` to filter Main grid? | Medium |
| `useFilteredModels.ts` | Filters based on `isProjectRoot`, `hidden`. | High |
| `ModelHubView.tsx` | Displays `related_files` and `userDefined.images`. | Medium |
| `BulkEditDrawer.tsx` | Batch updates metadata fields. | Medium |
| `useModelActions.ts` | Sends partial updates assuming JSON merge strategy. | High |

---

## ⚠️ The "Thingiverse Style" Problem
You correctly identified the complexity of **Project Folders**.
- **Current Behavior**: A folder with `project.json` is **squashed** into a single item.
- **Database Risk**: A naive SQLite migration ("Import every munchie as a row") would destroy this hierarchy, showing every single part (1000s of distinct screws/parts) in the main grid.
- **Requirement**: The DB Schema must support a parent/child relationship for models:
    - Tables: `Collection` -> `ModelGroup` (Project) -> `ModelFile` (Part).

## 📊 Conclusion
**Is your plan overkill?**
**Answer: NO.** It is the minimum viable preparation.
Migrating to SQLite is not just "swapping specific storage". It requires:
1.  **Schema Design**: Formalizing "Collections" vs "Projects".
2.  **Ingestion Script**: A one-time tool to parse the existing filesystem layout into the DB.
3.  **API Rewrite**: Rewriting all endpoints to use SQL.
4.  **Frontend Adaptors**: Ensuring the API returns JSON that matches the existing Frontend `Model` type to avoid a total UI rewrite.
