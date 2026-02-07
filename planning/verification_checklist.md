
# Settings Parity Verification Checklist

**Objective**: Ensure 1:1 functional parity between the new `****Settings.tsx` components and the legacy `SettingsPage.tsx.bak`.

## 1. CollectionsSettings.tsx
- [ ] **Spec**: `settings_collections.spec.md`
- [ ] **Legacy**: `SettingsPage.tsx.bak` (Lines 2618-2684, Handlers: `handleCreateCollection`, `handleSaveCollection`, `handleDeleteCollection`, `handleDeleteAllCollections`, `fetchCollections`)
- [ ] **Checks**:
    - [ ] "Manual Import" button present?
    - [ ] "Auto-Import" button & dialog present?
    - [ ] "New Collection" (Folder) button present?
    - [ ] "Delete All" button present (with confirmation)?
    - [ ] List View with "Edit" button?
    - [ ] Handler logic comparison (event dispatching matches?)

## 2. CategorySettings.tsx
- [ ] **Spec**: `settings_categories.spec.md`
- [ ] **Legacy**: `SettingsPage.tsx.bak` (Lines 2685-3000, Lines 1183-1400 Handlers)
- [ ] **Checks**:
    - [ ] Drag-and-Drop Structure (HTML5 `draggable`, `onDragStart` etc.)?
    - [ ] Unmapped Categories logic (detection from models)?
    - [ ] "Add Category" Dialog logic?
    - [ ] "Rename Category" Dialog logic (updating ALL models)?
    - [ ] "Delete Category" Dialog logic (moving to 'Uncategorized')?

## 3. GeneralSettings.tsx (Theme + View + Tags)
- [ ] **Spec**: `settings_general.spec.md`
- [ ] **Spec**: `settings_tags.spec.md` (Merged here?)
- [ ] **Legacy**: `SettingsPage.tsx.bak` (Lines 2400-2600 General, Lines 3000+ Tags)
- [ ] **Checks**:
    - [ ] Theme Color Picker (with simple input fallback)?
    - [ ] Default View Selector (Grid/List)?
    - [ ] Model Card Field Selectors?
    - [ ] **Tag Management**:
        - [ ] Tag Stats Dashboard (Total Tags, Usages etc.)? **Likely Missing** -> Check visually.
        - [ ] Tag List / Chips?
        - [ ] Rename Tag Handler (updating all model files)?
        - [ ] Delete Tag Handler (updating all model files)?

## 4. BackupSettings.tsx
- [ ] **Spec**: `settings_ops.spec.md` (Backup Section)
- [ ] **Legacy**: `SettingsPage.tsx.bak` (Lines 3030-3100, Lines 1660-1800 Handlers)
- [ ] **Checks**:
    - [ ] Create Backup Button (Async state)?
    - [ ] Restore Strategy Logic (Hash Match, Path Match, Force)?
    - [ ] Restore from File input logic?
    - [ ] Backup History List?

## 5. IntegritySettings.tsx
- [ ] **Spec**: `settings_ops.spec.md` (Integrity Section)
- [ ] **Legacy**: `SettingsPage.tsx.bak` (Lines 3100-3200, Lines 1400-1600 Handlers)
- [ ] **Checks**:
    - [ ] "Run Integrity Check" logic (Hash Queue)?
    - [ ] "Heal / Fix" Dialog logic (Regenerate munchie.json)?
    - [ ] Duplicate detection logic?

## 6. ConfigSettings.tsx
- [ ] **Spec**: `settings_config_mgmt.spec.md`
- [ ] **Legacy**: `SettingsPage.tsx.bak` (Lines 816-1022 Handlers)
- [ ] **Checks**:
    - [ ] Import JSON Logic?
    - [ ] Export JSON Logic?
    - [ ] Reset Config Logic?
