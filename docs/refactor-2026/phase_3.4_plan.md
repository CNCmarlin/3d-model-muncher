# Phase 3.4: Frontend React Query Migration & Cleanup

## 🎯 Core Principles

### Database-First Philosophy ⚡
**CRITICAL**: We are migrating TO database-first, not compromising FOR legacy.

1. **Database Types = Source of Truth**
   - New hooks and components use database types (`Model`, `Collection`, `ModelFile[]`)
   - NEVER modify database schema to match legacy JSON structure
   - Legacy adapter exists ONLY for backward compatibility

2. **Best Practices Always Win**
   - Use proper relations (`model.files: ModelFile[]` not `related_files: string[]`)
   - Use proper foreign keys (`collectionId` not `collections: string[]`)
   - Use proper enums and constraints
   - Apply database normalization principles

3. **Dual-Mode Strategy**
   - **Database Mode (Primary)**: Clean, normalized, type-safe
   - **Legacy Mode (Compatibility)**: Adapter translates database → legacy format
   - **Direction**: Database → Legacy (NEVER Legacy → Database compromises)

4. **Transition Plan**
   - Phase 1: Hooks work with BOTH modes (adapter in legacy)
   - Phase 2: Components prefer database types, fall back to legacy
   - Phase 3: Eventually remove adapter when legacy mode deprecated

### Implementation Rules
- ✅ **DO**: Design for database schema, add adapter for legacy
- ❌ **DON'T**: Compromise database design to match legacy JSON
- ✅ **DO**: Use proper TypeScript types from Prisma
- ❌ **DON'T**: Use `any` or loose types to accommodate legacy
- ✅ **DO**: Test both modes after each change
- ❌ **DON'T**: Break legacy mode (full backward compat)

---

## Goal
Modernize the frontend data layer with React Query and remove legacy filesystem assumptions while maintaining dual-mode compatibility.

## Current Status ✅
- ✅ Database API routes working (models_db.js, collections_db.js)
- ✅ Frontend adapter (`dbAdapter.ts`) converts DB models to legacy format
- ✅ Both legacy and database modes functional
- ✅ 3D viewer fixed (modelUrl from files relation)

## Next Steps

### Step 1: Install React Query
```bash
npm install @tanstack/react-query
```

### Step 2: Setup React Query Provider
**File**: `src/main.tsx`
- Wrap app with `QueryClientProvider`
- Configure default options (staleTime, cacheTime, refetchOnWindowFocus)

### Step 3: Create Custom Hooks (Database-Aware)
**Type Strategy**: All hooks return database types by default, adapter only in legacy mode.

Priority order based on impact:

#### High Priority (Core Data Fetching)
1. **`src/hooks/useModelsQuery.ts`** - Replace `useModelData.ts`
   ```typescript
   // Return type: Model[] (database schema)
   // In legacy mode: Apply adapter internally
   // Components consume database types regardless of mode
   ```
   - Use React Query's `useQuery` for `/api/models`
   - Detect mode, apply adapter ONLY in legacy mode
   - Return database-typed results
   - Benefits: Auto-refetch, caching, loading states

2. **`src/hooks/useCollectionsQuery.ts`** - Replace collection fetching
   ```typescript
   // Return type: Collection[] (database schema)
   // Handle tree structure properly with parentId
   ```
   - Use `useQuery` for `/api/collections`
   - Return database types (no `modelIds` array, use count or relation)

3. **`src/hooks/useTagsQuery.ts`** - Replace `TagsContext`
   ```typescript
   // Return type: Tag[] (database schema)
   ```
   - Use `useQuery` for `/api/tags`
   - Keep global state for now via context

#### Medium Priority (Mutations)
4. **`src/hooks/useModelMutations.ts`**
   - `useUpdateModel` - Replace `/api/save-model` calls
   - `useDeleteModel` - Soft delete
   - `useBulkEdit` - Batch operations
   - All use `useMutation` with **optimistic updates**

5. **`src/hooks/useCollectionMutations.ts`**
   - `useCreateCollection`
   - `useUpdateCollection`
   - `useDeleteCollection`

### Step 4: Update Components (Incremental)
Start with least risky:

1. **`TagsContext.tsx`** → Use `useTagsQuery`
2. **`App.tsx`** → Use `useModelsQuery` and `useCollectionsQuery`
3. **`ModelHubView.tsx`** → Use `useModelMutations`
4. **`CollectionGrid.tsx`** → Already working, minor cleanup
5. **`BulkEditDrawer.tsx`** → Use `useBulkEdit`

### Step 5: Remove Legacy Assumptions
Only in database mode (keep legacy for backward compat):

1. Stop using `dbAdapter.ts` - components use database types directly
2. Remove `collections` array assumption (use `collectionId` directly)
3. Update `ModelFile` handling (use relation instead of `related_files` array)

### Step 6: Cleanup
1. Remove unused `useModelData.ts` (replaced by `useModelsQuery`)
2. Remove `useRelatedFiles.ts` (use `ModelFile` relation)
3. Update TypeScript types to prefer database schema

## Implementation Order

### Sprint 1: Foundation (Low Risk)
- [ ] Install React Query
- [ ] Setup QueryClientProvider in `main.tsx`
- [ ] Create `useModelsQuery` hook (with fallback to current logic)
- [ ] Create `useCollectionsQuery` hook
- [ ] Create `useTagsQuery` hook

### Sprint 2: Integration (Medium Risk)
- [ ] Update `App.tsx` to use new hooks
- [ ] Update `TagsContext` to use `useTagsQuery`
- [ ] Test both modes thoroughly

### Sprint 3: Mutations (Higher Risk)
- [ ] Create `useModelMutations` hook
- [ ] Update `ModelHubView` to use mutations
- [ ] Add optimistic updates for better UX

### Sprint 4: Cleanup
- [ ] Remove legacy data fetching code
- [ ] Update documentation
- [ ] Performance testing

## Success Criteria
- ✅ Both legacy and database modes still work
- ✅ No regressions in functionality
- ✅ Better loading states with React Query
- ✅ Optimistic updates for snappier UX
- ✅ Reduced re-renders (React Query caching)

## Risks & Mitigation
| Risk | Mitigation |
|------|------------|
| Breaking legacy mode | Keep adapter, test both modes after each change |
| Over-engineering | Start simple, only add complexity when needed |
| Performance regression | Monitor bundle size, use React Query devtools |
| Merge conflicts | Small, focused PRs |
