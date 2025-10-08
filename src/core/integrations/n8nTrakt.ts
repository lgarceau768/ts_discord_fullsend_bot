import { env } from '../config.js';
import type { SearchItem, TrackN8NResponse, TraktType } from '../types/n8n.js';
import { loggedFetch } from '../utils/loggedFetch.js';

export type { SearchItem, TrackN8NResponse, TraktType } from '../types/n8n.js';

type UnknownRecord = Record<string, unknown>;

const toRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' ? (value as UnknownRecord) : null;

const getStringProp = (record: UnknownRecord | null, key: string): string | undefined => {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const getNumberProp = (record: UnknownRecord | null, key: string): number | undefined => {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
};

const getRecordProp = (record: UnknownRecord | null, key: string): UnknownRecord | null => {
  if (!record) return null;
  return toRecord(record[key]);
};

const getStringArrayProp = (record: UnknownRecord | null, key: string): string[] | undefined => {
  if (!record) return undefined;
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
};

const getIds = (record: UnknownRecord | null): SearchItem['ids'] | undefined => {
  if (!record) return undefined;
  const idsRecord = getRecordProp(record, 'ids') ?? record;
  const trakt = getNumberProp(idsRecord, 'trakt');
  const tmdb = getNumberProp(idsRecord, 'tmdb');
  const imdb = getStringProp(idsRecord, 'imdb');
  const slug = getStringProp(idsRecord, 'slug');
  const tvdb = getNumberProp(idsRecord, 'tvdb');
  const tvrage = getNumberProp(idsRecord, 'tvrage');

  if (
    trakt === undefined &&
    tmdb === undefined &&
    imdb === undefined &&
    slug === undefined &&
    tvdb === undefined &&
    tvrage === undefined
  ) {
    return undefined;
  }

  return { trakt, tmdb, imdb, slug, tvdb, tvrage };
};

const pickPoster = (raw: UnknownRecord | null, obj: UnknownRecord | null): string | undefined =>
  getStringProp(raw, 'posterUrl') ??
  getStringProp(raw, 'poster_url') ??
  getStringProp(obj, 'posterUrl') ??
  getStringProp(obj, 'poster_url') ??
  getStringProp(getRecordProp(getRecordProp(obj, 'images'), 'poster'), 'url');

const pickBackdrop = (raw: UnknownRecord | null, obj: UnknownRecord | null): string | undefined =>
  getStringProp(raw, 'backdropUrl') ??
  getStringProp(raw, 'backdrop_url') ??
  getStringProp(obj, 'backdropUrl') ??
  getStringProp(obj, 'backdrop_url') ??
  getStringProp(getRecordProp(getRecordProp(obj, 'images'), 'backdrop'), 'url');

const parseFirstAiredYear = (record: UnknownRecord | null): number | undefined => {
  const firstAired = getStringProp(record, 'first_aired');
  if (!firstAired) return undefined;
  const parsed = new Date(firstAired);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getUTCFullYear();
};

function normalizeResult(raw: unknown): SearchItem | null {
  const wrapper = toRecord(raw);
  if (!wrapper) return null;

  const result = toRecord(wrapper.result) ?? wrapper;
  const embeddedShow = getRecordProp(result, 'show') ?? getRecordProp(wrapper, 'show');
  const embeddedMovie = getRecordProp(result, 'movie') ?? getRecordProp(wrapper, 'movie');
  const primary = embeddedShow ?? embeddedMovie ?? result;

  const type = getStringProp(result, 'type') ?? (embeddedShow ? 'show' : 'movie');
  if (type !== 'show' && type !== 'movie') return null;

  const title =
    getStringProp(result, 'title') ??
    getStringProp(result, 'name') ??
    getStringProp(primary, 'title') ??
    getStringProp(primary, 'name');
  if (!title) return null;

  const poster = pickPoster(wrapper, primary);
  const backdrop = pickBackdrop(wrapper, primary);
  const ids = getIds(primary) ?? getIds(wrapper);
  const genres = getStringArrayProp(primary, 'genres') ?? [];
  const rating = getNumberProp(primary, 'rating');
  const runtime = getNumberProp(primary, 'runtime');
  const network = getStringProp(primary, 'network');
  const overview =
    getStringProp(primary, 'overview') ??
    getStringProp(result, 'overview') ??
    getStringProp(wrapper, 'overview');
  const year =
    getNumberProp(primary, 'year') ?? getNumberProp(result, 'year') ?? parseFirstAiredYear(primary);

  return {
    type,
    title,
    year,
    ids,
    overview,
    posterUrl: poster,
    backdropUrl: backdrop,
    genres,
    rating,
    runtime,
    network,
  };
}

const isTrackResponse = (value: unknown): value is TrackN8NResponse & { results: unknown[] } => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const results = record.results;
  return (
    Array.isArray(results) &&
    typeof record.query === 'string' &&
    typeof record.query_original === 'string'
  );
};

/**
 * Calls your n8n webhook to perform a Trakt search and returns normalized items.
 * Accepts either:
 *   1) { results: RawTraktResult[] }
 *   2) RawTraktResult[]
 */
export async function callTraktSearch(
  query: string,
  type: TraktType = 'both',
): Promise<TrackN8NResponse> {
  if (!env.N8N_SEARCH_URL) {
    throw new Error('N8N_SEARCH_URL is not configured');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.N8N_API_KEY) headers.Authorization = `Bearer ${env.N8N_API_KEY}`;

  const res = await loggedFetch(env.N8N_SEARCH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, type }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`n8n webhook failed (${res.status}): ${text || res.statusText}`);
  }

  const json: unknown = await res.json();
  if (!isTrackResponse(json)) {
    throw new Error('Unexpected response payload from n8n search webhook');
  }

  const normalized = json.results
    .map((result) => normalizeResult(result))
    .filter((item): item is SearchItem => item !== null);

  // keep responses compact for Discord
  return {
    results: normalized.slice(0, 5),
    ok: res.ok,
    query: json.query,
    query_original: json.query_original,
  };
}
