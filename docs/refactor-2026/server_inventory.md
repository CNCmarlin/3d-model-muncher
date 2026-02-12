# Server Restoration Inventory & Gap Analysis

## Legend
- **Complexity**: 1 (Trivial) to 5 (Critical/High Risk).
- **Status**:
    - `[SAFE]`: Exists in current codebase (file/logic found).
    - `[MOVED]`: Found in `server-utils/` or other module.
    - `[MISSING]`: Not found in current codebase.
    - `[CHANGED]`: Exists but logic differs significantly.

## 1. Core Config & Setup
| Item | Complexity | Status | Notes |
| :--- | :---: | :---: | :--- |
| `SERVER_CONFIG` (Path logic) | 2 | [SAFE] | `server.js` (lines 100-124), `server-utils/dataAccess` |
| `ConfigManager` (Load/Save) | 3 | [MOVED] | `server/routes/config.js` |
| `protectModelFileWrite` | 5 | [MOVED] | `server-utils/dataAccess.js` |
| `postProcessMunchieFile` | 4 | [MISSING] | **Not found in `models.js` or `dataAccess.js`**. Critical Gap. |

## 2. Collections API
| Item | Complexity | Status | Notes |
| :--- | :---: | :---: | :--- |
| `GET /api/collections` | 2 | [MOVED] | `server/routes/collections.js` |
| `POST /api/collections` | 4 | [MOVED] | `server/routes/collections.js` |
| `DELETE /api/collections/:id` | 4 | [MOVED] | `server/routes/collections.js` |
| `POST /api/collections/auto-import` | 5 | [MOVED] | `server/routes/collections.js` (uses `server-utils/collectionScanner`) |
| `POST /api/collections/generate-covers`| 4 | [MOVED] | `server/routes/collections.js` (uses `server-utils/coverGenerator`) |
| `POST /api/collections/build-plates/*`| 3 | [MOVED] | `server/routes/collections.js` |
| `POST /api/collections/:id/images` | 3 | [MOVED] | `server/routes/collections.js` |
| `POST /api/collections/:id/documents`| 3 | [MOVED] | `server/routes/collections.js` |

## 3. Models API (Read/Write)
| Item | Complexity | Status | Notes |
| :--- | :---: | :---: | :--- |
| `GET /api/models` | 3 | [MOVED] | `server/routes/models.js` |
| `POST /api/scan-models` | 5 | [MOVED] | `server/routes/models.js` (Partial parity) |
| `POST /api/save-model` | 5 | [CHANGED] | `server/routes/models.js`. **CRITICAL REGRESSION**: Missing "Atomic Peer Demotion". |
| `POST /api/regenerate-munchie-files` | 5 | [CHANGED] | `server/routes/models.js`. **CRITICAL REGRESSION**: Missing "The Shield" (Project Aware Backup). |
| `api/model/metadata` | 2 | [MOVED] | `server/routes/models.js` |

## 4. File Operations & Admins
| Item | Complexity | Status | Notes |
| :--- | :---: | :---: | :--- |
| `GET /api/download` | 4 | [MOVED] | `server/routes/system.js` |
| `POST /api/upload-models` | 5 | [MOVED] | `server/routes/imports.js` |
| `POST /api/move-model-to-project` | 4 | [MOVED] | `server/routes/imports.js` |
| `POST /api/delete-models` | 4 | [MOVED] | `server/routes/models.js` |
| `/api/admin/library-heal` | 5 | [MOVED] | `server/routes/admin.js` |
| `/api/admin/library-revert` | 3 | [MOVED] | `server/routes/admin.js` |
| `Backup/Restore API` | 4 | [MOVED] | `server/routes/admin.js` |

## 5. Integrations & Utilities
| Item | Complexity | Status | Notes |
| :--- | :---: | :---: | :--- |
| `Spoolman` (Proxy Endpoints) | 3 | [MOVED] | `server/routes/integrations.js` |
| `Thingiverse` (Import) | 4 | [MOVED] | `server/routes/imports.js` |
| `Gemini` (Suggest) | 3 | [MOVED] | `server/routes/system.js` |
| `G-Code` (Parse/Link) | 4 | [MOVED] | `server/routes/imports.js` |
| `generate-thumbnails` | 4 | [MOVED] | `server/routes/models.js` |

## Next Steps (Pass 2)
Scan `server.js` (current) and `server-utils/*` to fill in the **Status** column.
