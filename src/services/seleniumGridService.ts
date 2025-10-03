import { logger } from '../logger.js';
import type {
  PennySearchFilters,
  SeleniumJobRequest,
  SeleniumJobResponse,
  SeleniumJobResult,
} from '../types/penny.js';

const GRID_URL = process.env.SELENIUM_GRID_SERVICE_URL?.replace(/\/$/, '') ?? '';
const GRID_API_KEY = process.env.SELENIUM_GRID_SERVICE_KEY ?? '';

function headers(): Record<string, string> {
  const result: Record<string, string> = { 'Content-Type': 'application/json' };
  if (GRID_API_KEY) result.Authorization = `Bearer ${GRID_API_KEY}`;
  return result;
}

function notConfiguredResponse(kind: SeleniumJobRequest['kind']): SeleniumJobResponse {
  const jobId = `mock-${kind}-${Math.random().toString(36).slice(2, 10)}`;
  logger.warn({ jobId, kind }, 'Selenium grid service not configured; returning mock job response');
  return {
    jobId,
    status: 'queued',
    message: 'Selenium grid service URL is not configured; this is a mock response.',
  };
}

export function buildPennySearchRequest(
  filters: PennySearchFilters,
  requestedBy: string,
  priority: SeleniumJobRequest['priority'] = 'normal',
): SeleniumJobRequest {
  return {
    kind: 'penny-search',
    filters,
    priority,
    requestedBy,
  };
}

export async function enqueueSeleniumJob(
  request: SeleniumJobRequest,
): Promise<SeleniumJobResponse> {
  if (!GRID_URL) {
    return notConfiguredResponse(request.kind);
  }

  try {
    const res = await fetch(`${GRID_URL}/jobs`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, body, request },
        'Selenium grid enqueue failed; returning mock response',
      );
      return notConfiguredResponse(request.kind);
    }

    const json = (await res.json().catch(() => ({}))) as Partial<SeleniumJobResponse>;
    if (!json.jobId) {
      logger.warn({ request, json }, 'Selenium grid response missing jobId; using mock fallback');
      return notConfiguredResponse(request.kind);
    }
    return {
      jobId: json.jobId,
      status: json.status ?? 'queued',
      message: json.message,
    };
  } catch (error) {
    logger.error(
      { err: error, request },
      'Failed to enqueue selenium job; returning mock response',
    );
    return notConfiguredResponse(request.kind);
  }
}

export async function fetchSeleniumJobResult(jobId: string): Promise<SeleniumJobResult> {
  if (!GRID_URL) {
    const now = new Date().toISOString();
    logger.warn({ jobId }, 'Selenium grid not configured; returning mock completed result');
    return {
      jobId,
      status: 'completed',
      deals: [],
      completedAt: now,
    };
  }

  try {
    const res = await fetch(`${GRID_URL}/jobs/${encodeURIComponent(jobId)}`, {
      headers: headers(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ jobId, status: res.status, body }, 'Failed to fetch selenium job result');
      return {
        jobId,
        status: res.status === 404 ? 'failed' : 'completed',
        deals: [],
        error: body || `Unexpected response status ${res.status}`,
        completedAt: new Date().toISOString(),
      };
    }

    const json = (await res.json().catch(() => ({}))) as Partial<SeleniumJobResult>;
    json.status ??= 'completed';
    json.completedAt ??= new Date().toISOString();
    return json as SeleniumJobResult;
  } catch (error) {
    logger.error({ jobId, err: error }, 'Error while fetching selenium job result');
    return {
      jobId,
      status: 'failed',
      deals: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date().toISOString(),
    };
  }
}
