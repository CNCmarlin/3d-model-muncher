# Quick Fix for CollectionGrid

## Location
`src/components/CollectionGrid.tsx` lines 94-101

## Current Code
```typescript
const items = useMemo(() => {
  if (isFiltering) {
    return models;
  }
  const set = new Set(modelIds);
  const filtered = models.filter(m => set.has(m.id));
  return filtered;
}, [modelIds, models, isFiltering]);
```

## Replace With
```typescript
const items = useMemo(() => {
  // Database-first: Use models prop if filtering OR modelIds unavailable
  if (isFiltering || !modelIds || modelIds.length === 0) {
    return models;
  }
  // Legacy: Filter by modelIds array  
  const set = new Set(modelIds);
  const filtered = models.filter(m => set.has(m.id));
  return filtered;
}, [modelIds, models, isFiltering]);
```

## What This Does
- **Legacy mode**: When `modelIds` is populated → filters models by that array  
- **Database mode**: When `modelIds` is `undefined` or empty → uses pre-filtered `models` prop from `useFilteredModels`
- **Both modes**: When `isFiltering=true` → always uses `models` prop

This maintains backward compatibility while enabling database-first functionality.
