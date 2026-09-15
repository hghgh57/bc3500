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
    "https://cdn.britannica.com/19/233519-050-F0604A51/LeBron-James-Los-Angeles-Lakers-Staples-Center-2019.jpg?w=400&h=300&c=crop",

  panelTitle: "BC3500 Tickets",

  panelDescription:
    "Please select the category that best matches your request to open a ticket:\n\n" +
    " **Support:** General help.\n" +
    " **Giveaway Claim / Sponsor:** Claim your prizes or if you want to host a giveaway.\n" +
    " **Buying/Selling Skellies:** To sell or purchase spawners.",

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
      categoryId: "PUT_SUPPORT_CATEGORY_ID_HERE",
      roleId: "PUT_SUPPORT_ROLE_ID_HERE"
    },
    buysell: {
      key: "buysell",
      buttonId: "ticket_buysell",
      label: "Buy/Sell Spawners",
      emoji: "💀",
      style: "Secondary", // grey
      channelPrefix: "spawners",
      color: 0x99aab5, // grey
      categoryId: "PUT_BUYSELL_CATEGORY_ID_HERE",
      roleId: "PUT_BUYSELL_ROLE_ID_HERE"
    },
    giveaway: {
      key: "giveaway",
      buttonId: "ticket_giveaway",
      label: "Giveaway Claim/Sponsor",
      emoji: "🏆",
      style: "Success", // green
      channelPrefix: "giveaway",
      color: 0x57f287, // green
      categoryId: "PUT_GIVEAWAY_CATEGORY_ID_HERE",
      roleId: "PUT_GIVEAWAY_ROLE_ID_HERE"
    }
  },

  // Optional: a channel ID where closed-ticket transcripts/reasons get logged.
  // Leave as null to disable logging.
  logChannelId: null
};
