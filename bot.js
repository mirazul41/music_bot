const { Client, GatewayIntentBits } = require("discord.js");
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

process.on('unhandledRejection', (error) => {
    console.warn('[ ERROR ] Unhandled Rejection:', error?.message || error);
});

process.on('uncaughtException', (error) => {
    console.warn('[ ERROR ] Uncaught Exception:', error?.message || error);
});

initializePlayer(client).catch(error => {
    console.error(`[ LAVALINK ] Error initializing player: ${error.message}`);
});

client.on("clientReady", () => {
    console.log(`[ SYSTEM ] Client logged in as ${client.user.tag}`);
    console.log(`[ MUSIC ] Riffy Music System Ready 🎵`);
   
    if (client.riffy) {
        try {
            client.riffy.init(client.user.id);
            console.log(`[ LAVALINK ] Riffy Manager Initialized successfully.`);
        } catch (e) {
            console.error(`[ LAVALINK ] Failed to initialize Riffy:`, e.message);
        }
    }
});

client.commands = new Map();
client.commandsArray = [];

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

// Database Dummy Connection to avoid missing module errors
const connectToDatabase = async () => {
    console.log('[ DATABASE ] MongoDB Bypass Active ✅');
};

connectToDatabase().catch(() => {});

// Render Dynamic Port Express Server Setup
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
