// Utility to resolve a model thumbnail descriptor to an actual image URL/data
export function getUserImageData(entry: any): string {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && typeof entry.data === 'string') return entry.data;
  return '';
}

// Helper to standardise paths for DB mode
function standardizePath(path: string | undefined): string {
  if (!path) return '';
  // If it's a data URL, return as is
  if (path.startsWith('data:')) return path;
  // If it starts with /models/, return as is
  if (path.startsWith('/models/')) return path;
  // If it starts with http, return as is
  if (path.startsWith('http')) return path;

  // Otherwise, assume it's relative to models dir and prepend /models/
  // Remove any leading slash just in case
  const clean = path.replace(/^[\\/]+/, '');
  return `/models/${clean}`;
}

export function resolveModelThumbnail(model: any): string {
  if (!model) return '';

  // Descriptor stored by UI in userDefined.thumbnail (e.g. 'parsed:0', 'user:1', or a literal data URL)
  const thumbnailDesc = (model as any)?.userDefined?.thumbnail;

  if (thumbnailDesc && typeof thumbnailDesc === 'string') {
    if (thumbnailDesc.startsWith('parsed:')) {
      const idx = parseInt(thumbnailDesc.split(':')[1] || '', 10);
      if (!isNaN(idx)) {
        if (Array.isArray(model.parsedImages) && model.parsedImages[idx]) {
          return standardizePath(model.parsedImages[idx]);
        }
        // legacy fallbacks
        if (idx === 0 && model.thumbnail && !model.thumbnail.startsWith('parsed:')) {
          return standardizePath(model.thumbnail);
        }
        if (Array.isArray(model.images) && model.images[idx - 1]) {
          return standardizePath(model.images[idx - 1]);
        }
      }
      // [FIX] If we explicitly have a parsed: pointer but can't resolve it, 
      // do NOT fall through to legacy fields which might also be corrupted. Return empty.
      return '';
    } else if (thumbnailDesc.startsWith('user:')) {
      const idx = parseInt(thumbnailDesc.split(':')[1] || '', 10);
      const userImages = (model as any)?.userDefined?.images;
      if (!isNaN(idx) && Array.isArray(userImages) && userImages[idx]) {
        return getUserImageData(userImages[idx]);
      }
      return '';
    } else {
      // If it's a raw path in userDefined, standardise it (unless data/http)
      if (!thumbnailDesc.startsWith('data:') && !thumbnailDesc.startsWith('http')) {
        return standardizePath(thumbnailDesc);
      }
      return thumbnailDesc;
    }
  }

  // [NEW] Strict Functional Thumbnail (Prefer over parsedImages/legacy)
  if (model.thumbnails && model.filePath) {
    // Extract basename (handle both slashes)
    const parts = model.filePath.split(/[/\\]/);
    const filename = parts[parts.length - 1];
    if (model.thumbnails[filename] && model.thumbnails[filename].length > 0) {
      return standardizePath(model.thumbnails[filename][0]);
    }
  }

  // Prefer new parsedImages top-level field
  if (Array.isArray(model.parsedImages) && model.parsedImages.length > 0) {
    return standardizePath(model.parsedImages[0]);
  }

  // Backwards-compatible fallbacks
  // [FIX] Ensure legacy thumbnail is not a pointer (corruption safeguard)
  if (model.thumbnail && !model.thumbnail.startsWith('parsed:')) {
    return standardizePath(model.thumbnail);
  }

  if (model.coverImagePath) {
    return standardizePath(model.coverImagePath);
  }
  if (Array.isArray(model.images) && model.images.length > 0) {
    return standardizePath(model.images[0]);
  }

  return '';
}
