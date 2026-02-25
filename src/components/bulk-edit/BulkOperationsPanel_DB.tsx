import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { UseBulkEditFormResult } from "@/hooks/bulk/useBulkEditForm_db";
import { Category } from "@/types/category";
import { Collection } from "@/types/collection";
import { Model } from "@/types/model";
import { Clock, DollarSign, Eye, FileCog, FileText, Globe, Layers, Library, Plus, RefreshCw, StickyNote, Tag, Users, Weight } from "lucide-react";
import { BufferedInput_DB, BufferedSelect_DB, BufferedSwitch_DB, BufferedTextarea_DB } from "./BufferedFields_DB";
import { BulkEditSection_DB } from "./BulkEditSection_DB";
import { BulkTagEditor_DB } from "./BulkTagEditor_DB";

// UI Components
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Constants
import { LICENSES } from '@/constants/licenses';

interface BulkOperationsPanelProps {
    form: UseBulkEditFormResult;
    models: Model[];
    categories: Category[];
    collectionsList: Collection[];
    pendingBulkCollectionId: string | null;
    isGeneratingImages: boolean;
    generateProgress: { current: number; total: number };
    modelsMissingImagesCount: number;
    onOpenCollectionCreator?: () => void;
}

export function BulkOperationsPanel_DB({
    form,
    // models,
    categories,
    collectionsList,
    pendingBulkCollectionId,
    // isGeneratingImages,
    // generateProgress,
    // modelsMissingImagesCount,
    onOpenCollectionCreator
}: BulkOperationsPanelProps) {
    const {
        editState, fieldSelection, handleFieldToggle, commonValues,
        setCategory, setLicense, setDesigner, setPrintStatus, setHidden,
        setNotes, setDescription, setSource, setPrice, setPrintTime, setFilament,
        setCollectionId, setCollectionAction, setPrintSettings, setPrintMaterial
    } = form;

    const pendingCollectionName = pendingBulkCollectionId ? (collectionsList.find(c => c.id === pendingBulkCollectionId)?.name || 'New Collection') : '';

    return (
        <ScrollArea className="h-full">
            <div className="p-4 space-y-6">

                {/* --- ORG SECTIONS --- */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Organization</h3>

                    <BulkEditSection_DB
                        id="collection"
                        label="Collection Assignment"
                        icon={<Library className="h-4 w-4" />}
                        checked={fieldSelection.collection}
                        onToggle={() => handleFieldToggle('collection')}
                    >
                        {pendingBulkCollectionId && (
                            <Alert className="border-green-500 bg-green-500/10 mb-2">
                                <AlertTitle>Action Pending</AlertTitle>
                                <AlertDescription className="text-xs">
                                    Queued for <strong>{pendingCollectionName}</strong>.
                                    Models will be {editState.collectionAction === 'remove' ? 'moved out' : 'moved to'} this collection.
                                </AlertDescription>
                            </Alert>
                        )}
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label>Target Collection</Label>
                                <div className="flex gap-2">
                                    <Select value={editState.collectionId || ''} onValueChange={setCollectionId}>
                                        <SelectTrigger className="flex-1"><SelectValue placeholder="Select collection" /></SelectTrigger>
                                        <SelectContent>
                                            {collectionsList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    {onOpenCollectionCreator && (
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={onOpenCollectionCreator}
                                            title="Create new collection"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Operation</Label>
                                <Select value={editState.collectionAction || 'none'} onValueChange={(v: any) => setCollectionAction(v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="add">Move to collection</SelectItem>
                                        {/* <SelectItem value="remove">Remove from collection</SelectItem> -- TODO: Verify if this is valid for single-parent */}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </BulkEditSection_DB>


                    <BulkEditSection_DB
                        id="category"
                        label="Category"
                        icon={<Layers className="h-4 w-4" />}
                        checked={fieldSelection.category}
                        onToggle={() => handleFieldToggle('category')}
                    >
                        <div className="space-y-2">
                            <BufferedSelect_DB
                                value={editState.category || ''}
                                onApply={(val) => {
                                    const found = categories.find(c => c.label === val || c.id === val);
                                    setCategory(found ? found.label : val);
                                }}
                                options={(categories || []).map(c => ({ value: c.label, label: c.label }))}
                                placeholder="Select category"
                                description={commonValues.category ? `Current: ${commonValues.category}` : undefined}
                            />
                        </div>
                    </BulkEditSection_DB>

                    <BulkEditSection_DB
                        id="tags"
                        label="Tags"
                        icon={<Tag className="h-4 w-4" />}
                        checked={fieldSelection.tags}
                        onToggle={() => handleFieldToggle('tags')}
                    >
                        <BulkTagEditor_DB form={form} />
                    </BulkEditSection_DB>

                    <BulkEditSection_DB
                        id="designer"
                        label="Designer"
                        icon={<Users className="h-4 w-4" />}
                        checked={fieldSelection.designer}
                        onToggle={() => handleFieldToggle('designer')}
                    >
                        <BufferedInput_DB
                            value={editState.designer || ''}
                            onApply={(v) => setDesigner(String(v))}
                            placeholder="Designer name"
                            description={commonValues.designer ? `Current: ${commonValues.designer}` : undefined}
                        />
                    </BulkEditSection_DB>

                    <BulkEditSection_DB
                        id="license"
                        label="License"
                        icon={<FileText className="h-4 w-4" />}
                        checked={fieldSelection.license}
                        onToggle={() => handleFieldToggle('license')}
                    >
                        <BufferedSelect_DB
                            value={editState.license as string || ''}
                            onApply={setLicense}
                            options={LICENSES.map(l => ({ value: l, label: l }))}
                            placeholder="Select license"
                            description={commonValues.license ? `Current: ${commonValues.license}` : undefined}
                        />
                    </BulkEditSection_DB>

                    <BulkEditSection_DB
                        id="source"
                        label="Source URL"
                        icon={<Globe className="h-4 w-4" />}
                        checked={fieldSelection.source}
                        onToggle={() => handleFieldToggle('source')}
                    >
                        <BufferedInput_DB
                            value={editState.source || ''}
                            onApply={(v) => setSource(String(v))}
                            placeholder="https://..."
                        />
                    </BulkEditSection_DB>

                    <BulkEditSection_DB
                        id="description"
                        label="Description"
                        icon={<FileText className="h-4 w-4" />}
                        checked={fieldSelection.description}
                        onToggle={() => handleFieldToggle('description')}
                    >
                        <BufferedTextarea_DB
                            value={editState.description || ''}
                            onApply={setDescription}
                            placeholder="Detailed description..."
                            rows={4}
                        />
                    </BulkEditSection_DB>

                    <BulkEditSection_DB
                        id="notes"
                        label="Notes"
                        icon={<StickyNote className="h-4 w-4" />}
                        checked={fieldSelection.notes}
                        onToggle={() => handleFieldToggle('notes')}
                    >
                        <BufferedTextarea_DB
                            value={editState.notes || ''}
                            onApply={setNotes}
                            placeholder="Notes..."
                            rows={3}
                        />
                    </BulkEditSection_DB>
                </div>

                <Separator />

                {/* --- PRINT STATS --- */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Print Stats</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <BulkEditSection_DB
                            id="printTime"
                            label="Print Time"
                            icon={<Clock className="h-4 w-4" />}
                            checked={fieldSelection.printTime}
                            onToggle={() => handleFieldToggle('printTime')}
                        >
                            <BufferedInput_DB
                                value={editState.printTime || ''}
                                onApply={(v) => setPrintTime(String(v))}
                                placeholder="e.g. 1h 30m"
                                description={commonValues.printTime ? `Current: ${commonValues.printTime}` : undefined}
                            />
                        </BulkEditSection_DB>

                        <BulkEditSection_DB
                            id="filamentUsed"
                            label="Filament / Material"
                            icon={<Weight className="h-4 w-4" />}
                            checked={fieldSelection.filamentUsed}
                            onToggle={() => handleFieldToggle('filamentUsed')}
                        >
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium mb-1 block">Weight (g)</label>
                                    <BufferedInput_DB
                                        value={editState.filamentUsed || ''}
                                        onApply={(v) => setFilament(String(v))}
                                        placeholder="e.g. 150"
                                        type="number"
                                    />
                                </div>
                                <div className="pt-2 border-t border-border/50">
                                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Material Type</label>
                                    <BufferedInput_DB
                                        value={editState.printSettings?.material || ''}
                                        onApply={(v) => setPrintMaterial(String(v))}
                                        placeholder="e.g. PLA"
                                    />
                                </div>
                            </div>
                        </BulkEditSection_DB>
                    </div>

                    <BulkEditSection_DB
                        id="price"
                        label="Price"
                        icon={<DollarSign className="h-4 w-4" />}
                        checked={fieldSelection.price}
                        onToggle={() => handleFieldToggle('price')}
                    >
                        <BufferedInput_DB
                            value={editState.price || ''}
                            onApply={(v) => setPrice(String(v))}
                            placeholder="0.00"
                            type="number"
                            className="pl-9"
                            description={commonValues.price ? `Current: ${commonValues.price}` : undefined}
                        />
                    </BulkEditSection_DB>

                    <BulkEditSection_DB
                        id="printSettings"
                        label="Print Settings (STL)"
                        icon={<FileCog className="h-4 w-4" />}
                        checked={fieldSelection.printSettings}
                        disabled={!form.hasAnyStlSelected}
                        onToggle={() => handleFieldToggle('printSettings')}
                    >
                        {!form.hasAnyStlSelected ? <p className="text-xs text-muted-foreground">No STL models selected.</p> : (
                            <div className="grid grid-cols-2 gap-3">
                                {['Layer Height', 'Infill', 'Nozzle', 'Printer'].map(label => {
                                    const key = (label.toLowerCase().replace(' ', '') === 'layerheight' ? 'layerHeight' : label.toLowerCase()) as 'layerHeight' | 'infill' | 'nozzle' | 'printer';
                                    return (
                                        <div key={key} className="space-y-1">
                                            <Label className="text-xs">{label}</Label>
                                            <BufferedInput_DB
                                                value={editState.printSettings?.[key] || ''}
                                                onApply={(v) => setPrintSettings(key, String(v))}
                                                placeholder="..."
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </BulkEditSection_DB>
                </div>

                <Separator />

                {/* --- ADVANCED / ACTIONS --- */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Advanced & Actions</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <BulkEditSection_DB
                            id="isPrinted"
                            label="Print Status"
                            icon={<RefreshCw className="h-4 w-4" />}
                            checked={fieldSelection.isPrinted}
                            onToggle={() => handleFieldToggle('isPrinted')}
                        >
                            <BufferedSwitch_DB
                                value={editState.isPrinted}
                                onApply={(v) => setPrintStatus(!!v)}
                                label="Printed"
                            />
                        </BulkEditSection_DB>

                        <BulkEditSection_DB
                            id="hidden"
                            label="Visibility"
                            icon={<Eye className="h-4 w-4" />}
                            checked={fieldSelection.hidden}
                            onToggle={() => handleFieldToggle('hidden')}
                        >
                            <BufferedSwitch_DB
                                value={editState.hidden}
                                onApply={(v) => setHidden(!!v)}
                                label="Hidden"
                            />
                        </BulkEditSection_DB>
                    </div>


                    {/* [FUTURE] RECOVER IN DATABASE MODE
                    <BulkEditSection
                        id="relatedFiles"
                        label="Related Files"
                        icon={<FileText className="h-4 w-4" />}
                        checked={fieldSelection.relatedFiles}
                        onToggle={() => handleFieldToggle('relatedFiles')}
                    >
                        <BulkRelatedFilesEditor form={form} models={models} />
                    </BulkEditSection>
                    */}


                    {/* [FUTURE] RECOVER IN DATABASE MODE
                    <BulkEditSection
                        id="generateImages"
                        label="Generate Thumbnails"
                        icon={<ImagePlus className="h-4 w-4" />}
                        checked={fieldSelection.generateImages}
                        onToggle={() => handleFieldToggle('generateImages')}
                        disabled={isGeneratingImages}
                    >
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">Generate thumbnails for models that lack them.</p>
                            <div className="flex items-center gap-2">
                                <span className="text-xs bg-muted px-2 py-1 rounded">{modelsMissingImagesCount} models need images</span>
                            </div>
                            {isGeneratingImages && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Generating {generateProgress.current}/{generateProgress.total}</AlertTitle>
                                </Alert>
                            )}
                        </div>
                    </BulkEditSection>
                    */}
                </div>

            </div>
        </ScrollArea>
    );
}
