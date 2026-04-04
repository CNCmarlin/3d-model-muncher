import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

    // Reset and preflight on open
    useEffect(() => {
        if (!open) return;
        setStep('loading');
        setPrimaryId(null);
        setError(null);

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

    // Build file preview from secondaries
    const previewFiles = secondaries.flatMap(m => {
        const paths: string[] = [];
        if (m.modelUrl) paths.push(m.modelUrl.replace(/^\/models\//, ''));
        m.relatedFiles.forEach(rf => paths.push(rf.path));
        return paths;
    });

    const grouped = {
        model: previewFiles.filter(p => classifyExt(p) === 'model'),
        gcode: previewFiles.filter(p => classifyExt(p) === 'gcode'),
        source: previewFiles.filter(p => classifyExt(p) === 'source'),
        doc: previewFiles.filter(p => classifyExt(p) === 'doc'),
    };

    const handleConvert = async () => {
        if (!primaryId) return;
        setStep('converting');
        try {
            const res = await fetch(`/api/collections/${encodeURIComponent(collection.id)}/convert-to-model-folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ primaryModelId: primaryId }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Conversion failed');
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
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            <div className="text-sm">
                                <strong>{primary.name}</strong> will become the <span className="text-primary font-semibold">primary model</span>
                            </div>
                        </div>

                        {/* File preview table */}
                        {previewFiles.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Files merged as Related Files ({previewFiles.length})
                                </p>
                                {([
                                    { key: 'model', icon: <Box className="h-3 w-3" />, label: 'Models' },
                                    { key: 'gcode', icon: <FileCode className="h-3 w-3" />, label: 'G-Code' },
                                    { key: 'source', icon: <Cpu className="h-3 w-3" />, label: 'Source Files' },
                                    { key: 'doc', icon: <File className="h-3 w-3" />, label: 'Documents' },
                                ] as const).map(({ key, icon, label }) => {
                                    const files = grouped[key];
                                    if (!files.length) return null;
                                    return (
                                        <div key={key} className="grid grid-cols-[100px_1fr] gap-2 items-start">
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                                                {icon} {label}
                                                <Badge variant="outline" className="text-[9px] h-4 px-1">{files.length}</Badge>
                                            </div>
                                            <div className="space-y-0.5">
                                                {files.map((f, i) => (
                                                    <p key={i} className="text-[10px] font-mono text-foreground/60 truncate" title={f}>
                                                        {f.split('/').pop()}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="text-xs text-muted-foreground border-t pt-3">
                            <strong>{secondaries.length}</strong> model records will be demoted (hidden, recoverable via Revert).
                            A <code className="bg-muted px-1 rounded">_folder.munchie.json</code> marker will be written to the folder.
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
                        <p className="text-sm">Converting and running micro-heal…</p>
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
