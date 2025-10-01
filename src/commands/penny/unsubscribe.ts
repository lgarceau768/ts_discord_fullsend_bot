import { type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';

export const UNSUBSCRIBE_SUBCOMMAND_NAME = 'unsubscribe';

export function configureUnsubscribeSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(UNSUBSCRIBE_SUBCOMMAND_NAME)
    .setDescription('Remove an existing penny deal alert subscription')
    .addStringOption((opt) =>
      opt
        .setName('subscription_id')
        .setDescription('Identifier shown in /penny status output')
        .setRequired(true),
    );
}

export async function handleUnsubscribeSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // Pseudo-code outline:
  // 1. Validate the provided subscription identifier against the current user.
  // 2. Delete or soft-disable the subscription in Postgres.
  // 3. Tear down any crawler jobs that are no longer needed.
  // 4. Emit analytics or audit logs for traceability.
  // 5. Reply confirming the subscription was removed and next steps if any.

  await interaction.reply({
    content: 'Unsubscribe will clean up stored preferences and disable crawlers.',
    ephemeral: true,
  });
}
