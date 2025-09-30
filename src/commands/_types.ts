import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

/**
 * A helper type describing the shape of a slash command in this project. Each
 * command must export an object with the `data` describing the command
 * structure and an asynchronous `execute` function that handles incoming
 * interactions.
 */
export interface SlashCommand {
  data:
    | RESTPostAPIChatInputApplicationCommandsJSONBody
    | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'>
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}
