const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const config = require("./config.js");

// Marks a channel as a ticket and remembers which type + owner it belongs to.
// Stored in the channel topic as: TICKET|<typeKey>|<ownerId>|<claimedById|none>
function buildTopic(typeKey, ownerId, claimedById) {
  return `TICKET|${typeKey}|${ownerId}|${claimedById || "none"}`;
}

function parseTopic(topic) {
  if (!topic || !topic.startsWith("TICKET|")) return null;
  const [, typeKey, ownerId, claimedById] = topic.split("|");
  return { typeKey, ownerId, claimedById: claimedById === "none" ? null : claimedById };
}

function ticketActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("Claim").setStyle(ButtonStyle.Primary)
  );
}

function findExistingTicket(guild, typeKey, userId) {
  return guild.channels.cache.find((ch) => {
    if (ch.type !== ChannelType.GuildText) return false;
    const info = parseTopic(ch.topic);
    return info && info.typeKey === typeKey && info.ownerId === userId;
  });
}

// Creates the ticket channel, sets permissions, pings the role, and posts
// the info embed + Close/Claim buttons. `fields` is an array of {name, value}
// pulled from a modal, or empty for tickets with no questions (Support).
async function createTicketChannel({ interaction, typeKey, user, fields }) {
  const type = config.ticketTypes[typeKey];
  const guild = interaction.guild;

  const existing = findExistingTicket(guild, typeKey, user.id);
  if (existing) {
    return { alreadyExists: true, channel: existing };
  }

  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  const channelName = `${type.channelPrefix}-${safeName}`;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  if (type.roleId && type.roleId !== `PUT_${typeKey.toUpperCase()}_ROLE_ID_HERE`) {
    overwrites.push({
      id: type.roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const channelOptions = {
    name: channelName,
    type: ChannelType.GuildText,
    topic: buildTopic(typeKey, user.id, null),
    permissionOverwrites: overwrites
  };

  const validCategory = type.categoryId && !type.categoryId.startsWith("PUT_");
  if (validCategory) channelOptions.parent = type.categoryId;

  const channel = await guild.channels.create(channelOptions);

  const embed = new EmbedBuilder()
    .setColor(type.color)
    .setTitle(`${type.emoji} ${type.label}`)
    .setDescription(`Ticket opened by <@${user.id}>.`)
    .setTimestamp();

  if (fields && fields.length) {
    embed.addFields(fields);
  }

  const pingRole =
    type.roleId && !type.roleId.startsWith("PUT_") ? `<@&${type.roleId}> ` : "";

  await channel.send({
    content: `${pingRole}<@${user.id}>`,
    embeds: [embed],
    components: [ticketActionRow()]
  });

  return { alreadyExists: false, channel };
}

// ---------- Modals ----------

function buildBuySellModal() {
  return new ModalBuilder()
    .setCustomId("modal_buysell")
    .setTitle("Buy/Sell Spawners")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("bs_direction")
          .setLabel("Are you buying or selling?")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Im buying")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("bs_quantity")
          .setLabel("Quantity of spawners?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("bs_ign")
          .setLabel("Whats your IGN?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function buildGiveawayModal() {
  return new ModalBuilder()
    .setCustomId("modal_giveaway")
    .setTitle("Giveaway Claim/Sponsor")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("gw_type")
          .setLabel("Giveaway claim or sponsor?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("gw_won")
          .setLabel("How much did you win? (optional)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("If that's the case")
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("gw_sponsor")
          .setLabel("How much are you sponsoring? (optional)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("If that's the case")
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("gw_ign")
          .setLabel("Whats your IGN?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function buildCloseReasonModal() {
  return new ModalBuilder()
    .setCustomId("modal_close_reason")
    .setTitle("Close Ticket")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("close_reason")
          .setLabel("Reason (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );
}

// ---------- Claim / Close ----------

async function claimTicket(interaction) {
  const channel = interaction.channel;
  const info = parseTopic(channel.topic);
  if (!info) {
    return interaction.reply({ content: "This isn't a ticket channel.", ephemeral: true });
  }
  if (info.claimedById) {
    return interaction.reply({
      content: `This ticket is already claimed by <@${info.claimedById}>.`,
      ephemeral: true
    });
  }

  await channel.setTopic(buildTopic(info.typeKey, info.ownerId, interaction.user.id));

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close").setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel(`Claimed by ${interaction.user.username}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  await interaction.update({ components: [disabledRow] }).catch(async () => {
    // If the original interaction can't be updated (e.g. permissions changed), fall back
    await interaction.message.edit({ components: [disabledRow] });
  });

  await channel.send({ content: `🔧 Ticket claimed by <@${interaction.user.id}>.` });
}

async function closeTicket(interaction, reason) {
  const channel = interaction.channel;
  const info = parseTopic(channel.topic);
  if (!info) {
    return interaction.reply({ content: "This isn't a ticket channel.", ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Ticket Closed")
    .addFields(
      { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Reason", value: reason && reason.trim().length ? reason : "No reason provided", inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  if (config.logChannelId) {
    const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
      const logEmbed = EmbedBuilder.from(embed).setTitle(`Ticket Closed: #${channel.name}`);
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }

  setTimeout(() => {
    channel.delete(`Ticket closed by ${interaction.user.tag}${reason ? `: ${reason}` : ""}`).catch(() => {});
  }, 5000);
}

module.exports = {
  buildTopic,
  parseTopic,
  ticketActionRow,
  findExistingTicket,
  createTicketChannel,
  buildBuySellModal,
  buildGiveawayModal,
  buildCloseReasonModal,
  claimTicket,
  closeTicket
};
