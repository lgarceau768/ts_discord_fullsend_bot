import {
  SlashCommandBuilder,
  ChannelType,
  Attachment,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import type { SlashCommand } from "./_types.js";

/** ============ Types & helpers ============ */

type LightLevel = "low" | "medium" | "bright" | "direct";
type PlantState = "ok" | "thirsty" | "overwatered" | "repot-soon" | "pest-risk";

export type PlantRecord = {
  id: number;
  userId: string;
  name: string;
  species?: string;
  location?: string;
  light?: LightLevel;
  notes?: string;
  photoUrl?: string;
  waterIntervalDays?: number;
  lastWateredAt?: string;   // ISO
  nextWaterDueAt?: string;  // ISO (server-computed)
  state?: PlantState;
  createdAt?: string;
  updatedAt?: string;
};

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };
type ApiResp<T = any> = ApiOk<T> | ApiErr;

const PLANT_API = process.env.N8N_PLANT_API_URL;
const N8N_KEY = process.env.N8N_API_KEY || "";

/** Post JSON to n8n plant API. You route actions inside n8n. */
async function plantApi<T = any>(action: string, payload: Record<string, any>): Promise<ApiResp<T>> {
  if (!PLANT_API) return { ok: false, error: "N8N_PLANT_API_URL is not configured" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (N8N_KEY) headers["Authorization"] = `Bearer ${N8N_KEY}`;

  const res = await fetch(PLANT_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...payload }),
  });

  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    return res.ok ? ({ ok: true, data: text } as any) : { ok: false, error: text || res.statusText };
  }
  if (!res.ok) return { ok: false, error: json?.error || res.statusText };
  if (json?.ok === false) return { ok: false, error: json?.error || "Upstream error" };
  return { ok: true, data: json?.data ?? json } as ApiOk<T>;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

function truncate(t?: string, n = 300) {
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

function plantEmbed(p: PlantRecord): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle(`${p.name}${p.species ? ` — ${p.species}` : ""}`)
    .setDescription(truncate(p.notes))
    .addFields(
      { name: "Location", value: p.location || "—", inline: true },
      { name: "Light", value: p.light || "—", inline: true },
      { name: "State", value: p.state || "ok", inline: true },
      { name: "Water interval", value: p.waterIntervalDays ? `${p.waterIntervalDays}d` : "—", inline: true },
      { name: "Last watered", value: fmtDate(p.lastWateredAt), inline: true },
      { name: "Next due", value: fmtDate(p.nextWaterDueAt), inline: true },
    )
    .setFooter({ text: `ID ${p.id}` });
  if (p.photoUrl) e.setThumbnail(p.photoUrl);
  return e;
}

/** Upload an image by telling n8n to fetch the Discord attachment URL (or a direct URL) */
async function uploadPhotoViaN8n(opts: {
  plantId: number;
  userId: string;
  attachment?: Attachment | null;
  imageUrl?: string | null;
  caption?: string | null;
}): Promise<ApiResp<{ photoUrl: string }>> {
  let imageUrl = opts.imageUrl?.trim();
  if (!imageUrl && opts.attachment) {
    imageUrl = opts.attachment.url; // Discord CDN URL
  }
  if (!imageUrl) return { ok: false, error: "No image supplied" };

  return plantApi("photo.add", {
    plantId: opts.plantId,
    userId: opts.userId,
    imageUrl,
    caption: opts.caption ?? undefined,
  });
}

/** ============ Slash command ============ */

const command: SlashCommand = {
// @ts-ignore
  data: new SlashCommandBuilder()
    .setName("plant")
    .setDescription("Manage your indoor plants (CRUD, photos, water logs, reminders)")
    // group: basic CRUD
    .addSubcommand(sc =>
      sc.setName("add").setDescription("Add a new plant")
        .addStringOption(o => o.setName("name").setDescription("Given name").setRequired(true))
        .addStringOption(o => o.setName("species").setDescription("Species / cultivar"))
        .addStringOption(o => o.setName("location").setDescription("Where it lives (room, shelf, etc.)"))
        .addStringOption(o =>
          o.setName("light")
           .setDescription("Light level")
           .addChoices(
             { name: "Low", value: "low" },
             { name: "Medium", value: "medium" },
             { name: "Bright (indirect)", value: "bright" },
             { name: "Direct sun", value: "direct" },
           ),
        )
        .addIntegerOption(o =>
          o.setName("water_interval_days")
           .setDescription("Watering cadence in days (e.g., 7)")
           .setMinValue(1),
        )
        .addStringOption(o => o.setName("notes").setDescription("Care notes"))
        .addAttachmentOption(o => o.setName("photo").setDescription("Initial photo")),
    )
    .addSubcommand(sc =>
      sc.setName("get").setDescription("Show one plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true)),
    )
    .addSubcommand(sc =>
      sc.setName("list").setDescription("List plants")
        .addStringOption(o => o.setName("location").setDescription("Filter by location"))
        .addStringOption(o => o.setName("species").setDescription("Filter by species")),
    )
    .addSubcommand(sc =>
      sc.setName("update").setDescription("Update fields on a plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addStringOption(o => o.setName("name").setDescription("New name"))
        .addStringOption(o => o.setName("species").setDescription("New species"))
        .addStringOption(o => o.setName("location").setDescription("New location"))
        .addStringOption(o =>
          o.setName("light")
           .setDescription("Light level")
           .addChoices(
             { name: "Low", value: "low" },
             { name: "Medium", value: "medium" },
             { name: "Bright (indirect)", value: "bright" },
             { name: "Direct sun", value: "direct" },
           ),
        )
        .addIntegerOption(o =>
          o.setName("water_interval_days")
           .setDescription("New watering cadence (days)")
           .setMinValue(1),
        )
        .addStringOption(o => o.setName("notes").setDescription("Replace notes")),
    )
    .addSubcommand(sc =>
      sc.setName("delete").setDescription("Delete a plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true)),
    )
    // group: care actions
    .addSubcommand(sc =>
      sc.setName("water").setDescription("Mark plant as watered (updates next due date)")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addNumberOption(o => o.setName("amount_l").setDescription("Water amount (liters)"))
        .addStringOption(o => o.setName("note").setDescription("Watering note")),
    )
    .addSubcommand(sc =>
      sc.setName("photo").setDescription("Attach a new photo to a plant (stored via n8n)")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addAttachmentOption(o => o.setName("image").setDescription("Upload photo"))
        .addStringOption(o => o.setName("image_url").setDescription("Or link a photo URL"))
        .addStringOption(o => o.setName("caption").setDescription("Caption/notes for this photo")),
    )
    .addSubcommand(sc =>
      sc.setName("reminder").setDescription("Configure watering reminders for a plant")
        .addIntegerOption(o => o.setName("id").setDescription("Plant ID").setRequired(true))
        .addBooleanOption(o => o.setName("enabled").setDescription("Turn reminders on/off"))
        .addIntegerOption(o => o.setName("water_interval_days").setDescription("Override watering cadence (days)").setMinValue(1))
        .addStringOption(o => o.setName("time").setDescription("Local time like 09:00 or 18:30"))
        .addChannelOption(o =>
          o.setName("channel")
           .setDescription("Channel to post reminders to")
           .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread),
        ),
    ),

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
          const light = interaction.options.getString("light") as LightLevel | null;
          const waterIntervalDays = interaction.options.getInteger("water_interval_days") ?? undefined;
          const notes = interaction.options.getString("notes") ?? undefined;
          const photo = interaction.options.getAttachment("photo");

          // 1) create plant record
          const create = await plantApi<PlantRecord>("create", {
            userId, guildId, channelId, name, species, location, light, waterIntervalDays, notes,
          });
          if (!create.ok) throw new Error(create.error);
          let plant = create.data;

          // 2) optional photo upload (via n8n fetching the attachment URL)
          if (photo) {
            const uploaded = await uploadPhotoViaN8n({
              plantId: plant.id, userId, attachment: photo, imageUrl: null, caption: "Initial photo",
            });
            if (uploaded.ok) {
              // persist photoUrl onto the plant
              await plantApi("update", { id: plant.id, userId, photoUrl: uploaded.data.photoUrl });
              plant.photoUrl = uploaded.data.photoUrl;
            }
          }

          await interaction.editReply({ content: `🌱 Added **${plant.name}** (ID ${plant.id}).`, embeds: [plantEmbed(plant)] });
          return;
        }

        /** -------- /plant get -------- */
        case "get": {
          const id = interaction.options.getInteger("id", true);
          const resp = await plantApi<PlantRecord>("get", { id, userId });
          if (!resp.ok) throw new Error(resp.error);
          await interaction.editReply({ embeds: [plantEmbed(resp.data)] });
          return;
        }

        /** -------- /plant list -------- */
        case "list": {
          const species = interaction.options.getString("species") ?? undefined;
          const location = interaction.options.getString("location") ?? undefined;
          const resp = await plantApi<PlantRecord[]>("list", { userId, species, location });
          if (!resp.ok) throw new Error(resp.error);
          const items = resp.data || [];
          if (!items.length) {
            await interaction.editReply("No plants found yet. Add one with `/plant add`.");
            return;
          }
          // summary + first 10 embeds
          const lines = items.slice(0, 10).map(p =>
            `• **${p.name}** (ID ${p.id}) — ${p.species ?? "unknown"} — next due: ${fmtDate(p.nextWaterDueAt)}`
          );
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
          const light = interaction.options.getString("light") as LightLevel | null;
          const waterIntervalDays = interaction.options.getInteger("water_interval_days") ?? undefined;
          const notes = interaction.options.getString("notes") ?? undefined;

          const resp = await plantApi<PlantRecord>("update", {
            id, userId, name, species, location, light: light ?? undefined, waterIntervalDays, notes,
          });
          if (!resp.ok) throw new Error(resp.error);
          await interaction.editReply({ content: `✅ Updated **${resp.data.name}** (ID ${resp.data.id}).`, embeds: [plantEmbed(resp.data)] });
          return;
        }

        /** -------- /plant delete -------- */
        case "delete": {
          const id = interaction.options.getInteger("id", true);
          const resp = await plantApi<PlantRecord>("delete", { id, userId });
          if (!resp.ok) throw new Error(resp.error);
          await interaction.editReply(`🗑️ Deleted **${resp.data.name}** (ID ${resp.data.id}).`);
          return;
        }

        /** -------- /plant water -------- */
        case "water": {
          const id = interaction.options.getInteger("id", true);
          const amountL = interaction.options.getNumber("amount_l") ?? undefined;
          const note = interaction.options.getString("note") ?? undefined;
          const resp = await plantApi<PlantRecord>("water", { id, userId, amountL, note });
          if (!resp.ok) throw new Error(resp.error);
          await interaction.editReply({
            content: `💧 Marked watered: **${resp.data.name}**. Next due **${fmtDate(resp.data.nextWaterDueAt)}**.`,
            embeds: [plantEmbed(resp.data)],
          });
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
            plantId: id, userId, attachment: image, imageUrl, caption,
          });
          if (!uploaded.ok) throw new Error(uploaded.error);

          // Persist canonical photoUrl on the plant (optional)
          await plantApi("update", { id, userId, photoUrl: uploaded.data.photoUrl });

          await interaction.editReply(`📷 Photo added. Stored at: ${uploaded.data.photoUrl}`);
          return;
        }

        /** -------- /plant reminder -------- */
        case "reminder": {
          const id = interaction.options.getInteger("id", true);
          const enabled = interaction.options.getBoolean("enabled");
          const waterIntervalDays = interaction.options.getInteger("water_interval_days") ?? undefined;
          const time = interaction.options.getString("time") ?? undefined;
          const channel = interaction.options.getChannel("channel") as TextChannel | null;

          const resp = await plantApi<PlantRecord>("reminder.set", {
            id,
            userId,
            enabled,
            waterIntervalDays,
            time, // e.g., "09:00" local
            channelId: channel?.id ?? interaction.channelId,
            guildId,
          });
          if (!resp.ok) throw new Error(resp.error);

          await interaction.editReply(
            `⏰ Reminders ${enabled === false ? "disabled" : "updated"} for **${resp.data.name}**. ` +
            (waterIntervalDays ? `Cadence: every ${waterIntervalDays}d. ` : "") +
            (time ? `Time: ${time}. ` : "")
          );
          return;
        }
      }
    } catch (err: any) {
      const reason = err?.message ?? "Unknown error";
      await interaction.editReply(`❌ ${reason}`);
    }
  },
};

export default command;