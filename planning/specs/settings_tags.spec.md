
# Tags Tab Specification

**Source**: `src/components/SettingsPage.tsx.bak`
**Extraction Date**: 2026-02-06
**Purpose**: Immutable reference for reconstructing `TagsTab.tsx`.

## 1. State Logic
```typescript
  // Tags State
  const [selectedTag, setSelectedTag] = useState<any | null>(null);
  const [viewTagModels, setViewTagModels] = useState<any | null>(null);
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameTagValue, setRenameTagValue] = useState('');

  // Refs
  const tagInputRef = useRef<HTMLInputElement>(null);
```

## 2. Calculation Logic (Stats)
```typescript
  const getTagStats = () => {
    const allTags = getAllTags();
    const totalTags = allTags.length;
    const totalUsages = allTags.reduce((sum, tag) => sum + tag.count, 0);
    const avgUsage = totalTags > 0 ? (totalUsages / totalTags).toFixed(1) : '0';

    return { totalTags, totalUsages, avgUsage };
  };

  const stats = getTagStats();

  const getAllTags = () => {
    // Derived from models prop
    const tagMap = new Map<string, number>();
    models.forEach(m => {
      m.tags?.forEach(t => {
        tagMap.set(t, (tagMap.get(t) || 0) + 1);
      });
    });
    return Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }));
  };

  // Filtered List
  const allTags = getAllTags();
  const filteredTags = allTags
    .filter(t => t.name.toLowerCase().includes(tagSearchTerm.toLowerCase()))
    .sort((a, b) => b.count - a.count); // Most used first
```

## 3. Handlers
```typescript
  const handleRenameTag = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;

    setSaveStatus('saving');
    setStatusMessage(`Renaming tag "${oldName}" to "${newName}"...`);

    try {
      // Optimistic update
      const updatedModels = models.map(model => {
        if (!model.tags?.includes(oldName)) return model;
        return {
          ...model,
          tags: model.tags.map(t => (t === oldName ? newName : t))
        };
      });

      // Find models that need saving
      const modelsToUpdate = updatedModels.filter(m => m.tags?.includes(newName) && m.tags?.length !== models.find(old => old.id === m.id)?.tags?.length); // Simplified logic check

      // Actually, we just need to iterate original models and see if they had the old tag
      const changedModels = models.filter(m => m.tags?.includes(oldName));

      // Batch update on server
      // NOTE: Original implementation looped fetch calls.
      const updatePromises = changedModels.map(async (model) => {
        const newTags = model.tags.map(t => (t === oldName ? newName : t));
        // De-dupe tags if newName already existed
        const uniqueTags = Array.from(new Set(newTags));

        const response = await fetch('/api/save-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...model, tags: uniqueTags })
        });
        if (!response.ok) throw new Error(`Failed to update ${model.name}`);
        return { ...model, tags: uniqueTags };
      });

      const results = await Promise.all(updatePromises);
      onModelsUpdate(updatedModels); // Update parent state

      setSaveStatus('saved');
      setStatusMessage(`Renamed tag in ${results.length} models`);
      setIsRenameDialogOpen(false);
      setRenameTagValue('');
      setSelectedTag(null);
    } catch (error) {
      console.error('Rename tag error:', error);
      setSaveStatus('error');
      setStatusMessage('Failed to rename tag');
    } finally {
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    if (!window.confirm(`Are you sure you want to delete tag "${tagName}" from ALL models?`)) return;

    setSaveStatus('saving');
    setStatusMessage(`Deleting tag "${tagName}"...`);

    try {
      const changedModels = models.filter(m => m.tags?.includes(tagName));

      const updatePromises = changedModels.map(async (model) => {
        const newTags = model.tags.filter(t => t !== tagName);
        const response = await fetch('/api/save-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...model, tags: newTags })
        });
        return { ...model, tags: newTags };
      });

      await Promise.all(updatePromises);

      // Parent update
      const updatedAll = models.map(m => {
        if (m.tags?.includes(tagName)) {
          return { ...m, tags: m.tags.filter(t => t !== tagName) };
        }
        return m;
      });
      onModelsUpdate(updatedAll);

      setSaveStatus('saved');
      setStatusMessage(`Deleted tag from ${changedModels.length} models`);
    } catch (error) {
      setSaveStatus('error');
      setStatusMessage('Failed to delete tag');
    } finally {
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const startRenameTag = (tag: any) => {
    setSelectedTag(tag);
    setRenameTagValue(tag.name);
    setIsRenameDialogOpen(true);
  };

  const handleViewTagModels = (tag: any) => {
    // Find all models with this tag
    const matchingModels = models.filter(m => m.tags?.includes(tag.name));
    setViewTagModels({ name: tag.name, count: matchingModels.length, models: matchingModels });
  };
```

## 4. UI Render Block
```tsx
          {/* Tag Management Tab */}
          <TabsContent value="tags" className="space-y-6 mt-0">
            {/* Tag Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <Tag className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-semibold">{stats.totalTags}</p>
                      <p className="text-sm text-muted-foreground">Total Tags</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ... (Other Stats Cards) ... */}
            </div>

            {/* Tag Management */}
            <Card>
              <CardHeader>
                <CardTitle>Global Tag Management</CardTitle>
                <CardDescription>
                  Manage tags across all your models. Rename or delete tags globally.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tags..."
                      value={tagSearchTerm}
                      onChange={(e) => setTagSearchTerm(e.target.value)}
                      ref={tagInputRef}
                      className="pl-10 pr-10"
                    />
                    {/* ... Clear Button ... */}
                  </div>
                </div>

                {/* Tags List */}
                <ScrollArea className="max-h-96 w-full">
                  <div className="space-y-2 p-2 max-h-80">
                    {filteredTags.map((tag) => (
                      <div key={tag.name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        {/* ... Tag Row UI ... */}
                        <div className="flex items-center gap-2">
                          <Button onClick={() => handleViewTagModels(tag)}>View</Button>
                          <Button onClick={() => startRenameTag(tag)}>Rename</Button>
                          <Button onClick={() => handleDeleteTag(tag.name)}>Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
```

## 5. Dependent Dialogs
- `RenameTagDialog` (Lines 3751-3782)
- `ViewTagModelsDialog` (Lines 4036-4082)
