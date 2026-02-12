# Dual-Running Compatibility Fixes

## Issues Found
- [x] Adapter applied to legacy responses (broke collections/models)
- [ ] Database routes missing `auto-import` endpoint
- [ ] THREE.js crashes introduced (needs investigation)
- [ ] Thumbnail display issues (needs verification after fixes)

## Fixes Applied
- [x] App.tsx: Conditional adapter (database mode only)
- [x] useModelData.ts: Detect database by `collectionId` field
- [x] CollectionsSettings.tsx: Detect database by array response

## Remaining Work
- [ ] Port auto-import endpoint to collections_db.js
- [ ] Verify all legacy endpoints exist in database routes
- [ ] Test dual-running thoroughly (both modes)
- [ ] Document missing features in database routes
