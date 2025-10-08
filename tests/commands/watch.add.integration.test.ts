import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatchBase } from '../../src/features/watch/types/watch.js';
import { createInteractionMock } from '../helpers/discord.js';

const inferTitleFromUrlMock = vi.fn(() => 'Derived Title');

vi.mock('../../src/core/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/features/watch/utils/urlTitle.js', () => ({
  inferTitleFromUrl: inferTitleFromUrlMock,
}));

vi.mock('../../src/core/utils/errors.js', () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error ?? 'Unknown error'),
}));

describe('watch add subcommand handler', () => {
  beforeEach(() => {
    vi.resetModules();
    inferTitleFromUrlMock.mockClear();
  });

  const buildBase = (): WatchBase & {
    cdCreateWatch: ReturnType<typeof vi.fn>;
    dbInsertWatch: ReturnType<typeof vi.fn>;
    mkOwnerTags: ReturnType<typeof vi.fn>;
  } => {
    const cdCreateWatch = vi.fn(async () => 'watch-uuid-123');
    const dbInsertWatch = vi.fn(async () => undefined);
    const mkOwnerTags = vi.fn(() => ['by:TestUser#0001', 'price-watch', 'store:bestbuy']);

    const base: WatchBase = {
      renderTemplate: (template, ctx) =>
        template
          .replace('{{user}}', String(ctx.user ?? ''))
          .replace('{{user_id}}', String(ctx.user_id ?? ''))
          .replace('{{store}}', String(ctx.store ?? ''))
          .replace('{{watch_url}}', String(ctx.watch_url ?? '')),
      notificationTemplate: 'Change detected on {{watch_url}}',
      notificationUrl: 'https://notify.example/hook',
      getSiteIconUrl: () => 'https://icons.example/site.png',
      cdCreateWatch,
      cdUpdateWatch: vi.fn(async () => undefined),
      cdDeleteWatch: vi.fn(async () => undefined),
      cdGetWatchDetails: vi.fn(async () => null),
      cdGetWatchHistory: vi.fn(async () => []),
      parseTags: (input?: string | null) => (input ? input.split(/[\s,]+/).filter(Boolean) : []),
      mkOwnerTags,
      dbInsertWatch,
      dbListWatches: vi.fn(async (_userId, _options) => []),
      dbDeleteWatch: vi.fn(async () => true),
      dbGetWatch: vi.fn(async () => null),
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

    return Object.assign(base, { cdCreateWatch, dbInsertWatch, mkOwnerTags });
  };

  it('creates a watch and stores metadata', async () => {
    const base = buildBase();
    const { handleAddSubcommand } = await import('../../src/features/watch/commands/watch/add.js');

    const { interaction, deferReply, editReply } = createInteractionMock({
      subcommand: 'add',
      stringOptions: {
        url: 'https://store.example/item',
        title: 'Custom Title',
        store: 'BestBuy',
        tags: 'gpu,4090',
      },
    });

    await handleAddSubcommand(base, interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(base.mkOwnerTags).toHaveBeenCalledWith(
      interaction.user.id,
      `${interaction.user.username}#${interaction.user.discriminator}`,
      'bestbuy',
      ['gpu', '4090'],
    );
    expect(base.cdCreateWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://store.example/item',
        title: '[PRICE WATCH] Custom Title',
        tagTitles: expect.arrayContaining(['by:TestUser#0001']),
      }),
    );
    expect(base.dbInsertWatch).toHaveBeenCalledWith(
      expect.objectContaining({ watchUuid: 'watch-uuid-123' }),
    );

    const payload = editReply.mock.calls[0][0] as { content: string; embeds: unknown[] };
    expect(payload.content).toContain('🎉 Watch created');
    expect(Array.isArray(payload.embeds)).toBe(true);
  });

  it('reports failures when createWatch throws', async () => {
    const base = buildBase();
    base.cdCreateWatch.mockRejectedValue(new Error('ChangeDetection offline'));

    const { handleAddSubcommand } = await import('../../src/features/watch/commands/watch/add.js');
    const { interaction, editReply } = createInteractionMock({
      subcommand: 'add',
      stringOptions: { url: 'https://store.example/item', title: 'Custom Title' },
    });

    await handleAddSubcommand(base, interaction);

    expect(editReply).toHaveBeenCalledWith('❌ Failed to create watch: ChangeDetection offline');
  });
});
