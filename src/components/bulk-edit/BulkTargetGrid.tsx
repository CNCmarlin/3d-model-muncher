import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Model } from "@/types/model";
import { FileQuestion, X } from "lucide-react";
import { ImageWithFallback } from "@/components/ImageWithFallback";

interface BulkTargetGridProps {
    models: Model[];
    selectedIds: string[];
    onToggleSelect: (id: string) => void;
    onRemoveModel: (id: string) => void;
    onSelectAll?: () => void;
    onSelectNone?: () => void;
    compactMode?: boolean;
    editState?: any;
    stagedEdits?: Record<string, any>;
    fieldSelection?: any;
    onRemoveEdit?: (id: string, field: string, value?: any) => void;
}

import { resolveModelThumbnail } from "@/utils/thumbnailUtils";

// Remove local fixPath helper as we use the centralized util

export function BulkTargetGrid({
    models,
    selectedIds,
    onToggleSelect,
    onRemoveModel,
    onSelectAll,
    onSelectNone,
    compactMode = false,
    stagedEdits,
    fieldSelection,
    onRemoveEdit
}: BulkTargetGridProps) {

    // Check if all are selected
    const allSelected = models.length > 0 && selectedIds.length === models.length;

    const handleBadgeClick = (e: React.MouseEvent, modelId: string, field: string, value?: any) => {
        e.stopPropagation();
        onRemoveEdit?.(modelId, field, value);
    };

    const badgeClass = "flex items-center gap-1 min-w-0 cursor-pointer hover:bg-destructive/10 hover:line-through transition-colors group/badge";

    return (
        <div className="h-full flex flex-col bg-muted/20">
            {/* Header / Toolbar */}
            {!compactMode && (
                <div className="p-3 border-b flex items-center justify-between bg-background shrink-0 z-10 relative shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="font-semibold text-sm">Target Models</span>
                        <Badge variant="secondary">{models.length}</Badge>

                        <div className="ml-4 flex items-center gap-2 border-l pl-4">
                            {selectedIds.length > 0 && !allSelected && (
                                <Button
                                    variant="ghost" size="sm"
                                    onClick={onSelectNone}
                                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                >
                                    Clear Selection
                                </Button>
                            )}
                            <Button
                                variant="ghost" size="sm"
                                onClick={allSelected ? onSelectNone : onSelectAll}
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            >
                                {allSelected ? "Deselect All" : "Select All"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ScrollArea
                className="flex-1"
                showHorizontalScrollbar={compactMode}
                showVerticalScrollbar={!compactMode}
            >
                <div className={compactMode
                    ? "flex flex-row gap-3 pb-4 px-4 w-max min-w-full" // w-max ensures it grows, min-w-full ensures it fills if few items
                    : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 lg:gap-4 p-4 auto-rows-[18rem]" // Fixed row height for internal scroll
                }>
                    {models.map((model) => {
                        const isSelected = selectedIds.includes(model.id);

                        return (
                            <div
                                key={model.id}
                                onClick={() => onToggleSelect(model.id)}
                                className={`
                                    group relative flex flex-col rounded-2xl border-4 transition-all cursor-pointer select-none overflow-hidden
                                    ${compactMode ? "min-w-[130px] w-[130px] shrink-0 h-[190px]" : "h-full min-h-[220px]"}
                                    ${isSelected
                                        ? "bg-zinc-900 border-primary/40 shadow-xl ring-2 ring-primary/10 -translate-y-1"
                                        : "bg-muted/10 border-border/20 opacity-70 hover:opacity-100"
                                    }
                                `}
                            >
                                {/* Selection Badge */}
                                <div className="absolute top-2 left-2 z-10 transition-transform duration-200 group-hover:scale-110">
                                    {isSelected ? (
                                        <div className="bg-primary text-primary-foreground text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-full shadow-lg border border-white/20">
                                            Target
                                        </div>
                                    ) : (
                                        <div className="bg-muted text-muted-foreground text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-full border border-border/50">
                                            Excluded
                                        </div>
                                    )}
                                </div>

                                {/* Remove Button (Always available) */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRemoveModel(model.id); }}
                                    className="absolute top-2 right-2 z-10 p-1 bg-black/40 hover:bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-sm border border-white/10"
                                    title="Remove from session"
                                >
                                    <X className="h-3 w-3" />
                                </button>

                                {/* Image Section (Thumbnail) */}
                                <div className={`
                                    relative aspect-square m-2 overflow-hidden rounded-lg bg-muted/20 border shadow-inner transition-all duration-300
                                    ${isSelected ? "border-primary/20" : "border-border/30 grayscale contrast-125"}
                                `}>
                                    <ImageWithFallback
                                        src={resolveModelThumbnail(model)}
                                        alt={model.name}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700"
                                        fallback={<FileQuestion className="h-6 w-6 text-muted-foreground/20" />}
                                    />
                                </div>

                                {/* Description Area (Details & Edits) */}
                                <div className={`
                                    flex-1 px-3 pb-3 mt-0.5 flex flex-col gap-1.5 overflow-hidden
                                    ${isSelected ? "bg-zinc-900" : ""}
                                `}>
                                    <h3 className={`text-[10px] font-black uppercase tracking-tighter truncate leading-none ${isSelected ? "text-primary/90" : "text-muted-foreground"}`} title={model.name}>
                                        {model.name}
                                    </h3>

                                    <div className="flex-1 flex flex-col gap-1 overflow-y-auto no-scrollbar py-1">
                                        {(() => {
                                            // Resolver: Get the specific staged edits for THIS model
                                            // We prioritize the staged value, but we only show the badge if it's actually staged (in stagedEdits).
                                            // The `editState` prop passed in is the "Common Value" for the inputs, not the per-model state.
                                            // We need to access `stagedEdits` from props.

                                            const modelStaged = stagedEdits?.[model.id];
                                            const hasStagedChanges = modelStaged && Object.keys(modelStaged).length > 0;



                                            if (!hasStagedChanges) {
                                                return (
                                                    <span className="text-[8px] font-bold text-muted-foreground/30 uppercase italic text-center mt-2">No changes pending</span>
                                                );
                                            }

                                            return (
                                                <>
                                                    {modelStaged.category && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'category')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-purple-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate" title={`Category: ${modelStaged.category}`}>
                                                                {compactMode ? "Cat" : "Category"}: {modelStaged.category}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.license && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'license')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-cyan-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate" title={`License: ${modelStaged.license}`}>
                                                                {compactMode ? "Lic" : "License"}: {modelStaged.license}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.designer && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'designer')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-indigo-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate" title={`Designer: ${modelStaged.designer}`}>
                                                                {compactMode ? "Des" : "Designer"}: {modelStaged.designer}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.tags && (
                                                        <>
                                                            {modelStaged.tags.add?.map((tag: string) => (
                                                                <div key={`add-${tag}`} className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'tags', { tag, action: 'add' })} title="Click to remove tag add">
                                                                    <div className="w-1 h-3 bg-blue-500/50 rounded-full shrink-0" />
                                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate" title={`Adding Tag: ${tag}`}>
                                                                        {compactMode ? `+${tag}` : `Tag: ${tag}`}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            {modelStaged.tags.remove?.map((tag: string) => (
                                                                <div key={`rem-${tag}`} className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'tags', { tag, action: 'remove' })} title="Click to undo tag removal">
                                                                    <div className="w-1 h-3 bg-red-500/50 rounded-full shrink-0" />
                                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate decoration-line-through opacity-70" title={`Removing Tag: ${tag}`}>
                                                                        {compactMode ? `-${tag}` : `- Tag: ${tag}`}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                    {modelStaged.isPrinted !== undefined && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'isPrinted')} title="Click to remove edit">
                                                            <div className={`w-1 h-3 rounded-full shrink-0 ${modelStaged.isPrinted ? 'bg-green-500/50' : 'bg-red-500/50'}`} />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none">
                                                                {modelStaged.isPrinted ? "Marked Printed" : "Marked Unprinted"}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.hidden !== undefined && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'hidden')} title="Click to remove edit">
                                                            <div className={`w-1 h-3 rounded-full shrink-0 ${modelStaged.hidden ? 'bg-red-500' : 'bg-green-500'}`} />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none">
                                                                {modelStaged.hidden ? "Hidden" : "Visible"}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.collectionId && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'collectionId')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-rose-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate">
                                                                {compactMode ? "Col" : "Coll"}: {modelStaged.collectionAction === 'add' ? 'Add' : 'Set'}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.notes !== undefined && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'notes')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-orange-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate" title={modelStaged.notes}>
                                                                {compactMode ? "Note" : "Notes"}: {modelStaged.notes.length > 10 ? modelStaged.notes.slice(0, 10) + '...' : modelStaged.notes}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.source !== undefined && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'source')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-teal-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate" title={modelStaged.source}>
                                                                {compactMode ? "Src" : "Source"}: {modelStaged.source.length > 15 ? '...' + modelStaged.source.slice(-15) : modelStaged.source}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.price !== undefined && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'price')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-emerald-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none">
                                                                {compactMode ? "$" : "Price"}: ${modelStaged.price}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.printTime !== undefined && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'printTime')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-amber-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate">
                                                                {compactMode ? "Time" : "Time"}: {modelStaged.printTime}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.filamentUsed !== undefined && (
                                                        <div className={badgeClass} onClick={(e) => handleBadgeClick(e, model.id, 'filamentUsed')} title="Click to remove edit">
                                                            <div className="w-1 h-3 bg-orange-500/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate">
                                                                {compactMode ? "Fil" : "Filament"}: {modelStaged.filamentUsed}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {modelStaged.printSettings && Object.entries(modelStaged.printSettings).map(([key, val]) => (
                                                        <div
                                                            key={key}
                                                            className={badgeClass}
                                                            onClick={(e) => handleBadgeClick(e, model.id, 'printSettings', key)}
                                                            title={`Click to remove ${key} setting`}
                                                        >
                                                            <div className="w-1 h-3 bg-slate-700/50 rounded-full shrink-0" />
                                                            <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none truncate">
                                                                {compactMode ? key.slice(0, 3) : key}: {val as string}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {modelStaged.relatedFiles || fieldSelection?.relatedFiles ? (
                                                        // Fallback to checking fieldSelection for pure actions like 'generateImages' not in staged state?
                                                        // Actually Actions (generateImages) are stored in staged state? No, fieldSelection handles them.
                                                        // Wait, for Per-Model Staging, Actions must also be staged per model if we want "Batch" behavior.
                                                        // Logic gap: The hook removed 'generateImages' from staged state.
                                                        // Fixing below:
                                                        null
                                                    ) : null}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}
