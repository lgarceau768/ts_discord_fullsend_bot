import { env } from "../config.js";

export interface TraktSearchIds {
  trakt?: number;
  tmdb?: number;
  imdb?: string;
  slug?: string;
}

export interface TraktSearchResult {
  type: "movie" | "show";
  title: string;
  year?: number;
  ids?: TraktSearchIds;
  overview?: string;
  poster_url?: string;
  genres?: string[];
  rating?: number;
  runtime?: number;
}

/**
 * Perform a search against the user's n8n workflow. This helper posts the
 * provided query and type to the configured webhook URL. The API key, if
 * supplied, is passed as a Bearer token.
 *
 * @param query - Title to search for
 * @param type - Either `movie`, `show` or `both`
 * @returns An array of search results
 */
export async function searchTrakt(
  query: string,
  type: "movie" | "show" | "both",
): Promise<TraktSearchResult[]> {
  if (!env.N8N_SEARCH_URL) {
    throw new Error("N8N_SEARCH_URL environment variable is not set");
  }
  const body = JSON.stringify({ query, type });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.N8N_API_KEY) {
    headers["Authorization"] = `Bearer ${env.N8N_API_KEY}`;
  }
  const res = await fetch(env.N8N_SEARCH_URL, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`n8n search failed with status ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.results) ? (data.results as TraktSearchResult[]) : [];
}