const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config.js");
const { logEvent } = require("./tickets.js");
const { addTempBan } = require("./tempBanManager.js");

const PREFIX = (config.moderation && config.moderation.prefix) || "?";
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord's own timeout cap

// Parses "1s" / "1m" / "1h" / "1d" / "1w" into milliseconds. Returns null
// for anything else, so a duration-shaped arg is easy to tell apart from
// the start of a reason.
function parseDuration(text) {
  if (!text) return null;
  const match = text.trim().toLowerCase().match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000, w: 7 * 24 * 60 * 60 * 1000 };

  return value * multipliers[match[2]];
}

function formatDuration(ms) {
  const units = [
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
    ["second", 1000]
  ];

  // Only pick a unit that divides evenly, so e.g. 10 days doesn't get
  // rounded into a misleading "1 week".
  for (const [name, unitMs] of units) {
    if (ms >= unitMs && ms % unitMs === 0) {
      const value = ms / unitMs;
      return `${value} ${name}${value !== 1 ? "s" : ""}`;
    }
  }

  return `${ms}ms`;
}

// Admins can use every moderation command regardless of role. Otherwise
// the member needs the specific role configured for that command.
function hasPermissionOrRole(member, roleId) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return Boolean(roleId) && member.roles.cache.has(roleId);
}

// Strips the raw "<@id>"/"<@!id>" mention token out of the arg list so
// whatever comes after it (duration, reason) is easy to read positionally.
function stripMentionArgs(args) {
  return args.filter((arg) => !/^<@!?\d+>$/.test(arg));
}

// Deletes the mod's command message (so nothing sits publicly in the
// channel) and DMs them the result embed instead - the closest thing to a
// "private reply" that a plain text command can get, since true ephemeral
// replies only exist for slash-command interactions. If their DMs are
// closed, falls back to a channel message that deletes itself shortly
// after, so the result is never just silently lost.
async function sendPrivateResult(message, embed) {
  await message.delete().catch(() => {});

  const dmFailed = await message.author
    .send({ embeds: [embed] })
    .then(() => false)
    .catch(() => true);

  if (dmFailed) {
    const fallback = await message.channel
      .send({ content: `<@${message.author.id}> (couldn't DM you, your DMs may be off)`, embeds: [embed] })
      .catch(() => null);
    if (fallback) {
      setTimeout(() => fallback.delete().catch(() => {}), 8000);
    }
  }
}

// ---------- ?to (timeout) ----------

async function runTimeoutCommand(message, args) {
  const roleId = config.moderation.timeoutRoleId;
  if (!hasPermissionOrRole(message.member, roleId)) {
    return message.reply({ content: "❌ You don't have permission to use this command." });
  }

  const target = message.mentions.members?.first();
  if (!target) {
    return message.reply({ content: `Usage: \`${PREFIX}to @user <time> [reason]\` — time can be 1s, 1m, 1h, 1d, or 1w.` });
  }

  const rest = stripMentionArgs(args);
  const durationMs = parseDuration(rest[0]);
  if (!durationMs) {
    return message.reply({ content: `Please give a valid time like 1s, 1m, 1h, 1d, or 1w. Usage: \`${PREFIX}to @user <time> [reason]\`` });
  }

  if (durationMs > MAX_TIMEOUT_MS) {
    return message.reply({ content: "❌ Timeouts can't be longer than 28 days — that's Discord's own limit." });
  }

  if (!target.moderatable) {
    return message.reply({ content: "❌ I can't timeout that user (role hierarchy or missing permissions)." });
  }

  const reason = rest.slice(1).join(" ") || "No reason provided";

  await target.timeout(durationMs, reason).catch((err) => {
    console.error("Timeout failed:", err);
  });

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("⏱️ Member Timed Out")
    .addFields(
      { name: "User", value: `<@${target.id}>`, inline: true },
      { name: "Duration", value: formatDuration(durationMs), inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  await sendPrivateResult(message, embed);

  await logEvent(message.guild, {
    title: `Member Timed Out: ${target.user.tag}`,
    color: 0xfee75c,
    fields: [
      { name: "User", value: `<@${target.id}>`, inline: true },
      { name: "Duration", value: formatDuration(durationMs), inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    ]
  });
}

// ---------- ?k (kick) ----------

async function runKickCommand(message, args) {
  const roleId = config.moderation.kickRoleId;
  if (!hasPermissionOrRole(message.member, roleId)) {
    return message.reply({ content: "❌ You don't have permission to use this command." });
  }

  const target = message.mentions.members?.first();
  if (!target) {
    return message.reply({ content: `Usage: \`${PREFIX}k @user [reason]\`` });
  }

  if (!target.kickable) {
    return message.reply({ content: "❌ I can't kick that user (role hierarchy or missing permissions)." });
  }

  const reason = stripMentionArgs(args).join(" ") || "No reason provided";

  await target.kick(reason).catch((err) => {
    console.error("Kick failed:", err);
  });

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("👢 Member Kicked")
    .addFields(
      { name: "User", value: `${target.user.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  await sendPrivateResult(message, embed);

  await logEvent(message.guild, {
    title: `Member Kicked: ${target.user.tag}`,
    color: 0xed4245,
    fields: [
      { name: "User", value: `${target.user.tag} (${target.id})`, inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    ]
  });
}

// ---------- ?b (ban) ----------

async function runBanCommand(message, args) {
  const roleId = config.moderation.banRoleId;
  if (!hasPermissionOrRole(message.member, roleId)) {
    return message.reply({ content: "❌ You don't have permission to use this command." });
  }

  const targetUser = message.mentions.users?.first();
  if (!targetUser) {
    return message.reply({ content: `Usage: \`${PREFIX}b @user [time] [reason]\` — leave time out for a permanent ban.` });
  }

  const rest = stripMentionArgs(args);
  const durationMs = parseDuration(rest[0]);
  const reasonArgs = durationMs ? rest.slice(1) : rest;
  const reason = reasonArgs.join(" ") || "No reason provided";

  const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember && !targetMember.bannable) {
    return message.reply({ content: "❌ I can't ban that user (role hierarchy or missing permissions)." });
  }

  await message.guild.members.ban(targetUser.id, { reason }).catch((err) => {
    console.error("Ban failed:", err);
    return message.reply({ content: "❌ Something went wrong banning that user." });
  });

  if (durationMs) {
    addTempBan(message.guild.id, targetUser.id, Date.now() + durationMs, reason);
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🔨 Member Banned")
    .addFields(
      { name: "User", value: `<@${targetUser.id}>`, inline: true },
      { name: "Duration", value: durationMs ? formatDuration(durationMs) : "Permanent", inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  await sendPrivateResult(message, embed);

  await logEvent(message.guild, {
    title: `Member Banned: ${targetUser.tag}`,
    color: 0xed4245,
    fields: [
      { name: "User", value: `<@${targetUser.id}>`, inline: true },
      { name: "Duration", value: durationMs ? formatDuration(durationMs) : "Permanent", inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    ]
  });
}

// ---------- ?w (warn) ----------

async function runWarnCommand(message, args) {
  const roleId = config.moderation.warnRoleId;
  if (!hasPermissionOrRole(message.member, roleId)) {
    return message.reply({ content: "❌ You don't have permission to use this command." });
  }

  const targetUser = message.mentions.users?.first();
  if (!targetUser) {
    return message.reply({ content: `Usage: \`${PREFIX}w @user <reason>\` — a reason is required.` });
  }

  const reason = stripMentionArgs(args).join(" ").trim();
  if (!reason) {
    return message.reply({ content: `A reason is required. Usage: \`${PREFIX}w @user <reason>\`` });
  }

  const warnDmEmbed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("⚠️ You have been warned")
    .addFields(
      { name: "Server", value: message.guild.name, inline: true },
      { name: "Moderator", value: message.author.tag, inline: true },
      { name: "Reason", value: reason }
    )
    .setTimestamp();

  const dmToUserFailed = await targetUser
    .send({ embeds: [warnDmEmbed] })
    .then(() => false)
    .catch(() => true);

  const confirmationEmbed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("⚠️ Member Warned")
    .addFields(
      { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    )
    .setFooter({ text: dmToUserFailed ? "Could not DM the user - they may have DMs off." : "User was notified via DM." })
    .setTimestamp();

  await sendPrivateResult(message, confirmationEmbed);

  await logEvent(message.guild, {
    title: `Member Warned: ${targetUser.tag}`,
    color: 0xfee75c,
    fields: [
      { name: "User", value: `<@${targetUser.id}>`, inline: true },
      { name: "Moderator", value: `<@${message.author.id}>`, inline: true },
      { name: "Reason", value: reason }
    ]
  });
}

// ---------- Dispatch ----------

// Returns true if the message was handled as a prefix command (so the
// caller knows not to treat it as anything else).
async function handlePrefixCommand(message) {
  if (!message.content.startsWith(PREFIX)) return false;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/).filter(Boolean);
  const commandName = (args.shift() || "").toLowerCase();

  switch (commandName) {
    case "to":
      await runTimeoutCommand(message, args);
      return true;
    case "k":
      await runKickCommand(message, args);
      return true;
    case "b":
      await runBanCommand(message, args);
      return true;
    case "w":
      await runWarnCommand(message, args);
      return true;
    default:
      return false;
  }
}

module.exports = { handlePrefixCommand, PREFIX };
