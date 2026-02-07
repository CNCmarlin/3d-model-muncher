# Project Catchup Documentation

> [!NOTE]
> This document aggregates the current status, plans, and recent achievements of the project to help you get up to speed quickly.

---

## 1. Project Task Board (`task.md`)

**Current Focus**: Restoring Settings Page Feature Parity (Pass 1 & 2)

### Status
- [ ] **Pass 1: High-Level Inventory**
    - [ ] Analyze `SettingsPage.tsx.bak` for all Tabs/Sections
    - [ ] Document Feature List
- [ ] **Pass 2: Drill-Down & Capture**
    - [ ] Extract Logic for Tags, Categories, Backup, Integrity
- [ ] **Pass 3: Re-Integration & Verification**
    - [ ] Verify/Fix all settings sub-components

---

## 2. Implementation Plan (`implementation_plan.md`)

**Goal**: Restore full feature parity to the Settings Page by systematically comparing the current refactored implementation against the `SettingsPage.tsx.bak` legacy file.

### Strategy: The 3-Pass System
1.  **Pass 1**: High-Level Inventory (Done)
2.  **Pass 2**: Drill-Down & Capture (Current)
3.  **Pass 3**: Re-Integration & Verification

---

## 3. Recent Achievements (`walkthrough.md`)

### BulkEditDrawer Refactor
- **Metric**: Reduced `BulkEditDrawer.tsx` from ~1900 lines to ~440 lines.
- **Components**: Created `BulkEditSection`, `BulkTagEditor`, `BulkRelatedFilesEditor`.
- **Hooks**: Created `useBulkEditForm`, `useBulkOperations`.

### Integrity Check Fix
- **Fix**: Resolved API conflict in `/hash-check` and added error handling for file system scans.

---

## 4. Refactoring Pattern Cheatsheet

| Pattern | Old Approach (Monolith) | New Approach (Refactored) |
| :--- | :--- | :--- |
| **State Management** | Multiple `useState` calls at top of component | Custom Hook (e.g., `useBulkEditForm`) |
| **UI Sections** | Hardcoded JSX blocks with repetitive styles | Reusable Components (e.g., `<BulkEditSection>`) |
| **API Calls** | Inline `fetch` with `if (!res.ok)` blocks | Dedicated Hooks (e.g., `useBulkOperations` handles save/toast) |
| **Dialogs** | Inline `<Dialog>` components controlled by state | Extracted Components (e.g., `<CollectionEditorDialog>`) |

---

## 5. Known Issues List

- [ ] **Settings Page**: "Collections" tab EXISTED in legacy file (Confirmed). Needs verification of feature parity.
- [ ] **Styles**: Tag input field in "General Settings" may have low contrast in Dark Mode.
- [ ] **Performance**: Large model libraries (>5000 items) may slow down the "Integrity Check" scan.
- [ ] **Legacy Code**: `SettingsPage.tsx.bak` contains dead code references to `AutoImportDialog` that might need porting.

---

## 6. API Endpoint Map

### Models (`server/routes/models.js`)
| Frontend Action | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **Save Model** | `/api/save-model` | POST | Updates `-munchie.json` metadata |
| **Load Model** | `/api/load-model?filePath=...` | GET | Reads model metadata |
| **Hash Check** | `/api/hash-check` | GET | Scans for duplicates/corruption |
| **Generate JSON** | `/api/generate-model-json` | POST | Creates metadata for 3MF/STL files |

### Collections (`server/routes/collections.js`)
| Frontend Action | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **List All** | `/api/collections` | GET | Returns all collections in `collections.json` |
| **Create/Edit** | `/api/collections` | POST/PUT | Creates or updates a collection |
| **Delete** | `/api/collections/:id` | DELETE | Removes collection (updates `collections.json`) |
| **Auto Import** | `/api/collections/auto-import` | POST | Scans directory for folder-based collections |
| **Cover Gen** | `/api/collections/generate-covers` | POST | Triggers sharp-based thumbnail generation |
