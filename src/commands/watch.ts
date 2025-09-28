import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type { SlashCommand } from "./_types.js";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { logger } from "../logger.js";

/** --------------------- Config / setup --------------------- */

const CD_URL = process.env.CHANGEDETECTION_URL?.replace(/\/$/, "");
const CD_KEY = process.env.CHANGEDETECTION_API_KEY || "";
const CD_NOTIFY_URL = process.env.CHANGEDETECTION_NOTIFICATION_URL || "";
const CD_TEMPLATE_PATH = process.env.CHANGEDETECTION_NOTIFICATION_TEMPLATE_PATH || "";

if (!CD_URL) {
  // We throw at runtime in handler to give a user-friendly error; keep building commands OK.
  // throw new Error("CHANGEDETECTION_URL not configured");
}

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: /^\s*(true|1|yes|on)\s*$/i.test(process.env.PGSSL || "") ? { rejectUnauthorized: false } : undefined,
});

function loadSql(name: string): string {
  const sqlPath = new URL(`../sql/${name}`, import.meta.url);
  const contents = fs.readFileSync(sqlPath, "utf-8");
  logger.debug({ sqlFile: sqlPath.pathname }, "Loaded SQL file for watch command");
  return contents;
}

const SQL_ENSURE_CD_WATCHES = loadSql("cd_watches_ensure.sql");
const SQL_INSERT_CD_WATCH = loadSql("cd_watches_insert.sql");
const SQL_LIST_CD_WATCHES = loadSql("cd_watches_list.sql");
const SQL_DELETE_CD_WATCH = loadSql("cd_watches_delete.sql");

let ensuredTable = false;
async function ensureTable() {
  if (!ensuredTable) {
    logger.debug("Ensuring cd_watches table exists");
  }
  await pool.query(SQL_ENSURE_CD_WATCHES);
  ensuredTable = true;
}

/** Load notification template (once). */
let NOTIF_TEMPLATE = "Change detected on {{watch_url}}\n\nOld → New diff available in ChangeDetection.";
if (CD_TEMPLATE_PATH) {
  try {
    const p = path.resolve(CD_TEMPLATE_PATH);
    NOTIF_TEMPLATE = fs.readFileSync(p, "utf-8");
  } catch {
    // keep default
  }
}

/** --------------------- ChangeDetection API --------------------- */

type CreateWatchResp = { uuid?: string; id?: string; watch_uuid?: string } & Record<string, unknown>;

function cdHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  // ChangeDetection typically wants X-Api-Key; some builds allow Authorization too.
  if (CD_KEY) h["X-Api-Key"] = CD_KEY;
  return h;
}

/**
 * Create a watch in ChangeDetection.
 * We keep to broadly-supported fields:
 *  - url
 *  - title
 *  - tags (string[])
 *  - notification_urls (string or newline-delimited string)
 *  - notification_body / notification_title (we’ll set body from template)
 *  - notification_format (markdown|text)
 */
async function cdCreateWatch(opts: {
  url: string;
  title?: string;
  tags: string[];
  notificationUrl: string;
  notificationBody: string;
  notificationFormat?: "markdown" | "text";
}): Promise<string> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  if (!opts.url) throw new Error("Missing URL");

  logger.debug({
    changeDetectionUrl: CD_URL,
    notificationUrl: opts.notificationUrl,
    tags: opts.tags,
  }, "Creating ChangeDetection watch");

  const body: any = {
    url: opts.url,
    title: opts.title ?? undefined,
    tags: opts.tags,
    // Many versions accept newline-separated string for multiple URLs; passing a single string is fine.
    notification_urls: opts.notificationUrl,
    notification_body: opts.notificationBody,
    notification_format: opts.notificationFormat ?? "markdown",
  };

  const res = await fetch(`${CD_URL}/api/v1/watch`, {
    method: "POST",
    headers: cdHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: CreateWatchResp = {};
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    const msg = json && Object.keys(json).length ? JSON.stringify(json) : text || res.statusText;
    logger.error({ status: res.status, body: text }, "ChangeDetection create failed");
    throw new Error(`ChangeDetection create failed: ${msg}`);
  }

  const uuid = json.uuid || json.watch_uuid || json.id;
  if (!uuid) throw new Error("ChangeDetection did not return a watch UUID");
  logger.debug({ uuid }, "ChangeDetection watch created successfully");
  return uuid;
}

/** Delete a watch by UUID (for /watch remove). */
async function cdDeleteWatch(uuid: string): Promise<void> {
  if (!CD_URL) throw new Error("CHANGEDETECTION_URL not configured");
  logger.debug({ uuid }, "Deleting ChangeDetection watch");
  const res = await fetch(`${CD_URL}/api/v1/watch/${encodeURIComponent(uuid)}`, {
    method: "DELETE",
    headers: cdHeaders(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    logger.warn({ uuid, status: res.status, body: t }, "ChangeDetection delete failed");
    throw new Error(`ChangeDetection delete failed: ${t || res.statusText}`);
  }
  logger.debug({ uuid }, "Deleted ChangeDetection watch");
}

/** --------------------- Helpers --------------------- */

function parseTags(input?: string | null): string[] {
  if (!input) return [];
  return input
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 15); // sanity
}

function mkOwnerTags(userId: string, requesterTag: string, store?: string | null, extras?: string[]) {
  const base = [
    `owner:${userId}`,
    `by:${requesterTag}`,
    "price-watch",
  ];
  if (store) base.push(`store:${store}`);
  if (extras?.length) base.push(...extras);
  // de-dupe
  return Array.from(new Set(base));
}

/** Persist ownership mapping. */
async function dbInsertWatch(args: {
  userId: string; userTag: string; watchUuid: string; url: string; tags: string[];
}) {
  await ensureTable();
  await pool.query(
    SQL_INSERT_CD_WATCH,
    [args.userId, args.userTag, args.watchUuid, args.url, args.tags],
  );
  logger.debug({
    userId: args.userId,
    watchUuid: args.watchUuid,
  }, "Inserted ChangeDetection watch mapping");
}

async function dbListWatches(userId: string) {
  await ensureTable();
  const { rows } = await pool.query(
    SQL_LIST_CD_WATCHES,
    [userId],
  );
  logger.debug({ userId, count: rows.length }, "Fetched ChangeDetection watches for user");
  return rows as { watch_uuid: string; url: string; tags: string[]; created_at: string }[];
}

async function dbDeleteWatch(userId: string, uuid: string) {
  await ensureTable();
  const { rowCount } = await pool.query(
    SQL_DELETE_CD_WATCH,
    [userId, uuid],
  );
  logger.debug({ userId, uuid, deleted: rowCount }, "Removed ChangeDetection watch mapping");
  return (rowCount ?? 0) > 0;
}

/** Render a short embed for list/remove responses. */
function watchEmbed(url: string, uuid: string, tags: string[], createdAt?: string) {
  const e = new EmbedBuilder()
    .setTitle("🔔 ChangeDetection Watch")
    .setDescription(url)
    .addFields(
      { name: "UUID", value: `\`${uuid}\``, inline: false },
      { name: "Tags", value: tags.length ? tags.map((t) => `\`${t}\``).join(" ") : "—", inline: false },
    );
  if (createdAt) {
    e.setFooter({ text: `Created ${new Date(createdAt).toLocaleString()}` });
  }
  return e;
}

/** --------------------- Slash command --------------------- */

export default {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Manage ChangeDetection watches")
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add a website to ChangeDetection (price watch)")
        .addStringOption((o) =>
          o.setName("url").setDescription("Product/website URL").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("store").setDescription("Store name (e.g., bestbuy, target, etc.)"),
        )
        .addStringOption((o) =>
          o
            .setName("tags")
            .setDescription("Extra tags (comma or space separated, e.g., gpu,4090,deal)"),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("list")
        .setDescription("List your watches"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove one of your watches")
        .addStringOption((o) =>
          o
            .setName("uuid")
            .setDescription("Watch UUID (from /watch list)")
            .setRequired(true),
        ),
    )
    // Optional: restrict to guild use if you like
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    logger.debug({
      userId: interaction.user.id,
      subcommand: sub,
      guildId: interaction.guildId,
    }, "Handling /watch command");

    if (!CD_URL) {
      await interaction.reply({ content: "❌ CHANGEDETECTION_URL is not configured.", ephemeral: true });
      logger.warn("CHANGEDETECTION_URL is not configured; rejecting /watch command");
      return;
    }
    if (!CD_NOTIFY_URL) {
      await interaction.reply({ content: "❌ CHANGEDETECTION_NOTIFICATION_URL is not configured.", ephemeral: true });
      logger.warn("CHANGEDETECTION_NOTIFICATION_URL is not configured; rejecting /watch command");
      return;
    }

    if (sub === "add") {
      const url = interaction.options.getString("url", true).trim();
      const store = interaction.options.getString("store")?.trim().toLowerCase() || null;
      const extraTags = parseTags(interaction.options.getString("tags"));
      const userId = interaction.user.id;
      const requesterTag = `${interaction.user.username}#${interaction.user.discriminator ?? "0000"}`;

      await interaction.deferReply();

      logger.debug({ userId, url, store, extraTags }, "Processing /watch add");

      try {
        // Build tags + title
        const tags = mkOwnerTags(userId, requesterTag, store, extraTags);
        const title = `[PRICE WATCH] ${store ? `[${store}] ` : ""}${url}`;

        // Build per-watch notification body from template
        const body = NOTIF_TEMPLATE
          .replaceAll("{{user}}", requesterTag)
          .replaceAll("{{user_id}}", userId)
          .replaceAll("{{store}}", store ?? "")
          .replaceAll("{{watch_url}}", url);

        const uuid = await cdCreateWatch({
          url,
          title,
          tags,
          notificationUrl: CD_NOTIFY_URL,
          notificationBody: body,
          notificationFormat: "markdown",
        });

        await dbInsertWatch({ userId, userTag: requesterTag, watchUuid: uuid, url, tags });

        logger.info({ userId, uuid, url }, "Watch created and stored");
        const embed = watchEmbed(url, uuid, tags);
        await interaction.editReply({
          content: `✅ Watch created in ChangeDetection and linked to your account.`,
          embeds: [embed],
        });
      } catch (e: any) {
        logger.error({ err: e }, "Failed to process /watch add");
        await interaction.editReply(`❌ Failed to create watch: ${e?.message ?? "Unknown error"}`);
      }
      return;
    }

    if (sub === "list") {
      await interaction.deferReply({ ephemeral: true }); // list can be noisy; ephemeral is fine here
      logger.debug({ userId: interaction.user.id }, "Processing /watch list");
      try {
        const rows = await dbListWatches(interaction.user.id);
        if (!rows.length) {
          await interaction.editReply("You have no watches yet. Add one with `/watch add`.");
          logger.debug({ userId: interaction.user.id }, "No watches found for user");
          return;
        }
        const embeds = rows.slice(0, 10).map((r) => watchEmbed(r.url, r.watch_uuid, r.tags, r.created_at));
        const summary = rows
          .slice(0, 10)
          .map((r, i) => `${i + 1}. \`${r.watch_uuid}\` — ${r.url}`)
          .join("\n");
        await interaction.editReply({
          content:
            `You have **${rows.length}** watch(es):\n` +
            summary +
            (rows.length > 10 ? `\n…and ${rows.length - 10} more.` : ""),
          embeds,
        });
        logger.debug({ userId: interaction.user.id, count: rows.length }, "/watch list completed");
      } catch (e: any) {
        logger.error({ err: e, userId: interaction.user.id }, "Failed to list watches");
        await interaction.editReply(`❌ Failed to list watches: ${e?.message ?? "Unknown error"}`);
      }
      return;
    }

    if (sub === "remove") {
      const uuid = interaction.options.getString("uuid", true).trim();
      await interaction.deferReply();

      logger.debug({ userId: interaction.user.id, uuid }, "Processing /watch remove");

      try {
        // Check ownership
        const ok = await dbDeleteWatch(interaction.user.id, uuid);
        if (!ok) {
          await interaction.editReply(
            "❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.",
          );
          logger.warn({ userId: interaction.user.id, uuid }, "/watch remove denied: not found or unauthorized");
          return;
        }

        // Try to delete from ChangeDetection (best-effort; if it fails, we already removed local ownership)
        try {
          await cdDeleteWatch(uuid);
        } catch (e: any) {
          // Log but do not fail hard
          logger.warn({ err: e, uuid }, "ChangeDetection delete failed during /watch remove");
        }

        await interaction.editReply(`🗑️ Removed watch \`${uuid}\`.`);
        logger.info({ userId: interaction.user.id, uuid }, "Watch removed for user");
      } catch (e: any) {
        logger.error({ err: e, userId: interaction.user.id, uuid }, "Failed to remove watch");
        await interaction.editReply(`❌ Failed to remove watch: ${e?.message ?? "Unknown error"}`);
      }
      return;
    }

    logger.warn({ subcommand: sub }, "/watch invoked with unsupported subcommand");
  },
} satisfies SlashCommand;
