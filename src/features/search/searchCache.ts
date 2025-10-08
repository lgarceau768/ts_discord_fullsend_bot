// src/features/search/searchCache.ts
import type { SearchCacheEntry } from './types/searchCache.js';

const cacheByThread = new Map<string, SearchCacheEntry>();
const cacheByChannel = new Map<string, SearchCacheEntry>(); // loose fallback

export function setForThread(threadId: string, entry: SearchCacheEntry) {
  cacheByThread.set(threadId, entry);
}
export function getForThread(threadId: string) {
  return cacheByThread.get(threadId);
}

export function setForChannel(channelId: string, entry: SearchCacheEntry) {
  cacheByChannel.set(channelId, entry);
}
export function getForChannel(channelId: string) {
  return cacheByChannel.get(channelId);
}

// Optional cleanup (call occasionally if you like)
export function prune(maxAgeMs = 1000 * 60 * 30) {
  const now = Date.now();
  for (const [k, v] of cacheByThread) if (now - v.createdAt > maxAgeMs) cacheByThread.delete(k);
  for (const [k, v] of cacheByChannel) if (now - v.createdAt > maxAgeMs) cacheByChannel.delete(k);
}
