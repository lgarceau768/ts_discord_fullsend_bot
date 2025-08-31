import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export type SlashCommand = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
