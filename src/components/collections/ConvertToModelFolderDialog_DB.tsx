import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GCODE_EXTENSIONS, SOURCE_CAD_EXTENSIONS, VIEWABLE_3D_EXTENSIONS } from "@/constants/fileExtensions";
import type { Collection } from "@/types/collection_db";
import { AlertTriangle, Box, CheckCircle2, Cpu, File, FileCode, FolderOpen, Loader2, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    collection: Collection;
    onConverted: () => void;
}

type StepId = 'loading' | 'cross-folder-error' | 'pick-primary' | 'confirm' | 'converting' | 'done';

interface ModelSummary {
    id: string;
    name: string;
    modelUrl: string | null;
    thumbnail: string | null;
    thumbnailPath: string | null;
    relatedFiles: { id: string; path: string }[];
}

const VIEWABLE = new Set(VIEWABLE_3D_EXTENSIONS);
const GCODE = new Set(GCODE_EXTENSIONS);
const SOURCE = new Set(SOURCE_CAD_EXTENSIONS);

function classifyExt(p: string): 'model' | 'gcode' | 'source' | 'doc' {
    const ext = p.split('.').pop()?.toLowerCase() || '';
    if (VIEWABLE.has(ext)) return 'model';
    if (GCODE.has(ext)) return 'gcode';
    if (SOURCE.has(ext)) return 'source';
    return 'doc';
}

function getParentDir(modelUrl: string | null): string | null {
    if (!modelUrl) return null;
    const clean = modelUrl.replace(/^\/models\//, '');
    const parts = clean.split('/');
    parts.pop();
    return parts.join('/');
}

export function ConvertToModelFolderDialog_DB({ open, onOpenChange, collection, onConverted }: Props) {
    const [step, setStep] = useState<StepId>('loading');
    const [models, setModels] = useState<ModelSummary[]>([]);
    const [conflictingPaths, setConflictingPaths] = useState<string[]>([]);
    const [primaryId, setPrimaryId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [generateThumbs, setGenerateThumbs] = useState(false);
    const [removeCollection, setRemoveCollection] = useState(false);

    // Reset and preflight on open
    useEffect(() => {
        if (!open) return;
        setStep('loading');
        setPrimaryId(null);
        setError(null);
        setGenerateThumbs(false);
        setRemoveCollection(false);

        (async () => {
            try {
                const res = await fetch(`/api/collections/${encodeURIComponent(collection.id)}`);
                const json: any = await res.json();
                const col = json.collection ?? json;

                // Fetch each model's full details (needs relatedFiles too)
                const mIds: string[] = col.modelIds || [];
                if (mIds.length === 0) {
                    setStep('pick-primary');
                    setModels([]);
                    return;
                }

                const modelsData: ModelSummary[] = await Promise.all(
                    mIds.map(async (id) => {
                        const r = await fetch(`/api/models/${id}`);
                        if (!r.ok) return null;
                        const j: any = await r.json();
                        const m = j.model ?? j.data ?? j;
                        return {
                            id: m.id,
                            name: m.name,
                            modelUrl: m.modelUrl,
                            thumbnail: m.thumbnail ?? null,
                            thumbnailPath: m.thumbnailPath ?? null,
                            relatedFiles: m.relatedFiles ?? [],
                        } as ModelSummary;
                    })
                ).then(r => r.filter(Boolean) as ModelSummary[]);

                // Validate same folder
                const dirs = [...new Set(modelsData.map(m => getParentDir(m.modelUrl)).filter(Boolean))] as string[];
                if (dirs.length > 1) {
                    setConflictingPaths(dirs);
                    setStep('cross-folder-error');
                    return;
                }

                setModels(modelsData);
                // Auto-elect if only one 3D model
                const mainCandidates = modelsData.filter(m => {
                    const ext = (m.modelUrl || '').split('.').pop()?.toLowerCase() || '';
                    return VIEWABLE.has(ext);
                });
                if (mainCandidates.length === 1) setPrimaryId(mainCandidates[0].id);
                setStep('pick-primary');
            } catch (e: any) {
                setError(e.message);
                setStep('pick-primary');
            }
        })();
    }, [open, collection.id]);

    const primary = models.find(m => m.id === primaryId);
    const secondaries = models.filter(m => m.id !== primaryId);

    // Build deduplicated preview of what will be added to the primary as relatedFiles.
    // Since the backend now only cross-links to the primary model, we show:
    // 1. The sibling model URLs (one per secondary — the new relatedFile links)
    // 2. Shared non-model files deduplicated across all models' relatedFiles
    const primaryExistingPaths = new Set((primary?.relatedFiles ?? []).map(rf => rf.path));

    const siblingModelPaths = secondaries
        .map(m => m.modelUrl?.replace(/^\/models\//, '') ?? '')
        .filter(Boolean);

    // Gather shared non-model files (gcode, docs, source) from ALL models, deduplicated
    const sharedFilePaths = [...new Set(
        models.flatMap(m => m.relatedFiles.map(rf => rf.path))
    )].filter(p => !primaryExistingPaths.has(p) && !siblingModelPaths.includes(p));

    const grouped = {
        model: siblingModelPaths.filter(p => classifyExt(p) === 'model'),
        gcode: sharedFilePaths.filter(p => classifyExt(p) === 'gcode'),
        source: sharedFilePaths.filter(p => classifyExt(p) === 'source'),
        doc: sharedFilePaths.filter(p => classifyExt(p) === 'doc'),
    };

    const handleConvert = async () => {
        if (!primaryId) return;
        setStep('converting');
        try {
            const res = await fetch(`/api/collections/${encodeURIComponent(collection.id)}/convert-to-model-folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ primaryModelId: primaryId, removeCollection }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Conversion failed');

            // Optional: fire background thumbnail gen for components missing one
            if (generateThumbs && json.missingThumbnails?.length > 0) {
                const missing: { id: string; modelUrl: string }[] = json.missingThumbnails;
                // Non-blocking — we don't await this
                Promise.allSettled(
                    missing.map(m =>
                        fetch('/api/admin/generate-thumbnail', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ modelId: m.id }),
                        })
                    )
                ).then(() => {
                    toast.info(`Thumbnails queued for ${missing.length} component(s)`);
                });
            }

            setStep('done');
            toast.success(`"${collection.name}" converted to model folder`);
            setTimeout(() => { onOpenChange(false); onConverted(); }, 1200);
        } catch (e: any) {
            setError(e.message);
            setStep('confirm');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-primary" />
                        Convert to Model Folder
                    </DialogTitle>
                </DialogHeader>

                {/* LOADING */}
                {step === 'loading' && (
                    <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Analysing collection…
                    </div>
                )}

                {/* CROSS-FOLDER ERROR */}
                {step === 'cross-folder-error' && (
                    <div className="space-y-4 py-2">
                        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                            <div>
                                <p className="font-semibold text-destructive">Models span multiple folders</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    A model folder must have all its files in the same directory. The following folders are in conflict:
                                </p>
                                <ul className="mt-2 space-y-1">
                                    {conflictingPaths.map(p => (
                                        <li key={p} className="text-xs font-mono bg-muted/50 px-2 py-1 rounded">{p}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                        </DialogFooter>
                    </div>
                )}

                {/* PICK PRIMARY */}
                {step === 'pick-primary' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Select which model becomes the <strong>primary record</strong>. All others will be merged as related files.
                        </p>

                        {error && (
                            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded p-3">{error}</div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                            {models.map(m => {
                                const isSelected = m.id === primaryId;
                                return (
                                    <div
                                        key={m.id}
                                        onClick={() => setPrimaryId(m.id)}
                                        className={`relative group cursor-pointer rounded-xl border-2 overflow-hidden transition-all ${isSelected
                                            ? 'border-primary ring-2 ring-primary/20 shadow-md'
                                            : 'border-border hover:border-primary/50'}`}
                                        title={m.name} // File name tooltip
                                    >
                                        <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
                                            {m.thumbnail ? (
                                                <img src={m.thumbnail} className="w-full h-full object-cover" alt={m.name} />
                                            ) : (
                                                <Box className="h-8 w-8 text-muted-foreground/30" />
                                            )}
                                        </div>
                                        {isSelected && (
                                            <div className="absolute top-1.5 right-1.5">
                                                <Star className="h-4 w-4 text-primary fill-primary drop-shadow" />
                                            </div>
                                        )}
                                        <div className="p-2 bg-card/80">
                                            <p className="text-xs font-medium truncate" title={m.name}>{m.name}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button disabled={!primaryId} onClick={() => setStep('confirm')}>
                                Next — Review Changes
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* CONFIRM */}
                {step === 'confirm' && primary && (
                    <div className="space-y-4">

                        {/* Primary model hero */}
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
                            <div className="h-14 w-14 rounded-lg overflow-hidden border border-border/40 bg-muted/30 flex items-center justify-center shrink-0">
                                {primary.thumbnail
                                    ? <img src={primary.thumbnail} className="w-full h-full object-cover" alt="" />
                                    : <Box className="h-6 w-6 text-muted-foreground/30" />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-0.5">Primary Model</p>
                                <p className="text-sm font-semibold truncate">{primary.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono truncate">{primary.modelUrl?.split('/').pop()}</p>
                            </div>
                            <Star className="h-4 w-4 text-primary fill-primary ml-auto shrink-0" />
                        </div>

                        {/* Component models grid */}
                        {secondaries.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    {secondaries.length} Component{secondaries.length !== 1 ? 's' : ''} — will be hidden
                                </p>
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                    {secondaries.map(m => (
                                        <div key={m.id} className="group relative rounded-lg border border-border/40 overflow-hidden bg-muted/20">
                                            <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
                                                {m.thumbnail
                                                    ? <img src={m.thumbnail} className="w-full h-full object-cover" alt="" />
                                                    : <Box className="h-5 w-5 text-muted-foreground/20" />}
                                            </div>
                                            <div className="px-1.5 py-1">
                                                <p className="text-[9px] font-mono truncate text-foreground/50" title={m.name}>
                                                    {m.modelUrl?.split('/').pop() ?? m.name}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Shared files summary — compact badge row */}
                        {(grouped.gcode.length > 0 || grouped.source.length > 0 || grouped.doc.length > 0) && (
                            <div className="space-y-1.5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    Shared files linked to primary
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {grouped.gcode.length > 0 && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40">
                                            <FileCode className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs font-medium">{grouped.gcode.length} G-Code</span>
                                        </div>
                                    )}
                                    {grouped.source.length > 0 && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40">
                                            <Cpu className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs font-medium">{grouped.source.length} Source</span>
                                        </div>
                                    )}
                                    {grouped.doc.length > 0 && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40">
                                            <File className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs font-medium">{grouped.doc.length} Doc{grouped.doc.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Collection placement toggle */}
                        <div
                            className="flex items-start gap-3 p-3 rounded-lg border border-border/40 hover:border-border/80 cursor-pointer transition-colors"
                            onClick={() => setRemoveCollection(v => !v)}
                        >
                            <Checkbox
                                id="remove-collection"
                                checked={removeCollection}
                                onCheckedChange={(v) => setRemoveCollection(Boolean(v))}
                                className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0">
                                <label htmlFor="remove-collection" className="text-sm font-medium cursor-pointer">
                                    Remove collection wrapper after conversion
                                </label>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {removeCollection
                                        ? `Model “${collection.name}” will appear directly in the parent collection.`
                                        : `Model “${collection.name}” will remain inside this collection (recommended).`
                                    }
                                </p>
                            </div>
                        </div>

                        {(() => {
                            const missingThumbModels = secondaries.filter(m => !m.thumbnailPath);
                            if (missingThumbModels.length === 0) return null;
                            return (
                                <div className="border rounded-lg p-3 space-y-2">
                                    <div
                                        className="flex items-start gap-3 cursor-pointer"
                                        onClick={() => setGenerateThumbs(v => !v)}
                                    >
                                        <Checkbox
                                            id="gen-thumbs"
                                            checked={generateThumbs}
                                            onCheckedChange={(v) => setGenerateThumbs(Boolean(v))}
                                            className="mt-0.5"
                                        />
                                        <div>
                                            <label htmlFor="gen-thumbs" className="text-sm font-medium cursor-pointer">
                                                Generate missing thumbnails
                                            </label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {missingThumbModels.length} component{missingThumbModels.length > 1 ? 's' : ''} lack a thumbnail.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Footer note */}
                        <div className="text-xs text-muted-foreground border-t pt-3 flex items-start gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <span>
                                Components are hidden from search but <strong>recoverable via Revert</strong>.
                                A <code className="bg-muted px-1 rounded">_folder.munchie.json</code> marker will be written to the folder.
                            </span>
                        </div>

                        {error && (
                            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded p-3">{error}</div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep('pick-primary')}>Back</Button>
                            <Button variant="destructive" onClick={handleConvert}>
                                Convert to Model Folder
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* CONVERTING */}
                {step === 'converting' && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <p className="text-sm">Converting collection to model folder…</p>
                    </div>
                )}

                {/* DONE */}
                {step === 'done' && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                        <p className="font-semibold">Conversion complete!</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
