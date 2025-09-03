// src/integrations/jellyseerr.ts
import { env } from "../config.js";

export type MediaType = "movie" | "tv";

type JellyseerrMediaInfo = {
  status?: number; // 1=Pending, 2=Approved, 3=Processing, 4=Available, ...
};

export type JellyseerrDetails = {
  id: number; // TMDB id
  name?: string; // tv
  title?: string; // movie
  overview?: string;
  posterPath?: string;
  mediaInfo?: JellyseerrMediaInfo;
  seasons?: Array<{ seasonNumber: number }>;
};

export type RequestOptions = {
  /** Request 4K quality profile (if configured). */
  is4k?: boolean;
  /** Auto-approve the request (if your Jellyseerr permissions allow). */
  isAutoApprove?: boolean;
  /** Auto-download immediately (when approved). */
  isAutoDownload?: boolean;
  /** Trigger indexer/search immediately after creating the request. */
  searchNow?: boolean;

  /** Sonarr/Radarr server selection (numeric id in Jellyseerr). */
  serverId?: number;
  /** Quality profile id (Sonarr/Radarr). */
  profileId?: number;
  /** Root folder path or id (string as the API expects). */
  rootFolder?: string;
  /** Language profile id (Sonarr only). */
  languageProfileId?: number;
  /** Tag ids applied to created series/movie in Sonarr/Radarr. */
  tags?: number[];

  /** For TV requests you can pass explicit season numbers. */
  seasons?: number[];
};

function baseUrl(): string {
  if (!env.JELLYSEERR_URL) throw new Error("JELLYSEERR_URL is not configured");
  return env.JELLYSEERR_URL.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (env.JELLYSEERR_API_KEY) h["X-Api-Key"] = env.JELLYSEERR_API_KEY;
  return h;
}

function parseBool(v: unknown): boolean | undefined {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return undefined;
}

function parseNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseTagCsv(v: unknown): number[] | undefined {
  if (!v) return undefined;
  const arr = String(v)
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0);
  return arr.length ? Array.from(new Set(arr)) : undefined;
}

/** Build default RequestOptions from environment variables (all optional). */
function defaultsFromEnv(): RequestOptions {
  return {
    is4k: parseBool(env.JELLYSEERR_4K),
    isAutoApprove: parseBool(env.JELLYSEERR_AUTO_APPROVE),
    isAutoDownload: parseBool(env.JELLYSEERR_AUTO_DOWNLOAD),
    searchNow: parseBool(env.JELLYSEERR_SEARCH_NOW),
  };
}

export async function getDetails(
    mediaType: MediaType,
    tmdbId: number
): Promise<JellyseerrDetails> {
  const res = await fetch(
      `${baseUrl()}/api/v1/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}`,
      { headers: authHeaders() }
  );
  if (!res.ok)
    throw new Error(`Jellyseerr GET ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

/**
 * Create a request in Jellyseerr.
 *
 * Backward compatible call styles:
 *   - Movies: createRequest("movie", tmdbId)
 *   - TV (explicit seasons): createRequest("tv", tmdbId, [1,2,3])
 *   - Advanced: createRequest("movie"|"tv", tmdbId, { ...RequestOptions })
 *   - Advanced TV + seasons: createRequest("tv", tmdbId, { seasons: [1,2], ... })
 */
export async function createRequest(
    mediaType: MediaType,
    tmdbId: number,
    seasonsOrOptions?: number[] | RequestOptions
): Promise<any> {
  const envDefaults = defaultsFromEnv();

  let options: RequestOptions = {};
  if (Array.isArray(seasonsOrOptions)) {
    options.seasons = seasonsOrOptions;
  } else if (seasonsOrOptions && typeof seasonsOrOptions === "object") {
    options = { ...seasonsOrOptions };
  }

  // Fill in undefined fields from env defaults
  const merged: RequestOptions = { ...envDefaults, ...options };

  // Build body per Jellyseerr /request schema
  const body: any = {
    mediaType,               // "movie" | "tv"
    mediaId: tmdbId,         // TMDB id
  };

  if (mediaType === "tv" && merged.seasons?.length) {
    body.seasons = merged.seasons;
  }

  if (merged.is4k !== undefined) body.is4k = merged.is4k;
  if (merged.isAutoApprove !== undefined) body.isAutoApprove = merged.isAutoApprove;
  if (merged.isAutoDownload !== undefined) body.isAutoDownload = merged.isAutoDownload;
  if (merged.searchNow !== undefined) body.searchNow = merged.searchNow;

  if (merged.serverId !== undefined) body.serverId = merged.serverId;
  if (merged.profileId !== undefined) body.profileId = merged.profileId;
  if (merged.rootFolder !== undefined) body.rootFolder = merged.rootFolder;
  if (merged.languageProfileId !== undefined) body.languageProfileId = merged.languageProfileId;
  if (merged.tags && merged.tags.length) body.tags = merged.tags;

  const res = await fetch(`${baseUrl()}/api/v1/request`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok)
    throw new Error(`Jellyseerr POST ${res.status}: ${await res.text().catch(() => "")}`);

  return res.json();
}

export function pickDefaultSeasons(totalSeasons: number): number[] {
  const def = env.JELLYSEERR_SERIES_DEFAULT ?? "first"; // all | first | latest
  if (!totalSeasons || totalSeasons < 1) return [1];
  if (def === "all") return Array.from({ length: totalSeasons }, (_, i) => i + 1);
  if (def === "latest") return [totalSeasons];
  return [1]; // first
}