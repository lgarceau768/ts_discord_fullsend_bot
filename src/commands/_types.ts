import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

/**
 * A helper type describing the shape of a slash command in this project. Each
 * command must export an object with the `data` describing the command
 * structure and an asynchronous `execute` function that handles incoming
 * interactions.
 */
export type SlashCommand = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};