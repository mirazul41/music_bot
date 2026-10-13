const { Riffy, Player } = require("riffy");
const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionsBitField, MessageFlags, MediaGalleryBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const { EnhancedMusicCard } = require("./utils/musicCard");
const config = require("./config.js");
const { getEmoji, getButtonEmoji } = require('./UI/emojis/emoji');
const colors = require('./UI/colors/colors');
const axios = require('axios');
const { autoplayCollection, playlistCollection } = require('./mongodb.js');
const { initializeLavalinkManager, getLavalinkManager } = require('./lavalink.js');
const { cardFromMessage, safeDeferUpdate } = require('./utils/responseHandler.js');

let getLangSync, getLang;
try {
    const langLoader = require('./utils/languageLoader.js');
    getLangSync = langLoader.getLangSync;
    getLang = langLoader.getLang;
} catch (e) {
    getLangSync = () => ({ console: {} });
    getLang = async () => ({ player: {} });
}

function patchVoiceChannelIdSupport(player) {
    const connection = player?.connection;
    if (!connection || connection.__voiceChannelIdPatchApplied) return;

    connection.__voiceChannelIdPatchApplied = true;
    connection.voice = connection.voice || {};

    if (!connection.voice.channelId && player.voiceChannel) {
        connection.voice.channelId = player.voiceChannel;
    }

    if (typeof connection.setStateUpdate === "function") {
        const originalSetStateUpdate = connection.setStateUpdate.bind(connection);
        connection.setStateUpdate = (data) => {
            originalSetStateUpdate(data);
            const channelId = data?.channel_id || connection.voiceChannel || player.voiceChannel || null;
            if (channelId) {
                connection.voice.channelId = channelId;
            }
        };
    }
}

async function initializePlayer(client) {
    const nodeManager = await initializeLavalinkManager(client);
    client.riffy = nodeManager.riffy;
    client.lavalinkManager = nodeManager;
    client.nodeManager = nodeManager;

    client.riffy.on("playerCreate", (player) => {
        if (config.enableVoiceChannelIdPatch === true) {
            patchVoiceChannelIdSupport(player);
        }
    });

    client.riffy.on("trackException", async (player, error) => {
        const langSync = getLangSync();
        const errorMsg = error?.message || 'Unknown error';
        const guildId = player?.guildId || 'unknown';
        console.error(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.red}Track Exception for guild ${guildId}: ${errorMsg}${colors.reset}`);
        
        if (player && !player.destroyed) {
            try {
                player.stop();
            } catch (stopError) {}
        }
    });

    client.riffy.on("trackStuck", (player, error) => {
        const lang = getLangSync();
        const errorMsg = error?.message || 'Unknown error';
        const guildId = player?.guildId || 'unknown';
        console.error(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.red}Track Stuck for guild ${guildId}: ${errorMsg}${colors.reset}`);
        
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
            const settings = await autoplayCollection.findOne({ guildId });
            if (!settings?.twentyfourseven) {
                player.destroy();
            }
        } catch (error) {
            if (!player.destroyed) player.destroy();
        }
    });
}

module.exports = { initializePlayer };
