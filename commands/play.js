const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song in your voice channel')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song name or URL to play')
                .setRequired(true)),
    async run(client, interaction) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: false }).catch(() => {});
        }

        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.editReply({ content: '❌ You need to join a voice channel first!' }).catch(() => {});
        }

        const query = interaction.options.getString('query');

        try {
            let player = client.riffy.players.get(interaction.guildId);

            if (!player) {
                player = client.riffy.createConnection({
                    guildId: interaction.guildId,
                    voiceChannel: channel.id,
                    textChannel: interaction.channel.id,
                    deaf: true
                });
            }

            const resolve = await client.riffy.resolve({ query: query, requester: interaction.user });
            const { loadType, tracks, playlistInfo } = resolve;

            if (loadType === 'loadFailed' || loadType === 'empty' || !tracks || tracks.length === 0) {
                if (player && !player.queue.size) player.destroy();
                return interaction.editReply({ content: '❌ No results found or error loading song.' }).catch(() => {});
            }

            if (loadType === 'track' || loadType === 'search') {
                player.queue.add(tracks[0]);
                if (!player.playing && !player.paused) player.play();
                return interaction.editReply({ content: `🎶 Added **[${tracks[0].info.title}](${tracks[0].info.uri})** to the queue!` }).catch(() => {});
            } else if (loadType === 'playlist') {
                for (const track of tracks) {
                    player.queue.add(track);
                }
                if (!player.playing && !player.paused) player.play();
                return interaction.editReply({ content: `🎶 Added playlist **${playlistInfo.name}** (${tracks.length} tracks) to the queue!` }).catch(() => {});
            } else {
                return interaction.editReply({ content: '❌ No results found.' }).catch(() => {});
            }

        } catch (error) {
            console.error('Play command error:', error);
            return interaction.editReply({ content: '❌ An error occurred while processing your request.' }).catch(() => {});
        }
    }
};
