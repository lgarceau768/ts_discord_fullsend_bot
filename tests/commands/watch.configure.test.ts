import { SlashCommandSubcommandBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { configureAddSubcommand } from '../../src/features/watch/commands/watch/add.js';
import { configureLatestSubcommand } from '../../src/features/watch/commands/watch/latest.js';
import { configureListSubcommand } from '../../src/features/watch/commands/watch/list.js';
import { configureRemoveSubcommand } from '../../src/features/watch/commands/watch/remove.js';
import { configureUpdateSubcommand } from '../../src/features/watch/commands/watch/update.js';

describe('watch subcommand configuration', () => {
  const toJson = (builder: SlashCommandSubcommandBuilder) => builder.toJSON();

  it('configures the add subcommand with expected options', () => {
    const json = toJson(configureAddSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe('add');
    expect(json.options?.some((opt) => opt.name === 'url')).toBe(true);
    expect(json.options?.some((opt) => opt.name === 'tags')).toBe(true);
  });

  it('configures the list subcommand with expected filtering options', () => {
    const json = toJson(configureListSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe('list');
    const optionNames = json.options?.map((opt) => opt.name) ?? [];
    expect(optionNames).toEqual(
      expect.arrayContaining(['mode', 'store', 'tags', 'search', 'page', 'all']),
    );
  });

  it('configures the remove subcommand with uuid option', () => {
    const json = toJson(configureRemoveSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe('remove');
    expect(json.options?.[0]?.name).toBe('uuid');
  });

  it('configures the latest subcommand with uuid option', () => {
    const json = toJson(configureLatestSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe('latest');
    expect(json.options?.[0]?.required).toBe(true);
  });

  it('configures the update subcommand with all optional fields', () => {
    const json = toJson(configureUpdateSubcommand(new SlashCommandSubcommandBuilder()));
    expect(json.name).toBe('update');
    const optionNames = json.options?.map((opt) => opt.name) ?? [];
    expect(optionNames).toEqual(
      expect.arrayContaining(['uuid', 'title', 'store', 'tags', 'interval_minutes', 'track_price']),
    );
  });
});
