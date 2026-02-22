const API_BASE = '/api/files';

export interface ModelFile {
    id: string;
    modelId: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    isPrimary: boolean;
    createdAt: string;
    updatedAt: string;
}

export async function getFiles(modelId: string): Promise<ModelFile[]> {
    const response = await fetch(`${API_BASE}?modelId=${modelId}`);
    if (!response.ok) throw new Error('Failed to fetch files');
    const result = await response.json();
    return result.data || result;
}

export async function syncFiles(modelId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
    });
    if (!response.ok) throw new Error('Failed to sync files');
}
