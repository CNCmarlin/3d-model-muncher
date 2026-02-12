import { Model } from '../../types/model';

const API_BASE = '/api/models';

export async function getModels(params: Record<string, any>): Promise<Model[]> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                value.forEach(v => searchParams.append(key, v));
            } else {
                searchParams.append(key, String(value));
            }
        }
    });

    const response = await fetch(`${API_BASE}?${searchParams.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch models');
    return response.json();
}

export async function getModel(id: string): Promise<Model> {
    const response = await fetch(`${API_BASE}/${id}`);
    if (!response.ok) throw new Error('Failed to fetch model');
    const result = await response.json();
    return result.success ? result.data : result; // Handle both wrapper and direct return
}

export async function createModel(data: Partial<Model> & { collectionId?: string }): Promise<Model> {
    const response = await fetch(`${API_BASE}/save-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create model');
    const result = await response.json();
    return result.data || result;
}

export async function updateModel(id: string, data: Partial<Model>): Promise<Model> {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update model');
    return response.json();
}

export async function deleteModel(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete model');
}

export async function bulkEditModels(modelIds: string[], updates: Partial<Model>): Promise<{ updated: number }> {
    // Adapter for React Query -> Service format
    const response = await fetch(`${API_BASE}/bulk-update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelIds, data: updates }),
    });
    if (!response.ok) throw new Error('Failed to bulk edit models');
    return response.json();
}
