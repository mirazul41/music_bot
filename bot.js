const { Client, GatewayIntentBits, Collection } = require("discord.js");
const config = require("./config.js");
const fs = require("fs");
const path = require('path');
const { initializePlayer } = require('./player');
require('dotenv').config();

const client = new Client({
    intents: Object.keys(GatewayIntentBits).map((a) => {
        return GatewayIntentBits[a];
    }),
});

client.config = config;
client.commands = new Collection();
client.commandsArray = [];

process.on('unhandledRejection', (error) => {
    console.warn('[ ERROR ] Unhandled Rejection:', error?.message || error);
});

process.on('uncaughtException', (error) => {
    console.warn('[ ERROR ] Uncaught Exception:', error?.message || error);
});

initializePlayer(client).catch(error => {
    console.error(`[ LAVALINK ] Error initializing player: ${error.message}`);
});

client.on("clientReady", async () => {
    console.log(`[ SYSTEM ] Client logged in as client: ${client.user.tag}`);
    console.log(`[ MUSIC ] Riffy Music System Ready 🎵`);
   
    if (client.riffy) {
        try {
            client.riffy.init(client.user.id);
            console.log(`[ LAVALINK ] Riffy Manager Initialized successfully.`);
        } catch (e) {
            console.error(`[ LAVALINK ] Failed to initialize Riffy:`, e.message);
        }
    }

    // Direct Slash Commands Registration
    try {
        const { REST, Routes } = require('discord.js');
        const botToken = process.env.TOKEN || config.TOKEN;
        
        if (botToken && client.commandsArray.length > 0) {
            const rest = new REST({ version: '10' }).setToken(botToken);
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: client.commandsArray },
            );
            console.log(`[ COMMANDS ] Successfully reloaded ${client.commandsArray.length} slash commands globally!`);
        } else {
            console.log(`[ COMMANDS ] Commands array is empty or token not found for REST reload.`);
        }
    } catch (error) {
        console.error(`[ COMMANDS ] Failed to reload slash commands: ${error.message}`);
    }
});
    // Register Slash Commands safely using client.token
    try {
        const { REST, Routes } = require('discord.js');
        const token = client.token || config.TOKEN || process.env.TOKEN;
        
        if (token && client.commandsArray.length > 0) {
            const rest = new REST({ version: '10' }).setToken(token);
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: client.commandsArray },
            );
            console.log(`[ COMMANDS ] Successfully reloaded ${client.commandsArray.length} application slash commands.`);
        } else {
            console.warn(`[ COMMANDS ] Skipping slash command reload: Token missing or no commands loaded.`);
        }
    } catch (error) {
        console.error(`[ COMMANDS ] Failed to reload slash commands: ${error.message}`);
    }
});

// Load Commands from directories
const loadCommands = () => {
  const commandsDir = path.resolve(__dirname, config.commandsDir || './commands');
  if (!fs.existsSync(commandsDir)) return;
  
  const loadCommandsFromDir = (dir) => {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        loadCommandsFromDir(fullPath);
      } else if (item.isFile() && item.name.endsWith('.js')) {
        try {
          const command = require(path.resolve(fullPath));
          if (command.data && command.run) {
            client.commands.set(command.data.name, command);
            client.commandsArray.push(command.data.toJSON());
          }
        } catch (error) {
          console.error(`Error loading command ${item.name}: ${error.message}`);
        }
      }
    }
  };
  
  loadCommandsFromDir(commandsDir);
  console.log(`[ COMMANDS ] Total Commands Loaded: ${client.commands.size}`);
};

loadCommands();

// Interaction Create Handler (Fixes "The application did not respond")
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.run(client, interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true }).catch(() => {});
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true }).catch(() => {});
        }
    }
});

client.on("raw", (d) => {
    const { GatewayDispatchEvents } = require("discord.js");
    if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
    if (client.riffy) {
        client.riffy.updateVoiceState(d);
    }
});

client.login(config.TOKEN || process.env.TOKEN).catch((e) => {
  console.error(`[ TOKEN ] Authentication Failed ❌ Error: ${e.message}`);
});

const connectToDatabase = async () => {
    console.log('[ DATABASE ] MongoDB Bypass Active ✅');
};

connectToDatabase().catch(() => {});

const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('DARK X MUSIC Bot is Live 24/7!');
});

app.listen(port, () => {
    console.log('\n' + '─'.repeat(40));
    console.log(`🌐 SERVER STATUS`);
    console.log('─'.repeat(40));
    console.log(`[ SERVER ] Online ✅`);
    console.log(`[ PORT ] Port: ${port}`);
    console.log(`[ TIME ] ${new Date().toISOString().replace('T', ' ').split('.')[0]}`);
});
