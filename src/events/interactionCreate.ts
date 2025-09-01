import {
  Client,
  Collection,
  ChatInputCommandInteraction,
  Events,
  Interaction,
  ButtonInteraction,
} from "discord.js";
import { requestMovie, requestTV, getTV } from "../integrations/jellyseerr.js";
import { env } from "../config.js";

type CommandMap = Collection<string, any>;

/**
 * Central handler for all Discord interactions. Routes slash commands to
 * their implementations and processes custom button interactions generated
 * by the search command to create Jellyseerr requests.
 */
export default (client: Client, commands: CommandMap) => {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) {
        await interaction.reply({ content: "Unknown command.", ephemeral: true });
        return;
      }
      try {
        await command.execute(interaction as ChatInputCommandInteraction);
      } catch (err) {
        console.error(err);
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(
            "There was an error while executing this command.",
          );
        } else {
          await interaction.reply({
            content: "There was an error while executing this command.",
            ephemeral: true,
          });
        }
      }
      return;
    }

    // Handle button interactions for Jellyseerr requests
    if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith("trakt-request:")) {
        await handleTraktRequestButton(interaction);
        return;
      }
    }
    // Other interactions (e.g. select menus) are not used in this implementation
  });
};

/**
 * Process a button click on a Trakt result. The button customId is
 * formatted as `trakt-request:<type>:<tmdbId>`. Depending on the type, this
 * function will either call `requestMovie` or `requestTV` using sensible
 * defaults. Errors are caught and returned to the user as an ephemereal
 * response.
 */
async function handleTraktRequestButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  // parts[0] = 'trakt-request'
  const type = parts[1];
  const tmdbIdString = parts[2];
  const tmdbId = parseInt(tmdbIdString, 10);
  if (!tmdbId || isNaN(tmdbId)) {
    await interaction.reply({
      content: "Unable to determine TMDb ID for this item.",
      ephemeral: true,
    });
    return;
  }
  try {
    if (type === "movie") {
      await requestMovie(tmdbId);
      await interaction.reply({
        content: `✅ Your request for the movie (TMDb ${tmdbId}) has been submitted!`,
        ephemeral: true,
      });
    } else if (type === "show") {
      // For TV shows, decide which seasons to request. Use default if defined.
      const info = await getTV(tmdbId);
      // Extract all available season numbers (skip specials numbered 0)
      const seasons: number[] = Array.isArray(info.seasons)
        ? info.seasons
            .map((s: any) => s.seasonNumber)
            .filter((n: number) => n > 0)
        : [];
      let toRequest: number[];
      switch (env.JELLYSEERR_SERIES_DEFAULT) {
        case "all":
          toRequest = seasons;
          break;
        case "latest":
          toRequest = seasons.length ? [Math.max(...seasons)] : [];
          break;
        case "first":
        default:
          toRequest = seasons.length ? [Math.min(...seasons)] : [];
          break;
      }
      if (toRequest.length === 0) {
        throw new Error("No seasons found for this TV show.");
      }
      await requestTV(tmdbId, toRequest);
      await interaction.reply({
        content: `✅ Your request for the TV show (TMDb ${tmdbId}) has been submitted for season(s) ${toRequest.join(", ")}.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `Unsupported media type: ${type}`,
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error(err);
    await interaction.reply({
      content: `Failed to create request: ${err instanceof Error ? err.message : "unknown error"}`,
      ephemeral: true,
    });
  }
}