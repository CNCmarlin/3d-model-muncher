import { Model, TagInfo } from '@/types/model';
import { useState } from 'react';
import { toast } from 'sonner';

interface UseTagManagerProps {
    models: Model[];
    onModelsUpdate: (models: Model[]) => void;
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
    setStatusMessage: (msg: string) => void;
}

export function useTagManager_db({ models, onModelsUpdate, setSaveStatus, setStatusMessage }: UseTagManagerProps) {
    const [selectedTag, setSelectedTag] = useState<TagInfo | null>(null);
    const [viewTagModels, setViewTagModels] = useState<TagInfo | null>(null);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [renameTagValue, setRenameTagValue] = useState('');
    const [tagSearchTerm, setTagSearchTerm] = useState('');

    const startRenameTag = (tag: TagInfo) => {
        setSelectedTag(tag);
        setRenameTagValue(tag.name);
        setIsRenameDialogOpen(true);
    };

    const handleRenameTag = async (oldTag: string, newTag: string) => {
        if (!newTag.trim() || oldTag === newTag.trim()) return;

        setSaveStatus('saving');
        setStatusMessage(`Renaming tag "${oldTag}" to "${newTag.trim()}"...`);

        const updatedModels = models.map(model => ({
            ...model,
            tags: (model.tags || []).map(tag => tag === oldTag ? newTag.trim() : tag)
        }));

        // Save each updated model to its JSON file
        let saveErrors = 0;
        for (const model of updatedModels) {
            // Only save models that had the tag changed
            const originalModel = models.find(m => m.id === model.id);
            if (originalModel && (originalModel.tags || []).includes(oldTag)) {
                try {
                    let filePath;
                    if (model.modelUrl) {
                        // FIX: Pass relative path and let server resolve extensions
                        filePath = model.modelUrl.replace(/^\/?models\//, '');
                    } else if (model.filePath) {
                        filePath = model.filePath;
                    } else {
                        console.error('No file path available for model:', model.name);
                        saveErrors++;
                        continue;
                    }

                    console.log(`[TagManager] Renaming tag "${oldTag}" to "${newTag}" for model ${model.id}. File: ${filePath}`);

                    const response = await fetch('/api/save-model', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filePath,
                            id: model.id,
                            tags: model.tags
                        })
                    });

                    const result = await response.json();
                    if (!result.success) {
                        console.error('Failed to save model:', model.name, result.error);
                        saveErrors++;
                    }
                } catch (error) {
                    console.error('Error saving model:', model.name, error);
                    saveErrors++;
                }
            }
        }

        // Update the UI state
        onModelsUpdate(updatedModels);
        setIsRenameDialogOpen(false);
        setRenameTagValue('');
        setSelectedTag(null);
        setViewTagModels(null);

        if (saveErrors === 0) {
            setSaveStatus('saved');
            setStatusMessage(`Tag "${oldTag}" renamed to "${newTag.trim()}" and saved to files`);
            toast.success('Tag renamed successfully');
        } else {
            setSaveStatus('error');
            setStatusMessage(`Tag renamed but ${saveErrors} file(s) failed to save`);
            toast.error(`Tag renamed with ${saveErrors} errors`);
        }

        setTimeout(() => {
            setSaveStatus('idle');
            setStatusMessage('');
        }, 3000);
    };

    const handleDeleteTag = async (tagToDelete: string) => {
        setSaveStatus('saving');
        setStatusMessage(`Deleting tag "${tagToDelete}" from all models...`);

        const updatedModels = models.map(model => ({
            ...model,
            tags: (Array.isArray(model.tags) ? model.tags : []).filter(tag => tag !== tagToDelete)
        }));

        let saveErrors = 0;
        for (const model of updatedModels) {
            const originalModel = models.find(m => m.id === model.id);
            if (originalModel && Array.isArray(originalModel.tags) && originalModel.tags.includes(tagToDelete)) {
                try {
                    let filePath;
                    if (model.modelUrl) {
                        // FIX: Pass the relative path (e.g. "car.stl") and let the server resolve the munchie file
                        // This ensures parity for STL/3MF handling on the backend
                        filePath = model.modelUrl.replace(/^\/?models\//, '');
                    } else if (model.filePath) {
                        filePath = model.filePath;
                    } else {
                        console.error('No file path available for model:', model.name);
                        saveErrors++;
                        continue;
                    }

                    console.log(`[TagManager] Deleting tag "${tagToDelete}" from model ${model.id} (${model.name}). File: ${filePath}`);

                    const response = await fetch('/api/save-model', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filePath,
                            id: model.id,
                            tags: model.tags
                        })
                    });

                    const result = await response.json();
                    if (!result.success) saveErrors++;
                } catch (error) {
                    saveErrors++;
                }
            }
        }

        onModelsUpdate(updatedModels);
        setSelectedTag(null);
        setViewTagModels(null);

        if (saveErrors === 0) {
            setSaveStatus('saved');
            setStatusMessage(`Tag "${tagToDelete}" deleted`);
            toast.success('Tag deleted');
        } else {
            setSaveStatus('error');
            setStatusMessage(`Tag deleted but ${saveErrors} save(s) failed`);
            toast.error(`Tag deleted with errors`);
        }

        setTimeout(() => {
            setSaveStatus('idle');
            setStatusMessage('');
        }, 3000);
    };

    return {
        selectedTag,
        setSelectedTag,
        viewTagModels,
        setViewTagModels,
        isRenameDialogOpen,
        setIsRenameDialogOpen,
        renameTagValue,
        setRenameTagValue,
        tagSearchTerm,
        setTagSearchTerm,
        startRenameTag,
        handleRenameTag,
        handleDeleteTag
    };
}
