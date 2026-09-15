const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildPanel } = require("../panel.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post the BC3500 ticket panel in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.channel.send(buildPanel());
    await interaction.reply({ content: "Panel posted.", ephemeral: true });
  }
};
