# Frontend Feature Inventory (Legacy App.tsx)

This document lists all features, state, and logic found in the legacy `App.tsx` (prior to refactoring). We use this to verify parity in the new codebase.

## 1. State & Providers
- [ ] **Providers**: `ThemeProvider`, `LayoutSettingsProvider`, `SpoolmanProvider`, `TagsProvider`.
- [ ] **Navigation**: View Switching (`models`, `settings`, `collections`, `collection-view`, `model-hero`, `demo`).
- [ ] **Config/Init**:
    - [ ] Hybrid Config Load (Local -> Server -> Default).
    - [ ] **Theme Persistence**: `useEffect` ensuring primary color is applied on config load.
- [ ] **Release Notes**: Logic to show notes once per version. (checked against `package.json` and localStorage).

## 2. Model Data & Filtering
- [ ] **Data Fetching**: `GET /api/models`, `GET /api/collections`.
- [ ] **Filtering**:
    - [ ] `handleFilterChange`: 
        - [ ] Global Search overrides Collection View (switches to 'models').
        - [ ] Auto-show `hidden` items when searching/filtering.
        - [ ] "Collections" pseudo-filter (hides models).
- [ ] **Sorting**: `currentSortBy` state.

## 3. Selection & Bulk Operations
- [ ] **Selection Mode**: `isSelectionMode`, `selectedModelIds`.
- [ ] **Shift-Click Range Selection**: `handleModelSelection` contains math for anchor-based range selection.
- [ ] **Bulk Edit**: `BulkEditDrawer`, opening logic, `pendingBulkCollectionId` (auto-open after creating collection).
- [ ] **Bulk Delete**: `handleBulkDelete` (supports `includeThreeMfFiles` toggle).

## 4. Collection Management
- [ ] **Navigation**: `activeCollection`, `openCollection` (sets ID set filter).
- [ ] **Refresh**: `refreshCollections` (reloads both collections and models).
- [ ] **Upload Logic**:
    - [ ] `handleCollectionUpload`: Decodes `col_Base64` ID to find physical folder path on disk.
- [ ] **Import Logic**:
    - [ ] `handleOpenImport`: Infers target folder from existing models in the collection.

## 5. UI/Layout
- [ ] **Responsive Sidebar**: Auto-collapse on `<1280px` screen width.
- [ ] **Printer Status Hub**: Integrated in Header.
- [ ] **Dialogs**:
    - [ ] Donation Dialog
    - [ ] Release Notes Dialog
    - [ ] Delete Confirmation
    - [ ] Thingiverse Import
    - [ ] Upload Dialog

## 6. Model Operations
- [ ] **Optimistic Updates**: `handleModelUpdate` updates state before server return.
- [ ] **Save API**: `POST /api/save-model`.

---
## Parity Check Log

| Feature | Status | Location (New) | Notes |
| :--- | :--- | :--- | :--- |
| **Theme Persistence** | ✅ | `ConfigContext` | Found in `ConfigProvider`. |
| **Shift-Click Select** | ✅ | `useSelectionMode.ts` | Anchor logic preserved. |
| **Upload Path Decode** | ✅ | `useGlobalDialogs.ts` | Preserved. |
| **Import Inference** | ✅ | `useGlobalDialogs.ts` | Preserved. |
| **Release Notes** | ✅ | `ConfigContext` | Preserved. |
| **Global Search Override**| ✅ | `useFilteredModels.ts`| Preserved. |
| **Default Filters** | ✅ | `useFilteredModels.ts` | **RESTORED:** Hook now accepts `initialFilters`. |
