import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModelMutations_DB } from '@/hooks/useModelMutations_DB';
import { Model } from "@/types/model_db";
import {
    Ban,
    Box,
    CheckCircle,
    Download, Eye,
    FileCode,
    FolderOpen,
    Paperclip, Plus,
    Star,
    Trash2
} from 'lucide-react';
import React from 'react';

// Helper for UI display
function truncatePath(path: string, maxLength: number = 40) {
    if (!path || path.length <= maxLength) return path;
    const fileName = path.split('/').pop() || "";
    if (fileName.length > maxLength) return fileName.substring(0, maxLength - 3) + "...";
    const start = path.substring(0, 10);
    const end = path.substring(path.length - (maxLength - 13));
    return `${start}...${end}`;
}

const ModelFileCard = ({
    path,
    deriveMunchieCandidate,
    isActive,
    onJump,
    onPromote,
    onDownload
}: {
    path: string,
    deriveMunchieCandidate: any,
    isActive: boolean,
    onJump: () => void,
    onPromote: () => void,
    onDownload: (e: React.MouseEvent) => void
}) => {
    const [thumb, setThumb] = React.useState<string | null>(null);
    const [isProjectMain, setIsProjectMain] = React.useState(false);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const candidate = deriveMunchieCandidate(path);
                if (!candidate) return;
                const resp = await fetch(`/models/${candidate}`, { cache: 'no-store' });
                if (resp.ok) {
                    const data = await resp.json();

                    // 1. Determine "Main" status from the file's own JSON
                    setIsProjectMain(data.isProjectRoot === true);

                    // 2. Resolve Thumbnail pointer or direct URL
                    let rawThumb = data.userDefined?.thumbnail || data.thumbnail || (data.parsedImages?.[0]) || (data.images?.[0]);

                    // NEW: Handle both 'parsed:' and 'user:' pointers safely
                    if (typeof rawThumb === 'string' && (rawThumb.startsWith('parsed:') || rawThumb.startsWith('user:'))) {
                        const [type, indexStr] = rawThumb.split(':');
                        const idx = parseInt(indexStr);
                        if (type === 'parsed') rawThumb = data.parsedImages?.[idx];
                        else if (type === 'user') rawThumb = data.userDefined?.images?.[idx];
                    }

                    // 3. Final path assembly (only if rawThumb is now a real path string)
                    if (rawThumb && typeof rawThumb === 'string' && !rawThumb.includes(':')) {
                        const finalPath = rawThumb.startsWith('/') ? rawThumb : `/models/${rawThumb}`;
                        setThumb(finalPath);
                    } else {
                        setThumb(null);
                    }
                }
            } catch (e) { }
        };
        fetchData();
    }, [path, deriveMunchieCandidate]);

    return (
        <div
            className={`group relative p-2 rounded-xl border transition-all cursor-pointer ${isProjectMain ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20 shadow-sm" : isActive ? "bg-accent border-primary/30" : "bg-card/40 border-border/40 hover:border-border"}`}
            onClick={onJump}
        >
            <div className="aspect-square w-full overflow-hidden rounded bg-muted/20 border border-border/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
                {thumb ? (
                    <img src={thumb} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-110 duration-500" onError={() => setThumb(null)} />
                ) : (
                    <Box className="h-5 w-5 text-muted-foreground/20" />
                )}
            </div>

            {isProjectMain && (
                <div className="absolute top-3 left-3">
                    <Badge className="h-4 px-1.5 text-[8px] font-black uppercase tracking-tighter bg-primary text-primary-foreground border-none shadow-sm">Main Model</Badge>
                </div>
            )}

            <div className="mt-2 px-1">
                <p className={`text-[10px] font-mono truncate ${isProjectMain ? 'text-primary font-bold' : 'text-foreground/60'}`}>{path.split('/').pop()}</p>
            </div>

            <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isProjectMain && (
                    <Button
                        size="icon" variant="secondary" className="h-6 w-6 rounded-full shadow-md text-amber-500 hover:text-amber-600"
                        title="Promote to Main Model"
                        onClick={(e) => { e.stopPropagation(); onPromote(); }}
                    >
                        <Star className="h-3 w-3 fill-current" />
                    </Button>
                )}
                <Button
                    size="icon" variant="secondary" className="h-6 w-6 rounded-full shadow-md"
                    onClick={onDownload}
                >
                    <Download className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
};

interface RelatedFilesSectionProps {
    isEditing: boolean;
    relatedVerifyStatus: Record<number, { loading?: boolean; ok?: boolean; message?: string }>;
    setRelatedVerifyStatus: React.Dispatch<React.SetStateAction<Record<number, any>>>;
    invalidRelated: string[];
    serverRejectedRelated: string[];
    currentModel: Model;
    availableRelatedMunchie: Record<number, boolean>;
    onModelUpdate: (model: Model) => void;
    detailsViewportRef: React.RefObject<HTMLDivElement | null>;
    triggerDownload: (path: string, event: MouseEvent, name: string) => void;
    toast?: any;
    deriveMunchieCandidate: (path: string) => string | null;
    active3DFile: string | null;
    setActive3DFile: (path: string | null) => void;
    handleViewDocument: (url: string) => void;
    handleTargetedUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    onAnalyze?: (path: string) => Promise<void>;
}

export const RelatedFilesSection_DB = ({
    isEditing,
    relatedVerifyStatus,
    setRelatedVerifyStatus,
    currentModel,
    onModelUpdate,
    detailsViewportRef,
    triggerDownload,
    toast,
    deriveMunchieCandidate,
    active3DFile,
    setActive3DFile,
    handleViewDocument,
    handleTargetedUpload,
    onAnalyze
}: RelatedFilesSectionProps) => {


    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const { deleteRelatedFile, addRelatedFile, updateRelatedFile } = useModelMutations_DB();

    const categorizeFiles = (files: { id: string, path: string }[]) => {
        const categories = {
            models: [] as string[],
            docs: [] as string[],
            gcode: [] as string[]
        };

        // 1. ALWAYS start the models list with the current main model
        if (currentModel.filePath) {
            categories.models.push(currentModel.filePath);
        }

        files.forEach(({ path }) => {
            // Skip adding the main model twice
            if (path === currentModel.filePath) return;

            const ext = path.split('.').pop()?.toLowerCase() || '';
            if (['stl', '3mf', 'obj', 'step'].includes(ext)) {
                categories.models.push(path);
            } else if (['gcode', 'bgcode'].includes(ext)) {
                categories.gcode.push(path);
            } else {
                categories.docs.push(path);
            }
        });
        return categories;
    };

    const handleJumpToModel = async (path: string) => {
        try {
            let candidate = deriveMunchieCandidate(path);
            if (!candidate) return;

            const resp = await fetch(`/models/${candidate}`, { cache: 'no-store' });
            if (!resp.ok) throw new Error('Not found');

            const parsed = await resp.json();

            // 1. Update the metadata for the whole page
            onModelUpdate(parsed as Model);

            // 2. [CRITICAL FIX] Update the 3D viewer to point to the new part's file
            // This prevents the Hero from trying to load the old project's file
            setActive3DFile(path);

            // 3. Smooth scroll back to the top Hero area
            detailsViewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err) {
            toast?.error?.('Could not load metadata.');
        }
    };

    const handleSetMainModel = async (newPath: string) => {
        try {
            const oldMainPath = currentModel.filePath;

            // 1. Guard: Prevent self-demotion
            if (oldMainPath === newPath && (currentModel as any).isProjectRoot) {
                toast?.info?.("This is already the Main Model.");
                return;
            }

            // 2. Prepare the Payload
            // We now send the specific "changes" we want. 
            // Note: isProjectRoot: true triggers the server's internal demotion scan.
            const promotionPayload = {
                filePath: newPath,
                changes: {
                    isProjectRoot: true,
                    isRelatedPart: false,
                    // We strip these to ensure the subsequent Heal generates fresh paths
                    thumbnail: undefined,
                    userDefined: {
                        ...currentModel.userDefined,
                        thumbnail: undefined
                    }
                }
            };

            // 3. Persist via the Unified Mutation Hook (Triggers Auto-Refresh)
            // Use fetch directly here because we need the raw response for the heal
            const patchRes = await fetch(`/api/models/${currentModel.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(promotionPayload.changes),
            });
            if (!patchRes.ok) throw new Error("Failed to promote model");

            // 4. OS Grace Period (Ensures file locks are released)
            await new Promise(resolve => setTimeout(resolve, 150));

            // 5. Targeted Micro-Heal
            // This ensures the gallery is synced and neighbors are hidden correctly
            const folderPath = newPath.split('/').slice(0, -1).join('/');

            try {
                const healResp = await fetch('/api/admin/library-heal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetPath: folderPath })
                });

                if (!healResp.ok) {
                    console.warn("Heal returned non-OK status");
                }
            } catch (healErr) {
                console.warn("Targeted Heal network error", healErr);
                // Non-blocking: The promotion was successful even if heal logs a warning
            }

            // 6. Final UI Update
            // And useModelGallery effect (now watching filePath) will update the 3D view.
            setActive3DFile(newPath);

            toast.success("Model promoted successfully");

            const fileName = newPath.split('/').pop() || 'model';
            toast?.success?.(`Main model set to ${fileName}`);

            // Force a hard reload of the page to ensure all contexts reset correctly
            window.location.reload();

        } catch (err) {
            console.error("Critical failure during model promotion:", err);
            toast?.error?.('Failed to update project identity.');
        }
    };

    // Strict Database First: Map over true DB objects
    const filesToEdit = currentModel.relatedFiles || [];

    // Categorize files for edit mode grouping
    const categorizeForEdit = (files: { id: string, path: string }[]) => {
        const groups = {
            models: [] as { id: string, path: string, idx: number }[],
            docs: [] as { id: string, path: string, idx: number }[],
            gcode: [] as { id: string, path: string, idx: number }[],
        };
        files.forEach((rf, idx) => {
            const ext = rf.path.split('.').pop()?.toLowerCase() || '';
            if (['stl', '3mf', 'obj', 'step'].includes(ext)) {
                groups.models.push({ ...rf, idx });
            } else if (['gcode', 'bgcode'].includes(ext)) {
                groups.gcode.push({ ...rf, idx });
            } else {
                groups.docs.push({ ...rf, idx });
            }
        });
        return groups;
    };

    if (isEditing) {
        const editGroups = categorizeForEdit(filesToEdit);

        const renderFileRow = (rf: { id: string, path: string, idx: number }) => (
            <div key={`related-edit-${rf.id}`} className="flex items-center gap-2 group">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the file from the server's disk and remove it from the 3D Model Muncher database.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        await deleteRelatedFile.mutateAsync({ id: currentModel.id, relatedFileId: rf.id });
                                        toast?.success?.("File permanently deleted.");
                                    } catch (error: any) {
                                        toast?.error?.(error.message || "Failed to delete file.");
                                    }
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Permanently Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <Input
                    defaultValue={rf.path}
                    className="h-9 font-mono text-xs bg-background/50 border-border/40 focus-visible:ring-primary/20"
                    onBlur={async (e) => {
                        const newPath = e.target.value;
                        if (newPath === rf.path) return;
                        if (!newPath.trim()) {
                            toast?.error?.("Path cannot be empty. Use the delete button instead.");
                            e.target.value = rf.path;
                            return;
                        }
                        try {
                            await updateRelatedFile.mutateAsync({ id: currentModel.id, relatedFileId: rf.id, path: newPath });
                            toast?.success?.("Path updated.");
                        } catch (err: any) {
                            toast?.error?.(err.message || "Failed to update path.");
                            e.target.value = rf.path;
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.currentTarget.blur();
                        }
                    }}
                />

                <Button
                    size="sm" variant="outline" className="h-9 min-w-[40px] px-2"
                    title="Verify file exists on disk"
                    onClick={async (e) => {
                        e.stopPropagation();
                        setRelatedVerifyStatus(prev => ({ ...prev, [rf.idx]: { loading: true } }));
                        try {
                            const resp = await fetch('/api/verify-file', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ path: rf.path })
                            });
                            const j = await resp.json();
                            const exists = !!(j && j.success && j.exists);
                            setRelatedVerifyStatus(prev => ({ ...prev, [rf.idx]: { loading: false, ok: exists } }));
                            if (exists) {
                                toast?.success?.(`✓ File verified: ${rf.path.split('/').pop()}`);
                            } else {
                                toast?.error?.(`✗ File not found: ${rf.path.split('/').pop()}`);
                            }
                        } catch (err) {
                            setRelatedVerifyStatus(prev => ({ ...prev, [rf.idx]: { loading: false, ok: false } }));
                            toast?.error?.("Verification failed — server unreachable.");
                        }
                    }}
                >
                    {relatedVerifyStatus[rf.idx]?.loading ? '...' : relatedVerifyStatus[rf.idx]?.ok ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Ban className="h-4 w-4 text-destructive" />}
                </Button>
            </div>
        );

        const sectionHeader = (icon: React.ReactNode, label: string, count: number) => (
            <div className="flex items-center gap-2 pt-2 pb-1">
                {icon}
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">{label}</span>
                <span className="text-[9px] font-mono text-muted-foreground/30">({count})</span>
            </div>
        );

        return (
            <div className="space-y-4 rounded-xl border border-dashed border-primary/20 p-6 bg-primary/5">
                <div className="flex items-center justify-between border-b border-primary/10 pb-4">
                    <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                            File_Manifest_Editor
                        </span>
                    </div>
                </div>

                <div className="space-y-1">
                    {/* Models Section */}
                    {editGroups.models.length > 0 && (
                        <>
                            {sectionHeader(<Box className="h-3 w-3 text-muted-foreground/40" />, "Models", editGroups.models.length)}
                            {editGroups.models.map(renderFileRow)}
                        </>
                    )}

                    {/* Documents Section */}
                    {editGroups.docs.length > 0 && (
                        <>
                            {sectionHeader(<Paperclip className="h-3 w-3 text-muted-foreground/40" />, "Documents", editGroups.docs.length)}
                            {editGroups.docs.map(renderFileRow)}
                        </>
                    )}

                    {/* G-Code Section */}
                    {editGroups.gcode.length > 0 && (
                        <>
                            {sectionHeader(<FileCode className="h-3 w-3 text-muted-foreground/40" />, "G-Code", editGroups.gcode.length)}
                            {editGroups.gcode.map(renderFileRow)}
                        </>
                    )}

                    {filesToEdit.length === 0 && (
                        <div className="py-6 text-center opacity-30">
                            <p className="text-[10px] font-mono uppercase tracking-widest">// No_Related_Files</p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button
                        variant="outline" size="sm" className="h-9 border-dashed text-[10px] font-black uppercase tracking-tighter"
                        onClick={async () => {
                            try {
                                await addRelatedFile.mutateAsync({ id: currentModel.id, path: `new/path/to/file-${Date.now()}.stl` });
                                toast?.success?.("New empty record created.");
                            } catch (err: any) {
                                toast?.error?.(err.message || "Failed to create new record.");
                            }
                        }}
                    >
                        <Plus className="mr-2 h-3.5 w-3.5" /> Link_Entry
                    </Button>
                    <Button
                        variant="outline" size="sm" className="h-9 border-dashed text-[10px] font-black uppercase tracking-tighter"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Plus className="mr-2 h-3.5 w-3.5" /> Upload_File
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleTargetedUpload}
                    />
                </div>
            </div>
        );
    }

    /* ==================== VIEW MODE ==================== */
    const categories = categorizeFiles(currentModel.relatedFiles || []);

    return (
        <div className="space-y-4">
            <Tabs defaultValue="models" className="w-full">
                <TabsList className="flex w-full bg-muted/10 border border-border/40 p-1 h-auto gap-1 mb-6 rounded-xl overflow-hidden backdrop-blur-sm shadow-inner">
                    {['models', 'docs', 'gcode'].map((key) => (
                        <TabsTrigger
                            key={key}
                            value={key}
                            className="
                    flex-1 relative h-9 px-4 rounded-lg
                    bg-transparent text-[10px] font-black uppercase tracking-widest 
                    data-[state=active]:bg-background data-[state=active]:text-primary 
                    data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20
                    hover:bg-primary/5 transition-all duration-300
                "
                        >
                            <div className="flex items-center justify-center gap-2">
                                {key === 'models' && <Box className="h-3.5 w-3.5" />}
                                {key === 'docs' && <Paperclip className="h-3.5 w-3.5" />}
                                {key === 'gcode' && <FileCode className="h-3.5 w-3.5" />}
                                <span className="hidden sm:inline">{key.replace('gcode', 'G-Code')}</span>
                                <span className="opacity-40 tabular-nums">({categories[key as keyof typeof categories].length})</span>
                            </div>
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* MODELS GRID - Visual Gallery */}
                <TabsContent value="models" className="mt-0 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {categories.models.map((path, idx) => (
                            <ModelFileCard
                                key={`${path}-${idx}`}
                                path={path}
                                deriveMunchieCandidate={deriveMunchieCandidate}
                                isActive={active3DFile === path}
                                onJump={() => handleJumpToModel(path)}
                                onPromote={() => handleSetMainModel(path)}
                                onDownload={(e) => {
                                    e.stopPropagation();
                                    triggerDownload(path, e.nativeEvent as any, path.split('/').pop() || '');
                                }}
                            />
                        ))}
                    </div>
                </TabsContent>

                {/* DOCS & GCODE - Lab Notebook Style */}
                {['docs', 'gcode'].map((tabKey) => (
                    <TabsContent key={tabKey} value={tabKey} className="mt-0 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        {categories[tabKey as keyof typeof categories].length > 0 ? (
                            categories[tabKey as keyof typeof categories].map((path, idx) => {
                                const isViewable = path.toLowerCase().endsWith('.pdf') || /\.(txt|md|log|cfg|ini|gcode)$/i.test(path);
                                return (
                                    <div key={idx} className="relative group p-4 rounded-lg border border-border/40 bg-card/20 backdrop-blur-sm font-mono text-sm transition-all hover:border-primary/30">
                                        {/* Vertical Accent Line to match Notes/Details */}
                                        <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-primary/20 group-hover:bg-primary/50 transition-colors" />

                                        <div className="flex items-center justify-between pl-2">
                                            <span className="text-[11px] truncate text-foreground/70 group-hover:text-foreground font-mono tracking-tight" title={path}>
                                                {tabKey === 'gcode'
                                                    ? (path.split('/').pop() || path)
                                                    : truncatePath(path, 60)}
                                            </span>

                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {tabKey === 'gcode' && onAnalyze && (
                                                    <Button
                                                        size="icon" variant="ghost" className="h-7 w-7 text-primary/60 hover:text-primary hover:bg-primary/10"
                                                        title="Analyze G-code"
                                                        onClick={() => onAnalyze(path)}
                                                    >
                                                        <FileCode className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                {isViewable && tabKey === 'docs' && (
                                                    <Button
                                                        size="icon" variant="ghost" className="h-7 w-7 text-primary/60 hover:text-primary hover:bg-primary/10"
                                                        onClick={() => handleViewDocument(`/models/${path}`)}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => triggerDownload(path, e.nativeEvent as any, path.split('/').pop() || 'file')}>
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-10 text-center border border-dashed rounded-xl bg-muted/5 opacity-30">
                                <p className="text-[10px] font-mono uppercase tracking-widest">// No_{tabKey}_Found</p>
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
};