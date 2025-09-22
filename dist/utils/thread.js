export async function ensureChildThread(parent, name = "trakt-requests") {
    if (parent.hasThread && parent.thread)
        return parent.thread; // already there
    // 1440 = 24h auto-archive. Adjust for your server’s thread settings
    const thread = await parent.startThread({
        name: name.slice(0, 100),
        autoArchiveDuration: 1440,
        reason: "Trakt search follow-up",
    });
    return thread;
}
