import { Model } from '@/types/model_db';
import { toast } from 'sonner';

export function useDocumentUpload_db(model: Model | null, onModelUpdate: (model: Model) => void) {

    const handleTargetedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || !model || files.length === 0) return;

        const formData = new FormData();
        formData.append('file', files[0]); // Start with single file for stability
        formData.append('modelId', model.id);
        formData.append('filePath', model.filePath || '');

        try {
            toast.loading("Uploading to project folder...");
            const resp = await fetch('/api/models/upload-document', {
                method: 'POST',
                body: formData
            });
            const result = await resp.json();
            if (result.success) {
                toast.success("Document added to project.");
                onModelUpdate(result.model); // Refresh the UI immediately
            }
        } catch (err) {
            toast.error("Upload failed.");
        }
    };

    return { handleTargetedUpload };
}
