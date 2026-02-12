# Backend API Routes Audit - React Query Mutations

> **Context**: Sprint 3 mutations are complete on frontend, but we need to verify/create backend endpoints  
> **Critical**: Protect legacy mode at all costs - DO NOT modify `models.js` or `collections.js`

---

## 📊 Current State: Database Mode Routes

### Models Routes (`server/routes/models_db.js`)

| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/models` | GET | ✅ EXISTS | `useModelsQuery` |
| `/api/models/:id` | GET | ✅ EXISTS | Future detail views |
| `/api/models/save-model` | POST | ✅ EXISTS | Legacy compatibility |
| `/api/models/:id` | DELETE | ✅ EXISTS | `useModelMutations.deleteModel` ✅ |
| `/api/models/bulk-edit` | POST | ✅ EXISTS | Need to adapt for mutations |
| `/api/models/search` | GET | ✅ EXISTS | Search functionality |

### Collections Routes (`server/routes/collections_db.js`)
**Status**: Need to check this file

### Tags Routes (`server/routes/tags_db.js`)
| Endpoint | Method | Status | Used By |
|----------|--------|--------|---------|
| `/api/tags` | GET | ✅ EXISTS | `useTagsQuery` (verified working) |

---

## ❌ Missing Endpoints for React Query Mutations

### Priority 1: CRITICAL

#### 1. PATCH `/api/models/:id` - Update Single Model
**Status**: ✅ IMPLEMENTED

**Solution**: Added PATCH route that uses existing `modelService.updateModel()`
- Placed after POST `/api/models/save-model` (legacy kept intact)
- Returns model directly (React Query format)
- Line: ~116-128 in `models_db.js`

**Legacy preserved**: POST `/api/models/save-model` still works

---

#### 2. PATCH `/api/models/bulk-update` - Bulk Update Models  
**Status**: ✅ IMPLEMENTED

**Solution**: Added PATCH route that adapts request format
- Placed after POST `/api/models/bulk-edit` (legacy kept intact)
- Adapts `{ modelIds, data }` to service's `{ modelIds, updates, bulkTagChanges }` format
- Returns result directly (React Query format)
- Line: ~166-196 in `models_db.js`

**Legacy preserved**: POST `/api/models/bulk-edit` still works

---

### Priority 2: MEDIUM (Collections)

#### 3. POST `/api/collections` - Create Collection
**Status**: ❓ Need to check `collections_db.js`

#### 4. PATCH `/api/collections/:id` - Update Collection
**Status**: ❓ Need to check `collections_db.js`

#### 5. DELETE `/api/collections/:id` - Delete Collection  
**Status**: ❓ Need to check `collections_db.js`

---

## 🛡️ Legacy Protection Checklist

Before touching ANY route file:

- [ ] **Backup**: `.bak` file created
- [ ] **Verify**: routeSelector.js routes to correct file based on mode
- [ ] **Confirm**: NOT modifying `models.js` (legacy)
- [ ] **Confirm**: NOT modifying `collections.js` (legacy)
- [ ] **Test Plan**: How to verify both modes still work

### Critical Files (DO NOT MODIFY)
- ❌ `server/routes/models.js` - Legacy mode
- ❌ `server/routes/collections.js` - Legacy mode  
- ✅ `server/routes/models_db.js` - Database mode (safe to modify)
- ✅ `server/routes/collections_db.js` - Database mode (safe to modify)

---

## 📋 Implementation Plan

### Step 1: Verify Route Selector ✅
**File**: `server-utils/routeSelector.js`

Ensure routing works:
- `useDatabaseBackend=true` → `models_db.js`
- `useDatabaseBackend=false` → `models.js`

**Verification Commands**:
```bash
# Check which routes are loaded on startup
grep "Loading.*routes" server.js
# Server logs should show: [RouteSelector] Loading DATABASE model routes
```

---

### Step 2: Add Missing Model Endpoints

#### A. Add PATCH `/api/models/:id`
**File**: `server/routes/models_db.js`
**Location**: After existing POST `/api/models/save-model`

```javascript
// --- PATCH /api/models/:id ---
// Update a single model (REST-compliant endpoint)
router.patch('/models/:id', async (req, res) => {
    try {
        console.log(`[DB API] PATCH /api/models/${req.params.id}`);
        
        const model = await modelService.updateModel(req.params.id, req.body);
        
        res.json({
            success: true,
            data: model
        });
    } catch (error) {
        handleZodError(error, res);
    }
});
```

**Test**:
```bash
curl -X PATCH http://localhost:3001/api/models/MODEL_ID \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'
```

---

#### B. Add PATCH `/api/models/bulk-update`
**File**: `server/routes/models_db.js`
**Location**: After POST `/api/models/bulk-edit`

```javascript
// --- PATCH /api/models/bulk-update ---
// REST-compliant bulk update (adapter for React Query)
router.patch('/models/bulk-update', async (req, res) => {
    try {
        console.log('[DB API] PATCH /api/models/bulk-update');
        
        const { modelIds, data } = req.body;
        
        // Adapt to existing bulk-edit service
        const adaptedRequest = {
            modelIds,
            updates: data,
            bulkTagChanges: data.tagChanges  // Extract if present
        };
        
        const result = await modelService.bulkEditModels(adaptedRequest);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        handleZodError(error, res);
    }
});
```

**Test**:
```bash
curl -X PATCH http://localhost:3001/api/models/bulk-update \
  -H "Content-Type: application/json" \
  -d '{"modelIds": ["id1","id2"], "data": {"isPrinted": true}}'
```

---

### Step 3: Check Collections Endpoints
**File**: `server/routes/collections_db.js`

Need to verify:
- [ ] GET `/api/collections` exists
- [ ] POST `/api/collections` exists  
- [ ] PATCH `/api/collections/:id` exists (or needs adding)
- [ ] DELETE `/api/collections/:id` exists

---

## ✅ Testing Strategy

### Test 1: Legacy Mode Still Works
```bash
# 1. Set legacy mode
# In .env or config: useDatabaseBackend=false

# 2. Start server
npm run server

# 3. Verify legacy routes loaded
# Logs should show: [RouteSelector] Loading LEGACY model routes

# 4. Test model save
curl -X POST http://localhost:3001/api/save-model \
  -d '{"id": "test-id", "name": "Test"}'

# 5. Expected: ✅ Success
```

### Test 2: Database Mode New Endpoints
```bash
# 1. Set database mode  
# useDatabaseBackend=true

# 2. Start server
npm run server

# 3. Test PATCH endpoint
curl -X PATCH http://localhost:3001/api/models/MODEL_ID \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated"}'

# 4. Expected: ✅ Success
```

### Test 3: React Query Integration
1. Start both server and frontend
2. Open browser DevTools → Network tab
3. Edit a model in ModelHubView
4. Verify:
   - ✅ Request goes to PATCH `/api/models/:id`
   - ✅ Response returns updated model
   - ✅ UI updates instantly (optimistic)
   - ✅ No error toasts

---

## 🚨 Rollback Plan

If anything breaks:

1. **Stop server**: `Ctrl+C`
2. **Restore from .bak**: `Copy-Item models_db.js.bak models_db.js -Force`
3. **Switch to legacy mode**: Set `useDatabaseBackend=false`
4. **Restart**: `npm run server`
5. **Verify app works**

---

## 📝 Next Steps

1. [ ] Run Step 1: Verify route selector
2. [ ] Create `.bak` of `models_db.js`
3. [ ] Implement PATCH `/api/models/:id`
4. [ ] Implement PATCH `/api/models/bulk-update`
5. [ ] Test in database mode
6. [ ] Switch to legacy mode, verify still works
7. [ ] Check collections routes
8. [ ] Document findings here
9. [ ] Then test React Query mutations in UI

**DO NOT SKIP STEPS 5-6! Legacy protection is CRITICAL!**
