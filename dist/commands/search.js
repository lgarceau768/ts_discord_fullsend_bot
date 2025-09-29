import { SlashCommandBuilder, EmbedBuilder, } from "discord.js";
import { callTraktSearch } from "../integrations/n8n.js";
import { setForThread, setForChannel } from "../state/searchCache.js";
const digits = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
function truncate(text, max = 300) {
    if (!text)
        return "";
    return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
function itemToEmbed(item, index) {
    const n = `${digits[index] ?? index + 1} `;
    const title = [item.title, item.year ? `(${item.year})` : null].filter(Boolean).join(" ");
    const embed = new EmbedBuilder()
        .setTitle(n + title)
        .setDescription(truncate(item.overview))
        .setFooter({ text: item.type === "show" ? "TV Show • Trakt via n8n" : "Movie • Trakt via n8n" });
    const poster = item.posterUrl ?? item.poster_url;
    const backdrop = item.backdropUrl ?? item.backdrop_url;
    if (poster)
        embed.setThumbnail(poster);
    if (backdrop)
        embed.setImage(backdrop);
    const fields = [];
    if (item.genres?.length)
        fields.push({ name: "Genres", value: item.genres.slice(0, 5).join(", "), inline: true });
    if (item.rating != null)
        fields.push({ name: "Rating", value: `${item.rating}/10`, inline: true });
    if (item.runtime != null)
        fields.push({ name: "Runtime", value: `${item.runtime}m`, inline: true });
    if (item.network)
        fields.push({ name: "Network", value: item.network, inline: true });
    if (fields.length)
        embed.addFields(fields);
    return embed;
}
export default {
    // @ts-ignore
    data: new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search Trakt (via n8n) for a movie, TV show, or both, and open a thread")
        .addStringOption((opt) => opt.setName("query").setDescription("Title to search for").setRequired(true))
        .addStringOption((opt) => opt
        .setName("type")
        .setDescription("What to search")
        .addChoices({ name: "Movies", value: "movie" }, { name: "TV Shows", value: "show" }, { name: "Both", value: "both" })
        .setRequired(true)),
    execute: async function (interaction) {
        const query = interaction.options.getString("query", true);
        const type = interaction.options.getString("type") ?? "both";
        await interaction.deferReply(); // ACK immediately
        try {
            const response = (await callTraktSearch(query, type));
            const querySpellCheck = response.query;
            const queryDiff = response.query.toLowerCase() === querySpellCheck.toLowerCase();
            let message = "";
            if (queryDiff) {
                message = `You typed: **${query}**, we think you meant **${querySpellCheck}**. `;
            }
            message += `Opened a thread for results on **${query}**. Use \`/request index:<1-${response.results.length}>\` inside that thread.`;
            if (!response.results?.length) {
                await interaction.editReply(`No results for \`${query}\`.`);
                return;
            }
            // Post a small parent message and create a thread from it
            const parentMsg = await interaction.editReply({
                content: message
            });
            const thread = await parentMsg.startThread({
                name: `trakt: ${query}`.slice(0, 100),
                autoArchiveDuration: 1440, // 24h; adjust to your server settings
                reason: "Trakt search follow-up",
            });
            // Compose embeds and a header with numbered summary
            const embeds = response.results.map((it, i) => itemToEmbed(it, i));
            const numbered = response.results
                .map((it, i) => {
                const n = digits[i] ?? String(i + 1);
                const yr = it.year ? ` (${it.year})` : "";
                return `${n} **${it.title}**${yr}${it.ids?.tmdb ? ` — TMDB:${it.ids.tmdb}` : ""}`;
            })
                .join("\n");
            await thread.send({
                content: `Here are the top results for **${query}**:\n` +
                    numbered +
                    `\n\nTo request one, run \`/request index:<1-${response.results.length}>\` ` +
                    `(optional: \`seasons:all|first|latest|1,2,3\` for TV).`,
                embeds,
            });
            // Cache results for this thread (and channel as a loose fallback)
            const entry = {
                items: response.results,
                createdAt: Date.now(),
                query,
                authorId: interaction.user.id,
                parentMessageId: parentMsg.id,
            };
            setForThread(thread.id, entry);
            setForChannel(interaction.channelId, entry);
        }
        catch (err) {
            if ((err?.message).indexOf('fetch') != -1) {
                await interaction.editReply(`Failed to search due to a network issue`);
            }
            else {
                const reason = err?.message ?? "Unknown error";
                await interaction.editReply(`Failed to search: ${reason}`);
            }
        }
    },
};
