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
    } catch (_) {
        // Fallback to plain /command text when mentions cannot be fetched.
    }

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

const PLAYER_FAVORITES_NAME = 'AutoFavourites';
const LEGACY_PLAYER_FAVORITES_NAME = '__FAVORITES__';
const PLAYER_FILTER_OPTIONS = [
    { label: 'Karaoke', value: 'karaoke' },
    { label: 'Timescale', value: 'timescale' },
    { label: 'Tremolo', value: 'tremolo' },
    { label: 'Vibrato', value: 'vibrato' },
    { label: '3D', value: 'rotation' },
    { label: 'Distortion', value: 'distortion' },
    { label: 'Channel Mix', value: 'channelmix' },
    { label: 'Low Pass', value: 'lowpass' },
    { label: 'Bassboost', value: 'bassboost' },
    { label: 'Nightcore', value: 'nightcore' },
    { label: 'Daycore', value: 'daycore' }
];

function createAddSongModal() {
    const modal = new ModalBuilder()
        .setCustomId('player_modal_addsong')
        .setTitle('Add Song to Queue');

    const input = new TextInputBuilder()
        .setCustomId('query')
        .setLabel('Song Name or URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Adele Skyfall or https://...')
        .setRequired(true)
        .setMaxLength(200);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

function createVolumeModal(currentVolume = 100) {
    const modal = new ModalBuilder()
        .setCustomId('player_modal_volume')
        .setTitle('Set Volume');

    const input = new TextInputBuilder()
        .setCustomId('volume')
        .setLabel('Volume (1-100)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(String(Math.min(100, Math.max(1, currentVolume || 100))))
        .setRequired(true)
        .setMaxLength(3);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

function createSaveSongModal() {
    const modal = new ModalBuilder()
        .setCustomId('player_modal_save_song')
        .setTitle('Save Song to Playlist');

    const input = new TextInputBuilder()
        .setCustomId('playlistName')
        .setLabel('Playlist Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('My Favorites')
        .setRequired(true)
        .setMaxLength(80);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
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
            if (voiceDebug) {
                console.log(`[ VOICE DEBUG ] stateUpdate guild=${player.guildId} channelId=${channelId || 'null'} sessionId=${data?.session_id ? 'yes' : 'no'}`);
            }
        };
    }

    if (typeof connection.updatePlayerVoiceData === "function") {
        const originalUpdatePlayerVoiceData = connection.updatePlayerVoiceData.bind(connection);
        connection.updatePlayerVoiceData = () => {
            if (!connection.voice.channelId) {
                connection.voice.channelId = connection.voiceChannel || player.voiceChannel || null;
            }
            if (voiceDebug) {
                const v = connection.voice || {};
                console.log(`[ VOICE DEBUG ] updatePlayerVoiceData guild=${player.guildId} channelId=${v.channelId || 'null'} sessionId=${v.sessionId ? 'yes' : 'no'} token=${v.token ? 'yes' : 'no'} endpoint=${v.endpoint ? 'yes' : 'no'}`);
            }
            originalUpdatePlayerVoiceData();
        };
    }
}

function stripMediaGallery(components = []) {
    return components.filter((component) => !(component instanceof MediaGalleryBuilder));
}

function formatSourceName(sourceName) {
    const raw = String(sourceName || 'Unknown').toLowerCase();
    if (raw === 'youtube') return 'YouTube';
    if (raw === 'soundcloud') return 'SoundCloud';
    if (raw === 'spotify') return 'Spotify';
    if (raw === 'applemusic') return 'Apple Music';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function setTrackMediaCache(guildId, trackUri, mediaUrl = null, cardBuffer = null) {
    if (!guildId || !trackUri) return;
    guildTrackMediaCache.set(guildId, { trackUri, mediaUrl, cardBuffer });
}

function getTrackMediaCache(guildId, trackUri) {
    const cached = guildTrackMediaCache.get(guildId);
    if (!cached || cached.trackUri !== trackUri) return null;
    return cached;
}

function clearTrackMediaCache(guildId) {
    guildTrackMediaCache.delete(guildId);
}

function clearProgressUpdates(guildId) {
    const intervalId = progressUpdateIntervals.get(guildId);
    if (intervalId) {
        clearInterval(intervalId);
        progressUpdateIntervals.delete(guildId);
    }
}

function buildNowPlayingContainer(track, requesterName, t, progressBar, progressPercent, mediaUrl, actionRows = {}, playerState = {}) {
    const titleIcon = getEmoji('music') || '🎧';
    const infoIcon = getEmoji('info') || 'ℹ️';
    const timeIcon = getEmoji('uptime') || '⏱️';
    const queueIcon = getEmoji('queue') || '📄';
    const userIcon = getEmoji('users') || '👤';
    const sourceIcon = getEmoji('servers') || '🌐';
    const playIcon = getEmoji('play') || '▶️';
    const pauseIcon = getEmoji('pause') || '⏸️';
    const loopIcon = getEmoji('settings') || '🔁';
    const controlsIcon = getEmoji('settings') || '⚙️';
    const manageIcon = getEmoji('owner') || '👑';
    const filterIcon = getEmoji('servers') || '🌐';
    const byText = t.trackInfo?.by || 'by';
    const isPaused = playerState.paused === true;
    const loopMode = playerState.loop || 'none';
    const isLoopOn = loopMode !== 'none';
    const sourceName = formatSourceName(track.info?.sourceName);
    const stateLabel = isPaused ? (t.playerState?.paused || 'Paused') : (t.playerState?.playing || 'Playing');
    const loopStateLabel = isLoopOn ? (t.playerState?.loopOn || 'Loop On') : (t.playerState?.loopOff || 'Loop Off');
    const stateLine1 = `${isPaused ? pauseIcon : playIcon} ${stateLabel}`;
    const stateLine2 = `${loopIcon} ${loopStateLabel}`;
    const durationLine = `${timeIcon} ${formatDuration(track.info.length)}`;
    const requesterLine = `${userIcon} ${requesterName || (t.trackInfo?.unknown || 'Unknown')}`;
    const sourceLine = `${sourceIcon} ${sourceName}`;
    const queueHint = `${queueIcon} ${playerState.queueLength || 0} ${playerState.queueLength === 1 ? 'song' : 'songs'} in queue`;
    const tryHint = buildRandomTryHint(playerState.commandMentionMap);
    const showTitleBlock = !mediaUrl;

    const container = new ContainerBuilder();

    if (mediaUrl) {
        const mediaGallery = new MediaGalleryBuilder().addItems(
            (mediaItem) => mediaItem
                .setURL(mediaUrl)
                .setDescription(`${track.info?.title || 'Unknown Title'} - ${track.info?.author || 'Unknown Artist'}`)
        );

        container
            .addSeparatorComponents((separator) => separator)
            .addMediaGalleryComponents(mediaGallery);
    }

    if (showTitleBlock) {
        container.addTextDisplayComponents(
            (textDisplay) => textDisplay.setContent(
                `### ${titleIcon} ${track.info.title || 'Unknown Title'}\n` +
                `${byText} ${track.info.author || (t.trackInfo?.unknownArtist || 'Unknown Artist')}`
            )
        );
    }

    const showSongDetails = !mediaUrl || config.metadataTag === true;
    if (showSongDetails) {
        container
            .addSeparatorComponents((separator) => separator)
            .addTextDisplayComponents(
                (textDisplay) => textDisplay.setContent(
                    `### ${infoIcon} ${t.songDetailsTitle || 'Song Details'}\n` +
                    `${stateLine1}\n` +
                    `${stateLine2}\n` +
                    `${durationLine}\n` +
                    `${requesterLine}\n` +
                    `${sourceLine}\n` +
                    `${queueHint}`
                )
            );
    }

    if (actionRows?.playbackRow) {
        container
            .addSeparatorComponents((separator) => separator)
            .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`### ${controlsIcon} Playback`))
            .addActionRowComponents(actionRows.playbackRow);
    }

    if (actionRows?.manageRow) {
        container
            .addSeparatorComponents((separator) => separator)
            .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`### ${manageIcon} Library`))
            .addActionRowComponents(actionRows.manageRow);
    }

    if (actionRows?.filterRow) {
        container
            .addSeparatorComponents((separator) => separator)
            .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`### ${filterIcon} Effects`))
            .addActionRowComponents(actionRows.filterRow);
    }

    container
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(tryHint));

    return container;
}

async function sendMessageWithPermissionsCheck(channel, components, attachment) {
    try {
        const permissions = channel.permissionsFor(channel.guild.members.me);
        const needsAttachPermission = !!attachment;
        if (!permissions.has(PermissionsBitField.Flags.SendMessages) ||
            !permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
            const lang = getLangSync();
            console.error(lang.console?.player?.lacksPermissions || "Bot lacks necessary permissions to send messages in this channel.");
            return;
        }

        let safeComponents = components;
        let safeAttachment = attachment;
        if (needsAttachPermission && !permissions.has(PermissionsBitField.Flags.AttachFiles)) {
            safeComponents = stripMediaGallery(components);
            safeAttachment = null;
        }

        const messageOptions = {
            components: safeComponents,
            flags: MessageFlags.IsComponentsV2
        };
        
        if (safeAttachment) {
            messageOptions.files = [safeAttachment];
        }
        
        try {
            const message = await channel.send(messageOptions);
            return message;
        } catch (sendError) {
            const fallbackComponents = stripMediaGallery(components);
            const fallbackOptions = {
                components: fallbackComponents,
                flags: MessageFlags.IsComponentsV2
            };
            try {
                const message = await channel.send(fallbackOptions);
                return message;
            } catch (_) {
                const minimalOptions = {
                    components: fallbackComponents,
                    flags: MessageFlags.IsComponentsV2
                };
                const message = await channel.send(minimalOptions);
                return message;
            }
        }
    } catch (error) {
        const langSync = getLangSync();
        console.error(langSync.console?.player?.errorSendingMessage?.replace('{message}', error.message) || "Error sending message:", error.message);
        const lang = await getLang(channel.guildId).catch(() => ({ console: { player: {} } }));
        const t = lang.console?.player || {};
        const errorContainer = cardFromMessage(
            `${t.unableToSendMessage?.title || '## ⚠️ Unable to Send Message'}\n\n` +
            `${t.unableToSendMessage?.message || 'Unable to send message. Check bot permissions.'}`,
            'Unable to Send Message'
        );
        await channel.send({ 
            components: [errorContainer],
            flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
    }
}

async function sendTransientCard(channel, message, deleteMs = 5000, fallbackTitle = 'Notice') {
    const container = cardFromMessage(message, fallbackTitle);
    const sent = await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
    });
    setTimeout(() => sent.delete().catch(() => {}), deleteMs);
    return sent;
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
        if (voiceDebug) {
            console.log(`[ VOICE DEBUG ] playerCreate guild=${player.guildId} voiceChannel=${player.voiceChannel || 'null'} patch=${enableVoiceChannelIdPatch ? 'on' : 'off'}`);
        }
    });

    client.riffy.on("trackException", async (player, error) => {
        const langSync = getLangSync();
        const errorMsg = error?.message || 'Unknown error';
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('Read timed out') || errorMsg.includes('SocketTimeoutException');
        
        if (isTimeout) {
            console.warn(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.yellow}Track timeout for guild ${player?.guildId || 'unknown'}: ${errorMsg}${colors.reset}`);
        } else {
            console.error(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.red}${langSync.console?.player?.trackException?.replace('{guildId}', player?.guildId || 'unknown').replace('{message}', errorMsg) || `Track Exception for guild ${player?.guildId \vert{}\vert{} 'unknown'}:${errorMsg}`}${colors.reset}`);
        }
        
        const channel = client.channels.cache.get(player?.textChannel);
        if (channel) {
            const lang = await getLang(player.guildId).catch(() => ({ console: { player: {} } }));
            const t = lang.console?.player || {};
            
            let errorMessage = t.trackError?.message || 'Failed to load the