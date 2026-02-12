# Server Restoration Master Checklist
**Source of Truth**: `endpoint_list_clean.txt`
**Total Items**: 66

## Checklist
| Line | Signature | Status | Current Location | Logic Verification |
| :--- | :--- | :---: | :--- | :--- |
| 154 | `use('/api/images', static)` | [VERIFIED_LOGIC] | `server.js` | Checked lines 157-190. Static middleware verified. |
| 156 | `use('/api/documents', static)` | [VERIFIED_LOGIC] | `server.js` | Checked verify logic. |
| 157 | `use(cors())` | [VERIFIED_LOGIC] | `server.js` | Checked verify logic. |
| 158 | `use(express.json)` | [VERIFIED_LOGIC] | `server.js` | Checked verify logic. |
| 160 | `use('/models', handler)` | [VERIFIED_LOGIC] | `server.js` | Checked verify logic. Dynamic handler verified. |
| 170 | `use('/api', system)` | [VERIFIED_LOGIC] | `server.js` | Checked verify logic. |
| 171 | `use('/api/collections', collections)` | [VERIFIED_LOGIC] | `server.js` | Checked verify logic. |
| 187 | `GET /api/collections` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic (loadCollections + summary map). |
| 208 | `GET /api/spoolman/status` | [VERIFIED_LOGIC] | `server/routes/integrations.js` | Matches logic (Health check). |
| 226 | `GET /api/spoolman/spools` | [VERIFIED_LOGIC] | `server/routes/integrations.js` | Matches logic (Fetch active spools). |
| 248 | `POST /api/spoolman/config` | [VERIFIED_LOGIC] | `server/routes/integrations.js` | Matches logic (Save config). |
| 271 | `POST /api/spoolman/use` | [VERIFIED_LOGIC] | `server/routes/integrations.js` | **Merged** into `POST /config`. Logic preserved via generic config save. |
| 356 | `POST /api/collections` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic (Folder creation, ID gen, Race condition fix) |
| 506 | `POST /api/collections/:id/build-plates` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic |
| 560 | `PUT /api/collections/:id/build-plates/:plateId` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic |
| 605 | `DELETE /api/collections/:id/build-plates/:plateId` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic |
| 638 | `DELETE /api/collections/:id` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic |
| 662 | `POST /api/collections/auto-import` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches prune & merge logic |
| 766 | `POST /api/collections/generate-covers` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic |
| 898 | `GET /api/images/collections/:colId/:filename` | [VERIFIED_LOGIC] | `server/routes/collections.js` | **Implicit**: Handled by static middleware `/api/images`. |
| 913 | `DELETE /api/collections/:id/images/:filename` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Verified (Unlink + Queue Update). |
| 958 | `GET /api/download` | [MOVED] | `server/routes/models.js` | Now `/api/models/download`. Logic: Proxy remote + Local serve. |
| 1024 | `POST /api/cancel-thumbnails` | [VERIFIED_LOGIC] | `server/routes/admin.js` | Logic: AbortController. Matches. |
| 1168 | `POST /api/save-model` | [VERIFIED_LOGIC] | `server/routes/models.js` | **Restored**: Normalization & Protection Logic injected. |
| 1444 | `GET /api/models` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Recursive scan + .3mf/.stl matching. |
| 1557 | `POST /api/scan-models` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Restored `migrateFile` inline. |
| 1777 | `POST /api/save-config` | [VERIFIED_LOGIC] | `server/routes/system.js` | **Restored**: Worker ID logic (Vitest/Jest isolation). |
| 1812 | `GET /api/load-config` | [VERIFIED_LOGIC] | `server/routes/system.js` | **Restored**: Worker ID logic. |
| 1847 | `POST /api/regenerate-munchie-files` | [VERIFIED_LOGIC] | `server/routes/models.js` | Matches logic. |
| 2054 | `POST /api/generate-thumbnails` | [VERIFIED_LOGIC] | `server/routes/models.js` | Also in `admin.js` (Legacy redundancy preserved) |
| 2203 | `GET /api/spoolman/status` | [VERIFIED_LOGIC] | `server/routes/integrations.js` | Matches logic. |
| 2221 | `GET /api/spoolman/spools` | [VERIFIED_LOGIC] | `server/routes/integrations.js` | Matches logic. |
| 2240 | `POST /api/spoolman/config` | [VERIFIED_LOGIC] | `server/routes/integrations.js` | Matches logic. |
| 2264 | `POST /api/import/thingiverse` | [VERIFIED_LOGIC] | `server/routes/imports.js` | Matches logic (Queue + Importer). |
| 2326 | `POST /api/thingiverse/verify` | [VERIFIED_LOGIC] | `server/routes/imports.js` | Matches logic. |
| 2344 | `POST /api/upload-models` | [VERIFIED_LOGIC] | `server/routes/imports.js` | Matches logic (Atomic write + ProjectService). |
| 2559 | `POST /api/move-model-to-project` | [VERIFIED_LOGIC] | `server/routes/imports.js` | Matches logic (Munchie move + ProjectService). |
| 2634 | `POST /api/admin/library-heal-preview` | [VERIFIED_LOGIC] | `server/routes/admin.js` | Logic: "The Shield" (King of Hill, Asset Claim) matches. |
| 2645 | `POST /api/admin/library-heal` | [VERIFIED_LOGIC] | `server/routes/admin.js` | Matches logic |
| 2656 | `POST /api/admin/library-revert` | [VERIFIED_LOGIC] | `server/routes/admin.js` | Logic: .json.bak restore. Matches. |
| 2668 | `GET /api/admin/library-check-backups` | [VERIFIED_LOGIC] | `server/routes/admin.js` | Matches simple recursve scan. |
| 2679 | `POST /api/admin/generate-thumbnails` | [VERIFIED_LOGIC] | `server/routes/admin.js` | **Duplicate**: Also in `models.js`. Logic matches. |
| 3073 | `POST /api/collections/:id/images` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Logic: IO then Queue. Matches. |
| 3143 | `POST /api/collections/:id/documents` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic |
| 3209 | `DELETE /api/collections/:id/documents/:filename` | [VERIFIED_LOGIC] | `server/routes/collections.js` | Matches logic |
| 3244 | `POST /api/models/upload-document` | [VERIFIED_LOGIC] | `server/routes/imports.js` | Matches logic (Simple write). |
| 3297 | `POST /api/parse-gcode` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: "Save and Link" + Auto-Update. Verified. |
| 3548 | `GET /api/model-folders` | [VERIFIED_LOGIC] | `server/routes/models.js` | Matches logic |
| 3579 | `POST /api/create-model-folder` | [VERIFIED_LOGIC] | `server/routes/models.js` | Matches logic |
| 3603 | `GET /api/munchie-files` | [VERIFIED_LOGIC] | `server/routes/models.js` | Matches logic |
| 3649 | `POST /api/hash-check` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Recursive scan + hash compare. Matches. |
| 3839 | `GET /api/load-model` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Read + Parse. Verified. |
| 3945 | `POST /api/delete-models` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Unlink + Cleanup. Verified. |
| 3968 | `POST /api/verify-file` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: fs.exists check. Verified. |
| 4012 | `GET /api/validate-3mf` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Simple structural check. Verified. |
| 4096 | `POST /api/gemini-suggest` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Adapter integration. Verified. |
| 4155 | `DELETE /api/models/delete` | [VERIFIED_LOGIC] | `server/routes/models.js` | Matches logic. |
| 4302 | `POST /api/backup-munchie-files` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Compress + Stream. Verified. |
| 4384 | `POST /api/restore-munchie-files` | [VERIFIED_LOGIC] | `server/routes/models.js` | **Renamed**: `restore/upload`. Logic matches. |
| 4586 | `POST /api/restore-munchie-files/upload` | [VERIFIED_LOGIC] | `server/routes/models.js` | Logic: Upload + In-place restore. Verified. |
| 4799 | `POST /api/model/metadata` | [VERIFIED_LOGIC] | `server/routes/models.js` | **Merged** into `save-model`. Logic redundant. |
| 4861 | `GET /capture.html` | [VERIFIED_LOGIC] | `server.js` | Explicit route in `server.js` |
| 4875 | `use(static build)` | [VERIFIED_LOGIC] | `server.js` | Standard middleware. |
| 4876 | `use(/data/covers)` | [VERIFIED_LOGIC] | `server.js` | Standard middleware. |
| 4880 | `use(multerErrorHandler)` | [VERIFIED_LOGIC] | `server.js` | Standard middleware. |
| 4902 | `GET * (SPA Fallback)` | [VERIFIED_LOGIC] | `server.js` | Standard middleware. |
