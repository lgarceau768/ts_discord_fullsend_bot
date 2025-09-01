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
    tvdb?: number;
    tvrage?: number | null;
  };
  overview?: string;

  // New camelCase fields from your n8n job
  posterUrl?: string;
  backdropUrl?: string;

  // Optional legacy snake_case (kept for back-compat in UI code)
  poster_url?: string;
  backdrop_url?: string;

  genres?: string[];
  rating?: number;
  runtime?: number;  // minutes (movie) or avg episode runtime (show)
  network?: string;  // for shows
};

type RawTraktResult =
    | {
  type?: "movie" | "show";
  score?: number;
  show?: any;
  movie?: any;

  // cases where your workflow already flattened these:
  title?: string;
  year?: number;
  ids?: Record<string, any>;
  overview?: string;

  // image hints in various shapes
  posterUrl?: string;  // new camelCase
  backdropUrl?: string;
  poster_url?: string; // legacy snake_case
  backdrop_url?: string;
  images?: { poster?: { url?: string }; backdrop?: { url?: string } };
}
    | string; // sometimes items arrive as JSON strings

type N8nResponse =
    | { results?: RawTraktResult[] }
    | RawTraktResult[];

function safeParse<T = any>(v: unknown): T {
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return v as T; }
  }
  return v as T;
}

function pickPoster(raw: any, obj: any): string | undefined {
  return (
      raw?.posterUrl ??
      raw?.poster_url ??
      obj?.posterUrl ??
      obj?.poster_url ??
      obj?.images?.poster?.url ??
      undefined
  );
}

function pickBackdrop(raw: any, obj: any): string | undefined {
  return (
      raw?.backdropUrl ??
      raw?.backdrop_url ??
      obj?.backdropUrl ??
      obj?.backdrop_url ??
      obj?.images?.backdrop?.url ??
      undefined
  );
}

function normalizeResult(rawIn: RawTraktResult): SearchItem | null {
  const raw = safeParse<any>(rawIn);

  // Already flat?
  if (raw && raw.title && (raw.type === "show" || raw.type === "movie") && !raw.show && !raw.movie) {
    const poster = pickPoster(raw, raw);
    const backdrop = pickBackdrop(raw, raw);
    return {
      type: raw.type,
      title: raw.title,
      year: raw.year,
      ids: raw.ids ?? {},
      overview: raw.overview,
      posterUrl: poster,
      backdropUrl: backdrop,
      poster_url: poster,
      backdrop_url: backdrop,
      genres: raw.genres ?? [],
      rating: raw.rating,
      runtime: raw.runtime,
      network: raw.network,
    };
  }

  // Trakt native search shape: { type, score, show|movie: {...} }
  const kind: "movie" | "show" = raw?.type === "show" || raw?.show ? "show" : "movie";
  const obj = raw?.show ?? raw?.movie ?? raw ?? {};

  const firstAiredYear = obj.first_aired ? new Date(obj.first_aired).getFullYear() : undefined;
  const poster = pickPoster(raw, obj);
  const backdrop = pickBackdrop(raw, obj);

  return {
    type: kind,
    title: obj?.title ?? obj?.name ?? "Unknown",
    year: obj?.year ?? firstAiredYear,
    ids: obj?.ids ?? raw?.ids ?? {},
    overview: obj?.overview ?? raw?.overview,
    posterUrl: poster,
    backdropUrl: backdrop,
    poster_url: poster,
    backdrop_url: backdrop,
    genres: obj?.genres ?? [],
    rating: obj?.rating,
    runtime: obj?.runtime,
    network: obj?.network,
  };
}

/**
 * Calls your n8n webhook to perform a Trakt search and returns normalized items.
 * Accepts either:
 *   1) { results: RawTraktResult[] }
 *   2) RawTraktResult[]
 */
export async function callTraktSearch(
    query: string,
    type: TraktType = "both"
): Promise<SearchItem[]> {
  if (!env.N8N_SEARCH_URL) {
    throw new Error("N8N_SEARCH_URL is not configured");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.N8N_API_KEY) headers["Authorization"] = `Bearer ${env.N8N_API_KEY}`;

  const res = await fetch(env.N8N_SEARCH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, type }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`n8n webhook failed (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as N8nResponse;
  const rawList: RawTraktResult[] = Array.isArray(data) ? data : data.results ?? [];

  const normalized = rawList
      .map(normalizeResult)
      .filter((x): x is SearchItem => Boolean(x));

  // keep responses compact for Discord
  return normalized.slice(0, 5);
}