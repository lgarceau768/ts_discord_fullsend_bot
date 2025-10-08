import { EmbedBuilder } from 'discord.js';

import type {
  ChangeDetectionHistoryEntry,
  ChangeDetectionWatchDetails,
} from '../../types/changeDetection.js';
import type {
  DisplayEntry,
  LatestEmbedInput,
  PriceCandidate,
  PriceSnapshot,
  WatchBase,
} from '../../types/watch.js';

export type { PriceSnapshot, DisplayEntry } from '../../types/watch.js';

type UnknownRecord = Record<string, unknown>;

const toRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' ? (value as UnknownRecord) : null;

const pick = (record: UnknownRecord | null, key: string): unknown =>
  record ? record[key] : undefined;

const pickNested = (record: UnknownRecord | null, path: string[]): unknown => {
  let current: unknown = record;
  for (const segment of path) {
    const currentRecord = toRecord(current);
    if (!currentRecord) return undefined;
    current = currentRecord[segment];
  }
  return current;
};

function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function toTimestampString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) return new Date(value).toISOString();
    if (value > 1e9) return new Date(value * 1000).toISOString();
  }
  return undefined;
}

function describeStock(raw: unknown): { label: string; bool: boolean | null } {
  if (typeof raw === 'boolean') return { label: raw ? 'In stock' : 'Out of stock', bool: raw };
  if (typeof raw === 'number') {
    const bool = raw > 0;
    return { label: bool ? 'In stock' : 'Out of stock', bool };
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return { label: raw, bool: null };
    if (
      ['in stock', 'instock', 'available', 'true', 'yes'].some((token) =>
        normalized.includes(token),
      )
    ) {
      return { label: raw, bool: true };
    }
    if (
      ['out of stock', 'oos', 'sold out', 'false', 'no'].some((token) => normalized.includes(token))
    ) {
      return { label: raw, bool: false };
    }
    return { label: raw, bool: null };
  }
  if (raw === null || raw === undefined) return { label: 'Unknown', bool: null };
  if (typeof raw === 'object') {
    try {
      return { label: JSON.stringify(raw), bool: null };
    } catch {
      return { label: 'Unknown', bool: null };
    }
  }
  if (typeof raw === 'bigint') return { label: raw.toString(), bool: null };
  if (typeof raw === 'symbol') return { label: raw.description ?? 'Symbol', bool: null };
  if (typeof raw === 'function') {
    return { label: raw.name ? `[fn ${raw.name}]` : '[function]', bool: null };
  }
  return { label: 'Unknown', bool: null };
}

function formatPrice(raw: unknown, currency?: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  let value: string | undefined;
  if (typeof raw === 'number') {
    value = raw.toFixed(2);
  } else if (typeof raw === 'string') {
    value = raw.trim();
  } else if (typeof raw === 'bigint') {
    value = raw.toString();
  } else {
    return undefined;
  }
  const currencyStr = typeof currency === 'string' ? currency.trim() : undefined;
  if (!value) return undefined;
  if (currencyStr) {
    if (/^[A-Za-z]{3}$/.test(currencyStr)) return `${currencyStr} ${value}`;
    return `${currencyStr}${value}`;
  }
  return value;
}

function findPriceCandidate(
  root: UnknownRecord,
  context: string,
  timestamp?: string,
): PriceCandidate | null {
  const queue: { node: UnknownRecord; path: string[] }[] = [{ node: root, path: [] }];
  let best: PriceCandidate | null = null;

  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    const { node, path } = item;
    const entries = Object.entries(node);
    const priceKeys = entries
      .filter(
        ([key, val]) => /price|amount|cost/i.test(key) && val !== null && typeof val !== 'object',
      )
      .map(([key]) => key);
    const stockKeys = entries
      .filter(
        ([key, val]) =>
          /(in[_-]?stock|availability|available|stock)/i.test(key) &&
          val !== null &&
          typeof val !== 'object',
      )
      .map(([key]) => key);
    const currencyKeys = entries
      .filter(
        ([key, val]) => /currency|symbol/i.test(key) && val !== null && typeof val !== 'object',
      )
      .map(([key]) => key);

    const score =
      (priceKeys.length ? 3 : 0) +
      (stockKeys.length ? 2 : 0) +
      (currencyKeys.length ? 1 : 0) +
      (path.some((segment) => /restock|price/i.test(segment)) ? 1 : 0);

    if (score > 0 && (!best || score > best.score)) {
      best = {
        node,
        score,
        context,
        timestamp,
      };
    }

    for (const [key, value] of entries) {
      if (value && typeof value === 'object') {
        queue.push({ node: value as UnknownRecord, path: path.concat(key) });
      }
    }
  }

  return best;
}

export function extractPriceSnapshot(
  details: ChangeDetectionWatchDetails | undefined,
  history: ChangeDetectionHistoryEntry[],
): PriceSnapshot | null {
  const candidates: PriceCandidate[] = [];
  const pushCandidate = (node: unknown, context: string, timestamp?: unknown) => {
    const record = toRecord(node);
    if (!record) return;
    const ts = toTimestampString(timestamp);
    const candidate = findPriceCandidate(record, context, ts);
    if (candidate) candidates.push(candidate);
  };

  if (details) {
    pushCandidate(
      details.latest_snapshot,
      'latest_snapshot',
      pick(toRecord(details.latest_snapshot), 'timestamp') ??
        details.last_changed ??
        details.last_checked,
    );
    pushCandidate(
      details.latest_data,
      'latest_data',
      pick(toRecord(details.latest_data), 'timestamp') ??
        details.last_changed ??
        details.last_checked,
    );
    pushCandidate(
      details.last_notification,
      'last_notification',
      details.last_notification?.timestamp ??
        details.last_notification?.date ??
        details.last_notification?.ts,
    );
    pushCandidate(details as UnknownRecord, 'watch', details.last_changed ?? details.last_checked);
  }

  history.forEach((entry, index) => {
    const ts = entry.timestamp ?? entry.ts ?? entry.time ?? entry.date;
    pushCandidate(entry.snapshot, `history[${index}].snapshot`, ts);
    pushCandidate(entry.data, `history[${index}].data`, ts);
    pushCandidate(entry as UnknownRecord, `history[${index}]`, ts);
  });

  if (!candidates.length) return null;

  const best = candidates.reduce((acc, curr) => (curr.score > acc.score ? curr : acc));
  const node = best.node;

  const priceRaw = firstDefined(
    pick(node, 'current_price'),
    pick(node, 'price_now'),
    pick(node, 'new_price'),
    pick(node, 'latest_price'),
    pick(node, 'price'),
    pick(node, 'amount'),
    pick(node, 'value'),
    pick(node, 'cost'),
    pickNested(node, ['current', 'price']),
    pickNested(node, ['latest', 'price']),
  );

  const prevRaw = firstDefined(
    pick(node, 'previous_price'),
    pick(node, 'old_price'),
    pick(node, 'price_was'),
    pick(node, 'previous'),
    pickNested(node, ['previous', 'price']),
    pickNested(node, ['old', 'price']),
  );

  const currencyRaw = firstDefined(
    pick(node, 'currency'),
    pick(node, 'currency_symbol'),
    pick(node, 'currencySymbol'),
    pick(node, 'currencyCode'),
    pick(node, 'currency_code'),
    pickNested(node, ['current', 'currency']),
  );

  const stockRaw = firstDefined(
    pick(node, 'in_stock'),
    pick(node, 'inStock'),
    pick(node, 'stock'),
    pick(node, 'available'),
    pick(node, 'availability'),
    pick(node, 'is_available'),
    pick(node, 'isAvailable'),
  );

  const imageRaw = firstDefined(
    pick(node, 'image_url'),
    pick(node, 'imageUrl'),
    pick(node, 'image'),
    pick(node, 'thumbnail'),
    pick(node, 'thumbnail_url'),
    pick(node, 'thumbnailUrl'),
    pick(node, 'product_image'),
    pick(node, 'productImage'),
  );

  const price = formatPrice(priceRaw, currencyRaw);
  const previousPrice = formatPrice(prevRaw, currencyRaw);
  const stock = describeStock(stockRaw);
  const imageUrl =
    typeof imageRaw === 'string' && imageRaw.trim().startsWith('http')
      ? imageRaw.trim()
      : undefined;

  if (!price && !previousPrice && !stockRaw) return null;

  return {
    price,
    previousPrice,
    currency: typeof currencyRaw === 'string' ? currencyRaw : undefined,
    inStockLabel: stock.label,
    inStock: stock.bool,
    context: best.context,
    timestamp: best.timestamp,
    rawNode: node,
    imageUrl,
  };
}

function colorForSnapshot(base: WatchBase, snapshot: PriceSnapshot | null): number {
  if (!snapshot) return base.colors.warning;
  if (snapshot.inStock === true) return base.colors.success;
  if (snapshot.inStock === false) return base.colors.danger;
  return base.colors.primary;
}

function formatTimestamp(value?: string, fallback?: string): string | undefined {
  const target = value ?? fallback;
  if (!target) return undefined;
  const date = new Date(target);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString();
}

function truncate(input: string, max = 1000): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatProductLink(url: string): string {
  return `[View product](${url})`;
}

function resolveListTitle(entry: DisplayEntry): string {
  const candidate = entry.pageTitle?.trim() ?? entry.details?.title?.trim();
  if (candidate) return candidate;
  return hostFromUrl(entry.record.url);
}

function resolveImageUrl(
  base: WatchBase,
  watchUrl: string,
  details?: ChangeDetectionWatchDetails,
  snapshot?: PriceSnapshot | null,
): string | undefined {
  const detailsRecord = details ? (details as UnknownRecord) : null;
  const candidate = firstDefined(
    snapshot?.imageUrl,
    pick(toRecord(details?.latest_snapshot), 'image_url'),
    pick(toRecord(details?.latest_snapshot), 'image'),
    pick(toRecord(details?.latest_data), 'image_url'),
    pick(toRecord(details?.latest_data), 'image'),
    pick(detailsRecord, 'image_url'),
    pick(detailsRecord, 'image'),
    pick(detailsRecord, 'screenshot_url'),
    pick(detailsRecord, 'screenshot'),
    pick(toRecord(details?.last_notification), 'image'),
  );
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }
  const siteIcon = base.getSiteIconUrl(watchUrl);
  return siteIcon || undefined;
}

function applyPriceFields(
  embed: EmbedBuilder,
  snapshot: PriceSnapshot | null,
  details: ChangeDetectionWatchDetails | undefined,
) {
  const price = snapshot?.price ?? '—';
  const previous = snapshot?.previousPrice ?? '—';
  const stock = snapshot?.inStockLabel ?? '—';

  embed.addFields(
    { name: 'Current price', value: price, inline: true },
    { name: 'Previous price', value: previous, inline: true },
    { name: 'Availability', value: stock, inline: true },
  );

  const updated = formatTimestamp(
    snapshot?.timestamp,
    details?.last_changed ?? details?.last_checked,
  );
  if (updated) {
    embed.addFields({ name: 'Last updated', value: updated, inline: true });
  }
}

export function buildMinimalListEmbed(base: WatchBase, entry: DisplayEntry): EmbedBuilder {
  const title = resolveListTitle(entry);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setAuthor({ name: 'Watch Snapshot', iconURL: base.icons.snapshot })
    .setColor(colorForSnapshot(base, entry.priceSnapshot))
    .setFooter({ text: `Watch #${entry.index}` });

  if (entry.errorMessage) {
    embed.setDescription(`⚠️ ${entry.errorMessage}`);
  }

  embed.addFields({ name: 'Product', value: formatProductLink(entry.record.url), inline: false });

  const imageUrl = resolveImageUrl(base, entry.record.url, entry.details, entry.priceSnapshot);
  if (imageUrl) embed.setThumbnail(imageUrl);

  applyPriceFields(embed, entry.priceSnapshot, entry.details);

  return embed;
}

export function buildFullListEmbed(base: WatchBase, entry: DisplayEntry): EmbedBuilder {
  const embed = buildMinimalListEmbed(base, entry);

  const tags =
    Array.isArray(entry.record.tags) && entry.record.tags.length
      ? entry.record.tags.map((tag) => `\`${tag}\``).join(' ')
      : '—';
  embed.addFields({ name: 'Tags', value: tags, inline: false });

  const created = formatTimestamp(entry.record.created_at);
  if (created) {
    embed.addFields({ name: 'Created', value: created, inline: false });
  }

  embed.setFooter({ text: `Watch #${entry.index} · UUID ${entry.record.watch_uuid}` });

  return embed;
}

export function buildLatestEmbed(base: WatchBase, input: LatestEmbedInput): EmbedBuilder {
  const title =
    input.pageTitle?.trim() ?? input.details?.title?.trim() ?? hostFromUrl(input.watchUrl);
  const embed = new EmbedBuilder()
    .setTitle(`💰 ${title}`)
    .setAuthor({ name: 'Watch Snapshot', iconURL: base.icons.snapshot })
    .setColor(colorForSnapshot(base, input.priceSnapshot))
    .addFields({ name: 'Watch UUID', value: `\`${input.uuid}\``, inline: true });

  const tagsDisplay = input.tags.length ? input.tags.map((tag) => `\`${tag}\``).join(' ') : '—';
  embed.addFields({ name: 'Tags', value: tagsDisplay, inline: true });
  embed.addFields({ name: 'Product', value: formatProductLink(input.watchUrl), inline: false });

  const imageUrl = resolveImageUrl(base, input.watchUrl, input.details, input.priceSnapshot);
  if (imageUrl) embed.setThumbnail(imageUrl);

  applyPriceFields(embed, input.priceSnapshot, input.details);
  if (!input.priceSnapshot) {
    embed.addFields({
      name: 'Price data',
      value: 'No price or stock data reported yet.',
      inline: false,
    });
  } else if (input.priceSnapshot.context) {
    embed.addFields({ name: 'Source', value: input.priceSnapshot.context, inline: true });
  }

  if (input.details?.last_notification?.body) {
    embed.addFields({
      name: input.details.last_notification.title ?? 'Last notification',
      value: truncate(String(input.details.last_notification.body), 1000),
      inline: false,
    });
  }

  if (input.errorMessage) {
    embed.setDescription(`⚠️ ${input.errorMessage}`);
  }

  return embed;
}
