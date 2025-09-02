// src/state/searchCache.ts
import type { SearchItem } from "../integrations/n8n.js";

export type CacheEntry = {
    items: SearchItem[];
    createdAt: number;
    query: string;
    authorId: string;
    parentMessageId: string;
};

const cacheByThread = new Map<string, CacheEntry>();
const cacheByChannel = new Map<string, CacheEntry>(); // loose fallback

export function setForThread(threadId: string, entry: CacheEntry) {
    cacheByThread.set(threadId, entry);
}
export function getForThread(threadId: string) {
    return cacheByThread.get(threadId);
}

export function setForChannel(channelId: string, entry: CacheEntry) {
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