import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggedFetchMock = vi.fn();

vi.mock('../../src/utils/loggedFetch.js', () => ({
  loggedFetch: loggedFetchMock,
}));

describe('getActiveDownloads', () => {
  beforeEach(() => {
    vi.resetModules();
    loggedFetchMock.mockReset();
    process.env.QBIT_URL = 'https://qb.example';
    process.env.QBIT_USERNAME = '';
    process.env.QBIT_PASSWORD = '';
  });

  it('logs in when credentials are present and returns filtered torrents', async () => {
    process.env.QBIT_USERNAME = 'user';
    process.env.QBIT_PASSWORD = 'pass';

    const loginResponse = new Response('', {
      status: 200,
      headers: { 'set-cookie': 'SID=abc123; Path=/; HttpOnly' },
    });

    const torrentsResponse = new Response(
      JSON.stringify([
        {
          name: 'Ubuntu ISO',
          progress: 0.5,
          dlspeed: 1024,
          eta: 300,
          state: 'downloading',
        },
        {
          name: 'Invalid torrent',
          progress: 'bad',
        },
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

    loggedFetchMock.mockResolvedValueOnce(loginResponse);
    loggedFetchMock.mockResolvedValueOnce(torrentsResponse);

    const module = await import('../../src/integrations/qbittorrent.js');
    const torrents = await module.getActiveDownloads();

    expect(Array.isArray(torrents)).toBe(true);
    expect(torrents).toHaveLength(1);
    expect(torrents[0].name).toBe('Ubuntu ISO');

    const infoRequest = loggedFetchMock.mock.calls[1];
    expect(infoRequest?.[1]?.headers).toMatchObject({ cookie: 'SID=abc123' });
  });

  it('throws when the info endpoint fails', async () => {
    const errorResponse = new Response('boom', { status: 500 });
    loggedFetchMock.mockResolvedValueOnce(errorResponse);

    const module = await import('../../src/integrations/qbittorrent.js');

    await expect(module.getActiveDownloads()).rejects.toThrow(
      /Failed to retrieve torrents: status 500/,
    );
  });

  it('returns an empty array when payload is not a list', async () => {
    const okResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    loggedFetchMock.mockResolvedValueOnce(okResponse);

    const module = await import('../../src/integrations/qbittorrent.js');
    const torrents = await module.getActiveDownloads();

    expect(torrents).toEqual([]);
  });
});
