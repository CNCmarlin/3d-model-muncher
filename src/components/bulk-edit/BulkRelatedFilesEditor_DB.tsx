import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useBulkEditForm_db } from '@/hooks/bulk/useBulkEditForm_db';
import { Model } from '@/types/model_db';

interface BulkRelatedFilesEditorProps {
    form: ReturnType<typeof useBulkEditForm_db>;
    models: Model[];
}

export function BulkRelatedFilesEditor_DB({ form, models }: BulkRelatedFilesEditorProps) {
    const {
        editState,
        uniqueKeyForModel,
        toggleRelatedInclude,
        setRelatedClearAll,
        setRelatedPrimary,
        setRelatedHideOthers
    } = form;

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select which of the selected models should be included as related files for each model, choose the primary, and optionally hide the others.</p>

            <div className="space-y-2">
                <Label className="text-sm font-medium">Included Models</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-md p-3 bg-muted/10">
                    {models.map((m) => {
                        const key = uniqueKeyForModel(m);
                        const included = (editState.relatedIncluded || []).includes(key);
                        return (
                            <div key={key} className="flex items-center gap-2">
                                <Checkbox
                                    checked={included}
                                    onCheckedChange={() => toggleRelatedInclude(key)}
                                    id={`include-${key}`}
                                />
                                <Label htmlFor={`include-${key}`} className="text-sm cursor-pointer truncate">{m.name}</Label>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="pt-2">
                <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setRelatedClearAll(true)}
                    className="w-full sm:w-auto"
                >
                    Remove related files from selected models
                </Button>
                {editState.relatedClearAll && (
                    <p className="text-sm text-destructive mt-2 font-medium">All selected models will have their related files cleared when you save.</p>
                )}
            </div>

            <div className="space-y-2 pt-2">
                <Label className="text-sm font-medium">Primary File</Label>
                <p className="text-xs text-muted-foreground">Choose which included model should be considered the primary.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                    {(editState.relatedIncluded || models.map(m => uniqueKeyForModel(m))).map((id: string) => {
                        const m = models.find(x => uniqueKeyForModel(x) === id);
                        if (!m) return null;
                        const isPrimary = editState.relatedPrimary === id;
                        return (
                            <Button
                                key={id}
                                size="sm"
                                variant={isPrimary ? 'secondary' : 'outline'}
                                onClick={() => setRelatedPrimary(id)}
                                className={isPrimary ? 'border-primary' : ''}
                            >
                                {m.name}
                            </Button>
                        );
                    })}
                </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
                <Checkbox // Typo fix: Switch -> Checkbox if prefer, or import Switch
                    // Using standard Switch for boolean toggle
                    // But here reusing Checkbox for consistency with form
                    checked={editState.relatedHideOthers || false}
                    onCheckedChange={(v) => setRelatedHideOthers(!!v)}
                    id="related-hide-others"
                    className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor="related-hide-others" className="flex items-center gap-2 cursor-pointer">
                    Hide all other models (only primary remains visible)
                </Label>
            </div>
        </div>
    );
}
