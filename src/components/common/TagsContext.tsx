import { useTagsQuery } from '@/hooks/useTagsQuery';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * DATABASE-FIRST Tags Context
 * 
 * Uses React Query to fetch tags from /api/tags endpoint
 * - Database mode: Queries Tag table
 * - Legacy mode: Extracts from munchie files
 */

interface TagsContextType {
  tags: string[];
  isLoading: boolean;
  error: Error | null;
}

export const TagsContext = createContext<TagsContextType>({
  tags: [],
  isLoading: false,
  error: null,
});

export function TagsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useTagsQuery();

  // Extract tag names from Tag objects {id, name}
  const tags = data?.map((tag) => {
    // Handle both string tags and Tag objects
    return typeof tag === 'string' ? tag : tag.name;
  }) || [];

  return (
    <TagsContext.Provider value={{ tags, isLoading, error: error as Error | null }}>
      {children}
    </TagsContext.Provider>
  );
}

export function useGlobalTags() {
  const context = useContext(TagsContext);
  return context.tags;
}

export function useGlobalTagsContext() {
  return useContext(TagsContext);
}
