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
}