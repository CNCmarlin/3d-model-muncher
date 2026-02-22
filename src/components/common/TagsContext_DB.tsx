import { useTagsQuery_db } from '@/hooks/useTagsQuery_db';
import { useContext, type ReactNode } from 'react';
import { TagsContext } from './TagsContext';

/**
 * DATABASE-FIRST Tags Context (DB variant)
 * 
 * Uses useTagsQuery_db hook to fetch tags from database.
 * Shares the same React context as TagsContext so hooks work
 * regardless of which provider is mounted.
 */

export function TagsProvider_DB({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useTagsQuery_db();

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

export function useGlobalTags_DB() {
  const context = useContext(TagsContext);
  return context.tags;
}

export function useGlobalTagsContext_DB() {
  return useContext(TagsContext);
}
