import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { env } from "./config.js";
import ping from "./commands/ping.js";

const isGlobal = process.argv.includes("--global");
const isGuild = process.argv.includes("--guild");

if (!isGlobal && !isGuild) {
  console.log("Specify --guild (dev) or --global (prod) when running this script.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

// Collect commands dynamically (add more exports as you create them)
const commands: SlashCommandBuilder[] = [ping.data];
const body = commands.map((c) => c.toJSON());

async function main() {
  if (isGuild) {
    if (!env.DISCORD_GUILD_ID) {
      console.error("DISCORD_GUILD_ID is required for --guild registration");
      process.exit(1);
    }
    const route = Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID);
    await rest.put(route, { body });
    console.log(`✅ Registered ${commands.length} command(s) to guild ${env.DISCORD_GUILD_ID}`);
  } else if (isGlobal) {
    const route = Routes.applicationCommands(env.DISCORD_CLIENT_ID);
    await rest.put(route, { body });
    console.log(`🌍 Registered ${commands.length} global command(s)`);
    console.log("Note: global commands can take up to ~1 hour to propagate.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
