import { TagInfo } from '@/types/model_db';

const API_BASE = '/api/tags';

export async function getTags(): Promise<TagInfo[]> {
    const response = await fetch(API_BASE);
    if (!response.ok) throw new Error('Failed to fetch tags');
    return response.json();
}

export async function bulkAssignTags(modelIds: string[], tags: { add: string[], remove: string[] }): Promise<{ updated: number }> {
    const response = await fetch(`${API_BASE}/bulk-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelIds, tags }),
    });
    if (!response.ok) throw new Error('Failed to bulk assign tags');
    return response.json();
}
