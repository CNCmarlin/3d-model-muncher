
import { Collection } from '@/types/collection_db';
import { Model } from '@/types/model_db';
import { useState } from 'react';
import { toast } from 'sonner';

interface UseGlobalDialogsProps {
    collections: Collection[];
    models: Model[]; // Used for smart inference
    refreshModels: () => Promise<Model[] | void>;
    refreshCollections: () => Promise<void>;
    selectedModelIds: string[];
    setSelectedModelIds: (ids: string[]) => void;
    deleteModels: (ids: string[], includeFiles: boolean) => Promise<boolean>; // Abstracted delete action
    // Config for Move Confirmation
    appConfig: any; // Using any to avoid circular deps if needed, or import AppConfig
    updateConfig: (config: any) => void;
}

export function useGlobalDialogs_db({
    collections,
    models,
    refreshModels,
    refreshCollections,
    selectedModelIds,
    setSelectedModelIds,
    deleteModels,
    appConfig,
    updateConfig
}: UseGlobalDialogsProps) {

    // --- Upload Dialog ---
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [uploadTargetFolder, setUploadTargetFolder] = useState<string | undefined>(undefined);
    const [uploadTargetCollectionId, setUploadTargetCollectionId] = useState<string | undefined>(undefined);

    const openUpload = (activeCollection?: Collection | null) => {
        if (activeCollection && activeCollection.id) {
            setUploadTargetCollectionId(activeCollection.id);
            // We can optionally infer a default folder path if it has one, but ID is enough for the dropdown
            setUploadTargetFolder(activeCollection.pathHash ? atob(activeCollection.pathHash) : undefined);
        } else {
            setUploadTargetFolder(undefined);
            setUploadTargetCollectionId(undefined);
        }
        setIsUploadDialogOpen(true);
    };

    const onUploadComplete = () => {
        refreshModels();
    };

    // --- Import Dialog ---
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importTargetCollectionId, setImportTargetCollectionId] = useState<string | undefined>(undefined);
    const [importTargetFolder, setImportTargetFolder] = useState<string | undefined>(undefined);

    const openImport = (collectionId?: string) => {
        setImportTargetCollectionId(collectionId);

        let inferredFolder: string | undefined = undefined;

        if (collectionId) {
            const col = collections.find(c => c.id === collectionId);

            // Helper to extract base folder from a model
            // modelUrl format: /models/Collection/Model/file.stl → strip prefix → Collection/Model/file.stl
            const getFolderFromModel = (m: Model) => {
                const relPath = m.modelUrl?.replace(/^\/?models\//, '');
                if (!relPath) return null;
                const lastSlash = Math.max(relPath.lastIndexOf('/'), relPath.lastIndexOf('\\'));
                if (lastSlash <= 0) return ''; // Root

                let folder = relPath.substring(0, lastSlash);

                // If Project Root, step up one level to get the 'Apparent' parent folder
                if ((m.metadata as any)?.isMainModel) {
                    const parentSlash = Math.max(folder.lastIndexOf('/'), folder.lastIndexOf('\\'));
                    folder = parentSlash > 0 ? folder.substring(0, parentSlash) : '';
                }
                return folder;
            };

            if (col) {
                // 1. Try Direct Models
                if (col.modelIds && col.modelIds.length > 0) {
                    const firstModelId = col.modelIds[0];
                    const model = models.find(m => m.id === firstModelId);
                    if (model) {
                        const directFolder = getFolderFromModel(model);
                        if (directFolder !== null) inferredFolder = directFolder;
                    }
                }
                // 2. Try Child Collections (go one level deeper, then step back up)
                else if (col.childCollectionIds && col.childCollectionIds.length > 0) {
                    const firstChildId = col.childCollectionIds[0];
                    const childCol = collections.find(c => c.id === firstChildId);
                    if (childCol && childCol.modelIds && childCol.modelIds.length > 0) {
                        const grandChildId = childCol.modelIds[0];
                        const grandChildModel = models.find(m => m.id === grandChildId);
                        if (grandChildModel) {
                            const childFolder = getFolderFromModel(grandChildModel);
                            if (childFolder) {
                                // We found the folder for the CHILD collection (e.g. ".../ADXL/Mounts")
                                // Since we are in the PARENT collection, we want one level up (e.g. ".../ADXL")
                                const parentSlash = Math.max(childFolder.lastIndexOf('/'), childFolder.lastIndexOf('\\'));
                                inferredFolder = parentSlash > 0 ? childFolder.substring(0, parentSlash) : '';
                            }
                        }
                    }
                }
            }
        }

        // Final fallback
        if (inferredFolder === undefined) inferredFolder = 'imported';

        setImportTargetFolder(inferredFolder);
        setIsImportOpen(true);
    };

    const onImportComplete = () => {
        refreshModels();
        refreshCollections();
    };

    // --- Donation Dialog ---
    const [isDonationDialogOpen, setIsDonationDialogOpen] = useState(false);
    const openDonation = () => setIsDonationDialogOpen(true);

    // --- Delete Dialog ---
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [includeThreeMfFiles, setIncludeThreeMfFiles] = useState(false);

    // --- Move Confirmation Dialog ---
    const [isMoveConfirmOpen, setIsMoveConfirmOpen] = useState(false);
    const [moveConfirmPromise, setMoveConfirmPromise] = useState<{ resolve: (value: boolean) => void } | null>(null);

    const openMoveConfirmation = (): Promise<boolean> => {
        // 1. Check preference first
        if (appConfig?.settings?.alwaysMoveFiles === true) {
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            setMoveConfirmPromise({ resolve });
            setIsMoveConfirmOpen(true);
        });
    };

    const handleMoveConfirm = (moveFiles: boolean, dontAskAgain: boolean) => {
        setIsMoveConfirmOpen(false);
        if (moveConfirmPromise) {
            moveConfirmPromise.resolve(moveFiles);
            setMoveConfirmPromise(null);
        }

        if (dontAskAgain && moveFiles) {
            const newConfig = { ...appConfig };
            if (!newConfig.settings) newConfig.settings = {};
            newConfig.settings.alwaysMoveFiles = true;
            updateConfig(newConfig);
            toast.success("Preference saved: Files will always be moved in the future.");
        }
    };

    const openDelete = (ids?: string[]) => {
        if (ids && ids.length > 0) {
            setSelectedModelIds(ids);
        } else if (selectedModelIds.length === 0) {
            toast("No models selected", { description: "Please select models first before deleting" });
            return;
        }
        setIncludeThreeMfFiles(false);
        setIsDeleteDialogOpen(true);
    };

    const handleBulkDelete = async () => {
        if (selectedModelIds.length === 0) return;
        setIsDeleteDialogOpen(false); // Optimistically close

        const success = await deleteModels(selectedModelIds, includeThreeMfFiles);
        if (success) {
            setSelectedModelIds([]); // Clear selection on success
        }
    };


    return {
        // Actions (to be used by UI)
        openUpload,
        openImport,
        openDonation,
        openDelete,
        openMoveConfirmation,

        // Props for GlobalDialogs
        dialogProps: {
            isUploadDialogOpen,
            setIsUploadDialogOpen,
            uploadTargetFolder,
            setUploadTargetFolder,
            uploadTargetCollectionId,
            setUploadTargetCollectionId,
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

            isDeleteDialogOpen,
            setIsDeleteDialogOpen,
            handleBulkDelete,
            selectedModelCount: selectedModelIds.length,
            includeThreeMfFiles,
            setIncludeThreeMfFiles,

            isMoveConfirmOpen,
            setIsMoveConfirmOpen,
            handleMoveConfirm
        }
    };
}
