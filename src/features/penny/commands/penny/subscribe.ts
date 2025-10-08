import { type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';

export const SUBSCRIBE_SUBCOMMAND_NAME = 'subscribe';

export function configureSubscribeSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(SUBSCRIBE_SUBCOMMAND_NAME)
    .setDescription('Subscribe to penny deal alerts')
    .addStringOption((opt) =>
      opt
        .setName('zip')
        .setDescription('ZIP code or service area to monitor')
        .setMinLength(5)
        .setMaxLength(5)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('retailer')
        .setDescription('Preferred retailer for alerts')
        .addChoices(
          { name: 'Home Depot', value: 'home-depot' },
          { name: "Lowe's", value: 'lowes' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('keyword')
        .setDescription('Optional keyword to narrow alerts (e.g., tool, paint, ladder)'),
    );
}

export async function handleSubscribeSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Pseudo-code outline:
  // 1. Parse subscription scope (zip, retailer, keyword) and user identity.
  // 2. Upsert the subscription record into Postgres with scheduling metadata.
  // 3. Schedule or update Selenium crawling jobs for the subscription filters.
  // 4. Confirm next run window and alert delivery channel (DM vs channel).
  // 5. Reply with a summary of the new subscription and management hints.

  await interaction.reply({
    content: 'Subscription setup will store your preferences and enqueue crawlers.',
    ephemeral: true,
  });
}
