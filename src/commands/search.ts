import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { SlashCommand } from "./_types.js";
import { callTraktSearch, type TraktType } from "../integrations/n8n.js";

function buildLinks(item: any): string {
  const type = item.type === "show" ? "show" : "movie";
  const title = item.title ?? "Unknown";
  const year = item.year ? ` (${item.year})` : "";
  const ids = item.ids || {};
  const parts: string[] = [];

  // Trakt link (best-effort)
  if (ids.slug) {
    parts.push(`[Trakt](https://trakt.tv/${type}s/${ids.slug})`);
  } else if (ids.trakt) {
    parts.push(`[Trakt](https://trakt.tv/search?query=${encodeURIComponent(title)})`);
  }

  // IMDb link
  if (ids.imdb) {
    parts.push(`[IMDb](https://www.imdb.com/title/${ids.imdb}/)`);
  }

  // TMDB link
  if (ids.tmdb) {
    const path = type === "show" ? "tv" : "movie";
    parts.push(`[TMDB](https://www.themoviedb.org/${path}/${ids.tmdb})`);
  }

  const links = parts.length ? " — " + parts.join(" | ") : "";
  return `• **${title}**${year}${links}`;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search Trakt (via n8n) for a movie, TV show, or both")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Title to search for")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("What to search")
        .addChoices(
          { name: "Movies", value: "movie" },
          { name: "TV Shows", value: "show" },
          { name: "Both", value: "both" }
        )
    ),
  async execute(interaction) {
    const query = interaction.options.getString("query", true);
    const type = (interaction.options.getString("type") as TraktType | null) ?? "both";

    await interaction.deferReply();

    try {
      const results = await callTraktSearch(query, type);
      if (!results.length) {
        await interaction.editReply(`No results for \`${query}\`.`);
        return;
      }

      const lines = results.slice(0, 5).map(buildLinks).join("\n");
      const embed = new EmbedBuilder()
        .setTitle(`Results for: ${query}`)
        .setDescription(lines)
        .setFooter({ text: "Source: Trakt via n8n" });

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      console.error(err);
      const reason = err?.message ?? "Unknown error";
      await interaction.editReply(`Failed to search: ${reason}`);
    }
  },
};

export default command;
