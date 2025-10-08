import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { logger } from '../../../core/logger.js';
import type { SlashCommand } from '../../../core/types/commands.js';
import { getErrorMessage } from '../../../core/utils/errors.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('target')
    .setDescription('Log a Target Pokémon TCIN for quick sharing')
    .addStringOption((opt) =>
      opt.setName('url').setDescription('Target product URL').setRequired(true),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('stock')
        .setDescription('Mark whether the item is currently in stock')
        .setRequired(true),
    ),
  async execute(interaction) {
    const url = interaction.options.getString('url', true).trim();
    const stock = interaction.options.getBoolean('stock', true);

    await interaction.deferReply();

    try {
      logger.info(
        { userId: interaction.user.id, url, stock },
        'Received Target Pokémon TCIN submission',
      );

      const embed = new EmbedBuilder()
        .setTitle('Target Pokémon TCIN')
        .setDescription('Submission stored locally; no external data table used.')
        .setURL(url)
        .setColor(stock ? 0x22c55e : 0xef4444)
        .addFields(
          { name: 'URL', value: url, inline: false },
          { name: 'Stock', value: stock ? '✅ In stock' : '❌ Out of stock', inline: true },
        );

      await interaction.editReply({
        content: '✅ Target Pokémon TCIN noted.',
        embeds: [embed],
      });
    } catch (error) {
      logger.error(
        { err: error, userId: interaction.user.id, url, stock },
        'Failed to add Target TCIN row',
      );
      await interaction.editReply(
        `❌ Failed to log Target Pokémon TCIN: ${getErrorMessage(error)}`,
      );
    }
  },
};

export default command;
