# BC3500 Bot

A Discord ticket bot with three ticket types, each going to its own channel
category and pinging its own role:

| Button | Color | Opens ticket in | Pings | Questions asked |
|---|---|---|---|---|
| 📧 Support | Red | Support category | Support role | none |
| 💀 Buy/Sell Spawners | Grey | Buy/Sell category | Buy/Sell role | Buying or selling? / Quantity? / IGN? |
| 🏆 Giveaway Claim/Sponsor | Green | Giveaway category | Giveaway role | Claim or sponsor? / Amount won (optional) / Amount sponsoring (optional) / IGN? |

Every ticket channel gets a **Close** and **Claim** button (no emojis).
Closing pops up a modal for an optional reason, then the channel deletes
itself a few seconds after posting the close message.

Slash commands (`/panel`, `/ticket-add`, `/ticket-close`, `/ticket-rename`)
register themselves automatically every time the bot starts up.

## 1. Edit config.js

Open `config.js` and replace every `PUT_..._HERE` placeholder with the real
category ID and role ID for each ticket type. Also set `logChannelId` if you
want closed tickets logged somewhere. This is the only file you need to
touch.

To get an ID: enable Developer Mode in Discord (**User Settings > Advanced >
Developer Mode**), then right-click a role, category, or channel and choose
**Copy ID**.

## 2. Deploying on Railway

1. Push this folder (with your edited `config.js`) to a GitHub repo.
2. In Railway: **New Project > Deploy from GitHub repo**, pick the repo.
3. Open the service's **Variables** tab and add just these three:

   | Variable | Value |
   |---|---|
   | `DISCORD_TOKEN` | Your bot's token |
   | `CLIENT_ID` | Your bot/application's ID (Application ID) |
   | `GUILD_ID` | Your server's ID |

   Railway auto-detects this as a Node app and runs `node index.js` — no
   other setup needed.
4. Once the logs show "BC3500 Bot is online", go to any channel in your
   server and run `/panel` to post the ticket panel.

### Bot permissions

When generating your invite link (**OAuth2 > URL Generator**), check `bot`
and `applications.commands`, and give the bot at least:

- Manage Channels
- View Channels
- Send Messages
- Embed Links
- Read Message History
- Attach Files

## Running locally instead

```
npm install
cp .env.example .env   # fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID
npm start
```

## Notes

- `/ticket-add`, `/ticket-close`, and `/ticket-rename` only work inside a
  ticket channel, and by default require the **Manage Channels** permission.
  You can loosen or tighten who can use them from Server Settings >
  Integrations > BC3500 Bot in Discord.
- A user can only have one open ticket per category at a time — trying to
  open a second one just points them back to the existing channel.
- The **Claim** button locks in the first staff member to click it and
  disables itself afterward; the **Close** button works for anyone with
  access to the ticket.
