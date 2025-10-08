import { Client, Collection, GatewayIntentBits } from 'discord.js';

import { env } from './core/config.js';
import interactionCreate from './core/events/interactionCreate.js';
import ready from './core/events/ready.js';
import { logger } from './core/logger.js';
import type { SlashCommand } from './core/types/commands.js';
import downloads from './features/downloads/commands/command.js';
import lego from './features/lego/commands/command.js';
import ping from './features/ping/commands/command.js';
import plant from './features/plant/commands/command.js';
import { initPlantReminderJob } from './features/plant/jobs/plantReminder.js';
import request from './features/request/commands/command.js';
import search from './features/search/commands/command.js';
import target from './features/target/commands/command.js';
import watch from './features/watch/commands/watch/index.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Register commands into a collection for easy lookup
const commands = new Collection<string, SlashCommand>();
commands.set(ping.data.name, ping);
commands.set(search.data.name, search);
commands.set(downloads.data.name, downloads);
commands.set(request.data.name, request);
commands.set(lego.data.name, lego);
commands.set(plant.data.name, plant);
commands.set(target.data.name, target);
commands.set(watch.data.name, watch);

// Wire up event handlers
ready(client);
interactionCreate(client, commands);

// Log in
client.login(env.DISCORD_TOKEN).catch((e) => {
  logger.error(e, 'Failed to login');
  process.exit(1);
});

client.once('ready', () => {
  logger.info({ userId: client.user?.id }, `Logged in as ${client.user?.tag}`);
  initPlantReminderJob(client);
});
