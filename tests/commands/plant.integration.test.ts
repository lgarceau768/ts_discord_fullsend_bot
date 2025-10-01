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

vi.mock('../../src/utils/loggedFetch.js', () => ({
  loggedFetch: loggedFetchMock,
}));
const capturedErrors: unknown[] = [];

vi.mock('../../src/utils/errors.js', () => ({
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

    const module = await import('../../src/commands/plant.js');
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

    const module = await import('../../src/commands/plant.js');
    await module.default.execute(interaction);

    expect(plantRequests.map((req) => req.body.action)).toEqual(['list']);
    expect(capturedErrors).toHaveLength(0);
    const replyCall = editReply.mock.calls[0][0];
    expect(typeof replyCall).toBe('object');
    expect(replyCall).toMatchObject({ content: expect.stringContaining('You have **2** plants') });
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

    const module = await import('../../src/commands/plant.js');
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

    const module = await import('../../src/commands/plant.js');
    await module.default.execute(interaction);

    expect(editReply).toHaveBeenCalledWith('❌ Plant not found');
  });
});
