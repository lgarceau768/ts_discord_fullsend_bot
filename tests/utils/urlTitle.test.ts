import { describe, expect, it } from 'vitest';

import { inferTitleFromUrl } from '../../src/features/watch/utils/urlTitle.js';

describe('utils/urlTitle', () => {
  it('generates title from slug', () => {
    expect(inferTitleFromUrl('https://example.com/products/gaming-gpu-rtx-4090')).toBe(
      'Gaming Gpu Rtx 4090',
    );
  });

  it('falls back to host when no path', () => {
    expect(inferTitleFromUrl('https://store.example.com')).toBe('Store Example Com');
  });

  it('returns original input on invalid URL', () => {
    expect(inferTitleFromUrl('not a url')).toBe('not a url');
  });
});
