import { SlashCommandBuilder, ChannelType, EmbedBuilder, } from "discord.js";
const PLANT_API = process.env.N8N_PLANT_API_URL;
const N8N_KEY = process.env.N8N_API_KEY || "";
/** Post JSON to n8n plant API. You route actions inside n8n. */
async function plantApi(action, payload) {
    if (!PLANT_API)
        return { ok: false, error: "N8N_PLANT_API_URL is not configured" };
    const headers = { "Content-Type": "application/json" };
    if (N8N_KEY)
        headers["Authorization"] = `Bearer ${N8N_KEY}`;
    const res = await fetch(PLANT_API, {
        method: "POST",
        headers,
        body: JSON.stringify({ action, ...payload }),
    });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        return res.ok ? { ok: true, data: text } : { ok: false, error: text || res.statusText };
    }
    if (!res.ok)
        return { ok: false, error: json?.error || res.statusText };
    if (json?.ok === false)
        return { ok: false, error: json?.error || "Upstream error" };
    return { ok: true, data: json?.data ?? json };
}
function toDate(inStr) {
    if (!inStr)
        return '';
    let iso = inStr.replaceAll('"', '').trim();
    const [datePart, timePartRaw] = iso.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    // strip trailing Z
    const timePart = timePartRaw.replace("Z", "");
    const [time, millis] = timePart.split(".");
    const [hour, minute, second] = time.split(":").map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millis ? Number(millis) : 0)).toLocaleDateString();
}
function truncate(t, n = 300) {
    if (!t)
        return "";
    return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}
function plantEmbed(p) {
    const e = new EmbedBuilder()
        .setTitle(`${p.name}${p.species ? ` — ${p.species}` : ""}`)
        .setDescription(truncate(p.notes))
        .addFields({ name: "Location", value: p.location || "—", inline: true }, { name: "Light", value: p.light || "—", inline: true }, { name: "State", value: p.state || "ok", inline: true }, { name: "Water interval", value: p.water_interval_days ? `${p.water_interval_days}d` : "—", inline: true }, { name: "Last watered", value: toDate(p.last_watered_at), inline: true }, { name: "Next due", value: toDate(p.next_water_due_at), inline: true })
        .setFooter({ text: `ID ${p.id}` });
    if (p.photoUrl)
        e.setThumbnail(p.photoUrl);
    if (p.image_url)
        e.setThumbnail(p.image_url);
    if (p.notes)
        e.addFields({ name: "Notes", value: p.notes || '', inline: false });
    return e;
}
/** Upload an image by telling n8n to fetch the Discord attachment URL (or a direct URL) */
async function uploadPhotoViaN8n(opts) {
    let imageUrl = opts.image_url?.trim();
    if (!imageUrl && opts.attachment) {
        imageUrl = opts.attachment.url; // Discord CDN URL
    }
    if (!imageUrl)
        return { ok: false, error: "No image supplied" };
    return plantApi("photo.add", {
        plantId: opts.plantId,
        userId: opts.userId,
        imageUrl,
        caption: opts.caption ?? undefined,
    });
}
/** ============ Slash command ============ */
const command = {
    // @ts-ignore
    data: new SlashCommandBuilder()
        .setName("plant")
        .setDescription("Manage your indoor plants (CRUD, photos, water logs, reminders)")
        // group: basic CRUD
        .addSubcommand(sc => sc.setName("add").setDescription("Add a new plant")
        .addStringOption(o => o.setName("name").setDescription("Given name").setRequired(true))
        .addStringOption(o => o.setName("species").setDescription("Species / cultivar"))
        .addStringOption(o => o.setName("location").setDescription("Where it lives (room, shelf, etc.)"))
        .addStringOption(o => o.setName("light")
        .setDescription("Light level")
        .addChoices({ name: "Low", value: "low" }, { name: "Medium", value: "medium" }, { name: "Bright (indirect)", value: "bright" }, { name: "Direct sun", value: "direct" }))
        .addIntegerOption(o => o.setName("water_interval_days")
        .setDescription("Watering cadence in days (e.g., 7)")
        .setMinValue(1))
        .addStringOption(o => o.setName("notes").setDescription("Care notes"))
        .addAttachmentOption(o => o.setName("photo").setDescription("Initial photo")))
        .addSubcommand(sc => sc.setName("care")
        .setDescription("Ask a care question about a plant and get a tailored plan")
        .addIntegerOption(o => o.setName("id")
        .setDescription("Plant ID")
        .setRequired(true))
        .addStringOption(o => o.setName("question")
        .setDescription("Your question about this plant (e.g., repot? watering? light?)")
        .setRequired(true)
        .setMaxLength(4000)))
        .addSubcommand(sc => sc.setName("get").setDescription("Show one plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true)))
        .addSubcommand(sc => sc.setName("list").setDescription("List plants")
        .addStringOption(o => o.setName("location").setDescription("Filter by location"))
        .addStringOption(o => o.setName("species").setDescription("Filter by species")))
        .addSubcommand(sc => sc.setName("update").setDescription("Update fields on a plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addStringOption(o => o.setName("name").setDescription("New name"))
        .addStringOption(o => o.setName("species").setDescription("New species"))
        .addStringOption(o => o.setName("location").setDescription("New location"))
        .addStringOption(o => o.setName("light")
        .setDescription("Light level")
        .addChoices({ name: "Low", value: "low" }, { name: "Medium", value: "medium" }, { name: "Bright (indirect)", value: "bright" }, { name: "Direct sun", value: "direct" }))
        .addIntegerOption(o => o.setName("water_interval_days")
        .setDescription("New watering cadence (days)")
        .setMinValue(1))
        .addStringOption(o => o.setName("notes").setDescription("Replace notes")))
        .addSubcommand(sc => sc.setName("delete").setDescription("Delete a plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true)))
        // group: care actions
        .addSubcommand(sc => sc.setName("water").setDescription("Mark plant as watered (updates next due date)")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addNumberOption(o => o.setName("amount_l").setDescription("Water amount (liters)"))
        .addStringOption(o => o.setName("note").setDescription("Watering note")))
        .addSubcommand(sc => sc.setName("photo").setDescription("Attach a new photo to a plant (stored via n8n)")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addAttachmentOption(o => o.setName("image").setDescription("Upload photo"))
        .addStringOption(o => o.setName("image_url").setDescription("Or link a photo URL"))
        .addStringOption(o => o.setName("caption").setDescription("Caption/notes for this photo")))
        .addSubcommand(sc => sc.setName("reminder").setDescription("Configure watering reminders for a plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addBooleanOption(o => o.setName("enabled").setDescription("Turn reminders on/off"))
        .addIntegerOption(o => o.setName("water_interval_days").setDescription("Override watering cadence (days)").setMinValue(1))
        .addStringOption(o => o.setName("time").setDescription("Local time like 09:00 or 18:30"))
        .addChannelOption(o => o.setName("channel")
        .setDescription("Channel to post reminders to")
        .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread))),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand(true);
        await interaction.deferReply(); // ACK quickly, then work
        try {
            // Current user & channel/thread context
            const userId = interaction.user.id;
            const guildId = interaction.guildId ?? "DM";
            const channelId = interaction.channelId;
            switch (sub) {
                /** -------- /plant add -------- */
                case "add": {
                    const name = interaction.options.getString("name", true);
                    const species = interaction.options.getString("species") ?? undefined;
                    const location = interaction.options.getString("location") ?? undefined;
                    const light = interaction.options.getString("light");
                    const waterIntervalDays = interaction.options.getInteger("water_interval_days") ?? undefined;
                    const notes = interaction.options.getString("notes") ?? undefined;
                    const photo = interaction.options.getAttachment("photo");
                    // 1) create plant record
                    const create = await plantApi("create", {
                        userId, guildId, channelId, name, species, location, light, waterIntervalDays, notes,
                    });
                    if (!create.ok)
                        throw new Error(create.error);
                    let plant = create.data;
                    // 2) optional photo upload (via n8n fetching the attachment URL)
                    if (photo) {
                        const uploaded = await uploadPhotoViaN8n({
                            plantId: plant.id, userId, attachment: photo, image_url: null, caption: "Initial photo",
                        });
                        if (uploaded.ok) {
                            // persist photoUrl onto the plant
                            await plantApi("update", { id: plant.id, userId, photoUrl: uploaded.data.imageUrl });
                            plant.photoUrl = uploaded.data.imageUrl;
                        }
                    }
                    await interaction.editReply({
                        content: `🌱 Added **${plant.name}** (ID ${plant.id}).`,
                        embeds: [plantEmbed(plant)]
                    });
                    return;
                }
                /** -------- /plant get -------- */
                case "get": {
                    const id = interaction.options.getInteger("id", true);
                    const resp = await plantApi("get", { id, userId });
                    if (!resp.ok)
                        throw new Error(resp.error);
                    await interaction.editReply({ embeds: [plantEmbed(resp.data)] });
                    return;
                }
                /** -------- /plant list -------- */
                case "list": {
                    const species = interaction.options.getString("species") ?? undefined;
                    const location = interaction.options.getString("location") ?? undefined;
                    const resp = await plantApi("list", { userId, species, location });
                    if (!resp.ok)
                        throw new Error(resp.error);
                    const items = resp.data || [];
                    if (!items.length) {
                        await interaction.editReply("No plants found yet. Add one with `/plant add`.");
                        return;
                    }
                    // summary + first 10 embeds
                    const lines = items.slice(0, 10).map(p => `• **${p.name}** (ID ${p.id}) — ${p.species ?? "unknown"} — next due: ${toDate(p.next_water_due_at)}`);
                    await interaction.editReply({
                        content: `You have **${items.length}** plant${items.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
                        embeds: items.slice(0, 5).map(plantEmbed),
                    });
                    return;
                }
                /** -------- /plant update -------- */
                case "update": {
                    const id = interaction.options.getInteger("id", true);
                    const name = interaction.options.getString("name") ?? undefined;
                    const species = interaction.options.getString("species") ?? undefined;
                    const location = interaction.options.getString("location") ?? undefined;
                    const light = interaction.options.getString("light");
                    const waterIntervalDays = interaction.options.getInteger("water_interval_days") ?? undefined;
                    const notes = interaction.options.getString("notes") ?? undefined;
                    const resp = await plantApi("update", {
                        id, userId, name, species, location, light: light ?? undefined, waterIntervalDays, notes,
                    });
                    if (!resp.ok)
                        throw new Error(resp.error);
                    await interaction.editReply({
                        content: `✅ Updated **${resp.data.name}** (ID ${resp.data.id}).`,
                        embeds: [plantEmbed(resp.data)]
                    });
                    return;
                }
                /** -------- /plant delete -------- */
                case "delete": {
                    const id = interaction.options.getInteger("id", true);
                    const resp = await plantApi("delete", { id, userId });
                    if (!resp.ok)
                        throw new Error(resp.error);
                    await interaction.editReply(`🗑️ Deleted **${resp.data.name}** (ID ${resp.data.id}).`);
                    return;
                }
                /** -------- /plant water -------- */
                // TODO implement me
                case "water": {
                    const id = interaction.options.getInteger("id", true);
                    const amountL = interaction.options.getNumber("amount_l") ?? undefined;
                    const note = interaction.options.getString("note") ?? undefined;
                    const resp = await plantApi("water", { id, userId, amountL, note });
                    if (!resp.ok)
                        throw new Error(resp.error);
                    await interaction.editReply({
                        content: `💧 Marked watered: **${resp.data.name}**. Next due **${toDate(resp.data.next_water_due_at)}**.`,
                        embeds: [plantEmbed(resp.data)],
                    });
                    return;
                }
                case "care": {
                    const id = interaction.options.getInteger("id", true);
                    const question = interaction.options.getString("question", true);
                    const userId = interaction.user.id;
                    try {
                        // Call n8n with the exact body you specified
                        const resp = await plantApi("care", {
                            userId,
                            id,
                            question,
                            now: Date.now(),
                        });
                        if (!resp.ok)
                            throw new Error(resp.error);
                        const data = resp.data;
                        // Build a rich message
                        const name = data.name ?? `Plant ${id}`;
                        const thumb = data.image_url ?? data.imageUrl ?? undefined;
                        // Discord embed desc max is 4096 chars; trim just in case
                        const ANSWER_LIMIT = 4000;
                        const answer = (data.answer ?? "").slice(0, ANSWER_LIMIT);
                        const q = data.question ?? question;
                        const embed = new EmbedBuilder()
                            .setTitle(`🌿 Care plan — ${name} (ID ${id})`)
                            .setDescription([
                            `**Question**`,
                            q,
                            ``,
                            `**Answer**`,
                            answer,
                        ].join("\n"))
                            .setFooter({ text: data.location ? `Location: ${data.location}` : `Plant care` });
                        if (thumb)
                            embed.setThumbnail(thumb);
                        await interaction.editReply({ embeds: [embed] });
                    }
                    catch (e) {
                        await interaction.editReply(`❌ Care request failed: ${e?.message ?? "Unknown error"}`);
                    }
                    return;
                }
                /** -------- /plant photo -------- */
                case "photo": {
                    const id = interaction.options.getInteger("id", true);
                    const image = interaction.options.getAttachment("image");
                    const imageUrl = interaction.options.getString("image_url");
                    const caption = interaction.options.getString("caption");
                    if (!image && !imageUrl) {
                        await interaction.editReply("Please attach an image or provide `image_url`.");
                        return;
                    }
                    const uploaded = await uploadPhotoViaN8n({
                        plantId: id, userId, attachment: image, image_url: imageUrl, caption,
                    });
                    if (!uploaded.ok)
                        throw new Error(uploaded.error);
                    // Persist canonical photoUrl on the plant (optional)
                    await plantApi("update", { id, userId, photoUrl: uploaded.data.imageUrl });
                    await interaction.editReply(`📷 Photo added. Stored at: ${uploaded.data.imageUrl}`);
                    return;
                }
                /** -------- /plant reminder -------- */
                // TODO implement scanning for reminders each hour
                case "reminder": {
                    const id = interaction.options.getInteger("id", true);
                    const enabled = interaction.options.getBoolean("enabled");
                    const waterIntervalDays = interaction.options.getInteger("water_interval_days") ?? undefined;
                    const time = interaction.options.getString("time") ?? undefined;
                    const channel = interaction.options.getChannel("channel");
                    const resp = await plantApi("reminder.set", {
                        id,
                        userId,
                        enabled,
                        waterIntervalDays,
                        time, // e.g., "09:00" local
                        channelId: channel?.id ?? interaction.channelId,
                        guildId,
                    });
                    if (!resp.ok)
                        throw new Error(resp.error);
                    await interaction.editReply(`⏰ Reminders ${enabled === false ? "disabled" : "updated"} for **${resp.data.name}**. ` +
                        (waterIntervalDays ? `Cadence: every ${waterIntervalDays}d. ` : "") +
                        (time ? `Time: ${time}. ` : ""));
                    return;
                }
            }
        }
        catch (err) {
            const reason = err?.message ?? "Unknown error";
            await interaction.editReply(`❌ ${reason}`);
        }
    },
};
export default command;
