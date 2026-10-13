require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

// Discord Client Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Music Player Setup
const player = new Player(client);

// Extractor Load & Register Slash Command
client.once('clientReady', async () => {
    try {
        await player.extractors.loadMulti(DefaultExtractors);
        console.log(`✅ Bot successfully logged in as: ${client.user.tag}`);

        // Slash command /join register kora
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const commands = [
            new SlashCommandBuilder()
                .setName('join')
                .setDescription('join your voice channel')
        ];

        // গ্লোবালি স্ল্যাশ কমান্ড রেজিস্টার করা
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Slash command /join globally registered successfully!');
    } catch (error) {
        console.error('❌ Setup error:', error);
    }
});

const autoplayMap = new Map();

// Control Panel Buttons
function getControlButtons(guildId) {
    const isAutoplay = autoplayMap.get(guildId) || false;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_open_search')
            .setLabel('🔎 Search & Play Song')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_pause_resume')
            .setLabel('⏯️ Pause / Resume')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_skip')
            .setLabel('⏭️ Skip')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_stop')
            .setLabel('⏹️ Stop & Leave')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('btn_autoplay')
            .setLabel(isAutoplay ? '🔁 Autoplay: ON' : '🔁 Autoplay: OFF')
            .setStyle(isAutoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    return [row1, row2];
}

// Interaction Handlers (Slash Command, Modal & Buttons)
client.on('interactionCreate', async (interaction) => {

    // A. Slash Command (/join) - বটের নামসহ শো করবে
    if (interaction.isChatInputCommand() && interaction.commandName === 'join') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ আপনাকে প্রথমে একটি Voice Channel-এ জয়েন করতে হবে!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#00ffcc')
            .setTitle(`🎶 ${client.user.username.toUpperCase()} - MUSIC PANEL`)
            .setDescription(`বট ভয়েস চ্যানেল **${voiceChannel.name}**-এ জয়েন করেছে!\nগান বাজাতে নিচের **🔎 Search & Play Song** বাটনে ক্লিক করুন।`)
            .setFooter({ text: 'এই প্যানেল থেকেই সমস্ত গান নিয়ন্ত্রণ করতে পারবেন।' });

        return interaction.reply({
            embeds: [embed],
            components: getControlButtons(interaction.guild.id)
        });
    }

    // B. "Search & Play Song" Button Click -> Popup Modal (পপ-আপ বক্স)
    if (interaction.isButton() && interaction.customId === 'btn_open_search') {
        const modal = new ModalBuilder()
            .setCustomId('modal_song_search')
            .setTitle('🎵 Search & Play Music Box');

        const songInput = new TextInputBuilder()
            .setCustomId('input_song_name')
            .setLabel('গানের নাম বা ইউটিউব লিংক দিন:')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('যেমন: Shape of you')
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(songInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
    }

    // C. Modal Form Submit -> Play Music & Show Details
    if (interaction.isModalSubmit() && interaction.customId === 'modal_song_search') {
        const query = interaction.fields.getTextInputValue('input_song_name');
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ আপনাকে ভয়েস চ্যানেলে থাকতে হবে!', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (queue && queue.isPlaying()) {
                queue.delete();
            }

            const result = await player.play(voiceChannel, query, {
                nodeOptions: {
                    metadata: interaction.channel,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 300000
                }
            });

            const embed = new EmbedBuilder()
                .setColor('#00ffcc')
                .setTitle(`🎶 ${client.user.username.toUpperCase()} - CURRENTLY PLAYING`)
                .setDescription(`**Song Name:** [${result.track.title}](${result.track.url})\n**Voice Channel:** ${voiceChannel.name}`)
                .addFields(
                    { name: '⏱️ Duration', value: result.track.duration, inline: true },
                    { name: '👤 Requested By', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setThumbnail(result.track.thumbnail)
                .setFooter({ text: 'Control options below: Search, Pause, Skip, Stop, Autoplay' });

            return interaction.editReply({
                embeds: [embed],
                components: getControlButtons(interaction.guild.id)
            });

        } catch (error) {
            console.error('Play error:', error);
            return interaction.editReply({ content: '❌ গানটি চালানো সম্ভব হয়নি!' });
        }
    }

    // D. Control Buttons Handler (Pause, Skip, Stop, Autoplay)
    if (interaction.isButton()) {
        const queue = player.nodes.get(interaction.guild.id);

        if (interaction.customId !== 'btn_open_search' && (!queue || !queue.isPlaying())) {
            return interaction.reply({ content: '❌ বর্তমানে কোনো গান চলছে না!', ephemeral: true });
        }

        try {
            if (interaction.customId === 'btn_pause_resume') {
                if (queue.node.isPaused()) {
                    queue.node.resume();
                    await interaction.reply({ content: '▶️ গান আবার প্লে করা হয়েছে!', ephemeral: true });
                } else {
                    queue.node.pause();
                    await interaction.reply({ content: '⏸️ গান পজ করা হয়েছে!', ephemeral: true });
                }
            } else if (interaction.customId === 'btn_skip') {
                queue.node.skip();
                await interaction.reply({ content: '⏭️ গানটি স্কিপ করা হয়েছে!', ephemeral: true });
            } else if (interaction.customId === 'btn_stop') {
                queue.delete();
                await interaction.reply({ content: '⏹️ মিউজিক বন্ধ করা হয়েছে এবং বট চ্যানেল ছেড়ে চলে গেছে!', ephemeral: true });
            } else if (interaction.customId === 'btn_autoplay') {
                const current = autoplayMap.get(interaction.guild.id) || false;
                const nextState = !current;
                autoplayMap.set(interaction.guild.id, nextState);
                queue.repeatMode = nextState ? 3 : 0;

                await interaction.update({ components: getControlButtons(interaction.guild.id) });
            }
        } catch (e) {
            console.error('Button error:', e);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
