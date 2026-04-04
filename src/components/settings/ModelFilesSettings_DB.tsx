import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
    AlertTriangle,
    FolderOpen,
    Loader2,
    RotateCcw,
    RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ModelFolderInfo {
    id: string;
    name: string;
    primaryModel: string | null;
    convertedAt: string | null;
    modelCount: number;
    componentCount: number;
    missingThumbnails: number;
}

interface OrphanedComponent {
    id: string;
    name: string;
    modelUrl: string | null;
}

export function ModelFilesSettings_DB() {
    const [folders, setFolders] = useState<ModelFolderInfo[]>([]);
    const [orphans, setOrphans] = useState<OrphanedComponent[]>([]);
    const [loading, setLoading] = useState(true);
    const [revertingId, setRevertingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // GET /api/collections returns a plain array — filter client-side for isModelFolder
            const res = await fetch("/api/collections");
            const json = await res.json();
            // Handle both plain array and { collections: [...] } shapes
            const allCols: any[] = Array.isArray(json)
                ? json
                : (json.collections ?? json.data ?? []);
            const cols = allCols.filter((c: any) => c.isModelFolder === true);

            const folderInfos: ModelFolderInfo[] = cols.map((c) => ({
                id: c.id,
                name: c.name,
                primaryModel: c.primaryModelPath ?? null,
                convertedAt: c.convertedAt ?? null,
                modelCount: c.modelCount ?? c._count?.models ?? 0,
                componentCount: Math.max(0, (c.modelCount ?? c._count?.models ?? 1) - 1),
                missingThumbnails: 0,
            }));

            setFolders(folderInfos);

            // Fetch orphaned components: isComponent=true but their collection is NOT a model folder
            const orphanRes = await fetch("/api/models?isComponent=true&limit=100");
            const orphanJson = await orphanRes.json();
            const allComponents: any[] = orphanJson.models ?? orphanJson.data ?? [];
            const trueOrphans = allComponents.filter(
                (m) => !m.collection?.isModelFolder
            );
            setOrphans(
                trueOrphans.map((m) => ({
                    id: m.id,
                    name: m.name,
                    modelUrl: m.modelUrl,
                }))
            );
        } catch (e: any) {
            toast.error("Failed to load model file data: " + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRevert = async (collectionId: string, name: string) => {
        setRevertingId(collectionId);
        try {
            const res = await fetch(
                `/api/collections/${encodeURIComponent(collectionId)}/revert-to-collection`,
                { method: "POST", headers: { "Content-Type": "application/json" } }
            );
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Revert failed");
            toast.success(`"${name}" reverted to collection. ${json.restoredModelCount} models restored.`);
            await fetchData();
        } catch (e: any) {
            toast.error("Revert failed: " + e.message);
        } finally {
            setRevertingId(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Section A: Model Folders */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <FolderOpen className="h-5 w-5 text-primary" />
                            Model Folders
                        </CardTitle>
                        <CardDescription>
                            Collections that have been converted to model folders. Use Revert to undo
                            the conversion and restore all component models to full visibility.
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading model folders…
                        </div>
                    ) : folders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            No model folders found. Convert a collection using the collection card menu.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {folders.map((folder) => (
                                <div
                                    key={folder.id}
                                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 gap-4"
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <FolderOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm truncate">{folder.name}</p>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                                    {folder.modelCount} model{folder.modelCount !== 1 ? "s" : ""}
                                                </Badge>
                                                {folder.componentCount > 0 && (
                                                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                                        {folder.componentCount} component{folder.componentCount !== 1 ? "s" : ""}
                                                    </Badge>
                                                )}
                                                {folder.missingThumbnails > 0 && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] h-4 px-1.5 bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                                    >
                                                        {folder.missingThumbnails} missing thumb
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRevert(folder.id, folder.name)}
                                        disabled={revertingId === folder.id}
                                        className="shrink-0"
                                    >
                                        {revertingId === folder.id ? (
                                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                        ) : (
                                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                        )}
                                        Revert to Collection
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Separator />

            {/* Section B: Orphaned Components */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        Orphaned Component Models
                    </CardTitle>
                    <CardDescription>
                        Models marked as components but whose parent collection is no longer a model
                        folder. These are data inconsistencies — they are hidden but not attached to
                        a valid model folder. Reverting the parent folder should resolve these.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking…
                        </div>
                    ) : orphans.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm">
                            ✓ No orphaned components found. Database is consistent.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {orphans.map((o) => (
                                <div
                                    key={o.id}
                                    className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 gap-4"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate">{o.name}</p>
                                        {o.modelUrl && (
                                            <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                                                {o.modelUrl}
                                            </p>
                                        )}
                                    </div>
                                    <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
                                        orphaned
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
