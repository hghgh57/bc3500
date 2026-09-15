const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config.js");

function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(config.panelTitle)
    .setDescription(config.panelDescription)
    .setThumbnail(config.panelImageUrl);

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Select an option...")
    .addOptions(
      {
        label: config.ticketTypes.support.label,
        value: config.ticketTypes.support.buttonId,
        emoji: config.ticketTypes.support.emoji
      },
      {
        label: config.ticketTypes.buysell.label,
        value: config.ticketTypes.buysell.buttonId,
        emoji: config.ticketTypes.buysell.emoji
      },
      {
        label: config.ticketTypes.giveaway.label,
        value: config.ticketTypes.giveaway.buttonId,
        emoji: config.ticketTypes.giveaway.emoji
      }
    );

  const row = new ActionRowBuilder().addComponents(menu);

  return { embeds: [embed], components: [row] };
}

module.exports = { buildPanel };
