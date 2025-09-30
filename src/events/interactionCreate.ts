import {
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type Client,
  type Collection,
} from 'discord.js';

import { createRequest, getDetails, pickDefaultSeasons } from '../integrations/jellyseerr.js';
import { ensureChildThread } from '../utils/thread.js';

type CommandMap = Collection<string, any>;

export default (client: Client, commands: CommandMap) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    // ---- Slash commands (unchanged)
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) {
        await interaction.reply({ content: 'Unknown command.', ephemeral: true });
        return;
      }
      await cmd.execute(interaction);
      return;
    }

    // ======================
    // Buttons on search msg
    // ======================
    if (interaction.isButton()) {
      const id = interaction.customId ?? '';
      if (!id.startsWith('req:')) return;

      // ACK immediately so we never hit the 3s timeout
      await interaction.deferUpdate();

      const [, kind, tmdbStr, idxStr] = id.split(':');
      const tmdbId = Number(tmdbStr);
      const idx = Number(idxStr) || 0;

      // Create or reuse a child thread off the search message
      const parentMsg = interaction.message;
      const guessTitle = parentMsg.embeds?.[idx]?.title ?? 'trakt-requests';
      // @ts-expect-error
      const thread = await ensureChildThread(parentMsg, `trakt: ${guessTitle}`);

      const who = `<@${interaction.user.id}>`;

      if (kind === 'movie') {
        const status = await thread.send(`${who} 🎬 Submitting movie request (TMDB ${tmdbId})…`);
        try {
          await createRequest('movie', tmdbId);
          await status.edit(`✅ ${who} Movie request submitted to Jellyseerr (TMDB ${tmdbId}).`);
        } catch (e: any) {
          await status.edit(`❌ ${who} Failed to request movie: ${e?.message ?? 'Unknown error'}`);
        }
        return;
      }

      if (kind === 'tv') {
        // Post a season picker **in the thread**
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
        return;
      }

      return;
    }

    // ==========================
    // Season picker in the thread
    // ==========================
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('seasonpick:')) {
      // ACK now; we'll edit the menu message after the API call
      await interaction.deferUpdate();

      const tmdbId = Number(interaction.customId.split(':')[1]);
      const choice = interaction.values[0]; // all | first | latest

      try {
        const details = await getDetails('tv', tmdbId);
        const total = Array.isArray(details.seasons)
          ? details.seasons.filter((s) => (s?.seasonNumber ?? 0) > 0).length
          : 0;

        let seasons =
          choice === 'all'
            ? Array.from({ length: total }, (_, i) => i + 1)
            : choice === 'latest'
              ? [Math.max(1, total)]
              : [1];

        if (!seasons.length) seasons = pickDefaultSeasons(total);

        await createRequest('tv', tmdbId, seasons);

        // This updates the thread message that contained the menu
        await interaction.message.edit({
          content: `✅ TV request submitted for seasons ${seasons.join(', ')} (TMDB ${tmdbId}).`,
          components: [],
        });
      } catch (e: any) {
        await interaction.message.edit({
          content: `❌ Failed to request TV show (TMDB ${tmdbId}): ${e?.message ?? 'Unknown error'}`,
          components: [],
        });
      }
      return;
    }
  });
};
