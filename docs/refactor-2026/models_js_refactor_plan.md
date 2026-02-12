# Refactoring Plan: De-Monolithizing `models.js`
**Date:** February 10, 2026
**Target:** `server/routes/models.js` (1700+ lines, Legacy Mode)

## 1. Problem Statement
`models.js` handles too many responsibilities:
- HTTP Route definitions
- File system scanning & recursion
- Data normalization & business logic
- Backup/Restore orchestration
- Image/Thumbnail logic
- Path security checks

This makes it fragile to edit (e.g., the recent "save-model" bugs) and hard to test.

## 2. Proposed Architecture

We will move from a "Single Route File" to a **Controller-Service** pattern, grouped by domain.

### A. Directory Structure
```
server/
├── routes/
│   └── legacy/               # NEW: Group all legacy routes here
│       ├── models.js         # Main entry, but drastically smaller (just mounts sub-routers)
│       └── ...
├── controllers/              # NEW: HTTP Request Handling
│   └── legacy/
│       ├── modelController.js      # CRUD (Get, Save, Delete)
│       ├── maintainController.js   # Scan, Regenerate, Validate
│       └── backupController.js     # Backup/Restore
├── services/                 # NEW: Business Logic (No req/res)
│   └── legacy/
│       ├── modelService_legacy.js  # The heavy lifting (find by ID, save logic)
│       ├── fileService.js          # Shared FS ops (safe writes, path guards)
│       └── backupService.js        # Zip/Unzip logic
```

## 3. Route Clustering & Migration Plan

### Group 1: Core Read Operations (Low Risk)
**Routes:**
- `GET /api/models`
- `GET /api/models/load`
- `GET /api/models/folders`
- `GET /api/models/munchies`

**Action:**
1.  Extract logic to `services/legacy/modelService_legacy.js` (`getAllModels`, `getModelById`, `getModelByPath`).
2.  Create `controllers/legacy/modelController.js` (`listModels`, `loadModel`).
3.  Update `routes/models.js` to use the controller.

### Group 2: Maintenance & Scanning (Medium Risk)
**Routes:**
- `POST /api/scan-models`
- `POST /api/regenerate-munchie-files`
- `POST /api/verify-file`
- `GET /api/validate-3mf`

**Action:**
1.  Extract `scanForModels` and `migrateFile` helper functions to `services/legacy/scannerService.js`.
2.  Move validation logic to `services/legacy/validationService.js`.

### Group 3: Backup & Restore (Isolated)
**Routes:**
- `POST /api/models/backup`
- `POST /api/backup-munchie-files` (Duplicate?)
- `POST /api/models/restore/upload`
- `POST /api/restore-munchie-files`

**Action:**
1.  Move all backup logic to `services/legacy/backupService.js`.
2.  Consolidate duplicate routes if possible.

### Group 4: Mutations (High Risk - "The Beast")
**Routes:**
- `POST /api/save-model` (The complex one)
- `POST /api/model/metadata`
- `POST /api/models/delete`
- `POST /api/create-model-folder`
- `POST /api/upload-document`

**Action:**
1.  Create `services/legacy/mutationService.js`.
2.  Extract the "Safeguard Logic" (Read-Before-Write, 3MF Parity Check) into reusable helpers.
3.  **Crucial:** Write unit tests for `mutationService.js` before switching over the route.

## 4. Helper Extraction

The following internal functions in `models.js` should be moved to `server-utils`:
- `getAbsoluteModelsPath()` -> `server-utils/pathHelper.js`
- `protectModelFileWrite()` -> `server-utils/ioHelper.js`
- `scanForModels()` -> `server-utils/legacyScanner.js`
- `findById()` -> `server-utils/legacyFinder.js` (or `modelService_legacy.js`)

## 5. Implementation Strategy (Step-by-Step)

1.  **Refactor Utils First:** Move `findById`, `scanForModels`, and `getAbsoluteModelsPath` to shared files. These are used everywhere.
2.  **Split the Router:** Create the `controllers/legacy/` file structure.
3.  **Migrate Group 1 (Reads):** Easy win, proves the pattern works.
4.  **Migrate Group 3 (Backups):** Isolated, low risk of breaking usage.
5.  **Migrate Group 2 (Maintenance):** Slightly more complex scanning logic.
6.  **Migrate Group 4 (Mutations):** DO LAST. Requires heavy testing to ensure no regression on the "Wiping" or "Race Condition" bugs.

## 6. Route Map (For Reference)

| Verb | Path | Proposed Controller |
| :--- | :--- | :--- |
| GET | `/api/models` | `modelController.list` |
| GET | `/api/models/load` | `modelController.load` |
| POST | `/api/save-model` | `mutationController.save` |
| POST | `/api/models/delete` | `mutationController.delete` |
| POST | `/api/scan-models` | `maintenanceController.scan` |
| POST | `/api/backup-munchie-files` | `backupController.create` |
| POST | `/api/restore-munchie-files` | `backupController.restore` |
| POST | `/api/gemini-suggest` | `aiController.suggest` |

