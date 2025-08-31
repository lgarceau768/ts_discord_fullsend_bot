import { SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "./_types.js";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with pong + latency"),
  async execute(interaction) {
    const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Latency: ${latency}ms`);
  }
};

export default command;
