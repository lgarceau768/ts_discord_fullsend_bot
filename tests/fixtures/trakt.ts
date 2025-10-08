import type { SearchItem } from '../../src/core/types/n8n.js';

export function createSearchItem(overrides: Partial<SearchItem> = {}): SearchItem {
  return {
    type: 'movie',
    title: 'Sample Movie',
    year: 2024,
    ids: { tmdb: 12345 },
    overview: 'A test overview for the sample movie.',
    posterUrl: 'https://example.com/poster.jpg',
    backdropUrl: 'https://example.com/backdrop.jpg',
    genres: ['Action', 'Drama'],
    rating: 7.5,
    runtime: 120,
    ...overrides,
  };
}
