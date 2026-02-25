import { BulkEditHelpDialog_DB } from "@/components/bulk-edit/BulkEditHelpDialog_DB";
import { BulkOperationsPanel_DB } from "@/components/bulk-edit/BulkOperationsPanel_DB";
import { BulkTargetGrid_DB } from "@/components/bulk-edit/BulkTargetGrid_DB";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { BulkEditState_DB, useBulkEditForm_db } from "@/hooks/bulk/useBulkEditForm_db";
import { useBulkOperations_DB } from "@/hooks/bulk/useBulkOperations_DB";
import { useCreateCollection_db } from "@/hooks/mutations/useCreateCollection_db";
import { useMediaQuery_db } from "@/hooks/useMediaQuery_db";
import { Category } from "@/types/category";
import { Collection } from "@/types/collection_db";
import { Model } from "@/types/model_db";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface BulkEditViewProps {
    models: Model[];
    onClose: () => void;
    // We match the signature from App.tsx (useModelActions.handleBulkModelsUpdate)
    // even though useBulkOperations might not use it directly for the mutation.
    // onRefresh removed
    // onBulkSaved: (updatedModels: Model[]) => void; // Optional if we want to bubble up
    onRemoveFromSelection: (id: string) => void;
    onClearSelections: () => void;
    categories: Category[];
    collectionsList: Collection[];
    pendingBulkCollectionId: string | null;
}

export function BulkEditView_DB({
    models,
    onClose,
    onRemoveFromSelection,
    onClearSelections,
    categories,
    collectionsList,
    pendingBulkCollectionId
}: BulkEditViewProps) {
    const isDesktop = useMediaQuery_db("(min-width: 1024px)");

    // 1. Selection State (Subset Granularity)
    const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>(models.map(m => m.id));

    // Sync if models prop changes significantly
    useEffect(() => {
        const currentIds = new Set(models.map(m => m.id));
        setSelectedTargetIds(prev => {
            const kept = prev.filter(id => currentIds.has(id));
            // RECOVERY: If selection becomes empty (e.g. initial empty load), but models are present, select all.
            // This prevents the "Locked Empty" bug.
            if (kept.length === 0 && models.length > 0) {
                return models.map(m => m.id);
            }
            return kept;
        });
    }, [models]);

    // 2. Compute Target Subset
    const targetModels = useMemo(() => {
        const tm = models.filter(m => selectedTargetIds.includes(m.id));
        console.log('[BulkEditView] targetModels computed:', tm.length, 'from', models.length, 'models');
        return tm;
    }, [models, selectedTargetIds]);

    // 3. Form Hook
    const form = useBulkEditForm_db({
        models: targetModels,
        selectedTargetIds, // Pass the tracked selection IDs
        isOpen: true,
        pendingBulkCollectionId
    });

    // 4. Operations Hook (Handles Save & Generate)
    const {
        isSaving,
        isGeneratingImages,
        generateProgress,
        handleSave,

    } = useBulkOperations_DB({
        models: models, // Pass ALL models so we can save edits for items even if they are currently deselected
        form,
        onBulkSaved: (_) => {
            onClearSelections?.();
        },
        onClose,
        pendingBulkCollectionId,
        onClearSelections,
        // openMoveConfirmation: ... (Needs to be passed if we want move confirmation)
    });

    // Compute isDirty based on fieldSelection (same as before)
    const isDirty = Object.values(form.fieldSelection).some(Boolean);

    // 5. Handlers
    const handleToggleSelect = (id: string) => {
        setSelectedTargetIds(prev =>
            prev.includes(id)
                ? prev.filter(x => x !== id)
                : [...prev, id]
        );
    };

    const handleSelectAll = () => setSelectedTargetIds(models.map(m => m.id));
    const handleSelectNone = () => setSelectedTargetIds([]);

    const GlobalEditsBar_DB = () => {
        const changes: React.ReactNode[] = [];
        const short = !isDesktop;

        // Helper to check if a valid edit exists for all models
        const allHave = (predicate: (edit: any) => boolean) => {
            if (models.length === 0) return false;
            return models.every(m => {
                const staged = form.stagedEdits[m.id];
                return staged && predicate(staged);
            });
        };

        // Helper to get the common value (displaying it) - assumes allHave checked true
        const getCommon = (accessor: (edit: any) => any) => {
            if (models.length === 0) return null;
            return accessor(form.stagedEdits[models[0].id]);
        };

        // Helper to remove an edit globally
        // Helper to remove an edit globally (now requests confirmation)
        const removeGlobal = (field: keyof BulkEditState_DB, value?: any, label?: string) => {
            if (models.length === 0) return;
            handleGlobalRemovalRequest(field, value, label);
        };

        const badgeClass = "text-[10px] px-2 py-0.5 whitespace-nowrap bg-background border-primary/20 text-primary font-bold shadow-sm animate-in fade-in zoom-in-95 duration-200 cursor-pointer hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors";

        // Category
        if (allHave(e => !!e.category)) {
            const val = getCommon(e => e.category);
            if (models.every(m => form.stagedEdits[m.id]?.category === val)) {
                changes.push(
                    <Badge key="cat" variant="secondary" className={badgeClass} onClick={() => removeGlobal('category', undefined, 'Category')} title="Click to remove global edit">
                        {short ? `Cat: ${val}` : `Category: ${val}`}
                    </Badge>
                );
            }
        }

        // License
        if (allHave(e => !!e.license)) {
            const val = getCommon(e => e.license);
            if (models.every(m => form.stagedEdits[m.id]?.license === val)) {
                changes.push(
                    <Badge key="lic" variant="secondary" className={badgeClass} onClick={() => removeGlobal('license', undefined, 'License')} title="Click to remove global edit">
                        {short ? `Lic: ${val}` : `License: ${val}`}
                    </Badge>
                );
            }
        }

        // Designer
        if (allHave(e => !!e.designer)) {
            const val = getCommon(e => e.designer);
            if (models.every(m => form.stagedEdits[m.id]?.designer === val)) {
                changes.push(
                    <Badge key="des" variant="secondary" className={badgeClass} onClick={() => removeGlobal('designer', undefined, 'Designer')} title="Click to remove global edit">
                        {short ? `Des: ${val}` : `Designer: ${val}`}
                    </Badge>
                );
            }
        }

        // Printed
        if (allHave(e => e.isPrinted !== undefined)) {
            const val = getCommon(e => e.isPrinted);
            if (models.every(m => form.stagedEdits[m.id]?.isPrinted === val)) {
                changes.push(
                    <Badge key="printed" variant="secondary" className={badgeClass} onClick={() => removeGlobal('isPrinted', undefined, 'Print Status')} title="Click to remove global edit">
                        {val ? "Printed" : "Unprinted"}
                    </Badge>
                );
            }
        }

        // Hidden
        if (allHave(e => e.hidden !== undefined)) {
            const val = getCommon(e => e.hidden);
            if (models.every(m => form.stagedEdits[m.id]?.hidden === val)) {
                changes.push(
                    <Badge key="hidden" variant="secondary" className={badgeClass} onClick={() => removeGlobal('hidden', undefined, 'Visibility')} title="Click to remove global edit">
                        {val ? "Hidden" : "Visible"}
                    </Badge>
                );
            }
        }

        // Collection
        if (allHave(e => !!e.collectionId)) {
            const val = getCommon(e => e.collectionId);
            const action = getCommon(e => e.collectionAction);
            if (models.every(m => form.stagedEdits[m.id]?.collectionId === val)) {
                changes.push(
                    <Badge key="col" variant="secondary" className={badgeClass} onClick={() => removeGlobal('collectionId')} title="Click to remove global edit">
                        {short ? "Col: Set" : `${action === 'add' ? 'Add to' : 'Set'} Collection`}
                    </Badge>
                );
            }
        }

        // Tags (Common Additions)
        const firstAdds = form.stagedEdits[models[0]?.id]?.tags?.add || [];
        const commonAdds = firstAdds.filter(tag =>
            models.every(m => form.stagedEdits[m.id]?.tags?.add?.includes(tag))
        );
        if (commonAdds.length > 0) {
            if (short) {
                // For simplified view, we can't accept specific tag clicks easily unless we expand?
                // Or removing the "Batch" removes ALL tag adds? Riskier.
                // Let's just allow it for now or tooltip that they need desktop?
                // Actually, let's just make it remove ALL common adds if clicked in short mode?
                // Or just show "+2 Tags" and not interactive?
                // User requirement: "Global Removal".
                // In short mode, specific tags aren't listed locally either.
                // Let's make the summary badge remove ALL common tags? No, too destructive.
                // Let's keep it non-interactive in Short mode for tags summary, or expand it?
                // Wait, logic says "short mode needs to be able to deselect on mobile".
                // Maybe we just loop them even in short mode if space permits?
                // Let's stick to non-interactive summary for short mode for now to avoid accidental mass deletion.
                changes.push(
                    <Badge key="tags-add-count" variant="secondary" className="text-[10px] px-2 py-0.5 whitespace-nowrap bg-background border-primary/20 text-primary font-bold shadow-sm">
                        {`+${commonAdds.length} Tags`}
                    </Badge>
                );
            } else {
                commonAdds.forEach(tag => changes.push(
                    <Badge key={`tag-add-${tag}`} variant="secondary" className={badgeClass} onClick={() => removeGlobal('tags', { tag, action: 'add' })} title="Click to remove global tag add">
                        {`Tag: ${tag}`}
                    </Badge>
                ));
            }
        }

        // Tags (Common Removals)
        const firstRemoves = form.stagedEdits[models[0]?.id]?.tags?.remove || [];
        const commonRemoves = firstRemoves.filter(tag =>
            models.every(m => form.stagedEdits[m.id]?.tags?.remove?.includes(tag))
        );
        if (commonRemoves.length > 0) {
            if (short) {
                changes.push(
                    <Badge key="tags-rem-count" variant="secondary" className="text-[10px] px-2 py-0.5 whitespace-nowrap bg-background border-primary/20 text-primary font-bold shadow-sm" >
                        {`-${commonRemoves.length} Tags`}
                    </Badge>
                );
            } else {
                commonRemoves.forEach(tag => changes.push(
                    <Badge key={`tag-rem-${tag}`} variant="secondary" className={badgeClass} onClick={() => removeGlobal('tags', { tag, action: 'remove' })} title="Click to undo global tag removal">
                        {`- Tag: ${tag}`}
                    </Badge>
                ));
            }
        }

        // Notes
        if (allHave(e => e.notes !== undefined)) changes.push(<Badge key="notes" variant="secondary" className={badgeClass} onClick={() => removeGlobal('notes', undefined, 'Notes')}>{short ? "Notes" : "Notes Updated"}</Badge>);
        if (allHave(e => e.source !== undefined)) changes.push(<Badge key="src" variant="secondary" className={badgeClass} onClick={() => removeGlobal('source', undefined, 'Source')}>{short ? "Src" : "Source Updated"}</Badge>);
        if (allHave(e => e.price !== undefined)) changes.push(<Badge key="price" variant="secondary" className={badgeClass} onClick={() => removeGlobal('price', undefined, 'Price')}>{short ? `Price` : `Price: $${getCommon(e => e.price)}`}</Badge>);
        if (allHave(e => e.printTime !== undefined)) changes.push(<Badge key="time" variant="secondary" className={badgeClass} onClick={() => removeGlobal('printTime', undefined, 'Print Time')}>{short ? "Time" : `Time: ${getCommon(e => e.printTime)}`}</Badge>);
        if (allHave(e => e.filamentUsed !== undefined)) changes.push(<Badge key="fil" variant="secondary" className={badgeClass} onClick={() => removeGlobal('filamentUsed', undefined, 'Filament')}>{short ? "Fil" : `Filament: ${getCommon(e => e.filamentUsed)}`}</Badge>);
        if (allHave(e => !!e.printSettings)) changes.push(<Badge key="sets" variant="secondary" className={badgeClass} onClick={() => removeGlobal('printSettings', undefined, 'Print Settings')}>{short ? "Sets" : "Print Settings"}</Badge>);

        const hasChanges = changes.length > 0;

        return (
            <div className="px-4 py-2 border-b bg-primary/5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 h-10">
                <span className="text-[10px] uppercase font-black tracking-widest text-primary/60 shrink-0">Global Edits:</span>
                <div className="flex items-center gap-2">
                    {hasChanges ? (
                        changes
                    ) : (
                        <span className="text-[9px] font-bold text-muted-foreground/30 uppercase italic">
                            No global changes
                        </span>
                    )}
                </div>
            </div>
        );
    };

    // 6. Confirmation State for Removals
    const [confirmRemoval, setConfirmRemoval] = useState<{
        type: 'global' | 'single';
        ids: string[];
        field: keyof BulkEditState_DB;
        value?: any;
        label?: string;
    } | null>(null);

    // Handler for Global Removal (triggered from GlobalEditsBar)
    const handleGlobalRemovalRequest = (field: keyof BulkEditState_DB, value?: any, label?: string) => {
        if (models.length === 0) return;
        setConfirmRemoval({
            type: 'global',
            ids: models.map(m => m.id),
            field,
            value,
            label: label || field
        });
    };

    // Handler for Single Removal (triggered from BulkTargetGrid)
    const handleSingleRemovalRequest = (id: string, field: string, value?: any) => {
        setConfirmRemoval({
            type: 'single',
            ids: [id],
            field: field as keyof BulkEditState_DB,
            value,
            label: field
        });
    };

    const executeRemoval = () => {
        if (!confirmRemoval) return;
        form.removeEdit(confirmRemoval.ids, confirmRemoval.field, confirmRemoval.value);
        setConfirmRemoval(null);
    };

    // 7. Collection Creator State
    const [isCreatorOpen, setIsCreatorOpen] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    const createCollectionMutation = useCreateCollection_db();

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        try {
            const newCol = await createCollectionMutation.mutateAsync({
                name: newCollectionName.trim()
            });

            // Auto-select the new collection
            form.setCollectionId(newCol.id);
            form.setCollectionAction('add');

            setIsCreatorOpen(false);
            setNewCollectionName("");
        } catch (error) {
            console.error("Failed to create collection", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background relative">
            {/* Collection Creator Dialog */}
            {isCreatorOpen && (
                <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-popover border text-popover-foreground shadow-lg rounded-lg max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-2">
                            <h3 className="font-semibold leading-none tracking-tight">Create New Collection</h3>
                            <p className="text-sm text-muted-foreground">Enter a name for the new collection.</p>
                        </div>
                        <div className="space-y-4">
                            <Input
                                value={newCollectionName}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCollectionName(e.target.value)}
                                placeholder="Collection Name"
                                autoFocus
                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                    if (e.key === 'Enter' && newCollectionName.trim()) {
                                        handleCreateCollection();
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setIsCreatorOpen(false)}>Cancel</Button>
                                <Button
                                    size="sm"
                                    disabled={!newCollectionName.trim() || createCollectionMutation.isPending}
                                    onClick={handleCreateCollection}
                                >
                                    {createCollectionMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin mr-2" /> : null}
                                    Create
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!!confirmRemoval && (
                <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-popover border text-popover-foreground shadow-lg rounded-lg max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-2">
                            <h3 className="font-semibold leading-none tracking-tight">
                                {confirmRemoval.type === 'global' ? 'Remove Global Edit?' : 'Remove Edit?'}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {confirmRemoval.type === 'global'
                                    ? `This will remove the "${confirmRemoval.label}" edit from ALL ${models.length} models.`
                                    : `This will remove the "${confirmRemoval.label}" edit from this model.`
                                }
                            </p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setConfirmRemoval(null)}>Cancel</Button>
                            <Button variant="destructive" size="sm" onClick={executeRemoval}>Remove</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className={`h-14 border-b flex items-center justify-between px-4 bg-card shadow-sm shrink-0 z-10 ${!isDesktop ? 'sticky top-0' : ''}`}>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />
                        {!isDesktop ? '' : 'Back'}
                    </Button>
                    <div className="h-6 w-px bg-border/50 mx-1" />
                    <div>
                        <h1 className="text-lg font-semibold">Bulk Edit</h1>
                        {isDesktop && (
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter mt-0.5">
                                Targeting <span className="font-mono text-primary">{selectedTargetIds.length}</span> / {models.length} items
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isDesktop && (
                        <>
                            {selectedTargetIds.length === models.length && models.length > 0 ? (
                                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-green-500/30 text-green-600 bg-green-500/5 px-2">
                                    Global Mode
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-amber-500/30 text-amber-600 bg-amber-500/5 px-2">
                                    Selective Mode
                                </Badge>
                            )}
                        </>
                    )}

                    <BulkEditHelpDialog_DB />

                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!isDirty || selectedTargetIds.length === 0 || isSaving || isGeneratingImages}
                        className={`${!isDesktop ? 'h-9 px-3' : 'px-4'} bg-primary hover:bg-primary/90 text-primary-foreground shadow-md font-bold uppercase text-[10px] md:text-[11px] tracking-wider`}
                    >
                        {isSaving ? <RefreshCw className="h-3.5 w-3.5 md:mr-2 animate-spin" /> : <Check className="h-3.5 w-3.5 md:mr-2" />}
                        <span className={!isDesktop ? 'hidden xs:inline' : 'inline'}>
                            {isSaving ? 'Saving...' : 'Apply'}
                        </span>
                    </Button>
                </div>
            </div>



            {/* Floating Mobile Bottom Action (Simplified) */}
            {!isDesktop && isDirty && selectedTargetIds.length > 0 && (
                <div className="fixed bottom-6 left-0 right-0 z-[100] flex justify-center px-4 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none">
                    <Button
                        size="lg"
                        onClick={handleSave}
                        disabled={isSaving || isGeneratingImages}
                        className="w-1/2 min-w-[180px] h-12 bg-primary/95 hover:bg-primary text-primary-foreground shadow-xl rounded-full font-bold uppercase tracking-widest text-[12px] flex items-center justify-center gap-2 border border-background/20 pointer-events-auto backdrop-blur-sm"
                    >
                        {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />}
                        {isSaving ? 'Saving...' : 'Apply Changes'}
                    </Button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden">
                {isDesktop ? (
                    <ResizablePanelGroup direction="horizontal">
                        {/* Operations Panel (Left) */}
                        <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-muted/5 border-r">
                            <BulkOperationsPanel_DB
                                form={form}
                                models={targetModels as any}
                                categories={categories}
                                collectionsList={collectionsList as any}
                                pendingBulkCollectionId={pendingBulkCollectionId}
                                isGeneratingImages={isGeneratingImages}
                                generateProgress={generateProgress}
                                onOpenCollectionCreator={() => setIsCreatorOpen(true)}
                                modelsMissingImagesCount={targetModels.reduce((c, m) => c + ((m.thumbnail || (m.images && m.images.length)) ? 0 : 1), 0)}
                            />
                        </ResizablePanel>

                        <ResizableHandle withHandle />

                        {/* Grid Panel (Right) */}
                        <ResizablePanel defaultSize={75} className="bg-background">
                            <div className="flex flex-col h-full overflow-hidden">
                                <GlobalEditsBar_DB />
                                <div className="flex-1 overflow-hidden relative min-h-0">
                                    <BulkTargetGrid_DB
                                        models={models as any} // Show ALL models passed to the view, so user can select/deselect them
                                        selectedIds={selectedTargetIds}
                                        onToggleSelect={handleToggleSelect}
                                        onRemoveModel={onRemoveFromSelection}
                                        onSelectAll={handleSelectAll}
                                        onSelectNone={handleSelectNone}
                                        editState={form.editState}
                                        stagedEdits={form.stagedEdits}
                                        fieldSelection={form.fieldSelection}
                                        onRemoveEdit={handleSingleRemovalRequest}
                                    />
                                </div>
                            </div>
                        </ResizablePanel>
                    </ResizablePanelGroup>
                ) : (
                    // Mobile / Medium Layout: Stacked
                    <div className="flex flex-col h-full">
                        {/* Top: Model Strip (Auto Compact) */}
                        <div className="shrink-0 bg-muted/10 border-b">
                            <BulkTargetGrid_DB
                                models={models as any}
                                selectedIds={selectedTargetIds}
                                onToggleSelect={handleToggleSelect}
                                onRemoveModel={onRemoveFromSelection}
                                onSelectAll={handleSelectAll}
                                onSelectNone={handleSelectNone}
                                compactMode={true}
                                editState={form.editState}
                                stagedEdits={form.stagedEdits}
                                fieldSelection={form.fieldSelection}
                                onRemoveEdit={handleSingleRemovalRequest}
                            />
                        </div>

                        {/* Bottom: Operations */}
                        <div className="flex-1 overflow-y-auto">
                            <BulkOperationsPanel_DB
                                form={form}
                                models={targetModels as any} // Operations only apply to targets
                                categories={categories}
                                collectionsList={collectionsList as any}
                                pendingBulkCollectionId={pendingBulkCollectionId}
                                isGeneratingImages={isGeneratingImages}
                                generateProgress={generateProgress}
                                onOpenCollectionCreator={() => setIsCreatorOpen(true)}
                                modelsMissingImagesCount={targetModels.reduce((c, m) => c + ((m.thumbnail || (m.images && m.images.length)) ? 0 : 1), 0)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
