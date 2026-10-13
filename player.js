const { Riffy, Player } = require("riffy");
const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionsBitField, MessageFlags, MediaGalleryBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const { requesters } = require("./commands/music/play");
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
const guildTrackMessages = new Map();
const nowPlayingMessages = new Map();
const progressUpdateIntervals = new Map();
const guildActiveFilter = new Map();
const guildTrackMediaCache = new Map();
const musicCard = new EnhancedMusicCard();
const useGeneratedSongCard = config.generateSongCard !== false;
const enableVoiceChannelIdPatch = config.enableVoiceChannelIdPatch === true;
const voiceDebug = config.voiceDebug === true;
const COMMAND_MENTION_CACHE_TTL_MS = 5 * 60 * 1000;
let commandMentionCache = {
    expiresAt: 0,
    map: new Map()
};

async function getCommandMentionMap(client) {
    const now = Date.now();
    if (commandMentionCache.expiresAt > now && commandMentionCache.map.size) {
        return commandMentionCache.map;
    }

    const map = new Map();
    try {
        const fetched = await client.application.commands.fetch();
        fetched.forEach((cmd) => {
            if (cmd?.name && cmd?.id) map.set(cmd.name, cmd.id);
        });
    } catch (_) {}

    commandMentionCache = {
        expiresAt: now + COMMAND_MENTION_CACHE_TTL_MS,
        map
    };

    return map;
}

function getCommandRef(name, mentionMap) {
    const id = mentionMap?.get?.(name);
    return id ? `</${name}:${id}>` : `/${name}`;
}

function buildRandomTryHint(mentionMap) {
    const searchIcon = getEmoji('search') || '🔎';
    const pool = ['play', 'queue', 'search', 'history', 'filters', 'trackinfo', 'stats', 'support'];
    const picks = [];

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    for (const cmd of shuffled) {
        if (picks.length >= 3) break;
        picks.push(cmd);
    }

    const refs = [getCommandRef('help', mentionMap), ...picks.map((cmd) => getCommandRef(cmd, mentionMap))];
    return `${searchIcon} Try: ${refs.join(' • ')}`;
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
        if (enableVoiceChannelIdPatch) {
            patchVoiceChannelIdSupport(player);
        }
    });

    client.riffy.on("trackException", async (player, error) => {
        const langSync = getLangSync();
        const errorMsg = error?.message || 'Unknown error';
        console.error(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.red}${langSync.console?.player?.trackException?.replace('{guildId}', player?.guildId || 'unknown').replace('{message}', errorMsg) || `Track Exception for guild ${player?.guildId \vert{}\vert{} 'unknown'}:${errorMsg}`}${colors.reset}`);
        
        if (player && !player.destroyed) {
            try {
                player.stop();
            } catch (stopError) {}
        }
    });

    client.riffy.on("trackStuck", (player, error) => {
        const lang = getLangSync();
        const errorMsg = error?.message || 'Unknown error';
        console.error(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.red}${lang.console?.player?.trackStuck?.replace('{guildId}', player?.guildId || 'unknown').replace('{message}', errorMsg) || `Track Stuck for guild ${player?.guildId \vert{}\vert{} 'unknown'}:${errorMsg}`}${colors.reset}`);
        
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
