# Database Migration Playbook

## Decision Tree: Fix or Rewrite?

When you encounter a legacy component that needs database compatibility:

### 🛑 STOP and Ask:

1. **Does this file have `onModelUpdate` callbacks?** → Rewrite
2. **Does it manually diff models before saving?** → Rewrite  
3. **Does it use `fetch()` directly instead of React Query?** → Rewrite
4. **Is there a `_db.tsx` version already?** → Use that instead

### ✅ When to Fix In Place:

- Component is already using React Query
- Only 1-2 fields need mapping
- No callback spaghetti

### 🚫 When to Create `_DB.tsx` Version:

- Component has legacy save handlers
- Multiple callback props (`onUpdate`, `onSave`, `onModelChange`)
- File >500 lines with mixed concerns

## Strangler Fig Pattern

```
1. Copy file → ComponentName_DB.tsx
2. Strip ALL legacy code flagged below
3. Test thoroughly
4. Flip switch in parent component
5. Delete old file after 1 sprint
```

## Legacy Code Red Flags

```typescript
// ❌ DELETE these patterns:
- Functions named `handleModelUpdateParams`
- Props: `onModelUpdate`, `onSave`, `onDataChange`
- Manual `fetch()` calls
- Diff logic (JSON.stringify comparisons)
- Callback chains more than 2 levels deep

// ✅ REPLACE with:
- `useMutation` from React Query
- Direct mutation calls
- Cache invalidation
- Simple prop drilling (max 2 levels)
```

## File Naming Convention

```
Original:           ModelHubView.tsx
Database version:   ModelHubView_DB.tsx (temporary)
After migration:    ModelHubView.tsx (replace original)
```

## Checklist for Each _DB.tsx File

- [ ] Copy original file
- [ ] Remove `onModelUpdate` prop from interface
- [ ] Delete `handleModelUpdateParams` or similar diff functions
- [ ] Replace `fetch()` with `useMutation`
- [ ] Remove all `JSON.stringify` comparisons
- [ ] Test: Create, Read, Update, Delete
- [ ] Document breaking changes (if parent needs updates)

## Time Budget Rule

**If you spend >30 minutes debugging legacy code compatibility → STOP and create _DB.tsx**

## Files That Need This Pattern

Track here as you identify them:

- [x] ModelHubView.tsx → ModelHubView_DB.tsx (in progress)
- [ ] ModelsView.tsx (check for fetch calls)
- [ ] CollectionView.tsx (check for callbacks)
- [ ] BulkEditDrawer.tsx (definitely needs it)

## Example Commit Message

```
feat: create ModelHubView_DB with clean database-first patterns

- Remove legacy onModelUpdate callbacks
- Replace manual diff with React Query mutations
- Simplify save flow (no handleModelUpdateParams)
- Preserve UI/UX completely

Legacy ModelHubView.tsx kept as fallback
```
