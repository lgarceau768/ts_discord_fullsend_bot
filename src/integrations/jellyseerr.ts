import { env } from "../config.js";

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