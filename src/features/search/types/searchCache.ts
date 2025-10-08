import type { SearchItem } from '../../../core/types/n8n';

export interface SearchCacheEntry {
  items: SearchItem[];
  createdAt: number;
  query: string;
  authorId: string;
  parentMessageId: string;
}
