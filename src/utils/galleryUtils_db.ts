import { Model } from '@/types/model_db';

// BATCH 7 NOTE: In DB mode, image data lives in the ModelImage table (Batch 5).
// The userDefined.images / userDefined.imageOrder pointer system below is deprecated.
// These functions remain as fallbacks only for models not yet re-saved through the DB.

// Helper: extract data URL from a legacy userDefined image entry
export const getUserImageData = (entry: any) => {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object' && typeof entry.data === 'string') return entry.data;
    return '';
};

// Resolve a descriptor to actual image data
export const resolveDescriptorToData = (desc: string | undefined, m: Model): string | undefined => {
    if (!desc) return undefined;

    const parsedImages = Array.isArray(m.parsedImages) ? m.parsedImages : [];
    const legacyImages = Array.isArray(m.images) ? m.images : [];
    // DEPRECATED (Batch 7): userDefined.images superseded by ModelImage table
    const userArr = Array.isArray((m as any).userDefined?.images) ? (m as any).userDefined.images : [];

    if (desc.startsWith('parsed:')) {
        const idx = parseInt(desc.split(':')[1] || '', 10);
        if (!isNaN(idx)) {
            if (parsedImages[idx]) return parsedImages[idx];
            // Backward compatibility
            if (idx === 0 && m.thumbnail) return m.thumbnail;
            if (legacyImages[idx - 1]) return legacyImages[idx - 1]; // offset by 1
        }
        return undefined;
    }

    if (desc.startsWith('user:')) {
        const idx = parseInt(desc.split(':')[1] || '', 10);
        if (!isNaN(idx) && userArr[idx] !== undefined) return getUserImageData(userArr[idx]);
        return undefined;
    }

    return desc;
};

export const buildImageOrderFromModel = (m: Model) => {
    const result: string[] = [];
    if (!m) return result;

    const parsedImages = Array.isArray(m.parsedImages) ? m.parsedImages : [];
    // DEPRECATED (Batch 7): userDefined.images superseded by ModelImage table
    const userArr = Array.isArray((m as any).userDefined?.images) ? (m as any).userDefined.images : [];

    for (let i = 0; i < parsedImages.length; i++) {
        result.push(`parsed:${i}`);
    }

    for (let i = 0; i < userArr.length; i++) {
        result.push(`user:${i}`);
    }

    if (parsedImages.length === 0) {
        const legacyImages = Array.isArray(m.images) ? m.images : [];
        const thumbnail = m.thumbnail;
        if (thumbnail) {
            result.push('parsed:0');
        }
        for (let i = 0; i < legacyImages.length; i++) {
            result.push(`parsed:${i + (thumbnail ? 1 : 0)}`);
        }
    }
    return result;
};

export const resolveImageOrderToUrls = (m: Model) => {
    // DEPRECATED (Batch 7): userDefined.imageOrder superseded by ModelImage.order column
    const order = Array.isArray((m as any).userDefined?.imageOrder) ? (m as any).userDefined.imageOrder : undefined;
    if (!m || !order || order.length === 0) return null;

    const urls: string[] = [];
    for (const desc of order) {
        if (typeof desc !== 'string') continue;
        const resolved = resolveDescriptorToData(desc, m);
        if (resolved) urls.push(resolved);
    }
    return urls.length > 0 ? urls : null;
};
