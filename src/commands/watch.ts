import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type { SlashCommand } from "./_types.js";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { logger } from "../logger.js";

/** --------------------- Config / setup --------------------- */

const CD_URL = process.env.CHANGEDETECTION_URL?.replace(/\/$/, "");
const CD_KEY = process.env.CHANGEDETECTION_API_KEY || "";
const CD_NOTIFY_URL = process.env.CHANGEDETECTION_NOTIFICATION_URL || "";
const CD_TEMPLATE_PATH = process.env.CHANGEDETECTION_NOTIFICATION_TEMPLATE_PATH || "";
const PAGE_TITLE_TIMEOUT_MS = 5000;

const API_BASE = `${CD_URL}/api/v1`;

if (!CD_URL) {
  // We throw at runtime in handler to give a user-friendly error; keep building commands OK.
  // throw new Error("CHANGEDETECTION_URL not configured");
}

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: /^\s*(true|1|yes|on)\s*$/i.test(process.env.PGSSL || "") ? { rejectUnauthorized: false } : undefined,
});

function loadSql(name: string): string {
  const sqlPath = new URL(`../sql/${name}`, import.meta.url);
  const contents = fs.readFileSync(sqlPath, "utf-8");
  logger.debug({ sqlFile: sqlPath.pathname }, "Loaded SQL file for watch command");
  return contents;
}

const SQL_ENSURE_CD_WATCHES = loadSql("cd_watches_ensure.sql");
const SQL_INSERT_CD_WATCH = loadSql("cd_watches_insert.sql");
const SQL_LIST_CD_WATCHES = loadSql("cd_watches_list.sql");
const SQL_DELETE_CD_WATCH = loadSql("cd_watches_delete.sql");
const SQL_GET_CD_WATCH = loadSql("cd_watches_get.sql");

let ensuredTable = false;
async function ensureTable() {
  if (!ensuredTable) {
    logger.debug("Ensuring cd_watches table exists");
  }
  await pool.query(SQL_ENSURE_CD_WATCHES);
  ensuredTable = true;
}

/** Load notification template (once). */
let NOTIF_TEMPLATE = "Change detected on {{watch_url}}\n\nOld → New diff available in ChangeDetection.";
if (CD_TEMPLATE_PATH) {
  try {
    const p = path.resolve(CD_TEMPLATE_PATH);
    NOTIF_TEMPLATE = fs.readFileSync(p, "utf-8");
  } catch {
    // keep default
  }
}

const templateHasWatchUrlPlaceholder = /\{\{\s*watch_url\s*\}\}/.test(NOTIF_TEMPLATE);
logger.info({
  templatePath: CD_TEMPLATE_PATH || "default",
  templateHasWatchUrlPlaceholder,
}, "Watch notification template loaded");

function renderTemplate(template: string, ctx: Record<string, string>): string {
  return Object.entries(ctx).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ""),
    template,
  );
}

async function fetchPageTitle(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      logger.debug({ url }, "Skipping page title fetch for unsupported protocol");
      return null;
    }
  } catch {
    logger.warn({ url }, "Invalid URL, skipping page title fetch");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_TITLE_TIMEOUT_MS);
  try {
    const res = await fetch(parsed, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FullSendBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status, url }, "Failed to fetch page title (status)");
      return null;
    }
    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = match?.[1]?.trim() || null;
    if (!title) {
      logger.debug({ url }, "No <title> tag found when fetching page");
    }
    return title;
  } catch (err) {
    logger.warn({ url, err }, "Failed to fetch page title");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** --------------------- ChangeDetection API --------------------- */


// --- Tag helpers (API expects tag UUIDs on create) ---
type TagListResponse = Record<string, { uuid: string; title: string }>;

function cdHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CD_KEY) h["x-api-key"] = CD_KEY; // header is case-insensitive, use canonical from docs
  return h;
}

async function cdListTags(): Promise<TagListResponse> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  const r = await fetch(`${API_BASE}/tags`, { headers: cdHeaders() });
  if (!r.ok) throw new Error(`List tags failed: ${r.status} ${r.statusText}`);
  return r.json();
}

async function cdCreateTag(title: string): Promise<string> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  const r = await fetch(`${API_BASE}/tag`, {
    method: "POST",
    headers: cdHeaders(),
    body: JSON.stringify({ title }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Create tag "${title}" failed: ${r.status} ${JSON.stringify(j)}`);
  return j.uuid as string;
}

/** Ensure tag titles exist; return their UUIDs preserving input order (de-duped). */
async function ensureTagsByTitle(titles: string[]): Promise<string[]> {
  const unique = Array.from(new Set((titles || []).map(t => t.trim()).filter(Boolean)));
  if (!unique.length) return [];
  const existing = await cdListTags(); // keyed by UUID
  const byTitle = new Map<string, string>();
  for (const [uuid, obj] of Object.entries(existing)) {
    if (obj?.title) byTitle.set(obj.title, uuid);
  }
  const uuids: string[] = [];
  for (const t of unique) {
    const hit = byTitle.get(t);
    if (hit) { uuids.push(hit); continue; }
    const created = await cdCreateTag(t);
    uuids.push(created);
  }
  return uuids;
}

type CreateWatchResp = { uuid?: string; id?: string; watch_uuid?: string } & Record<string, unknown>;

type ChangeDetectionWatchDetails = {
  uuid?: string;
  title?: string;
  url?: string;
  last_checked?: string;
  last_changed?: string;
  last_notification?: {
    title?: string;
    body?: string;
    date?: string;
    timestamp?: string;
    ts?: number;
  } & Record<string, unknown>;
  latest_snapshot?: Record<string, unknown>;
  latest_data?: Record<string, unknown>;
  [key: string]: unknown;
};

type ChangeDetectionHistoryEntry = {
  timestamp?: string | number;
  ts?: string | number;
  date?: string;
  time?: string;
  data?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  [key: string]: unknown;
};

type CreateWatchOpts = {
  url: string;
  title?: string;
  tagTitles: string[];                  // human-readable tag titles; will be resolved to UUIDs
  notificationUrl: string;
  notificationBody: string;
  notificationTitle: string;
  notificationFormat?: "Markdown" | "Text" | "HTML";
  trackLdjsonPriceData?: boolean;
  fetchBackend?: "html_webdriver" | "html_requests";
  webdriverDelaySec?: number;
  intervalMinutes?: number;             // schedule check interval
};

async function cdCreateWatch(opts: CreateWatchOpts): Promise<string> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  if (!opts.url) throw new Error("Missing URL");

  const useBackend = opts.fetchBackend ?? "html_webdriver";
  const intervalMinutes = typeof opts.intervalMinutes === "number" ? opts.intervalMinutes : 20;
  const webdriverDelaySec = typeof opts.webdriverDelaySec === "number" ? opts.webdriverDelaySec : 3;

  // Resolve tag titles -> UUIDs as required by API
  const tagUUIDs = await ensureTagsByTitle(opts.tagTitles || []);

  logger.debug({
    url: opts.url,
    notificationUrl: opts.notificationUrl,
    tagTitles: opts.tagTitles,
    tagUUIDs,
    notificationFormat: opts.notificationFormat ?? "Markdown",
    trackLdjsonPriceData: opts.trackLdjsonPriceData ?? true,
    fetchBackend: useBackend,
    intervalMinutes,
    webdriverDelaySec,
  }, "Creating ChangeDetection watch");

  const payload: any = {
    url: opts.url,
    title: opts.title ?? undefined,
    tags: tagUUIDs,
    fetch_backend: useBackend,
    processor: "restock_diff", // Use Re-stock & Price detection for single product pages
    webdriver_delay: useBackend === "html_webdriver" ? webdriverDelaySec : undefined,
    time_between_check: { minutes: intervalMinutes },
    notification_urls: [opts.notificationUrl],
    notification_body: opts.notificationBody,
    notification_title: opts.notificationTitle,
    notification_format: opts.notificationFormat ?? "Markdown", // Enum: "Text" | "HTML" | "Markdown"
    track_ldjson_price_data: opts.trackLdjsonPriceData ?? true,
  };

  const res = await fetch(`${API_BASE}/watch`, {
    method: "POST",
    headers: cdHeaders(),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: CreateWatchResp = {};
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    const msg = json && Object.keys(json).length ? JSON.stringify(json) : text || res.statusText;
    logger.error({ status: res.status, body: text, url: opts.url, payload }, "ChangeDetection create failed");
    throw new Error(`ChangeDetection create failed: ${msg}`);
  }

  const uuid = json.uuid || json.watch_uuid || json.id;
  if (!uuid) throw new Error("ChangeDetection did not return a watch UUID");
  logger.debug({ uuid, url: opts.url }, "ChangeDetection watch created successfully");
  // Ensure processor is set (some versions may ignore it on POST)
  try {
    const updRes = await fetch(`${API_BASE}/watch/${encodeURIComponent(uuid)}`, {
      method: "PUT",
      headers: cdHeaders(),
      body: JSON.stringify({ processor: "restock_diff" }),
    });
    if (!updRes.ok) {
      const t = await updRes.text().catch(() => "");
      logger.warn({ uuid, status: updRes.status, body: t }, "Failed to enforce restock_diff processor via PUT");
    } else {
      logger.debug({ uuid }, "Processor restock_diff confirmed via PUT");
    }
  } catch (err) {
    logger.warn({ uuid, err }, "Error enforcing restock_diff processor via PUT");
  }
  return uuid;
}

/** Delete a watch by UUID (for /watch remove). */
async function cdDeleteWatch(uuid: string): Promise<void> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  logger.debug({ uuid }, "Deleting ChangeDetection watch");
  const res = await fetch(`${CD_URL}/api/v1/watch/${encodeURIComponent(uuid)}`, {
    method: "DELETE",
    headers: cdHeaders(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    logger.warn({ uuid, status: res.status, body: t }, "ChangeDetection delete failed");
    throw new Error(`ChangeDetection delete failed: ${t || res.statusText}`);
  }
  logger.debug({ uuid }, "Deleted ChangeDetection watch");
}

async function cdGetWatchDetails(uuid: string): Promise<ChangeDetectionWatchDetails> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  const res = await fetch(`${API_BASE}/watch/${encodeURIComponent(uuid)}`, {
    headers: cdHeaders(),
  });
  const text = await res.text();
  let json: ChangeDetectionWatchDetails = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    logger.error({ uuid, status: res.status, body: text }, "Failed to fetch ChangeDetection watch details");
    throw new Error(`Failed to fetch watch details: ${text || res.statusText}`);
  }
  return json;
}

async function cdGetWatchHistory(uuid: string): Promise<ChangeDetectionHistoryEntry[]> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  const res = await fetch(`${API_BASE}/watch/${encodeURIComponent(uuid)}/history`, {
    headers: cdHeaders(),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    if (res.status === 404) {
      logger.warn({ uuid }, "Watch history not found (404)");
      return [];
    }
    logger.error({ uuid, status: res.status, body: text }, "Failed to fetch ChangeDetection watch history");
    throw new Error(`Failed to fetch watch history: ${text || res.statusText}`);
  }
  if (Array.isArray(json)) return json as ChangeDetectionHistoryEntry[];
  if (json && typeof json === "object" && Array.isArray((json as any).history)) {
    return (json as any).history as ChangeDetectionHistoryEntry[];
  }
  return [];
}

type PriceSnapshot = {
  price?: string;
  previousPrice?: string;
  currency?: string;
  inStockLabel?: string;
  inStock?: boolean | null;
  context?: string;
  timestamp?: string;
  rawNode?: Record<string, unknown>;
};

function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function toTimestampString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    // treat as seconds if small, milliseconds if large
    if (value > 1e12) return new Date(value).toISOString();
    if (value > 1e9) return new Date(value * 1000).toISOString();
  }
  return undefined;
}

function describeStock(raw: unknown): { label: string; bool: boolean | null } {
  if (typeof raw === "boolean") {
    return { label: raw ? "In stock" : "Out of stock", bool: raw };
  }
  if (typeof raw === "number") {
    const bool = raw > 0;
    return { label: bool ? "In stock" : "Out of stock", bool };
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return { label: raw, bool: null };
    if (["in stock", "instock", "available", "true", "yes"].some((k) => normalized.includes(k))) {
      return { label: raw, bool: true };
    }
    if (["out of stock", "oos", "sold out", "false", "no"].some((k) => normalized.includes(k))) {
      return { label: raw, bool: false };
    }
    return { label: raw, bool: null };
  }
  if (raw === null || raw === undefined) {
    return { label: "Unknown", bool: null };
  }
  return { label: String(raw), bool: null };
}

function formatPrice(raw: unknown, currency?: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const currencyStr = typeof currency === "string" ? currency.trim() : undefined;
  let value: string;
  if (typeof raw === "number") {
    value = raw.toFixed(2);
  } else {
    value = String(raw).trim();
  }
  if (!value) return undefined;
  if (currencyStr) {
    if (/^[A-Za-z]{3}$/.test(currencyStr)) return `${currencyStr} ${value}`;
    return `${currencyStr}${value}`;
  }
  return value;
}

type PriceCandidate = {
  node: Record<string, unknown>;
  context: string;
  timestamp?: string;
  score: number;
};

function findPriceCandidate(root: Record<string, unknown>, context: string, timestamp?: string): PriceCandidate | null {
  const queue: Array<{ node: Record<string, unknown>; path: string[] }> = [{ node: root, path: [] }];
  let best: { node: Record<string, unknown>; score: number } | null = null;
  while (queue.length) {
    const { node, path } = queue.shift()!;
    const entries = Object.entries(node);
    const priceKeys = entries.filter(([key, val]) => /price|amount|cost/i.test(key) && val !== null && typeof val !== "object").map(([key]) => key);
    const stockKeys = entries.filter(([key, val]) => /(in[_-]?stock|availability|available|stock)/i.test(key) && val !== null && typeof val !== "object").map(([key]) => key);
    const currencyKeys = entries.filter(([key, val]) => /currency|symbol/i.test(key) && val !== null && typeof val !== "object").map(([key]) => key);
    const score = (priceKeys.length ? 3 : 0) + (stockKeys.length ? 2 : 0) + (currencyKeys.length ? 1 : 0) + (path.some((p) => /restock|price/i.test(p)) ? 1 : 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { node, score };
    }
    for (const [key, value] of entries) {
      if (value && typeof value === "object") {
        queue.push({ node: value as Record<string, unknown>, path: path.concat(key) });
      }
    }
  }
  if (!best) return null;
  return { node: best.node, context, timestamp, score: best.score };
}

function extractPriceSnapshot(
  details: ChangeDetectionWatchDetails | undefined,
  history: ChangeDetectionHistoryEntry[]
): PriceSnapshot | null {
  const candidates: PriceCandidate[] = [];
  const pushCandidate = (node: unknown, context: string, timestamp?: unknown) => {
    if (!node || typeof node !== "object") return;
    const ts = toTimestampString(timestamp);
    const candidate = findPriceCandidate(node as Record<string, unknown>, context, ts);
    if (candidate) candidates.push(candidate);
  };

  if (details) {
    pushCandidate(details.latest_snapshot, "latest_snapshot", (details.latest_snapshot as any)?.timestamp ?? details.last_changed ?? details.last_checked);
    pushCandidate(details.latest_data, "latest_data", (details.latest_data as any)?.timestamp ?? details.last_changed ?? details.last_checked);
    pushCandidate(details.last_notification, "last_notification", details.last_notification?.timestamp ?? details.last_notification?.date ?? details.last_notification?.ts);
    pushCandidate(details as Record<string, unknown>, "watch", details.last_changed ?? details.last_checked);
  }
  history.forEach((entry, idx) => {
    const ts = entry.timestamp ?? entry.ts ?? entry.time ?? entry.date;
    pushCandidate(entry.snapshot, `history[${idx}].snapshot`, ts);
    pushCandidate(entry.data, `history[${idx}].data`, ts);
    pushCandidate(entry as Record<string, unknown>, `history[${idx}]`, ts);
  });

  if (!candidates.length) return null;

  const best = candidates.reduce((acc, curr) => (curr.score > acc.score ? curr : acc));
  const nodeAny = best.node as Record<string, unknown> & { [key: string]: any };

  const priceRaw = firstDefined(
    nodeAny.current_price,
    nodeAny.price_now,
    nodeAny.new_price,
    nodeAny.latest_price,
    nodeAny.price,
    nodeAny.amount,
    nodeAny.value,
    nodeAny.cost,
    nodeAny.current?.price,
    nodeAny.latest?.price,
  );
  const prevRaw = firstDefined(
    nodeAny.previous_price,
    nodeAny.old_price,
    nodeAny.price_was,
    nodeAny.previous,
    nodeAny.previous?.price,
    nodeAny.old?.price,
  );
  const currencyRaw = firstDefined(
    nodeAny.currency,
    nodeAny.currency_symbol,
    nodeAny.currencySymbol,
    nodeAny.currencyCode,
    nodeAny.currency_code,
    nodeAny.current?.currency,
  );
  const stockRaw = firstDefined(
    nodeAny.in_stock,
    nodeAny.inStock,
    nodeAny.stock,
    nodeAny.available,
    nodeAny.availability,
    nodeAny.is_available,
    nodeAny.isAvailable,
  );

  const price = formatPrice(priceRaw, currencyRaw);
  const previousPrice = formatPrice(prevRaw, currencyRaw);
  const stock = describeStock(stockRaw);

  if (!price && !previousPrice && !stockRaw) {
    return null;
  }

  return {
    price,
    previousPrice,
    currency: typeof currencyRaw === "string" ? currencyRaw : undefined,
    inStockLabel: stock.label,
    inStock: stock.bool,
    context: best.context,
    timestamp: best.timestamp,
    rawNode: best.node,
  };
}

/** --------------------- Helpers --------------------- */

function parseTags(input?: string | null): string[] {
  if (!input) return [];
  return input
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 15); // sanity
}

function mkOwnerTags(userId: string, requesterTag: string, store?: string | null, extras?: string[]) {
  const base = [
    `by:${requesterTag}`,
    "price-watch",
  ];
  if (store) base.push(`store:${store}`);
  if (extras?.length) base.push(...extras);
  // de-dupe
  return Array.from(new Set(base));
}

/** Persist ownership mapping. */
async function dbInsertWatch(args: {
  userId: string; userTag: string; watchUuid: string; url: string; tags: string[];
}) {
  await ensureTable();
  await pool.query(
    SQL_INSERT_CD_WATCH,
    [args.userId, args.userTag, args.watchUuid, args.url, args.tags],
  );
  logger.debug({
    userId: args.userId,
    watchUuid: args.watchUuid,
  }, "Inserted ChangeDetection watch mapping");
}

async function dbListWatches(userId: string) {
  await ensureTable();
  const { rows } = await pool.query(
    SQL_LIST_CD_WATCHES,
    [userId],
  );
  logger.debug({ userId, count: rows.length }, "Fetched ChangeDetection watches for user");
  return rows as { watch_uuid: string; url: string; tags: string[]; created_at: string }[];
}

async function dbDeleteWatch(userId: string, uuid: string) {
  await ensureTable();
  const { rowCount } = await pool.query(
    SQL_DELETE_CD_WATCH,
    [userId, uuid],
  );
  logger.debug({ userId, uuid, deleted: rowCount }, "Removed ChangeDetection watch mapping");
  return (rowCount ?? 0) > 0;
}

async function dbGetWatch(userId: string, uuid: string) {
  await ensureTable();
  const { rows } = await pool.query(
    SQL_GET_CD_WATCH,
    [userId, uuid],
  );
  const row = rows[0] as { watch_uuid: string; url: string; tags: string[]; created_at: string } | undefined;
  if (row) {
    logger.debug({ userId, uuid }, "Fetched single watch for user");
  } else {
    logger.debug({ userId, uuid }, "Watch not found for user");
  }
  return row ?? null;
}

/** Render a short embed for list/remove responses. */
function watchEmbed(url: string, uuid: string, tags: string[], createdAt?: string) {
  const e = new EmbedBuilder()
    .setTitle("🔔 ChangeDetection Watch")
    .setDescription(url)
    .addFields(
      { name: "UUID", value: `\`${uuid}\``, inline: false },
      { name: "Tags", value: tags.length ? tags.map((t) => `\`${t}\``).join(" ") : "—", inline: false },
    );
  if (createdAt) {
    e.setFooter({ text: `Created ${new Date(createdAt).toLocaleString()}` });
  }
  return e;
}

function truncate(input: string, max = 1000): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}

function formatTimestamp(value?: string, fallback?: string): string | undefined {
  const target = value ?? fallback;
  if (!target) return undefined;
  const date = new Date(target);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString();
}

function latestEmbed(opts: {
  uuid: string;
  watchUrl: string;
  tags: string[];
  details?: ChangeDetectionWatchDetails;
  priceSnapshot: PriceSnapshot | null;
}): EmbedBuilder {
  const { uuid, watchUrl, tags, details, priceSnapshot } = opts;
  const embed = new EmbedBuilder()
    .setTitle(details?.title ? `💰 ${details.title}` : "💰 Latest price & stock")
    .setURL(watchUrl)
    .setDescription(watchUrl)
    .addFields({ name: "Watch UUID", value: `\`${uuid}\``, inline: true });

  const tagsDisplay = tags.length ? tags.map((t) => `\`${t}\``).join(" ") : "—";
  embed.addFields({ name: "Tags", value: tagsDisplay, inline: true });

  if (priceSnapshot) {
    embed.addFields(
      { name: "Current price", value: priceSnapshot.price ?? "—", inline: true },
      { name: "Previous price", value: priceSnapshot.previousPrice ?? "—", inline: true },
      { name: "Stock", value: priceSnapshot.inStockLabel ?? "—", inline: true },
    );
    if (priceSnapshot.context) {
      embed.addFields({ name: "Source", value: priceSnapshot.context, inline: true });
    }
    const ts = formatTimestamp(priceSnapshot.timestamp, details?.last_changed ?? details?.last_checked);
    if (ts) embed.addFields({ name: "Last updated", value: ts, inline: true });
  } else {
    const ts = formatTimestamp(details?.last_changed ?? details?.last_checked);
    if (ts) {
      embed.addFields({ name: "Last checked", value: ts, inline: true });
    }
    embed.addFields({ name: "Price data", value: "No price or stock data reported yet.", inline: false });
  }

  const lastNotifBody = details?.last_notification?.body;
  if (typeof lastNotifBody === "string" && lastNotifBody.trim()) {
    embed.addFields({
      name: details?.last_notification?.title ?? "Last notification",
      value: truncate(lastNotifBody.trim(), 1000),
      inline: false,
    });
  }

  return embed;
}

/** --------------------- Slash command --------------------- */

export default {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Manage ChangeDetection watches")
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add a website to ChangeDetection (price watch)")
        .addStringOption((o) =>
          o.setName("url").setDescription("Product/website URL").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("store").setDescription("Store name (e.g., bestbuy, target, etc.)"),
        )
        .addStringOption((o) =>
          o
            .setName("tags")
            .setDescription("Extra tags (comma or space separated, e.g., gpu,4090,deal)"),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("list")
        .setDescription("List your watches"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove one of your watches")
        .addStringOption((o) =>
          o
            .setName("uuid")
            .setDescription("Watch UUID (from /watch list)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("latest")
        .setDescription("Show the latest price/stock data for one of your watches")
        .addStringOption((o) =>
          o
            .setName("uuid")
            .setDescription("Watch UUID (from /watch list)")
            .setRequired(true),
        ),
    )
    // Optional: restrict to guild use if you like
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  async execute(interaction: any) {
    const sub = interaction.options.getSubcommand(true);
    logger.debug({
      userId: interaction.user.id,
      subcommand: sub,
      guildId: interaction.guildId,
    }, "Handling /watch command");

    if (!CD_URL) {
      await interaction.reply({ content: "❌ CHANGEDETECTION_URL is not configured.", ephemeral: true });
      logger.warn("CHANGEDETECTION_URL is not configured; rejecting /watch command");
      return;
    }
    if (!CD_NOTIFY_URL) {
      await interaction.reply({ content: "❌ CHANGEDETECTION_NOTIFICATION_URL is not configured.", ephemeral: true });
      logger.warn("CHANGEDETECTION_NOTIFICATION_URL is not configured; rejecting /watch command");
      return;
    }

    if (sub === "add") {
      const url = interaction.options.getString("url", true).trim();
      const store = interaction.options.getString("store")?.trim().toLowerCase() || null;
      const extraTags = parseTags(interaction.options.getString("tags"));
      const userId = interaction.user.id;
      const requesterTag = `${interaction.user.username}#${interaction.user.discriminator ?? "0000"}`;

      await interaction.deferReply();

      logger.debug({ userId, url, store, extraTags }, "Processing /watch add");

      try {
        // Build tags + title
        const tags = mkOwnerTags(userId, requesterTag, store, extraTags);
        const pageTitle = await fetchPageTitle(url);
        const title = pageTitle
          ? `[PRICE WATCH] ${pageTitle}`
          : `[PRICE WATCH] ${store ? `[${store}] ` : ""}${url}`;

        const templateContext = {
          user: requesterTag,
          user_id: userId,
          store: store ?? "",
          watch_url: url,
        } as const;
        const body = renderTemplate(NOTIF_TEMPLATE, templateContext);
        const notificationTitle = renderTemplate("{{watch_url}}", templateContext);
        const bodyHasPlaceholders = /\{\{[^}]+\}\}/.test(body);
        logger.info({ bodyHasPlaceholders, notificationTitle }, "Rendered watch notification template");

        if (!/^([a-z]+):\/\//i.test(CD_NOTIFY_URL)) {
          logger.warn({ CD_NOTIFY_URL }, "Notification URL appears invalid (missing scheme)");
        }

        const uuid = await cdCreateWatch({
          url,
          title,
          tagTitles: tags,
          notificationUrl: CD_NOTIFY_URL,
          notificationBody: body,
          notificationTitle,
          notificationFormat: "Markdown",
          trackLdjsonPriceData: true,
          fetchBackend: "html_webdriver",
          webdriverDelaySec: 3,
          intervalMinutes: 20,
        });

        await dbInsertWatch({ userId, userTag: requesterTag, watchUuid: uuid, url, tags });

        logger.info({ userId, uuid, url }, "Watch created and stored");
        const embed = watchEmbed(url, uuid, tags);
        await interaction.editReply({
          content: `✅ Watch created in ChangeDetection and linked to your account.`,
          embeds: [embed],
        });
      } catch (e: any) {
        logger.error({ err: e }, "Failed to process /watch add");
        await interaction.editReply(`❌ Failed to create watch: ${e?.message ?? "Unknown error"}`);
      }
      return;
    }

    if (sub === "list") {
      await interaction.deferReply({ ephemeral: true }); // list can be noisy; ephemeral is fine here
      logger.debug({ userId: interaction.user.id }, "Processing /watch list");
      try {
        const rows = await dbListWatches(interaction.user.id);
        if (!rows.length) {
          await interaction.editReply("You have no watches yet. Add one with `/watch add`.");
          logger.debug({ userId: interaction.user.id }, "No watches found for user");
          return;
        }
        const embeds = rows.slice(0, 10).map((r) => watchEmbed(r.url, r.watch_uuid, r.tags, r.created_at));
        const summary = rows
          .slice(0, 10)
          .map((r, i) => `${i + 1}. \`${r.watch_uuid}\` — ${r.url}`)
          .join("\n");
        await interaction.editReply({
          content:
            `You have **${rows.length}** watch(es):\n` +
            summary +
            (rows.length > 10 ? `\n…and ${rows.length - 10} more.` : ""),
          embeds,
        });
        logger.debug({ userId: interaction.user.id, count: rows.length }, "/watch list completed");
      } catch (e: any) {
        logger.error({ err: e, userId: interaction.user.id }, "Failed to list watches");
        await interaction.editReply(`❌ Failed to list watches: ${e?.message ?? "Unknown error"}`);
      }
      return;
    }

    if (sub === "remove") {
      const uuid = interaction.options.getString("uuid", true).trim();
      await interaction.deferReply();

      logger.debug({ userId: interaction.user.id, uuid }, "Processing /watch remove");

      try {
        // Check ownership
        const ok = await dbDeleteWatch(interaction.user.id, uuid);
        if (!ok) {
          await interaction.editReply(
            "❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.",
          );
          logger.warn({ userId: interaction.user.id, uuid }, "/watch remove denied: not found or unauthorized");
          return;
        }

        // Try to delete from ChangeDetection (best-effort; if it fails, we already removed local ownership)
        try {
          await cdDeleteWatch(uuid);
        } catch (e: any) {
          // Log but do not fail hard
          logger.warn({ err: e, uuid }, "ChangeDetection delete failed during /watch remove");
        }

        await interaction.editReply(`🗑️ Removed watch \`${uuid}\`.`);
        logger.info({ userId: interaction.user.id, uuid }, "Watch removed for user");
      } catch (e: any) {
        logger.error({ err: e, userId: interaction.user.id, uuid }, "Failed to remove watch");
        await interaction.editReply(`❌ Failed to remove watch: ${e?.message ?? "Unknown error"}`);
      }
      return;
    }

    if (sub === "latest") {
      const uuid = interaction.options.getString("uuid", true).trim();
      await interaction.deferReply({ ephemeral: true });

      logger.debug({ userId: interaction.user.id, uuid }, "Processing /watch latest");

      try {
        const record = await dbGetWatch(interaction.user.id, uuid);
        if (!record) {
          await interaction.editReply(
            "❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.",
          );
          logger.warn({ userId: interaction.user.id, uuid }, "/watch latest denied: not found or unauthorized");
          return;
        }
        const tags = Array.isArray(record.tags) ? record.tags : [];

        let details: ChangeDetectionWatchDetails | undefined;
        try {
          details = await cdGetWatchDetails(uuid);
        } catch (err: any) {
          logger.error({ err, uuid }, "Failed to fetch watch details for latest");
          throw err;
        }

        let history: ChangeDetectionHistoryEntry[] = [];
        try {
          history = await cdGetWatchHistory(uuid);
        } catch (err: any) {
          logger.warn({ err, uuid }, "Failed to fetch watch history; continuing without history");
        }

        const priceSnapshot = extractPriceSnapshot(details, history);
        if (!priceSnapshot) {
          logger.info({ uuid }, "No price/stock data found for latest");
        }

        const embed = latestEmbed({
          uuid,
          watchUrl: record.url,
          tags,
          details,
          priceSnapshot,
        });

        await interaction.editReply({
          content: priceSnapshot
            ? `📈 Latest price/stock data for \`${uuid}\`:`
            : `ℹ️ No price/stock data available yet for \`${uuid}\`.`,
          embeds: [embed],
        });
      } catch (e: any) {
        logger.error({ err: e, userId: interaction.user.id, uuid }, "Failed to process /watch latest");
        await interaction.editReply(`❌ Failed to fetch latest data: ${e?.message ?? "Unknown error"}`);
      }
      return;
    }

    logger.warn({ subcommand: sub }, "/watch invoked with unsupported subcommand");
  },
} satisfies SlashCommand;
