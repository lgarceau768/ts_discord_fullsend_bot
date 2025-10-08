import type { SlashCommandSubcommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import { logger } from '../../../../core/logger.js';
import { getErrorMessage } from '../../../../core/utils/errors.js';
import type { WatchBase } from '../../types/watch.js';
import { inferTitleFromUrl } from '../../utils/urlTitle.js';

import {
  buildFullListEmbed,
  buildMinimalListEmbed,
  type DisplayEntry,
  extractPriceSnapshot,
} from './display.js';

export const LIST_SUBCOMMAND_NAME = 'list';

const PAGE_SIZE = 10;
const MAX_FETCH_LIMIT = 250;

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
    )
    .addStringOption((option) =>
      option.setName('store').setDescription('Filter by store tag (e.g., bestbuy, target)'),
    )
    .addStringOption((option) =>
      option.setName('tags').setDescription('Filter by tags (comma or space separated)'),
    )
    .addStringOption((option) =>
      option.setName('search').setDescription('Filter by URL, UUID, or tag substring'),
    )
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('Page number to display (10 results per page)')
        .setMinValue(1),
    )
    .addBooleanOption((option) =>
      option.setName('all').setDescription('Show all results (ignores pagination)'),
    );
}

export async function handleListSubcommand(
  base: WatchBase,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const modeInput = interaction.options.getString('mode')?.toLowerCase() ?? 'minimal';
  const mode = modeInput === 'full' ? 'full' : 'minimal';
  const rawStoreFilter = interaction.options.getString('store')?.trim().toLowerCase() ?? '';
  const storeFilter = rawStoreFilter.replace(/^store:/, '').trim();
  const tagsInput = interaction.options.getString('tags') ?? undefined;
  const tagFilters = base.parseTags(tagsInput);
  const searchInput = interaction.options.getString('search')?.trim() ?? '';
  const searchTerm = searchInput.toLowerCase();
  const showAll = interaction.options.getBoolean('all') ?? false;
  let page = interaction.options.getInteger('page') ?? 1;
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  logger.debug(
    {
      userId: interaction.user.id,
      mode,
      storeFilter,
      tagFilters,
      search: searchTerm,
      showAll,
      page,
    },
    'Processing /watch list',
  );

  try {
    const requestedFetch = showAll ? MAX_FETCH_LIMIT : page * PAGE_SIZE + PAGE_SIZE;
    const fetchLimit = Math.min(Math.max(requestedFetch, PAGE_SIZE), MAX_FETCH_LIMIT);

    const rows = await base.dbListWatches(interaction.user.id, { limit: fetchLimit });
    if (!rows.length) {
      await interaction.editReply('🌱 You have no watches yet. Add one with `/watch add`.');
      logger.debug({ userId: interaction.user.id }, 'No watches found for user');
      return;
    }

    const normalizedTagFilters = tagFilters.map((tag) => tag.toLowerCase());

    const filteredRows = rows.filter((record) => {
      const rowTags = (record.tags || []).map((tag) => tag.toLowerCase());

      if (storeFilter) {
        if (!rowTags.some((tag) => tag === `store:${storeFilter}`)) {
          return false;
        }
      }

      if (normalizedTagFilters.length) {
        const hasAll = normalizedTagFilters.every((tag) => rowTags.includes(tag));
        if (!hasAll) return false;
      }

      if (searchTerm) {
        const haystack = [record.url, record.watch_uuid, ...rowTags].join(' ').toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    if (!filteredRows.length) {
      await interaction.editReply(
        '🔍 No watches match your filters. Try adjusting them and retry.',
      );
      logger.debug({ userId: interaction.user.id }, 'No watches matched filters');
      return;
    }

    const totalCount = filteredRows.length;
    const pageCount = showAll ? 1 : Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);
    if (!showAll && page > pageCount) {
      page = pageCount;
    }

    const startIndex = showAll ? 0 : (page - 1) * PAGE_SIZE;
    const endIndex = showAll ? totalCount : Math.min(startIndex + PAGE_SIZE, totalCount);

    const displayRows = filteredRows.slice(startIndex, endIndex);
    const entries: DisplayEntry[] = [];

    for (let i = 0; i < displayRows.length; i += 1) {
      const record = displayRows[i];
      let details: Awaited<ReturnType<typeof base.cdGetWatchDetails>> | undefined;
      let history: Awaited<ReturnType<typeof base.cdGetWatchHistory>> = [];
      let priceSnapshot = null;
      let errorMessage: string | undefined;
      let pageTitle: string | undefined;

      try {
        details = await base.cdGetWatchDetails(record.watch_uuid);
        if (details?.title && typeof details.title === 'string' && details.title.trim()) {
          pageTitle = details.title.trim();
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        errorMessage = message.slice(0, 200);
        logger.error(
          { err: error, uuid: record.watch_uuid },
          'Failed to fetch watch details for list',
        );
      }

      try {
        history = await base.cdGetWatchHistory(record.watch_uuid);
        priceSnapshot = extractPriceSnapshot(details, history);
      } catch (error: unknown) {
        logger.warn(
          { err: error, uuid: record.watch_uuid },
          'Failed to fetch watch history for list',
        );
        if (!errorMessage) {
          const message = getErrorMessage(error);
          errorMessage = message.slice(0, 200);
        }
      }

      pageTitle ??= inferTitleFromUrl(record.url);

      entries.push({
        index: startIndex + i + 1,
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
    const filterLabels: string[] = [];
    if (storeFilter) filterLabels.push(`store=${storeFilter}`);
    if (normalizedTagFilters.length) filterLabels.push(`tags=${normalizedTagFilters.join(',')}`);
    if (searchTerm) filterLabels.push(`search=${searchTerm}`);

    const summaryLines = [
      `${filterLabels.length ? '📋 Found' : '📋 You have'} **${totalCount}** watch(es).`,
      `🔎 Showing ${entries.length} in **${modeLabel}** mode${showAll ? '' : ` (page ${page}/${pageCount}, ${PAGE_SIZE} per page)`}.`,
    ];

    if (filterLabels.length) {
      summaryLines.splice(1, 0, `🧭 Filters: ${filterLabels.join(' · ')}`);
    }

    if (!showAll && totalCount > entries.length) {
      const remaining = Math.max(totalCount - endIndex, 0);
      if (remaining > 0) {
        summaryLines.push(`➕ …and ${remaining} more not shown here.`);
      }
      if (page < pageCount) {
        summaryLines.push(
          `➡️ Use \`/watch list page:${page + 1}\` for the next ${Math.min(PAGE_SIZE, remaining || PAGE_SIZE)}.`,
        );
      }
      if (page > 1) {
        summaryLines.push(`⬅️ Use \`/watch list page:${page - 1}\` to revisit the previous page.`);
      }
      if (pageCount > 1) {
        summaryLines.push('🧾 Use `/watch list all:true` to show all matches at once.');
      }
    }

    if (mode === 'minimal') {
      summaryLines.push('ℹ️ Use `/watch list mode:full` for detailed output.');
    }

    if (rows.length === fetchLimit && fetchLimit === MAX_FETCH_LIMIT) {
      summaryLines.push(`⚠️ Showing the first ${MAX_FETCH_LIMIT} records stored for you.`);
    }

    await interaction.editReply({
      content: summaryLines.join('\n'),
      embeds,
    });
    logger.debug(
      { userId: interaction.user.id, count: rows.length, mode },
      '/watch list completed',
    );
  } catch (error: unknown) {
    logger.error({ err: error, userId: interaction.user.id }, 'Failed to list watches');
    await interaction.editReply(`❌ Failed to list watches: ${getErrorMessage(error)}`);
  }
}
