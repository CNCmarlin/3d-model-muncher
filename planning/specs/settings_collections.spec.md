
# Collections Tab Specification

**Source**: `src/components/SettingsPage.tsx.bak`
**Extraction Date**: 2026-02-06
**Purpose**: Immutable reference for reconstructing `CollectionsTab.tsx`.

## 1. State Logic
```typescript
  // Collections State (Found in main component state block)
  const [collectionsList, setCollectionsList] = useState<Collection[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'manual' | 'folder'>('manual');
  const [editorCollection, setEditorCollection] = useState<Collection | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Status State (Reused from generic settings)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
```

## 2. Effects
```typescript
  // Load Logic
  const fetchCollections = async () => {
    try {
      const resp = await fetch('/api/collections');
      if (!resp.ok) throw new Error('Failed to fetch collections list.');
      const data = await resp.json();
      if (data.success) {
        setCollectionsList(data.collections || []);
      } else {
        console.error("Collections fetch error:", data.error);
      }
    } catch (err) {
      console.error("Failed fetching collections:", err);
      // toast.error("Failed to load collections for management.");
    }
  };

  useEffect(() => {
    fetchCollections();

    // Add a custom listener to refresh after save/delete/import actions
    const handleRefresh = () => fetchCollections();
    window.addEventListener('collection-updated', handleRefresh);

    return () => {
      window.removeEventListener('collection-updated', handleRefresh);
    };
  }, []);
```

## 3. Handlers
```typescript
  const handleSaveCollection = async (collectionData: Collection) => {
    // 1. Detect if this is a new collection (editorCollection is null during creation)
    const isNew = !editorCollection;

    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectionData),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    // Manually trigger collection refresh in App.tsx via a custom event
    window.dispatchEvent(new Event('collection-updated'));

    // 2. If new, trigger the bulk edit workflow
    if (isNew && onCollectionCreatedForBulkEdit) {
      // Use the ID returned by the server, or fallback to the client-generated ID
      const newCollectionId = result.collectionId || collectionData.id;
      onCollectionCreatedForBulkEdit(newCollectionId);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    const response = await fetch(`/api/collections/${id}`, {
      method: 'DELETE',
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    // Manually trigger collection refresh in App.tsx via a custom event
    window.dispatchEvent(new Event('collection-updated'));
  };

  const handleCreateCollection = (mode: 'manual' | 'folder' = 'manual') => {
    setCreateMode(mode);
    setEditorCollection(null); // Clear for new
    setIsEditorOpen(true);
  };

  const handleDeleteAllCollections = async () => {    // 1. Confirmation
    const confirmMessage = "Are you sure you want to DELETE ALL collections?\n\nThis will remove all folder groupings. The model files themselves will NOT be deleted.\n\nThis action cannot be undone.";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setSaveStatus('saving');
    setStatusMessage('Preparing to delete...');

    try {
      // 2. Fetch the latest list of collections from the server to ensure we have everything
      const listResp = await fetch('/api/collections');
      if (!listResp.ok) throw new Error("Failed to fetch collections list");

      const data = await listResp.json();
      const targets = data.collections || [];

      if (targets.length === 0) {
        toast.info("No collections found to delete.");
        setSaveStatus('idle');
        setStatusMessage('');
        return;
      }

      setStatusMessage(`Deleting ${targets.length} collections...`);

      // 3. Delete them one by one
      const deletePromises = targets.map((col: any) =>
        fetch(`/api/collections/${col.id}`, { method: 'DELETE' })
      );

      await Promise.all(deletePromises);

      // 4. Success handling
      setSaveStatus('saved');
      setStatusMessage('All collections deleted successfully.');
      toast.success(`Deleted ${targets.length} collections`);

      // Trigger a global event so the sidebar and app refresh immediately
      window.dispatchEvent(new Event('collection-updated'));

    } catch (error) {
      console.error("Failed to delete all collections:", error);
      setSaveStatus('error');
      setStatusMessage('Failed to delete collections.');
      toast.error("Error deleting collections");
    } finally {
      setTimeout(() => {
        setSaveStatus('idle');
        setStatusMessage('');
      }, 3000);
    }
  };

  const handleEditCollection = (collection: Collection) => {
    setEditorCollection(collection);
    setIsEditorOpen(true);
  };
```

## 4. UI Render Block
```tsx
          {/* [NEW] Collections Tab */}
          <TabsContent value="collections" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Library className="w-5 h-5" />
                  <span>Collections Management</span>
                </CardTitle>
                <CardDescription>
                  Manage, edit, and delete the master definitions for all collections in your library.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button onClick={() => handleCreateCollection('folder')} variant="outline" className="gap-2">
                    <FolderPlus className="h-4 w-4" />
                    New Collection
                  </Button>
                  <Button onClick={() => handleCreateCollection('manual')} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Manual Import
                  </Button>
                  <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Auto-Import
                  </Button>

                  {/* Spacer pushes Delete to the right */}
                  <div className="flex-1" />

                  <Button
                    variant="destructive"
                    onClick={handleDeleteAllCollections}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete All
                  </Button>
                </div>
                <Separator className="my-4" />
                {/* Collections List */}
                {collectionsList.length === 0 ? (
                  <p className="text-muted-foreground italic">No collections defined yet. Use the buttons above to get started.</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {collectionsList.map((collection) => (
                      <div
                        key={collection.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg border cursor-pointer hover:bg-muted/70 transition-colors"
                        onClick={() => handleEditCollection(collection)} // <-- EDIT HANDLER
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{collection.name}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            Models: {collection.modelIds.length} | Category: {collection.category || 'None'}
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" className="ml-4 flex-shrink-0">
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
```

## 5. Dependent Dialogs (Outside TabContent)
```tsx
      <AutoImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
      />
      <CollectionEditorDialog
        collection={editorCollection}
        categories={categories}
        models={models}
        onSave={handleSaveCollection}
        onDelete={handleDeleteCollection}
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        initialMode={createMode}
      />
```
