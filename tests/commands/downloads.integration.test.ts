import type { EmbedBuilder } from 'discord.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createTorrent } from '../fixtures/qbittorrent.js';
import { createInteractionMock } from '../helpers/discord.js';

const getActiveDownloadsMock = vi.fn();

vi.mock('../../src/integrations/qbittorrent.js', () => ({
  getActiveDownloads: getActiveDownloadsMock,
}));

describe('downloads command', () => {
  beforeEach(() => {
    vi.resetModules();
    getActiveDownloadsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('replies with embeds when torrents are active', async () => {
    const { interaction, deferReply, editReply } = createInteractionMock();
    getActiveDownloadsMock.mockResolvedValue([
      createTorrent({ name: 'Ubuntu ISO', progress: 0.42, dlspeed: 5_000_000, eta: 120 }),
    ]);

    const module = await import('../../src/commands/downloads.js');
    await module.default.execute(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(getActiveDownloadsMock).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledOnce();

    const payload = editReply.mock.calls[0][0] as { embeds?: EmbedBuilder[] };
    expect(payload.embeds).toBeTruthy();
    expect(payload.embeds).toHaveLength(1);

    const embed = payload.embeds?.[0];
    expect(embed?.toJSON().title).toContain('Ubuntu ISO');
    expect(embed?.toJSON().description).toContain('Progress');
  });

  it('notifies the user when there are no active torrents', async () => {
    const { interaction, editReply } = createInteractionMock();
    getActiveDownloadsMock.mockResolvedValue([]);

    const module = await import('../../src/commands/downloads.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('There are no active downloads at the moment.');
  });

  it('reports an error when the qbittorrent service fails', async () => {
    const { interaction, editReply } = createInteractionMock();
    getActiveDownloadsMock.mockRejectedValue(new Error('connection refused'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const module = await import('../../src/commands/downloads.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch downloads: connection refused'),
    );
    errorSpy.mockRestore();
  });
});
