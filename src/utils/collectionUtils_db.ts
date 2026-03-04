import { Collection } from "@/types/collection_db";

export function getDescendantModelIds(collectionId: string, allCollections: Collection[]): string[] {
    const col = allCollections.find(c => c.id === collectionId);
    if (!col) return [];
    let ids = Array.isArray(col.modelIds) ? [...col.modelIds] : [];
    const children = allCollections.filter(c => c.parentId === collectionId);
    children.forEach(child => {
        ids = [...ids, ...getDescendantModelIds(child.id, allCollections)];
    });
    return Array.from(new Set(ids));
}

export function hasModelsDeep(collectionId: string, allCollections: Collection[]): boolean {
    const c = allCollections.find(x => x.id === collectionId);
    if (!c) return false;
    if (c.modelIds && c.modelIds.length > 0) return true;
    const children = allCollections.filter(child => child.parentId === collectionId);
    return children.some(child => hasModelsDeep(child.id, allCollections));
}

export function getDynamicModelCount(collection: Collection, allCollections: Collection[], mode: string): number {
    if (mode === 'top-level') {
        return getDescendantModelIds(collection.id, allCollections).length;
    }
    return Array.isArray(collection.modelIds) ? collection.modelIds.length : 0;
}

export function isCloudCollection(collection: Collection | null | undefined): boolean {
    if (!collection || !collection.path) return false;
    // Normalize path to check if it represents the cloud models intake directory
    const normalizedPath = collection.path.replace(/\\/g, '/').toLowerCase();
    return normalizedPath === 'cloud-models' || normalizedPath.endsWith('/cloud-models');
}
