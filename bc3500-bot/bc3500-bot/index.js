require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require("discord.js");

const config = require("./config.js");
const { createTicketChannel, claimTicket, closeTicket, buildBuySellModal, buildGiveawayModal, buildCloseReasonModal } = require("./tickets.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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
          const won = interaction.fields.getTextInputValue("gw_won") || "N/A";
          const sponsoring = interaction.fields.getTextInputValue("gw_sponsor") || "N/A";
          const fields = [
            { name: "Claim or Sponsor?", value: interaction.fields.getTextInputValue("gw_type") },
            { name: "How much did you win?", value: won },
            { name: "How much are you sponsoring?", value: sponsoring },
            { name: "IGN", value: interaction.fields.getTextInputValue("gw_ign") }
          ];
          const { alreadyExists, channel } = await createTicketChannel({
            interaction,
            typeKey: "giveaway",
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

client.login(process.env.DISCORD_TOKEN);
