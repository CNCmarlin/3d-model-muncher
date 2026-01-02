import React from 'react';
import { FileText, X, CheckCircle, Ban, Download, Eye, Box, FileCode, Paperclip, Plus, FolderOpen } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Model } from "../types/model";
import { Badge } from './ui/badge';

// Helper for UI display
function truncatePath(path: string, maxLength: number = 40) {
    if (!path || path.length <= maxLength) return path;
    const fileName = path.split('/').pop() || "";
    if (fileName.length > maxLength) return fileName.substring(0, maxLength - 3) + "...";
    const start = path.substring(0, 10);
    const end = path.substring(path.length - (maxLength - 13));
    return `${start}...${end}`;
}

const FileThumbnail = ({ path, deriveMunchieCandidate }: { path: string, deriveMunchieCandidate: any }) => {
    const [thumb, setThumb] = React.useState<string | null>(null);

    React.useEffect(() => {
        const fetchThumb = async () => {
            try {
                const candidate = deriveMunchieCandidate(path);
                if (!candidate) return;
                const resp = await fetch(`/models/${candidate}`);
                if (resp.ok) {
                    const data = await resp.json();
                    
                    // [FIX] Ensure the thumbnail path has the leading /models/ prefix
                    let rawThumb = data.userDefined?.thumbnail || data.thumbnail || (data.parsedImages && data.parsedImages[0]);
                    
                    // If it's a 'parsed:0' descriptor, resolve it to the actual path
                    if (typeof rawThumb === 'string' && rawThumb.startsWith('parsed:')) {
                        const idx = parseInt(rawThumb.split(':')[1]);
                        rawThumb = data.parsedImages?.[idx];
                    }

                    if (rawThumb) {
                        const finalPath = rawThumb.startsWith('/') ? rawThumb : `/models/${rawThumb}`;
                        setThumb(finalPath);
                    }
                }
            } catch (e) { /* silent fail */ }
        };
        fetchThumb();
    }, [path, deriveMunchieCandidate]);

    

    return (
        <div className="aspect-square w-full overflow-hidden rounded bg-muted/20 border border-border/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
            {thumb ? (
                <img 
                    src={thumb} 
                    alt="" 
                    className="h-full w-full object-cover transition-transform group-hover:scale-110 duration-500" 
                    onError={() => setThumb(null)} // Fallback if path is still broken
                />
            ) : (
                <Box className="h-5 w-5 text-muted-foreground/20" />
            )}
        </div>
    );
};

interface RelatedFilesSectionProps {
    isEditing: boolean;
    editedModel: Model | null;
    setEditedModel: React.Dispatch<React.SetStateAction<Model | null>>;
    setFocusRelatedIndex: (index: number) => void;
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
    handleViewDocument: (url: string) => void; // New Prop
}

export const RelatedFilesSection = ({
    isEditing,
    editedModel,
    setEditedModel,
    setFocusRelatedIndex,
    relatedVerifyStatus,
    setRelatedVerifyStatus,
    invalidRelated,
    currentModel,
    onModelUpdate,
    detailsViewportRef,
    triggerDownload,
    toast,
    deriveMunchieCandidate,
    availableRelatedMunchie,
    active3DFile,
    setActive3DFile,
    handleViewDocument
}: RelatedFilesSectionProps) => {

    const categorizeFiles = (files: string[]) => {
        const categories = {
            models: [] as string[],
            docs: [] as string[],
            gcode: [] as string[]
        };
    
        // 1. ALWAYS start the models list with the current main model
        if (currentModel.filePath) {
            categories.models.push(currentModel.filePath);
        }
    
        files.forEach((path) => {
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

    const filesToEdit = editedModel?.related_files ?? currentModel.related_files ?? [];

    if (isEditing) {
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

                <div className="space-y-3">
                    {filesToEdit.map((rf, idx) => (
                        <div key={`related-edit-${idx}`} className="flex items-center gap-2 group">
                            <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setEditedModel(prev => {
                                    const base = prev || currentModel;
                                    const arr = [...(base.related_files || [])];
                                    arr.splice(idx, 1);
                                    return { ...base, related_files: arr };
                                })}
                            >
                                <X className="h-4 w-4" />
                            </Button>

                            <Input
                                value={rf}
                                className="h-9 font-mono text-xs bg-background/50 border-border/40 focus-visible:ring-primary/20"
                                onChange={(e) => setEditedModel(prev => {
                                    const base = prev || currentModel;
                                    const arr = [...(base.related_files || [])];
                                    arr[idx] = e.target.value;
                                    return { ...base, related_files: arr };
                                })}
                            />

                            <Button
                                size="sm" variant="outline" className="h-9 min-w-[40px] px-2"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    setRelatedVerifyStatus(prev => ({ ...prev, [idx]: { loading: true } }));
                                    try {
                                        const resp = await fetch('/api/verify-file', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ path: rf })
                                        });
                                        const j = await resp.json();
                                        setRelatedVerifyStatus(prev => ({ ...prev, [idx]: { loading: false, ok: !!(j && j.success && j.exists) } }));
                                    } catch (err) {
                                        setRelatedVerifyStatus(prev => ({ ...prev, [idx]: { loading: false, ok: false } }));
                                    }
                                }}
                            >
                                {relatedVerifyStatus[idx]?.loading ? '...' : relatedVerifyStatus[idx]?.ok ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Ban className="h-4 w-4 text-destructive" />}
                            </Button>
                        </div>
                    ))}

                    <Button
                        variant="outline" size="sm" className="w-full h-9 border-dashed mt-2 text-[10px] font-black uppercase tracking-tighter"
                        onClick={() => setEditedModel(prev => {
                            const base = prev || currentModel;
                            const arr = [...(base.related_files || [])];
                            arr.push("");
                            setTimeout(() => setFocusRelatedIndex(arr.length - 1), 0);
                            return { ...base, related_files: arr };
                        })}
                    >
                        <Plus className="mr-2 h-3.5 w-3.5" /> Link_New_Entry
                    </Button>
                </div>
            </div>
        );
    }

    /* ==================== VIEW MODE ==================== */
    const categories = categorizeFiles(currentModel.related_files || []);

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
                        {categories.models.map((path, idx) => {
                            const isMainSource = currentModel.filePath === path;
                            const isActive = active3DFile === path;
                            return (
                                <div
                                    key={idx}
                                    className={`group relative p-2 rounded-xl border transition-all cursor-pointer ${isMainSource ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20 shadow-sm" : isActive ? "bg-accent border-primary/30" : "bg-card/40 border-border/40 hover:border-border"}`}
                                    onClick={() => handleJumpToModel(path)}
                                >
                                    <FileThumbnail path={path} deriveMunchieCandidate={deriveMunchieCandidate} />
                                    {isMainSource && (
                                        <div className="absolute top-3 left-3">
                                            <Badge className="h-4 px-1.5 text-[8px] font-black uppercase tracking-tighter bg-primary text-primary-foreground border-none shadow-sm">Source_File</Badge>
                                        </div>
                                    )}
                                    <div className="mt-2 px-1">
                                        <p className={`text-[10px] font-mono truncate ${isMainSource ? 'text-primary font-bold' : 'text-foreground/60'}`}>{path.split('/').pop()}</p>
                                    </div>
                                    <div className="absolute top-3 right-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            size="icon" variant="secondary" className="h-6 w-6 rounded-full shadow-md"
                                            onClick={(e) => { e.stopPropagation(); triggerDownload(path, e.nativeEvent as any, path.split('/').pop() || ''); }}
                                        >
                                            <Download className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
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
                                            <span className="text-[11px] truncate text-foreground/70 group-hover:text-foreground font-mono tracking-tight">
                                                {truncatePath(path, 60)}
                                            </span>

                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {isViewable && tabKey === 'docs' && (
                                                    <Button
                                                        size="icon" variant="ghost" className="h-7 w-7 text-primary/60 hover:text-primary hover:bg-primary/10"
                                                        onClick={() => handleViewDocument(`/models/${path}`)}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => triggerDownload(path, e.nativeEvent as any, 'file')}>
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