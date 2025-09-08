import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { env } from "./config.js";
import ping from "./commands/ping.js";
import search from "./commands/search.js";
import downloads from "./commands/downloads.js";
import request from "./commands/request";
import plant from './commands/plant.js';

// Determine registration scope
const isGlobal = process.argv.includes("--global");
const isGuild = process.argv.includes("--guild");
if (!isGlobal && !isGuild) {
  console.log("Specify --guild (dev) or --global (prod) when running this script.");
  process.exit(1);
}

// Collect commands to register. Add new commands here.
// @ts-ignore
const commands: SlashCommandBuilder[] = [ping.data, search.data, downloads.data, request.data, plant.data];
const body = commands.map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

async function main() {
  if (isGuild) {
    if (!env.DISCORD_GUILD_ID) {
      console.error(
        "DISCORD_GUILD_ID is required for guild registration. Set it in your .env",
      );
      process.exit(1);
    }
    const route = Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID);
    await rest.put(route, { body });
    console.log(`✅ Registered ${commands.length} command(s) to guild ${env.DISCORD_GUILD_ID}`);
  } else if (isGlobal) {
    const route = Routes.applicationCommands(env.DISCORD_CLIENT_ID);
    await rest.put(route, { body });
    console.log(`🌍 Registered ${commands.length} global command(s)`);
    console.log("Note: global commands can take up to an hour to propagate.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});