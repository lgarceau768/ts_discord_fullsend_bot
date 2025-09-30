/* eslint-disable no-console */
import { Client, Collection, GatewayIntentBits } from 'discord.js';

import downloads from './commands/downloads.js';
import ping from './commands/ping.js';
import plant from './commands/plant.js';
import request from './commands/request';
import search from './commands/search.js';
import { command as watch } from './commands/watch/index.js';
import { env } from './config.js';
import interactionCreate from './events/interactionCreate.js';
import ready from './events/ready.js';
import { initPlantReminderJob } from './jobs/plantReminder';
import { logger } from './logger.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Register commands into a collection for easy lookup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const commands = new Collection<string, any>();
commands.set(ping.data.name, ping);
commands.set(search.data.name, search);
commands.set(downloads.data.name, downloads);
commands.set(request.data.name, request);
commands.set(plant.data.name, plant);
commands.set(watch.data.name, watch);

// Wire up event handlers
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
ready(client as any);
interactionCreate(client, commands);

// Log in
client.login(env.DISCORD_TOKEN).catch((e) => {
  logger.error(e, 'Failed to login');
  process.exit(1);
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
  initPlantReminderJob(client);
});
