# 🔍 Frontend DB Impact Audit

> **Goal**: Systematically review every frontend component for dependencies on the "Munchie" filesystem/JSON structure.
> **Scope**: 48+ files in `src/components/`.

## 📋 Audit Checklist
For each file, we checked:
1.  **Legacy Fields**: Does it use `isProjectRoot`, `related_files`, `userDefined`?
2.  **API Dependencies**: Does it call `/api/models/scan` or legacy endpoints?
3.  **Path Logic**: Does it construct paths manually (e.g., `col_M0...`)?
4.  **Refactor Needed**: Yes/No + Complexity Score.

---

## 🏗️ Components Inventory

### Batch 1: Dialogs & Imports
| Component | Status | Impact Analysis | Refactor Plan |
| :--- | :--- | :--- | :--- |
| **AutoImportDialog.tsx** | 🔴 Needs Rework | Calls `/api/collections/auto-import`. Strategy logic needs updating. | Rewrite API handler. Map strategies to DB ingest. |
| **ModelUploadDialog.tsx** | 🔴 Needs Rework | Heavy usage of `isProjectRoot` and physical folder creation. | Rewrite logic to use `type='project'` and `ModelFile` table. |
| **ThingiverseImportDialog.tsx** | 🟡 Update API | Calls `/api/import/thingiverse`. | Ensure backend writes to DB. Frontend is mostly safe. |
| **ProjectFolderDialog.tsx** | 🟡 Update API | Calls `/api/models/upload-document`. | Ensure backend updates `ModelFile`. |
| **GlobalDialogs.tsx** | 🔴 High | Orchestrator for key dialogs. Passes strict props. | Update `handleBulkDelete` signature and props passed to children. |

### Batch 2: Views & Grids
| Component | Status | Impact Analysis | Refactor Plan |
| :--- | :--- | :--- | :--- |
| **ModelHubView.tsx** | 🔴 Critical | Deep dependency on `related_files` (string[]) and `/api/save-model`. | Update to handle `ModelFile[]` relation. Update hooks. |
| **CollectionCard.tsx** | 🟠 Needs Update | Uses `modelIds.length` for count. | API must return `model_count` or preserve `modelIds`. |
| **ModelGrid.tsx** | 🟡 Low Impact | Sorting depends on `lastModified`. | Ensure DB provides standard timestamps. |
| **ModelCard.tsx** | 🟢 Safe | Mostly display-only. | Ensure `filePath/modelUrl` is populated. |
| **ProjectView.tsx** | 🔴 Critical | Manages Build Plates. Currently uses `collection.buildPlates` JSON blob. | **Major Refactor**: Switch to `CollectionBuildPlate` and `CollectionBuildPlateItem` tables. |
| **Views/CollectionView.tsx** | 🟡 Update Needed | Displays collection children. | Switch to DB queries for `parentId`. |

### Batch 3: Settings & Core
| Component | Status | Impact Analysis | Refactor Plan |
| :--- | :--- | :--- | :--- |
| **SettingsPage.tsx** | 🟢 Safe | Router component. | - |
| **SpoolmanWidget.tsx** | 🟡 JSON Dependency | Relies on `userDefined` and `gcodeData` JSON blobs. | Ensure DB schema uses JSON columns for these. |
| **FilterSidebar.tsx** | 🟡 Hydration | Expects deep object (tags, collections). | API must hydrate `tags[]` and `parentId`. |
| **App.tsx** | 🔴 Critical | Orchestrates all data fetching. | Update `useModelData` to handle new API shape. |
| **useModelData.ts** | 🔴 Critical | Fetches `/api/models`. | API must return matching `Model` shape. |
| **useFilteredModels.ts** | 🟡 High Impact | Filters based on object props. | Dependent on `useModelData` shape. |
| **useRelatedFiles.ts** | 🟠 Tech Debt | Checks for physical `-munchie.json` files. | Eventually replace with DB query for related models. |

### Batch 4: Editor Components
| Component | Status | Impact Analysis | Refactor Plan |
| :--- | :--- | :--- | :--- |
| **BulkEditDrawer.tsx** | 🔴 Critical | Handles mass updates. Relies on `Collection` ID strings and `models` array. | Update `useBulkOperations` hook. Ensure `Collection` selection uses new DB IDs. |
| **CollectionEditDrawer.tsx** | 🔴 High | Edits collection metadata. | Ensure API updates correctly map to new schema. |
| **RelatedFilesSection.tsx** | 🔴 Critical | Manages file attachments. Uses `related_files` string array. | **Major Refactor**: Switch to `ModelFile` entity. Remove path parsing. |
| **PrintSettingsSection.tsx** | 🟡 Medium | Reads `printSettings` JSON. | Ensure `safePrintSettings` prop maps correctly to DB columns. |
| **TagsSection.tsx** | 🟡 Medium | Uses `currentModel.tags` (JSON array). | Ensure hydration logic in parent populates this array. |
| **NotesSection.tsx** | 🟢 Safe | String manipulation of `notes` field. | No changes if `notes` remains a text column. |
| **SourceSection.tsx** | 🟢 Safe | Simple URL string. | No changes. |

### Batch 5: Visuals & Misc (Safe)
| Component | Status | Impact Analysis | Refactor Plan |
| :--- | :--- | :--- | :--- |
| **ModelViewer3D.tsx** | 🟢 Safe | Pure display component. Depends on `modelUrl`. | No changes needed if URL served correctly. |
| **Grid3DViewer.tsx** | 🟢 Safe | Variant. | - |
| **SharedModelScene.tsx** | 🟢 Safe | Three.js logic. | - |
| **ModelMesh.tsx** | 🟢 Safe | R3F mesh. | - |
| **ThemeToggle.tsx** | 🟢 Safe | UI only. | - |
| **ThemeProvider.tsx** | 🟢 Safe | Context. | - |
| **ErrorBoundary.tsx** | 🟢 Safe | Utility. | - |
| **ImageWithFallback.tsx** | 🟢 Safe | Utility. | - |
| **LayoutControls.tsx** | 🟢 Safe | UI state. | - |
| **LayoutSettingsContext** | 🟢 Safe | LocalStorage state. | - |
| **ModelPreviewSection.tsx** | 🟢 Safe | Display. | - |
| **SelectionModeControls** | 🟢 Safe | UI state. | - |
| **SiblingsSection.tsx** | 🟡 Low | Display logic. | Check if "siblings" concept holds with DB. |
| **TagsContext.tsx** | 🟡 Low | Global tags list. | Update `fetchTags` to pull from `Tag` table. |
| **TagsInput.tsx** | 🟢 Safe | UI component. | - |
| **PrinterStatusHub.tsx** | 🟡 Low | Spoolman/OctoPrint. | Likely safe. |
| **DemoPage.tsx** | 🟢 Safe | Static. | - |

## ✅ Audit Summary
- **Total Files Audited**: 48
- **Critical Refactors**: `App`, `ModelHubView`, `ProjectView`, `RelatedFilesSection`, `BulkEditDrawer`, `GlobalDialogs`
- **Schema Adjustments**: Need JSON columns for `userDefined`, `gcodeData`, `printSettings`.
- **Next Step**: Begin Phase 1 (Schema Migration).
