import type { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { logger } from '../../logger.js';
import type { WatchBase } from '../../types/watch.js';
import { inferTitleFromUrl } from '../../utils/urlTitle.js';

import {
  buildFullListEmbed,
  buildMinimalListEmbed,
  type DisplayEntry,
  extractPriceSnapshot,
} from './display.js';

export const LIST_SUBCOMMAND_NAME = 'list';

export function configureListSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(LIST_SUBCOMMAND_NAME)
    .setDescription('List your watches')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Output mode: minimal (default) or full')
        .addChoices({ name: 'Minimal', value: 'minimal' }, { name: 'Full', value: 'full' }),
    );
}

export async function handleListSubcommand(
  base: WatchBase,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const modeInput = interaction.options.getString('mode')?.toLowerCase() ?? 'minimal';
  const mode = modeInput === 'full' ? 'full' : 'minimal';
  logger.debug({ userId: interaction.user.id, mode }, 'Processing /watch list');

  try {
    const rows = await base.dbListWatches(interaction.user.id);
    if (!rows.length) {
      await interaction.editReply('🌱 You have no watches yet. Add one with `/watch add`.');
      logger.debug({ userId: interaction.user.id }, 'No watches found for user');
      return;
    }

    const displayRows = rows.slice(0, 10);
    const entries: DisplayEntry[] = [];

    for (let i = 0; i < displayRows.length; i += 1) {
      const record = displayRows[i];
      let details;
      let history = [] as Awaited<ReturnType<typeof base.cdGetWatchHistory>>;
      let priceSnapshot = null;
      let errorMessage: string | undefined;
      let pageTitle: string | undefined;

      try {
        details = await base.cdGetWatchDetails(record.watch_uuid);
        if (details?.title && typeof details.title === 'string' && details.title.trim()) {
          pageTitle = details.title.trim();
        }
      } catch (error: any) {
        const msg = error?.message ?? 'Failed to fetch watch details.';
        errorMessage = String(msg).slice(0, 200);
        logger.error(
          { err: error, uuid: record.watch_uuid },
          'Failed to fetch watch details for list',
        );
      }

      try {
        history = await base.cdGetWatchHistory(record.watch_uuid);
        priceSnapshot = extractPriceSnapshot(details, history);
      } catch (error: any) {
        logger.warn(
          { err: error, uuid: record.watch_uuid },
          'Failed to fetch watch history for list',
        );
        if (!errorMessage) {
          const msg = error?.message ?? 'Failed to fetch price history.';
          errorMessage = String(msg).slice(0, 200);
        }
      }

      if (!pageTitle) {
        pageTitle = inferTitleFromUrl(record.url);
      }

      entries.push({
        index: i + 1,
        record,
        details,
        priceSnapshot,
        errorMessage,
        pageTitle,
      });
    }

    const embeds = entries.map((entry) =>
      mode === 'full' ? buildFullListEmbed(base, entry) : buildMinimalListEmbed(base, entry),
    );

    const modeLabel = mode === 'full' ? 'Full' : 'Minimal';
    const summaryLines = [
      `📋 You have **${rows.length}** watch(es).`,
      `🔎 Showing ${entries.length} in **${modeLabel}** mode.`,
    ];
    if (rows.length > entries.length) {
      summaryLines.push(`➕ …and ${rows.length - entries.length} more not shown.`);
    }
    if (mode === 'minimal') {
      summaryLines.push('ℹ️ Use `/watch list mode:full` for detailed output.');
    }

    await interaction.editReply({
      content: summaryLines.join('\n'),
      embeds,
    });
    logger.debug(
      { userId: interaction.user.id, count: rows.length, mode },
      '/watch list completed',
    );
  } catch (error: any) {
    logger.error({ err: error, userId: interaction.user.id }, 'Failed to list watches');
    await interaction.editReply(`❌ Failed to list watches: ${error?.message ?? 'Unknown error'}`);
  }
}
