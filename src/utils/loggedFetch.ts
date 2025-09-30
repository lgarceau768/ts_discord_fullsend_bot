import { logger } from '../logger.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

interface FetchLogMeta {
  method: string;
  url: string;
  body?: string;
  durationMs?: number;
  status?: number;
}

function extractUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return 'unknown';
}

function extractMethod(input: FetchInput, init?: FetchInit): string {
  if (init?.method) return init.method;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
  return 'GET';
}

function bodySummary(init?: FetchInit): string | undefined {
  if (init?.body == null) return undefined;
  if (typeof init.body === 'string') return `string(${init.body.length})`;
  if (init.body instanceof URLSearchParams) return 'URLSearchParams';
  if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) return 'ArrayBuffer';
  return 'present';
}

export async function loggedFetch(input: FetchInput, init?: FetchInit): Promise<Response> {
  const url = extractUrl(input);
  const method = extractMethod(input, init);
  const logMeta: FetchLogMeta = { method, url };
  const body = bodySummary(init);
  if (body) logMeta.body = body;

  logger.info(logMeta, 'fetch request');
  const start = Date.now();

  try {
    const res = await fetch(input as any, init as any);
    const durationMs = Date.now() - start;
    logger.info({ ...logMeta, status: res.status, durationMs }, 'fetch response');
    return res;
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error({ ...logMeta, durationMs }, 'fetch failed');
    throw error;
  }
}
