# SettingsPage.tsx.bak Inventory (Complete Pass 1)

This document contains a comprehensive, line-by-line inventory of the legacy monolithic `SettingsPage.tsx` file (4100 lines).

## 1. Imports & Constants
- **UI Libs**: Radix/Lucide icons, Sonner (toast).
- **Domain Types**: `Model`, `Category`, `Collection`, `AppConfig`.
- **Utils**: `ConfigManager`, `themeUtils`, `thumbnailUtils`.
- **Sub-components**: `AutoImportDialog`, `CollectionEditorDialog`, `IntegrationsSettings`.

## 2. Component State (Hooks)
- **Tabs**: `selectedTab` (controlled by `initialTab` prop).
- **Config**: `localConfig` (synced with server), `unsavedPrimaryColor`.
- **Collections**: `collectionsList` (local state), `editorCollection`, `createMode`.
- **Categories**: `localCategories` (local state + Drag-n-Drop state `draggedIndex`).
- **Tags**: `selectedTag`, `viewTagModels`, `tagSearchTerm`.
- **Integrity**: `hashCheckResult`, `isHashChecking`, `isHealing`, `corruptedModels`, `healPreviewReport`.
- **Backup**: `isCreatingBackup`, `backupHistory`, `restoreStrategy`, `collectionsRestoreStrategy`.
- **Thumbnails**: `isGeneratingThumbnails`.
- **Dialogs**: `isReverting`, `isRenameDialogOpen`, `isCategoryRenameDialogOpen`, `isAddCategoryDialogOpen`, `isHealDialogOpen`.

## 3. Effects (Side Effects)
- **Mount**: Load server config (`/api/load-config`).
- **Mount**: Check backups availability (`checkBackups`).
- **Prop Sync**: derived `localConfig` from `config` prop.
- **Deep Links**: Handle `settingsAction` (hash-check/generate) automatically via `useEffect`.
- **Feedback**: Watch `saveStatus` to trigger Toast notifications.
- **Collections**: Listener for `collection-updated` window event to refresh list.

## 4. Functions & Handlers
- **Config**:
  - `handleSaveConfig`: Dual save (Local + Server).
  - `handleLoadServerConfig`: Resets local overrides.
  - `handleConfigFieldChange`: Updates nested paths.
- **Collections** (Lines 2619-2684):
  - `handleCreateCollection`: Sets mode (manual/folder) and opens editor.
  - `handleSaveCollection`: POSTs to `/api/collections`. triggers `collection-updated`.
  - `handleDeleteAllCollections`: **Destructive action** to wipe all collections.
  - `handleEditCollection`: Opens editor with selected item.
  - `fetchCollections`: Re-fetches list from server.
- **Categories**:
  - `handleSaveCategories`: Saves order.
  - `handleRenameCategory`: Bulk updates model metadata.
  - `handleDeleteCategory`: Moves models to "Uncategorized".
  - `startRenameCategory`: Opens dialog.
- **Tags**:
  - `handleRenameTag`: Bulk updates model metadata.
  - `handleDeleteTag`: Removes tag from all models.
  - `getTagStats`: Calculates global usage stats.
- **Integrity**:
  - `handleRunHashCheck`: Core verification logic (MD5 vs Expected).
  - `handleRunHealPreview`: Generates report of proposed changes.
  - `handleConfirmHeal`: Executes the heal report actions.
  - `handleRevert`: Rolls back using `.bak` files.
  - `handleRemoveDuplicates`: Deletes duplicate files from disk.
  - `handleRegenerate`: Re-creates `munchie.json` for a model.
- **Backup**:
  - `handleCreateBackup`: Zips metadata to `.gz`.
  - `handleRestoreFromFile`: Parses uploaded backup and applies strategy (Merge/Replace).

## 5. UI Structure (Tabs)
1.  **General**: Appearance (Theme/Color), Model Card Options, View Options.
2.  **Collections**:
    - Toolbar: New (Folder/Manual), Auto-Import, Delete All.
    - List: Renders collection items with model counts.
3.  **Categories**:
    - Drag-and-drop list.
    - "Unmapped Categories" section (detects unused categories).
4.  **Tags**:
    - Stats dashboard.
    - Searchable, virtualized list.
5.  **Backup & Restore**:
    - Create button.
    - Restore strategy selectors.
    - History list.
6.  **Integrity**:
    - Action buttons (Check, Generate, Heal).
    - Results sections (Corrupted files list, Duplicates list).
7.  **Integrations**: Renders `IntegrationsSettings` component.
8.  **Config**: Import/Export/Reset JSON.
9.  **Support**: Donation/GitHub links.

## 6. Dialogs (Rendered at bottom)
- `RenameTagDialog`
- `HealPreviewDialog` (Report view)
- `RenameCategoryDialog`
- `DeleteCategoryConfirmDialog`
- `AddCategoryDialog`
- `ViewTagModelsDialog` (Grid view)
- `DuplicateGroupDialog` (Inline selection)
