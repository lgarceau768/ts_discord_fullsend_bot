import {
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../../logger.js";
import type { WatchBase } from "../../types/watch.js";
import { buildLatestEmbed, extractPriceSnapshot } from "./display.js";
import { inferTitleFromUrl } from "../../utils/urlTitle.js";

export const LATEST_SUBCOMMAND_NAME = "latest";

export function configureLatestSubcommand(subcommand: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return subcommand
    .setName(LATEST_SUBCOMMAND_NAME)
    .setDescription("Show the latest price/stock data for one of your watches")
    .addStringOption((option) =>
      option
        .setName("uuid")
        .setDescription("Watch UUID (from /watch list)")
        .setRequired(true),
    );
}

export async function handleLatestSubcommand(base: WatchBase, interaction: ChatInputCommandInteraction): Promise<void> {
  const uuid = interaction.options.getString("uuid", true).trim();
  await interaction.deferReply({ ephemeral: true });

  logger.debug({ userId: interaction.user.id, uuid }, "Processing /watch latest");

  try {
    const record = await base.dbGetWatch(interaction.user.id, uuid);
    if (!record) {
      await interaction.editReply("❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.");
      logger.warn({ userId: interaction.user.id, uuid }, "/watch latest denied: not found or unauthorized");
      return;
    }

    let details;
    let history = [] as Awaited<ReturnType<typeof base.cdGetWatchHistory>>;
    let errorMessage: string | undefined;
    let pageTitle: string | undefined;

    try {
      details = await base.cdGetWatchDetails(uuid);
      if (details?.title && typeof details.title === "string" && details.title.trim()) {
        pageTitle = details.title.trim();
      }
    } catch (error: any) {
      const msg = error?.message ?? "Failed to fetch watch details.";
      errorMessage = String(msg).slice(0, 200);
      logger.error({ err: error, uuid }, "Failed to fetch watch details for latest");
    }

    try {
      history = await base.cdGetWatchHistory(uuid);
    } catch (error: any) {
      logger.warn({ err: error, uuid }, "Failed to fetch watch history; continuing without history");
      if (!errorMessage) {
        const msg = error?.message ?? "Failed to fetch watch history.";
        errorMessage = String(msg).slice(0, 200);
      }
    }

    const priceSnapshot = extractPriceSnapshot(details, history);
    if (!priceSnapshot) {
      logger.info({ uuid }, "No price/stock data found for latest");
    }

    if (!pageTitle) {
      pageTitle = inferTitleFromUrl(record.url);
    }

    const embed = buildLatestEmbed(base, {
      uuid,
      watchUrl: record.url,
      tags: record.tags ?? [],
      details,
      priceSnapshot,
      pageTitle,
      errorMessage,
    });

    await interaction.editReply({
      content: priceSnapshot
        ? `📈 Latest price/stock data for \`${uuid}\`:`
        : `ℹ️ No price/stock data available yet for \`${uuid}\`.`,
      embeds: [embed],
    });
  } catch (error: any) {
    logger.error({ err: error, userId: interaction.user.id, uuid }, "Failed to process /watch latest");
    await interaction.editReply(`❌ Failed to fetch latest data: ${error?.message ?? "Unknown error"}`);
  }
}
