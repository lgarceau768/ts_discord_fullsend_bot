import { describe, expect, it } from 'vitest';

import penny from '../../src/commands/penny/index.ts';
import { handleRecentSubcommand, RECENT_SUBCOMMAND_NAME } from '../../src/commands/penny/recent.ts';
import { handleSearchSubcommand, SEARCH_SUBCOMMAND_NAME } from '../../src/commands/penny/search.ts';
import { handleStatusSubcommand, STATUS_SUBCOMMAND_NAME } from '../../src/commands/penny/status.ts';
import {
  handleSubscribeSubcommand,
  SUBSCRIBE_SUBCOMMAND_NAME,
} from '../../src/commands/penny/subscribe.ts';
import {
  handleUnsubscribeSubcommand,
  UNSUBSCRIBE_SUBCOMMAND_NAME,
} from '../../src/commands/penny/unsubscribe.ts';
import { createInteractionMock } from '../helpers/discord.js';

const SEARCH_MESSAGE =
  'Penny deal search will trigger a Selenium job and return formatted results.';
const RECENT_MESSAGE = 'Recent penny deals will be loaded from storage and summarized here.';
const SUBSCRIBE_MESSAGE = 'Subscription setup will store your preferences and enqueue crawlers.';
const UNSUBSCRIBE_MESSAGE = 'Unsubscribe will clean up stored preferences and disable crawlers.';
const STATUS_MESSAGE = 'Status will enumerate subscriptions and crawler health metrics.';

describe('penny command subhandlers', () => {
  it('search subcommand replies with guidance', async () => {
    const { interaction, reply } = createInteractionMock({
      subcommand: SEARCH_SUBCOMMAND_NAME,
      stringOptions: { zip: '30301', retailer: 'home-depot', query: 'paint' },
      integerOptions: { radius: 10 },
    });

    await handleSearchSubcommand(interaction);

    expect(reply).toHaveBeenCalledWith({ content: SEARCH_MESSAGE, ephemeral: true });
  });

  it('recent subcommand summarizes stored deals', async () => {
    const { interaction, reply } = createInteractionMock({
      subcommand: RECENT_SUBCOMMAND_NAME,
      stringOptions: { zip: '19104', retailer: 'lowes' },
    });

    await handleRecentSubcommand(interaction);

    expect(reply).toHaveBeenCalledWith({ content: RECENT_MESSAGE, ephemeral: true });
  });

  it('subscribe subcommand confirms storage', async () => {
    const { interaction, reply } = createInteractionMock({
      subcommand: SUBSCRIBE_SUBCOMMAND_NAME,
      stringOptions: { zip: '75201', retailer: 'home-depot', keyword: 'tool' },
    });

    await handleSubscribeSubcommand(interaction);

    expect(reply).toHaveBeenCalledWith({ content: SUBSCRIBE_MESSAGE, ephemeral: true });
  });

  it('unsubscribe subcommand acknowledges cleanup', async () => {
    const { interaction, reply } = createInteractionMock({
      subcommand: UNSUBSCRIBE_SUBCOMMAND_NAME,
      stringOptions: { subscription_id: 'sub-123' },
    });

    await handleUnsubscribeSubcommand(interaction);

    expect(reply).toHaveBeenCalledWith({ content: UNSUBSCRIBE_MESSAGE, ephemeral: true });
  });

  it('status subcommand outlines job health', async () => {
    const { interaction, reply } = createInteractionMock({ subcommand: STATUS_SUBCOMMAND_NAME });

    await handleStatusSubcommand(interaction);

    expect(reply).toHaveBeenCalledWith({ content: STATUS_MESSAGE, ephemeral: true });
  });
});

describe('penny top-level command', () => {
  it('delegates to the matching subhandler', async () => {
    const { interaction, reply } = createInteractionMock({
      subcommand: SEARCH_SUBCOMMAND_NAME,
      stringOptions: { zip: '10001' },
    });

    await penny.execute(interaction);

    expect(reply).toHaveBeenCalledWith({ content: SEARCH_MESSAGE, ephemeral: true });
  });

  it('rejects unsupported subcommands', async () => {
    const { interaction, reply } = createInteractionMock({ subcommand: 'invalid' });

    await penny.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Unsupported penny subcommand.',
      ephemeral: true,
    });
  });
});
