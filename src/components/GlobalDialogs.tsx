
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Dispatch, SetStateAction, useState } from 'react';
import { DonationDialog } from '@/components/DonationDialog';
import { ModelUploadDialog } from '@/components/models/ModelUploadDialog';
import { ThingiverseImportDialog } from '@/components/ThingiverseImportDialog';

interface GlobalDialogsProps {
    // Release Notes
    isReleaseNotesOpen: boolean;
    dontShowReleaseNotes: boolean;
    setDontShowReleaseNotes: (v: boolean) => void;
    closeReleaseNotes: (dontShow: boolean) => void;

    // Delete Confirmation
    isDeleteDialogOpen: boolean;
    setIsDeleteDialogOpen: (v: boolean) => void;
    handleBulkDelete: () => Promise<void>;
    selectedModelCount: number;
    includeThreeMfFiles: boolean;
    setIncludeThreeMfFiles: (v: boolean) => void;

    // Upload
    isUploadDialogOpen: boolean;
    setIsUploadDialogOpen: (v: boolean) => void;
    uploadTargetFolder?: string;
    setUploadTargetFolder: (v: string | undefined) => void;
    uploadTargetCollectionName?: string;
    setUploadTargetCollectionName: (v: string | undefined) => void;
    onUploadComplete: () => void;

    // Import
    isImportOpen: boolean;
    setIsImportOpen: (v: boolean) => void;
    importTargetCollectionId?: string;
    setImportTargetCollectionId: Dispatch<SetStateAction<string | undefined>>;
    importTargetFolder?: string;
    setImportTargetFolder: Dispatch<SetStateAction<string | undefined>>;
    onImportComplete: () => void;

    isDonationDialogOpen: boolean;
    setIsDonationDialogOpen: (v: boolean) => void;

    // Move Confirmation
    isMoveConfirmOpen?: boolean;
    setIsMoveConfirmOpen?: (v: boolean) => void;
    handleMoveConfirm?: (moveFiles: boolean, dontAskAgain: boolean) => void;
}

export function GlobalDialogs({
    isReleaseNotesOpen,
    dontShowReleaseNotes,
    setDontShowReleaseNotes,
    closeReleaseNotes,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    handleBulkDelete,
    selectedModelCount,
    includeThreeMfFiles,
    setIncludeThreeMfFiles,
    isUploadDialogOpen,
    setIsUploadDialogOpen,
    uploadTargetFolder,
    setUploadTargetFolder,
    uploadTargetCollectionName,
    setUploadTargetCollectionName,
    onUploadComplete,
    isImportOpen,
    setIsImportOpen,
    importTargetCollectionId,
    setImportTargetCollectionId,
    importTargetFolder,
    setImportTargetFolder,
    onImportComplete,
    isDonationDialogOpen,
    setIsDonationDialogOpen,
    isMoveConfirmOpen,
    setIsMoveConfirmOpen,
    handleMoveConfirm
}: GlobalDialogsProps) {
    // Local state for the checkbox in the confirmation dialog
    const [dontAskMove, setDontAskMove] = useState(false);

    return (
        <>
            {/* Thingiverse Import */}
            <ThingiverseImportDialog
                isOpen={isImportOpen}
                onClose={() => {
                    setIsImportOpen(false);
                    setImportTargetCollectionId(undefined);
                    setImportTargetFolder(undefined);
                }}
                defaultCollectionId={importTargetCollectionId}
                defaultFolder={importTargetFolder}
                onImportComplete={onImportComplete}
            />

            {/* Donation */}
            <DonationDialog
                isOpen={isDonationDialogOpen}
                onClose={() => setIsDonationDialogOpen(false)}
            />

            {/* Release Notes */}
            <AlertDialog open={isReleaseNotesOpen} onOpenChange={(open) => { if (!open) closeReleaseNotes(dontShowReleaseNotes); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>What's new in this version</AlertDialogTitle>
                        <AlertDialogDescription>
                            Thanks for updating! Here are a few notable changes in the latest release:
                        </AlertDialogDescription>

                        <div className="mt-2 text-sm">
                            <h3 className="text-lg font-semibold">v0.16.0 - The Features & Style Update</h3>
                            <ul className="list-disc pl-5 list-outside mb-4 space-y-2 mt-2">
                                <li><strong>🎨 Dynamic Theme Engine</strong> - Pick any primary color in Settings, and the app now mathematically generates a perfect, accessible Dark and Light theme to match.</li>
                                <li><strong>🚀 Docker Architecture Upgrade</strong> - Migrated from Alpine to Debian Slim. This fixes the persistent 'Context Lost' WebGL crashes and enables native support for complex 3MF texture parsing.</li>
                                <li><strong>🛑 Thumbnail Cancellation</strong> - Added a 'Stop' button to the thumbnail generator. You can now safely abort long-running rendering jobs without restarting the server.</li>
                                <li><strong>📂 Nested Collections Editor</strong> - Manage your library organization directly from the 'All Models' view with the new nested collection editor.</li>
                                <li><strong>✨ UI Polish</strong> - Light mode has been remastered with softer backgrounds and improved contrast for better readability.</li>
                            </ul>
                        </div>

                        <div className="space-y-3 my-4 mb-4 mt-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="dont-show-release-notes"
                                    checked={dontShowReleaseNotes}
                                    onCheckedChange={(v) => setDontShowReleaseNotes(Boolean(v))}
                                />
                                <label
                                    htmlFor="dont-show-release-notes"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Do not show these notes again for this version
                                </label>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <div className="flex-1">
                            <a
                                href="https://github.com/robsturgill/3d-model-muncher/blob/main/CHANGELOG.md"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline"
                            >
                                View full changelog on GitHub
                            </a>
                        </div>
                        <AlertDialogAction onClick={() => { closeReleaseNotes(dontShowReleaseNotes); }}>Close</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Confirmation */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Models</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete {selectedModelCount} model{selectedModelCount !== 1 ? 's' : ''}?
                            <br /><br />
                            <strong>This action cannot be undone.</strong>
                        </AlertDialogDescription>
                        <div className="space-y-3 my-4 mb-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="include-3mf"
                                    checked={includeThreeMfFiles}
                                    onCheckedChange={(v) => setIncludeThreeMfFiles(Boolean(v))}
                                />
                                <label
                                    htmlFor="include-3mf"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Include .3mf and .stl files (3D model files) when deleting
                                </label>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {includeThreeMfFiles ? 'Delete All Files' : 'Delete Metadata Only'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Upload Dialog */}
            <ModelUploadDialog
                isOpen={isUploadDialogOpen}
                onClose={() => {
                    setIsUploadDialogOpen(false)
                    setUploadTargetFolder(undefined);
                    setUploadTargetCollectionName(undefined);
                }}
                onUploaded={onUploadComplete}
                initialFolder={uploadTargetFolder}
                initialCollectionId={uploadTargetCollectionName}
            />

            {/* Move Confirmation Dialog */}
            {isMoveConfirmOpen && setIsMoveConfirmOpen && handleMoveConfirm && (
                <AlertDialog open={isMoveConfirmOpen} onOpenChange={setIsMoveConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Move Files on Disk?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You are changing the collection of these models. Do you want to physically move the files on the disk to match the new collection structure?
                                <br /><br />
                                <strong>Note:</strong> Used images and other related files inside the model's folder will also be moved.
                            </AlertDialogDescription>
                            <div className="space-y-3 my-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="dont-ask-move"
                                        checked={dontAskMove}
                                        onCheckedChange={(v) => setDontAskMove(Boolean(v))}
                                    />
                                    <label
                                        htmlFor="dont-ask-move"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Do not ask again (Always move files)
                                    </label>
                                </div>
                            </div>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => handleMoveConfirm(false, dontAskMove)}>
                                No, Metadata Only
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleMoveConfirm(true, dontAskMove)}>
                                Yes, Move Files
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
}
