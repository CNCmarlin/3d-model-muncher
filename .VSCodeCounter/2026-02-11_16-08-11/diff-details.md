# Diff Details

Date : 2026-02-11 16:08:11

Directory c:\\Users\\Michael\\VSCodeProjects\\3d-model-muncher\\3d-model-muncher\\src

Total : 86 files,  8500 codes, 666 comments, 1332 blanks, all 10498 lines

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [src/App.tsx](/src/App.tsx) | TypeScript JSX | 664 | 44 | 81 | 789 |
| [src/Attributions.md](/src/Attributions.md) | Markdown | 3 | 0 | 3 | 6 |
| [src/api/queryClient.ts](/src/api/queryClient.ts) | TypeScript | 14 | 0 | 2 | 16 |
| [src/api/services/collectionService.ts](/src/api/services/collectionService.ts) | TypeScript | 27 | 1 | 6 | 34 |
| [src/api/services/fileService.ts](/src/api/services/fileService.ts) | TypeScript | 26 | 0 | 4 | 30 |
| [src/api/services/modelService.ts](/src/api/services/modelService.ts) | TypeScript | 57 | 1 | 9 | 67 |
| [src/api/services/tagService.ts](/src/api/services/tagService.ts) | TypeScript | 16 | 0 | 4 | 20 |
| [src/config/default-config.json](/src/config/default-config.json) | JSON | 25 | 0 | 0 | 25 |
| [src/constants/labels.ts](/src/constants/labels.ts) | TypeScript | 29 | 2 | 4 | 35 |
| [src/constants/licenses.ts](/src/constants/licenses.ts) | TypeScript | 17 | 2 | 3 | 22 |
| [src/context/ConfigContext.tsx](/src/context/ConfigContext.tsx) | TypeScript JSX | 152 | 32 | 27 | 211 |
| [src/context/NavigationContext.tsx](/src/context/NavigationContext.tsx) | TypeScript JSX | 89 | 10 | 21 | 120 |
| [src/context/SpoolmanContext.tsx](/src/context/SpoolmanContext.tsx) | TypeScript JSX | 56 | 1 | 9 | 66 |
| [src/hooks/bulk/useBulkEditForm.ts](/src/hooks/bulk/useBulkEditForm.ts) | TypeScript | 234 | 11 | 23 | 268 |
| [src/hooks/bulk/useBulkOperations.ts](/src/hooks/bulk/useBulkOperations.ts) | TypeScript | 179 | 26 | 26 | 231 |
| [src/hooks/hub/useDocumentUpload.ts](/src/hooks/hub/useDocumentUpload.ts) | TypeScript | 27 | 0 | 6 | 33 |
| [src/hooks/hub/useGcodeHandler.ts](/src/hooks/hub/useGcodeHandler.ts) | TypeScript | 216 | 15 | 35 | 266 |
| [src/hooks/hub/useModelEdit.ts](/src/hooks/hub/useModelEdit.ts) | TypeScript | 488 | 26 | 73 | 587 |
| [src/hooks/hub/useModelGallery.ts](/src/hooks/hub/useModelGallery.ts) | TypeScript | 164 | 12 | 28 | 204 |
| [src/hooks/hub/useRelatedFiles.ts](/src/hooks/hub/useRelatedFiles.ts) | TypeScript | 61 | 10 | 7 | 78 |
| [src/hooks/hub/useSiblings.ts](/src/hooks/hub/useSiblings.ts) | TypeScript | 45 | 2 | 13 | 60 |
| [src/hooks/mutations/useBulkEditModels.ts](/src/hooks/mutations/useBulkEditModels.ts) | TypeScript | 16 | 0 | 3 | 19 |
| [src/hooks/mutations/useCreateCollection.ts](/src/hooks/mutations/useCreateCollection.ts) | TypeScript | 16 | 0 | 3 | 19 |
| [src/hooks/mutations/useDeleteModel.ts](/src/hooks/mutations/useDeleteModel.ts) | TypeScript | 33 | 0 | 5 | 38 |
| [src/hooks/mutations/useUpdateCollection.ts](/src/hooks/mutations/useUpdateCollection.ts) | TypeScript | 31 | 1 | 5 | 37 |
| [src/hooks/mutations/useUpdateModel.ts](/src/hooks/mutations/useUpdateModel.ts) | TypeScript | 13 | 1 | 2 | 16 |
| [src/hooks/queries/useCollections.ts](/src/hooks/queries/useCollections.ts) | TypeScript | 23 | 2 | 5 | 30 |
| [src/hooks/queries/useFiles.ts](/src/hooks/queries/useFiles.ts) | TypeScript | 9 | 0 | 2 | 11 |
| [src/hooks/queries/useModel.ts](/src/hooks/queries/useModel.ts) | TypeScript | 26 | 1 | 5 | 32 |
| [src/hooks/queries/useModels.ts](/src/hooks/queries/useModels.ts) | TypeScript | 21 | 4 | 6 | 31 |
| [src/hooks/queries/useModelsPaginated.ts](/src/hooks/queries/useModelsPaginated.ts) | TypeScript | 62 | 6 | 10 | 78 |
| [src/hooks/queries/useTags.ts](/src/hooks/queries/useTags.ts) | TypeScript | 9 | 0 | 2 | 11 |
| [src/hooks/settings/useBackups.ts](/src/hooks/settings/useBackups.ts) | TypeScript | 137 | 10 | 28 | 175 |
| [src/hooks/settings/useCategoryManager.ts](/src/hooks/settings/useCategoryManager.ts) | TypeScript | 315 | 11 | 51 | 377 |
| [src/hooks/settings/useIntegrityCheck.ts](/src/hooks/settings/useIntegrityCheck.ts) | TypeScript | 437 | 13 | 61 | 511 |
| [src/hooks/settings/useSettingsConfig.ts](/src/hooks/settings/useSettingsConfig.ts) | TypeScript | 123 | 9 | 19 | 151 |
| [src/hooks/settings/useTagManager.ts](/src/hooks/settings/useTagManager.ts) | TypeScript | 154 | 3 | 22 | 179 |
| [src/hooks/useCollectionMutations.ts](/src/hooks/useCollectionMutations.ts) | TypeScript | 117 | 7 | 21 | 145 |
| [src/hooks/useCollectionsQuery.ts](/src/hooks/useCollectionsQuery.ts) | TypeScript | 33 | 2 | 7 | 42 |
| [src/hooks/useDialog.ts](/src/hooks/useDialog.ts) | TypeScript | 18 | 0 | 4 | 22 |
| [src/hooks/useFilteredModels.ts](/src/hooks/useFilteredModels.ts) | TypeScript | 208 | 31 | 34 | 273 |
| [src/hooks/useGlobalDialogs.ts](/src/hooks/useGlobalDialogs.ts) | TypeScript | 152 | 13 | 29 | 194 |
| [src/hooks/useModelActions.ts](/src/hooks/useModelActions.ts) | TypeScript | 150 | 7 | 22 | 179 |
| [src/hooks/useModelData.ts](/src/hooks/useModelData.ts) | TypeScript | 45 | 1 | 8 | 54 |
| [src/hooks/useModelMutations.ts](/src/hooks/useModelMutations.ts) | TypeScript | 16 | 7 | 4 | 27 |
| [src/hooks/useModelMutations_DB.ts](/src/hooks/useModelMutations_DB.ts) | TypeScript | 125 | 12 | 23 | 160 |
| [src/hooks/useModelMutations_Legacy.ts](/src/hooks/useModelMutations_Legacy.ts) | TypeScript | 108 | 9 | 12 | 129 |
| [src/hooks/useModelsQuery.ts](/src/hooks/useModelsQuery.ts) | TypeScript | 51 | 6 | 10 | 67 |
| [src/hooks/useSelectionMode.ts](/src/hooks/useSelectionMode.ts) | TypeScript | 81 | 0 | 12 | 93 |
| [src/hooks/useTagsQuery.ts](/src/hooks/useTagsQuery.ts) | TypeScript | 29 | 1 | 5 | 35 |
| [src/main.tsx](/src/main.tsx) | TypeScript JSX | 12 | 1 | 2 | 15 |
| [src/styles/globals.css](/src/styles/globals.css) | CSS | 187 | 0 | 18 | 205 |
| [src/tests/download.test.tsx](/src/tests/download.test.tsx) | TypeScript JSX | 79 | 7 | 17 | 103 |
| [src/tests/utils.test.ts](/src/tests/utils.test.ts) | TypeScript | 18 | 0 | 3 | 21 |
| [src/types/category.ts](/src/types/category.ts) | TypeScript | 5 | 0 | 0 | 5 |
| [src/types/collection.ts](/src/types/collection.ts) | TypeScript | 28 | 4 | 5 | 37 |
| [src/types/collection_db.ts](/src/types/collection_db.ts) | TypeScript | 56 | 1 | 8 | 65 |
| [src/types/config.ts](/src/types/config.ts) | TypeScript | 66 | 2 | 4 | 72 |
| [src/types/index_db.ts](/src/types/index_db.ts) | TypeScript | 7 | 0 | 3 | 10 |
| [src/types/model.ts](/src/types/model.ts) | TypeScript | 90 | 17 | 6 | 113 |
| [src/types/model_db.ts](/src/types/model_db.ts) | TypeScript | 133 | 8 | 17 | 158 |
| [src/types/three-elements.d.ts](/src/types/three-elements.d.ts) | TypeScript | 19 | 2 | 1 | 22 |
| [src/types/view.ts](/src/types/view.ts) | TypeScript | 1 | 0 | 1 | 2 |
| [src/utils/ProjectService.ts](/src/utils/ProjectService.ts) | TypeScript | 241 | 37 | 48 | 326 |
| [src/utils/clientUtils.ts](/src/utils/clientUtils.ts) | TypeScript | 89 | 2 | 17 | 108 |
| [src/utils/configManager.ts](/src/utils/configManager.ts) | TypeScript | 336 | 17 | 39 | 392 |
| [src/utils/dbAdapter.ts](/src/utils/dbAdapter.ts) | TypeScript | 126 | 15 | 22 | 163 |
| [src/utils/downloadUtils.ts](/src/utils/downloadUtils.ts) | TypeScript | 144 | 13 | 21 | 178 |
| [src/utils/fileManager.ts](/src/utils/fileManager.ts) | TypeScript | 205 | 17 | 25 | 247 |
| [src/utils/filterUtils.ts](/src/utils/filterUtils.ts) | TypeScript | 76 | 14 | 18 | 108 |
| [src/utils/galleryUtils.ts](/src/utils/galleryUtils.ts) | TypeScript | 62 | 3 | 14 | 79 |
| [src/utils/gcodeParser.ts](/src/utils/gcodeParser.ts) | TypeScript | 213 | 8 | 31 | 252 |
| [src/utils/imageUtils.ts](/src/utils/imageUtils.ts) | TypeScript | 65 | 13 | 12 | 90 |
| [src/utils/labels.ts](/src/utils/labels.ts) | TypeScript | 29 | 2 | 4 | 35 |
| [src/utils/modelFactory.ts](/src/utils/modelFactory.ts) | TypeScript | 49 | 0 | 2 | 51 |
| [src/utils/munchiePath.ts](/src/utils/munchiePath.ts) | TypeScript | 34 | 0 | 7 | 41 |
| [src/utils/rendererPool.ts](/src/utils/rendererPool.ts) | TypeScript | 3 | 2 | 1 | 6 |
| [src/utils/rendererPool.tsx](/src/utils/rendererPool.tsx) | TypeScript JSX | 125 | 5 | 11 | 141 |
| [src/utils/sortUtils.ts](/src/utils/sortUtils.ts) | TypeScript | 53 | 1 | 5 | 59 |
| [src/utils/themeUtils.ts](/src/utils/themeUtils.ts) | TypeScript | 113 | 12 | 19 | 144 |
| [src/utils/thingiverseImporter.ts](/src/utils/thingiverseImporter.ts) | TypeScript | 101 | 15 | 24 | 140 |
| [src/utils/threeJSManager.ts](/src/utils/threeJSManager.ts) | TypeScript | 83 | 11 | 15 | 109 |
| [src/utils/threeMFToJson.ts](/src/utils/threeMFToJson.ts) | TypeScript | 341 | 48 | 66 | 455 |
| [src/utils/thumbnailGenerator.ts](/src/utils/thumbnailGenerator.ts) | TypeScript | 55 | 23 | 21 | 99 |
| [src/utils/thumbnailUtils.ts](/src/utils/thumbnailUtils.ts) | TypeScript | 39 | 6 | 7 | 52 |
| [src/utils/useSafeThreeMFLoader.ts](/src/utils/useSafeThreeMFLoader.ts) | TypeScript | 70 | 8 | 14 | 92 |

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details