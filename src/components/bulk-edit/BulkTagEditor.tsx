import TagsInput from '@/components/TagsInput';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useBulkEditForm } from '@/hooks/bulk/useBulkEditForm';
import { X } from 'lucide-react';

interface BulkTagEditorProps {
    form: ReturnType<typeof useBulkEditForm>;
}

export function BulkTagEditor({ form }: BulkTagEditorProps) {
    const { editState, allTags, toggleTagRemoval, setTagsAdd } = form;

    return (
        <div className="space-y-4">
            {/* Add New Tags */}
            <div className="space-y-2">
                <Label className="text-sm font-medium">Add Tags</Label>
                <TagsInput
                    value={editState.tags?.add || []}
                    onChange={setTagsAdd}
                    placeholder="Add a tag..."
                    className="bg-background"
                />
            </div>

            {/* Remove Existing Tags */}
            {allTags.length > 0 && (
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Remove Existing Tags</Label>
                    <p className="text-xs text-muted-foreground">
                        Click on tags to toggle removal across all selected models
                    </p>
                    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/20">
                        {allTags.map((tag) => {
                            const isRemoving = editState.tags?.remove?.includes(tag);
                            return (
                                <Badge
                                    key={tag}
                                    variant={isRemoving ? "destructive" : "secondary"}
                                    className="text-sm cursor-pointer transition-colors hover:opacity-80"
                                    onClick={() => toggleTagRemoval(tag)}
                                >
                                    {tag}
                                    {isRemoving && <X className="h-3 w-3 ml-1" />}
                                </Badge>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
