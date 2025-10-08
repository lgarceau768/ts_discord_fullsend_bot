import { SlashCommandSubcommandBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';

import {
  configureRecentSubcommand,
  RECENT_SUBCOMMAND_NAME,
} from '../../src/features/penny/commands/penny/recent.ts';
import {
  configureSearchSubcommand,
  SEARCH_SUBCOMMAND_NAME,
} from '../../src/features/penny/commands/penny/search.ts';
import {
  configureStatusSubcommand,
  STATUS_SUBCOMMAND_NAME,
} from '../../src/features/penny/commands/penny/status.ts';
import {
  configureSubscribeSubcommand,
  SUBSCRIBE_SUBCOMMAND_NAME,
} from '../../src/features/penny/commands/penny/subscribe.ts';
import {
  configureUnsubscribeSubcommand,
  UNSUBSCRIBE_SUBCOMMAND_NAME,
} from '../../src/features/penny/commands/penny/unsubscribe.ts';

const toJson = (builder: SlashCommandSubcommandBuilder) => builder.toJSON();

describe('penny command configuration', () => {
  it('defines the search subcommand with expected options', () => {
    const json = toJson(configureSearchSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe(SEARCH_SUBCOMMAND_NAME);
    const optionNames = json.options?.map((opt) => opt.name) ?? [];
    expect(optionNames).toEqual(expect.arrayContaining(['zip', 'retailer', 'query', 'radius']));
    const zipOption = json.options?.find((opt) => opt.name === 'zip');
    expect(zipOption?.required).toBe(true);
  });

  it('defines the recent subcommand with zip and retailer options', () => {
    const json = toJson(configureRecentSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe(RECENT_SUBCOMMAND_NAME);
    expect(json.options?.[0]?.name).toBe('zip');
    expect(json.options?.[0]?.required).toBe(true);
  });

  it('defines the subscribe subcommand with filters', () => {
    const json = toJson(configureSubscribeSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe(SUBSCRIBE_SUBCOMMAND_NAME);
    const names = json.options?.map((opt) => opt.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(['zip', 'retailer', 'keyword']));
  });

  it('defines the unsubscribe subcommand with subscription_id', () => {
    const json = toJson(configureUnsubscribeSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe(UNSUBSCRIBE_SUBCOMMAND_NAME);
    expect(json.options?.[0]?.name).toBe('subscription_id');
    expect(json.options?.[0]?.required).toBe(true);
  });

  it('defines the status subcommand without additional options', () => {
    const json = toJson(configureStatusSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe(STATUS_SUBCOMMAND_NAME);
    expect(json.options?.length ?? 0).toBe(0);
  });
});
