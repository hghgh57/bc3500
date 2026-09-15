const {
  ContainerBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");
const config = require("./config.js");

function buildPanel() {
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

  const container = new ContainerBuilder()
    .setAccentColor(0x2b2d31)
    // Title + rules/description, with the panel image as a thumbnail beside it
    .addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(`## ${config.panelTitle}\n\n${config.panelDescription}`)
        )
        .setThumbnailAccessory((thumbnail) => thumbnail.setURL(config.panelImageUrl))
    )
    // Divider between the rules and the dropdown
    .addSeparatorComponents((separator) =>
      separator.setDivider(true).setSpacing(SeparatorSpacingSize.Large)
    )
    // The ticket-type dropdown, inside the same container
    .addActionRowComponents(() => row);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

module.exports = { buildPanel };
