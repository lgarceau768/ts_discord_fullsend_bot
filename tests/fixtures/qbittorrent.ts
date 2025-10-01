import type { QBTorrent } from '../../src/integrations/qbittorrent.js';

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
