import type { ChatInputCommandInteraction, Client, Collection } from "discord.js";
import { Events } from "discord.js";

type CommandMap = Collection<string, any>;

export default (client: Client, commands: CommandMap) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction as ChatInputCommandInteraction);
    } catch (err) {
      console.error(err);
      const msg = interaction.replied || interaction.deferred
        ? interaction.editReply("There was an error while executing this command.")
        : interaction.reply({ content: "There was an error while executing this command.", ephemeral: true });
      await msg;
    }
  });
};
