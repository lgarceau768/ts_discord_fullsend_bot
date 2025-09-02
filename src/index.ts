import { Client, Collection, GatewayIntentBits } from "discord.js";
import pino from "pino";
import { env } from "./config.js";
import ping from "./commands/ping.js";
import search from "./commands/search.js";
import downloads from "./commands/downloads.js";
import interactionCreate from "./events/interactionCreate.js";
import ready from "./events/ready.js";
import request from "./commands/request";

const logger = pino({ level: env.LOG_LEVEL });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Register commands into a collection for easy lookup
const commands = new Collection<string, any>();
commands.set(ping.data.name, ping);
commands.set(search.data.name, search);
commands.set(downloads.data.name, downloads);
commands.set(request.data.name, request);

// Wire up event handlers
ready(client as any);
interactionCreate(client, commands);

// Log in
client
  .login(env.DISCORD_TOKEN)
  .catch((e) => {
    logger.error(e, "Failed to login");
    process.exit(1);
  });