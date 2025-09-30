import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

import { getActiveDownloads } from '../integrations/qbittorrent.js';

import type { SlashCommand } from './_types.js';

/**
 * `/downloads` command queries the qBittorrent WebUI API for any active
 * downloads and displays progress details. If there are no active downloads,
 * the bot will inform the user accordingly. Results are limited to the first
 * 10 torrents for brevity and formatted as embeds.
 */
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('downloads')
    .setDescription('Show current qBittorrent download progress'),
  async execute(interaction) {
    await interaction.deferReply();
    try {
      const torrents = await getActiveDownloads();
      if (!torrents || torrents.length === 0) {
        await interaction.editReply('There are no active downloads at the moment.');
        return;
      }
      const embeds: EmbedBuilder[] = [];
      torrents.slice(0, 10).forEach((t, idx) => {
        const progressPercent = (t.progress * 100).toFixed(1);
        const etaMinutes = t.eta && t.eta > 0 ? Math.ceil(t.eta / 60) : null;
        const etaString = etaMinutes ? `${etaMinutes} min` : '∞';
        const embed = new EmbedBuilder()
          .setTitle(`${idx + 1}. ${t.name}`)
          .setDescription(
            `**Progress:** ${progressPercent}%\n` +
              `**Download speed:** ${(t.dlspeed / 1024 / 1024).toFixed(2)} MiB/s\n` +
              `**ETA:** ${etaString}\n` +
              `**State:** ${t.state}`,
          )
          .setColor(0x2f81d6);
        embeds.push(embed);
      });
      await interaction.editReply({ embeds });
    } catch (err) {
      console.error(err);
      await interaction.editReply(
        `Failed to fetch downloads: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  },
};

export default command;
