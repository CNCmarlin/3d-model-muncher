import { Model_db } from "@/types/model_db";

export interface FilterState_db {
  search: string;
  category: string;
  printStatus: string;
  license: string;
  fileType: string;
  tags: string[];
  showHidden: boolean;
  showMissingImages: boolean;
  sortBy?: string; // Optional sort field
}

/** Extract a tag name string from either a string tag (legacy) or a ModelTag_db object. */
const getTagName = (t: any): string =>
  typeof t === 'string' ? t : (t?.tag?.name ?? t?.name ?? '');

export const applyFiltersToModels_db = (modelsToFilter: Model_db[], filters: FilterState_db) => {
  let filtered = modelsToFilter;

  // 1. Filter by Hidden Status (DB column: isHidden)
  if (!filters.showHidden) {
    filtered = filtered.filter(model => !model.isHidden);
  }

  // 2. Filter by Missing Images — use DB ModelImage relation first, then parsedImages bridge
  if (filters.showMissingImages) {
    filtered = filtered.filter(model => {
      const hasDbImages = Array.isArray(model.images) && model.images.length > 0;
      const hasParsedImages = Array.isArray(model.parsedImages) && model.parsedImages.length > 0;
      return !hasDbImages && !hasParsedImages;
    });
  }

  // 3. Search Filter
  if (filters.search) {
    const term = filters.search.toLowerCase();
    filtered = filtered.filter(model =>
      model.name.toLowerCase().includes(term) ||
      (model.tags || []).some(tag => getTagName(tag).toLowerCase().includes(term)) ||
      (model.modelUrl || '').toLowerCase().includes(term) ||
      (model.filePath || '').toLowerCase().includes(term)
    );
  }

  // 4. Category Filter
  if (filters.category && filters.category !== 'all') {
    filtered = filtered.filter(model =>
      (model.category ?? '').toLowerCase() === filters.category.toLowerCase()
    );
  }

  // 5. Print Status Filter
  if (filters.printStatus && filters.printStatus !== 'all') {
    filtered = filtered.filter(model =>
      filters.printStatus === 'printed' ? model.isPrinted : !model.isPrinted
    );
  }

  // 6. License Filter
  if (filters.license && filters.license !== 'all') {
    filtered = filtered.filter(model => model.license === filters.license);
  }

  // 7. Tags Filter — handles both string[] (legacy bridge) and ModelTag_db[]
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(model =>
      filters.tags.every(selectedTag =>
        (model.tags || []).some(modelTag =>
          getTagName(modelTag).toLowerCase() === selectedTag.toLowerCase()
        )
      )
    );
  }

  // 8. File Type Filter
  if (filters.fileType && filters.fileType !== 'all') {
    const ext = filters.fileType.toLowerCase();
    if (ext !== 'collections') {
      filtered = filtered.filter(model => {
        // DB-first: use ModelFile_db.fileType enum (most reliable)
        const files: any[] = (model as any).files || [];
        if (files.some((f: any) =>
          (f.fileType || '').toLowerCase() === ext ||
          (f.path || f.filePath || '').toLowerCase().endsWith('.' + ext)
        )) return true;
        // Fallback: top-level filePath / modelUrl
        const path = (model.filePath || model.modelUrl || '').toLowerCase();
        return path.endsWith('.' + ext);
      });
    }
  }

  return filtered;
};

export const isViewableImage = (path: string) => {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(path);
};

export const isViewable3D = (path: string) => {
  return /\.(stl|3mf|obj)$/i.test(path);
};

export const isViewablePDF = (path: string) => {
  return path.toLowerCase().endsWith('.pdf');
};

export const isViewableText = (path: string) => {
  return /\.(txt|md|log|cfg|ini|gcode)$/i.test(path);
};

export const getDocType = (path: string): 'pdf' | 'text' | 'unknown' => {
  if (isViewablePDF(path)) return 'pdf';
  if (isViewableText(path)) return 'text';
  return 'unknown';
};