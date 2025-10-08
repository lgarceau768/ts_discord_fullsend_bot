import type {
  ChangeDetectionHistoryEntry,
  ChangeDetectionWatchDetails,
} from './changeDetection.js';

export interface PriceSnapshot {
  price?: string;
  previousPrice?: string;
  currency?: string;
  inStockLabel?: string;
  inStock?: boolean | null;
  context?: string;
  timestamp?: string;
  rawNode?: Record<string, unknown>;
  imageUrl?: string;
}

export interface WatchRecord {
  watch_uuid: string;
  url: string;
  tags: string[];
  created_at: string;
}

export interface DbListWatchOptions {
  limit?: number;
  offset?: number;
}

export interface DbInsertWatchArgs {
  userId: string;
  userTag: string;
  watchUuid: string;
  url: string;
  tags: string[];
}

export interface WatchBase {
  renderTemplate(template: string, ctx: Record<string, string>): string;
  notificationTemplate: string;
  notificationUrl: string;
  getSiteIconUrl(url: string, size?: number): string;
  cdCreateWatch(opts: CreateWatchInput): Promise<string>;
  cdUpdateWatch(opts: UpdateWatchInput): Promise<void>;
  cdDeleteWatch(uuid: string): Promise<void>;
  cdGetWatchDetails(uuid: string): Promise<ChangeDetectionWatchDetails>;
  cdGetWatchHistory(uuid: string): Promise<ChangeDetectionHistoryEntry[]>;
  parseTags(input?: string | null): string[];
  mkOwnerTags(
    userId: string,
    requesterTag: string,
    store?: string | null,
    extras?: string[],
  ): string[];
  dbInsertWatch(args: DbInsertWatchArgs): Promise<void>;
  dbListWatches(userId: string, options?: DbListWatchOptions): Promise<WatchRecord[]>;
  dbDeleteWatch(userId: string, uuid: string): Promise<boolean>;
  dbGetWatch(userId: string, uuid: string): Promise<WatchRecord | null>;
  dbUpdateWatch(args: DbUpdateWatchArgs): Promise<void>;
  colors: {
    primary: number;
    success: number;
    warning: number;
    danger: number;
  };
  icons: {
    watch: string;
    snapshot: string;
  };
}

export interface DisplayEntry {
  index: number;
  record: WatchRecord;
  details?: ChangeDetectionWatchDetails;
  priceSnapshot: PriceSnapshot | null;
  errorMessage?: string;
  pageTitle?: string;
}

export interface WatchCreatedEmbedInput {
  base: WatchBase;
  url: string;
  uuid: string;
  tags: string[];
  pageTitle?: string | null;
}

export interface LatestEmbedInput {
  uuid: string;
  watchUrl: string;
  tags: string[];
  details?: ChangeDetectionWatchDetails;
  priceSnapshot: PriceSnapshot | null;
  pageTitle?: string;
  errorMessage?: string;
}

export interface PriceCandidate {
  node: Record<string, unknown>;
  context: string;
  timestamp?: string;
  score: number;
}

export interface CreateWatchInput {
  url: string;
  title?: string;
  tagTitles: string[];
  notificationUrl: string;
  notificationBody: string;
  notificationTitle: string;
  notificationFormat?: 'Markdown' | 'Text' | 'HTML';
  trackLdjsonPriceData?: boolean;
  fetchBackend?: 'html_webdriver' | 'html_requests';
  webdriverDelaySec?: number;
  intervalMinutes?: number;
}

export interface UpdateWatchInput {
  uuid: string;
  title?: string;
  tagTitles?: string[];
  trackLdjsonPriceData?: boolean;
  fetchBackend?: 'html_webdriver' | 'html_requests';
  webdriverDelaySec?: number;
  intervalMinutes?: number;
}

export interface DbUpdateWatchArgs {
  userId: string;
  watchUuid: string;
  tags: string[];
}
