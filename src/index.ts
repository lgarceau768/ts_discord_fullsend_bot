import { Client, Collection, GatewayIntentBits } from "discord.js";
import pino from "pino";
import { env } from "./config.js";
import ping from "./commands/ping.js";
import interactionCreate from "./events/interactionCreate.js";
import ready from "./events/ready.js";

const logger = pino({ level: env.LOG_LEVEL });

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = new Collection<string, any>();
commands.set(ping.data.name, ping);

// wire events
ready(client as any);
interactionCreate(client, commands);

// start
client.login(env.DISCORD_TOKEN).catch((e) => {
  logger.error(e, "Failed to login");
  process.exit(1);
});
