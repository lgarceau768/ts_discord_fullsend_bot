import type { Client } from "discord.js";

export default (client: Client<true>) => {
  client.once("ready", (c) => {
    console.log(`✅ Logged in as ${c.user.tag} (id: ${c.user.id})`);
  });
};
