// src/utils/thread.ts
import type { Message, ThreadChannel } from 'discord.js';

export async function ensureChildThread(
  parent: Message<true>,
  name = 'trakt-requests',
): Promise<ThreadChannel> {
  if (parent.hasThread && parent.thread) return parent.thread;

  return await parent.startThread({
    name: name.slice(0, 100),
    autoArchiveDuration: 1440,
    reason: 'Trakt search follow-up',
  });
}
