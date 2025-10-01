import { logger } from '../logger.js';
import type { DbInsertWatchArgs, DbUpdateWatchArgs, WatchRecord } from '../types/watch.js';
import { readSqlFile } from '../utils/sql.js';

import { query } from './database.service.js';

const SQL_ENSURE_CD_WATCHES = readSqlFile('cd_watches_ensure.sql');
const SQL_INSERT_CD_WATCH = readSqlFile('cd_watches_insert.sql');
const SQL_LIST_CD_WATCHES = readSqlFile('cd_watches_list.sql');
const SQL_DELETE_CD_WATCH = readSqlFile('cd_watches_delete.sql');
const SQL_GET_CD_WATCH = readSqlFile('cd_watches_get.sql');
const SQL_UPDATE_CD_WATCH = readSqlFile('cd_watches_update.sql');

let tablesEnsured = false;

async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;
  await query(SQL_ENSURE_CD_WATCHES);
  tablesEnsured = true;
}

export async function insertWatchRecord(args: DbInsertWatchArgs): Promise<void> {
  await ensureTables();
  await query(SQL_INSERT_CD_WATCH, [
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

export async function listWatchRecords(userId: string): Promise<WatchRecord[]> {
  await ensureTables();
  const result = await query<WatchRecord>(SQL_LIST_CD_WATCHES, [userId]);
  logger.debug(
    { userId, count: result.rowCount ?? result.rows.length },
    'Fetched ChangeDetection watches for user',
  );
  return result.rows;
}

export async function deleteWatchRecord(userId: string, uuid: string): Promise<boolean> {
  await ensureTables();
  const result = await query(SQL_DELETE_CD_WATCH, [userId, uuid]);
  const deleted = (result.rowCount ?? 0) > 0;
  logger.debug({ userId, uuid, deleted }, 'Removed ChangeDetection watch mapping');
  return deleted;
}

export async function getWatchRecord(userId: string, uuid: string): Promise<WatchRecord | null> {
  await ensureTables();
  const result = await query<WatchRecord>(SQL_GET_CD_WATCH, [userId, uuid]);
  const record = result.rows[0] ?? null;
  if (record) {
    logger.debug({ userId, uuid }, 'Fetched single watch for user');
  } else {
    logger.debug({ userId, uuid }, 'Watch not found for user');
  }
  return record;
}

export async function updateWatchRecord(args: DbUpdateWatchArgs): Promise<void> {
  await ensureTables();
  await query(SQL_UPDATE_CD_WATCH, [args.userId, args.watchUuid, args.tags]);
  logger.debug(
    { userId: args.userId, uuid: args.watchUuid },
    'Updated ChangeDetection watch mapping',
  );
}
