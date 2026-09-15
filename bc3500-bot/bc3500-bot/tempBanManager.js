const fs = require("fs");
const path = require("path");

// Discord has no built-in "temp ban" - we have to track the unban time
// ourselves and act on it later. Stored to disk (not just memory) so a
// bot restart/redeploy doesn't lose track of pending unbans.
const DATA_PATH = path.join(__dirname, "tempbans.json");

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// Records a ban that should be lifted at `unbanAt` (a Date.now()-style
// timestamp in ms). Keyed by guild+user so re-banning someone overwrites
// any previous pending unban for them.
function addTempBan(guildId, userId, unbanAt, reason) {
  const data = loadData();
  data[`${guildId}:${userId}`] = { guildId, userId, unbanAt, reason: reason || "No reason provided" };
  saveData(data);
}

function removeTempBan(guildId, userId) {
  const data = loadData();
  delete data[`${guildId}:${userId}`];
  saveData(data);
}

// Checks every minute for temp bans whose time is up and unbans them. Also
// runs once immediately on startup, so anything that expired while the bot
// was offline/redeploying gets cleared as soon as it's back up. Using a
// periodic check instead of one setTimeout per ban avoids issues with
// setTimeout's ~24.8 day max delay for longer bans.
function startTempBanChecker(client) {
  async function checkNow() {
    const data = loadData();
    const now = Date.now();

    for (const key of Object.keys(data)) {
      const entry = data[key];
      if (entry.unbanAt > now) continue;

      const guild = await client.guilds.fetch(entry.guildId).catch(() => null);
      if (guild) {
        await guild.bans.remove(entry.userId, "Temporary ban expired").catch(() => {});
      }

      removeTempBan(entry.guildId, entry.userId);
    }
  }

  checkNow();
  setInterval(checkNow, 60 * 1000);
}

module.exports = {
  addTempBan,
  removeTempBan,
  startTempBanChecker
};
