import type {
  ChangeDetectionHistoryEntry,
  ChangeDetectionWatchDetails,
} from '../../src/features/watch/types/changeDetection.js';
import type { WatchRecord } from '../../src/features/watch/types/watch.js';

export function createWatchRecord(overrides: Partial<WatchRecord> = {}): WatchRecord {
  return {
    watch_uuid: overrides.watch_uuid ?? 'watch-uuid-1',
    url: overrides.url ?? 'https://example.com/product',
    tags: overrides.tags ?? ['price-watch'],
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

export function createWatchDetails(
  overrides: Partial<ChangeDetectionWatchDetails> = {},
): ChangeDetectionWatchDetails {
  return {
    uuid: overrides.uuid ?? 'watch-uuid-1',
    title: overrides.title ?? 'Example Product',
    url: overrides.url ?? 'https://example.com/product',
    last_checked: overrides.last_checked ?? new Date().toISOString(),
    last_changed: overrides.last_changed ?? new Date().toISOString(),
    latest_snapshot:
      overrides.latest_snapshot ??
      ({
        price: 199.99,
        currency: 'USD',
        in_stock: true,
        timestamp: new Date().toISOString(),
        image_url: 'https://example.com/image.jpg',
      } as Record<string, unknown>),
    latest_data:
      overrides.latest_data ??
      ({ price: 209.99, previous_price: 219.99 } as Record<string, unknown>),
    last_notification:
      overrides.last_notification ??
      ({
        title: 'Price drop detected',
        body: 'The price dropped by $10.',
        timestamp: new Date().toISOString(),
      } as Record<string, unknown>),
    ...overrides,
  };
}

export function createHistoryEntry(
  overrides: Partial<ChangeDetectionHistoryEntry> = {},
): ChangeDetectionHistoryEntry {
  return {
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    snapshot:
      overrides.snapshot ??
      ({
        current_price: 189.99,
        currency: 'USD',
        in_stock: false,
      } as Record<string, unknown>),
    ...overrides,
  };
}
