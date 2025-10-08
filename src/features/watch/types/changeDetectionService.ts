export interface CreateWatchOptions {
  url: string;
  title?: string;
  tagUUIDs: string[];
  notificationUrl: string;
  notificationBody: string;
  notificationTitle: string;
  notificationFormat?: 'Markdown' | 'Text' | 'HTML';
  trackLdjsonPriceData?: boolean;
  fetchBackend?: 'html_webdriver' | 'html_requests';
  webdriverDelaySec?: number;
  intervalMinutes?: number;
}

export interface UpdateWatchOptions {
  title?: string;
  tagUUIDs?: string[];
  trackLdjsonPriceData?: boolean;
  fetchBackend?: 'html_webdriver' | 'html_requests';
  webdriverDelaySec?: number;
  intervalMinutes?: number;
}
