import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import type { SlashCommand } from "./_types.js";
import { searchTrakt } from "../integrations/n8n.js";

/**
 * `/search` command for querying the user's n8n-powered Trakt workflow. Users
 * supply a title and a media type (movie, show or both). Up to 5 results
 * are returned as richly formatted embeds, each with a corresponding
 * "Request" button which triggers a Jellyseerr request for that item.
 */
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for a movie or TV show using Trakt via n8n")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Title to search for")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Type of media to search")
        .setRequired(true)
        .addChoices(
          { name: "Movie", value: "movie" },
          { name: "Show", value: "show" },
          { name: "Both", value: "both" },
        ),
    ),
  async execute(interaction) {
    const query = interaction.options.getString("query", true);
    const type = interaction.options.getString("type", true) as
      | "movie"
      | "show"
      | "both";

    await interaction.deferReply();
    try {
      const results = await searchTrakt(query, type);
      if (!results || results.length === 0) {
        await interaction.editReply("No results found.");
        return;
      }
      // Prepare up to 5 embeds
      const embeds: EmbedBuilder[] = [];
      const buttons: ButtonBuilder[] = [];
      results.slice(0, 5).forEach((item, index) => {
        const embed = new EmbedBuilder()
          .setTitle(
            `${index + 1}. ${item.title}${item.year ? ` (${item.year})` : ''}`,
          )
          .setDescription(item.overview ?? "No overview available.")
          .setColor(0x00adef)
          .addFields(
            { name: "Type", value: item.type, inline: true },
            ...(item.genres && item.genres.length
              ? [{ name: "Genres", value: item.genres.join(", "), inline: true }]
              : []),
            ...(item.rating
              ? [
                  {
                    name: "Rating",
                    value: item.rating.toFixed(1),
                    inline: true,
                  },
                ]
              : []),
            ...(item.runtime
              ? [
                  {
                    name: "Runtime",
                    value: `${item.runtime} min`,
                    inline: true,
                  },
                ]
              : []),
          );
        if (item.poster_url) {
          embed.setThumbnail(item.poster_url);
        }
        embeds.push(embed);
        // encode tmdb ID and type into customId. Use '0' for missing tmdb.
        const tmdbId = item.ids?.tmdb ?? 0;
        const customId = `trakt-request:${item.type}:${tmdbId}`;
        const button = new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(`Request ${index + 1}`)
          .setStyle(ButtonStyle.Primary);
        buttons.push(button);
      });
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
      await interaction.editReply({ embeds, components: [actionRow] });
    } catch (err) {
      console.error(err);
      await interaction.editReply(`There was an error performing the search: ${{
        ...(err as Error).message,
      }}`);
    }
  },
};

export default command;