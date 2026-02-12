# Frontend Migration Strategy: "Duplicate & Deprecate"

This document outlines the strategy for migrating the frontend to the new Database API while maintaining 100% legacy compatibility during the transition.

## 🎯 Core Philosophy
Just like the backend used `_db.js` files to run in parallel, the frontend will use a **"Dual-Component"** strategy. We will strictly separate "Legacy Mode" (Client-side filtering, JSON data) from "Database Mode" (Server-side filtering, React Query).

## 🏗️ Architectural Pattern

### 1. The Switch (App.tsx)
We will use the existing `useDatabaseBackend` flag to route to the correct top-level views.

```tsx
// App.tsx
{useDatabaseBackend ? (
  <ModelsView_DB /> // New Component
) : (
  <ModelsView />    // Legacy Component (Unchanged)
)}
```

### 2. Component Naming Convention
- **`Original.tsx`**: The legacy component. **DO NOT MODIFY** logic here if possible. Only apply hotfixes.
- **`Original_DB.tsx`**: The new component built for the Database API.
    - Uses `useQuery` hooks.
    - Assumes Server-Side Pagination/Filtering.
    - Uses new stricter Types.

### 3. The Adapter Layer (`dbAdapter.ts`)
Legacy components (like `ModelCard.tsx`) are complex and expensive to rewrite immediately. We will use `dbAdapter.ts` to transform DB data into the "Legacy Shape" so we can reuse leaf-node components.

```typescript
// dbAdapter.ts
export function adaptDbModelToLegacy(dbModel: DbModel): LegacyModel {
  return {
    ...dbModel,
    // Map missing legacy fields so old components don't crash
    thumbnail: dbModel.coverImage, 
    related_files: [], 
  };
}
```

## 📅 Migration Plan

### Phase 1: Hybrid Mode (Current State) ✅
- **Goal**: detailed in Phase 3.3
- **State**: App uses new `useModels` hooks which internally adapt DB data to Legacy types.
- **Views**: Reusing `ModelsView` (legacy) but feeding it adapted data.
- **Pros**: Quick "it works".
- **Cons**: Still doing client-side filtering (slow), can't use new features.

### Phase 2: Parallel Views (Next Step) 🚧
- **Goal**: Full Server-Side power.
- **Action**: Create `ModelsView_DB.tsx`.
    - **Features**:
        - Server-side Search (`/api/models?search=...`)
        - Server-side Pagination (`page=1`)
        - optimistic updates via React Query.
- **UI**: Add a toggle in Developer Settings to force "DB View" even if backend is legacy (for UI testing).

### Phase 3: Dual-System Verification (Final Goal)
- **Goal**: A fully functional dual system where legacy and DB modes coexist.
- **Action**:
    1. Verify all features work in both modes.
    2. Create a stable release branch for the dual-system state.
    3. No component cleanup/deletion in this phase.

## 🛡️ Handling Legacy Requirements
| Requirement | Legacy Mode | Database Mode |
|-------------|-------------|---------------|
| **Filtering** | Client-side (in `useFilteredModels`) | Server-side (URL params -> API) |
| **Data Shape** | Custom JSON structure | Strictly typed Prisma schema |
| **Real-time** | File watcher -> Socket -> Refetch | React Query Invalidation (Smarter) |
| **Performance** | Slow init load (fetches all) | Fast init (paginated) |

## ✅ Checklist for Frontend Refactor
- [ ] Create `ModelsView_DB.tsx` (New Architecture)
- [ ] Create `ModelHubView_DB.tsx` (New Architecture)
- [ ] Update `App.tsx` to conditionally render `_DB` versions based on config.
