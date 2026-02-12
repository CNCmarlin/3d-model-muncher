# Task List: 3D Model Muncher Restoration

## ✅ Completed: Settings Page Restoration (Frontend)
- [x] **Settings Page** (Collections, Categories, Tags)
- [x] **Verification** (Parity & Build Checks)

---

## 🚀 Phase: Server Rework (Backend Parity)
- [x] Audit `server_restoration_checklist.md` <!-- id: 1 -->
- [x] Verify logic for all 66 endpoints <!-- id: 2 -->
- [x] **Debug Empty Collections (Frontend)** <!-- id: 4 -->
- [x] **Server Restoration & Parity** <!-- id: 0 -->

## 🛡️ Phase: Frontend Parity Check
- [x] **Inventory Legacy App.tsx** <!-- id: 10 -->
- [x] **Map & Verify** <!-- id: 13 -->
- [x] **Restoration** (Theme, Filters, Worker ID, Normalization) <!-- id: 16 -->

## 🧠 Phase: Database Migration Analysis
- [x] **Architecture Mapping** ([MUNCHIE_ARCHITECTURE.md](file:///c:/Users/Michael/VSCodeProjects/3d-model-muncher/3d-model-muncher/MUNCHIE_ARCHITECTURE.md)) <!-- id: 18 -->
- [x] **Risk Assessment** (Dual-Running Strategy) <!-- id: 30 -->
- [x] **Frontend Audit** ([FRONTEND_DB_AUDIT.md](file:///c:/Users/Michael/VSCodeProjects/3d-model-muncher/3d-model-muncher/docs/refactor-2026/FRONTEND_DB_AUDIT.md)) <!-- id: 50 -->

---

## 🛠️ Phase: Migration Implementation (Execution)
**Active Branch**: `refactor/sqlite-migration-2026`

### Phase 1: Foundation (Setup)
- [x] Install **Prisma**, **Zod**, **React Query** <!-- id: 32 -->
- [x] Create [schema.prisma](file:///c:/Users/Michael/VSCodeProjects/3d-model-muncher/3d-model-muncher/prisma/schema.prisma) <!-- id: 33 -->
- [x] **Define Zod Schemas** ([SCHEMA_BRIDGE.md](file:///c:/Users/Michael/VSCodeProjects/3d-model-muncher/3d-model-muncher/docs/refactor-2026/SCHEMA_BRIDGE.md)) <!-- id: 55 -->
- [x] **Create Service Layer** (`server/services/`) <!-- id: 57 -->
- [x] Generate Client & Singleton (`db.js`) <!-- id: 34 -->
- [x] **Zero File** Investigation (659 models)
    - [x] Diagnose cause (likely loose file matching logic)
    - [x] Implement fallback matching in `migrate-munchies.ts`
    - [x] Verify file association count increases significantly

### Phase 2: Shadow Ingestor
- [x] Write `scripts/migrate-munchies.ts` (**Dry Run Mode**) <!-- id: 36 -->
- [x] Handle **Reconciliation** (Renames vs Deletes) <!-- id: 37 -->
- [x] Run Migration & Verify Data <!-- id: 38 -->

### Phase 2.6: Strict Verification Dashboard
- [x] **Backend**: Create `legacyAudit.js` for realtime filesystem stats <!-- id: 60 -->
- [x] **Frontend**: Update `MigrationStatus.tsx` to show "Legacy vs DB" comparison <!-- id: 61 -->
- [x] **Verify**: Ensure counts (Models, Files, Collections) match exactly.

### Phase 3: The Flip (Switchover)
**Goal**: Switch API endpoints from filesystem/JSON to Prisma+Zod, implement Service Layer pattern, upgrade Frontend to React Query with Optimistic Updates.

> **🔄 DUAL-RUNNING STRATEGY** (Zero-Risk Deployment):
> - **Legacy System**: Keep all munchie/JSON code operational (unchanged)
> - **Database System**: Create new `_db.js` versions alongside originals
> - **Feature Flag**: Toggle in Settings → "Use Database Backend" (true/false)
> - **File Naming**: `file.js` (legacy) + `file_db.js` (database) + `file.js.bak` (backup)
> - **Routing**: Server loads either legacy OR database version based on config
> - **Benefit**: Instant rollback, A/B testing, easy debugging by comparing outputs

> **⚠️ CRITICAL EXECUTION ORDER**:
> 1. **Feature Flag Setup (3.0) MUST be completed FIRST** - Enables dual-running
> 2. **File Watcher (3.6) Database version** - New files sync to DB when flag enabled
> 3. **Zod Schemas (3.2) required** before ANY endpoint refactoring
> 4. **Service Layer (3.1) required** before React Query hooks (3.3)
> 5. **React Query setup (3.3) required** before component refactoring (3.4)
>
> **✅ SAFE TO PARALLELIZE**:
> - Backend endpoints (3.1) || Frontend service layer (3.3)
> - Individual components in 3.4 can be refactored incrementally
>
> **🛑 REQUIRES MANUAL VERIFICATION** (marked with 🔍):
> - Legacy vs Database output comparison (same results?)
> - Feature flag toggle works correctly
> - Performance difference measurement
> - Prisma schema has `isDeleted` field

#### 3.0: Dual-Running Infrastructure Setup
> **Dependencies**: None (foundation for all Phase 3 work)  
> **Risk Level**: 🟢 LOW - Non-destructive, additive only  
> **Must Complete BEFORE**: Any `_db.js` file creation

- [ ] **Add `isDeleted` field to Prisma schema**
    - [ ] Add `isDeleted Boolean @default(false)` to Model table
    - [ ] Run `npx prisma migrate dev --name add_soft_delete`
    - [ ] Verify migration applied successfully
- [ ] **Feature Flag Implementation**
    - [ ] Add `useDatabaseBackend: false` to `data/config.json`
    - [ ] Add environment variable `USE_DATABASE_API` to `.env.example`
    - [ ] Create config helper: `server-utils/configHelper.js` with `isDatabaseMode()` function
- [ ] **UI Toggle in Settings**
    - [ ] Add "Database Backend" toggle to `GeneralSettings.tsx`
    - [ ] Wire to config API: `POST /api/config/update`
    - [ ] Add warning: "⚠️ Experimental - Switch back if issues occur"
    - [ ] Show current mode indicator in UI (badge: "Legacy Mode" vs "Database Mode")
- [ ] **Routing Infrastructure**
    - [ ] Create `server-utils/routeSelector.js` to load legacy OR db routes
    - [ ] Update `server.js` to use conditional routing based on flag
    - [ ] Add startup log: `🚀 Running in [LEGACY/DATABASE] mode`
- [ ] **🔍 TEST**: Toggle feature flag and restart server, verify correct mode loads

#### 3.1: Backend API Refactor (Service Layer Pattern)
> **Dependencies**: 3.0 (Feature Flag) + 3.2 (Zod schemas) + 3.6 (File Watcher DB version)  
> **Risk Level**: 🟡 MEDIUM - Dual-running mitigates risk  
> **Can Parallelize**: Service creation (4 services) can be done in parallel  
> **File Strategy**: Create `*_db.js` alongside legacy files

- [ ] **🔍 VERIFY FIRST**: Feature flag system (3.0) is working correctly
- [ ] **Create Service Layer** (`server/services/`)
    - [ ] Create `collectionService_db.js` (CRUD + hierarchy queries, Prisma-based)
    - [ ] Create `tagService_db.js` (Tag management + auto-tag integration, Prisma-based)
    - [ ] Create `fileService_db.js` (ModelFile management + disk sync validation, Prisma-based)
    - [ ] Enhance `modelService.js` → Create `modelService_db.js` (Prisma queries, Zod validation)
- [ ] **Backup Existing Routes**
    - [ ] Copy `server/routes/models.js` → `server/routes/models.js.bak`
    - [ ] Copy `server/routes/collections.js` → `server/routes/collections.js.bak` (if exists)
    - [ ] Copy `server/routes/tags.js` → `server/routes/tags.js.bak` (if exists)
- [ ] **Create Database Route Files** (14 critical routes)
    - [ ] Create `server/routes/models_db.js` (empty shell, copy structure from models.js)
    - [ ] Create `server/routes/collections_db.js` (if needed)
    - [ ] Create `server/routes/tags_db.js` (if needed)
- [ ] **Refactor Core Endpoints in `*_db.js` files**
    - [ ] `GET /api/models` → Use Prisma `findMany` + Zod validation + pagination
    - [ ] `GET /api/models/:id` → Use Prisma `findUnique` + include files/tags/collection
    - [ ] `POST /api/save-model` → Optimistic update pattern + Zod validation
    - [ ] `DELETE /api/models/:id` → Soft delete (`isDeleted: true`)
    - [ ] `GET /api/collections` → Prisma hierarchy query + `_count` for performance
    - [ ] `POST /api/collections` → Validate with Zod, update DB
    - [ ] `GET /api/tags` → Return from `Tag` table (not JSON)
    - [ ] `POST /api/tags/bulk-assign` → Transaction-safe bulk operations
    - [ ] `POST /api/models/upload` → Create draft entity in DB first
    - [ ] `POST /api/collections/auto-import` → Job queue pattern (Phase 4 target)
    - [ ] `POST /api/import/thingiverse` → Zod validation of external API
    - [ ] `GET /api/search` → Server-side search with Prisma `where` + `contains`
    - [ ] `POST /api/models/bulk-edit` → Single transaction batch updates
    - [ ] `GET /api/admin/migration-status` → Already exists, verify accuracy
- [ ] **Update Conditional Routing** in `server.js`
    - [ ] Use `routeSelector.js` to load either `models.js` OR `models_db.js`
    - [ ] Ensure feature flag controls which version loads
- [ ] **🔍 TEST**: Toggle feature flag, restart, verify correct routes load
- [ ] **🔍 MANUAL COMPARISON**: Test same API call in both modes, compare JSON output

#### 3.2: Zod Schema Layer (Runtime Validation)
> **Dependencies**: None (foundation layer)  
> **Risk Level**: 🟡 MEDIUM - Must match Prisma schema exactly  
> **Can Parallelize**: All 5 schema files can be created simultaneously

- [ ] **🔍 ADD DATABASE INDEXES** (before heavy testing): `path_hash`, `collectionId`, `tags`
- [ ] **Create Schema Files** (`server/schemas/`)
    - [ ] `core.ts` → ID, Path, Timestamp primitives
    - [ ] `model.ts` → ModelSchema + ModelFormSchema + API response envelope
    - [ ] `collection.ts` → CollectionSchema + MoveCollectionSchema
    - [ ] `file.ts` → FileSchema + PrimaryFileRule middleware check
    - [ ] `tag.ts` → TagSchema + BulkAssignSchema
- [ ] **Integrate Validation** in all POST/PUT endpoints
    - [ ] Add `.parse()` for request bodies
    - [ ] Add `.parse()` for response (paranoia check)
    - [ ] Handle Zod errors gracefully (return 400 with field-level errors)

#### 3.3: Frontend - React Query Migration
> **Dependencies**: 3.1 (Backend API must exist) + 3.2 (Zod for typing)  
> **Risk Level**: 🟡 MEDIUM - Major architectural change  
> **Can Parallelize**: Services (4) || Hooks (8) can be built in parallel

- [ ] **Setup Query Client** (`src/api/queryClient.ts`)
    - [ ] Configure default options (staleTime, cacheTime, retry)
    - [ ] Add global error handler
    - [ ] Wrap App in `QueryClientProvider`
- [ ] **Create Service Layer** (`src/api/services/`)
    - [ ] `modelService.ts` → Typed API functions (getModels, getModel, updateModel, deleteModel)
    - [ ] `collectionService.ts` → getCollections, createCollection, moveCollection
    - [ ] `tagService.ts` → getTags, bulkAssignTags
    - [ ] `fileService.ts` → getFiles, setPrimary
- [ ] **Create Query Hooks** (`src/hooks/queries/`)
    - [ ] `useModels.ts` → Wraps modelService.getModels with useQuery
    - [ ] `useModel.ts` → Single model with related data
    - [ ] `useCollections.ts` → Collection hierarchy
    - [ ] `useTags.ts` → Available tags list
- [ ] **Create Mutation Hooks** (`src/hooks/mutations/`)
    - [ ] `useUpdateModel.ts` → Optimistic update pattern
    - [ ] `useDeleteModel.ts` → Optimistic delete
    - [ ] `useBulkEditModels.ts` → Batch transaction
    - [ ] `useCreateCollection.ts` → Optimistic hierarchy update

#### 3.4: Frontend - Component Refactor (Priority Order)
> **Dependencies**: 3.3 (Query hooks must exist)  
> **Risk Level**: 🟢 LOW-MEDIUM - Incremental, can rollback per component  
> **Can Parallelize**: Each component can be refactored independently (use feature branches)

- [ ] **Critical Components** (Block UI if broken)
    - [ ] `App.tsx` → Remove initial fetch, add Suspense boundaries
    - [ ] `ModelHubView.tsx` → Replace fetch with useModel hook + Optimistic UI
    - [ ] `ModelGrid.tsx` → Replace useModelData with useModels hook
    - [ ] `BulkEditDrawer.tsx` → Integrate React Hook Form + Zod + useBulkEditModels
    - [ ] `CollectionCard.tsx` → Use `_count` from DB (not modelIds.length)
    - [ ] `FilterSidebar.tsx` → URL State Sync (useSearchParams)
- [ ] **High Impact Components**
    - [ ] `RelatedFilesSection.tsx` → Query ModelFile table, validate vs disk
    - [ ] `CollectionEditDrawer.tsx` → Optimistic update
    - [ ] `ProjectView.tsx` → dnd-kit integration + Optimistic UI
    - [ ] `ModelUploadDialog.tsx` → Draft entity pattern
- [ ] **Medium Impact Components**
    - [ ] `TagsSection.tsx` → Use Radix Combobox + useTags hook
    - [ ] `SpoolmanWidget.tsx` → Service Layer as Anti-Corruption Layer
    - [ ] `AutoImportDialog.tsx` → React Hook Form + Job queue polling
    - [ ] `ThingiverseImportDialog.tsx` → Zod validation

#### 3.5: State Management & Performance
- [ ] **URL State Sync** (Filters, Search, View Mode)
    - [ ] Move filter state from Context to URL params (`?tags=foo&collection=bar`)
    - [ ] Implement useSearchParams wrapper in FilterSidebar
    - [ ] Ensure bookmarks restore full state
- [ ] **Remove Legacy Hooks**
    - [ ] Delete `useModelData.ts` (replaced by useModels)
    - [ ] Delete `useRelatedFiles.ts` (DB owns relationships now)
    - [ ] Update `useFilteredModels.ts` → Server-side filtering (Phase 4 optimization)
- [ ] **Suspense Boundaries**
    - [ ] Add `<Suspense>` to App.tsx with skeleton loader
    - [ ] Add per-view suspense (ModelGrid, CollectionView)
    - [ ] Prevent "Popcorn Effect" layout shifts

#### 3.6: File Watcher Upgrade ⚠️ **CRITICAL FOR DATABASE MODE**
> **Dependencies**: 3.0 (Feature Flag)  
> **Risk Level**: 🟡 MEDIUM - Dual-running reduces risk (legacy still works)  
> **Must Complete BEFORE**: Enabling database mode in production  
> **File Strategy**: Keep `collectionScanner.js` (legacy), create `collectionScanner_db.js` (database)

- [ ] **Backup Legacy Scanner**
    - [ ] Copy `server-utils/collectionScanner.js` → `server-utils/collectionScanner.js.bak`
    - [ ] Verify legacy version still works unchanged
- [ ] **Create `collectionScanner_db.js`** (Database version)
    - [ ] Copy structure from `collectionScanner.js` as starting point
    - [ ] Replace JSON file writes with Prisma `upsert` operations
    - [ ] On file add: `prisma.modelFile.create()` + link to parent Model
    - [ ] On file delete: Set `isDeleted: true` OR remove record (decide which)
    - [ ] On file modify: Update `size`, `updatedAt` timestamp
    - [ ] Throttle events (debounce 500ms to batch rapid changes)
- [ ] **Update Chokidar Integration**
    - [ ] Modify file watcher startup in `server.js`
    - [ ] Use `isDatabaseMode()` to choose which scanner to load
    - [ ] If database mode: `require('./collectionScanner_db')`
    - [ ] If legacy mode: `require('./collectionScanner')`
- [ ] **🔍 BLOCKER**: Verify database scanner works before proceeding to 3.1
- [ ] **🔍 TEST**: Add a new `.stl` file in database mode, verify it appears in DB within 1 second
- [ ] **🔍 TEST**: Delete a file in database mode, verify `isDeleted` flag updates
- [ ] **🔍 MANUAL COMPARISON**: Add same file in both modes, compare resulting records

#### 3.7: Testing & Verification
> **Dependencies**: All of 3.1-3.6  
> **Risk Level**: 🟢 LOW - Non-destructive  
> **Manual Intervention**: Most tests require USER to interact with UI

- [ ] **API Testing** (Can use Postman/curl or automated)
    - [ ] Test all 14 refactored endpoints with Postman/curl
    - [ ] Verify Zod validation errors return proper 400s
    - [ ] **🔍 MANUAL**: Test optimistic update rollback scenarios (disconnect network mid-save)
    - [ ] Verify soft delete (is_deleted flag) works
- [ ] **Frontend Testing** (Requires USER interaction)
    - [ ] **🔍 MANUAL**: Test CRUD operations in UI (Create, Read, Update, Delete)
    - [ ] **🔍 MANUAL**: Test bulk edit with 10+ models
    - [ ] **🔍 MANUAL**: Test filter + search combinations
    - [ ] **🔍 MANUAL**: Test collection hierarchy drag-and-drop
    - [ ] Verify URL state persists on refresh (automated)
- [ ] **Performance Validation**
    - [ ] **🔍 MANUAL**: Measure load time for 1000+ models (target: <2s) - Chrome DevTools
    - [ ] Verify React Query cache is working (no duplicate requests) - Network tab
    - [ ] Check Network tab for unnecessary refetches
- [ ] **Data Integrity**
    - [ ] Run migration verification script on 10+ samples (automated)
    - [ ] Verify zero-file models count = 0
    - [ ] Verify tag counts match between DB and legacy
    - [ ] Check that collection hierarchy is correct

### Phase 4: Cleanup & Polish
- [ ] Validate Frontend Parity <!-- id: 44 -->
- [ ] Implement **Suspense Boundaries** <!-- id: 59 -->
- [ ] Delete `*-munchie.json` files <!-- id: 45 -->

---

## ✅ Final Checks from Previous Phases
- [x] All 66 endpoints from `server.js.bak` located and verified.
- [x] `endpoint_list_clean.txt` vs Current Codebase: 100% Match.
