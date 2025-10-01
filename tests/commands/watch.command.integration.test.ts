import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInteractionMock } from '../helpers/discord.js';

const handleAddSubcommandMock = vi.fn(async () => undefined);

const passthroughConfigurator = vi.fn((subcommand) => subcommand);

vi.mock('pg', () => {
  class MockPool {
    on() {
      return this;
    }
    async query() {
      return { rows: [], rowCount: 0 };
    }
  }

  return {
    default: { Pool: MockPool },
    Pool: MockPool,
  };
});

vi.mock('../../src/services/changeDetectionService.js', () => ({
  createTag: vi.fn(async (title: string) => `tag-${title}`),
  createWatch: vi.fn(async () => 'watch-uuid'),
  deleteWatch: vi.fn(async () => undefined),
  getWatchDetails: vi.fn(async () => null),
  getWatchHistory: vi.fn(async () => []),
  listTags: vi.fn(async () => ({})),
  updateWatch: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/iconService.js', () => ({
  getWatchIconUrl: () => 'https://icons/watch.png',
  getSnapshotIconUrl: () => 'https://icons/snapshot.png',
  getSiteIconUrl: () => 'https://icons/site.png',
}));

vi.mock('../../src/commands/watch/add.js', () => ({
  configureAddSubcommand: passthroughConfigurator,
  handleAddSubcommand: handleAddSubcommandMock,
  ADD_SUBCOMMAND_NAME: 'add',
}));

vi.mock('../../src/commands/watch/list.js', () => ({
  configureListSubcommand: passthroughConfigurator,
  handleListSubcommand: vi.fn(),
  LIST_SUBCOMMAND_NAME: 'list',
}));

vi.mock('../../src/commands/watch/remove.js', () => ({
  configureRemoveSubcommand: passthroughConfigurator,
  handleRemoveSubcommand: vi.fn(),
  REMOVE_SUBCOMMAND_NAME: 'remove',
}));

vi.mock('../../src/commands/watch/latest.js', () => ({
  configureLatestSubcommand: passthroughConfigurator,
  handleLatestSubcommand: vi.fn(),
  LATEST_SUBCOMMAND_NAME: 'latest',
}));

vi.mock('../../src/commands/watch/update.js', () => ({
  configureUpdateSubcommand: passthroughConfigurator,
  handleUpdateSubcommand: vi.fn(),
  UPDATE_SUBCOMMAND_NAME: 'update',
}));

describe('watch command (top-level)', () => {
  beforeEach(() => {
    vi.resetModules();
    handleAddSubcommandMock.mockClear();
    process.env.CHANGEDETECTION_URL = '';
    process.env.CHANGEDETECTION_NOTIFICATION_URL = '';
  });

  it('requires CHANGEDETECTION_URL to be configured', async () => {
    const { interaction, reply } = createInteractionMock({ subcommand: 'add' });
    process.env.CHANGEDETECTION_NOTIFICATION_URL = 'https://notify.example';

    const module = await import('../../src/commands/watch/index.js');
    await module.default.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: '❌ CHANGEDETECTION_URL is not configured.',
      ephemeral: true,
    });
    expect(handleAddSubcommandMock).not.toHaveBeenCalled();
  });

  it('invokes the matching subcommand handler when configured', async () => {
    const { interaction, reply } = createInteractionMock({ subcommand: 'add' });
    process.env.CHANGEDETECTION_URL = 'https://cd.example';
    process.env.CHANGEDETECTION_NOTIFICATION_URL = 'https://notify.example';

    const module = await import('../../src/commands/watch/index.js');
    await module.default.execute(interaction);

    expect(handleAddSubcommandMock).toHaveBeenCalledTimes(1);
    expect(handleAddSubcommandMock.mock.calls[0][1]).toBe(interaction);
    expect(reply).not.toHaveBeenCalled();
  });
});
