import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

import type { SlashCommand } from '../../../../core/types/commands.js';

import {
  configureRecentSubcommand,
  handleRecentSubcommand,
  RECENT_SUBCOMMAND_NAME,
} from './recent.js';
import {
  configureSearchSubcommand,
  handleSearchSubcommand,
  SEARCH_SUBCOMMAND_NAME,
} from './search.js';
import {
  configureStatusSubcommand,
  handleStatusSubcommand,
  STATUS_SUBCOMMAND_NAME,
} from './status.js';
import {
  configureSubscribeSubcommand,
  handleSubscribeSubcommand,
  SUBSCRIBE_SUBCOMMAND_NAME,
} from './subscribe.js';
import {
  configureUnsubscribeSubcommand,
  handleUnsubscribeSubcommand,
  UNSUBSCRIBE_SUBCOMMAND_NAME,
} from './unsubscribe.js';

const data: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
  .setName('penny')
  .setDescription('Manage penny deal discovery and alerts')
  .addSubcommand((sub) => configureSearchSubcommand(sub))
  .addSubcommand((sub) => configureRecentSubcommand(sub))
  .addSubcommand((sub) => configureSubscribeSubcommand(sub))
  .addSubcommand((sub) => configureUnsubscribeSubcommand(sub))
  .addSubcommand((sub) => configureStatusSubcommand(sub));

const SUBCOMMAND_HANDLERS: Record<
  string,
  (interaction: ChatInputCommandInteraction) => Promise<void>
> = {
  [SEARCH_SUBCOMMAND_NAME]: handleSearchSubcommand,
  [RECENT_SUBCOMMAND_NAME]: handleRecentSubcommand,
  [SUBSCRIBE_SUBCOMMAND_NAME]: handleSubscribeSubcommand,
  [UNSUBSCRIBE_SUBCOMMAND_NAME]: handleUnsubscribeSubcommand,
  [STATUS_SUBCOMMAND_NAME]: handleStatusSubcommand,
};

const penny: SlashCommand = {
  data,
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(true);
    const handler = SUBCOMMAND_HANDLERS[subcommand];

    if (!handler) {
      await interaction.reply({ content: 'Unsupported penny subcommand.', ephemeral: true });
      return;
    }

    await handler(interaction);
  },
};

export default penny;
