import { env } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Shape of a torrent returned by the qBittorrent `/torrents/info` API. Only
 * a subset of fields are defined here since the download command only
 * requires these properties. For the full list, see the qBittorrent
 * WebUI API documentation.
 */
export interface QBTorrent {
  name: string;
  progress: number;
  dlspeed: number;
  eta: number;
  state: string;
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
export async function getActiveDownloads(): Promise<QBTorrent[]> {
  if (!env.QBIT_URL) {
    throw new Error("QBIT_URL environment variable is not set");
  }
  // If no username/password provided, assume no auth is required
  let cookie = "";
  if (env.QBIT_USERNAME && env.QBIT_PASSWORD) {
    const loginParams = new URLSearchParams();
    loginParams.append("username", env.QBIT_USERNAME);
    loginParams.append("password", env.QBIT_PASSWORD);
    const loginUrl = `${env.QBIT_URL}/api/v2/auth/login`;
    const loginMethod = "POST";
    logger.debug({ url: loginUrl, method: loginMethod }, "Calling qBittorrent API");
    const loginStarted = Date.now();
    const loginRes = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: env.QBIT_URL,
      },
      body: loginParams.toString(),
    });
    const loginDurationMs = Date.now() - loginStarted;
    if (!loginRes.ok) {
      const text = await loginRes.text().catch(() => "");
      logger.error({ url: loginUrl, method: loginMethod, status: loginRes.status, durationMs: loginDurationMs, response: text?.slice(0, 200) }, "qBittorrent login request failed");
      throw new Error(`qBittorrent login failed with status ${loginRes.status}`);
    }
    logger.debug({ url: loginUrl, method: loginMethod, status: loginRes.status, durationMs: loginDurationMs }, "qBittorrent login succeeded");
    const setCookie = loginRes.headers.get("set-cookie");
    if (setCookie) {
      const match = /SID=([^;]+)/.exec(setCookie);
      if (match) cookie = `SID=${match[1]}`;
    }
  }
  const infoUrl = `${env.QBIT_URL}/api/v2/torrents/info?filter=downloading`;
  const infoMethod = "GET";
  logger.debug({ url: infoUrl, method: infoMethod }, "Calling qBittorrent API");
  const infoStarted = Date.now();
  const infoRes = await fetch(infoUrl, {
    headers: {
      Referer: env.QBIT_URL,
      ...(cookie ? { cookie } : {}),
    },
  });
  const infoDurationMs = Date.now() - infoStarted;
  if (!infoRes.ok) {
    const text = await infoRes.text().catch(() => "");
    logger.error({ url: infoUrl, method: infoMethod, status: infoRes.status, durationMs: infoDurationMs, response: text?.slice(0, 200) }, "qBittorrent torrent info request failed");
    throw new Error(`Failed to retrieve torrents: status ${infoRes.status}`);
  }
  logger.debug({ url: infoUrl, method: infoMethod, status: infoRes.status, durationMs: infoDurationMs }, "qBittorrent torrent info request succeeded");
  const data = await infoRes.json();
  return Array.isArray(data) ? (data as QBTorrent[]) : [];
}
