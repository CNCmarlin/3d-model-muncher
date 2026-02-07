
# Categories Tab Specification

**Source**: `src/components/SettingsPage.tsx.bak`
**Extraction Date**: 2026-02-06
**Purpose**: Immutable reference for reconstructing `CategoriesTab.tsx`.

## 1. State Logic
```typescript
  // Categories State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [unmappedCategories, setUnmappedCategories] = useState<Array<{ label: string, count: number }>>([]);
  const [localCategories, setLocalCategories] = useState<Category[]>([]); // Synced with AppConfig

  // Dialog State
  const [isRenameDialogOpen, setIsCategoryRenameDialogOpen] = useState(false); // Renamed in spec for clarity
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Form State
  const [renameCategoryValue, setRenameCategoryValue] = useState('');
  const [renameCategoryIcon, setRenameCategoryIcon] = useState('');
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('folder');
```

## 2. Calculation Logic (Unmapped)
```typescript
  // Effect to calculate unmapped categories
  useEffect(() => {
    // localCategories vs models.category
    const configuredLabels = new Set(localCategories.map(c => c.label.toLowerCase()));
    const unmappedMap = new Map<string, number>();

    models.forEach(m => {
      if (m.category && !configuredLabels.has(m.category.toLowerCase()) && m.category !== 'Uncategorized') {
        unmappedMap.set(m.category, (unmappedMap.get(m.category) || 0) + 1);
      }
    });

    setUnmappedCategories(Array.from(unmappedMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count));
  }, [models, localCategories]);
```

## 3. Handlers
```typescript
  // Drag & Drop
  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    if (draggedIndex !== index) {
      const newCats = [...localCategories];
      const [draggedItem] = newCats.splice(draggedIndex, 1);
      newCats.splice(index, 0, draggedItem);
      setLocalCategories(newCats);
      setDraggedIndex(index);
    }
  };
  const handleDragEnd = () => setDraggedIndex(null);

  const handleSaveCategories = async () => {
    const newConfig = { ...localConfig, categories: localCategories };
    await handleSaveConfig(newConfig);
    onCategoriesUpdate(localCategories); // Parent update
  };

  // CRUD
  const handleConfirmAddCategory = async () => {
    if (!newCategoryLabel.trim()) return;
    const newId = newCategoryLabel.trim().toLowerCase().replace(/\s+/g, '_');
    const newCat: Category = {
      id: newId,
      label: newCategoryLabel.trim(),
      icon: normalizeIconName(newCategoryIcon)
    };
    // ... validation ...
    const updated = [...localCategories, newCat];
    setLocalCategories(updated);
    // ... save config ...
  };

  const handleRenameCategory = async (oldId: string, newId: string, newLabel: string) => {
    // 1. Update Config (Categories list)
    // 2. Scan all models with oldLabel and update to newLabel
    // 3. Save all affected models
  };

  const handleDeleteCategory = async (catId: string) => {
    // 1. Update Config (Remove from list)
    // 2. Scan all models with deleted label -> set to "Uncategorized"
    // 3. Save all affected models
  };
```

## 4. UI Render Block
```tsx
          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-6 mt-0">
             {/* ... Drag Sortable List ... */}
             {/* ... Unmapped Categories Section ... */}
             {/* ... Save Button ... */}
          </TabsContent>
```

## 5. Dependent Dialogs
- `RenameCategoryDialog` (Lines 3876-3951)
- `DeleteConfirmDialog` (Lines 3953-3979)
- `AddCategoryDialog` (Lines 3981-4034)
