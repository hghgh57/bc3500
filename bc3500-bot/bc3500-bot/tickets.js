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
// Stored in the channel topic as:
// TICKET|<typeKey>|<ownerId>|<claimedById|none>|<giveawayChecked: checked|unchecked>|<supportChecked: checked|unchecked>
// The giveawayChecked field only matters for "giveaway" tickets - it remembers
// whether we've already run the giveaway win check for this ticket. The
// supportChecked field only matters for "support" tickets - it remembers
// whether staff have already hit the ✅ Check button, so the channel only
// gets the "checked-" prefix once.
function buildTopic(typeKey, ownerId, claimedById, giveawayChecked, supportChecked) {
  return `TICKET|${typeKey}|${ownerId}|${claimedById || "none"}|${giveawayChecked ? "checked" : "unchecked"}|${
    supportChecked ? "checked" : "unchecked"
  }`;
}

function parseTopic(topic) {
  if (!topic || !topic.startsWith("TICKET|")) return null;
  const [, typeKey, ownerId, claimedById, giveawayChecked, supportChecked] = topic.split("|");
  return {
    typeKey,
    ownerId,
    claimedById: claimedById === "none" ? null : claimedById,
    giveawayChecked: giveawayChecked === "checked",
    supportChecked: supportChecked === "checked"
  };
}

// The green "✅ Check" button shown on support tickets. Turns into a
// disabled "✅ Checked" once used.
function buildCheckButton(checked) {
  return new ButtonBuilder()
    .setCustomId("ticket_check")
    .setLabel(checked ? "Checked" : "Check")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success)
    .setDisabled(Boolean(checked));
}

function ticketActionRow(typeKey, checked) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("Claim").setStyle(ButtonStyle.Primary)
  );
  if (typeKey === "support") {
    row.addComponents(buildCheckButton(checked));
  }
  return row;
}

// Row shown once a ticket has been claimed: Close stays the same, but the
// Claim button turns into an (enabled) Unclaim button so the claimer (or
// another staff member) can release it again.
function claimedActionRow(claimerUsername, typeKey, checked) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close").setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_unclaim")
      .setLabel(`Claimed by ${claimerUsername} (Unclaim)`)
      .setStyle(ButtonStyle.Secondary)
  );
  if (typeKey === "support") {
    row.addComponents(buildCheckButton(checked));
  }
  return row;
}

// Sends a log embed to config.logChannelId, if one is configured. Used for
// ticket claims, unclaims, renames, and closes so staff have one place to
// audit ticket activity.
async function logEvent(guild, { title, description, color, fields }) {
  if (!config.logChannelId) return;
  const logChannel = guild.channels.cache.get(config.logChannelId);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(color || 0x2b2d31)
    .setTitle(title)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (fields && fields.length) embed.addFields(fields);

  await logChannel.send({ embeds: [embed] }).catch(() => {});
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
    topic: buildTopic(typeKey, user.id, null, false, false),
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
    components: [ticketActionRow(typeKey, false)]
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

function buildSupportModal() {
  return new ModalBuilder()
    .setCustomId("modal_support")
    .setTitle("Support")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("support_issue")
          .setLabel("What do you need help with?")
          .setStyle(TextInputStyle.Paragraph)
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

  await channel.setTopic(buildTopic(info.typeKey, info.ownerId, interaction.user.id, info.giveawayChecked, info.supportChecked));

  const claimedRow = claimedActionRow(interaction.user.username, info.typeKey, info.supportChecked);

  await interaction.update({ components: [claimedRow] }).catch(async () => {
    // If the original interaction can't be updated (e.g. permissions changed), fall back
    await interaction.message.edit({ components: [claimedRow] });
  });

  await channel.send({ content: `🔧 Ticket claimed by <@${interaction.user.id}>.` });

  await logEvent(interaction.guild, {
    title: `Ticket Claimed: #${channel.name}`,
    color: 0x5865f2,
    fields: [{ name: "Claimed by", value: `<@${interaction.user.id}>`, inline: true }]
  });
}

async function unclaimTicket(interaction) {
  const channel = interaction.channel;
  const info = parseTopic(channel.topic);
  if (!info) {
    return interaction.reply({ content: "This isn't a ticket channel.", ephemeral: true });
  }
  if (!info.claimedById) {
    return interaction.reply({ content: "This ticket isn't claimed.", ephemeral: true });
  }

  const previousClaimerId = info.claimedById;

  await channel.setTopic(buildTopic(info.typeKey, info.ownerId, null, info.giveawayChecked, info.supportChecked));

  const openRow = ticketActionRow(info.typeKey, info.supportChecked);

  await interaction.update({ components: [openRow] }).catch(async () => {
    await interaction.message.edit({ components: [openRow] });
  });

  await channel.send({ content: `🔓 Ticket unclaimed by <@${interaction.user.id}>.` });

  await logEvent(interaction.guild, {
    title: `Ticket Unclaimed: #${channel.name}`,
    color: 0x99aab5,
    fields: [
      { name: "Unclaimed by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Previously claimed by", value: `<@${previousClaimerId}>`, inline: true }
    ]
  });
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
      { name: "Opened by", value: `<@${info.ownerId}>`, inline: true },
      { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Reason", value: reason && reason.trim().length ? reason : "No reason provided", inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  await logEvent(interaction.guild, {
    title: `Ticket Closed: #${channel.name}`,
    color: 0xed4245,
    fields: [
      { name: "Opened by", value: `<@${info.ownerId}>`, inline: true },
      { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Reason", value: reason && reason.trim().length ? reason : "No reason provided", inline: true }
    ]
  });

  setTimeout(() => {
    channel.delete(`Ticket closed by ${interaction.user.tag}${reason ? `: ${reason}` : ""}`).catch(() => {});
  }, 5000);
}

// ---------- Support ticket check ----------

// Handles a click on the green ✅ Check button (support tickets only):
// prefixes the channel name with ✅ once, marks it checked in the topic
// (so it can't double-prefix on repeat clicks or after a claim/unclaim
// refresh), and swaps the button for a disabled "✅ Checked".
async function checkTicket(interaction) {
  const channel = interaction.channel;
  const info = parseTopic(channel.topic);
  if (!info) {
    return interaction.reply({ content: "This isn't a ticket channel.", ephemeral: true });
  }
  if (info.typeKey !== "support") {
    return interaction.reply({ content: "This button is only for support tickets.", ephemeral: true });
  }
  if (info.supportChecked) {
    return interaction.reply({ content: "This ticket has already been checked.", ephemeral: true });
  }

  await channel.setTopic(buildTopic(info.typeKey, info.ownerId, info.claimedById, info.giveawayChecked, true));

  // Discord channel names allow most Unicode set via the API (unlike the
  // client UI's typing restrictions), so the ✅ should come through fine.
  const newName = `✅${channel.name}`.slice(0, 100);
  await channel.setName(newName).catch(() => {});

  // Rebuild the existing button row, only swapping the Check button so
  // Close/Claim (or Close/Unclaim) stay exactly as they were.
  const existingRow = interaction.message.components[0];
  const rebuiltRow = new ActionRowBuilder();
  for (const component of existingRow.components) {
    if (component.customId === "ticket_check") {
      rebuiltRow.addComponents(buildCheckButton(true));
    } else {
      rebuiltRow.addComponents(ButtonBuilder.from(component));
    }
  }

  await interaction.update({ components: [rebuiltRow] }).catch(async () => {
    await interaction.message.edit({ components: [rebuiltRow] });
  });

  await channel.send({ content: `✅ Ticket checked by <@${interaction.user.id}>.` });

  await logEvent(interaction.guild, {
    title: `Ticket Checked: #${channel.name}`,
    color: 0x57f287,
    fields: [{ name: "Checked by", value: `<@${interaction.user.id}>`, inline: true }]
  });
}

// ---------- Giveaway win check helpers ----------

// Flags this ticket's topic as "checked" so the giveaway win check only
// ever runs once per ticket, while preserving the current claim state.
async function markGiveawayChecked(channel, info) {
  await channel.setTopic(buildTopic(info.typeKey, info.ownerId, info.claimedById, true, info.supportChecked));
}

// Finds the original ticket panel message (the one with the Close/Claim
// buttons) so a Jump to Win link button can be appended to it later.
async function findTicketPanelMessage(channel) {
  const messages = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!messages) return null;

  return (
    messages.find((msg) => {
      if (msg.author.id !== channel.client.user.id) return false;
      return msg.components.some((row) =>
        row.components.some((component) => component.customId === "ticket_close")
      );
    }) || null
  );
}

// Adds a "Jump to Win" link button onto the ticket panel message, right
// next to Close/Claim (or Close/Unclaim), without disturbing those buttons.
async function addJumpToWinButton(channel, url) {
  const panelMessage = await findTicketPanelMessage(channel);
  if (!panelMessage) return;

  const existingRow = panelMessage.components[0];
  if (!existingRow) return;

  const row = ActionRowBuilder.from(existingRow);
  row.addComponents(
    new ButtonBuilder().setLabel("Jump to Win").setEmoji("🔗").setStyle(ButtonStyle.Link).setURL(url)
  );

  const otherRows = panelMessage.components.slice(1).map((r) => ActionRowBuilder.from(r));

  await panelMessage.edit({ components: [row, ...otherRows] }).catch(() => {});
}

// ---------- Support ticket auto-naming ----------

// Common filler words that don't tell staff anything about the actual
// issue - stripped out before picking a channel-name keyword so
// "what do you need help with? I missed my gamble" boils down to
// something like "missed-gamble" instead of "what-do".
const KEYWORD_STOPWORDS = new Set([
  "a", "an", "the", "i", "im", "my", "me", "you", "your", "to", "do", "did", "does",
  "done", "with", "about", "for", "of", "on", "in", "at", "is", "are", "was", "were",
  "be", "been", "being", "and", "or", "but", "so", "if", "just", "need", "needs",
  "needed", "needing", "help", "helping", "please", "pls", "plz", "ticket", "issue",
  "problem", "question", "questions", "how", "what", "when", "where", "why", "who",
  "this", "that", "these", "those", "it", "its", "cant", "cannot", "could", "couldnt",
  "would", "wouldnt", "should", "shouldnt", "have", "has", "had", "having", "get",
  "got", "getting", "want", "wanted", "wants", "not", "no", "yes", "really", "very",
  "some", "something", "anything", "someone", "anyone", "support"
]);

// Turns a free-text answer into a short, Discord-channel-safe slug built
// from the most meaningful word(s) in it, e.g. "I missed my gamble" -> "missed-gamble".
// Falls back to "general" if nothing usable is left after filtering.
function extractKeywordSlug(text, maxWords = 2, maxLen = 24) {
  if (!text) return "general";

  const words = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !KEYWORD_STOPWORDS.has(word));

  const fallbackWords = text.toLowerCase().split(/\s+/).filter(Boolean);
  const chosen = (words.length ? words : fallbackWords).slice(0, maxWords);

  const slug = chosen
    .join("-")
    .replace(/-+/g, "-")
    .slice(0, maxLen)
    .replace(/^-+|-+$/g, "");

  return slug || "general";
}

module.exports = {
  buildTopic,
  parseTopic,
  ticketActionRow,
  claimedActionRow,
  logEvent,
  findExistingTicket,
  createTicketChannel,
  buildBuySellModal,
  buildGiveawayModal,
  buildSupportModal,
  buildCloseReasonModal,
  extractKeywordSlug,
  claimTicket,
  unclaimTicket,
  checkTicket,
  closeTicket,
  markGiveawayChecked,
  addJumpToWinButton
};
