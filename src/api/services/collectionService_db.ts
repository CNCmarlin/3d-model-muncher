import { Collection } from '@/types/collection_db';

const API_BASE = '/api/collections';

export async function getCollections(): Promise<Collection[]> {
    const response = await fetch(API_BASE);
    if (!response.ok) throw new Error('Failed to fetch collections');
    return response.json();
}

export async function createCollection(data: Partial<Collection>): Promise<Collection> {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create collection');
    const result = await response.json();
    return result.data || result;
}

export async function updateCollection(id: string, data: Partial<Collection>): Promise<Collection> {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update collection');
    const result = await response.json();
    return result.data || result;
}

// TODO: Implement update and delete when API is ready
