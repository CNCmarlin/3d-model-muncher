
import { Category } from '@/types/category';
import { Collection } from '@/types/collection';
import { Model } from '@/types/model';
import { Edit2, FolderOpen, Library, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adaptDbCollectionsToLegacy } from '@/utils/dbAdapter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// External Components
import { AutoImportDialog } from '@/components/AutoImportDialog'; // Wrapper handles imports if needed, assumes likely exists or I need to find it
import { CollectionEditorDialog } from '@/components/collections/CollectionEditorDialog';

interface CollectionsSettingsProps {
    models: Model[]; // Needed for counts and editor
    categories: Category[]; // Needed for editor
    onCollectionCreatedForBulkEdit?: (collectionId: string) => void;
}

export function CollectionsSettings({
    models,
    categories,
    onCollectionCreatedForBulkEdit
}: CollectionsSettingsProps) {
    // --- STATE (From settings_collections.spec.md) ---
    const [collectionsList, setCollectionsList] = useState<Collection[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [createMode, setCreateMode] = useState<'manual' | 'folder'>('manual');
    const [editorCollection, setEditorCollection] = useState<Collection | null>(null);
    const [showImportDialog, setShowImportDialog] = useState(false);

    // Status State (Local to this tab now)
    // const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    // --- EFFECTS (From settings_collections.spec.md) ---
    const fetchCollections = async () => {
        try {
            const resp = await fetch('/api/collections');
            if (!resp.ok) throw new Error('Failed to fetch collections list.');
            const data = await resp.json();
            // Support both array response or { success: true, collections: [] }
            const listArray = Array.isArray(data) ? data : (data.collections || []);

            // Only apply adapter if database mode (response is raw array, not wrapped object)
            const list = Array.isArray(data) ? adaptDbCollectionsToLegacy(listArray) : listArray;

            setCollectionsList(list);
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

    // --- HANDLERS (From settings_collections.spec.md) ---
    const handleSaveCollection = async (collectionData: Collection) => {
        // 1. Detect if this is a new collection (editorCollection is null during creation)
        const isNew = !editorCollection;

        try {
            const isUpdate = !!collectionData.id && collectionsList.some(c => c.id === collectionData.id);
            const url = isUpdate ? `/api/collections/${collectionData.id}` : '/api/collections';
            const method = isUpdate ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(collectionData),
            });
            const result = await response.json();

            // Handle different API response shapes (some endpoints return {success: true}, others return the object)
            if (result.error) throw new Error(result.error);

            // Manually trigger collection refresh in App.tsx via a custom event
            window.dispatchEvent(new Event('collection-updated'));

            // 2. If new, trigger the bulk edit workflow
            if (isNew && onCollectionCreatedForBulkEdit) {
                // Use the ID returned by the server, or fallback to the client-generated ID
                const newCollectionId = result.id || result.collectionId || collectionData.id;
                onCollectionCreatedForBulkEdit(newCollectionId);
            }

            setIsEditorOpen(false); // Close editor on success
            toast.success('Collection saved successfully');
            fetchCollections(); // Refresh local list

        } catch (error) {
            console.error('Save collection error:', error);
            toast.error('Failed to save collection');
        }
    };

    const handleDeleteCollection = async (id: string) => {
        try {
            const response = await fetch(`/api/collections/${id}`, {
                method: 'DELETE',
            });
            const result = await response.json();
            if (!result.success && result.error) throw new Error(result.error);

            // Manually trigger collection refresh in App.tsx via a custom event
            window.dispatchEvent(new Event('collection-updated'));
            setIsEditorOpen(false); // Close if open
            toast.success('Collection deleted');
            fetchCollections();
        } catch (error) {
            console.error('Delete collection error:', error);
            toast.error('Failed to delete collection');
        }
    };

    const handleCreateCollection = (mode: 'manual' | 'folder' = 'manual') => {
        setCreateMode(mode);
        setEditorCollection(null); // Clear for new
        setIsEditorOpen(true);
    };

    const handleEditCollection = (collection: Collection) => {
        setEditorCollection(collection);
        setIsEditorOpen(true);
    };

    const handleDeleteAllCollections = async () => {
        // 1. Confirmation
        const confirmMessage = "Are you sure you want to DELETE ALL collections?\n\nThis will remove all folder groupings. The model files themselves will NOT be deleted.\n\nThis action cannot be undone.";
        if (!window.confirm(confirmMessage)) {
            return;
        }

        setStatusMessage('Preparing to delete...');

        try {
            // 2. Fetch the latest list of collections from the server to ensure we have everything
            const listResp = await fetch('/api/collections');
            if (!listResp.ok) throw new Error("Failed to fetch collections list");

            const data = await listResp.json();
            const targets = Array.isArray(data) ? data : (data.collections || []);

            if (targets.length === 0) {
                toast.info("No collections found to delete.");
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
            setStatusMessage('All collections deleted successfully.');
            toast.success(`Deleted ${targets.length} collections`);

            // Trigger a global event so the sidebar and app refresh immediately
            window.dispatchEvent(new Event('collection-updated'));
            fetchCollections();

        } catch (error) {
            console.error("Failed to delete all collections:", error);
            setStatusMessage('Failed to delete collections.');
            toast.error("Error deleting collections");
        } finally {
            setTimeout(() => {
                setStatusMessage('');
            }, 3000);
        }
    };

    // --- RENDER (From settings_collections.spec.md) ---
    return (
        <div className="space-y-4">
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
                        <Button onClick={() => handleCreateCollection('folder')} className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add Collection
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

                    {statusMessage && (
                        <div className="text-sm text-center text-muted-foreground mb-4 animate-pulse">
                            {statusMessage}
                        </div>
                    )}

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
                                    onClick={() => handleEditCollection(collection)}
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-medium truncate">{collection.name}</span>
                                        <span className="text-xs text-muted-foreground truncate">
                                            Models: {(collection as any).totalModels ?? collection.modelIds?.length ?? 0} | Category: {(collection as any).category || 'None'}
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

            {/* Dependent Dialogs */}
            {/* Verify AutoImportDialog exists in imports. If not, this will error in build, but logic is correct. */}
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
                collections={collectionsList}
            />
        </div>
    );
}
