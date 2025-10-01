export interface EnvSchema {
  DISCORD_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID?: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

  N8N_SEARCH_URL?: string;
  N8N_PLANT_URL?: string;
  N8N_API_KEY?: string;

  JELLYSEERR_URL?: string;
  JELLYSEERR_API_KEY?: string;
  JELLYSEERR_SERIES_DEFAULT: 'all' | 'first' | 'latest';
  JELLYSEERR_4K: 'true' | 'false';
  JELLYSEERR_AUTO_APPROVE: boolean;
  JELLYSEERR_AUTO_DOWNLOAD: boolean;
  JELLYSEERR_SEARCH_NOW: boolean;

  QBIT_URL?: string;
  QBIT_USERNAME?: string;
  QBIT_PASSWORD?: string;
}
