export interface Collection {
  id: string;
  name: string;
  description?: string;
  modelIds: string[];
  childCollectionIds?: string[];
  parentId?: string | null;
  coverModelId?: string;
  coverImage?: string;
  category?: string;
  tags?: string[];
  images?: string[];
  created?: string;
  lastModified?: string;
  type?: 'standard' | 'project'; // Differentiate normal folders vs Projects
  buildPlates?: BuildPlate[]; // The new feature
}

export interface BuildPlate {
  id: string;
  name: string; // e.g. "Extruder (Black)"
  modelIds: string[]; // List of IDs in this specific plate
  status?: 'planned' | 'sliced' | 'printed'; // Track status per plate!
}
