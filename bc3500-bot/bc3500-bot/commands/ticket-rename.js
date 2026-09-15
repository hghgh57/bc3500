const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { parseTopic } = require("../tickets.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-rename")
    .setDescription("Rename this ticket channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((opt) =>
      opt.setName("name").setDescription("New channel name").setRequired(true)
    ),

  async execute(interaction) {
    const info = parseTopic(interaction.channel.topic);
    if (!info) {
      return interaction.reply({ content: "This command can only be used inside a ticket channel.", ephemeral: true });
    }

    const rawName = interaction.options.getString("name", true);
    const safeName = rawName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 90);

    if (!safeName) {
      return interaction.reply({ content: "That name isn't valid, try again.", ephemeral: true });
    }

    await interaction.channel.setName(safeName);
    await interaction.reply({ content: `Channel renamed to **${safeName}**.` });
  }
};
