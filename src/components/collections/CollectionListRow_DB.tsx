import { CollectionEditorDialog_DB } from "@/components/collections/CollectionEditorDialog_DB";
import { ImageWithFallback_DB } from "@/components/common/ImageWithFallback_DB";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Category } from "@/types/category";
import type { Collection } from "@/types/collection_db";
import { Folder, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CollectionListRowProps {
  collection: Collection;
  categories: Category[];
  collections: Collection[];
  onOpen: (id: string) => void;
  onChanged?: () => void;
  onDeleted?: (id: string) => void;
  // Optional models prop for dialog
  models?: any[];
}

export function CollectionListRow_DB({ collection, categories, collections, onOpen, onChanged, onDeleted, models = [] }: CollectionListRowProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePhysicalFiles, setDeletePhysicalFiles] = useState(false);

  const collectionId = collection?.id;
  const modelCount = Array.isArray(collection?.modelIds) ? collection.modelIds.length : 0;

  const handleOpen = () => {
    if (collectionId) {
      onOpen(collectionId);
    }
  };

  const handleDelete = async () => {
    if (!collectionId) return;
    try {
      const url = `/api/collections/${encodeURIComponent(collectionId)}${deletePhysicalFiles ? '?deleteFiles=true' : ''}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Collection deleted');
      onDeleted?.(collectionId);
      setIsDeleteOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete collection');
    }
  };

  return (
    <>
      <div
        className="group relative flex items-center p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer mb-2"
        onClick={handleOpen}
      >
        <div className="flex-shrink-0 mr-4">
          {collection.coverImage || (collection.images && collection.images.length > 0) ? (
            <div className="h-12 w-12 rounded overflow-hidden bg-muted">
              <ImageWithFallback_DB
                src={collection.coverImage || collection.images![0]}
                alt={collection.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="h-12 w-12 rounded bg-primary/10 flex items-center justify-center text-primary">
              <Folder className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold group-hover:text-primary transition-colors truncate text-lg">
                {collection?.name || "Untitled collection"}
              </h3>
              {collection?.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {collection.description}
                </p>
              )}

            </div>

            <div className="flex flex-col items-end gap-2">
              <Badge variant="secondary" className="whitespace-nowrap">
                {modelCount} item{modelCount !== 1 ? "s" : ""}
              </Badge>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setIsDeleteOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            {collection.category && (
              <Badge variant="outline" className="text-xs">{collection.category}</Badge>
            )}
            {collection.tags && collection.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs bg-muted text-muted-foreground">{tag}</Badge>
            ))}
          </div>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <CollectionEditorDialog_DB
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          collection={collection}
          collections={collections}
          models={models}
          categories={categories}
          onSave={async (_updated) => {
            onChanged?.();
            // setIsEditOpen(false); // dialog handles this
          }}
          onDelete={async (_id) => {
            setIsDeleteOpen(true);
          }}
        />
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{collection?.name}".
              <div className="mt-4 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="del-phys"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={deletePhysicalFiles}
                  onChange={(e) => setDeletePhysicalFiles(e.target.checked)}
                />
                <label htmlFor="del-phys" className="text-sm font-medium text-destructive">
                  Also delete folder from disk?
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
