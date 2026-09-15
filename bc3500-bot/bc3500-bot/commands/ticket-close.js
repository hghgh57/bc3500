const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { parseTopic, closeTicket } = require("../tickets.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-close")
    .setDescription("Close this ticket.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Optional reason for closing").setRequired(false)
    ),

  async execute(interaction) {
    const info = parseTopic(interaction.channel.topic);
    if (!info) {
      return interaction.reply({ content: "This command can only be used inside a ticket channel.", ephemeral: true });
    }

    const reason = interaction.options.getString("reason") || "";
    await closeTicket(interaction, reason);
  }
};
