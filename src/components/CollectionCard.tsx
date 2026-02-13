import { ChevronRight, Folder, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getLabel } from "@/constants/labels";
import { useDialog } from "@/hooks/useDialog";
import type { Category } from "@/types/category";
import type { Collection } from "@/types/collection";
import { ConfigManager } from "@/utils/configManager";
import CollectionEditDrawer from "@/components/CollectionEditDrawer";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface CollectionCardProps {
  collection: Collection;
  categories: Category[];
  collections: Collection[];
  onOpen: (id: string) => void;
  onChanged?: () => void; // called after edit save
  onDeleted?: (id: string) => void;
  fallbackImage?: string;
}

export function CollectionCard({ collection, categories, collections, onOpen, onChanged, onDeleted, fallbackImage }: CollectionCardProps) {
  const editDialog = useDialog(false);
  const deleteDialog = useDialog(false);
  const [deletePhysicalFiles, setDeletePhysicalFiles] = useState(false);

  /* Restore Logic Variables */
  if (fallbackImage) console.log(`[CardRender] '${collection.name}' received fallback:`, fallbackImage);

  const coverSrc = collection.coverImage
    ? `${collection.coverImage}?t=${new Date(collection.lastModified || '').getTime()}` // Cache busting
    : (collection.images && collection.images.length > 0)
      ? collection.images[0]
      : fallbackImage || null;

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
  const modelCount = collection?._count?.models ?? (collection?.modelIds ? collection.modelIds.length : 0);

  const collectionId = collection?.id;

  return (
    <Card
      className="flex flex-col cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1"
      onClick={() => {
        if (collectionId) onOpen(collectionId);
      }}
    >
      <CardHeader className="p-0">
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
          <div className="absolute top-3 left-3">
            <Badge variant="secondary">Collection</Badge>
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => e.stopPropagation()}
                  title="Collection actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={editDialog.open}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setDeletePhysicalFiles(false); deleteDialog.open(); }} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        <h3 className="mb-1 font-medium line-clamp-2">{collection?.name || 'Untitled collection'}</h3>
        {collection?.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{collection.description}</p>
        )}
        <div className="text-muted-foreground space-y-1 mt-2">
          {/* Metadata Rows Logic - Simplified for brevity in replace tool, but keeping structure */}
          {(() => {
            const effectiveCfg = ConfigManager.loadConfig();
            const primary = effectiveCfg?.settings?.modelCardPrimary || 'printTime';
            const secondary = effectiveCfg?.settings?.modelCardSecondary || 'filamentUsed';
            const fieldValue = (key: string): string => {
              switch (key) {
                case 'category': return collection?.category || '';
                default: return '';
              }
            };
            const labelForKey = (key: string) => getLabel(key) + ':';
            const rows: Array<{ label: string; value: string }> = [];
            if (primary && primary !== 'none') { const v = fieldValue(primary); if (v) rows.push({ label: labelForKey(primary), value: v }); }
            if (secondary && secondary !== 'none' && secondary !== primary) { const v = fieldValue(secondary); if (v) rows.push({ label: labelForKey(secondary), value: v }); }
            return rows.map((r, i) => (
              <div className="flex justify-between" key={i}><span>{r.label}</span><span>{r.value}</span></div>
            ));
          })()}
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 mt-auto">
        <Button variant="outline" size="sm" className="w-full justify-between">
          {`View ${modelCount} model${modelCount !== 1 ? 's' : ''}`}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardFooter>

      <CollectionEditDrawer
        open={editDialog.isOpen}
        onOpenChange={editDialog.setIsOpen}
        collection={collection ?? null}
        collections={collections}
        categories={categories}
        onSaved={handleSaved}
      />

      <ConfirmDialog
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
      </ConfirmDialog>
    </Card>
  );
}
