import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { logger } from '../../../core/logger.js';
import type { SlashCommand } from '../../../core/types/commands.js';
import { getErrorMessage } from '../../../core/utils/errors.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('lego')
    .setDescription('Log a LEGO product for quick sharing')
    .addStringOption((opt) => opt.setName('url').setDescription('Product URL').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('sku').setDescription('LEGO SKU or set number').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('image_url').setDescription('Primary product image URL').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Product title to display').setRequired(true),
    ),
  async execute(interaction) {
    const url = interaction.options.getString('url', true).trim();
    const sku = interaction.options.getString('sku', true).trim();
    const imageUrl = interaction.options.getString('image_url', true).trim();
    const title = interaction.options.getString('title', true).trim();

    await interaction.deferReply();

    try {
      logger.info({ userId: interaction.user.id, url, sku }, 'Received LEGO submission');

      const embed = new EmbedBuilder()
        .setTitle(title || 'LEGO Product')
        .setDescription('This product was recorded locally; no external storage performed.')
        .setURL(url)
        .setColor(0xffc800)
        .addFields({ name: 'SKU', value: `\`${sku}\``, inline: true })
        .addFields({ name: 'Image URL', value: imageUrl, inline: false });

      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({
        content: '✅ LEGO product noted.',
        embeds: [embed],
      });
    } catch (error) {
      logger.error(
        { err: error, userId: interaction.user.id, url, sku },
        'Failed to log LEGO submission',
      );
      await interaction.editReply(`❌ Failed to log LEGO product: ${getErrorMessage(error)}`);
    }
  },
};

export default command;
