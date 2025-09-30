import { SlashCommandBuilder } from 'discord.js';

import { createRequest, getDetails, pickDefaultSeasons } from '../integrations/jellyseerr.js';
import { getForThread, getForChannel } from '../state/searchCache.js';
import { getErrorMessage } from '../utils/errors.js';

import type { SlashCommand } from './_types.js';

function parseSeasons(
  input: string | null,
  total: number,
): number[] | 'all' | 'first' | 'latest' | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (v === 'all' || v === 'first' || v === 'latest') return v;
  const parts = v
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= Math.max(1, total));
  if (!parts.length) return null;
  // dedupe + sort
  return Array.from(new Set(parts)).sort((a, b) => a - b);
}

const command = {
  data: new SlashCommandBuilder()
    .setName('request')
    .setDescription('Request an item from the most recent /search results in this thread')
    .addIntegerOption((opt) =>
      opt
        .setName('index')
        .setDescription('Number shown next to the item (1..5)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10),
    )
    .addStringOption((opt) =>
      opt
        .setName('seasons')
        .setDescription('TV only: all | first | latest | comma list (e.g. 1,2,3)')
        .setRequired(false),
    ),
  async execute(interaction) {
    const index = interaction.options.getInteger('index', true);
    const seasonsInput = interaction.options.getString('seasons');

    await interaction.deferReply(); // ACK immediately (public in the thread)

    // Prefer the thread cache; fallback to channel cache
    const threadId = interaction.channel?.isThread?.() ? interaction.channel.id : null;
    const entry = (threadId && getForThread(threadId)) ?? getForChannel(interaction.channelId);

    if (!entry) {
      await interaction.editReply(
        'No cached search results found here. Run `/search` first (it creates a thread and stores results).',
      );
      return;
    }

    const items = entry.items;
    const item = items[index - 1];
    if (!item) {
      await interaction.editReply(`Index ${index} is out of range. Choose 1..${items.length}.`);
      return;
    }
    const tmdb = item.ids?.tmdb;
    if (!tmdb) {
      await interaction.editReply('This item is missing a TMDB id and can’t be requested.');
      return;
    }

    try {
      if (item.type === 'movie') {
        await createRequest('movie', tmdb);
        await interaction.editReply(`✅ Requested **${item.title}** (TMDB ${tmdb}).`);
      } else {
        // Figure out seasons
        const details = await getDetails('tv', tmdb);
        const total = Array.isArray(details.seasons)
          ? details.seasons.filter((s) => (s?.seasonNumber ?? 0) > 0).length
          : 0;

        const choice = parseSeasons(seasonsInput, total);
        let seasons: number[];
        if (choice === 'all') {
          seasons = Array.from({ length: total }, (_, i) => i + 1);
        } else if (choice === 'first') {
          seasons = [1];
        } else if (choice === 'latest') {
          seasons = [Math.max(1, total)];
        } else if (Array.isArray(choice)) {
          seasons = choice;
        } else {
          seasons = pickDefaultSeasons(total); // env default
        }

        await createRequest('tv', tmdb, seasons);
        await interaction.editReply(
          `✅ Requested **${item.title}** seasons ${seasons.join(', ')} (TMDB ${tmdb}).`,
        );
      }
    } catch (error: unknown) {
      await interaction.editReply(`❌ Failed to request: ${getErrorMessage(error)}`);
    }
  },
} satisfies SlashCommand;

export default command;
