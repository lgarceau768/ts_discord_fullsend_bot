import type { Client } from "discord.js";

/**
 * Event handler for the client's `ready` event. Logs a simple message
 * indicating that the bot has successfully logged in.
 */
export default (client: Client<true>) => {
  client.once("clientReady", (c) => {
    console.log(`✅ Logged in as ${c.user.tag} (id: ${c.user.id})`);
  });
};