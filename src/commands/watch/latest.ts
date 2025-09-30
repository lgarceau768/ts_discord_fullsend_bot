import type { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { logger } from '../../logger.js';
import type { WatchBase } from '../../types/watch.js';
import { getErrorMessage } from '../../utils/errors.js';
import { inferTitleFromUrl } from '../../utils/urlTitle.js';

import { buildLatestEmbed, extractPriceSnapshot } from './display.js';

export const LATEST_SUBCOMMAND_NAME = 'latest';

export function configureLatestSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(LATEST_SUBCOMMAND_NAME)
    .setDescription('Show the latest price/stock data for one of your watches')
    .addStringOption((option) =>
      option.setName('uuid').setDescription('Watch UUID (from /watch list)').setRequired(true),
    );
}

export async function handleLatestSubcommand(
  base: WatchBase,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const uuid = interaction.options.getString('uuid', true).trim();
  await interaction.deferReply({ ephemeral: true });

  logger.debug({ userId: interaction.user.id, uuid }, 'Processing /watch latest');

  try {
    const record = await base.dbGetWatch(interaction.user.id, uuid);
    if (!record) {
      await interaction.editReply(
        '❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.',
      );
      logger.warn(
        { userId: interaction.user.id, uuid },
        '/watch latest denied: not found or unauthorized',
      );
      return;
    }

    let details: Awaited<ReturnType<typeof base.cdGetWatchDetails>> | undefined;
    let history: Awaited<ReturnType<typeof base.cdGetWatchHistory>> = [];
    let errorMessage: string | undefined;
    let pageTitle: string | undefined;

    try {
      details = await base.cdGetWatchDetails(uuid);
      if (details?.title && typeof details.title === 'string' && details.title.trim()) {
        pageTitle = details.title.trim();
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      errorMessage = message.slice(0, 200);
      logger.error({ err: error, uuid }, 'Failed to fetch watch details for latest');
    }

    try {
      history = await base.cdGetWatchHistory(uuid);
    } catch (error: unknown) {
      logger.warn(
        { err: error, uuid },
        'Failed to fetch watch history; continuing without history',
      );
      if (!errorMessage) {
        const message = getErrorMessage(error);
        errorMessage = message.slice(0, 200);
      }
    }

    const priceSnapshot = extractPriceSnapshot(details, history);
    if (!priceSnapshot) {
      logger.info({ uuid }, 'No price/stock data found for latest');
    }

    pageTitle ??= inferTitleFromUrl(record.url);

    const embed = buildLatestEmbed(base, {
      uuid,
      watchUrl: record.url,
      tags: record.tags ?? [],
      details,
      priceSnapshot,
      pageTitle,
      errorMessage,
    });

    await interaction.editReply({
      content: priceSnapshot
        ? `📈 Latest price/stock data for \`${uuid}\`:`
        : `ℹ️ No price/stock data available yet for \`${uuid}\`.`,
      embeds: [embed],
    });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId: interaction.user.id, uuid },
      'Failed to process /watch latest',
    );
    await interaction.editReply(`❌ Failed to fetch latest data: ${getErrorMessage(error)}`);
  }
}
