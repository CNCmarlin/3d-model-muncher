import TagsInput from "@/components/common/TagsInput_DB";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useModelMutations_DB } from "@/hooks/useModelMutations_DB";
import { Tag } from "lucide-react";
import { useState } from "react";

interface TagsSectionProps {
  isEditing: boolean;
  editedModel: any;
  setEditedModel: (model: any) => void;
  currentModel: any;
  getSuggestedTags: () => string[];
  handleSuggestedTagClick: (tag: string) => void;
}

export const TagsSection_DB = ({
  isEditing,
  editedModel,
  setEditedModel,
  currentModel,
  getSuggestedTags,
  handleSuggestedTagClick
}: TagsSectionProps) => {
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const { removeTag } = useModelMutations_DB();

  return (
    <div className="space-y-4">
      {isEditing ? (
        /* ==================== EDIT MODE ==================== */
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Tags</Label>
          </div>

          <TagsInput
            value={editedModel?.tags || []}
            onChange={(next: string[]) => {
              if (!editedModel) return;
              setEditedModel({ ...editedModel, tags: next });
            }}
            onRemoveRequest={(tag) => setTagToDelete(tag)}
          />

          {getSuggestedTags().length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Suggested for {currentModel.category}:</p>
              <div className="flex flex-wrap gap-2">
                {getSuggestedTags().map((tag: string) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => handleSuggestedTagClick(tag)}
                  >
                    + {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ==================== VIEW MODE ==================== */
        Array.isArray(currentModel.tags) && currentModel.tags.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Tags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentModel.tags.map((tag: string, index: number) => (
                <Badge
                  key={`${tag}-${index}`}
                  variant="secondary"
                  className="text-[10px] px-2 py-0 cursor-pointer hover:bg-secondary/80 active:scale-95 transition-all"
                  onClick={() => console.log(`Tag ${tag} clicked`)} // Add your filter logic here
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )
      )}
      {/* DB-First Tag Deletion Confirmation */}
      <AlertDialog open={!!tagToDelete} onOpenChange={(open) => !open && setTagToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove tag?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently remove the tag "{tagToDelete}" from this model? This will be saved to the database immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!tagToDelete) return;
                try {
                  // Only hit the DB if the tag actually exists on the backend currentModel
                  // Otherwise, it was just un-saved text in the UI
                  const existsInDB = currentModel.tags?.includes(tagToDelete);
                  if (existsInDB) {
                    await removeTag.mutateAsync({ id: currentModel.id, tagName: tagToDelete });
                  }

                  // Update local edit state so it disappears
                  if (editedModel) {
                    setEditedModel({
                      ...editedModel,
                      tags: (editedModel.tags || []).filter((t: string) => t !== tagToDelete)
                    });
                  }
                } catch (error) {
                  console.error("Failed to remove tag", error);
                } finally {
                  setTagToDelete(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};