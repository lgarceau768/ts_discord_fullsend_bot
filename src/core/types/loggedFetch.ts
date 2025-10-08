export interface FetchLogMeta {
  method: string;
  url: string;
  body?: string;
  durationMs?: number;
  status?: number;
}
