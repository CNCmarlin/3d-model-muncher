import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Model } from '../../types/model';

interface UseGcodeHandlerProps {
    currentModel: Model | null;
    onModelUpdate: (model: Model) => void;
}

export function useGcodeHandler({ currentModel, onModelUpdate }: UseGcodeHandlerProps) {
    const [isUploadingGcode, setIsUploadingGcode] = useState(false);
    const [isGcodeExpanded, setIsGcodeExpanded] = useState(false);
    const [gcodeOverwriteDialog, setGcodeOverwriteDialog] = useState<{ open: boolean; file: File | null; existingPath: string }>({
        open: false,
        file: null,
        existingPath: ''
    });
    const gcodeInputRef = useRef<HTMLInputElement>(null);

    const handleGcodeUpload = async (file: File, forceOverwrite = false) => {
        if (!currentModel?.filePath) {
            toast.error('Model file path is required');
            return;
        }

        setIsUploadingGcode(true);
        try {
            // Load config to get storage behavior settings
            const configResp = await fetch('/api/load-config');
            let storageMode = 'parse-only';
            let autoOverwrite = false;

            if (configResp.ok) {
                const configData = await configResp.json();
                storageMode = configData.config?.settings?.gcodeStorageBehavior || 'parse-only';
                autoOverwrite = configData.config?.settings?.gcodeOverwriteBehavior === 'overwrite';
            }

            // Create form data
            const formData = new FormData();
            formData.append('file', file);
            formData.append('modelFilePath', currentModel.filePath);
            // Send the actual model file path (from modelUrl) for G-code save location
            if (currentModel.modelUrl) {
                formData.append('modelFileUrl', currentModel.modelUrl);
            }
            formData.append('storageMode', storageMode);

            if (forceOverwrite || autoOverwrite) {
                formData.append('overwrite', 'true');
            }

            // Upload and parse
            const response = await fetch('/api/parse-gcode', {
                method: 'POST',
                body: formData
            });

            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                console.error('[G-code Upload] Failed to parse JSON:', parseError);
                toast.error('Server returned invalid response');
                return;
            }

            // Check for file exists prompt (can happen with 200 OK status)
            if (result.fileExists && !forceOverwrite) {
                setGcodeOverwriteDialog({
                    open: true,
                    file,
                    existingPath: result.existingPath || ''
                });
                return;
            }

            if (!response.ok) {
                console.error('[G-code Upload] Non-OK response:', response.status, result);
                toast.error(result.error || `Server error: ${response.status}`);
                return;
            }

            if (result.success && result.gcodeData) {
                // Build changes object for save-model API
                // Prefer ID over filePath to prevent accidental overwrites if path is wrong
                const changes: any = {
                    id: currentModel.id,
                    gcodeData: result.gcodeData,
                    // Legacy fields
                    printTime: result.gcodeData.printTime || currentModel.printTime,
                    filamentUsed: result.gcodeData.totalFilamentWeight || currentModel.filamentUsed
                };

                // Explicitly add printSettings to the changes so the UI updates immediately
                if (result.gcodeData.printSettings) {
                    changes.printSettings = {
                        ...(currentModel.printSettings || {}), // Keep existing
                        ...result.gcodeData.printSettings      // Overwrite with new
                    };
                }

                // If storage mode is save-and-link, add to related_files
                if (storageMode === 'save-and-link' && result.gcodeData.gcodeFilePath) {
                    const relatedFiles = Array.isArray(currentModel.related_files)
                        ? [...currentModel.related_files]
                        : [];

                    const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '');
                    const normalizedNewPath = normalizePath(result.gcodeData.gcodeFilePath);
                    const alreadyExists = relatedFiles.some(
                        (existing: string) => normalizePath(existing) === normalizedNewPath
                    );

                    if (!alreadyExists) {
                        relatedFiles.push(result.gcodeData.gcodeFilePath);
                        changes.related_files = relatedFiles;
                    }
                }

                // Save updated model
                const saveResp = await fetch('/api/save-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(changes)
                });

                if (saveResp.ok) {
                    toast.success('G-code parsed and saved successfully');
                    // Update the model in UI with the merged changes
                    const updatedModel = { ...currentModel, ...changes };
                    onModelUpdate(updatedModel);
                } else {
                    const saveError = await saveResp.json().catch(() => ({ error: 'Unknown error' }));
                    toast.error(`Failed to save G-code data: ${saveError.error || saveResp.statusText}`);
                }
            } else {
                console.error('[G-code Upload] Unexpected response:', { success: result.success, hasGcodeData: !!result.gcodeData });
                toast.error('Unexpected server response');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            toast.error(`Upload failed: ${errorMsg}`);
        } finally {
            setIsUploadingGcode(false);
            // Clear input
            if (gcodeInputRef.current) gcodeInputRef.current.value = '';
        }
    };

    const handleReanalyzeGcode = async (targetPath?: string) => {
        const path = targetPath || currentModel?.gcodeData?.gcodeFilePath;

        if (!path) {
            toast.error('No G-code file path found to analyze');
            return;
        }

        setIsUploadingGcode(true);
        // Toast loading state
        const toastId = toast.loading("Analyzing G-code...");

        try {
            const formData = new FormData();
            formData.append('modelFilePath', currentModel!.filePath); // ! verified by earlier check? No, need check.
            if (!currentModel?.filePath) throw new Error("Model path missing");

            formData.append('gcodeFilePath', path);
            formData.append('storageMode', 'parse-only');

            const response = await fetch('/api/parse-gcode', {
                method: 'POST',
                body: formData
            });

            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                toast.dismiss(toastId);
                toast.error('Server returned invalid response');
                return;
            }

            if (!response.ok) {
                toast.dismiss(toastId);
                toast.error(result.error || `Server error: ${response.status}`);
                return;
            }

            if (result.success && result.gcodeData) {
                const changes: any = {
                    id: currentModel!.id,
                    gcodeData: result.gcodeData,
                    printTime: result.gcodeData.printTime || currentModel!.printTime,
                    filamentUsed: result.gcodeData.totalFilamentWeight || currentModel!.filamentUsed
                };

                if (result.gcodeData.printSettings) {
                    changes.printSettings = {
                        ...(currentModel!.printSettings || {}),
                        ...result.gcodeData.printSettings
                    };
                }

                // Call save-model
                const saveResp = await fetch('/api/save-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(changes)
                });

                if (saveResp.ok) {
                    toast.dismiss(toastId);
                    toast.success('G-code analyzed and saved!');
                    const updatedModel = { ...currentModel!, ...changes };
                    onModelUpdate(updatedModel);
                } else {
                    const saveError = await saveResp.json().catch(() => ({ error: 'Unknown error' }));
                    toast.dismiss(toastId);
                    toast.error(`Failed to save G-code data: ${saveError.error || saveResp.statusText}`);
                }
            } else {
                toast.dismiss(toastId);
                toast.error(result.error || 'Failed to analyze G-code');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            toast.dismiss(toastId);
            toast.error(`Analysis failed: ${errorMsg}`);
        } finally {
            setIsUploadingGcode(false);
        }
    };

    const handleGcodeDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleGcodeDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const file = e.dataTransfer.files[0];
        if (file && (file.name.toLowerCase().endsWith('.gcode') || file.name.toLowerCase().endsWith('.gcode.3mf'))) {
            handleGcodeUpload(file);
        } else {
            toast.error('Please drop a .gcode or .gcode.3mf file');
        }
    };

    return {
        isUploadingGcode,
        isGcodeExpanded,
        setIsGcodeExpanded,
        gcodeOverwriteDialog,
        setGcodeOverwriteDialog,
        gcodeInputRef,
        handleGcodeUpload,
        handleReanalyzeGcode,
        handleGcodeDragOver,
        handleGcodeDrop
    };
}
