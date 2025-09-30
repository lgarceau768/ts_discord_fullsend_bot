import { Events, type Client } from 'discord.js';

import { logger } from '../logger.js';

/**
 * Event handler for the client's `ready` event. Logs a simple message
 * indicating that the bot has successfully logged in.
 */
export default function registerReadyHandler(client: Client) {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info({ userId: readyClient.user.id }, `✅ Logged in as ${readyClient.user.tag}`);
  });
}
