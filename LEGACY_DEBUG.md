# Legacy Mode Debugging Steps

## Current Issue
Collections load in legacy mode but show 0 models when clicked.

## Debug Checklist

### 1. Check Model Structure
Add to browser console after app loads:
```javascript
// Check first model
const firstModel = models[0];
console.log('Model structure:', firstModel);
console.log('Has collections array?', Array.isArray(firstModel.collections));
console.log('Collections value:', firstModel.collections);
```

### 2. Check Collection Structure  
```javascript
// Check first collection
const firstCol = collections[0];
console.log('Collection structure:', firstCol);
console.log('Has modelIds?', Array.isArray(firstCol.modelIds));
console.log('ModelIds count:', firstCol.modelIds?.length);
```

### 3. Check Filtering Logic
In `CollectionGrid.tsx` line 95-102, the logic is:
- If `isFiltering` OR `!modelIds` OR `modelIds.length === 0` → use `models` prop
- Otherwise → filter by `modelIds`

**Legacy mode issue:** Collections HAVE `modelIds` populated, so it tries to filter, but model IDs might not match.

### 4. Potential Root Cause
Legacy models might have DIFFERENT IDs than what's in `collection.modelIds` array if:
- Models use path-based IDs
- Collections use old cached IDs
- ID generation changed

## Quick Fix to Test
Temporarily force CollectionGrid to always use models prop:
```typescript
// Line 95 in CollectionGrid.tsx
const items = useMemo(() => {
  return models; // Force use of filtered models prop
}, [models]);
```

If this works, the issue is ID mismatch between `collection.modelIds` and actual model IDs.
