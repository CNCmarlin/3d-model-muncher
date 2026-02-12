# React Query Migration - Known Issues & TODOs

## 🚨 CRITICAL ISSUES

### 1. Tags Not in Database ✅ FIXED
**Problem**: Tag table is empty (0 tags)  
**Impact**: Database mode shows no tags in filters/model views  
**Root Cause**: Tags were never migrated from munchie files to database  
**Solution**: Created and ran `scripts/backfill-tags.js`

**Results**:
- ✅ 129 unique tags migrated
- ✅ 1,087 model-tag associations created
- ⚠️ Some warnings about models not found (343 munchie files had tags, but some models not in DB yet)

**Status**: WORKING in database mode! 🎉

**Follow-up** (Low Priority):
- [ ] Investigate why some models from munchie files aren't in database
- [ ] Consider adding tags field to model migration script
- [ ] Verify all tags are displaying correctly in UI

---

### 2. Missing Designer & License Fields in ModelHubView ✅ FOUND
**Problem**: Designer and license fields disappeared during monolithic file refactor  
**Impact**: Users can't see/edit designer or license info for models  
**Location**: Should be near tags in `src/components/ModelHubView.tsx`

**Investigation**:
-  ✅ Fields exist in database schema (`designer` added, `license` already present)
- ✅ Fields exist in TypeScript types (`model_db.ts` has both)
- ✅ Fields exist in UI (`MetadataSection.tsx` lines 175-187 for designer, 190+ for license)
- ✅ Migration created to add `designer` column to DB

**Status**: Fields are present and functional! ✅

**Follow-up Actions**:
- [x] Add `designer` field to Prisma schema
- [x] Run migration (`20260208045135_add_designer_field`)
- [ ] Test that designer & license values save correctly in both modes
- [ ] Verify fields populate from existing munchie data

---

## ✅ COMPLETED

### Sprint 1: Foundation
- [x] Installed React Query + DevTools
- [x] Setup QueryClientProvider in `main.tsx`
- [x] Created `useModelsQuery` hook (database-first)
- [x] Created `useCollectionsQuery` hook
- [x] Created `useTagsQuery` hook
- [x] DevTools configured for dev-only

### Sprint 2: Integration  
- [x] Updated `App.tsx` to use `useModelsQuery` and `useCollectionsQuery`
- [x] Updated `TagsContext` to use `useTagsQuery`
- [x] Fixed legacy mode collection filtering
- [x] Created `/api/tags` endpoint (both modes)
- [x] Tags working in **legacy mode** ✅
- [ ] Tags working in **database mode** ❌ (blocked by migration)

---

## 📋 NEXT STEPS

### Sprint 3: Mutations ✅ COMPLETE (Needs Testing!)
- [x] Create `useModelMutations.ts` hook
- [x] Create `useCollectionMutations.ts` hook  
- [x] Refactor `useModelActions.ts` to use mutations
- [x] Add backend PATCH endpoints:
  - [x] PATCH `/api/models/:id` in `models_db.js`
  - [x] PATCH `/api/models/bulk-update` in `models_db.js`
- [ ] **🧪 CRITICAL: TEST EVERYTHING**
  - [ ] Test model update in database mode
  - [ ] Test bulk edit in database mode
  - [ ] Verify optimistic updates work
  - [ ] Verify error rollback works
  - [ ] Switch to legacy mode - verify nothing broke
  - [ ] Switch back to database mode - verify again

**Testing Steps:**
1. Open browser to http://localhost:5173
2. Open DevTools → Network tab
3. Click on a model, edit the name, save
4. Verify:
   - Request shows PATCH `/api/models/{id}`
   - UI updates instantly (optimistic)
   - No errors in console
5. Select multiple models, bulk edit
6. Verify bulk update works
7. **Toggle to legacy mode in settings**
8. Verify everything still works in legacy mode

### Sprint 4: Cleanup
- [ ] Remove unused `useModelData.ts`
- [ ] Remove adapter when legacy mode deprecated
- [ ] Update TypeScript types
- [ ] Performance testing

---

## 🔧 INFRASTRUCTURE IMPROVEMENTS (Future)

### Dual-Port Testing Setup (Optional)
**Idea**: Run both backends simultaneously for easier testing
- Backend 1 on port 3001 (database mode)
- Backend 2 on port 3002 (legacy mode)
- Frontend toggle between them

**Status**: Discussed but postponing - current toggle system works fine

---

## 📝 NOTES

### Database-First Philosophy Enforced ✅
- All hooks return database types
- Adapter only used internally for legacy mode
- Components consume database types regardless of mode
- No compromises on database schema for legacy compatibility

### What's Working
- ✅ Models loading in both modes
- ✅ Collections loading in both modes
- ✅ 3D viewer working (modelUrl from files relation)
- ✅ Tags in **legacy mode**
- ✅ React Query DevTools available in dev

### What's Not Working  
- ❌ Tags in **database mode** (Tag table empty)
- ❌ Designer field missing from ModelHubView
- ❌ License field missing from ModelHubView
