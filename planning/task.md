# Task: Restore Settings Page Feature Parity

## Status
- [ ] **Pass 1: High-Level Inventory** <!-- id: 0 -->
    - [ ] Analyze `SettingsPage.tsx.bak` for all Tabs/Sections
        - **Findings**:
        - `General`: App settings, Theme, Thumbnails, Tag Management (Search, List, Edit/Delete tags)
        - `Categories`: List, Add/Edit/Delete, Unmapped detection
        - `Backup`: Create, Restore, History, Strategy
        - `Integrity`: Hash Check, Duplicates, Heal Preview, Corrupted Models
        - `Integrations`: (Modularized)
        - `Config`: Import/Export/Reset
        - `Support`: Donation/Links
        - `Experimental`: Lazy loaded
        - `Collections`: Management, New, Auto-Import, Delete All
        - **Note**: `Collections` WAS a distinct tab in `.bak` (Confirmed).
    - [ ] Document Feature List
- [ ] **Pass 2: Drill-Down & Capture** <!-- id: 1 -->
    - [ ] **Tag Management**: Extract `handleRenameTag`, `handleDeleteTag`, `inputs/dialogs` into `GeneralSettings` refactor.
    - [ ] **Category Management**: Extract `handleRenameCategory`, `handleDeleteCategory`, `unmappedCategories` logic.
    - [ ] **Backup Logic**: Extract `handleCreateBackup`, `handleRestoreBackup`, `backupHistory` logic.
    - [ ] **Integrity Logic**: Extract `handleRunHashCheck`, `handleRemoveDuplicates`, `loadCorruptedModels`, `Heal` logic.
    - [ ] **Collections (Bonus)**: Ensure `CollectionsSettings` is fully functional (already implemented, needs verification).
- [ ] **Pass 3: Re-Integration & Verification** <!-- id: 2 -->
    - [ ] **GeneralSettings**: Re-implement Tag Management (currently in file, verify parity).
    - [ ] **CategorySettings**: Re-implement full CRUD + Unmapped logic.
    - [ ] **BackupSettings**: Re-implement History + Strategy selectors.
    - [ ] **IntegritySettings**: Re-implement Hash Check + Heal Dialogs.
    - [ ] **Collections**: Verify the new Collections tab behaves as expected.
