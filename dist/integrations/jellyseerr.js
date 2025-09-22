// src/integrations/jellyseerr.ts
import { env } from "../config.js";
import { logger } from "../utils/logger.js";
function baseUrl() {
    if (!env.JELLYSEERR_URL)
        throw new Error("JELLYSEERR_URL is not configured");
    return env.JELLYSEERR_URL.replace(/\/$/, "");
}
function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (env.JELLYSEERR_API_KEY)
        h["X-Api-Key"] = env.JELLYSEERR_API_KEY;
    return h;
}
function parseBool(v) {
    if (v == null)
        return undefined;
    const s = String(v).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s))
        return true;
    if (["0", "false", "no", "n", "off"].includes(s))
        return false;
    return undefined;
}
function parseNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
function parseTagCsv(v) {
    if (!v)
        return undefined;
    const arr = String(v)
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0);
    return arr.length ? Array.from(new Set(arr)) : undefined;
}
/** Build default RequestOptions from environment variables (all optional). */
function defaultsFromEnv() {
    return {
        is4k: parseBool(env.JELLYSEERR_4K),
        isAutoApprove: parseBool(env.JELLYSEERR_AUTO_APPROVE),
        isAutoDownload: parseBool(env.JELLYSEERR_AUTO_DOWNLOAD),
        searchNow: parseBool(env.JELLYSEERR_SEARCH_NOW),
    };
}
export async function getDetails(mediaType, tmdbId) {
    const url = `${baseUrl()}/api/v1/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}`;
    const method = "GET";
    logger.debug({ url, method }, "Calling Jellyseerr API");
    const started = Date.now();
    const res = await fetch(url, { headers: authHeaders() });
    const durationMs = Date.now() - started;
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error({ url, method, status: res.status, durationMs, response: text?.slice(0, 200) }, "Jellyseerr API request failed");
        throw new Error(`Jellyseerr GET ${res.status}: ${text || res.statusText}`);
    }
    logger.debug({ url, method, status: res.status, durationMs }, "Jellyseerr API request succeeded");
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
export async function createRequest(mediaType, tmdbId, seasonsOrOptions) {
    const envDefaults = defaultsFromEnv();
    let options = {};
    if (Array.isArray(seasonsOrOptions)) {
        options.seasons = seasonsOrOptions;
    }
    else if (seasonsOrOptions && typeof seasonsOrOptions === "object") {
        options = { ...seasonsOrOptions };
    }
    // Fill in undefined fields from env defaults
    const merged = { ...envDefaults, ...options };
    // Build body per Jellyseerr /request schema
    const body = {
        mediaType, // "movie" | "tv"
        mediaId: tmdbId, // TMDB id
    };
    if (mediaType === "tv" && merged.seasons?.length) {
        body.seasons = merged.seasons;
    }
    if (merged.is4k !== undefined)
        body.is4k = merged.is4k;
    if (merged.isAutoApprove !== undefined)
        body.isAutoApprove = merged.isAutoApprove;
    if (merged.isAutoDownload !== undefined)
        body.isAutoDownload = merged.isAutoDownload;
    if (merged.searchNow !== undefined)
        body.searchNow = merged.searchNow;
    if (merged.serverId !== undefined)
        body.serverId = merged.serverId;
    if (merged.profileId !== undefined)
        body.profileId = merged.profileId;
    if (merged.rootFolder !== undefined)
        body.rootFolder = merged.rootFolder;
    if (merged.languageProfileId !== undefined)
        body.languageProfileId = merged.languageProfileId;
    if (merged.tags && merged.tags.length)
        body.tags = merged.tags;
    const url = `${baseUrl()}/api/v1/request`;
    const method = "POST";
    logger.debug({ url, method, payload: body }, "Calling Jellyseerr API");
    const started = Date.now();
    const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    const durationMs = Date.now() - started;
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error({ url, method, status: res.status, durationMs, response: text?.slice(0, 200) }, "Jellyseerr API request failed");
        throw new Error(`Jellyseerr POST ${res.status}: ${text || res.statusText}`);
    }
    logger.debug({ url, method, status: res.status, durationMs }, "Jellyseerr API request succeeded");
    return res.json();
}
export function pickDefaultSeasons(totalSeasons) {
    const def = env.JELLYSEERR_SERIES_DEFAULT ?? "first"; // all | first | latest
    if (!totalSeasons || totalSeasons < 1)
        return [1];
    if (def === "all")
        return Array.from({ length: totalSeasons }, (_, i) => i + 1);
    if (def === "latest")
        return [totalSeasons];
    return [1]; // first
}
