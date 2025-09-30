import fs from 'node:fs';
import path from 'node:path';

import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import pg from 'pg';

import { logger } from '../../logger.js';
import {
  createTag,
  createWatch,
  deleteWatch,
  getWatchDetails,
  getWatchHistory,
  listTags,
  updateWatch,
  type UpdateWatchOpts,
} from '../../services/changeDetectionService.js';
import { getSnapshotIconUrl, getSiteIconUrl, getWatchIconUrl } from '../../services/iconService.js';
import type {
  CreateWatchInput,
  DbInsertWatchArgs,
  DbUpdateWatchArgs,
  UpdateWatchInput,
  WatchBase,
  WatchRecord,
} from '../../types/watch.js';
import type { SlashCommand } from '../_types.js';

import { configureAddSubcommand, handleAddSubcommand, ADD_SUBCOMMAND_NAME } from './add.js';
import {
  configureLatestSubcommand,
  handleLatestSubcommand,
  LATEST_SUBCOMMAND_NAME,
} from './latest.js';
import { configureListSubcommand, handleListSubcommand, LIST_SUBCOMMAND_NAME } from './list.js';
import {
  configureRemoveSubcommand,
  handleRemoveSubcommand,
  REMOVE_SUBCOMMAND_NAME,
} from './remove.js';
import {
  configureUpdateSubcommand,
  handleUpdateSubcommand,
  UPDATE_SUBCOMMAND_NAME,
} from './update.js';

const CD_URL = process.env.CHANGEDETECTION_URL?.replace(/\/$/, '');
const CD_NOTIFY_URL = process.env.CHANGEDETECTION_NOTIFICATION_URL ?? '';
const CD_TEMPLATE_PATH = process.env.CHANGEDETECTION_NOTIFICATION_TEMPLATE_PATH ?? '';

const WATCH_COLOR_PRIMARY = 0x6366f1;
const WATCH_COLOR_SUCCESS = 0x22c55e;
const WATCH_COLOR_WARNING = 0xf59e0b;
const WATCH_COLOR_DANGER = 0xef4444;

const WATCH_ICON_URL = getWatchIconUrl();
const WATCH_SNAPSHOT_ICON_URL = getSnapshotIconUrl();

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: /^\s*(true|1|yes|on)\s*$/i.test(process.env.PGSSL ?? '')
    ? { rejectUnauthorized: false }
    : undefined,
});

function loadSql(name: string): string {
  const sqlPath = new URL(`../../sql/${name}`, import.meta.url);
  const contents = fs.readFileSync(sqlPath, 'utf-8');
  logger.debug({ sqlFile: sqlPath.pathname }, 'Loaded SQL file for watch command');
  return contents;
}

const SQL_ENSURE_CD_WATCHES = loadSql('cd_watches_ensure.sql');
const SQL_INSERT_CD_WATCH = loadSql('cd_watches_insert.sql');
const SQL_LIST_CD_WATCHES = loadSql('cd_watches_list.sql');
const SQL_DELETE_CD_WATCH = loadSql('cd_watches_delete.sql');
const SQL_GET_CD_WATCH = loadSql('cd_watches_get.sql');
const SQL_UPDATE_CD_WATCH = loadSql('cd_watches_update.sql');

let ensuredTable = false;
async function ensureTable(): Promise<void> {
  if (!ensuredTable) {
    logger.debug('Ensuring cd_watches table exists');
  }
  await pool.query(SQL_ENSURE_CD_WATCHES);
  ensuredTable = true;
}

let NOTIF_TEMPLATE =
  'Change detected on {{watch_url}}\n\nOld → New diff available in ChangeDetection.';
if (CD_TEMPLATE_PATH) {
  try {
    const templatePath = path.resolve(CD_TEMPLATE_PATH);
    NOTIF_TEMPLATE = fs.readFileSync(templatePath, 'utf-8');
  } catch (error) {
    logger.warn(
      { err: error, templatePath: CD_TEMPLATE_PATH },
      'Failed to load notification template; falling back to default',
    );
  }
}

const templateHasWatchUrlPlaceholder = /\{\{\s*watch_url\s*}}/.test(NOTIF_TEMPLATE);
logger.info(
  {
    templatePath: CD_TEMPLATE_PATH || 'default',
    templateHasWatchUrlPlaceholder,
  },
  'Watch notification template loaded',
);

function renderTemplate(template: string, ctx: Record<string, string>): string {
  return Object.entries(ctx).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ''),
    template,
  );
}

const cdListTags = listTags;
const cdCreateTag = createTag;

async function ensureTagsByTitle(titles: string[]): Promise<string[]> {
  const unique = Array.from(new Set((titles || []).map((title) => title.trim()).filter(Boolean)));
  if (!unique.length) return [];

  const existing = await cdListTags();
  const byTitle = new Map<string, string>();
  for (const [uuid, entry] of Object.entries(existing)) {
    if (entry?.title) byTitle.set(entry.title, uuid);
  }

  const uuids: string[] = [];
  for (const title of unique) {
    const existingUuid = byTitle.get(title);
    if (existingUuid) {
      uuids.push(existingUuid);
      continue;
    }
    const created = await cdCreateTag(title);
    uuids.push(created);
  }
  return uuids;
}

async function cdCreateWatch(opts: CreateWatchInput): Promise<string> {
  if (!opts.url) throw new Error('Missing URL');
  const tagUUIDs = await ensureTagsByTitle(opts.tagTitles || []);
  return createWatch({
    url: opts.url,
    title: opts.title,
    tagUUIDs,
    notificationUrl: opts.notificationUrl,
    notificationBody: opts.notificationBody,
    notificationTitle: opts.notificationTitle,
    notificationFormat: opts.notificationFormat,
    trackLdjsonPriceData: opts.trackLdjsonPriceData,
    fetchBackend: opts.fetchBackend,
    webdriverDelaySec: opts.webdriverDelaySec,
    intervalMinutes: opts.intervalMinutes,
  });
}

const cdDeleteWatch = deleteWatch;
const cdGetWatchDetails = getWatchDetails;
const cdGetWatchHistory = getWatchHistory;

async function cdUpdateWatch(opts: UpdateWatchInput): Promise<void> {
  const payload: UpdateWatchOpts = {};
  if (opts.title !== undefined) payload.title = opts.title;
  if (opts.trackLdjsonPriceData !== undefined)
    payload.trackLdjsonPriceData = opts.trackLdjsonPriceData;
  if (opts.fetchBackend !== undefined) payload.fetchBackend = opts.fetchBackend;
  if (opts.webdriverDelaySec !== undefined) payload.webdriverDelaySec = opts.webdriverDelaySec;
  if (opts.intervalMinutes !== undefined) payload.intervalMinutes = opts.intervalMinutes;

  if (opts.tagTitles) {
    payload.tagUUIDs = await ensureTagsByTitle(opts.tagTitles);
  }

  await updateWatch(opts.uuid, payload);
}

function parseTags(input?: string | null): string[] {
  if (!input) return [];
  return input
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 15);
}

function mkOwnerTags(
  userId: string,
  requesterTag: string,
  store?: string | null,
  extras?: string[],
): string[] {
  const base = [`by:${requesterTag}`, 'price-watch'];
  if (store) base.push(`store:${store}`);
  if (extras?.length) base.push(...extras);
  return Array.from(new Set(base));
}

async function dbInsertWatch(args: DbInsertWatchArgs): Promise<void> {
  await ensureTable();
  await pool.query(SQL_INSERT_CD_WATCH, [
    args.userId,
    args.userTag,
    args.watchUuid,
    args.url,
    args.tags,
  ]);
  logger.debug(
    { userId: args.userId, watchUuid: args.watchUuid },
    'Inserted ChangeDetection watch mapping',
  );
}

async function dbListWatches(userId: string): Promise<WatchRecord[]> {
  await ensureTable();
  const { rows } = await pool.query(SQL_LIST_CD_WATCHES, [userId]);
  logger.debug({ userId, count: rows.length }, 'Fetched ChangeDetection watches for user');
  return rows as WatchRecord[];
}

async function dbDeleteWatch(userId: string, uuid: string): Promise<boolean> {
  await ensureTable();
  const { rowCount } = await pool.query(SQL_DELETE_CD_WATCH, [userId, uuid]);
  logger.debug({ userId, uuid, deleted: rowCount }, 'Removed ChangeDetection watch mapping');
  return (rowCount ?? 0) > 0;
}

async function dbGetWatch(userId: string, uuid: string): Promise<WatchRecord | null> {
  await ensureTable();
  const { rows } = await pool.query(SQL_GET_CD_WATCH, [userId, uuid]);
  const record = (rows[0] as WatchRecord | undefined) ?? null;
  if (record) {
    logger.debug({ userId, uuid }, 'Fetched single watch for user');
  } else {
    logger.debug({ userId, uuid }, 'Watch not found for user');
  }
  return record;
}

async function dbUpdateWatch(args: DbUpdateWatchArgs): Promise<void> {
  await ensureTable();
  await pool.query(SQL_UPDATE_CD_WATCH, [args.userId, args.watchUuid, args.tags]);
  logger.debug(
    { userId: args.userId, uuid: args.watchUuid },
    'Updated ChangeDetection watch mapping',
  );
}

const watchBase: WatchBase = {
  renderTemplate,
  notificationTemplate: NOTIF_TEMPLATE,
  notificationUrl: CD_NOTIFY_URL,
  getSiteIconUrl,
  cdCreateWatch,
  cdUpdateWatch,
  cdDeleteWatch,
  cdGetWatchDetails,
  cdGetWatchHistory,
  parseTags,
  mkOwnerTags,
  dbInsertWatch,
  dbListWatches,
  dbDeleteWatch,
  dbGetWatch,
  dbUpdateWatch,
  colors: {
    primary: WATCH_COLOR_PRIMARY,
    success: WATCH_COLOR_SUCCESS,
    warning: WATCH_COLOR_WARNING,
    danger: WATCH_COLOR_DANGER,
  },
  icons: {
    watch: WATCH_ICON_URL,
    snapshot: WATCH_SNAPSHOT_ICON_URL,
  },
};

const data = new SlashCommandBuilder()
  .setName('watch')
  .setDescription('Manage ChangeDetection watches')
  .addSubcommand((sub) => configureAddSubcommand(sub))
  .addSubcommand((sub) => configureListSubcommand(sub))
  .addSubcommand((sub) => configureRemoveSubcommand(sub))
  .addSubcommand((sub) => configureLatestSubcommand(sub))
  .addSubcommand((sub) => configureUpdateSubcommand(sub))
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

const SUBCOMMAND_HANDLERS: Record<
  string,
  (base: WatchBase, interaction: ChatInputCommandInteraction) => Promise<void>
> = {
  [ADD_SUBCOMMAND_NAME]: handleAddSubcommand,
  [LIST_SUBCOMMAND_NAME]: handleListSubcommand,
  [REMOVE_SUBCOMMAND_NAME]: handleRemoveSubcommand,
  [LATEST_SUBCOMMAND_NAME]: handleLatestSubcommand,
  [UPDATE_SUBCOMMAND_NAME]: handleUpdateSubcommand,
};

const command: SlashCommand = {
  data,
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(true);

    if (!CD_URL) {
      await interaction.reply({
        content: '❌ CHANGEDETECTION_URL is not configured.',
        ephemeral: true,
      });
      return;
    }
    if (!CD_NOTIFY_URL) {
      await interaction.reply({
        content: '❌ CHANGEDETECTION_NOTIFICATION_URL is not configured.',
        ephemeral: true,
      });
      return;
    }

    const handler = SUBCOMMAND_HANDLERS[subcommand];
    if (!handler) {
      logger.warn({ subcommand }, 'Unsupported /watch subcommand invoked');
      await interaction.reply({ content: '❌ Unsupported subcommand.', ephemeral: true });
      return;
    }

    await handler(watchBase, interaction);
  },
};

export { watchBase, command };
export default command;
