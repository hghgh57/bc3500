const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { parseTopic } = require("../tickets.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-add")
    .setDescription("Add a user to this ticket.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to add to this ticket").setRequired(true)
    ),

  async execute(interaction) {
    const info = parseTopic(interaction.channel.topic);
    if (!info) {
      return interaction.reply({ content: "This command can only be used inside a ticket channel.", ephemeral: true });
    }

    const user = interaction.options.getUser("user", true);

    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    await interaction.reply({ content: `Added <@${user.id}> to this ticket.` });
  }
};
