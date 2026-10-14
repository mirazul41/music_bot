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
        await interaction.deferReply({ ephemeral: false });

        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.editReply({ content: '❌ You need to join a voice channel first!' });
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

            if (loadType === 'loadFailed') {
                if (!player.queue.size) player.destroy();
                return interaction.editReply({ content: '❌ Error getting the song.' });
            }

            if (loadType === 'empty') {
                if (!player.queue.size) player.destroy();
                return interaction.editReply({ content: '❌ No results found.' });
            }

            if (loadType === 'track') {
                player.queue.add(tracks[0]);
                if (!player.playing && !player.paused) player.play();
                return interaction.editReply({ content: `🎶 Added **[${tracks[0].info.title}](${tracks[0].info.uri})** to the queue!` });
            } else if (loadType === 'search') {
                player.queue.add(tracks[0]);
                if (!player.playing && !player.paused) player.play();
                return interaction.editReply({ content: `🎶 Added **[${tracks[0].info.title}](${tracks[0].info.uri})** to the queue!` });
            } else if (loadType === 'playlist') {
                for (const track of tracks) {
                    player.queue.add(track);
                }
                if (!player.playing && !player.paused) player.play();
                return interaction.editReply({ content: `🎶 Added playlist **${playlistInfo.name}** (${tracks.length} tracks) to the queue!` });
            } else {
                return interaction.editReply({ content: '❌ No results found.' });
            }

        } catch (error) {
            console.error(error);
            return interaction.editReply({ content: '❌ An error occurred while processing your request.' });
        }
    }
};
