import { env } from "../config.js";

export type MediaType = "movie" | "tv";

type JellyseerrMediaInfo = {
  status?: number; // 1=Pending, 2=Approved, 3=Processing, 4=Available, ...
};

type JellyseerrDetails = {
  id: number; // TMDB id
  name?: string; // tv
  title?: string; // movie
  overview?: string;
  posterPath?: string;
  mediaInfo?: JellyseerrMediaInfo;
  seasons?: Array<{ seasonNumber: number }>;
};

/**
 * Perform a POST request to Jellyseerr to create a movie request. The
 * `mediaId` refers to the TMDb ID. Optionally specify if 4K should be
 * requested.
 */
export async function requestMovie(
  tmdbId: number,
  is4k = env.JELLYSEERR_4K === "true",
): Promise<any> {
  if (!env.JELLYSEERR_URL || !env.JELLYSEERR_API_KEY) {
    throw new Error("JELLYSEERR_URL and JELLYSEERR_API_KEY must be set for movie requests");
  }
  const url = `${env.JELLYSEERR_URL}/api/v1/request`;
  const body = JSON.stringify({
    mediaId: tmdbId,
    mediaType: "movie",
    is4k,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.JELLYSEERR_API_KEY,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Jellyseerr movie request failed with status ${res.status}`);
  }
  return await res.json();
}

/**
 * Perform a POST request to Jellyseerr to create a TV show request. Pass
 * an array of season numbers to request. When `is4k` is true the request
 * is flagged for 4K. The `seasons` array must be non-empty.
 */
export async function requestTV(
  tmdbId: number,
  seasons: number[],
  is4k = env.JELLYSEERR_4K === "true",
): Promise<any> {
  if (!env.JELLYSEERR_URL || !env.JELLYSEERR_API_KEY) {
    throw new Error("JELLYSEERR_URL and JELLYSEERR_API_KEY must be set for TV requests");
  }
  const url = `${env.JELLYSEERR_URL}/api/v1/request`;
  const body = JSON.stringify({
    mediaId: tmdbId,
    mediaType: "tv",
    seasons,
    is4k,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.JELLYSEERR_API_KEY,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Jellyseerr TV request failed with status ${res.status}`);
  }
  return await res.json();
}

/**
 * Fetch detailed information about a TV show from Jellyseerr. The response
 * includes season information which is used to determine which seasons to
 * request. See Jellyseerr API documentation for the exact shape of the
 * returned object.
 */
export async function getTV(tmdbId: number): Promise<any> {
  if (!env.JELLYSEERR_URL || !env.JELLYSEERR_API_KEY) {
    throw new Error("JELLYSEERR_URL and JELLYSEERR_API_KEY must be set to fetch TV info");
  }
  const url = `${env.JELLYSEERR_URL}/api/v1/tv/${tmdbId}`;
  const res = await fetch(url, {
    headers: {
      "X-Api-Key": env.JELLYSEERR_API_KEY,
    },
  });
  if (!res.ok) {
    throw new Error(`Jellyseerr getTV failed with status ${res.status}`);
  }
  return await res.json();
}

function baseUrl(): string {
  if (!env.JELLYSEERR_URL) throw new Error("JELLYSEERR_URL is not configured");
  return env.JELLYSEERR_URL.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (env.JELLYSEERR_API_KEY) h["X-Api-Key"] = env.JELLYSEERR_API_KEY;
  return h;
}

export async function getDetails(mediaType: MediaType, tmdbId: number): Promise<JellyseerrDetails> {
  const res = await fetch(`${baseUrl()}/api/v1/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Jellyseerr GET ${res.status}: ${await res.text().catch(()=>"")}`);
  return res.json();
}

export async function createRequest(
    mediaType: MediaType,
    tmdbId: number,
    seasons?: number[],
): Promise<any> {
  const body: any = { mediaId: tmdbId, mediaType, is4k: env.JELLYSEERR_4K === "true" };
  if (mediaType === "tv" && seasons?.length) body.seasons = seasons;
  const res = await fetch(`${baseUrl()}/api/v1/request`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Jellyseerr POST ${res.status}: ${await res.text().catch(()=>"")}`);
  return res.json();
}

export function pickDefaultSeasons(totalSeasons: number): number[] {
  const def = env.JELLYSEERR_SERIES_DEFAULT ?? "first"; // all | first | latest
  if (!totalSeasons || totalSeasons < 1) return [1];
  if (def === "all") return Array.from({ length: totalSeasons }, (_, i) => i + 1);
  if (def === "latest") return [totalSeasons];
  return [1]; // first
}