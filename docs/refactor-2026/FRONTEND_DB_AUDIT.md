# 🔍 Frontend DB Impact Audit & Standardization

> **Goal**: Systematically review every frontend component for dependencies on the "Munchie" filesystem/JSON structure and recommend **Industry Standard** solutions.
> **Scope**: 48+ files in `src/components/`.

## 📋 Technology Standards
| Concept | Current Approach | **Industry Standard Goal** |
| :--- | :--- | :--- |
| **API Architecture** | Direct `fetch` in components | **Service Layer (Adapter Pattern)**: Typed API functions (`api/services/*`) wrapped by TanStack Query. Decouples UI from Backend endpoints. |
| **Data Fetching** | `useEffect` + manual `fetch` | **TanStack Query (React Query)**: Auto-caching, deduping, background refetch. |
| **Type Safety** | Typescript interfaces (Trust) | **Zod**: Runtime schema validation at the API boundary. Trust nothing. |
| **Forms** | Manual `useState` | **React Hook Form + Zod Resolver**: Clean validation, dirty states, performance. |
| **State** | Prop Drilling / Context Heap | **URL State** (Filters/Search) > **Zustand** (Global UI) > **React Query** (Server Data). |
| **Image Handling** | Native `<img>` | **WebP + Intersection Observer**: Lazy load heavy 3D previews. |

---

## 🏗️ Components Inventory

### Batch 1: Dialogs & Imports
| Component | Status | Impact Analysis | **Industry Standard Implementation** |
| :--- | :--- | :--- | :--- |
| **AutoImportDialog.tsx** | 🔴 Needs Rework | Calls `/api/collections/auto-import`. Strategy logic needs updating. | **React Hook Form**. Use a server-side "Job" queue with polling (`useQuery` refetchInterval). |
| **ModelUploadDialog.tsx** | 🔴 Needs Rework | Heavy usage of `isProjectRoot` and physical folder creation. | **React Dropzone**. Use "Draft" entity in DB. Don't block UI. |
| **ThingiverseImportDialog.tsx** | 🟡 Update API | Calls `/api/import/thingiverse`. | **Zod schema** for validating external API response before ingestion. |
| **ProjectFolderDialog.tsx** | 🟡 Update API | Calls `/api/models/upload-document`. | Consolidate into a generic `FileUploader` component with **Radix UI**. |
| **GlobalDialogs.tsx** | 🔴 High | Orchestrator for key dialogs. | **Zustand Store** (`useDialogStore`) to manage open/close state. |

### Batch 2: Views & Grids
| Component | Status | Impact Analysis | **Industry Standard Implementation** |
| :--- | :--- | :--- | :--- |
| **ModelHubView.tsx** | 🔴 Critical | Deep dependency on `related_files` (string[]) and `/api/save-model`. | **Service Layer** (`ModelService.getDetails`). Optimistic Updates. |
| **CollectionCard.tsx** | 🟠 Needs Update | Uses `modelIds.length` for count. | **Computed Field** (`_count`) from DB. Avoid fetching IDs on client. |
| **ModelGrid.tsx** | 🟡 Low Impact | Sorting depends on `lastModified`. | **Virtualization** if list >1000. Server-side pagination. |
| **ModelCard.tsx** | 🟢 Safe | Mostly display-only. | **Image Optimization**: Serve WebP thumbnails. Use `IntersectionObserver` to defer loading. |
| **ProjectView.tsx** | 🔴 Critical | Manages Build Plates. | **dnd-kit** for drag-and-drop. **Optimistic UI**. |
| **Views/CollectionView.tsx** | 🟡 Update Needed | Displays collection children. | **URL Params** (`?view=grid`). Avoid internal state for navigation. |

### Batch 3: Settings & Core
| Component | Status | Impact Analysis | **Industry Standard Implementation** |
| :--- | :--- | :--- | :--- |
| **SettingsPage.tsx** | 🟢 Safe | Router component. | - |
| **SpoolmanWidget.tsx** | 🟡 JSON Dependency | Relies on `userDefined` and `gcodeData` JSON blobs. | **Service Layer** (`SpoolmanService`) acting as an Anti-Corruption Layer. |
| **FilterSidebar.tsx** | 🟡 Hydration | Expects deep object (tags, collections). | **URL State Sync**: `?tags=foo,bar`. Bookmarks must restore state. |
| **App.tsx** | 🔴 Critical | Orchestrates all data fetching. | **Suspense Boundaries**. Remove manual initial fetch. Let components fetch asynchronously. |
| **useModelData.ts** | 🔴 Critical | Fetches `/api/models`. | **Delete**. Replace with specific Query Hooks wrappers around Service Layer. |
| **useFilteredModels.ts** | 🟡 High Impact | Filters based on object props. | **Server-Side Search**. Move logic to Prisma `where` clauses. |
| **useRelatedFiles.ts** | 🟠 Tech Debt | Checks for physical `-munchie.json` files. | **Delete**. DB now owns relationships. **Verification**: Measure data integrity during migration. |

### Batch 4: Editor Components
| Component | Status | Impact Analysis | **Industry Standard Implementation** |
| :--- | :--- | :--- | :--- |
| **BulkEditDrawer.tsx** | 🔴 Critical | Handles mass updates. | **React Hook Form**. Submit as single transaction batch. |
| **CollectionEditDrawer.tsx** | 🔴 High | Edits collection metadata. | **Optimistic Update**. |
| **RelatedFilesSection.tsx** | 🔴 Critical | Manages file attachments. | **Table Component**. Validate `ModelFile` integrity vs Disk. |
| **PrintSettingsSection.tsx** | 🟡 Medium | Reads `printSettings` JSON. | **Strict Zod Types**. |
| **TagsSection.tsx** | 🟡 Medium | Uses `currentModel.tags` (JSON array). | **Combobox** (Radix). |
| **NotesSection.tsx** | 🟢 Safe | String manipulation of `notes` field. | - |
| **SourceSection.tsx** | 🟢 Safe | Simple URL string. | - |

### Batch 5: Visuals & Misc (Safe)
| Component | Status | Impact Analysis | **Industry Standard Implementation** |
| :--- | :--- | :--- | :--- |
| **ModelViewer3D.tsx** | 🟢 Safe | Pure display logic. | **Suspense**. Show loader while 3D assets stream. |
| **ThemeToggle.tsx** | 🟢 Safe | UI state. | - |
| **ErrorBoundary.tsx** | 🟢 Safe | Utility. | **Sentry** or similar logging in production. |

---

## 🚧 Architectural Risks & Trade-offs
1.  **The "Offline" Gap**: Moving to a DB means users can no longer manually edit JSON files to fix data via text editor.
    *   *Mitigation*: Build a "Export Metadata" feature (Sidecar Generator) in Phase 5 for portability/backups.
2.  **App.tsx Bloat**: Removing the initial fetch can cause layout shifts ("Popcorn Effect").
    *   *Mitigation*: Implement proper **Suspense Boundaries** and Skeleton Loaders at the `App` or `Layout` level.
3.  **Migration Data Integrity**: Deleting `useRelatedFiles` assumes the DB migration captured all relationships correctly.
    *   *Mitigation*: The "Migration Health Check" (Phase 2.5) must explicitly verify that `ModelFile` counts match the legacy file counts.

## ✅ Recommendation Summary
-   **Architecture**: Create `api/services/` (Adapter Pattern) before implementing TanStack Query.
-   **State**: Move Filter logic to URL Search Params. Use Zustand only for global UI config (Theme, Sidebar open/close).
-   **Performance**: Optimize images (WebP) and use Suspense for smooth loading.
-   **Safety**: Use Zod to validate the new Database API responses. Don't assume the DB migration is perfect.
