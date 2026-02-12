# Diff Details

Date : 2026-02-11 16:05:58

Directory c:\\Users\\Michael\\VSCodeProjects\\3d-model-muncher\\3d-model-muncher\\server-utils

Total : 45 files,  -2801 codes, -303 comments, -517 blanks, all -3621 lines

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [server-utils/backupService.js](/server-utils/backupService.js) | JavaScript | 186 | 3 | 21 | 210 |
| [server-utils/collectionQueue.js](/server-utils/collectionQueue.js) | JavaScript | 46 | 7 | 9 | 62 |
| [server-utils/collectionScanner.js](/server-utils/collectionScanner.js) | JavaScript | 214 | 36 | 45 | 295 |
| [server-utils/collectionScanner_db.js](/server-utils/collectionScanner_db.js) | JavaScript | 229 | 21 | 43 | 293 |
| [server-utils/configHelper.js](/server-utils/configHelper.js) | JavaScript | 88 | 3 | 14 | 105 |
| [server-utils/coverGenerator.js](/server-utils/coverGenerator.js) | JavaScript | 62 | 14 | 15 | 91 |
| [server-utils/dataAccess.js](/server-utils/dataAccess.js) | JavaScript | 95 | 6 | 10 | 111 |
| [server-utils/db.js](/server-utils/db.js) | JavaScript | 7 | 1 | 5 | 13 |
| [server-utils/gcodeService.js](/server-utils/gcodeService.js) | JavaScript | 100 | 17 | 25 | 142 |
| [server-utils/genaiAdapter.js](/server-utils/genaiAdapter.js) | JavaScript | 161 | 26 | 32 | 219 |
| [server-utils/legacyAudit.js](/server-utils/legacyAudit.js) | JavaScript | 80 | 12 | 14 | 106 |
| [server-utils/legacyFinder.js](/server-utils/legacyFinder.js) | JavaScript | 26 | 0 | 3 | 29 |
| [server-utils/legacyScanner.js](/server-utils/legacyScanner.js) | JavaScript | 55 | 0 | 4 | 59 |
| [server-utils/modelService.js](/server-utils/modelService.js) | JavaScript | 328 | 5 | 48 | 381 |
| [server-utils/modelUtils.js](/server-utils/modelUtils.js) | JavaScript | 42 | 1 | 3 | 46 |
| [server-utils/routeSelector.js](/server-utils/routeSelector.js) | JavaScript | 101 | 0 | 8 | 109 |
| [server-utils/sharedQueue.js](/server-utils/sharedQueue.js) | JavaScript | 6 | 1 | 3 | 10 |
| [server/controllers/legacy/backupController.js](/server/controllers/legacy/backupController.js) | JavaScript | -53 | -5 | -13 | -71 |
| [server/controllers/legacy/maintenanceController.js](/server/controllers/legacy/maintenanceController.js) | JavaScript | -113 | -8 | -18 | -139 |
| [server/controllers/legacy/modelController.js](/server/controllers/legacy/modelController.js) | JavaScript | -128 | -19 | -20 | -167 |
| [server/controllers/legacy/mutationController.js](/server/controllers/legacy/mutationController.js) | JavaScript | -57 | -1 | -12 | -70 |
| [server/routes/admin.js](/server/routes/admin.js) | JavaScript | -578 | -71 | -111 | -760 |
| [server/routes/collections.js](/server/routes/collections.js) | JavaScript | -663 | -36 | -122 | -821 |
| [server/routes/collections_db.js](/server/routes/collections_db.js) | JavaScript | -67 | -10 | -9 | -86 |
| [server/routes/config.js](/server/routes/config.js) | JavaScript | -66 | -5 | -7 | -78 |
| [server/routes/imports.js](/server/routes/imports.js) | JavaScript | -399 | -62 | -72 | -533 |
| [server/routes/integrations.js](/server/routes/integrations.js) | JavaScript | -54 | -10 | -13 | -77 |
| [server/routes/legacy/models.js](/server/routes/legacy/models.js) | JavaScript | -293 | -54 | -73 | -420 |
| [server/routes/models_db.js](/server/routes/models_db.js) | JavaScript | -229 | -39 | -47 | -315 |
| [server/routes/system.js](/server/routes/system.js) | JavaScript | -253 | -13 | -46 | -312 |
| [server/routes/tags.js](/server/routes/tags.js) | JavaScript | -51 | -3 | -9 | -63 |
| [server/routes/tags_db.js](/server/routes/tags_db.js) | JavaScript | -49 | -4 | -7 | -60 |
| [server/schemas/collection.js](/server/schemas/collection.js) | JavaScript | -75 | -7 | -9 | -91 |
| [server/schemas/core.js](/server/schemas/core.js) | JavaScript | -105 | -16 | -20 | -141 |
| [server/schemas/file.js](/server/schemas/file.js) | JavaScript | -23 | -1 | -4 | -28 |
| [server/schemas/index.js](/server/schemas/index.js) | JavaScript | -12 | 0 | -2 | -14 |
| [server/schemas/model.js](/server/schemas/model.js) | JavaScript | -120 | -10 | -9 | -139 |
| [server/schemas/tag.js](/server/schemas/tag.js) | JavaScript | -20 | -2 | -4 | -26 |
| [server/services/collectionService_db.js](/server/services/collectionService_db.js) | JavaScript | -221 | -10 | -32 | -263 |
| [server/services/fileService_db.js](/server/services/fileService_db.js) | JavaScript | -150 | -18 | -18 | -186 |
| [server/services/legacy/maintenanceService.js](/server/services/legacy/maintenanceService.js) | JavaScript | -134 | 0 | -26 | -160 |
| [server/services/legacy/modelService_legacy.js](/server/services/legacy/modelService_legacy.js) | JavaScript | -109 | -5 | -15 | -129 |
| [server/services/legacy/mutationService.js](/server/services/legacy/mutationService.js) | JavaScript | -191 | -20 | -41 | -252 |
| [server/services/modelService_db.js](/server/services/modelService_db.js) | JavaScript | -319 | -22 | -45 | -386 |
| [server/services/tagService_db.js](/server/services/tagService_db.js) | JavaScript | -95 | -5 | -15 | -115 |

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details