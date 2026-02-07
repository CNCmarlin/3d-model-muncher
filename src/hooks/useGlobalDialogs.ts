
import { useState } from 'react';
import { toast } from 'sonner';
import { Collection } from '../types/collection';
import { Model } from '../types/model';

interface UseGlobalDialogsProps {
    collections: Collection[];
    models: Model[]; // Used for smart inference
    refreshModels: () => Promise<Model[] | void>;
    refreshCollections: () => Promise<void>;
    selectedModelIds: string[];
    setSelectedModelIds: (ids: string[]) => void;
    deleteModels: (ids: string[], includeFiles: boolean) => Promise<boolean>; // Abstracted delete action
}

export function useGlobalDialogs({
    collections,
    models,
    refreshModels,
    refreshCollections,
    selectedModelIds,
    setSelectedModelIds,
    deleteModels
}: UseGlobalDialogsProps) {

    // --- Upload Dialog ---
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [uploadTargetFolder, setUploadTargetFolder] = useState<string | undefined>(undefined);
    const [uploadTargetCollectionName, setUploadTargetCollectionName] = useState<string | undefined>(undefined);

    const openUpload = (activeCollection?: Collection | null) => {
        if (activeCollection && activeCollection.id.startsWith('col_')) {
            try {
                const b64 = activeCollection.id.substring(4);
                const relPath = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
                setUploadTargetFolder(relPath);
                setUploadTargetCollectionName(activeCollection.name);
            } catch (e) {
                console.warn("Could not decode collection path", e);
                setUploadTargetFolder(undefined);
                setUploadTargetCollectionName(undefined);
            }
        } else {
            setUploadTargetFolder(undefined);
            setUploadTargetCollectionName(undefined);
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
            if (col && col.modelIds && col.modelIds.length > 0) {
                const firstModelId = col.modelIds[0];
                const representativeModel = models.find(m => m.id === firstModelId);

                if (representativeModel && representativeModel.filePath) {
                    const lastSlash = Math.max(
                        representativeModel.filePath.lastIndexOf('/'),
                        representativeModel.filePath.lastIndexOf('\\')
                    );
                    if (lastSlash > 0) {
                        inferredFolder = representativeModel.filePath.substring(0, lastSlash);
                    } else {
                        inferredFolder = 'imported';
                    }
                }
            }
        }
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

        // Props for GlobalDialogs
        dialogProps: {
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

            isDeleteDialogOpen,
            setIsDeleteDialogOpen,
            handleBulkDelete,
            selectedModelCount: selectedModelIds.length,
            includeThreeMfFiles,
            setIncludeThreeMfFiles,
        }
    };
}
