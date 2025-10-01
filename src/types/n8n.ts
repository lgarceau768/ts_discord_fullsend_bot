export type TraktType = 'movie' | 'show' | 'both';

export interface SearchItem {
  type: 'movie' | 'show';
  title: string;
  year?: number;
  result?: SearchItem;
  ids?: {
    trakt?: number;
    tmdb?: number;
    imdb?: string;
    slug?: string;
    tvdb?: number;
    tvrage?: number | null;
  };
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  poster_url?: string;
  backdrop_url?: string;
  genres?: string[];
  rating?: number;
  runtime?: number;
  network?: string;
}

export interface TrackN8NResponse {
  results: SearchItem[];
  ok: boolean;
  query: string;
  query_original: string;
}
