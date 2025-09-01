import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { SlashCommand } from "./_types.js";
import { callTraktSearch, type TraktType } from "../integrations/n8n.js";

type FlatItem = {
  type: "movie" | "show";
  title: string;
  year: number;
  ids: {
    trakt?: number;
    tmdb?: number;
    imdb?: string;
    slug?: string;
    tvdb?: number;
    tvrage?: number | null;
  };
  overview: string;

  // New camelCase fields from your n8n job
  posterUrl?: string;
  backdropUrl?: string;

  genres?: string[];
  rating?: number;
  runtime?: number; // minutes
  network?: string; // for shows
};

// ------- normalization helpers (accept raw Trakt or already-flat) -------

function safeParse<T = any>(v: unknown): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as T;
    }
  }
  return v as T;
}

function pickPoster(raw: any, obj: any): string | undefined {
  return (
      raw?.posterUrl ??
      raw?.poster_url ??
      obj?.posterUrl ??
      obj?.poster_url ??
      obj?.images?.poster?.url ??
      undefined
  );
}

function pickBackdrop(raw: any, obj: any): string | undefined {
  return (
      raw?.backdropUrl ??
      raw?.backdrop_url ??
      obj?.backdropUrl ??
      obj?.backdrop_url ??
      obj?.images?.backdrop?.url ??
      undefined
  );
}

function normalizeResult(rawIn: any): FlatItem | null {
  const raw = safeParse<any>(rawIn);

  // Already flat?
  if (raw && raw.title && raw.type && !raw.show && !raw.movie) {
    const ids = raw.ids ?? {};
    return {
      type: raw.type === "show" ? "show" : "movie",
      title: raw.title,
      year: raw.year,
      ids,
      overview: raw.overview,
      posterUrl: pickPoster(raw, raw),
      backdropUrl: pickBackdrop(raw, raw),
      genres: raw.genres ?? [],
      rating: raw.rating,
      runtime: raw.runtime,
      network: raw.network,
    };
  }

  // Trakt native search shape: { type, score, show|movie: {...} }
  const kind: "movie" | "show" =
      raw?.type === "show" || raw?.show ? "show" : "movie";
  const obj = raw?.show ?? raw?.movie ?? raw ?? {};

  const firstAiredYear = obj.first_aired
      ? Number(new Date(obj.first_aired).getFullYear())
      : undefined;

  const title = obj?.title ?? obj?.name ?? "Unknown";
  const ids = obj?.ids ?? raw?.ids ?? {};

  const poster = pickPoster(raw, obj);
  const backdrop = pickBackdrop(raw, obj);

  return {
    type: kind,
    title,
    year: obj?.year ?? firstAiredYear,
    ids,
    overview: obj?.overview ?? raw?.overview,
    posterUrl: poster,
    backdropUrl: backdrop,
    genres: obj?.genres ?? [],
    rating: obj?.rating,
    runtime: obj?.runtime,
    network: obj?.network,
  };
}

// ------- UI helpers -------

function truncate(text: string | undefined, max = 300) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function buildExternalLinks(item: FlatItem) {
  const type = item.type === "show" ? "show" : "movie";
  const ids = item.ids || {};
  const trakt =
      ids.slug
          ? `https://trakt.tv/${type}s/${ids.slug}`
          : ids.trakt
              ? `https://trakt.tv/search?query=${encodeURIComponent(item.title ?? "")}`
              : null;
  const imdb = ids.imdb ? `https://www.imdb.com/title/${ids.imdb}/` : null;
  const tmdb = ids.tmdb
      ? `https://www.themoviedb.org/${type === "show" ? "tv" : "movie"}/${ids.tmdb}`
      : null;
  return { trakt, imdb, tmdb };
}

const digits = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function itemToEmbed(item: FlatItem, index?: number): EmbedBuilder {
  const n = index != null ? `${digits[index] ?? index + 1} ` : "";
  const overview = item.overview?.length > 0 ? item.overview : "Unknown";
  const title = [item.title, item.year ? `(${item.year})` : null]
      .filter(Boolean)
      .join(" ");
  const embed = new EmbedBuilder()
      .setTitle(n + title)
      .setDescription(truncate(overview))
      .setFooter({
        text: item.type === "show" ? "TV Show • Trakt via n8n" : "Movie • Trakt via n8n",
      });

  // Show poster as thumbnail, backdrop as large image if provided
  const poster = item.posterUrl ?? false;
  const backdrop = item.backdropUrl ?? false;
  if (poster) embed.setThumbnail(poster);
  if (backdrop) embed.setImage(backdrop);

  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (item.genres?.length) {
    fields.push({
      name: "Genres",
      value: item.genres.slice(0, 5).join(", "),
      inline: true,
    });
  }
  if (item.rating != null) fields.push({ name: "Rating", value: `${item.rating}/10`, inline: true });
  if (item.runtime != null) fields.push({ name: "Runtime", value: `${item.runtime}m`, inline: true });
  if (item.network) fields.push({ name: "Network", value: item.network, inline: true });

  if (fields.length) embed.addFields(fields as any);

  return embed;
}

function itemLinkButtons(item: FlatItem) {
  const { trakt, imdb, tmdb } = buildExternalLinks(item);
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (trakt) row.addComponents(new ButtonBuilder().setLabel("Trakt").setStyle(ButtonStyle.Link).setURL(trakt));
  if (imdb) row.addComponents(new ButtonBuilder().setLabel("IMDb").setStyle(ButtonStyle.Link).setURL(imdb));
  if (tmdb) row.addComponents(new ButtonBuilder().setLabel("TMDB").setStyle(ButtonStyle.Link).setURL(tmdb));
  return row.components.length ? [row] : [];
}

function requestButtons(results: FlatItem[]) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  results.slice(0, 5).forEach((item, idx) => {
    const tmdb = item.ids?.tmdb;
    if (!tmdb) return; // can't request without TMDB id
    const mediaType = item.type === "show" ? "tv" : "movie";
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`req:${mediaType}:${tmdb}:${idx}`)
            .setStyle(ButtonStyle.Primary)
            .setLabel(`Request ${digits[idx] ?? String(idx + 1)}`)
    );
  });
  return row.components.length ? [row] : [];
}

// ------- command -------

const command: SlashCommand = {
  data: new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search Trakt (via n8n) for a movie, TV show, or both")
      .addStringOption((opt) =>
          opt.setName("query").setDescription("Title to search for").setRequired(true),
      )
      .addStringOption((opt) =>
          opt
              .setName("type")
              .setDescription("What to search")
              .addChoices(
                  { name: "Movies", value: "movie" },
                  { name: "TV Shows", value: "show" },
                  { name: "Person", value: "person" },
                  { name: "List", value: "list" },
                  { name: "Episode", value: "episode" },
                  { name: "All", value: "all" },
              ),
      ),
  async execute(interaction) {
    const query = interaction.options.getString("query", true);
    const type = (interaction.options.getString("type") as TraktType | null) ?? "both";

    await interaction.deferReply();

    try {
      // Normalize whatever comes back (raw Trakt or already flat)
      const rawResults: any[] = await callTraktSearch(query, type as TraktType);
      const results: FlatItem[] = (rawResults ?? [])
          .map(normalizeResult)
          .filter((x): x is FlatItem => Boolean(x))
          .slice(0, 5);

      if (!results.length) {
        await interaction.editReply(`No results for \`${query}\`.`);
        return;
      }

      const embeds = results.map((it, i) => itemToEmbed(it, i));
      const linkRowForFirst = itemLinkButtons(results[0]);
      const reqRows = requestButtons(results);
      const components = [...linkRowForFirst, ...reqRows];

      await interaction.editReply({
        content: `Top results for **${query}**:`,
        embeds,
        components,
      });
    } catch (err: any) {
      console.error(err);
      const reason = err?.message ?? "Unknown error";
      await interaction.editReply(`Failed to search: ${reason}`);
    }
  },
};

export default command;