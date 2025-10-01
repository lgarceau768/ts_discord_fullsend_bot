import type { Attachment, ChatInputCommandInteraction, Snowflake } from 'discord.js';
import { vi } from 'vitest';

export interface InteractionMockOptions {
  userId?: Snowflake;
  username?: string;
  discriminator?: string;
  guildId?: Snowflake | null;
  channelId?: Snowflake;
  channel?: ChatInputCommandInteraction['channel'];
  stringOptions?: Record<string, string | null | undefined>;
  integerOptions?: Record<string, number | null | undefined>;
  numberOptions?: Record<string, number | null | undefined>;
  booleanOptions?: Record<string, boolean | null | undefined>;
  attachmentOptions?: Record<string, Attachment | null | undefined>;
  channelOptions?: Record<string, { id: Snowflake } | null>;
  subcommand?: string;
}

export interface InteractionMock {
  interaction: ChatInputCommandInteraction;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
  options: ChatInputCommandInteraction['options'];
}

const missingRequired = (type: string, name: string): never => {
  throw new Error(`Missing required ${type} option: ${name}`);
};

export function createInteractionMock(options: InteractionMockOptions = {}): InteractionMock {
  const {
    userId = 'user-id' as Snowflake,
    username = 'TestUser',
    discriminator = '0001',
    guildId = 'guild-id' as Snowflake,
    channelId = 'channel-id' as Snowflake,
    channel = null,
    stringOptions = {},
    integerOptions = {},
    numberOptions = {},
    booleanOptions = {},
    attachmentOptions = {},
    channelOptions = {},
    subcommand,
  } = options;

  const deferReply = vi.fn(async () => undefined);
  const editReply = vi.fn(async (value: unknown) => value);
  const reply = vi.fn(async (value: unknown) => value);

  const interactionOptions = {
    getSubcommand: vi.fn((required?: boolean) => {
      if (subcommand) return subcommand;
      if (required) throw new Error('Missing required subcommand');
      return '';
    }),
    getString: vi.fn((name: string, required?: boolean) => {
      if (Object.prototype.hasOwnProperty.call(stringOptions, name)) {
        const value = stringOptions[name];
        if (value === null) return null;
        if (value === undefined) {
          if (required) missingRequired('string', name);
          return null;
        }
        return value;
      }
      if (required) missingRequired('string', name);
      return null;
    }),
    getInteger: vi.fn((name: string, required?: boolean) => {
      if (Object.prototype.hasOwnProperty.call(integerOptions, name)) {
        const value = integerOptions[name];
        if (value === null || value === undefined) {
          if (required) missingRequired('integer', name);
          return null;
        }
        return value;
      }
      if (required) missingRequired('integer', name);
      return null;
    }),
    getNumber: vi.fn((name: string, required?: boolean) => {
      if (Object.prototype.hasOwnProperty.call(numberOptions, name)) {
        const value = numberOptions[name];
        if (value === null || value === undefined) {
          if (required) missingRequired('number', name);
          return null;
        }
        return value;
      }
      if (required) missingRequired('number', name);
      return null;
    }),
    getBoolean: vi.fn((name: string, required?: boolean) => {
      if (Object.prototype.hasOwnProperty.call(booleanOptions, name)) {
        const value = booleanOptions[name];
        if (value === null || value === undefined) {
          if (required) missingRequired('boolean', name);
          return null;
        }
        return value;
      }
      if (required) missingRequired('boolean', name);
      return null;
    }),
    getAttachment: vi.fn((name: string) => {
      if (Object.prototype.hasOwnProperty.call(attachmentOptions, name)) {
        return attachmentOptions[name] ?? null;
      }
      return null;
    }),
    getChannel: vi.fn((name: string) => {
      if (Object.prototype.hasOwnProperty.call(channelOptions, name)) {
        return channelOptions[name] ?? null;
      }
      return null;
    }),
  } satisfies ChatInputCommandInteraction['options'];

  const interaction = {
    user: { id: userId, username, discriminator },
    guildId,
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
