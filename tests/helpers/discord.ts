import type { ChatInputCommandInteraction, Snowflake } from 'discord.js';
import { vi } from 'vitest';

export interface InteractionMockOptions {
  userId?: Snowflake;
  channelId?: Snowflake;
  stringOptions?: Record<string, string | null | undefined>;
  integerOptions?: Record<string, number | null | undefined>;
  channel?: ChatInputCommandInteraction['channel'];
}

export interface InteractionMock {
  interaction: ChatInputCommandInteraction;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
  options: ChatInputCommandInteraction['options'];
}

export function createInteractionMock(options: InteractionMockOptions = {}): InteractionMock {
  const {
    userId = 'user-id' as Snowflake,
    channelId = 'channel-id' as Snowflake,
    stringOptions = {},
    integerOptions = {},
    channel = null,
  } = options;

  const deferReply = vi.fn(async () => undefined);
  const editReply = vi.fn(async (value: unknown) => value);
  const reply = vi.fn(async (value: unknown) => value);

  const interactionOptions = {
    getString: vi.fn((name: string, required?: boolean) => {
      if (Object.prototype.hasOwnProperty.call(stringOptions, name)) {
        const value = stringOptions[name];
        if (value === null) return null;
        if (value === undefined && required) {
          throw new Error(`Missing required string option: ${name}`);
        }
        return value ?? null;
      }
      if (required) {
        throw new Error(`Missing required string option: ${name}`);
      }
      return null;
    }),
    getInteger: vi.fn((name: string, required?: boolean) => {
      if (Object.prototype.hasOwnProperty.call(integerOptions, name)) {
        const value = integerOptions[name];
        if (value === null || value === undefined) {
          if (required) throw new Error(`Missing required integer option: ${name}`);
          return null;
        }
        return value;
      }
      if (required) {
        throw new Error(`Missing required integer option: ${name}`);
      }
      return null;
    }),
  } satisfies ChatInputCommandInteraction['options'];

  const interaction = {
    user: { id: userId },
    channelId,
    channel,
    createdTimestamp: Date.now(),
    options: interactionOptions,
    deferReply,
    editReply,
    reply,
  } as unknown as ChatInputCommandInteraction;

  return { interaction, deferReply, editReply, reply, options: interactionOptions };
}
