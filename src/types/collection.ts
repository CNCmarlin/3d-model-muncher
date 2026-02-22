export interface BuildPlate {
  id: string;
  name: string; // e.g. "Extruder Parts (Black)"
  modelIds: string[]; // IDs of models assigned to this plate
  status: 'draft' | 'sliced' | 'printed';
  lastModified?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  modelIds: string[];
  childCollectionIds?: string[];
  parentId?: string | null;
  path?: string;

  // Visuals
  coverModelId?: string;
  coverImage?: string;
  images?: string[];
  documents?: string[];

  // Organization
  category?: string;
  tags?: string[];
  type?: 'standard' | 'project';
  buildPlates?: any[];
}
