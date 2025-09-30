import {
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type SlashCommandBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

import type { SlashCommand } from './commands/_types.js';
import downloads from './commands/downloads.js';
import ping from './commands/ping.js';
import plant from './commands/plant.js';
import request from './commands/request';
import search from './commands/search.js';
import watch from './commands/watch/index.js';
import { env } from './config.js';
import { logger } from './logger.js';

// Determine registration scope
const isGlobal = process.argv.includes('--global');
const isGuild = process.argv.includes('--guild');
if (!isGlobal && !isGuild) {
  logger.error('Specify --guild (dev) or --global (prod) when running this script.');
  process.exit(1);
}

// Collect commands to register. Add new commands here.
const commands: SlashCommand[] = [ping, search, downloads, request, plant, watch];

const hasToJSON = (
  data: SlashCommand['data'],
): data is SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder =>
  typeof (data as SlashCommandBuilder).toJSON === 'function';

const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = commands.map((command) =>
  hasToJSON(command.data)
    ? command.data.toJSON()
    : (command.data as RESTPostAPIChatInputApplicationCommandsJSONBody),
);

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

async function main() {
  if (isGuild) {
    if (!env.DISCORD_GUILD_ID) {
      logger.error('DISCORD_GUILD_ID is required for guild registration. Set it in your .env');
      process.exit(1);
    }
    const route = Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID);
    await rest.put(route, { body });
    logger.info(`✅ Registered ${commands.length} command(s) to guild ${env.DISCORD_GUILD_ID}`);
  } else if (isGlobal) {
    const route = Routes.applicationCommands(env.DISCORD_CLIENT_ID);
    await rest.put(route, { body });
    logger.info(`🌍 Registered ${commands.length} global command(s)`);
    logger.info('Note: global commands can take up to an hour to propagate.');
  }
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
