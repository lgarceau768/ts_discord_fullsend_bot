import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { logger } from "../logger.js";
/** --------------------- Config / setup --------------------- */
const CD_URL = process.env.CHANGEDETECTION_URL?.replace(/\/$/, "");
const CD_KEY = process.env.CHANGEDETECTION_API_KEY || "";
const CD_NOTIFY_URL = process.env.CHANGEDETECTION_NOTIFICATION_URL || "";
const CD_TEMPLATE_PATH = process.env.CHANGEDETECTION_NOTIFICATION_TEMPLATE_PATH || "";
const PAGE_TITLE_TIMEOUT_MS = 5000;
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
function loadSql(name) {
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
    }
    catch {
        // keep default
    }
}
const templateHasWatchUrlPlaceholder = /\{\{\s*watch_url\s*\}\}/.test(NOTIF_TEMPLATE);
logger.info({
    templatePath: CD_TEMPLATE_PATH || "default",
    templateHasWatchUrlPlaceholder,
}, "Watch notification template loaded");
function renderTemplate(template, ctx) {
    return Object.entries(ctx).reduce((acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ""), template);
}
async function fetchPageTitle(url) {
    let parsed;
    try {
        parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            logger.debug({ url }, "Skipping page title fetch for unsupported protocol");
            return null;
        }
    }
    catch {
        logger.warn({ url }, "Invalid URL, skipping page title fetch");
        return null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TITLE_TIMEOUT_MS);
    try {
        const res = await fetch(parsed, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; FullSendBot/1.0)",
                Accept: "text/html,application/xhtml+xml",
            },
            redirect: "follow",
            signal: controller.signal,
        });
        if (!res.ok) {
            logger.warn({ status: res.status, url }, "Failed to fetch page title (status)");
            return null;
        }
        const html = await res.text();
        const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = match?.[1]?.trim() || null;
        if (!title) {
            logger.debug({ url }, "No <title> tag found when fetching page");
        }
        return title;
    }
    catch (err) {
        logger.warn({ url, err }, "Failed to fetch page title");
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
function cdHeaders() {
    const h = { "Content-Type": "application/json" };
    if (CD_KEY)
        h["X-Api-Key"] = CD_KEY;
    return h;
}
async function cdCreateWatch(opts) {
    if (!CD_URL)
        throw new Error("CHANGEDETECTION_URL not configured");
    if (!opts.url)
        throw new Error("Missing URL");
    logger.debug({
        url: opts.url,
        notificationUrls: opts.notificationUrls,
        tags: opts.tags,
        notificationFormat: opts.notificationFormat ?? "markdown",
        trackLdjsonPriceData: opts.trackLdjsonPriceData ?? true,
    }, "Creating ChangeDetection watch");
    const body = {
        url: opts.url,
        title: opts.title ?? undefined,
        tags: opts.tags,
        notification_urls: opts.notificationUrls,
        notification_body: opts.notificationBody,
        notification_title: opts.notificationTitle,
        notification_format: opts.notificationFormat ?? "markdown",
        track_ldjson_price_data: opts.trackLdjsonPriceData ?? true,
    };
    const res = await fetch(`${CD_URL}/api/v1/watch`, {
        method: "POST",
        headers: cdHeaders(),
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = {};
    try {
        json = JSON.parse(text);
    }
    catch { }
    if (!res.ok) {
        const msg = json && Object.keys(json).length ? JSON.stringify(json) : text || res.statusText;
        logger.error({ status: res.status, body: text, url: opts.url }, "ChangeDetection create failed");
        throw new Error(`ChangeDetection create failed: ${msg}`);
    }
    const uuid = json.uuid || json.watch_uuid || json.id;
    if (!uuid)
        throw new Error("ChangeDetection did not return a watch UUID");
    logger.debug({ uuid, url: opts.url }, "ChangeDetection watch created successfully");
    return uuid;
}
/** Delete a watch by UUID (for /watch remove). */
async function cdDeleteWatch(uuid) {
    if (!CD_URL)
        throw new Error("CHANGEDETECTION_URL not configured");
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
function parseTags(input) {
    if (!input)
        return [];
    return input
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 15); // sanity
}
function mkOwnerTags(userId, requesterTag, store, extras) {
    const base = [
        `by:${requesterTag}`,
        "price-watch",
    ];
    if (store)
        base.push(`store:${store}`);
    if (extras?.length)
        base.push(...extras);
    // de-dupe
    return Array.from(new Set(base));
}
/** Persist ownership mapping. */
async function dbInsertWatch(args) {
    await ensureTable();
    await pool.query(SQL_INSERT_CD_WATCH, [args.userId, args.userTag, args.watchUuid, args.url, args.tags]);
    logger.debug({
        userId: args.userId,
        watchUuid: args.watchUuid,
    }, "Inserted ChangeDetection watch mapping");
}
async function dbListWatches(userId) {
    await ensureTable();
    const { rows } = await pool.query(SQL_LIST_CD_WATCHES, [userId]);
    logger.debug({ userId, count: rows.length }, "Fetched ChangeDetection watches for user");
    return rows;
}
async function dbDeleteWatch(userId, uuid) {
    await ensureTable();
    const { rowCount } = await pool.query(SQL_DELETE_CD_WATCH, [userId, uuid]);
    logger.debug({ userId, uuid, deleted: rowCount }, "Removed ChangeDetection watch mapping");
    return (rowCount ?? 0) > 0;
}
/** Render a short embed for list/remove responses. */
function watchEmbed(url, uuid, tags, createdAt) {
    const e = new EmbedBuilder()
        .setTitle("🔔 ChangeDetection Watch")
        .setDescription(url)
        .addFields({ name: "UUID", value: `\`${uuid}\``, inline: false }, { name: "Tags", value: tags.length ? tags.map((t) => `\`${t}\``).join(" ") : "—", inline: false });
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
        .addSubcommand((sc) => sc
        .setName("add")
        .setDescription("Add a website to ChangeDetection (price watch)")
        .addStringOption((o) => o.setName("url").setDescription("Product/website URL").setRequired(true))
        .addStringOption((o) => o.setName("store").setDescription("Store name (e.g., bestbuy, target, etc.)"))
        .addStringOption((o) => o
        .setName("tags")
        .setDescription("Extra tags (comma or space separated, e.g., gpu,4090,deal)")))
        .addSubcommand((sc) => sc
        .setName("list")
        .setDescription("List your watches"))
        .addSubcommand((sc) => sc
        .setName("remove")
        .setDescription("Remove one of your watches")
        .addStringOption((o) => o
        .setName("uuid")
        .setDescription("Watch UUID (from /watch list)")
        .setRequired(true)))
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
                const pageTitle = await fetchPageTitle(url);
                const title = pageTitle
                    ? `[PRICE WATCH] ${pageTitle}`
                    : `[PRICE WATCH] ${store ? `[${store}] ` : ""}${url}`;
                // Build per-watch notification body from template
                const templateContext = {
                    user: requesterTag,
                    user_id: userId,
                    store: store ?? "",
                    watch_url: url,
                };
                const body = renderTemplate(NOTIF_TEMPLATE, templateContext);
                const notificationTitle = "{{watch_url}}";
                const bodyHasPlaceholders = /\{\{[^}]+\}\}/.test(body);
                logger.info({ bodyHasPlaceholders, notificationTitle }, "Rendered watch notification template");
                const uuid = await cdCreateWatch({
                    url,
                    title,
                    tags,
                    notificationUrls: [CD_NOTIFY_URL],
                    notificationBody: body, // your loaded template text
                    notificationTitle,
                    notificationFormat: "markdown",
                    trackLdjsonPriceData: true,
                });
                await dbInsertWatch({ userId, userTag: requesterTag, watchUuid: uuid, url, tags });
                logger.info({ userId, uuid, url }, "Watch created and stored");
                const embed = watchEmbed(url, uuid, tags);
                await interaction.editReply({
                    content: `✅ Watch created in ChangeDetection and linked to your account.`,
                    embeds: [embed],
                });
            }
            catch (e) {
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
                    content: `You have **${rows.length}** watch(es):\n` +
                        summary +
                        (rows.length > 10 ? `\n…and ${rows.length - 10} more.` : ""),
                    embeds,
                });
                logger.debug({ userId: interaction.user.id, count: rows.length }, "/watch list completed");
            }
            catch (e) {
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
                    await interaction.editReply("❌ Not found, or you do not own this watch. Use `/watch list` to see your watches.");
                    logger.warn({ userId: interaction.user.id, uuid }, "/watch remove denied: not found or unauthorized");
                    return;
                }
                // Try to delete from ChangeDetection (best-effort; if it fails, we already removed local ownership)
                try {
                    await cdDeleteWatch(uuid);
                }
                catch (e) {
                    // Log but do not fail hard
                    logger.warn({ err: e, uuid }, "ChangeDetection delete failed during /watch remove");
                }
                await interaction.editReply(`🗑️ Removed watch \`${uuid}\`.`);
                logger.info({ userId: interaction.user.id, uuid }, "Watch removed for user");
            }
            catch (e) {
                logger.error({ err: e, userId: interaction.user.id, uuid }, "Failed to remove watch");
                await interaction.editReply(`❌ Failed to remove watch: ${e?.message ?? "Unknown error"}`);
            }
            return;
        }
        logger.warn({ subcommand: sub }, "/watch invoked with unsupported subcommand");
    },
};
