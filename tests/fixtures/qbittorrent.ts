import type { QbittorrentTorrent as QBTorrent } from '../../src/core/types/qbittorrent.js';

export function createTorrent(overrides: Partial<QBTorrent> = {}): QBTorrent {
  return {
    name: 'Ubuntu ISO',
    progress: 0.5,
    dlspeed: 12_582_912,
    eta: 900,
    state: 'downloading',
    ...overrides,
  };
}
