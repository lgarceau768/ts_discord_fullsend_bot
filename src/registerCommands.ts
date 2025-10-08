import {
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type SlashCommandBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

import { env } from './core/config.js';
import { logger } from './core/logger.js';
import type { SlashCommand } from './core/types/commands.js';
import downloads from './features/downloads/commands/command.js';
import lego from './features/lego/commands/command.js';
import penny from './features/penny/commands/penny/index.js';
import ping from './features/ping/commands/command.js';
import plant from './features/plant/commands/command.js';
import request from './features/request/commands/command.js';
import search from './features/search/commands/command.js';
import target from './features/target/commands/command.js';
import watch from './features/watch/commands/watch/index.js';

// Determine registration scope
const isGlobal = process.argv.includes('--global');
const isGuild = process.argv.includes('--guild');
if (!isGlobal && !isGuild) {
  logger.error('Specify --guild (dev) or --global (prod) when running this script.');
  process.exit(1);
}

// Collect commands to register. Add new commands here.
const commands: SlashCommand[] = [
  ping,
  search,
  downloads,
  request,
  plant,
  lego,
  target,
  penny,
  watch,
];

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
    const response = (await rest.put(route, { body })) as unknown[];
    logger.info(`🌍 Registered ${response.length} global command(s)`);
    logger.info('Note: global commands can take up to an hour to propagate.');
  }
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
