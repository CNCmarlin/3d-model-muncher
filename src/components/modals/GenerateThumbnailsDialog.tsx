
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

interface GenerationResults {
    success: boolean;
    processed: number;
    skipped: number;
    errors: { id: string; error: string }[];
    aborted?: boolean;
}

interface GenerateThumbnailsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onStart: (options: { force: boolean; skipEmbedded: boolean }) => void;
    onStop: () => void;
    isGenerating: boolean;
    results: GenerationResults | null;
    progress: { total: number; current: number; status: string } | null;
}

export function GenerateThumbnailsDialog({ isOpen, onClose, onStart, onStop, isGenerating, results, progress }: GenerateThumbnailsDialogProps) {
    const [force, setForce] = useState(false);
    const [skipEmbedded, setSkipEmbedded] = useState(true);

    const handleStart = () => {
        onStart({ force, skipEmbedded });
    };

    // calculate percent
    const percent = progress && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Generate Missing Thumbnails</DialogTitle>
                    <DialogDescription>
                        {isGenerating
                            ? "Generating thumbnails in the background..."
                            : results
                                ? "Generation Complete"
                                : "Create clean PNG snapshots for models that don't have them."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* STATE: GENERATING */}
                    {isGenerating && (
                        <div className="flex flex-col items-center justify-center py-4 space-y-6">
                            <div className="w-full space-y-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Processing...</span>
                                    <span>{progress ? `${progress.current} / ${progress.total}` : 'Initializing...'}</span>
                                </div>
                                <Progress value={percent} className="h-2" />
                            </div>

                            <div className="flex flex-col items-center gap-2 text-center">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground animate-pulse">
                                    {progress?.status === 'scanning' ? 'Scanning library...' : 'Rendering snapshots...'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    You can close this window. The process will continue in the background.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* STATE: RESULTS (COMPLETE) */}
                    {!isGenerating && results && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg border border-green-200 dark:border-green-800">
                                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-600 dark:text-green-400" />
                                    <div className="text-xl font-bold text-green-700 dark:text-green-300">{results.processed}</div>
                                    <div className="text-xs text-green-600 dark:text-green-400">Processed</div>
                                </div>
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <Info className="w-5 h-5 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
                                    <div className="text-xl font-bold text-blue-700 dark:text-blue-300">{results.skipped}</div>
                                    <div className="text-xs text-blue-600 dark:text-blue-400">Skipped</div>
                                </div>
                                <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg border border-red-200 dark:border-red-800">
                                    <XCircle className="w-5 h-5 mx-auto mb-1 text-red-600 dark:text-red-400" />
                                    <div className="text-xl font-bold text-red-700 dark:text-red-300">{results.errors.length}</div>
                                    <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
                                </div>
                            </div>

                            {results.errors.length > 0 && (
                                <div className="mt-4 border rounded-md p-2 bg-muted/30">
                                    <p className="text-xs font-semibold mb-2 px-1">Error Log:</p>
                                    <div className="max-h-32 overflow-y-auto text-xs font-mono space-y-1">
                                        {results.errors.map((err, i) => (
                                            <div key={i} className="text-destructive">
                                                <span className="opacity-70">{err.id.substring(0, 8)}:</span> {err.error}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {results.aborted && (
                                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs rounded border border-amber-200 dark:border-amber-800">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>Process was stopped by user.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STATE: IDLE (OPTIONS) */}
                    {!isGenerating && !results && (
                        <div className="space-y-4">
                            {/* Info Box */}
                            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 flex gap-3">
                                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="text-sm text-blue-800 dark:text-blue-300">
                                    <p className="font-medium mb-1">How it works</p>
                                    <p>
                                        The server will load each model file and render a snapshot remotely.
                                        This runs in the background but uses significant CPU.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Skip Embedded Option */}
                                <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-muted/50 transition-colors">
                                    <Checkbox
                                        id="skip-embedded"
                                        checked={skipEmbedded}
                                        onCheckedChange={(checked) => setSkipEmbedded(checked as boolean)}
                                    />
                                    <div className="space-y-1 leading-none">
                                        <Label
                                            htmlFor="skip-embedded"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                            Skip files with embedded thumbnails
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            If a 3MF file already has an internal thumbnail, use that instead of rendering a new one.
                                            <br />
                                            <span className="italic mt-1 block text-amber-600 dark:text-amber-500">
                                                * STL files do not support embedded thumbnails and will always be processed if missing.
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                {/* Force Option */}
                                <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 bg-muted/20">
                                    <Checkbox
                                        id="force-regenerate"
                                        checked={force}
                                        onCheckedChange={(checked) => {
                                            setForce(checked as boolean);
                                            if (checked) setSkipEmbedded(false); // Can't skip if forcing!
                                        }}
                                    />
                                    <div className="space-y-1 leading-none">
                                        <Label
                                            htmlFor="force-regenerate"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                            Force regenerate ALL thumbnails
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            Overwrite existing thumbnails even if they already exist.
                                            <span className="text-destructive block mt-1">
                                                Warning: This ignores "Skip embedded" and re-renders everything.
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {force && (
                                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs rounded border border-amber-200 dark:border-amber-800">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>This will take a long time and consume high CPU.</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    {isGenerating ? (
                        <>
                            <Button variant="outline" onClick={onClose}>Run in Background</Button>
                            <Button variant="destructive" onClick={onStop}>Stop Generation</Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose}>
                                {results ? "Close" : "Cancel"}
                            </Button>
                            {!results && (
                                <Button onClick={handleStart}>
                                    {force ? 'Regenerate All' : 'Start Generation'}
                                </Button>
                            )}
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
