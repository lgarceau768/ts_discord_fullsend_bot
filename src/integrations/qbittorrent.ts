import { env } from '../config.js';
import type { QbittorrentTorrent } from '../types/qbittorrent.js';
import { loggedFetch } from '../utils/loggedFetch.js';

function isQBTorrent(value: unknown): value is QbittorrentTorrent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<QbittorrentTorrent>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.progress === 'number' &&
    typeof candidate.dlspeed === 'number' &&
    typeof candidate.eta === 'number' &&
    typeof candidate.state === 'string'
  );
}

/**
 * Authenticate against the qBittorrent WebUI API and fetch active
 * downloads. This helper handles the login handshake (which sets a
 * cookie-based session) and then calls the `/torrents/info` endpoint
 * filtered to currently downloading torrents.
 *
 * If `QBIT_URL` is not defined, or if no credentials are provided and
 * authentication is required, an error will be thrown.
 *
 * @returns A list of torrents currently downloading
 */
export async function getActiveDownloads(): Promise<QbittorrentTorrent[]> {
  if (!env.QBIT_URL) {
    throw new Error('QBIT_URL environment variable is not set');
  }
  // If no username/password provided, assume no auth is required
  let cookie = '';
  if (env.QBIT_USERNAME && env.QBIT_PASSWORD) {
    const loginParams = new URLSearchParams();
    loginParams.append('username', env.QBIT_USERNAME);
    loginParams.append('password', env.QBIT_PASSWORD);
    const loginRes = await loggedFetch(`${env.QBIT_URL}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: env.QBIT_URL,
      },
      body: loginParams.toString(),
    });
    if (!loginRes.ok) {
      throw new Error(`qBittorrent login failed with status ${loginRes.status}`);
    }
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      const match = /SID=([^;]+)/.exec(setCookie);
      if (match) cookie = `SID=${match[1]}`;
    }
  }
  const infoRes = await loggedFetch(`${env.QBIT_URL}/api/v2/torrents/info?filter=downloading`, {
    headers: {
      Referer: env.QBIT_URL,
      ...(cookie ? { cookie } : {}),
    },
  });
  if (!infoRes.ok) {
    throw new Error(`Failed to retrieve torrents: status ${infoRes.status}`);
  }
  const data: unknown = await infoRes.json();
  if (!Array.isArray(data)) return [];

  return data.filter(isQBTorrent);
}
