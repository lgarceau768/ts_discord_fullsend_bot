import type { SearchItem } from './n8n.js';

export interface SearchCacheEntry {
  items: SearchItem[];
  createdAt: number;
  query: string;
  authorId: string;
  parentMessageId: string;
}
