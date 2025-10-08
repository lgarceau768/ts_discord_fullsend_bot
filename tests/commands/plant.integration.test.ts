import type { Attachment } from 'discord.js';
import type { RequestInit } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInteractionMock } from '../helpers/discord.js';

interface PlantRequestContext {
  url: string;
  init?: RequestInit;
  body: Record<string, unknown>;
}

type PlantResponseHandler = (ctx: PlantRequestContext) => Response | Promise<Response>;

const plantRequests: PlantRequestContext[] = [];
const plantResponses = new Map<string, PlantResponseHandler>();

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const okResponse = (data: unknown) => jsonResponse({ ok: true, data });
const errorResponse = (error: string, status = 400) => jsonResponse({ ok: false, error }, status);

const loggedFetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const bodyRaw = typeof init?.body === 'string' ? init.body : '{}';
  const parsed: Record<string, unknown> = JSON.parse(bodyRaw);
  const action = typeof parsed.action === 'string' ? parsed.action : 'direct';
  const ctx: PlantRequestContext = { url, init, body: parsed };
  plantRequests.push(ctx);
  const handler = plantResponses.get(action) ?? plantResponses.get('*');
  if (!handler) {
    return okResponse({});
  }
  return handler(ctx);
});

vi.mock('../../src/core/utils/loggedFetch.js', () => ({
  loggedFetch: loggedFetchMock,
}));
const capturedErrors: unknown[] = [];

vi.mock('../../src/core/utils/errors.js', () => ({
  getErrorMessage: (error: unknown) => {
    capturedErrors.push(error);
    return error instanceof Error ? error.message : String(error ?? 'Unknown error');
  },
}));

describe('plant command', () => {
  beforeEach(() => {
    vi.resetModules();
    loggedFetchMock.mockClear();
    plantResponses.clear();
    plantRequests.length = 0;
    capturedErrors.length = 0;
    process.env.N8N_PLANT_API_URL = 'https://n8n.example/plant';
    process.env.N8N_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a plant and uploads an initial photo', async () => {
    plantResponses.set('create', () =>
      okResponse({
        id: 17,
        name: 'Monstera',
        species: 'Deliciosa',
        state: 'ok',
        notes: 'Keep soil lightly moist.',
      }),
    );
    plantResponses.set('photo.add', () =>
      okResponse({ imageUrl: 'https://img.example/photo.jpg' }),
    );
    plantResponses.set('update', () => okResponse({}));

    const attachment = { url: 'https://cdn.discordapp.com/image.png' } as Attachment;
    const { interaction, editReply, deferReply } = createInteractionMock({
      subcommand: 'add',
      stringOptions: {
        name: 'Monstera',
        species: 'Deliciosa',
        location: 'Living Room',
        light: 'bright',
        notes: 'Mist twice a week',
      },
      integerOptions: { water_interval_days: 7 },
      attachmentOptions: { photo: attachment },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledTimes(1);

    const actions = plantRequests.map((req) => req.body.action);
    expect(actions).toEqual(['create', 'photo.add', 'update']);

    expect(capturedErrors).toHaveLength(0);
    const replyCall = editReply.mock.calls[0][0];
    expect(typeof replyCall).toBe('object');
    const replyPayload = replyCall as { content: string; embeds: unknown[] };
    expect(replyPayload.content).toContain('🌱 Added **Monstera** (ID 17)');
    expect(Array.isArray(replyPayload.embeds)).toBe(true);
  });

  it('lists plants and formats the response', async () => {
    plantResponses.set('list', () =>
      okResponse([
        {
          id: 1,
          name: 'Snake Plant',
          species: 'Sansevieria',
          next_water_due_at: '2024-01-01T00:00:00Z',
          notes: 'Prefers bright indirect light.',
        },
        {
          id: 2,
          name: 'ZZ Plant',
          species: 'Zamioculcas',
          next_water_due_at: '2024-02-01T00:00:00Z',
          notes: 'Tolerates low light.',
        },
      ]),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'list',
      stringOptions: { location: 'Office' },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(plantRequests.map((req) => req.body.action)).toEqual(['list']);
    expect(capturedErrors).toHaveLength(0);
    const replyCall = editReply.mock.calls[0][0];
    expect(typeof replyCall).toBe('object');
    expect(replyCall).toMatchObject({ content: expect.stringContaining('You have **2** plants') });
  });

  it('informs user when no plants exist', async () => {
    plantResponses.set('list', () => okResponse([]));

    const { interaction, editReply } = createInteractionMock({ subcommand: 'list' });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('No plants found yet. Add one with `/plant add`.');
  });

  it('updates watering reminders via the API', async () => {
    plantResponses.set('reminder.set', () =>
      okResponse({ id: 9, name: 'Pothos', next_water_due_at: '2024-03-02T00:00:00Z' }),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'reminder',
      integerOptions: { id: 9, water_interval_days: 5 },
      booleanOptions: { enabled: true },
      stringOptions: { time: '09:00' },
      channelOptions: { channel: { id: 'channel-123' } },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.stringContaining('⏰ Reminders updated for **Pothos**.'),
    );
  });

  it('surface errors from the upstream workflow', async () => {
    plantResponses.set('get', () => errorResponse('Plant not found', 404));

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'get',
      integerOptions: { id: 404 },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('❌ Plant not found');
  });

  it('retrieves a single plant by id', async () => {
    plantResponses.set('get', () =>
      okResponse({
        id: 21,
        name: 'Fiddle Leaf Fig',
        notes: 'Rotate weekly for even growth.',
      }),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'get',
      integerOptions: { id: 21 },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    const payload = editReply.mock.calls[0][0] as { embeds: unknown[] };
    expect(Array.isArray(payload.embeds)).toBe(true);
  });

  it('updates a plant record', async () => {
    plantResponses.set('update', () =>
      okResponse({
        id: 5,
        name: 'Updated Monstera',
        next_water_due_at: '2024-05-01T00:00:00Z',
        notes: 'Adjust watering based on soil moisture.',
      }),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'update',
      integerOptions: { id: 5, water_interval_days: 10 },
      stringOptions: { name: 'Updated Monstera', light: 'bright' },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('✅ Updated **Updated Monstera**'),
      }),
    );
  });

  it('deletes a plant when requested', async () => {
    plantResponses.set('delete', () => okResponse({ id: 8, name: 'Basil' }));

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'delete',
      integerOptions: { id: 8 },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('🗑️ Deleted **Basil** (ID 8).');
  });

  it('marks a plant as watered', async () => {
    plantResponses.set('water', () =>
      okResponse({
        id: 12,
        name: 'ZZ Plant',
        next_water_due_at: '2024-04-10T00:00:00Z',
        notes: 'Soil still slightly damp.',
      }),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'water',
      integerOptions: { id: 12 },
      numberOptions: { amount_l: 0.5 },
      stringOptions: { note: 'Half a liter' },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('💧 Marked watered: **ZZ Plant**'),
      }),
    );
  });

  it('provides care guidance via embed', async () => {
    plantResponses.set('care', () =>
      okResponse({
        id: 3,
        name: 'Snake Plant',
        answer: 'Water lightly every two weeks.',
        question: 'How often should I water? ',
        image_url: 'https://img.example/snake.jpg',
        location: 'Bedroom',
      }),
    );

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'care',
      integerOptions: { id: 3 },
      stringOptions: { question: 'How often should I water?' },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    const payload = editReply.mock.calls[0][0] as { embeds: unknown[] };
    expect(Array.isArray(payload.embeds)).toBe(true);
    expect(payload.embeds).toHaveLength(1);
  });

  it('requires an image or url for the photo subcommand', async () => {
    const { interaction, editReply } = createInteractionMock({
      subcommand: 'photo',
      integerOptions: { id: 4 },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('Please attach an image or provide `image_url`.');
  });

  it('uploads a plant photo via URL', async () => {
    plantResponses.set('photo.add', () =>
      okResponse({ imageUrl: 'https://cdn.example/plant.jpg' }),
    );
    plantResponses.set('update', () => okResponse({}));

    const { interaction, editReply } = createInteractionMock({
      subcommand: 'photo',
      integerOptions: { id: 6 },
      stringOptions: { image_url: 'https://cdn.discordapp.com/plant.jpg', caption: 'New growth' },
    });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      '📷 Photo added. Stored at: https://cdn.example/plant.jpg',
    );
  });

  it('handles unknown subcommands defensively', async () => {
    const { interaction, editReply, deferReply } = createInteractionMock({ subcommand: 'unknown' });

    const module = await import('../../src/features/plant/commands/command.js');
    await module.default.execute(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith('Unknown subcommand.');
  });
});
