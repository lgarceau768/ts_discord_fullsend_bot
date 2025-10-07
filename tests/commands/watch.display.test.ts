import { describe, expect, it } from 'vitest';

import {
  buildFullListEmbed,
  buildLatestEmbed,
  buildMinimalListEmbed,
  extractPriceSnapshot,
} from '../../src/commands/watch/display.js';
import type { WatchBase } from '../../src/types/watch.js';
import { createWatchDetails, createWatchRecord, createHistoryEntry } from '../fixtures/watch.js';

const base: WatchBase = {
  renderTemplate: (template) => template,
  notificationTemplate: '',
  notificationUrl: '',
  getSiteIconUrl: () => 'https://icons.example/site.png',
  cdCreateWatch: async () => 'uuid',
  cdUpdateWatch: async () => undefined,
  cdDeleteWatch: async () => undefined,
  cdGetWatchDetails: async () => createWatchDetails(),
  cdGetWatchHistory: async () => [createHistoryEntry()],
  parseTags: () => [],
  mkOwnerTags: () => [],
  dbInsertWatch: async () => undefined,
  dbListWatches: async (_userId, _options) => [createWatchRecord()],
  dbDeleteWatch: async () => true,
  dbGetWatch: async () => createWatchRecord(),
  dbUpdateWatch: async () => undefined,
  colors: {
    primary: 0x111111,
    success: 0x22c55e,
    warning: 0xf59e0b,
    danger: 0xef4444,
  },
  icons: {
    watch: 'https://icons.example/watch.png',
    snapshot: 'https://icons.example/snapshot.png',
  },
};

describe('watch display helpers', () => {
  it('extracts the best price snapshot from details and history', () => {
    const details = createWatchDetails({
      latest_snapshot: { price: 199.99, currency: 'USD', timestamp: '2025-01-01T00:00:00Z' },
    });
    const history = [createHistoryEntry({ snapshot: { price: 189.99, currency: 'USD' } })];

    const snapshot = extractPriceSnapshot(details, history);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.price).toBe('USD 199.99');
    expect(snapshot?.currency).toBe('USD');
  });

  it('returns null when no candidates are found', () => {
    const snapshot = extractPriceSnapshot(undefined, []);
    expect(snapshot).toBeNull();
  });

  it('builds minimal list embeds with price information', () => {
    const entry = {
      index: 1,
      record: createWatchRecord(),
      details: createWatchDetails(),
      priceSnapshot: extractPriceSnapshot(createWatchDetails(), [createHistoryEntry()]),
    };

    const embed = buildMinimalListEmbed(base, entry);
    const json = embed.toJSON();

    expect(json.title).toContain('Example Product');
    expect(json.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Current price' })]),
    );
  });

  it('includes error descriptions and default tags in list embeds', () => {
    const entry = {
      index: 3,
      record: createWatchRecord({ tags: [] }),
      details: undefined,
      priceSnapshot: null,
      errorMessage: 'Failed to read history',
    };

    const embed = buildFullListEmbed(base, entry);
    const json = embed.toJSON();
    expect(json.description).toContain('Failed to read history');
    const tagsField = json.fields?.find((field) => field.name === 'Tags');
    expect(tagsField?.value).toBe('—');
  });

  it('builds full list embeds with tags and uuid', () => {
    const entry = {
      index: 2,
      record: createWatchRecord({ watch_uuid: 'watch-uuid-2', tags: ['gpu', 'deal'] }),
      details: createWatchDetails({ title: 'GPU Deal' }),
      priceSnapshot: extractPriceSnapshot(createWatchDetails(), [createHistoryEntry()]),
    };

    const embed = buildFullListEmbed(base, entry);
    const json = embed.toJSON();

    expect(json.footer?.text).toContain('UUID watch-uuid-2');
    expect(json.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Tags' })]),
    );
  });

  it('builds latest embeds and notes missing price data', () => {
    const embed = buildLatestEmbed(base, {
      uuid: 'watch-uuid-1',
      watchUrl: 'https://example.com/product',
      tags: ['price-watch'],
      details: createWatchDetails(),
      priceSnapshot: null,
    });

    const json = embed.toJSON();
    const priceField = json.fields?.find((field) => field.name === 'Price data');
    expect(priceField?.value).toContain('No price or stock data');
    expect(json.title).toContain('💰');
  });

  it('adds notifications and error details to latest embed', () => {
    const snapshot = extractPriceSnapshot(
      createWatchDetails({
        latest_snapshot: {
          price: 42,
          currency_symbol: '$',
          in_stock: 'In stock today',
          timestamp: '2025-01-01T00:00:00Z',
        },
      }),
      [createHistoryEntry({ snapshot: { price: 41, currency: 'USD', previous_price: 50 } })],
    );

    const embed = buildLatestEmbed(base, {
      uuid: 'watch-uuid-5',
      watchUrl: 'https://example.com/widget',
      tags: [],
      details: createWatchDetails({
        title: 'Widget',
        last_notification: { title: 'Heads up', body: 'Price dropped!'.padEnd(1100, '!') },
      }),
      priceSnapshot: snapshot,
      errorMessage: 'History failed',
    });

    const json = embed.toJSON();
    expect(json.description).toContain('⚠️ History failed');
    expect(json.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Availability' })]),
    );
    const notificationField = json.fields?.find((field) => field.name === 'Heads up');
    expect(notificationField?.value).toContain('…');
  });

  it('handles nested price values during extraction', () => {
    const details = createWatchDetails({
      latest_snapshot: {
        latest_price: '199',
        currency_code: 'EUR',
        image: 'https://example.com/image.png',
      },
    });
    const history = [
      createHistoryEntry({
        snapshot: {
          current: { price: '189' },
          availability: 'Sold out',
          previous: { price: '205' },
        },
      }),
    ];

    const snapshot = extractPriceSnapshot(details, history);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.price).toBe('EUR 199');
    expect(snapshot?.context).toBeDefined();
  });
});
