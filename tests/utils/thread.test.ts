import type { Message, ThreadChannel } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { ensureChildThread } from '../../src/core/utils/thread.js';

describe('utils/thread', () => {
  it('returns existing thread when present', async () => {
    const existingThread = { id: 'thread-123' } as ThreadChannel;
    const parent = {
      hasThread: true,
      thread: existingThread,
      startThread: vi.fn(),
    } as unknown as Message<true>;

    const thread = await ensureChildThread(parent, 'custom-name');
    expect(thread).toBe(existingThread);
    expect(parent.startThread).not.toHaveBeenCalled();
  });

  it('creates a new thread when missing', async () => {
    const createdThread = { id: 'thread-456' } as ThreadChannel;
    const startThread = vi.fn(async () => createdThread);
    const parent = {
      hasThread: false,
      thread: null,
      startThread,
    } as unknown as Message<true>;

    const thread = await ensureChildThread(parent, 'brand-new-thread');
    expect(thread).toBe(createdThread);
    expect(startThread).toHaveBeenCalledWith(expect.objectContaining({ name: 'brand-new-thread' }));
  });
});
