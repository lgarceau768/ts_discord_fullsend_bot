import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchItem } from '../fixtures/trakt.js';
import { createInteractionMock } from '../helpers/discord.js';

const createRequestMock = vi.fn();
const getDetailsMock = vi.fn();
const pickDefaultSeasonsMock = vi.fn();
const getForThreadMock = vi.fn();
const getForChannelMock = vi.fn();

vi.mock('../../src/integrations/jellyseerr.js', () => ({
  createRequest: createRequestMock,
  getDetails: getDetailsMock,
  pickDefaultSeasons: pickDefaultSeasonsMock,
}));

vi.mock('../../src/state/searchCache.js', () => ({
  getForThread: getForThreadMock,
  getForChannel: getForChannelMock,
}));

vi.mock('../../src/utils/errors.js', () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

describe('request command', () => {
  beforeEach(() => {
    vi.resetModules();
    createRequestMock.mockReset();
    getDetailsMock.mockReset();
    pickDefaultSeasonsMock.mockReset();
    getForThreadMock.mockReset();
    getForChannelMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('submits a movie request when cached results exist in the thread', async () => {
    const item = createSearchItem({ type: 'movie', title: 'The Matrix', ids: { tmdb: 603 } });
    getForThreadMock.mockReturnValue({ items: [item] });

    const channel = { id: 'thread-1', isThread: () => true } as const;
    const { interaction, deferReply, editReply } = createInteractionMock({
      integerOptions: { index: 1 },
      channelId: 'thread-1',
      channel: channel as unknown as { id: string; isThread: () => boolean },
    });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(createRequestMock).toHaveBeenCalledWith('movie', 603);
    expect(editReply).toHaveBeenCalledWith('✅ Requested **The Matrix** (TMDB 603).');
    expect(getDetailsMock).not.toHaveBeenCalled();
  });

  it('requests tv seasons using default picker when none supplied', async () => {
    const item = createSearchItem({ type: 'show', title: 'Severance', ids: { tmdb: 124364 } });
    getForThreadMock.mockReturnValue({ items: [item] });
    getDetailsMock.mockResolvedValue({
      seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: 0 }],
    });
    pickDefaultSeasonsMock.mockReturnValue([1, 2]);

    const channel = { id: 'thread-42', isThread: () => true } as const;
    const { interaction, editReply } = createInteractionMock({
      integerOptions: { index: 1 },
      channelId: 'thread-42',
      channel: channel as unknown as { id: string; isThread: () => boolean },
    });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(getDetailsMock).toHaveBeenCalledWith('tv', 124364);
    expect(pickDefaultSeasonsMock).toHaveBeenCalledWith(2);
    expect(createRequestMock).toHaveBeenCalledWith('tv', 124364, [1, 2]);
    expect(editReply).toHaveBeenCalledWith(
      '✅ Requested **Severance** seasons 1, 2 (TMDB 124364).',
    );
  });

  it('uses explicit season selections when provided', async () => {
    const item = createSearchItem({ type: 'show', title: 'Futurama', ids: { tmdb: 615 } });
    getForThreadMock.mockReturnValue({ items: [item] });
    getDetailsMock.mockResolvedValue({ seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }] });

    const channel = { id: 'thread-99', isThread: () => true } as const;
    const { interaction } = createInteractionMock({
      integerOptions: { index: 1 },
      stringOptions: { seasons: '1, 3, 3, 2' },
      channelId: 'thread-99',
      channel: channel as unknown as { id: string; isThread: () => boolean },
    });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(pickDefaultSeasonsMock).not.toHaveBeenCalled();
    expect(createRequestMock).toHaveBeenCalledWith('tv', 615, [1, 2]);
  });

  it('falls back to channel cache when thread results are missing', async () => {
    const item = createSearchItem({ title: 'Interstellar', ids: { tmdb: 157336 }, type: 'movie' });
    getForThreadMock.mockReturnValue(undefined);
    getForChannelMock.mockReturnValue({ items: [item] });

    const { interaction } = createInteractionMock({ integerOptions: { index: 1 } });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(createRequestMock).toHaveBeenCalledWith('movie', 157336);
  });

  it('notifies the user when no cached results are available', async () => {
    getForThreadMock.mockReturnValue(undefined);
    getForChannelMock.mockReturnValue(undefined);

    const { interaction, editReply } = createInteractionMock({ integerOptions: { index: 1 } });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      'No cached search results found here. Run `/search` first (it creates a thread and stores results).',
    );
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it('reports errors from the Jellyseerr service', async () => {
    const item = createSearchItem({ type: 'movie', title: 'Arrival', ids: { tmdb: 329865 } });
    getForThreadMock.mockReturnValue({ items: [item] });
    createRequestMock.mockRejectedValue(new Error('Jellyseerr API down'));

    const channel = { id: 'thread-7', isThread: () => true } as const;
    const { interaction, editReply } = createInteractionMock({
      integerOptions: { index: 1 },
      channelId: 'thread-7',
      channel: channel as unknown as { id: string; isThread: () => boolean },
    });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('❌ Failed to request: Jellyseerr API down');
  });

  it('guards against out-of-range indices', async () => {
    const items = Array.from({ length: 2 }, (_, i) => createSearchItem({ title: `Item ${i + 1}` }));
    getForThreadMock.mockReturnValue({ items });

    const channel = { id: 'thread-2', isThread: () => true } as const;
    const { interaction, editReply } = createInteractionMock({
      integerOptions: { index: 5 },
      channelId: 'thread-2',
      channel: channel as unknown as { id: string; isThread: () => boolean },
    });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('Index 5 is out of range. Choose 1..2.');
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it('refuses to request items missing TMDB ids', async () => {
    const item = createSearchItem({ title: 'Mystery Item', ids: { tmdb: undefined } });
    getForThreadMock.mockReturnValue({ items: [item] });

    const channel = { id: 'thread-8', isThread: () => true } as const;
    const { interaction, editReply } = createInteractionMock({
      integerOptions: { index: 1 },
      channelId: 'thread-8',
      channel: channel as unknown as { id: string; isThread: () => boolean },
    });

    const module = await import('../../src/commands/request.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      'This item is missing a TMDB id and can’t be requested.',
    );
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it('honours explicit season modifiers (all, first, latest)', async () => {
    const item = createSearchItem({ type: 'show', title: 'Demo Show', ids: { tmdb: 555 } });
    getForThreadMock.mockReturnValue({ items: [item] });

    const channel = { id: 'thread-11', isThread: () => true } as const;

    const runCase = async (
      seasons: string,
      expected: number[],
      returnedSeasons: Array<{ seasonNumber: number }> | null,
    ) => {
      getDetailsMock.mockResolvedValue({ seasons: returnedSeasons });
      const { interaction } = createInteractionMock({
        integerOptions: { index: 1 },
        stringOptions: { seasons },
        channelId: 'thread-11',
        channel: channel as unknown as { id: string; isThread: () => boolean },
      });

      const module = await import('../../src/commands/request.js');
      await module.default.execute(interaction);
      expect(createRequestMock).toHaveBeenLastCalledWith('tv', 555, expected);
      createRequestMock.mockClear();
    };

    await runCase(
      'all',
      [1, 2, 3],
      [{ seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: 3 }],
    );
    await runCase('first', [1], [{ seasonNumber: 1 }, { seasonNumber: 0 }]);
    await runCase('latest', [1], null);
  });
});
