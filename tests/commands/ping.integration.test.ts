import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createInteractionMock } from '../helpers/discord.js';

describe('ping command', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reports latency after initial reply', async () => {
    const { interaction, reply, editReply } = createInteractionMock();
    interaction.createdTimestamp = 1_000;

    const sentMessage = { createdTimestamp: 1_120 } as const;
    reply.mockResolvedValue(sentMessage);

    const module = await import('../../src/commands/ping.js');
    await module.default.execute(interaction);

    expect(reply).toHaveBeenCalledWith({ content: 'Pinging...', fetchReply: true });
    expect(editReply).toHaveBeenCalledWith(expect.stringContaining('Pong!'));
    const latencyMessage = editReply.mock.calls[0][0] as string;
    expect(latencyMessage).toMatch(/Latency: 120ms/);
  });
});
