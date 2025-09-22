const cacheByThread = new Map();
const cacheByChannel = new Map(); // loose fallback
export function setForThread(threadId, entry) {
    cacheByThread.set(threadId, entry);
}
export function getForThread(threadId) {
    return cacheByThread.get(threadId);
}
export function setForChannel(channelId, entry) {
    cacheByChannel.set(channelId, entry);
}
export function getForChannel(channelId) {
    return cacheByChannel.get(channelId);
}
// Optional cleanup (call occasionally if you like)
export function prune(maxAgeMs = 1000 * 60 * 30) {
    const now = Date.now();
    for (const [k, v] of cacheByThread)
        if (now - v.createdAt > maxAgeMs)
            cacheByThread.delete(k);
    for (const [k, v] of cacheByChannel)
        if (now - v.createdAt > maxAgeMs)
            cacheByChannel.delete(k);
}
