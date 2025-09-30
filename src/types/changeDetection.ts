export type ChangeDetectionCreateResponse = {
  uuid?: string;
  id?: string;
  watch_uuid?: string;
} & Record<string, unknown>;

export type ChangeDetectionWatchDetails = {
  uuid?: string;
  title?: string;
  url?: string;
  last_checked?: string;
  last_changed?: string;
  last_notification?: {
    title?: string;
    body?: string;
    date?: string;
    timestamp?: string;
    ts?: number;
  } & Record<string, unknown>;
  latest_snapshot?: Record<string, unknown>;
  latest_data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ChangeDetectionHistoryEntry = {
  timestamp?: string | number;
  ts?: string | number;
  date?: string;
  time?: string;
  data?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ChangeDetectionTagListResponse = Record<string, { uuid: string; title: string }>;
