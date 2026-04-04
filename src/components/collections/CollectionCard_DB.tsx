import { CollectionEditorDialog_DB } from "@/components/collections/CollectionEditorDialog_DB";
import { ConvertToModelFolderDialog_DB } from "@/components/collections/ConvertToModelFolderDialog_DB";
import { ConfirmDialog_DB } from "@/components/shared/ConfirmDialog_DB";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfig } from "@/context/AppConfigContext";
import { useDialog_db } from "@/hooks/useDialog_db";
import type { Category } from "@/types/category";
import type { Collection } from "@/types/collection_db";
import { getDynamicModelCount } from "@/utils/collectionUtils_db";
import { ChevronRight, Folder, FolderOpen, FolderSymlink, MoreVertical, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export interface CollectionCardProps {
  collection: Collection;
  categories: Category[];
  collections: Collection[];
  onOpen: (id: string) => void;
  onChanged?: () => void; // called after edit save
  onDeleted?: (id: string) => void;
  fallbackImage?: string;
  // Make models optional for now since it wasn't in the original props, but dialog needs it
  models?: any[];
}

export const CollectionCard_DB = ({ collection, collections, categories, onOpen, onChanged, onDeleted, fallbackImage }: CollectionCardProps) => {
  const editDialog = useDialog_db(false);
  const deleteDialog = useDialog_db(false);
  const convertDialog = useDialog_db(false);
  const revertDialog = useDialog_db(false);
  const [deletePhysicalFiles, setDeletePhysicalFiles] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const { appConfig } = useConfig();
  const collectionMode = appConfig?.settings?.collectionMode || 'strict';

  /* Restore Logic Variables */
  if (fallbackImage) console.log(`[CardRender] '${collection.name}' received fallback:`, fallbackImage);

  const getCoverUrl = (path: string | undefined | null) => {
    if (!path) return null;
    if (path.startsWith('/data/') || path.startsWith('/api/') || path.startsWith('http')) return path;
    if (path.startsWith('/models/')) return path;
    if (path.startsWith('models/')) return `/${path}`;
    return `/models/${path}`;
  };

  const coverSrc = getCoverUrl(
    collection.coverImagePath
      ? collection.coverImagePath
      : collection.coverImage
        ? collection.coverImage
        : (collection.images && collection.images.length > 0)
          ? collection.images[0]
          : fallbackImage
  );

  const handleSaved = (_updated: any) => {
    // Ask parent to refresh collections list
    onChanged?.();
  };

  const confirmDelete = async () => {
    if (!collection?.id) {
      console.warn('Delete requested for collection without id');
      deleteDialog.close();
      return;
    }
    try {
      const url = `/api/collections/${encodeURIComponent(collection.id)}${deletePhysicalFiles ? '?deleteFiles=true' : ''}`;
      console.log('[CollectionCard] Deleting via:', url);
      const resp = await fetch(url, { method: 'DELETE' });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Failed to delete collection: ${resp.status} ${errText}`);
      }

      toast.success("Collection deleted");
      onDeleted?.(collection.id);
      onChanged?.(); // Trigger UI refresh
      deleteDialog.close();
    } catch (e) {
      console.error('Delete collection failed:', e);
      toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Runtime guard
  const modelCount = getDynamicModelCount(collection, collections, collectionMode);

  const collectionId = collection?.id;

  return (
    <Card
      className="flex flex-col cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1"
      onClick={() => {
        if (collectionId) onOpen(collectionId);
      }}
    >
      <CardHeader className="p-0 shrink-0">
        <div className="relative aspect-square overflow-hidden rounded-t-lg bg-muted/40 flex items-center justify-center">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt={collection?.name || 'Collection cover'}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <Folder className="w-14 h-14 text-primary/80" />
          )}

          <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-background/50 backdrop-blur-sm hover:bg-background/80"
                  onClick={(e) => e.stopPropagation()}
                  title="Collection actions"
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={editDialog.open}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Convert ↔ Revert */}
                {!collection.isModelFolder ? (
                  <DropdownMenuItem onClick={convertDialog.open}>
                    <FolderSymlink className="h-4 w-4 mr-2" /> Convert to Model Folder
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={revertDialog.open}>
                    <RefreshCcw className="h-4 w-4 mr-2" /> Revert to Collection
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => { setDeletePhysicalFiles(false); deleteDialog.open(); }} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* Folder icon: open if model folder */}
          {collection.isModelFolder && (
            <span title="Model Folder" className="pointer-events-none">
              <FolderOpen className="h-4 w-4 text-primary/60" />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-1 flex-1">
        <h3 className="mb-0.5 font-medium line-clamp-2 leading-tight">{collection?.name || 'Untitled collection'}</h3>
        {collection?.description && (
          <p className="text-sm text-muted-foreground line-clamp-5 leading-snug">{collection.description}</p>
        )}
        <div className="text-muted-foreground space-y-0.5 mt-1 text-xs flex justify-between">
          <span>{modelCount} items</span>
          {collection.category && <span>{collection.category}</span>}
        </div>
      </CardContent>
      <CardFooter className="p-2 pt-0 mt-auto">
        <Button variant="ghost" size="sm" className="w-full justify-between px-2 bg-muted/30 hover:bg-muted/50">
          {`View ${modelCount} model${modelCount !== 1 ? 's' : ''}`}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardFooter>

      <div onClick={(e) => e.stopPropagation()}>
        <CollectionEditorDialog_DB
          open={editDialog.isOpen}
          onOpenChange={editDialog.setIsOpen}
          collection={collection ?? null}
          collections={collections}
          categories={categories}
          onSave={async (c) => { handleSaved(c); }}
          onDelete={async (_id) => { await confirmDelete(); }}
        />

        {/* Convert to Model Folder */}
        <ConvertToModelFolderDialog_DB
          open={convertDialog.isOpen}
          onOpenChange={convertDialog.setIsOpen}
          collection={collection}
          onConverted={() => { onChanged?.(); }}
        />

        {/* Revert to Collection */}
        <ConfirmDialog_DB
          open={revertDialog.isOpen}
          onOpenChange={revertDialog.setIsOpen}
          title="Revert to Collection?"
          description={`This will remove the model folder marker from disk and restore "${collection.name}" as a regular cloud collection. Previously demoted model records will be un-hidden.`}
          confirmLabel={isReverting ? 'Reverting…' : 'Revert to Collection'}
          variant="default"
          onConfirm={async () => {
            setIsReverting(true);
            try {
              const res = await fetch(`/api/collections/${encodeURIComponent(collection.id)}/revert-to-collection`, { method: 'POST' });
              const json = await res.json();
              if (!res.ok || !json.success) throw new Error(json.error || 'Revert failed');
              toast.success(`"${collection.name}" reverted to collection`);
              onChanged?.();
              revertDialog.close();
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setIsReverting(false);
            }
          }}
        />
      </div>

      <ConfirmDialog_DB
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.setIsOpen}
        title="Delete this collection?"
        description={`This will remove the collection "${collection?.name || ''}".`}
        confirmLabel={deletePhysicalFiles ? "Delete EVERYTHING" : "Delete Collection"}
        variant="destructive"
        onConfirm={async () => { await confirmDelete(); }}
      >
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start space-x-2 p-3 rounded-md border border-destructive/20 bg-destructive/5">
            <Checkbox
              id="deletePhy"
              checked={deletePhysicalFiles}
              onCheckedChange={(checked) => setDeletePhysicalFiles(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="deletePhy"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-destructive"
              >
                Also delete physical folder?
              </label>
              <p className="text-xs text-muted-foreground">
                If checked, this will <strong>permanently delete</strong> the folder and all 3D files inside it from your disk.
              </p>
            </div>
          </div>
        </div>
      </ConfirmDialog_DB>
    </Card>
  );
}
