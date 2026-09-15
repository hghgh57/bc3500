require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require("discord.js");

const config = require("./config.js");
const {
  parseTopic,
  createTicketChannel,
  claimTicket,
  unclaimTicket,
  closeTicket,
  buildBuySellModal,
  buildGiveawayModal,
  buildCloseReasonModal,
  markGiveawayChecked,
  addJumpToWinButton
} = require("./tickets.js");
const { parseAmount, findGiveawayWin, formatAmountShort } = require("./giveawayChecker.js");
const { handlePrefixCommand } = require("./moderation.js");
const { startTempBanChecker } = require("./tempBanManager.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ---- Load slash commands ----
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once("ready", async () => {
  console.log(`BC3500 Bot is online as ${client.user.tag}`);
  await registerSlashCommands();
  startTempBanChecker(client);
});

// Registers all slash commands automatically on every boot, so there's no
// separate "deploy" step to run manually (handy for Railway).
async function registerSlashCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    console.warn("Skipping slash command registration: DISCORD_TOKEN or CLIENT_ID is missing.");
    return;
  }

  const commandData = client.commands.map((cmd) => cmd.data.toJSON());
  const rest = new REST().setToken(token);

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
      console.log(`Registered ${commandData.length} guild slash commands.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      console.log(`Registered ${commandData.length} global slash commands (may take up to 1hr to appear).`);
    }
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    // ---------- Slash commands ----------
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      return command.execute(interaction);
    }

    // ---------- Buttons ----------
    if (interaction.isButton()) {
      switch (interaction.customId) {
        case "ticket_support": {
          const { alreadyExists, channel } = await createTicketChannel({
            interaction,
            typeKey: "support",
            user: interaction.user,
            fields: []
          });
          return interaction.reply({
            content: alreadyExists
              ? `You already have an open ticket: <#${channel.id}>`
              : `Your ticket has been created: <#${channel.id}>`,
            ephemeral: true
          });
        }

        case "ticket_buysell":
          return interaction.showModal(buildBuySellModal());

        case "ticket_giveaway":
          return interaction.showModal(buildGiveawayModal());

        case "ticket_claim":
          return claimTicket(interaction);

        case "ticket_unclaim":
          return unclaimTicket(interaction);

        case "ticket_close":
          return interaction.showModal(buildCloseReasonModal());
      }
      return;
    }

    // ---------- Modals ----------
    if (interaction.isModalSubmit()) {
      switch (interaction.customId) {
        case "modal_buysell": {
          const fields = [
            { name: "Buying or Selling?", value: interaction.fields.getTextInputValue("bs_direction") },
            { name: "Quantity of spawners", value: interaction.fields.getTextInputValue("bs_quantity") },
            { name: "IGN", value: interaction.fields.getTextInputValue("bs_ign") }
          ];
          const { alreadyExists, channel } = await createTicketChannel({
            interaction,
            typeKey: "buysell",
            user: interaction.user,
            fields
          });
          return interaction.reply({
            content: alreadyExists
              ? `You already have an open ticket: <#${channel.id}>`
              : `Your ticket has been created: <#${channel.id}>`,
            ephemeral: true
          });
        }

        case "modal_giveaway": {
          const wonRaw = interaction.fields.getTextInputValue("gw_won") || "N/A";
          const sponsoring = interaction.fields.getTextInputValue("gw_sponsor") || "N/A";

          // Parse whatever they typed (e.g. "10000000") so the embed can
          // always show it back in short form (e.g. "10m").
          const wonAmount = parseAmount(wonRaw);
          const wonDisplay = wonAmount !== null ? formatAmountShort(wonAmount) : wonRaw;

          const fields = [
            { name: "Claim or Sponsor?", value: interaction.fields.getTextInputValue("gw_type") },
            { name: "How much did you win?", value: wonDisplay },
            { name: "How much are you sponsoring?", value: sponsoring },
            { name: "IGN", value: interaction.fields.getTextInputValue("gw_ign") }
          ];
          const { alreadyExists, channel } = await createTicketChannel({
            interaction,
            typeKey: "giveaway",
            user: interaction.user,
            fields
          });
          await interaction.reply({
            content: alreadyExists
              ? `You already have an open ticket: <#${channel.id}>`
              : `Your ticket has been created: <#${channel.id}>`,
            ephemeral: true
          });

          // If they gave a real amount in the "How much did you win?"
          // field, run the giveaway check right away instead of waiting
          // for them to type it again as a plain message.
          if (!alreadyExists && wonAmount !== null) {
            await runGiveawayCheck(channel, interaction.user.id, wonAmount);
          }
          return;
        }

        case "modal_close_reason": {
          const reason = interaction.fields.getTextInputValue("close_reason") || "";
          return closeTicket(interaction, reason);
        }
      }
      return;
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction
        .reply({ content: "Something went wrong handling that. Check the console log.", ephemeral: true })
        .catch(() => {});
    }
  }
});

// ---------- Giveaway claim amount check ----------
// Runs the actual win check for a giveaway ticket: looks up
// config.giveawayCheckChannelId for a message mentioning the ticket owner
// with a matching amount, posts a clear Yes/No result in the ticket, and
// (if a win is found) adds a Jump to Win button. Only ever runs once per
// ticket - callers are expected to check info.giveawayChecked first.
async function runGiveawayCheck(channel, ownerId, amount) {
  const info = parseTopic(channel.topic);
  if (!info || info.giveawayChecked) return;

  await markGiveawayChecked(channel, info);

  const result = await findGiveawayWin(channel.guild, ownerId, amount);

  if (!result.configured) {
    await channel.send({
      content:
        `❌ **No, no matching win found for ${formatAmountShort(amount)}.**\n` +
        "(Note for staff: `giveawayCheckChannelId` isn't set in config.js yet, so this is unverified — please double check manually.)"
    });
    return;
  }

  if (result.found) {
    await channel.send({
      content: `✅ **Yes, found a matching win for ${formatAmountShort(amount)}!**`
    });
    await addJumpToWinButton(channel, result.message.url);
  } else {
    await channel.send({
      content: `❌ **No matching win found for ${formatAmountShort(amount)}** in <#${config.giveawayCheckChannelId}>. Staff can still verify manually.`
    });
  }
}

// Fallback path: if the ticket opener didn't give a usable amount in the
// modal (left it blank or put "N/A"), they can still trigger the check
// later by typing just the amount as a plain message in the ticket.
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot || !message.guild) return;

    const handledCommand = await handlePrefixCommand(message);
    if (handledCommand) return;

    const info = parseTopic(message.channel.topic);
    if (!info || info.typeKey !== "giveaway") return;
    if (info.giveawayChecked) return;
    if (message.author.id !== info.ownerId) return;

    const amount = parseAmount(message.content);
    if (amount === null) return;

    await runGiveawayCheck(message.channel, info.ownerId, amount);
  } catch (err) {
    console.error("Giveaway claim check failed:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
