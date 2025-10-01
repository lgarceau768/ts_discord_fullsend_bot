import {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  type Attachment,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { ApiResponse, PlantCareAnswer, PlantRecord, LightLevel } from '../types/plant.js';
import { getErrorMessage } from '../utils/errors.js';
import { loggedFetch } from '../utils/loggedFetch.js';

import type { SlashCommand } from './_types.js';

const PLANT_API = process.env.N8N_PLANT_API_URL;
const N8N_KEY = process.env.N8N_API_KEY ?? '';

/** Shared option accessors (minimize repetition & branching inside handlers) */
const opt = {
  str: (i: ChatInputCommandInteraction, name: string, required = false) =>
    i.options.getString(name, required) ?? undefined,
  int: (i: ChatInputCommandInteraction, name: string, required = false) =>
    i.options.getInteger(name, required) ?? undefined,
  num: (i: ChatInputCommandInteraction, name: string, required = false) =>
    i.options.getNumber(name, required) ?? undefined,
  att: (i: ChatInputCommandInteraction, name: string) => i.options.getAttachment(name) ?? undefined,
  bool: (i: ChatInputCommandInteraction, name: string) => i.options.getBoolean(name) ?? undefined,
  channelIdOverride: (i: ChatInputCommandInteraction, name: string) =>
    i.options.getChannel(name)?.id,
};

/** Post JSON to n8n plant API. You route actions inside n8n. */
async function plantApi<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  if (!PLANT_API) return { ok: false, error: 'N8N_PLANT_API_URL is not configured' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (N8N_KEY) headers.Authorization = `Bearer ${N8N_KEY}`;

  const res = await loggedFetch(PLANT_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return res.ok
      ? { ok: true, data: text as unknown as T }
      : { ok: false, error: text || res.statusText };
  }

  const record = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  if (!res.ok) {
    const errorMessage = typeof record.error === 'string' ? record.error : res.statusText;
    return { ok: false, error: errorMessage };
  }
  if (record.ok === false) {
    const errorMessage = typeof record.error === 'string' ? record.error : 'Upstream error';
    return { ok: false, error: errorMessage };
  }
  const dataField = record.data ?? record;
  return { ok: true, data: dataField as T };
}

function toDate(inStr: string | undefined): string {
  if (!inStr) return '—';
  const iso = inStr.replaceAll('"', '').trim();
  const [datePart, timePartRaw = '00:00:00'] = iso.split('T');
  const [year, month, day] = datePart.split('-').map(Number);

  const timePart = timePartRaw.replace('Z', '');
  const [time = '00:00:00', millis] = timePart.split('.');
  const [hour = 0, minute = 0, second = 0] = time.split(':').map(Number);

  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millis ? Number(millis) : 0),
  ).toLocaleDateString();
}

function truncate(t?: string, n = 300): string {
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function plantEmbed(p: PlantRecord): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle(p.name + (p.species ? ' — ' + p.species : ''))
    .setDescription(truncate(p.notes))
    .addFields(
      { name: 'Location', value: p.location ?? '—', inline: true },
      { name: 'Light', value: p.light ?? '—', inline: true },
      { name: 'State', value: p.state ?? 'ok', inline: true },
      {
        name: 'Water interval',
        value: p.water_interval_days ? `${p.water_interval_days}d` : '—',
        inline: true,
      },
      { name: 'Last watered', value: toDate(p.last_watered_at), inline: true },
      { name: 'Next due', value: toDate(p.next_water_due_at), inline: true },
    )
    .setFooter({ text: `ID ${p.id}` });

  const thumb = p.photoUrl ?? p.image_url;
  if (thumb) e.setThumbnail(thumb);

  if (p.notes) e.addFields({ name: 'Notes', value: p.notes, inline: false });
  return e;
}

/** Upload an image by telling n8n to fetch the Discord attachment URL (or a direct URL) */
async function uploadPhotoViaN8n(opts: {
  plantId: number;
  userId: string;
  attachment?: Attachment | null;
  image_url?: string | null;
  caption?: string | null;
}): Promise<ApiResponse<{ imageUrl: string }>> {
  let imageUrl = opts.image_url?.trim();
  if (!imageUrl && opts.attachment) imageUrl = opts.attachment.url;
  if (!imageUrl) return { ok: false, error: 'No image supplied' };

  return plantApi('photo.add', {
    plantId: opts.plantId,
    userId: opts.userId,
    imageUrl,
    caption: opts.caption ?? undefined,
  });
}

/** Shared context */
const getCtx = (i: ChatInputCommandInteraction) => ({
  userId: i.user.id,
  guildId: i.guildId ?? 'DM',
  channelId: i.channelId,
});

/** ============ Handlers (each < 15 CC) ============ */

async function handleAdd(i: ChatInputCommandInteraction): Promise<void> {
  const { userId, guildId, channelId } = getCtx(i);

  const name = opt.str(i, 'name', true);
  if (!name) throw new Error('Plant name is required.');
  const species = opt.str(i, 'species');
  const location = opt.str(i, 'location');
  const light = (opt.str(i, 'light') as LightLevel | undefined) ?? undefined;
  const waterIntervalDays = opt.int(i, 'water_interval_days');
  const notes = opt.str(i, 'notes');
  const photo = opt.att(i, 'photo');

  const created = await plantApi<PlantRecord>('create', {
    userId,
    guildId,
    channelId,
    name,
    species,
    location,
    light,
    waterIntervalDays,
    notes,
  });
  if (!created.ok) throw new Error(created.error);
  const plant = created.data;

  if (photo) {
    const uploaded = await uploadPhotoViaN8n({
      plantId: plant.id,
      userId,
      attachment: photo,
      image_url: null,
      caption: 'Initial photo',
    });
    if (uploaded.ok) {
      await plantApi('update', { id: plant.id, userId, photoUrl: uploaded.data.imageUrl });
      plant.photoUrl = uploaded.data.imageUrl;
    }
  }

  await i.editReply({
    content: `🌱 Added **${plant.name}** (ID ${plant.id}).`,
    embeds: [plantEmbed(plant)],
  });
}

async function handleGet(i: ChatInputCommandInteraction): Promise<void> {
  const { userId } = getCtx(i);
  const id = opt.int(i, 'id', true);
  if (id === undefined || id === null) throw new Error('Plant ID is required.');

  const resp = await plantApi<PlantRecord>('get', { id, userId });
  if (!resp.ok) throw new Error(resp.error);

  await i.editReply({ embeds: [plantEmbed(resp.data)] });
}

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  const { userId } = getCtx(i);
  const species = opt.str(i, 'species');
  const location = opt.str(i, 'location');

  const resp = await plantApi<PlantRecord[]>('list', { userId, species, location });
  if (!resp.ok) throw new Error(resp.error);

  const items = resp.data ?? [];
  if (items.length === 0) {
    await i.editReply('No plants found yet. Add one with `/plant add`.');
    return;
  }

  const lines = items
    .slice(0, 10)
    .map(
      (p) =>
        `• **${p.name}** (ID ${p.id}) — ${p.species ?? 'unknown'} — next due: ${toDate(p.next_water_due_at)}`,
    );

  await i.editReply({
    content: `You have **${items.length}** plant${items.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
    embeds: items.slice(0, 5).map(plantEmbed),
  });
}

async function handleUpdate(i: ChatInputCommandInteraction): Promise<void> {
  const { userId } = getCtx(i);
  const id = opt.int(i, 'id', true);
  if (id === undefined || id === null) throw new Error('Plant ID is required.');

  const payload = {
    id,
    userId,
    name: opt.str(i, 'name'),
    species: opt.str(i, 'species'),
    location: opt.str(i, 'location'),
    light: (opt.str(i, 'light') as LightLevel | undefined) ?? undefined,
    waterIntervalDays: opt.int(i, 'water_interval_days'),
    notes: opt.str(i, 'notes'),
  };

  const resp = await plantApi<PlantRecord>('update', payload);
  if (!resp.ok) throw new Error(resp.error);

  await i.editReply({
    content: `✅ Updated **${resp.data.name}** (ID ${resp.data.id}).`,
    embeds: [plantEmbed(resp.data)],
  });
}

async function handleDelete(i: ChatInputCommandInteraction): Promise<void> {
  const { userId } = getCtx(i);
  const id = opt.int(i, 'id', true);
  if (id === undefined || id === null) throw new Error('Plant ID is required.');

  const resp = await plantApi<PlantRecord>('delete', { id, userId });
  if (!resp.ok) throw new Error(resp.error);

  await i.editReply(`🗑️ Deleted **${resp.data.name}** (ID ${resp.data.id}).`);
}

async function handleWater(i: ChatInputCommandInteraction): Promise<void> {
  const { userId } = getCtx(i);
  const id = opt.int(i, 'id', true);
  if (id === undefined || id === null) throw new Error('Plant ID is required.');
  const amountL = opt.num(i, 'amount_l');
  const note = opt.str(i, 'note');

  const resp = await plantApi<PlantRecord>('water', { id, userId, amountL, note });
  if (!resp.ok) throw new Error(resp.error);

  await i.editReply({
    content: `💧 Marked watered: **${resp.data.name}**. Next due **${toDate(resp.data.next_water_due_at)}**.`,
    embeds: [plantEmbed(resp.data)],
  });
}

async function handleCare(i: ChatInputCommandInteraction): Promise<void> {
  const { userId } = getCtx(i);
  const id = opt.int(i, 'id', true);
  if (id === undefined || id === null) throw new Error('Plant ID is required.');
  const question = opt.str(i, 'question', true);
  if (!question) throw new Error('Question is required.');

  const resp = await plantApi<PlantCareAnswer>('care', {
    userId,
    id,
    question,
    now: Date.now(),
  });
  if (!resp.ok) throw new Error(resp.error);

  const data = resp.data;
  const name = data.name ?? `Plant ${id}`;
  const thumb = data.image_url ?? data.imageUrl ?? undefined;

  const ANSWER_LIMIT = 4000;
  const answer = (data.answer ?? '').slice(0, ANSWER_LIMIT);
  const q = data.question ?? question;

  const embed = new EmbedBuilder()
    .setTitle(`🌿 Care plan — ${name} (ID ${id})`)
    .setDescription([`**Question**`, q, '', `**Answer**`, answer].join('\n'))
    .setFooter({ text: data.location ? `Location: ${data.location}` : 'Plant care' });

  if (thumb) embed.setThumbnail(thumb);

  await i.editReply({ embeds: [embed] });
}

async function handlePhoto(i: ChatInputCommandInteraction): Promise<void> {
  const { userId } = getCtx(i);
  const id = opt.int(i, 'id', true);
  if (id === undefined || id === null) throw new Error('Plant ID is required.');
  const image = opt.att(i, 'image');
  const imageUrl = opt.str(i, 'image_url');
  const caption = opt.str(i, 'caption');

  if (!image && !imageUrl) {
    await i.editReply('Please attach an image or provide `image_url`.');
    return;
  }

  const uploaded = await uploadPhotoViaN8n({
    plantId: id,
    userId,
    attachment: image,
    image_url: imageUrl ?? null,
    caption: caption ?? null,
  });
  if (!uploaded.ok) throw new Error(uploaded.error);

  await plantApi('update', { id, userId, photoUrl: uploaded.data.imageUrl });

  await i.editReply(`📷 Photo added. Stored at: ${uploaded.data.imageUrl}`);
}

async function handleReminder(i: ChatInputCommandInteraction): Promise<void> {
  const { userId, guildId } = getCtx(i);
  const id = opt.int(i, 'id', true);
  if (id === undefined || id === null) throw new Error('Plant ID is required.');
  const enabled = opt.bool(i, 'enabled');
  const waterIntervalDays = opt.int(i, 'water_interval_days');
  const time = opt.str(i, 'time');
  const channelId = opt.channelIdOverride(i, 'channel') ?? i.channelId;

  const resp = await plantApi<PlantRecord>('reminder.set', {
    id,
    userId,
    enabled,
    waterIntervalDays,
    time,
    channelId,
    guildId,
  });
  if (!resp.ok) throw new Error(resp.error);

  const cadence = waterIntervalDays ? `Cadence: every ${waterIntervalDays}d. ` : '';
  const atTime = time ? `Time: ${time}. ` : '';
  await i.editReply(
    `⏰ Reminders ${enabled === false ? 'disabled' : 'updated'} for **${resp.data.name}**. ${cadence}${atTime}`,
  );
}

/** ============ Slash command ============ */

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('plant')
    .setDescription('Manage your indoor plants (CRUD, photos, water logs, reminders)')
    // group: basic CRUD
    .addSubcommand((sc) =>
      sc
        .setName('add')
        .setDescription('Add a new plant')
        .addStringOption((o) => o.setName('name').setDescription('Given name').setRequired(true))
        .addStringOption((o) => o.setName('species').setDescription('Species / cultivar'))
        .addStringOption((o) =>
          o.setName('location').setDescription('Where it lives (room, shelf, etc.)'),
        )
        .addStringOption((o) =>
          o
            .setName('light')
            .setDescription('Light level')
            .addChoices(
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'Bright (indirect)', value: 'bright' },
              { name: 'Direct sun', value: 'direct' },
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName('water_interval_days')
            .setDescription('Watering cadence in days (e.g., 7)')
            .setMinValue(1),
        )
        .addStringOption((o) => o.setName('notes').setDescription('Care notes'))
        .addAttachmentOption((o) => o.setName('photo').setDescription('Initial photo')),
    )
    .addSubcommand((sc) =>
      sc
        .setName('care')
        .setDescription('Ask a care question about a plant and get a tailored plan')
        .addIntegerOption((o) => o.setName('id').setDescription('Plant ID').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('question')
            .setDescription('Your question about this plant (e.g., repot? watering? light?)')
            .setRequired(true)
            .setMaxLength(4000),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('get')
        .setDescription('Show one plant')
        .addIntegerOption((o) => o.setName('id').setDescription('Plant ID').setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName('list')
        .setDescription('List plants')
        .addStringOption((o) => o.setName('location').setDescription('Filter by location'))
        .addStringOption((o) => o.setName('species').setDescription('Filter by species')),
    )
    .addSubcommand((sc) =>
      sc
        .setName('update')
        .setDescription('Update fields on a plant')
        .addIntegerOption((o) => o.setName('id').setDescription('Plant ID').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('New name'))
        .addStringOption((o) => o.setName('species').setDescription('New species'))
        .addStringOption((o) => o.setName('location').setDescription('New location'))
        .addStringOption((o) =>
          o
            .setName('light')
            .setDescription('Light level')
            .addChoices(
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'Bright (indirect)', value: 'bright' },
              { name: 'Direct sun', value: 'direct' },
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName('water_interval_days')
            .setDescription('New watering cadence (days)')
            .setMinValue(1),
        )
        .addStringOption((o) => o.setName('notes').setDescription('Replace notes')),
    )
    .addSubcommand((sc) =>
      sc
        .setName('delete')
        .setDescription('Delete a plant')
        .addIntegerOption((o) => o.setName('id').setDescription('Plant ID').setRequired(true)),
    )
    // group: care actions
    .addSubcommand((sc) =>
      sc
        .setName('water')
        .setDescription('Mark plant as watered (updates next due date)')
        .addIntegerOption((o) => o.setName('id').setDescription('Plant ID').setRequired(true))
        .addNumberOption((o) => o.setName('amount_l').setDescription('Water amount (liters)'))
        .addStringOption((o) => o.setName('note').setDescription('Watering note')),
    )
    .addSubcommand((sc) =>
      sc
        .setName('photo')
        .setDescription('Attach a new photo to a plant (stored via n8n)')
        .addIntegerOption((o) => o.setName('id').setDescription('Plant ID').setRequired(true))
        .addAttachmentOption((o) => o.setName('image').setDescription('Upload photo'))
        .addStringOption((o) => o.setName('image_url').setDescription('Or link a photo URL'))
        .addStringOption((o) =>
          o.setName('caption').setDescription('Caption/notes for this photo'),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('reminder')
        .setDescription('Configure watering reminders for a plant')
        .addIntegerOption((o) => o.setName('id').setDescription('Plant ID').setRequired(true))
        .addBooleanOption((o) => o.setName('enabled').setDescription('Turn reminders on/off'))
        .addIntegerOption((o) =>
          o
            .setName('water_interval_days')
            .setDescription('Override watering cadence (days)')
            .setMinValue(1),
        )
        .addStringOption((o) => o.setName('time').setDescription('Local time like 09:00 or 18:30'))
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Channel to post reminders to')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
            ),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand(true);
    const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
      add: handleAdd,
      get: handleGet,
      list: handleList,
      update: handleUpdate,
      delete: handleDelete,
      water: handleWater,
      care: handleCare,
      photo: handlePhoto,
      reminder: handleReminder,
    };

    const handler = handlers[sub];
    if (!handler) {
      await interaction.editReply('Unknown subcommand.');
      return;
    }

    try {
      await handler(interaction);
    } catch (err: unknown) {
      await interaction.editReply(`❌ ${getErrorMessage(err)}`);
    }
  },
};

export default command;
