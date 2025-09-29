import { env } from "../config.js";
import { loggedFetch } from "../utils/loggedFetch.js";
function pickPoster(raw, obj) {
    return (raw?.posterUrl ??
        raw?.poster_url ??
        obj?.posterUrl ??
        obj?.poster_url ??
        obj?.images?.poster?.url ??
        undefined);
}
function pickBackdrop(raw, obj) {
    return (raw?.backdropUrl ??
        raw?.backdrop_url ??
        obj?.backdropUrl ??
        obj?.backdrop_url ??
        obj?.images?.backdrop?.url ??
        undefined);
}
function normalizeResult(raw) {
    raw = raw.result ?? {};
    // Already flat?
    if (raw && raw.title && (raw.type === "show" || raw.type === "movie") && !raw.show && !raw.movie) {
        const poster = pickPoster(raw, raw);
        const backdrop = pickBackdrop(raw, raw);
        return {
            type: raw.type ?? '',
            title: raw.title ?? '',
            year: raw.year ?? '',
            ids: raw.ids ?? {},
            overview: raw.overview ?? '',
            posterUrl: poster,
            backdropUrl: backdrop,
            genres: raw.genres ?? [],
            rating: raw.rating ?? '',
            network: raw.network ?? '',
        };
    }
    // Trakt native search shape: { type, score, show|movie: {...} }
    const kind = raw?.type === "show" || raw?.show ? "show" : "movie";
    const obj = raw?.show ?? raw?.movie ?? raw ?? {};
    const firstAiredYear = obj.first_aired ? new Date(obj.first_aired).getFullYear() : '';
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
export async function callTraktSearch(query, type = "both") {
    if (!env.N8N_SEARCH_URL) {
        throw new Error("N8N_SEARCH_URL is not configured");
    }
    const headers = { "Content-Type": "application/json" };
    if (env.N8N_API_KEY)
        headers["Authorization"] = `Bearer ${env.N8N_API_KEY}`;
    const res = await loggedFetch(env.N8N_SEARCH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, type }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`n8n webhook failed (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json());
    const normalized = data.results.map(normalizeResult).filter((x) => Boolean(x));
    // keep responses compact for Discord
    return {
        results: normalized.slice(0, 5),
        ok: res.ok,
        query: data.query,
        query_original: data.query_original
    };
}
