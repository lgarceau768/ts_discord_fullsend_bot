import { type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';

export const SEARCH_SUBCOMMAND_NAME = 'search';

export function configureSearchSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(SEARCH_SUBCOMMAND_NAME)
    .setDescription('Search for penny deals by ZIP code and filters')
    .addStringOption((opt) =>
      opt
        .setName('zip')
        .setDescription('ZIP code to target (5 digits)')
        .setMinLength(5)
        .setMaxLength(5)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('retailer')
        .setDescription('Retailer to prioritize')
        .addChoices(
          { name: 'Home Depot', value: 'home-depot' },
          { name: "Lowe's", value: 'lowes' },
        ),
    )
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Optional keyword filter for deal titles'),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('radius')
        .setDescription('Search radius in miles')
        .setMinValue(1)
        .setMaxValue(100),
    );
}

export async function handleSearchSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Pseudo-code outline:
  // 1. Read zip, retailer, query, and radius options from the interaction.
  // 2. Validate retailer defaults and normalize filters for the scraping service.
  // 3. Dispatch a Selenium-grid job to fetch penny deal candidates.
  // 4. Wait for the job result or stream partial updates from a job queue.
  // 5. Persist results into Postgres for re-use and alert workflows.
  // 6. Format the deals as Discord embeds with pricing context and reply.

  await interaction.reply({
    content: 'Penny deal search will trigger a Selenium job and return formatted results.',
    ephemeral: true,
  });
}
