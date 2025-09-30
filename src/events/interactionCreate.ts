import {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type Client,
  type Collection,
  type Message,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ChatInputCommandInteraction,
  ComponentType,
} from 'discord.js';

import type { SlashCommand } from '../commands/_types.js';
import { createRequest, getDetails, pickDefaultSeasons } from '../integrations/jellyseerr.js';
import { getErrorMessage } from '../utils/errors.js';
import { ensureChildThread } from '../utils/thread.js';

type CommandMap = Collection<string, SlashCommand>;
type ReqKind = 'movie' | 'tv';

const isGuildMessage = (message: Message<boolean>): message is Message<true> => message.inGuild();

/** ---------- Guards ---------- */

const isReqButton = (i: ButtonInteraction) => Boolean(i.customId) && i.customId.startsWith('req:');

const isSeasonPicker = (i: StringSelectMenuInteraction) => i.customId.startsWith('seasonpick:');

/** ---------- Parsers ---------- */

const parseReqButtonId = (
  id: string,
): { kind: ReqKind | null; tmdbId: number | null; idx: number } => {
  // format: req:<kind>:<tmdbId>:<idx?>
  const [, kind, tmdbStr, idxStr] = id.split(':');
  const tmdbId = Number(tmdbStr);
  const idx = Number(idxStr ?? 0) || 0;

  if ((kind !== 'movie' && kind !== 'tv') || Number.isNaN(tmdbId)) {
    return { kind: null, tmdbId: null, idx: 0 };
  }
  return { kind, tmdbId, idx };
};

const parseSeasonPickerId = (id: string): number | null => {
  // format: seasonpick:<tmdbId>
  const [, tmdbStr] = id.split(':');
  const tmdbId = Number(tmdbStr);
  return Number.isNaN(tmdbId) ? null : tmdbId;
};

/** ---------- Sub-steps ---------- */

const handleChatInput = async (
  i: ChatInputCommandInteraction,
  commands: CommandMap,
): Promise<void> => {
  const cmd = commands.get(i.commandName);
  if (!cmd) {
    await i.reply({ content: 'Unknown command.', ephemeral: true });
    return;
  }
  await cmd.execute(i);
};

const getThreadForButton = async (i: ButtonInteraction, idx: number) => {
  const parentMsg = i.message;
  if (!isGuildMessage(parentMsg)) {
    await i.followUp({
      content: '❌ Unable to open a follow-up thread outside of a guild channel.',
      ephemeral: true,
    });
    return null;
  }
  const guessTitle = parentMsg.embeds?.[idx]?.title ?? 'trakt-requests';
  return ensureChildThread(parentMsg, `trakt: ${guessTitle}`);
};

const submitMovieRequest = async (i: ButtonInteraction, tmdbId: number) => {
  const who = `<@${i.user.id}>`;
  const thread = await getThreadForButton(i, 0);
  if (!thread) return;

  const status = await thread.send(`${who} 🎬 Submitting movie request (TMDB ${tmdbId})…`);
  try {
    await createRequest('movie', tmdbId);
    await status.edit(`✅ ${who} Movie request submitted to Jellyseerr (TMDB ${tmdbId}).`);
  } catch (error) {
    await status.edit(`❌ ${who} Failed to request movie: ${getErrorMessage(error)}`);
  }
};

const postSeasonMenu = async (i: ButtonInteraction, tmdbId: number, idx: number) => {
  const who = `<@${i.user.id}>`;
  const thread = await getThreadForButton(i, idx);
  if (!thread) return;

  const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`seasonpick:${tmdbId}`)
      .setPlaceholder('Pick seasons to request')
      .addOptions(
        { label: 'All seasons', value: 'all' },
        { label: 'First season only', value: 'first' },
        { label: 'Latest season only', value: 'latest' },
      ),
  );

  await thread.send({
    content: `${who} 📺 Which seasons would you like to request for TMDB ${tmdbId}?`,
    components: [menu],
  });
};

const resolveSeasons = (choice: string, total: number): number[] => {
  if (choice === 'all') return Array.from({ length: total }, (_, i) => i + 1);
  if (choice === 'latest') return [Math.max(1, total)];
  // default: 'first'
  return [1];
};

const handleSeasonPicker = async (i: StringSelectMenuInteraction) => {
  const tmdbId = parseSeasonPickerId(i.customId);
  if (!tmdbId) {
    await i.update({ content: '❌ Bad TMDB id.', components: [] });
    return;
  }

  // ACK quickly; we’ll edit the menu message after the API call
  await i.deferUpdate();

  const choice = i.values?.[0] ?? 'first'; // all | first | latest

  try {
    const details = await getDetails('tv', tmdbId);
    const total = Array.isArray(details.seasons)
      ? details.seasons.filter((s) => (s?.seasonNumber ?? 0) > 0).length
      : 0;

    let seasons = resolveSeasons(choice, total);
    if (!seasons.length) seasons = pickDefaultSeasons(total);

    await createRequest('tv', tmdbId, seasons);

    await i.message.edit({
      content: `✅ TV request submitted for seasons ${seasons.join(', ')} (TMDB ${tmdbId}).`,
      components: [],
    });
  } catch (error) {
    await i.message.edit({
      content: `❌ Failed to request TV show (TMDB ${tmdbId}): ${getErrorMessage(error)}`,
      components: [],
    });
  }
};

const handleReqButton = async (i: ButtonInteraction) => {
  if (!isReqButton(i)) return;

  // ACK immediately so we never hit the 3s timeout
  await i.deferUpdate();

  const { kind, tmdbId, idx } = parseReqButtonId(i.customId ?? '');
  if (!kind || !tmdbId) return;

  if (kind === 'movie') {
    await submitMovieRequest(i, tmdbId);
    return;
  }

  // kind === 'tv'
  await postSeasonMenu(i, tmdbId, idx);
};

/** ---------- Wire-up ---------- */

export default (client: Client, commands: CommandMap) => {
  client.on(Events.InteractionCreate, (interaction) => {
    // Keep listener type as void; run async logic in a thrown-away task
    void (async () => {
      if (interaction.isChatInputCommand()) {
        await handleChatInput(interaction, commands);
        return;
      }

      // Narrow to components only
      if (interaction.isButton()) {
        await handleReqButton(interaction);
        return;
      }

      if (
        interaction.isStringSelectMenu() &&
        interaction.componentType === ComponentType.StringSelect &&
        isSeasonPicker(interaction)
      ) {
        await handleSeasonPicker(interaction);
      }
    })().catch((err) => {
      console.error('InteractionCreate handler error:', err);
    });
  });
};
