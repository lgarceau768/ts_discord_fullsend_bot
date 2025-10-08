import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggedFetchMock = vi.fn();

vi.mock('../../src/core/utils/loggedFetch.js', () => ({
  loggedFetch: loggedFetchMock,
}));

describe('n8n integration', () => {
  beforeEach(() => {
    vi.resetModules();
    loggedFetchMock.mockReset();
    process.env.N8N_SEARCH_URL = 'https://n8n.example/search';
    process.env.N8N_API_KEY = 'secret';
  });

  it('normalizes results from the Trakt search workflow', async () => {
    const response = new Response(
      JSON.stringify({
        results: [
          {
            type: 'movie',
            result: {
              title: 'Dune',
              overview: 'A boy becomes emperor.',
              ids: { tmdb: 693134 },
              genres: ['Sci-Fi'],
              rating: 8.5,
              runtime: 155,
            },
          },
          {
            show: {
              title: 'Foundation',
              ids: { tmdb: 93740 },
              overview: 'Psychohistory saves the galaxy.',
              genres: ['Sci-Fi', 'Drama'],
              runtime: 60,
              network: 'Apple TV+',
            },
          },
          null,
        ],
        query: 'Dune',
        query_original: 'Dune',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    loggedFetchMock.mockResolvedValueOnce(response);

    const module = await import('../../src/core/integrations/n8nTrakt.js');
    const payload = await module.callTraktSearch('Dune', 'movie');

    expect(payload.results).toHaveLength(2);
    expect(payload.results[0]).toMatchObject({
      title: 'Dune',
      ids: { tmdb: 693134 },
      genres: ['Sci-Fi'],
    });
    expect(payload.results[1]).toMatchObject({
      title: 'Foundation',
      network: 'Apple TV+',
      type: 'show',
    });

    const request = loggedFetchMock.mock.calls[0];
    expect(request?.[1]?.headers).toMatchObject({ Authorization: 'Bearer secret' });
    expect(request?.[1]?.body).toBe(JSON.stringify({ query: 'Dune', type: 'movie' }));
  });

  it('throws for non-success responses', async () => {
    const response = new Response('failed', { status: 502 });
    loggedFetchMock.mockResolvedValueOnce(response);

    const module = await import('../../src/core/integrations/n8nTrakt.js');

    await expect(module.callTraktSearch('Dune')).rejects.toThrow(/n8n webhook failed/);
  });

  it('throws when payload shape is unexpected', async () => {
    const response = new Response(JSON.stringify({ foo: 'bar' }), { status: 200 });
    loggedFetchMock.mockResolvedValueOnce(response);

    const module = await import('../../src/core/integrations/n8nTrakt.js');

    await expect(module.callTraktSearch('Dune')).rejects.toThrow(/Unexpected response payload/);
  });
});
