import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const infoSpy = vi.fn();
const errorSpy = vi.fn();

vi.mock('../../src/core/logger.js', () => ({
  logger: {
    info: infoSpy,
    error: errorSpy,
  },
}));

const originalFetch = global.fetch;

describe('utils/loggedFetch', () => {
  beforeEach(() => {
    vi.resetModules();
    infoSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('logs successful requests', async () => {
    const mockResponse = new Response('ok', { status: 201 });
    global.fetch = vi.fn(async () => mockResponse) as typeof fetch;

    const { loggedFetch } = await import('../../src/core/utils/loggedFetch.js');
    const result = await loggedFetch('https://api.example.com/resource', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(result).toBe(mockResponse);
    const [requestMeta, requestLabel] = infoSpy.mock.calls[0];
    expect(requestMeta).toMatchObject({ method: 'POST', url: 'https://api.example.com/resource' });
    expect(requestMeta.body).toMatch(/string\(\d+\)/);
    expect(requestLabel).toBe('fetch request');

    const [responseMeta, responseLabel] = infoSpy.mock.calls.at(-1) ?? [];
    expect(responseMeta).toMatchObject({ status: 201, method: 'POST' });
    expect(responseLabel).toBe('fetch response');
  });

  it('logs failures', async () => {
    const failure = new Error('network down');
    global.fetch = vi.fn(async () => {
      throw failure;
    }) as typeof fetch;

    const { loggedFetch } = await import('../../src/core/utils/loggedFetch.js');

    await expect(loggedFetch('https://api.example.com/fail')).rejects.toThrow('network down');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.example.com/fail' }),
      'fetch failed',
    );
  });

  it('derives metadata from Request objects', async () => {
    const mockResponse = new Response(null, { status: 204 });
    global.fetch = vi.fn(async () => mockResponse) as typeof fetch;

    const { loggedFetch } = await import('../../src/core/utils/loggedFetch.js');
    const request = new Request('https://api.example.com/items', { method: 'PUT' });

    const response = await loggedFetch(request);
    expect(response.status).toBe(204);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', url: 'https://api.example.com/items' }),
      'fetch request',
    );
  });

  it('summarises urlencoded bodies', async () => {
    const mockResponse = new Response('done', { status: 200 });
    global.fetch = vi.fn(async () => mockResponse) as typeof fetch;

    const { loggedFetch } = await import('../../src/core/utils/loggedFetch.js');
    const params = new URLSearchParams({ q: 'test' });

    await loggedFetch('https://api.example.com/search', { method: 'POST', body: params });
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'URLSearchParams' }),
      'fetch request',
    );
  });
});
