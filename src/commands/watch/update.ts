import type { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { logger } from '../../logger.js';
import type { WatchBase } from '../../types/watch.js';
import { inferTitleFromUrl } from '../../utils/urlTitle.js';

import { buildLatestEmbed, extractPriceSnapshot } from './display.js';

export const UPDATE_SUBCOMMAND_NAME = 'update';

export function configureUpdateSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(UPDATE_SUBCOMMAND_NAME)
    .setDescription('Update an existing ChangeDetection watch')
    .addStringOption((option) =>
      option.setName('uuid').setDescription('Watch UUID (from /watch list)').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('title').setDescription('New title to use for this watch'),
    )
    .addStringOption((option) =>
      option.setName('store').setDescription('Store name (e.g., bestbuy, target, etc.)'),
    )
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Extra tags (comma or space separated, e.g., gpu,4090,deal)'),
    )
    .addIntegerOption((option) =>
      option
        .setName('interval_minutes')
        .setDescription('Minutes between checks (e.g., 20)')
        .setMinValue(5)
        .setMaxValue(1440),
    )
    .addBooleanOption((option) =>
      option.setName('track_price').setDescription('Track ld-json price data'),
    );
}

export async function handleUpdateSubcommand(
  base: WatchBase,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const uuid = interaction.options.getString('uuid', true).trim();
  const newTitle = interaction.options.getString('title')?.trim();
  const store = interaction.options.getString('store')?.trim().toLowerCase() ?? null;
  const extraTagsInput = interaction.options.getString('tags');
  const intervalMinutes = interaction.options.getInteger('interval_minutes') ?? undefined;
  const trackPrice = interaction.options.getBoolean('track_price') ?? undefined;

  await interaction.deferReply();

  try {
    const record = await base.dbGetWatch(interaction.user.id, uuid);
    if (!record) {
      await interaction.editReply(
        '❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.',
      );
      logger.warn(
        { userId: interaction.user.id, uuid },
        '/watch update denied: not found or unauthorized',
      );
      return;
    }

    let tagTitles: string[] | undefined;
    if (store !== null || extraTagsInput !== null) {
      const extras = base.parseTags(extraTagsInput);
      tagTitles = base.mkOwnerTags(
        interaction.user.id,
        `${interaction.user.username}#${interaction.user.discriminator ?? '0000'}`,
        store,
        extras,
      );
    }

    await base.cdUpdateWatch({
      uuid,
      title: newTitle ?? undefined,
      tagTitles,
      trackLdjsonPriceData: trackPrice,
      intervalMinutes: intervalMinutes ?? undefined,
    });

    if (tagTitles) {
      await base.dbUpdateWatch({ userId: interaction.user.id, watchUuid: uuid, tags: tagTitles });
    }

    const tagsForEmbed = tagTitles ?? record.tags ?? [];

    const details = await base.cdGetWatchDetails(uuid).catch(() => undefined);
    const history = await base.cdGetWatchHistory(uuid).catch(() => []);
    const priceSnapshot = extractPriceSnapshot(details, history ?? []);
    const pageTitle = newTitle ?? details?.title?.trim() ?? inferTitleFromUrl(record.url);

    const embed = buildLatestEmbed(base, {
      uuid,
      watchUrl: record.url,
      tags: tagsForEmbed,
      details,
      priceSnapshot,
      pageTitle,
    });

    await interaction.editReply({
      content: '✅ Watch updated.',
      embeds: [embed],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    logger.error({ err: error, userId: interaction.user.id, uuid }, 'Failed to update watch');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await interaction.editReply(`❌ Failed to update watch: ${error?.message ?? 'Unknown error'}`);
  }
}
