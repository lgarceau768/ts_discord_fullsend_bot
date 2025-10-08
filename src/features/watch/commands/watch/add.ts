import {
  EmbedBuilder,
  type SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { logger } from '../../../../core/logger.js';
import { getErrorMessage } from '../../../../core/utils/errors.js';
import type { WatchBase, WatchCreatedEmbedInput } from '../../types/watch.js';
import { inferTitleFromUrl } from '../../utils/urlTitle.js';

export const ADD_SUBCOMMAND_NAME = 'add';

export function configureAddSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(ADD_SUBCOMMAND_NAME)
    .setDescription('Add a website to ChangeDetection (price watch)')
    .addStringOption((option) =>
      option.setName('url').setDescription('Product/website URL').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('title').setDescription('Title to use for this watch').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('store').setDescription('Store name (e.g., bestbuy, target, etc.)'),
    )
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Extra tags (comma or space separated, e.g., gpu,4090,deal)'),
    );
}

function buildWatchCreatedEmbed(input: WatchCreatedEmbedInput): EmbedBuilder {
  const { base, url, uuid, tags, pageTitle } = input;
  const trimmedTitle = pageTitle?.trim();
  const resolvedTitle = trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : url;
  const tagDisplay = tags.length > 0 ? tags.map((tag) => `\`${tag}\``).join(' ') : '—';

  const embed = new EmbedBuilder()
    .setTitle(resolvedTitle)
    .setAuthor({ name: 'Watch Created', iconURL: base.icons.watch })
    .setColor(base.colors.success)
    .addFields({ name: 'Product', value: `[View product](${url})`, inline: false })
    .addFields({ name: 'Tags', value: tagDisplay, inline: false })
    .addFields({ name: 'Watch UUID', value: `\`${uuid}\``, inline: false });

  const iconUrl = base.getSiteIconUrl(url)?.trim();
  if (iconUrl) {
    embed.setThumbnail(iconUrl);
  }

  return embed;
}

export async function handleAddSubcommand(
  base: WatchBase,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const url = interaction.options.getString('url', true).trim();
  const customTitle = interaction.options.getString('title', true).trim();
  const store = interaction.options.getString('store')?.trim().toLowerCase() ?? null;
  const extraTags = base.parseTags(interaction.options.getString('tags'));
  const userId = interaction.user.id;
  const requesterTag = `${interaction.user.username}#${interaction.user.discriminator ?? '0000'}`;

  await interaction.deferReply();

  logger.debug({ userId, url, store, extraTags }, 'Processing /watch add');

  try {
    const tags = base.mkOwnerTags(userId, requesterTag, store, extraTags);
    const derivedTitle = customTitle.length > 0 ? customTitle : inferTitleFromUrl(url);
    const title = `[PRICE WATCH] ${derivedTitle}`;

    const templateContext = {
      user: requesterTag,
      user_id: userId,
      store: store ?? '',
      watch_url: url,
    } as const;

    const body = base.renderTemplate(base.notificationTemplate, templateContext);
    const notificationTitle = base.renderTemplate('{{watch_url}}', templateContext);
    const bodyHasPlaceholders = /\{\{[^}]+}}/.test(body);
    logger.info({ bodyHasPlaceholders, notificationTitle }, 'Rendered watch notification template');

    if (!/^([a-z]+):\/\//i.test(base.notificationUrl)) {
      logger.warn(
        { notificationUrl: base.notificationUrl },
        'Notification URL appears invalid (missing scheme)',
      );
    }

    const uuid = await base.cdCreateWatch({
      url,
      title,
      tagTitles: tags,
      notificationUrl: base.notificationUrl,
      notificationBody: body,
      notificationTitle,
      notificationFormat: 'Markdown',
      trackLdjsonPriceData: true,
      fetchBackend: 'html_webdriver',
      webdriverDelaySec: 3,
      intervalMinutes: 20,
    });

    await base.dbInsertWatch({ userId, userTag: requesterTag, watchUuid: uuid, url, tags });

    logger.info({ userId, uuid, url }, 'Watch created and stored');
    const embed = buildWatchCreatedEmbed({ base, url, uuid, tags, pageTitle: derivedTitle });
    await interaction.editReply({
      content: `🎉 Watch created in ChangeDetection and linked to your account.`,
      embeds: [embed],
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Failed to process /watch add');
    await interaction.editReply(`❌ Failed to create watch: ${getErrorMessage(error)}`);
  }
}
