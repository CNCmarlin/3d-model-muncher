import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react"; 
import TagsInput from "./TagsInput";

interface TagsSectionProps {
  isEditing: boolean;
  editedModel: any;
  setEditedModel: (model: any) => void;
  currentModel: any;
  getSuggestedTags: () => string[];
  handleSuggestedTagClick: (tag: string) => void;
}

export const TagsSection = ({
  isEditing,
  editedModel,
  setEditedModel,
  currentModel,
  getSuggestedTags,
  handleSuggestedTagClick
}: TagsSectionProps) => {
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
    </div>
  );
};