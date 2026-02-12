# Legacy ModelHub & Mutation Logic - Current Architecture
**Date:** February 10, 2026
**Context:** Documentation of the current Legacy (File-Based) Mode state and safety mechanisms for future refactoring.

## 1. Core Architecture: The "Facade" Pattern
To support both **Legacy (File-Based)** and **DB (PostgreSQL)** modes simultaneously, we implemented a Facade pattern for mutations. This is the **single point of truth** for model updates.

*   **`useModelMutations.ts` (Facade):**
    *   **Responsibility:** Proxies calls based on `appConfig.settings.useDatabaseBackend`.
    *   **Rule:** Components (like `ModelHubView`) must **NEVER** import the sub-hooks directly. Always use the Facade.
    *   **Behavior:** Legacy mode relies on Optimistic Updates (client-side cache manipulation) to hide slow disk I/O latency.

## 2. Legacy Mode Safety Mechanisms (How it Protects Data)

### A. Strict Read-Before-Write Policy
*   **The Problem:** File systems are prone to locks (EBUSY) or race conditions where a file might be momentarily unreadable.
*   **The Protection:** `POST /api/save-model` now **ABORTS** (Returns 500) if the initial read of the existing JSON file fails for *any* reason.
    *   **Guarantee:** It will **NEVER** overwrite a file it hasn't successfully read first. This prevents "wiping" metadata if a file is locked by a scanner or antivirus.

### B. ID-Based Authority
*   **The Problem:** File paths can be ambiguous (e.g., source file vs metadata file) or change during runtime.
*   **The Protection:** Critical operations (like G-code analysis saves) now rely exclusively on **Model ID** lookups.
    *   **Mechanism:** The frontend sends `{ id: "..." }` instead of `{ filePath: "..." }`.
    *   **Benefit:** If a file is renamed or moved, the ID lookup fails gracefully (404), whereas a path-based save might blindly write to a wrong location or crash trying to parse a non-JSON file.

### C. 3MF Metadata Preservation
*   **The Problem:** 3MF files contain embedded XML metadata. Naive JSON updates often stripped this data.
*   **The Protection:**
    *   **General Rule:** `save-model` ignores `printSettings` updates for 3MF files to protect the original XML data.
    *   **Exception:** If `gcodeData` is present in the payload (meaning a G-code analysis just finished), `save-model` **ALLOWS** overwriting `printSettings`. This ensures the specific print parameters from the G-code take precedence over generic XML data.

## 3. Key Components & Responsibilities

### `src/components/ModelHubView.tsx`
*   **Role:** The main detail view/controller.
*   **State:** relies heavily on `useModel` query.
*   **Dependencies:** `useModelMutations` (Facade), `useGcodeHandler` (Logic).

### `src/hooks/hub/useGcodeHandler.ts`
*   **Role:** Manages the specialized G-code upload flow.
*   **Flow:**
    1.  Uploads G-code to `/api/parse-gcode` (returns analysis *only*, does not save).
    2.  Receives analysis data (print time, filament, settings).
    3.  Merges data with current model state.
    4.  Calls `/api/save-model` with the **merged payload**.
*   **Why split?** This Two-Phase Commit allows the user to review/cancel before saving, and prevents the backend from making partial writes.

### `server/routes/models.js` (`POST /save-model`)
*   **Role:** The monolithic handler for Legacy updates.
*   **Complexity:** High. Handles:
    *   ID-to-Path resolution (scanning).
    *   Security checks (Path traversal).
    *   Data Normalization (Tags, Related Files).
    *   3MF/STL specific logic.
    *   Recursive "Project Demotion" logic (if `isProjectRoot` flag changes).

## 4. Refactoring Risks & Fragile Areas ("Here be Dragons")

*   **1. Renaming = Data Loss (Sort of):**
    *   In Legacy Mode, the Model ID is generated from the **File Path**.
    *   **Risk:** Renaming a file *changes its ID*.
    *   **Consequence:** Any external references to that ID (e.g., in `collections.json`, `tags.json`, or a database) will break. Auto-Imported collections recover (scanned by path), but **Manual Collections** will lose the item.

*   **2. Performance Bottlenecks:**
    *   ID Lookups require a **Recursive Directory Scan** (`models.js:walk`).
    *   **Risk:** As the library grows (10k+ models), looking up a model by ID (without a known path) becomes linear time `O(n)`.
    *   **Mitigation:** The DB mode fixes this with indexed queries. Legacy mode will always be slow here.

*   **3. Path Traversal & Normalization:**
    *   The backend contains complex regex logic (`replace(/\\/g, '/')`, `replace(/\.\./g, '')`) scattered across multiple routes.
    *   **Risk:** Centralizing this into a single `PathService` is highly recommended to avoid security holes or inconsistent behavior on Windows vs Linux.

*   **4. The "Munchie" File Format:**
    *   The `*-munchie.json` schema is implicit and evolved over time.
    *   **Risk:** New fields added to the frontend `Model` interface must be explicitly handled/allowed in `save-model` (see the `3MF Protection` logic), otherwise they might be silently dropped or trigger unexpected side effects.
