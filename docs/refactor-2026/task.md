# Task List: 3D Model Muncher Restoration

**📝 Latest Session**: Feb 8, 2026 - React Query Component Migration (See `SESSION_SUMMARY.md`)  
**🚨 Critical Issue**: Model PATCH requests returning 400 - blocking all model updates

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
- [x] **Architecture Mapping** (`MUNCHIE_ARCHITECTURE.md`) <!-- id: 18 -->
- [x] **Risk Assessment** (Dual-Running Strategy) <!-- id: 30 -->
- [x] **Frontend Audit** (`FRONTEND_DB_AUDIT.md`) <!-- id: 50 -->

---

## 🛠️ Phase: Migration Implementation (Execution)
**Active Branch**: `refactor/sqlite-migration-2026`

### Phase 1: Foundation (Setup)
- [x] Install **Prisma**, **Zod**, **React Query** <!-- id: 32 -->
- [x] Create `schema.prisma` <!-- id: 33 -->
- [x] **Define Zod Schemas** (`SCHEMA_BRIDGE.md`) <!-- id: 55 -->
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

[x] **Add `isDeleted` field to Prisma schema**
    - [x] Add `isDeleted Boolean @default(false)` to Model table
    - [x] Run `npx prisma migrate dev --name add_soft_delete`
    - [x] Verify migration applied successfully
- [x] **Feature Flag Implementation**
    - [x] Add `useDatabaseBackend: false` to `data/config.json`
    - [x] Add environment variable `USE_DATABASE_API` to `.env.example`
    - [x] Create config helper: `server-utils/configHelper.js` with `isDatabaseMode()` function
- [x] **UI Toggle in Settings**
    - [x] Add "Database Backend" toggle to `GeneralSettings.tsx`
    - [x] Wire to config API: `POST /api/config/update`
    - [x] Add warning: "⚠️ Experimental - Switch back if issues occur"
    - [x] Show current mode indicator in UI (badge: "Legacy Mode" vs "Database Mode")
- [x] **Routing Infrastructure**
    - [x] Create `server-utils/routeSelector.js` to load legacy OR db routes
    - [x] Update `server.js` to use conditional routing based on flag
    - [x] Add startup log: `🚀 Running in [LEGACY/DATABASE] mode`
- [x] **🔍 TEST**: Toggle feature flag and restart server, verify correct mode loads

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

[x] **🔍 ADD DATABASE INDEXES** (before heavy testing): `collectionId` index added to Model table
- [x] **Create Schema Files** (`server/schemas/`)
    - [x] `core.ts` → ID, Path, Timestamp primitives + API envelopes + pagination
    - [x] `model.ts` → ModelSchema + ModelFormSchema + BulkEditSchema + API response envelope
    - [x] `collection.ts` → CollectionSchema + MoveCollectionSchema + Tree structure
    - [x] `file.ts` → FileSchema + PrimaryFileRule + Upload handling
    - [x] `tag.ts` → TagSchema + BulkAssignSchema + Statistics
    - [x] `index.ts` → Centralized exports
    - [x] **Enhanced BulkEditSchema** (Feb 2026) - Added category, license, designer, source, price, printTime, filamentUsage, hidden
- [x] **Integrate Validation** (will happen in 3.1 during endpoint refactoring)
    - [x] Add `.parse()` for request bodies (in service layer)
    - [ ] Add `.parse()` for response (paranoia check)
    - [x] Handle Zod errors gracefully (return 400 with field-level errors)

#### 3.3: Frontend - React Query Migration
> **Dependencies**: 3.1 (Backend API must exist) + 3.2 (Zod for typing)  
> **Risk Level**: 🟡 MEDIUM - Major architectural change  
> **Can Parallelize**: Services (4) || Hooks (8) can be built in parallel

- [x] **Setup Query Client** (`src/api/queryClient.ts`)  
    *(Completed in previous sessions)*
    - [x] Configure default options (staleTime, cacheTime, retry)
    - [x] Add global error handler
    - [x] Wrap App in `QueryClientProvider`
- [x] **Create Service Layer** (`src/api/services/`)  
    *(Completed in previous sessions)*
    - [x] `modelService.ts` → Typed API functions (getModels, getModel, updateModel, deleteModel)
    - [x] `collectionService.ts` → getCollections, createCollection, moveCollection, updateCollection
    - [x] `tagService.ts` → getTags, bulkAssignTags
    - [x] `fileService.ts` → getFiles, setPrimary
- [x] **Create Query Hooks** (`src/hooks/queries/`)  
    *(Completed in previous sessions)*
    - [x] `useModels.ts` → Wraps modelService.getModels with useQuery
    - [x] `useModel.ts` → Single model with related data + initialData support
    - [x] `useCollections.ts` → Collection hierarchy
    - [x] `useTags.ts` → Available tags list
- [x] **Create Mutation Hooks** (`src/hooks/mutations/`)  
    *(Completed in previous sessions)*
    - [x] `useUpdateModel.ts` → Optimistic update pattern
    - [x] `useDeleteModel.ts` → Optimistic delete
    - [x] `useBulkEditModels.ts` → Batch transaction
    - [x] `useCreateCollection.ts` → Optimistic hierarchy update
    - [x] `useUpdateCollection.ts` → Optimistic collection updates

#### 3.4: Frontend - Component Refactor (Priority Order)
> **Dependencies**: 3.3 (Query hooks must exist)  
> **Risk Level**: 🟢 LOW-MEDIUM - Incremental, can rollback per component  
> **Can Parallelize**: Each component can be refactored independently (use feature branches)

- [/] **Critical Components** (Block UI if broken)  
    **Session: Feb 8, 2026** - 3 of 6 completed
    - [ ] `App.tsx` → Remove initial fetch, add Suspense boundaries
    - [x] `ModelHubView.tsx` → Replaced fetch with useModel hook + Optimistic UI  
      - Uses `useModel`, `useUpdateModel`, `useDeleteModel`, `useUpdateCollection`
      - Optimistic updates implemented
      - Fixed AddToCollection/RemoveFromCollection dialogs
    - [x] `ModelGrid.tsx` → Using useCreateCollection hook for new collections  
      - Replaced direct fetch with `useCreateCollection` mutation
    - [~] `BulkEditDrawer.tsx` → **INCOMPLETE** - Hybrid strategy partially implemented  
      - ⚠️ `useBulkOperations.ts` has placeholder code, needs manual completion
      - Backend enhanced to support bulk fields in `modelService_db.js`
      - Hooks imported but not fully integrated in handleSave
    - [x] `CollectionCard.tsx` → Using `_count` from DB (completed in prior session)
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

[x] **Backup Legacy Scanner**
    - [x] Copy `server-utils/collectionScanner.js` → `server-utils/collectionScanner.js.bak`
    - [x] Verify legacy version still works unchanged
- [x] **Create `collectionScanner_db.js`** (Database version)
    - [x] Copy structure from `collectionScanner.js` as starting point
    - [x] Replace JSON file writes with Prisma `upsert` operations
    - [x] On file add: `prisma.modelFile.create()` + link to parent Model
    - [x] On file delete: Set `isDeleted: true` OR remove record (decided: hard delete for now)
    - [x] On file modify: Update `size`, `updatedAt` timestamp
    - [x] Throttle events (debounce 500ms to batch rapid changes)
- [x] **Update Chokidar Integration**
    - [x] Modify file watcher startup in `server.js`
    - [x] Use `routeSelector.getCollectionScanner()` to choose which scanner to load
    - [x] If database mode: loads `collectionScanner_db`
    - [x] If legacy mode: loads `collectionScanner`
- [x] **🔍 BLOCKER**: Verify database scanner works before proceeding to 3.1
- [ ] **🔍 TEST**: Add a new `.stl` file in database mode, verify it appears in DB within 1 second
- [ ] **🔍 TEST**: Delete a file in database mode, verify deletion handled correctly
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
