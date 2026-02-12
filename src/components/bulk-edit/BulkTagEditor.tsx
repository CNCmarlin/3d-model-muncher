import TagsInput from '@/components/TagsInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useBulkEditForm } from '@/hooks/bulk/useBulkEditForm';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BulkTagEditorProps {
    form: ReturnType<typeof useBulkEditForm>;
}

export function BulkTagEditor({ form }: BulkTagEditorProps) {
    const { editState, allTags, setTags } = form;

    const [localAdd, setLocalAdd] = useState<string[]>([]);
    const [localRemove, setLocalRemove] = useState<string[]>([]);

    // Sync with external state (e.g. selection change)
    useEffect(() => {
        setLocalAdd(editState.tags?.add || []);
        setLocalRemove(editState.tags?.remove || []);
    }, [editState.tags]);

    // Check for dirty state
    // We compare arrays (simple shallow comparison for strings)
    const arraysEqual = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, index) => val === sortedB[index]);
    };

    const isDirty = !arraysEqual(localAdd, editState.tags?.add || []) ||
        !arraysEqual(localRemove, editState.tags?.remove || []);

    const handleApply = () => {
        if (setTags) {
            setTags({ add: localAdd, remove: localRemove });
        }
    };

    const handleToggleLocalRemoval = (tag: string) => {
        setLocalRemove(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Manage Tags</Label>
                <Button
                    size="sm"
                    variant={isDirty ? "default" : "ghost"}
                    className={`h-7 px-2 ${isDirty ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-muted-foreground opacity-50'}`}
                    onClick={handleApply}
                    disabled={!isDirty}
                    title="Apply tag changes"
                >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Apply
                </Button>
            </div>

            {/* Add New Tags */}
            <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Add Tags</Label>
                <TagsInput
                    value={localAdd}
                    onChange={setLocalAdd}
                    placeholder="Type and press enter..."
                    className="bg-background"
                />
            </div>

            {/* Remove Existing Tags */}
            {allTags.length > 0 && (
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Remove Existing Tags</Label>
                    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/20">
                        {allTags.map((tag) => {
                            const isRemoving = localRemove.includes(tag);
                            return (
                                <Badge
                                    key={tag}
                                    variant={isRemoving ? "destructive" : "secondary"}
                                    className="text-xs cursor-pointer transition-colors hover:opacity-80 select-none"
                                    onClick={() => handleToggleLocalRemoval(tag)}
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
