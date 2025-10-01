export interface JellyseerrMediaInfo {
  status?: number;
}

export interface JellyseerrSeason {
  seasonNumber: number;
}

export interface JellyseerrDetails {
  id: number;
  name?: string;
  title?: string;
  overview?: string;
  posterPath?: string;
  mediaInfo?: JellyseerrMediaInfo;
  seasons?: JellyseerrSeason[];
}

export interface JellyseerrRequestOptions {
  is4k?: boolean;
  isAutoApprove?: boolean;
  isAutoDownload?: boolean;
  searchNow?: boolean;
  serverId?: number;
  profileId?: number;
  rootFolder?: string;
  languageProfileId?: number;
  tags?: number[];
  seasons?: number[];
}
