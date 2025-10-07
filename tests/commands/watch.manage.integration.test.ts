import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleLatestSubcommand } from '../../src/commands/watch/latest.js';
import { handleListSubcommand } from '../../src/commands/watch/list.js';
import { handleRemoveSubcommand } from '../../src/commands/watch/remove.js';
import { handleUpdateSubcommand } from '../../src/commands/watch/update.js';
import type { WatchBase } from '../../src/types/watch.js';
import { createWatchDetails, createWatchRecord, createHistoryEntry } from '../fixtures/watch.js';
import { createInteractionMock } from '../helpers/discord.js';

describe('watch command subhandlers', () => {
  const buildBase = () => {
    const base: WatchBase = {
      renderTemplate: (template) => template,
      notificationTemplate: 'Change detected on {{watch_url}}',
      notificationUrl: 'https://notify.example/hook',
      getSiteIconUrl: vi.fn(() => 'https://icons.example/site.png'),
      cdCreateWatch: vi.fn(async () => 'uuid'),
      cdUpdateWatch: vi.fn(async () => undefined),
      cdDeleteWatch: vi.fn(async () => undefined),
      cdGetWatchDetails: vi.fn(async () => createWatchDetails()),
      cdGetWatchHistory: vi.fn(async () => [createHistoryEntry()]),
      parseTags: (input) => (input ? input.split(/[\s,]+/).filter(Boolean) : []),
      mkOwnerTags: vi.fn((userId, requesterTag, store, extras = []) => [
        `by:${requesterTag}`,
        'price-watch',
        ...(store ? [`store:${store}`] : []),
        ...extras,
      ]),
      dbInsertWatch: vi.fn(async () => undefined),
      dbListWatches: vi.fn(async (_userId, _options) => [
        createWatchRecord(),
        createWatchRecord({ watch_uuid: 'watch-uuid-2' }),
      ]),
      dbDeleteWatch: vi.fn(async () => true),
      dbGetWatch: vi.fn(async () => createWatchRecord()),
      dbUpdateWatch: vi.fn(async () => undefined),
      colors: {
        primary: 0x111111,
        success: 0x22c55e,
        warning: 0xf59e0b,
        danger: 0xef4444,
      },
      icons: {
        watch: 'https://icons.example/watch.png',
        snapshot: 'https://icons.example/snapshot.png',
      },
    };

    return base;
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it('lists watches in minimal mode with embeds', async () => {
    const base = buildBase();
    const { interaction, deferReply, editReply } = createInteractionMock({
      subcommand: 'list',
    });

    await handleListSubcommand(base, interaction);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.content).toContain('📋 You have **2** watch(es).');
    expect(payload.content).toContain('(page 1/1, 10 per page)');
    expect(Array.isArray(payload.embeds)).toBe(true);
    expect(payload.embeds).toHaveLength(2);
  });

  it('lists watches in full mode', async () => {
    const base = buildBase();
    const { interaction, editReply } = createInteractionMock({
      subcommand: 'list',
      stringOptions: { mode: 'full' },
    });

    await handleListSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as { content: string };
    expect(payload.content).toContain('🔎 Showing 2 in **Full** mode (page 1/1, 10 per page).');
  });

  it('informs the user when no watches are stored', async () => {
    const base = buildBase();
    base.dbListWatches = vi.fn(async (_userId, _options) => []);

    const { interaction, editReply } = createInteractionMock({ subcommand: 'list' });

    await handleListSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith(
      '🌱 You have no watches yet. Add one with `/watch add`.',
    );
  });

  it('notes when additional watches are truncated', async () => {
    const base = buildBase();
    base.dbListWatches = vi.fn(async (_userId, _options) =>
      Array.from({ length: 12 }, (_, i) =>
        createWatchRecord({ watch_uuid: `watch-${i}`, url: `https://example.com/${i}` }),
      ),
    );

    const { interaction, editReply } = createInteractionMock({ subcommand: 'list' });

    await handleListSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as { content: string };
    expect(payload.content).toContain('➕ …and 2 more not shown here.');
    expect(payload.content).toContain('➡️ Use `/watch list page:2`');
  });

  it('applies store, tag, and search filters', async () => {
    const base = buildBase();
    base.dbListWatches = vi.fn(async (_userId, _options) => [
      createWatchRecord({
        watch_uuid: 'watch-1',
        url: 'https://example.com/gpu-deal',
        tags: ['price-watch', 'store:bestbuy', 'gpu'],
      }),
      createWatchRecord({
        watch_uuid: 'watch-2',
        url: 'https://example.com/cpu-deal',
        tags: ['price-watch', 'store:target', 'cpu'],
      }),
    ]);

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'list',
      stringOptions: { store: 'BestBuy', tags: 'gpu', search: 'gpu' },
    });

    await handleListSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.embeds).toHaveLength(1);
    expect(payload.content).toContain('🧭 Filters: store=bestbuy · tags=gpu · search=gpu');
  });

  it('supports pagination across multiple pages', async () => {
    const base = buildBase();
    base.dbListWatches = vi.fn(async (_userId, _options) =>
      Array.from({ length: 15 }, (_, i) =>
        createWatchRecord({ watch_uuid: `watch-${i}`, url: `https://example.com/${i}` }),
      ),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'list',
      integerOptions: { page: 2 },
    });

    await handleListSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.embeds).toHaveLength(5);
    expect(payload.content).toContain('page 2/2');
    expect(payload.content).toContain('⬅️ Use `/watch list page:1`');
    expect(base.dbListWatches).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({ limit: expect.any(Number) }),
    );
  });

  it('clamps to the last page when a higher page is requested', async () => {
    const base = buildBase();
    base.dbListWatches = vi.fn(async (_userId, _options) =>
      Array.from({ length: 12 }, (_, i) =>
        createWatchRecord({ watch_uuid: `watch-${i}`, url: `https://example.com/${i}` }),
      ),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'list',
      integerOptions: { page: 4 },
    });

    await handleListSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.content).toContain('page 2/2');
    expect(payload.content).toContain('⬅️ Use `/watch list page:1`');
    expect(payload.content).not.toContain('page 4/');
  });

  it('shows all results when requested', async () => {
    const base = buildBase();
    base.dbListWatches = vi.fn(async (_userId, _options) =>
      Array.from({ length: 12 }, (_, i) =>
        createWatchRecord({ watch_uuid: `watch-${i}`, url: `https://example.com/${i}` }),
      ),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'list',
      booleanOptions: { all: true },
    });

    await handleListSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.embeds).toHaveLength(12);
    expect(payload.content).toContain('🔎 Showing 12 in **Minimal** mode');
    expect(payload.content).not.toContain('(page');
    expect(base.dbListWatches).toHaveBeenCalledWith('user-id', { limit: 250 });
  });

  it('reports when no entries match the provided filters', async () => {
    const base = buildBase();
    base.dbListWatches = vi.fn(async (_userId, _options) => [
      createWatchRecord({
        watch_uuid: 'watch-1',
        url: 'https://example.com/widget',
        tags: ['price-watch', 'store:bestbuy'],
      }),
    ]);

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'list',
      stringOptions: { store: 'target', tags: 'cpu' },
    });

    await handleListSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith(
      '🔍 No watches match your filters. Try adjusting them and retry.',
    );
  });

  it('handles list failures gracefully', async () => {
    const base = buildBase();
    const error = new Error('db down');
    base.dbListWatches = vi.fn(async (_userId, _options) => {
      throw error;
    });

    const { interaction, editReply } = createInteractionMock({ subcommand: 'list' });

    await handleListSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith('❌ Failed to list watches: db down');
  });

  it('shows latest watch snapshot and handles missing history', async () => {
    const base = buildBase();
    base.cdGetWatchHistory = vi.fn(async () => [
      createHistoryEntry(),
      createHistoryEntry({ snapshot: { price: 123.45 } }),
    ]);

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'latest',
      stringOptions: { uuid: 'watch-uuid-1' },
    });

    await handleLatestSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.content).toContain('📈 Latest price/stock data');
    expect(payload.embeds).toHaveLength(1);
  });

  it('notifies when latest watch is missing', async () => {
    const base = buildBase();
    base.dbGetWatch = vi.fn(async () => null);

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'latest',
      stringOptions: { uuid: 'unknown' },
    });

    await handleLatestSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith(
      '❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.',
    );
  });

  it('removes a watch and suppresses ChangeDetection errors', async () => {
    const base = buildBase();
    base.cdDeleteWatch = vi.fn(async () => {
      throw new Error('CD maintenance');
    });

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'remove',
      stringOptions: { uuid: 'watch-uuid-1' },
    });

    await handleRemoveSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith('🗑️ Removed watch `watch-uuid-1`.');
  });

  it('handles watch removal when record is missing', async () => {
    const base = buildBase();
    base.dbDeleteWatch = vi.fn(async () => false);

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'remove',
      stringOptions: { uuid: 'missing' },
    });

    await handleRemoveSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith(
      '❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.',
    );
  });

  it('surfaces removal errors to the user', async () => {
    const base = buildBase();
    base.dbDeleteWatch = vi.fn(async () => {
      throw new Error('database offline');
    });

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'remove',
      stringOptions: { uuid: 'watch-err' },
    });

    await handleRemoveSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith('❌ Failed to remove watch: database offline');
  });

  it('warns when notification URL lacks scheme', async () => {
    const base = buildBase();
    base.notificationUrl = 'notify.example/hooks';

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'add',
      stringOptions: { url: 'https://store.example/foo', title: 'Custom Watch' },
    });

    await import('../../src/commands/watch/add.js').then(({ handleAddSubcommand }) =>
      handleAddSubcommand(base, interaction),
    );

    expect(editReply).toHaveBeenCalledWith({
      content: '🎉 Watch created in ChangeDetection and linked to your account.',
      embeds: expect.any(Array),
    });
  });

  it('updates a watch and persists tag changes', async () => {
    const base = buildBase();
    base.dbGetWatch = vi.fn(async () =>
      createWatchRecord({ tags: ['price-watch', 'gpu'], watch_uuid: 'watch-uuid-1' }),
    );
    base.cdGetWatchDetails = vi.fn(async () => createWatchDetails({ title: 'Gaming GPU' }));

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'update',
      stringOptions: {
        uuid: 'watch-uuid-1',
        title: 'Updated GPU',
        store: 'MicroCenter',
        tags: 'gpu, rtx4090',
      },
      integerOptions: { interval_minutes: 60 },
      booleanOptions: { track_price: true },
    });

    await handleUpdateSubcommand(base, interaction);

    expect(base.cdUpdateWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'watch-uuid-1',
        title: 'Updated GPU',
        trackLdjsonPriceData: true,
        intervalMinutes: 60,
      }),
    );
    expect(base.dbUpdateWatch).toHaveBeenCalled();

    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.content).toBe('✅ Watch updated.');
  });

  it('skips tag updates when none are provided', async () => {
    const base = buildBase();
    base.dbGetWatch = vi.fn(async () => createWatchRecord({ tags: ['price-watch'] }));

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'update',
      stringOptions: { uuid: 'watch-uuid-1' },
    });

    await handleUpdateSubcommand(base, interaction);

    expect(base.cdUpdateWatch).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'watch-uuid-1' }),
    );
    expect(base.dbUpdateWatch).not.toHaveBeenCalled();

    const payload = editReply.mock.calls[0][0] as { content: string };
    expect(payload.content).toBe('✅ Watch updated.');
  });

  it('returns a helpful message when update target is missing', async () => {
    const base = buildBase();
    base.dbGetWatch = vi.fn(async () => null);

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'update',
      stringOptions: { uuid: 'missing-watch' },
    });

    await handleUpdateSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith(
      '❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.',
    );
  });

  it('captures errors from ChangeDetection lookups when fetching latest', async () => {
    const base = buildBase();
    base.dbGetWatch = vi.fn(async () => createWatchRecord({ url: 'https://example.com/product' }));
    base.cdGetWatchDetails = vi.fn(async () => {
      throw new Error('details failed');
    });
    base.cdGetWatchHistory = vi.fn(async () => {
      throw new Error('history failed');
    });

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'latest',
      stringOptions: { uuid: 'watch-uuid-1' },
    });

    await handleLatestSubcommand(base, interaction);

    const payload = editReply.mock.calls[0][0] as {
      embeds: { toJSON: () => { description?: string } }[];
    };
    const description = payload.embeds[0]?.toJSON().description;
    expect(description).toContain('⚠️');
  });
});
