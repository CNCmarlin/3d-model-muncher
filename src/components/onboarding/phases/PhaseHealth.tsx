
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useConfig } from "@/context/ConfigContext";
import { Archive, Check, FileCheck, HeartPulse, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PhaseHealthProps {
    onNext: () => void;
}

export function PhaseHealth({ }: PhaseHealthProps) {
    const { } = useConfig();

    // Integrity State
    const [isHashChecking, setIsHashChecking] = useState(false);
    const [hashCheckResult, setHashCheckResult] = useState<{ verified: number; corrupted: number } | null>(null);

    // Backup State
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);

    // Healer State
    const [isHealing, setIsHealing] = useState(false);
    const [isPreviewingHeal, setIsPreviewingHeal] = useState(false);
    const [healPreviewReport, setHealPreviewReport] = useState<any>(null);
    const [isHealDialogOpen, setIsHealDialogOpen] = useState(false);

    // --- Actions ---

    const handleRunHashCheck = async () => {
        setIsHashChecking(true);
        setHashCheckResult(null);
        try {
            // Check both 3mf and stl
            let totalVerified = 0;
            let totalCorrupted = 0;

            for (const type of ['3mf', 'stl']) {
                const res = await fetch('/api/hash-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileType: type })
                });
                const data = await res.json();
                if (data.success && data.results) {
                    data.results.forEach((r: any) => {
                        if (r.status === 'ok') totalVerified++;
                        else totalCorrupted++;
                    });
                }
            }
            setHashCheckResult({ verified: totalVerified, corrupted: totalCorrupted });
            toast.success(`Scan complete: ${totalVerified} verified, ${totalCorrupted} issues.`);
        } catch (e) {
            toast.error("Hash check failed");
        } finally {
            setIsHashChecking(false);
        }
    };

    const handleCreateBackup = async () => {
        setIsCreatingBackup(true);
        try {
            const response = await fetch('/api/backup-munchie-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) throw new Error('Failed');

            // Trigger download
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `munchie-backup-onboarding.gz`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success("Backup downloaded successfully!");
        } catch (error) {
            toast.error("Backup failed");
        } finally {
            setIsCreatingBackup(false);
        }
    };

    const handleRunHealPreview = async () => {
        setIsPreviewingHeal(true);
        setHealPreviewReport(null);
        try {
            const response = await fetch('/api/admin/library-heal-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ thumbnailStrategy: 'prefer-embedded' })
            });
            const data = await response.json();
            if (data.success) {
                setHealPreviewReport(data.previewResults);
                setIsHealDialogOpen(true);
            } else {
                toast.error(data.error || "Failed to generate preview");
            }
        } catch (e) {
            toast.error("Network error");
        } finally {
            setIsPreviewingHeal(false);
        }
    };

    const handleConfirmHeal = async () => {
        setIsHealing(true);
        setIsHealDialogOpen(false);
        try {
            const response = await fetch('/api/admin/library-heal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dryRun: false,
                    thumbnailStrategy: 'prefer-embedded'
                })
            });
            const data = await response.json();
            if (data.success) {
                toast.success(data.message);
            } else {
                toast.error(data.error || "Heal operation failed");
            }
        } catch (error) {
            toast.error("Critical failure during heal execution");
        } finally {
            setIsHealing(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. Integrity Check */}
            <div className="space-y-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-primary" />
                            Integrity Check
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Scan your library for file issues and inconsistencies.
                        </p>
                    </div>
                </div>

                <div className="p-4 border rounded-xl bg-card flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="font-medium">Run Hash Check</div>
                        <div className="text-xs text-muted-foreground">
                            Verifies that database records match actual files.
                        </div>
                    </div>
                    <Button
                        variant={hashCheckResult ? "outline" : "default"}
                        onClick={handleRunHashCheck}
                        disabled={isHashChecking}
                    >
                        {isHashChecking ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : hashCheckResult ? (
                            <Check className="mr-2 h-4 w-4 text-green-600" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        {isHashChecking ? "Scanning..." : hashCheckResult ? "Re-Scan" : "Scan Library"}
                    </Button>
                </div>

                {hashCheckResult && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-3 bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900 rounded-lg">
                            <span className="block font-bold text-green-600">{hashCheckResult.verified}</span>
                            <span className="text-muted-foreground">Verified Files</span>
                        </div>
                        <div className={`p-3 rounded-lg border ${hashCheckResult.corrupted > 0 ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900' : 'bg-muted/50 border-border'}`}>
                            <span className={`block font-bold ${hashCheckResult.corrupted > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {hashCheckResult.corrupted}
                            </span>
                            <span className="text-muted-foreground">Issues Found</span>
                        </div>
                    </div>
                )}
            </div>

            <Separator />

            {/* 2. The Healer (Added Here) */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <HeartPulse className="w-5 h-5 text-primary" />
                        The Healer
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Fixes naming issues and organizes your files.
                        <strong> Recommended</strong> for long-term health.
                    </p>
                </div>

                <div className="p-4 border rounded-xl bg-card space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <div className="font-medium">Analyze Library</div>
                            <div className="text-xs text-muted-foreground">
                                Fast fixes for filenames and organization.
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={handleRunHealPreview}
                            disabled={isPreviewingHeal || isHealing}
                        >
                            {isPreviewingHeal ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <HeartPulse className="mr-2 h-4 w-4" />}
                            Analyze
                        </Button>
                    </div>
                </div>
            </div>

            <Separator />

            {/* 3. Backup */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Archive className="w-5 h-5 text-primary" />
                        Backup
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create an initial Restore Point for your library metadata.
                    </p>
                </div>

                <div className="p-4 border rounded-xl bg-card flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="font-medium">Create Backup</div>
                        <div className="text-xs text-muted-foreground">
                            Saves all .json metadata files.
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={handleCreateBackup}
                        disabled={isCreatingBackup}
                    >
                        {isCreatingBackup ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                        Backup Now
                    </Button>
                </div>
            </div>

            {/* Heal Dialog */}
            <Dialog open={isHealDialogOpen} onOpenChange={setIsHealDialogOpen}>
                <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden">
                    <div className="p-6 pb-0">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-primary" />
                                Library Heal Preview
                            </DialogTitle>
                            <DialogDescription>
                                The following changes are proposed based on strict naming rules.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="flex-1 min-h-0 px-6 my-4">
                        <div className="h-full border rounded-md bg-muted/20 overflow-hidden">
                            <ScrollArea className="h-full w-full">
                                <div className="p-4 space-y-2">
                                    {healPreviewReport?.details?.map((item: any, idx: number) => (
                                        <div key={idx} className="text-xs border-b pb-2 mb-2">
                                            <div className="font-semibold">{item.model}</div>
                                            <div className="text-muted-foreground pl-2">
                                                {item.additions.map((a: string, i: number) => <div key={i} className="text-green-600">+ {a}</div>)}
                                                {item.deletions.map((d: string, i: number) => <div key={i} className="text-red-600">- {d}</div>)}
                                                {item.modifications?.map((m: string, i: number) => <div key={i} className="text-amber-600">~ {m}</div>)}
                                            </div>
                                        </div>
                                    ))}
                                    {(!healPreviewReport?.details?.length) && (
                                        <div className="text-center py-10 text-muted-foreground">No issues found!</div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>

                    <div className="p-6 pt-0">
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsHealDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleConfirmHeal}
                                disabled={isHealing || !healPreviewReport?.details?.length}
                            >
                                {isHealing ? "Healing..." : "Apply Changes"}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Left Panel Info
export function PhaseHealthInfo() {
    return (
        <div className="space-y-6">
            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    Connect
                </h3>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    Personalize
                </h3>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs">3</span>
                    Secure
                </h3>
                <p className="text-sm text-muted-foreground">
                    Scanning ensures your files are safe and match the database.
                </p>
                <div className="mt-4 pt-4 border-t border-border/50">
                    <h4 className="text-xs font-semibold mb-1">Tools:</h4>
                    <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                        <li>Integrity Check (File Sync)</li>
                        <li>The Healer (Fix Organization)</li>
                        <li>Backup (Safety Net)</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
