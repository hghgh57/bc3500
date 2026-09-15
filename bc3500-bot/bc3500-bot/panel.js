const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const config = require("./config.js");

function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(config.panelTitle)
    .setDescription(config.panelDescription)
    .setThumbnail(config.panelImageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(config.ticketTypes.support.buttonId)
      .setLabel(config.ticketTypes.support.label)
      .setEmoji(config.ticketTypes.support.emoji)
      .setStyle(ButtonStyle[config.ticketTypes.support.style]),
    new ButtonBuilder()
      .setCustomId(config.ticketTypes.buysell.buttonId)
      .setLabel(config.ticketTypes.buysell.label)
      .setEmoji(config.ticketTypes.buysell.emoji)
      .setStyle(ButtonStyle[config.ticketTypes.buysell.style]),
    new ButtonBuilder()
      .setCustomId(config.ticketTypes.giveaway.buttonId)
      .setLabel(config.ticketTypes.giveaway.label)
      .setEmoji(config.ticketTypes.giveaway.emoji)
      .setStyle(ButtonStyle[config.ticketTypes.giveaway.style])
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildPanel };
