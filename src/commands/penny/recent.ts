import { type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';

export const RECENT_SUBCOMMAND_NAME = 'recent';

export function configureRecentSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(RECENT_SUBCOMMAND_NAME)
    .setDescription('Show recently spotted penny deals for a location')
    .addStringOption((opt) =>
      opt
        .setName('zip')
        .setDescription('ZIP code to filter recent finds (5 digits)')
        .setMinLength(5)
        .setMaxLength(5)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('retailer')
        .setDescription('Retailer to filter by')
        .addChoices(
          { name: 'Home Depot', value: 'home-depot' },
          { name: "Lowe's", value: 'lowes' },
        ),
    );
}

export async function handleRecentSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Pseudo-code outline:
  // 1. Capture zip and optional retailer from the interaction.
  // 2. Query Postgres for the latest stored penny deals keyed by location.
  // 3. Optionally backfill by kicking off a background scrape if data is stale.
  // 4. Aggregate deals by freshness and highlight notable price drops.
  // 5. Reply with a concise summary and link out to detailed dashboards.

  await interaction.reply({
    content: 'Recent penny deals will be loaded from storage and summarized here.',
    ephemeral: true,
  });
}
