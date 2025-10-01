import fs from 'node:fs';
import path from 'node:path';

import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { logger } from '../../logger.js';
import {
  createTag,
  createWatch,
  deleteWatch,
  getWatchDetails,
  getWatchHistory,
  listTags,
  updateWatch,
} from '../../services/changeDetectionService.js';
import { getSnapshotIconUrl, getSiteIconUrl, getWatchIconUrl } from '../../services/iconService.js';
import {
  deleteWatchRecord,
  getWatchRecord,
  insertWatchRecord,
  listWatchRecords,
  updateWatchRecord,
} from '../../services/watchDbService.js';
import type { UpdateWatchOptions } from '../../types/changeDetectionService.js';
import type { CreateWatchInput, UpdateWatchInput, WatchBase } from '../../types/watch.js';
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
  const payload: UpdateWatchOptions = {};
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
  dbInsertWatch: insertWatchRecord,
  dbListWatches: listWatchRecords,
  dbDeleteWatch: deleteWatchRecord,
  dbGetWatch: getWatchRecord,
  dbUpdateWatch: updateWatchRecord,
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
