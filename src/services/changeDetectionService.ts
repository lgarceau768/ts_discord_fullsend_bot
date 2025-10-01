import { logger } from '../logger.js';
import type {
  ChangeDetectionCreateResponse,
  ChangeDetectionHistoryEntry,
  ChangeDetectionTagListResponse,
  ChangeDetectionWatchDetails,
} from '../types/changeDetection.js';
import type { CreateWatchOptions, UpdateWatchOptions } from '../types/changeDetectionService.js';

const CD_URL = process.env.CHANGEDETECTION_URL?.replace(/\/$/, '');
const CD_KEY = process.env.CHANGEDETECTION_API_KEY ?? '';

if (!CD_URL) {
  logger.warn('CHANGEDETECTION_URL is not configured; change detection service will error on use');
}

function headers(): Record<string, string> {
  const result: Record<string, string> = { 'Content-Type': 'application/json' };
  if (CD_KEY) result['x-api-key'] = CD_KEY;
  return result;
}

function requireUrl(): string {
  if (!CD_URL) throw new Error('CHANGEDETECTION_URL not configured');
  return CD_URL;
}

export async function listTags(): Promise<ChangeDetectionTagListResponse> {
  const base = requireUrl();
  const res = await fetch(`${base}/api/v1/tags`, { headers: headers() });
  if (!res.ok) throw new Error(`List tags failed: ${res.status} ${res.statusText}`);
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected response payload when listing tags');
  }
  return data as ChangeDetectionTagListResponse;
}

export async function createTag(title: string): Promise<string> {
  const base = requireUrl();
  const res = await fetch(`${base}/api/v1/tag`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ title }),
  });
  const json: unknown = await res.json().catch(() => ({}));
  const record = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const uuidValue = record.uuid;
  if (!res.ok || typeof uuidValue !== 'string') {
    throw new Error(`Create tag "${title}" failed: ${res.status} ${JSON.stringify(record)}`);
  }
  return uuidValue;
}

export async function createWatch(opts: CreateWatchOptions): Promise<string> {
  const base = requireUrl();
  const payload: Record<string, unknown> = {
    url: opts.url,
    title: opts.title ?? undefined,
    tags: opts.tagUUIDs,
    fetch_backend: opts.fetchBackend ?? 'html_webdriver',
    processor: 'restock_diff',
    webdriver_delay:
      opts.fetchBackend === 'html_webdriver' ? (opts.webdriverDelaySec ?? 3) : undefined,
    time_between_check: { minutes: opts.intervalMinutes ?? 20 },
    notification_urls: [opts.notificationUrl],
    notification_body: opts.notificationBody,
    notification_title: opts.notificationTitle,
    notification_format: opts.notificationFormat ?? 'Markdown',
    track_ldjson_price_data: opts.trackLdjsonPriceData ?? true,
  };

  const res = await fetch(`${base}/api/v1/watch`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: ChangeDetectionCreateResponse | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      json = parsed as ChangeDetectionCreateResponse;
    }
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const message =
      json && Object.keys(json).length ? JSON.stringify(json) : text || res.statusText;
    logger.error(
      { status: res.status, body: text, url: opts.url, payload },
      'ChangeDetection create failed',
    );
    throw new Error(`ChangeDetection create failed: ${message}`);
  }

  const uuid = json?.uuid ?? json?.watch_uuid ?? json?.id;
  if (!uuid) throw new Error('ChangeDetection did not return a watch UUID');

  try {
    const updateRes = await fetch(`${base}/api/v1/watch/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ processor: 'restock_diff' }),
    });
    if (!updateRes.ok) {
      const body = await updateRes.text().catch(() => '');
      logger.warn(
        { uuid, status: updateRes.status, body },
        'Failed to enforce restock_diff processor via PUT',
      );
    }
  } catch (error) {
    logger.warn({ uuid, err: error }, 'Error enforcing restock_diff processor via PUT');
  }

  return uuid;
}

export async function updateWatch(uuid: string, opts: UpdateWatchOptions): Promise<void> {
  const base = requireUrl();
  const payload: Record<string, unknown> = {};

  if (opts.title !== undefined) payload.title = opts.title;
  if (opts.tagUUIDs !== undefined) payload.tags = opts.tagUUIDs;
  if (opts.trackLdjsonPriceData !== undefined)
    payload.track_ldjson_price_data = opts.trackLdjsonPriceData;
  if (opts.fetchBackend !== undefined) payload.fetch_backend = opts.fetchBackend;
  if (opts.webdriverDelaySec !== undefined) payload.webdriver_delay = opts.webdriverDelaySec;
  if (opts.intervalMinutes !== undefined)
    payload.time_between_check = { minutes: opts.intervalMinutes };

  const res = await fetch(`${base}/api/v1/watch/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(
      { uuid, status: res.status, body: text, payload },
      'ChangeDetection update failed',
    );
    throw new Error(`ChangeDetection update failed: ${text || res.statusText}`);
  }
}

export async function deleteWatch(uuid: string): Promise<void> {
  const base = requireUrl();
  const res = await fetch(`${base}/api/v1/watch/${encodeURIComponent(uuid)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn({ uuid, status: res.status, body: text }, 'ChangeDetection delete failed');
    throw new Error(`ChangeDetection delete failed: ${text || res.statusText}`);
  }
}

export async function getWatchDetails(uuid: string): Promise<ChangeDetectionWatchDetails> {
  const base = requireUrl();
  const res = await fetch(`${base}/api/v1/watch/${encodeURIComponent(uuid)}`, {
    headers: headers(),
  });
  const text = await res.text();
  let json: ChangeDetectionWatchDetails | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      json = parsed as ChangeDetectionWatchDetails;
    }
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    logger.error(
      { uuid, status: res.status, body: text },
      'Failed to fetch ChangeDetection watch details',
    );
    throw new Error(`Failed to fetch watch details: ${text || res.statusText}`);
  }
  if (!json) throw new Error('Unexpected response payload when fetching watch details');
  return json;
}

export async function getWatchHistory(uuid: string): Promise<ChangeDetectionHistoryEntry[]> {
  const base = requireUrl();
  const res = await fetch(`${base}/api/v1/watch/${encodeURIComponent(uuid)}/history`, {
    headers: headers(),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    if (res.status === 404) {
      logger.warn({ uuid }, 'Watch history not found (404)');
      return [];
    }
    logger.error(
      { uuid, status: res.status, body: text },
      'Failed to fetch ChangeDetection watch history',
    );
    throw new Error(`Failed to fetch watch history: ${text || res.statusText}`);
  }
  if (Array.isArray(json)) return json as ChangeDetectionHistoryEntry[];
  if (json && typeof json === 'object') {
    const history = (json as { history?: unknown }).history;
    if (Array.isArray(history)) {
      return history as ChangeDetectionHistoryEntry[];
    }
  }
  return [];
}
