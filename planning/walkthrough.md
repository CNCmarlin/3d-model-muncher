
### BulkEditDrawer Refactor ([#4273](conversation://10942474-a356-43c3-bd2c-1a8e9993fca2))

**Goal**: Deconstruct the monolithic `BulkEditDrawer.tsx` (1900+ lines) into reusable hooks and components to improve maintainability and performance.

#### Changes
- **Extracted Logic**:
  - `useBulkEditForm`: Manages the complex state of 15+ bulk edit fields.
  - `useBulkOperations`: Handles the save logic, image generation, and API calls.
- **Components Created**:
  - `BulkEditSection`: Reusable wrapper for each edit section (Checkbox + Label + Content).
  - `BulkTagEditor`: Encapsulates tag addition/removal UI.
  - `BulkRelatedFilesEditor`: Manages complex related file selection logic.
- **Metrics**:
  - `BulkEditDrawer.tsx`: Reduced from ~1900 lines to ~440 lines.
  - Clean separation of UI and Logic.

#### Verification
- **Compilation**: `tsc --noEmit` passed (excluding known unrelated errors in `Grid3DViewer`).
- **Parity**: All bulk edit fields (Category, License, Tags, Print Settings, Related Files, etc.) preserved.

### Integrity Check Fix

**Issue**: The "Run Check" feature failed with "Model scan failed".
**Cause**: 
1. `server/routes/models.js` contained two conflicting definitions for `/hash-check`. The first one returned an Array, but the client expected an Object (`{ success: true, results: ... }`).
2. `server-utils/modelService.js` lacked error handling for system folders (Access Denied), causing potential crashes.
**Fix**:
- Removed the legacy/duplicate inline `/hash-check` route.
- Wrapped `fs.readdirSync` in `try/catch` in `modelService.js`.
