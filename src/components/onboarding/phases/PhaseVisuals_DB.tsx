
import { GenerateThumbnailsDialog_DB } from "@/components/modals/GenerateThumbnailsDialog_DB";
import { AutoImportDialog_DB } from "@/components/shared/AutoImportDialog_DB";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCovers_db } from "@/hooks/settings/useCovers_db";
import { useThumbnails_db } from "@/hooks/settings/useThumbnails_db";
import { CheckCircle2, FolderOpen, Image as ImageIcon, Layers, Loader2 } from "lucide-react";
import { useState } from "react";

interface PhaseVisualsProps {
    onNext: () => void;
}

export function PhaseVisuals_DB({ }: PhaseVisualsProps) {
    const thumbnails = useThumbnails_db();
    const covers = useCovers_db();

    const [isAutoImportOpen, setIsAutoImportOpen] = useState(false);

    // Calculate percent for card display
    const thumbPercent = thumbnails.progress && thumbnails.progress.total > 0
        ? Math.round((thumbnails.progress.current / thumbnails.progress.total) * 100)
        : 0;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* 1. Thumbnails */}
            <div className="space-y-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <ImageIcon className="w-5 h-5 text-primary" />
                            Model Thumbnails
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Generate visual previews for your models.
                        </p>
                    </div>
                </div>

                <div
                    className={`p-4 border rounded-xl bg-card flex items-center justify-between transition-colors ${thumbnails.isGenerating ? 'border-primary/50 bg-primary/5' : ''}`}
                >
                    <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                            Generate Missing
                            {thumbnails.isGenerating && (
                                <span className="text-xs font-normal text-primary animate-pulse flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Running... {thumbnails.progress ? `${thumbnails.progress.current}/${thumbnails.progress.total}` : ''}
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {thumbnails.isGenerating
                                ? `Generating in background (${thumbPercent}%). Click 'View Status' to see details.`
                                : "Scans for 3MF embedded pngs or renders STL snapshots."}
                        </div>
                    </div>
                    <Button
                        variant={thumbnails.isGenerating ? "secondary" : "outline"}
                        onClick={() => thumbnails.setIsDialogOpen(true)}
                    >
                        {thumbnails.isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                View Status
                            </>
                        ) : (
                            <>
                                <ImageIcon className="mr-2 h-4 w-4" />
                                Generate
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <Separator />

            {/* 2. Collections (Auto Import) */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-primary" />
                        Organize Collections
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Turn your folders into browsable collections.
                    </p>
                </div>

                <div className="p-4 border rounded-xl bg-card flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="font-medium">Auto-Import</div>
                        <div className="text-xs text-muted-foreground">
                            Create collections compatible with your folder structure.
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setIsAutoImportOpen(true)}
                    >
                        <Layers className="mr-2 h-4 w-4" />
                        Import Collections
                    </Button>
                </div>
            </div>

            <Separator />

            {/* 3. Covers (Mosaic) */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        Collection Covers
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Generate nice-looking mosaics for your collections.
                    </p>
                </div>

                <div className="p-4 border rounded-xl bg-card flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="font-medium">Generate Mosaics</div>
                        <div className="text-xs text-muted-foreground">
                            Builds 2x2 grid images for collections with models.
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={covers.handleGenerateCovers}
                        disabled={covers.isGenerating}
                    >
                        {covers.isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                        Generate Covers
                    </Button>
                </div>
            </div>

            {/* Dialogs */}
            <GenerateThumbnailsDialog_DB
                isOpen={thumbnails.isDialogOpen}
                onClose={() => thumbnails.setIsDialogOpen(false)}
                onStart={thumbnails.handleStartGeneration}
                onStop={thumbnails.handleStopGeneration}
                isGenerating={thumbnails.isGenerating}
                results={thumbnails.results}
                progress={thumbnails.progress}
            />

            <AutoImportDialog_DB
                open={isAutoImportOpen}
                onOpenChange={setIsAutoImportOpen}
            />
        </div>
    );
}

// Left Panel Info
export function PhaseVisualsInfo() {
    return (
        <div className="space-y-6">
            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Connect
                </h3>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Personalize
                </h3>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs">3</span>
                    Secure
                </h3>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs">4</span>
                    Visuals
                </h3>
                <p className="text-sm text-muted-foreground">
                    Finishing touches! Get your library looking organized, beautiful, and professional.
                </p>
                <div className="mt-4 pt-4 border-t border-border/50">
                    <h4 className="text-xs font-semibold mb-1">Recommended Order:</h4>
                    <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                        <li>Generate Thumbnails</li>
                        <li>Import Collections</li>
                        <li>Generate Covers (needs models & collections)</li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
