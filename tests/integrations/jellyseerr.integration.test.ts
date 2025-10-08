import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggedFetchMock = vi.fn();

vi.mock('../../src/core/utils/loggedFetch.js', () => ({
  loggedFetch: loggedFetchMock,
}));

describe('jellyseerr integration', () => {
  beforeEach(() => {
    vi.resetModules();
    loggedFetchMock.mockReset();
    process.env.JELLYSEERR_URL = 'https://jelly.example';
    process.env.JELLYSEERR_API_KEY = 'api-key';
    process.env.JELLYSEERR_SERIES_DEFAULT = 'first';
    process.env.JELLYSEERR_4K = 'false';
    process.env.JELLYSEERR_AUTO_APPROVE = '';
    process.env.JELLYSEERR_AUTO_DOWNLOAD = '';
    process.env.JELLYSEERR_SEARCH_NOW = '';
  });

  it('fetches details for movies and validates payload', async () => {
    const response = new Response(
      JSON.stringify({ id: 101, title: 'Arrival', overview: 'Sci-fi.' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    loggedFetchMock.mockResolvedValueOnce(response);

    const module = await import('../../src/core/integrations/jellyseerr.js');
    const details = await module.getDetails('movie', 101);

    expect(details.id).toBe(101);
    expect(loggedFetchMock).toHaveBeenCalledWith(
      'https://jelly.example/api/v1/movie/101',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('throws when the details endpoint fails', async () => {
    const response = new Response('nope', { status: 500 });
    loggedFetchMock.mockResolvedValueOnce(response);

    const module = await import('../../src/core/integrations/jellyseerr.js');

    await expect(module.getDetails('tv', 55)).rejects.toThrow(/Jellyseerr GET 500/);
  });

  it('creates requests using env defaults and explicit options', async () => {
    process.env.JELLYSEERR_4K = 'true';
    process.env.JELLYSEERR_AUTO_APPROVE = 'true';
    process.env.JELLYSEERR_AUTO_DOWNLOAD = 'false';
    process.env.JELLYSEERR_SEARCH_NOW = 'true';

    const response = new Response('', { status: 200 });
    loggedFetchMock.mockResolvedValue(response);

    const module = await import('../../src/core/integrations/jellyseerr.js');
    await module.createRequest('tv', 999, { seasons: [1, 2], profileId: 5 });

    const body = JSON.parse(String(loggedFetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      mediaType: 'tv',
      mediaId: 999,
      seasons: [1, 2],
      profileId: 5,
      is4k: true,
    });
  });

  it('computes default seasons correctly', async () => {
    process.env.JELLYSEERR_SERIES_DEFAULT = 'all';
    const modAll = await import('../../src/core/integrations/jellyseerr.js');
    expect(modAll.pickDefaultSeasons(3)).toEqual([1, 2, 3]);

    vi.resetModules();
    loggedFetchMock.mockReset();
    process.env.JELLYSEERR_URL = 'https://jelly.example';
    process.env.JELLYSEERR_SERIES_DEFAULT = 'latest';
    const modLatest = await import('../../src/core/integrations/jellyseerr.js');
    expect(modLatest.pickDefaultSeasons(4)).toEqual([4]);

    vi.resetModules();
    loggedFetchMock.mockReset();
    process.env.JELLYSEERR_URL = 'https://jelly.example';
    process.env.JELLYSEERR_SERIES_DEFAULT = 'first';
    const modFirst = await import('../../src/core/integrations/jellyseerr.js');
    expect(modFirst.pickDefaultSeasons(0)).toEqual([1]);
  });
});
