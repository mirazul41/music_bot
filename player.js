const { Riffy } = require("riffy");
const config = require("./config.js");
const { initializeLavalinkManager } = require('./lavalink.js');

let getLangSync;
try {
    const langLoader = require('./utils/languageLoader.js');
    getLangSync = langLoader.getLangSync;
} catch (e) {
    getLangSync = () => ({ console: {} });
}

async function initializePlayer(client) {
    const nodeManager = await initializeLavalinkManager(client);
    client.riffy = nodeManager.riffy;
    client.lavalinkManager = nodeManager;
    client.nodeManager = nodeManager;

    client.riffy.on("trackException", async (player, error) => {
        const guildId = player?.guildId || 'unknown';
        const errorMsg = error?.message || 'Unknown error';
        console.error(`[ LAVALINK ] Track Exception for guild ${guildId}: ${errorMsg}`);
        
        if (player && !player.destroyed) {
            try {
                player.stop();
            } catch (stopError) {}
        }
    });

    client.riffy.on("trackStuck", (player, error) => {
        const guildId = player?.guildId || 'unknown';
        const errorMsg = error?.message || 'Unknown error';
        console.error(`[ LAVALINK ] Track Stuck for guild ${guildId}: ${errorMsg}`);
        
        if (player && !player.destroyed) {
            try {
                player.stop();
            } catch (stopError) {}
        }
    });

    client.riffy.on("trackStart", async (player, track) => {
        if (!track || !track.info) return;
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    client.riffy.on("queueEnd", async (player) => {
        const guildId = player.guildId;
        try {
            if (player && !player.destroyed) {
                player.destroy();
            }
        } catch (error) {
            if (player && !player.destroyed) player.destroy();
        }
    });
}

module.exports = { initializePlayer };
