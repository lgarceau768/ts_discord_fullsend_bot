import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createSearchItem } from '../fixtures/trakt.js';
import { createInteractionMock } from '../helpers/discord.js';

const callTraktSearchMock = vi.fn();
const setForThreadMock = vi.fn();
const setForChannelMock = vi.fn();

vi.mock('../../src/integrations/n8n.js', () => ({
  callTraktSearch: callTraktSearchMock,
}));

vi.mock('../../src/state/searchCache.js', () => ({
  setForThread: setForThreadMock,
  setForChannel: setForChannelMock,
}));

describe('search command', () => {
  beforeEach(() => {
    vi.resetModules();
    callTraktSearchMock.mockReset();
    setForThreadMock.mockReset();
    setForChannelMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a thread with search results and caches them', async () => {
    const query = 'Dune';
    const item = createSearchItem({ title: 'Dune Part Two', ids: { tmdb: 948713 } });

    const { interaction, deferReply, editReply } = createInteractionMock({
      stringOptions: { query, type: 'movie' },
      userId: 'user-123',
      channelId: 'channel-456',
    });

    const sendMock = vi.fn();
    const thread = { id: 'thread-789', send: sendMock };
    const startThreadMock = vi.fn(async () => thread);
    editReply.mockResolvedValue({ id: 'parent-1', startThread: startThreadMock });

    callTraktSearchMock.mockResolvedValue({
      ok: true,
      query,
      query_original: query,
      results: [item],
    });

    const module = await import('../../src/commands/search.js');
    await module.default.execute(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(callTraktSearchMock).toHaveBeenCalledWith(query, 'movie');

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining(`**${query}**`) }),
    );
    expect(startThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('trakt: Dune'),
        autoArchiveDuration: 1440,
      }),
    );

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('**Dune Part Two**'),
        embeds: expect.any(Array),
      }),
    );

    expect(setForThreadMock).toHaveBeenCalledWith(
      'thread-789',
      expect.objectContaining({
        items: [item],
        authorId: 'user-123',
        query,
      }),
    );
    expect(setForChannelMock).toHaveBeenCalledWith('channel-456', expect.any(Object));
  });

  it('informs the user when no results are returned', async () => {
    const { interaction, editReply } = createInteractionMock({
      stringOptions: { query: 'Unknown', type: 'movie' },
    });

    callTraktSearchMock.mockResolvedValue({
      ok: true,
      query: 'Unknown',
      query_original: 'Unknown',
      results: [],
    });

    const module = await import('../../src/commands/search.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('No results for `Unknown`.');
    expect(setForThreadMock).not.toHaveBeenCalled();
    expect(setForChannelMock).not.toHaveBeenCalled();
  });

  it('handles network-style errors with a friendly message', async () => {
    const { interaction, editReply } = createInteractionMock({
      stringOptions: { query: 'Dune', type: 'movie' },
    });

    callTraktSearchMock.mockRejectedValue(new Error('Fetch failed due to timeout'));

    const module = await import('../../src/commands/search.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('Failed to search due to a network issue');
  });

  it('surfaces other errors to the user', async () => {
    const { interaction, editReply } = createInteractionMock({
      stringOptions: { query: 'Dune', type: 'movie' },
    });

    callTraktSearchMock.mockRejectedValue(new Error('Webhook failed with status 500'));

    const module = await import('../../src/commands/search.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to search: Webhook failed with status 500'),
    );
  });
});
