import { SlashCommandBuilder } from "discord.js";
/**
 * Simple `/ping` slash command to test the bot. Replies with latency
 * information by measuring the difference between the received and reply
 * timestamps.
 */
const command = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with pong and latency"),
    async execute(interaction) {
        const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`🏓 Pong! Latency: ${latency}ms`);
    },
};
export default command;
