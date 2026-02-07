# 🔍 Database Migration: Impact & Parity Analysis

> **Goal**: Ensure no features are lost during the migration to SQLite.
> **Focus**: Analyzing "Collection Strategies" and other heuristics defined in `feature_rundown.md`.

---

## 🏗️ Feature Deep Dive: Collection Strategies

The current `collectionScanner.js` supports three modes defined in `config.json`:
1.  **Smart/Strict**: Mirrors the folder hierarchy (standard).
2.  **Top-Level**: Flattens all sub-folders into the root folder (e.g., `SciFi/Aliens/Xenomorph` -> `SciFi`).

### ⚠️ The Conflict
The proposed **Path-Based Ingestor** tends to be "Strict" by default (it mirrors the disk).
If we "Ingest as Top-Level" (flattening everything into one ID), we **destroy data**. We lose the knowledge that the file was actually in `Aliens/`.

### ✅ The Database Solution
**"Strict Ingestion, Flexible Viewing"**
We should **ALWAYS ingest Strictly** (Mirror the disk 1:1).
*   **Why?**: The DB represents "Truth". The file *is* in a subfolder.
*   **Parity for Top-Level Users**: We add a "View Mode" in the Frontend.
    *   **View**: "Flatten Sub-collections" (Toggle).
    *   **Result**: The user sees one big "SciFi" list, but the DB knows the truth.
*   **Benefit**: You can switch strategies *instantly* without restarting the server/rescanning.

---

## 🔄 Feature Inventory & Impact Map

| Feature | Current Implementation | DB Implementation | Parity Status |
| :--- | :--- | :--- | :--- |
| **Nested Collections** | Recursive Folders | `parent_id` adjacency list | ✅ **Perfect** |
| **Project Folders** | `project.json` + `hidden` files | `Model` with `ModelFiles` | ✨ **Improved** (No hidden files) |
| **Related Files** | Manual JSON linkage | `model_related` table | ✅ **Perfect** |
| **Auto-Tagging** | Gemini -> JSON | Gemini -> `tags` table | ✅ **Perfect** |
| **File Watcher** | Full Re-scan (Slow) | Event-driven Upsert (Fast) | ✨ **Improved** |
| **Sort Orders** | Client-side arrays | SQL `ORDER BY` | ✨ **Improved** (Server-side) |
| **Search** | Client-side filter | SQL `WHERE ... LIKE` | ✨ **Improved** (Scalable) |

## 🛠️ Refactor Inventory (Files to Touch)

### 🔴 Backend (High Impact)
*   **`server-utils/ingestor.ts`** (NEW): Replaces `collectionScanner.js` and `threeMFToJson.js` logic.
*   **`server/routes/models.js`**: Complete rewrite to use `prisma.model.findMany`.
*   **`server.js`**: Remove legacy scanning middleware. Switch to DB connection.

### 🟡 Frontend (Medium Impact)
*   **`src/types/model.ts`**: Update interface to match API response (or add Adaptor layer).
*   **`src/hooks/useModelData.ts`**: Ensure hydration works with new JSON shape.
*   **`src/components/views/CollectionView.tsx`**: Update to handle "Flatten View" if we implement that strategy.

### 🟢 Config (Low Impact)
*   **`data/config.json`**: Deprecate `scanStrategy`. (Scanner is always Strict).

---

## 🧪 "The Feature Test"
> *"how will the current plan work if a user want to test other collection strategies?"*

**Answer**: They won't need to "test" them by restarting the server.
Because the DB stores the full hierarchy, they can toggle "Group by Top Level" in the UI dynamically.
We are **upgrading** this from a "Server Config" to a "UI Preference".
