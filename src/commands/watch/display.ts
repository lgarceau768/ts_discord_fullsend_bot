/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-base-to-string */
import { EmbedBuilder } from 'discord.js';

import type {
  ChangeDetectionHistoryEntry,
  ChangeDetectionWatchDetails,
} from '../../types/changeDetection.js';
import type { DisplayEntry, PriceSnapshot, WatchBase } from '../../types/watch.js';

export type { PriceSnapshot, DisplayEntry } from '../../types/watch.js';

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
  return { label: String(raw), bool: null };
}

function formatPrice(raw: unknown, currency?: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const currencyStr = typeof currency === 'string' ? currency.trim() : undefined;
  const value = typeof raw === 'number' ? raw.toFixed(2) : String(raw).trim();
  if (!value) return undefined;
  if (currencyStr) {
    if (/^[A-Za-z]{3}$/.test(currencyStr)) return `${currencyStr} ${value}`;
    return `${currencyStr}${value}`;
  }
  return value;
}

interface PriceCandidate {
  node: Record<string, unknown> & Record<string, any>;
  context: string;
  timestamp?: string;
  score: number;
}

function findPriceCandidate(
  root: Record<string, unknown>,
  context: string,
  timestamp?: string,
): PriceCandidate | null {
  const queue: { node: Record<string, unknown>; path: string[] }[] = [{ node: root, path: [] }];
  let best: PriceCandidate | null = null;

  while (queue.length) {
    const { node, path } = queue.shift()!;
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
        node: node as Record<string, unknown> & Record<string, any>,
        score,
        context,
        timestamp,
      };
    }

    for (const [key, value] of entries) {
      if (value && typeof value === 'object') {
        queue.push({ node: value as Record<string, unknown>, path: path.concat(key) });
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
    if (!node || typeof node !== 'object') return;
    const ts = toTimestampString(timestamp);
    const candidate = findPriceCandidate(node as Record<string, unknown>, context, ts);
    if (candidate) candidates.push(candidate);
  };

  if (details) {
    pushCandidate(
      details.latest_snapshot,
      'latest_snapshot',
      (details.latest_snapshot as any)?.timestamp ?? details.last_changed ?? details.last_checked,
    );
    pushCandidate(
      details.latest_data,
      'latest_data',
      (details.latest_data as any)?.timestamp ?? details.last_changed ?? details.last_checked,
    );
    pushCandidate(
      details.last_notification,
      'last_notification',
      details.last_notification?.timestamp ??
        details.last_notification?.date ??
        details.last_notification?.ts,
    );
    pushCandidate(
      details as Record<string, unknown>,
      'watch',
      details.last_changed ?? details.last_checked,
    );
  }

  history.forEach((entry, index) => {
    const ts = entry.timestamp ?? entry.ts ?? entry.time ?? entry.date;
    pushCandidate(entry.snapshot, `history[${index}].snapshot`, ts);
    pushCandidate(entry.data, `history[${index}].data`, ts);
    pushCandidate(entry as Record<string, unknown>, `history[${index}]`, ts);
  });

  if (!candidates.length) return null;

  const best = candidates.reduce((acc, curr) => (curr.score > acc.score ? curr : acc));
  const node = best.node;

  const priceRaw = firstDefined(
    node.current_price,
    node.price_now,
    node.new_price,
    node.latest_price,
    node.price,
    node.amount,
    node.value,
    node.cost,
    node.current?.price,
    node.latest?.price,
  );

  const prevRaw = firstDefined(
    node.previous_price,
    node.old_price,
    node.price_was,
    node.previous,
    node.previous?.price,
    node.old?.price,
  );

  const currencyRaw = firstDefined(
    node.currency,
    node.currency_symbol,
    node.currencySymbol,
    node.currencyCode,
    node.currency_code,
    node.current?.currency,
  );

  const stockRaw = firstDefined(
    node.in_stock,
    node.inStock,
    node.stock,
    node.available,
    node.availability,
    node.is_available,
    node.isAvailable,
  );

  const imageRaw = firstDefined(
    node.image_url,
    node.imageUrl,
    node.image,
    node.thumbnail,
    node.thumbnail_url,
    node.thumbnailUrl,
    node.product_image,
    node.productImage,
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
  const candidate = firstDefined(
    snapshot?.imageUrl,
    (details?.latest_snapshot as any)?.image_url,
    (details?.latest_snapshot as any)?.image,
    (details?.latest_data as any)?.image_url,
    (details?.latest_data as any)?.image,
    (details as any)?.image_url,
    (details as any)?.image,
    (details as any)?.screenshot_url,
    (details as any)?.screenshot,
    (details?.last_notification as any)?.image,
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

interface LatestEmbedInput {
  uuid: string;
  watchUrl: string;
  tags: string[];
  details?: ChangeDetectionWatchDetails;
  priceSnapshot: PriceSnapshot | null;
  pageTitle?: string;
  errorMessage?: string;
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
