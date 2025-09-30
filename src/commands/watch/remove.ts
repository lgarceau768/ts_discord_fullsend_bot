import {
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../../logger.js";
import type { WatchBase } from "../../types/watch.js";

export const REMOVE_SUBCOMMAND_NAME = "remove";

export function configureRemoveSubcommand(subcommand: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(REMOVE_SUBCOMMAND_NAME)
    .setDescription("Remove one of your watches")
    .addStringOption((option) =>
      option
        .setName("uuid")
        .setDescription("Watch UUID (from /watch list)")
        .setRequired(true),
    );
}

export async function handleRemoveSubcommand(base: WatchBase, interaction: ChatInputCommandInteraction): Promise<void> {
  const uuid = interaction.options.getString("uuid", true).trim();
  await interaction.deferReply();

  logger.debug({ userId: interaction.user.id, uuid }, "Processing /watch remove");

  try {
    const removed = await base.dbDeleteWatch(interaction.user.id, uuid);
    if (!removed) {
      await interaction.editReply("❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.");
      logger.warn({ userId: interaction.user.id, uuid }, "/watch remove denied: not found or unauthorized");
      return;
    }

    try {
      await base.cdDeleteWatch(uuid);
    } catch (error: any) {
      logger.warn({ err: error, uuid }, "ChangeDetection delete failed during /watch remove");
    }

    await interaction.editReply(`🗑️ Removed watch \`${uuid}\`.`);
    logger.info({ userId: interaction.user.id, uuid }, "Watch removed for user");
  } catch (error: any) {
    logger.error({ err: error, userId: interaction.user.id, uuid }, "Failed to remove watch");
    await interaction.editReply(`❌ Failed to remove watch: ${error?.message ?? "Unknown error"}`);
  }
}
