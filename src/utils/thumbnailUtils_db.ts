// thumbnailUtils_db.ts — DB-mode thumbnail resolution
// In DB mode, model.thumbnailPath is the canonical source of truth (Batch 5).
// The legacy userDefined.thumbnail pointer system (parsed:0, user:1, etc.) is deprecated.

function standardizePath(path: string | undefined): string {
  if (!path) return '';
  if (path.startsWith('data:')) return path;
  if (path.startsWith('/models/')) return path;
  if (path.startsWith('http')) return path;
  const clean = path.replace(/^[\\\/]+/, '');
  return `/models/${clean}`;
}

/** Resolve a model's display thumbnail to a URL string.
 *
 * Priority (DB mode):
 * 1. model.thumbnailPath   — promoted DB column (Batch 2/5 source of truth)
 * 2. model.images[]        — ModelImage rows (Batch 5)
 * 3. Legacy fallbacks      — parsedImages / thumbnail field (bridge only)
 *
 * DEPRECATED: The userDefined.thumbnail pointer system (parsed:0, user:1) is no
 * longer written in DB mode. Reads from it are removed here (Batch 7).
 */
export function resolveModelThumbnail(model: any): string {
  if (!model) return '';

  // 1. DB column — primary source of truth
  if (model.thumbnailPath) {
    return standardizePath(model.thumbnailPath);
  }

  // 2. ModelImage rows (Batch 5) — pick first thumbnail-sourced image
  if (Array.isArray(model.images) && model.images.length > 0) {
    const thumb = (model.images as any[]).find(img => img?.source === 'thumbnail');
    if (thumb?.path) return standardizePath(thumb.path);
    // If no dedicated thumbnail image, use first gallery image
    const first = model.images[0];
    if (first?.path) return standardizePath(first.path);
  }

  // 3. Legacy bridge fallbacks (non-_db routes / migration period)
  if (Array.isArray(model.parsedImages) && model.parsedImages.length > 0) {
    return standardizePath(model.parsedImages[0]);
  }
  if (model.thumbnail && !model.thumbnail.startsWith('parsed:')) {
    return standardizePath(model.thumbnail);
  }

  return '';
}

/** Extract a raw data URL or string from a userDefined image entry.
 * Kept as a utility even though userDefined.images is deprecated, because
 * some in-flight captures during the current session may still produce this shape.
 */
export function getUserImageData(entry: any): string {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && typeof entry.data === 'string') return entry.data;
  return '';
}
