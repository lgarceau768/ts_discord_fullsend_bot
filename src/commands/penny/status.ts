import { type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';

export const STATUS_SUBCOMMAND_NAME = 'status';

export function configureStatusSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(STATUS_SUBCOMMAND_NAME)
    .setDescription('Show penny deal subscription and crawler status for the user');
}

export async function handleStatusSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Pseudo-code outline:
  // 1. Fetch all active subscriptions for the requesting user from Postgres.
  // 2. Join crawler job metadata to display last run, next run, and job health.
  // 3. Identify any stalled jobs and propose remediation actions.
  // 4. Format the status report with pagination-friendly embeds or sections.
  // 5. Reply with the compiled status summary and command shortcuts.

  await interaction.reply({
    content: 'Status will enumerate subscriptions and crawler health metrics.',
    ephemeral: true,
  });
}
