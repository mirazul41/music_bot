const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const express = require('express');
require('dotenv').config();

// 1. Render Port Server Setup
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('DARK X MUSIC Bot is Live 24/7!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// 2. Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 3. Initialize Discord Player with stable ytdl options
const player = new Player(client, {
    ytdlOptions: {
        filter: 'audioonly',
        highWaterMark: 1 << 25,
        quality: 'highestaudio'
    }
});

// Load Default Extractors
(async () => {
    await player.extractors.loadDefault();
})();

// Player Error Handlers
player.events.on('error', (queue, error) => {
    console.log(`[Queue Error] ${error.message}`);
});

player.events.on('playerError', (queue, error) => {
    console.log(`[Player Error] ${error.message}`);
});

// Track Start Notification
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎶 Now Playing')
        .setDescription(`**[${track.title}](${track.url})**\n\nRequested by: ${track.requestedBy}`)
        .setThumbnail(track.thumbnail)
        .setFooter({ text: `Duration: ${track.duration}` });

    if (queue.metadata && queue.metadata.channel) {
        queue.metadata.channel.send({ embeds: [embed] }).catch(() => {});
    }
});

client.once('ready', async () => {
    console.log(`✅ Bot successfully logged in as: ${client.user.tag}`);

    const commands = [
        {
            name: 'join',
            description: 'Voice channel-e join korbe ebong music control panel anbe'
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✅ Slash command /join globally registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'join') {
            const memberVoiceChannel = interaction.member.voice.channel;

            if (!memberVoiceChannel) {
                return interaction.reply({ content: '❌ Aponi kono voice channel-e nei!', flags: 64 });
            }

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('🎧 DARK X MUSIC CONTROL PANEL')
                .setDescription('Nicher button gulo bebohar kore music control korun ba gan khujun.')
                .setFooter({ text: 'Powered by DARK X CHEATS' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('play_search').setLabel('🔍 Play Song').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('pause_resume').setLabel('⏯️ Pause/Resume').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    if (interaction.isButton()) {
        const queue = player.nodes.get(interaction.guildId);

        if (interaction.customId === 'play_search') {
            const modal = new ModalBuilder()
                .setCustomId('search_modal')
                .setTitle('Search & Play Song');

            const songInput = new TextInputBuilder()
                .setCustomId('song_query')
                .setLabel('Ganer nam ba YouTube link din:')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. Faded - Alan Walker')
                .setRequired(true);

            const modalRow = new ActionRowBuilder().addComponents(songInput);
            modal.addComponents(modalRow);

            return interaction.showModal(modal);
        }

        if (interaction.customId === 'pause_resume') {
            if (!queue || !queue.isPlaying()) {
                return interaction.reply({ content: '❌ Kono gan cholche na!', flags: 64 });
            }
            const paused = queue.node.toggle();
            return interaction.reply({ content: paused ? '⏸️ Music Pause kora hoyeche.' : '▶️ Music Resume kora hoyeche.', flags: 64 });
        }

        if (interaction.customId === 'skip') {
            if (!queue || !queue.isPlaying()) {
                return interaction.reply({ content: '❌ Skip korar jonno kono gan nei!', flags: 64 });
            }
            queue.node.skip();
            return interaction.reply({ content: '⏭️ Gan-ti Skip kora hoyeche.', flags: 64 });
        }

        if (interaction.customId === 'stop') {
            if (!queue) {
                return interaction.reply({ content: '❌ Player bondho-i ache!', flags: 64 });
            }
            queue.delete();
            return interaction.reply({ content: '⏹️ Music Stop kora hoyeche ebong queue clear kora hoyeche.', flags: 64 });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'search_modal') {
            await interaction.deferReply({ flags: 64 });

            const query = interaction.fields.getTextInputValue('song_query');
            const voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                return interaction.editReply({ content: '❌ Aponake obosshoi ekta voice channel-e thaktek hobe!' });
            }

            try {
                // Direct clean search without complex wrappers
                const searchResult = await player.search(query, {
                    requestedBy: interaction.user
                });

                if (!searchResult || !searchResult.tracks.length) {
                    return interaction.editReply({ content: `❌ Kono gan paowa jayni: **${query}**` });
                }

                const { track } = await player.play(voiceChannel, searchResult, {
                    nodeOptions: {
                        metadata: { channel: interaction.channel },
                        leaveOnEnd: false,
                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 300000,
                        selfDeaf: true,
                        repeatMode: 3
                    }
                });

                return interaction.editReply({ content: `✅ Queue-te add hoyeche: **${track.title}**` });
            } catch (error) {
                console.error(error);
                return interaction.editReply({ content: `❌ Gan play korar somoy error hoyeche: ${error.message}` });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
