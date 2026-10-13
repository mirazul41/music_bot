const { Riffy } = require("riffy");
const config = require("./config.js");

async function initializePlayer(client) {
    if (!client.riffy) {
        const nodes = config.nodes.map(node => ({
            name: node.name,
            host: node.host,
            port: node.port,
            password: node.password,
            secure: node.secure || false
        }));

        client.riffy = new Riffy(client, nodes, {
            send: (payload) => {
                const guild = client.guilds.cache.get(payload.d.guild_id);
                if (guild) guild.shard.send(payload);
            },
            defaultSearchPlatform: "ytsearch",
            restVersion: "v4"
        });

        client.riffy.on("nodeConnect", node => {
            console.log(`[ LAVALINK ] Node "${node.name}" connected successfully.`);
        });

        client.riffy.on("nodeError", (node, error) => {
            console.error(`[ LAVALINK ] Node "${node.name}" error: ${error.message}`);
        });
    }

    client.riffy.init(client.user.id);

    client.riffy.on("trackException", async (player, error) => {
        const guildId = player?.guildId || 'unknown';
        const errorMsg = error?.message || 'Unknown error';
        console.error(`[ LAVALINK ] Track Exception for guild ${guildId}: ${errorMsg}`);
        
        if (player && !player.destroyed) {
            try { player.stop(); } catch (e) {}
        }
    });

    client.riffy.on("trackStuck", (player, error) => {
        const guildId = player?.guildId || 'unknown';
        const errorMsg = error?.message || 'Unknown error';
        console.error(`[ LAVALINK ] Track Stuck for guild ${guildId}: ${errorMsg}`);
        
        if (player && !player.destroyed) {
            try { player.stop(); } catch (e) {}
        }
    });

    client.riffy.on("queueEnd", async (player) => {
        if (player && !player.destroyed) {
            player.destroy();
        }
    });

    return client.riffy;
}

function getLavalinkManager() {
    return null;
}

module.exports = { initializePlayer, getLavalinkManager };
