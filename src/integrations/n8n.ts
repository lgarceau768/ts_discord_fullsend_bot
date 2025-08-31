import { env } from "../config.js";

export type TraktType = "movie" | "show" | "both";

export type SearchItem = {
  type: "movie" | "show";
  title: string;
  year?: number;
  ids?: {
    trakt?: number;
    tmdb?: number;
    imdb?: string;
    slug?: string;
  };
  overview?: string;
};

export type N8nSearchResponse = {
  results?: SearchItem[];
};

/**
 * Calls your n8n webhook to perform a Trakt search.
 * Expected webhook contract (recommendation):
 *  - Method: POST
 *  - Body: { query: string, type?: "movie" | "show" | "both" }
 *  - Response: { results: SearchItem[] }
 */
export async function callTraktSearch(query: string, type: TraktType = "both"): Promise<SearchItem[]> {
  if (!env.N8N_SEARCH_URL) {
    throw new Error("N8N_SEARCH_URL is not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.N8N_API_KEY) {
    headers["Authorization"] = `Bearer ${env.N8N_API_KEY}`;
  }

  const res = await fetch(env.N8N_SEARCH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, type }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`n8n webhook failed (${res.status}): ${text || res.statusText}`);
  }

  let data: N8nSearchResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error("n8n webhook returned non-JSON response");
  }

  const items = data.results ?? [];
  return items.slice(0, 10);
}
