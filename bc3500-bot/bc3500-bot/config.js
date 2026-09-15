/**
 * BC3500 Bot config
 * ------------------
 * Fill in every "PUT_..._HERE" value below with real IDs from your server.
 * To get an ID: enable Developer Mode in Discord (User Settings > Advanced),
 * then right-click a role/category/channel and choose "Copy ID".
 *
 * The only things that live in Railway Variables are DISCORD_TOKEN,
 * CLIENT_ID, and GUILD_ID (see index.js / .env.example). Everything else
 * is set right here in this file.
 */

module.exports = {
  // Image shown at the top-right of the ticket panel embed (thumbnail)
  panelImageUrl:
    "https://media.discordapp.net/attachments/1549172001027919954/1549443844322369538/IMG_4628.webp?ex=6aaab787&is=6aa96607&hm=8f265404c71e57593ca61c84c64edbeacd2b9041f16287a58a23abde2dd903c9&=&format=webp",

  panelTitle: "🎫 Create a New Ticket",

  panelDescription:
    "Please select the category that best describes your request from the dropdown below. This will open a private ticket channel for you and our staff.\n" +
    "**Read the rules before opening a ticket.**\n\n" +
    "**Ticket Rules:**\n" +
    "1. Be respectful to staff and other players.\n" +
    "2. Do not spam or flood the ticket with messages.\n" +
    "3. Provide clear and concise information about your issue.\n" +
    "4. Follow any instructions given by staff.\n" +
    "5. Do not share personal information in the ticket.\n" +
    "6. Tickets may be closed if inactive for a period of time.\n" +
    "7. Abusing the ticket system may result in penalties.",

  // One entry per ticket type. categoryId = the Discord channel CATEGORY the
  // ticket channel gets created under. roleId = the role that gets pinged.
  ticketTypes: {
    support: {
      key: "support",
      buttonId: "ticket_support",
      label: "Support",
      emoji: "📧",
      style: "Danger", // red
      channelPrefix: "support",
      color: 0xed4245, // red
      categoryId: "1549321088880869426",
      roleId: "1549321180899450890"
    },
    buysell: {
      key: "buysell",
      buttonId: "ticket_buysell",
      label: "Buy/Sell Spawners",
      emoji: "💀",
      style: "Secondary", // grey
      channelPrefix: "spawners",
      color: 0x99aab5, // grey
      categoryId: "1549321112293478490",
      roleId: "1549321180899450890"
    },
    giveaway: {
      key: "giveaway",
      buttonId: "ticket_giveaway",
      label: "Giveaway Claim/Sponsor",
      emoji: "🏆",
      style: "Success", // green
      channelPrefix: "giveaway",
      color: 0x57f287, // green
      categoryId: "1549321140479205376",
      roleId: "1549321180899450890"
    }
  },

  // Optional: a channel ID where closed-ticket transcripts/reasons get logged.
  // Leave as null to disable logging.
  logChannelId: "1549322089658454086",

  // The channel the bot scans for giveaway win announcements. When someone
  // opens a Giveaway Claim ticket and types the amount they say they won
  // (e.g. "50000"), the bot searches this channel for a message that
  // mentions them AND contains that amount. Leave as "PUT_..._HERE" to
  // disable the check.
  giveawayCheckChannelId: "1549323453683863573",

  // How many of the most recent messages in that channel to scan per check.
  giveawayScanMessageLimit: 500,

  // Prefix-command moderation: ?to (timeout), ?k (kick), ?b (ban), ?w (warn).
  // Anyone with the Discord "Administrator" permission can use all of these
  // regardless of roles. Otherwise each command needs its own role below.
  moderation: {
    prefix: "?",
    timeoutRoleId: "1549321180899450890",
    kickRoleId: "1549321180899450890",
    banRoleId: "1549321989519310888",
    warnRoleId: "1549321180899450890"
  }
};
