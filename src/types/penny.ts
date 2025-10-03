export type PennyRetailer = 'home-depot' | 'lowes';

export interface PennySearchFilters {
  zip: string;
  retailer?: PennyRetailer;
  query?: string;
  radiusMiles?: number;
}

export interface PennyDeal {
  id: number;
  sku: string;
  title: string;
  retailer: PennyRetailer;
  storeId: string;
  zip: string;
  price: number;
  distanceMiles?: number | null;
  lastSeenAt: string; // ISO timestamp
  metadata?: Record<string, unknown> | null;
}

export interface PennyDealUpsert {
  sku: string;
  retailer: PennyRetailer;
  storeId: string;
  price: number;
  zip: string;
  title: string;
  distanceMiles?: number | null;
  lastSeenAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface PennySubscriptionInput {
  userId: string;
  zip: string;
  retailer?: PennyRetailer;
  keyword?: string;
  channelId?: string;
  guildId?: string;
  notifyViaDm?: boolean;
}

export interface PennySubscription extends PennySubscriptionInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export type SeleniumJobKind = 'penny-search' | 'penny-backfill';

export interface SeleniumJobRequest {
  kind: SeleniumJobKind;
  filters: PennySearchFilters;
  priority?: 'low' | 'normal' | 'high';
  requestedBy: string; // user id or system id
}

export interface SeleniumJobResponse {
  jobId: string;
  status: 'queued' | 'in-progress' | 'completed' | 'failed';
  message?: string;
}

export interface SeleniumJobResult {
  jobId: string;
  status: 'completed' | 'failed';
  deals?: PennyDeal[];
  error?: string;
  completedAt: string;
}
