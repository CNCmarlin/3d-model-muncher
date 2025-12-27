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
  modelIds: string[]; // The "Master List" of all models in this project
  childCollectionIds?: string[];
  parentId?: string | null;
  
  // Visuals
  coverModelId?: string;
  coverImage?: string;
  images?: string[]; // Gallery images
  
  // Metadata
  category?: string;
  tags?: string[];
  created?: string;
  lastModified?: string;

  // [NEW] Project Features
  type?: 'standard' | 'project';
  buildPlates?: BuildPlate[];
}