# Implementation Plan - Settings Page Parity Restoration

## Goal
Restore full feature parity to the Settings Page by systematically comparing the current refactored implementation against the `SettingsPage.tsx.bak` legacy file.

## User Review Required
> [!IMPORTANT]
> This plan follows a strict 3-pass approach as requested. **No code changes** will be made until Pass 3.

## Strategy: The 3-Pass System

### Pass 1: High-Level Inventory
**Objective**: Map out the "Shape" of the legacy settings page.
- Scan `SettingsPage.tsx.bak` to identify all high-level sections (Tabs), major state variables, and key functions.
- Output a list of "Features" that *should* exist.

### Pass 2: Drill-Down & Capture
**Objective**: Extract the genetic code of the missing features.
- For each item identified in Pass 1, read the specific code blocks from `.bak`.
- Store these "Reference Blocks" in a temporary artifact or scratchpad.
- **Critical Action**: granularly verify logic details (e.g., "Did the old tag manager handle empty strings differently?").

### Pass 3: Re-Integration & Verification
**Objective**: Transplant missing logic into the new architecture.
- Map the "Reference Blocks" to the new sub-components (e.g., `GeneralSettings.tsx`, `CollectionsSettings.tsx`).
- Identify gaps:
    - [ ] Missing UI elements
    - [ ] Missing Logic/Handlers
    - [ ] Changed Behavior (Bugs)
- Implement fixes to close the gaps.

## Execution Steps

### Phase 1: Inventory (Pass 1)
- [ ] analyze `SettingsPage.tsx.bak` outline.
- [ ] Create `settings_inventory.md` listing all tabs and features.

### Phase 2: Extraction (Pass 2)
- [ ] Extract "Collections" logic (Confirmed in `.bak`: Create, Manual/Auto Import, Delete All).
- [ ] Extract "Tag Management" logic.
- [ ] Extract "Category Management" logic.
- [ ] Extract "Backup & Restore" logic.
- [ ] Extract "Integrity Check" logic.
- [ ] Extract "Integrations" logic.
- [ ] Extract "Experimental" logic.

### Phase 3: Restoration (Pass 3)
- [ ] **Collections**: Verify `CollectionsSettings.tsx` against extracted block.
- [ ] **General/Tags**: Verify `GeneralSettings.tsx` against extracted block.
- [ ] **Categories**: Verify `CategorySettings.tsx`.
- [ ] **Backup**: Verify `BackupSettings.tsx`.
- [ ] **Integrity**: Verify `IntegritySettings.tsx`.
- [ ] **Integrations**: Verify `IntegrationsSettings.tsx`.
- [ ] **Config**: Verify `ConfigSettings.tsx`.

## Verification Plan
- Manual verification of each tab in the browser after restoration.
- Lint check to ensure no new errors are introduced.
