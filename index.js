// index.js
require('dotenv').config(); // Loads variables from .env (only for local dev)

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require("openai");

// Create OpenAI client (v4 style)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY   // Key comes from .env or Railway Variables
});

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Simple moderation tracking
const violations = new Map();
const blockedUsers = new Set();
const BLOCK_AFTER = 3;

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.mentions.has(client.user)) return;

    const userId = msg.author.id;
    if (blockedUsers.has(userId)) {
      return msg.reply("🚫 You are blocked from using this bot due to repeated inappropriate messages.");
    }

    // Clean mention
    const mentionRegex = new RegExp(`<@!?${client.user.id}>`, "g");
    const userMessage = msg.content.replace(mentionRegex, "").trim();
    if (!userMessage) return;

    // Moderation check
    const mod = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: userMessage
    });

    if (mod.results[0].flagged) {
      const strikes = (violations.get(userId) || 0) + 1;
      violations.set(userId, strikes);

      if (strikes >= BLOCK_AFTER) {
        blockedUsers.add(userId);
        return msg.reply("🚫 user.. asked an inappropriate question multiple times and is now blocked.");
      }
      return msg.reply("⚠️ user.. asked an inappropriate question and will not be generated.");
    }

    // 🔹 Inject today's date
    const today = new Date();
    const formattedDate = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    // Send placeholder message
    const thinkingMsg = await msg.reply("💭 Generating message...");

    // Chat completion with date injected
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: `Today’s real date is ${formattedDate}. Use this if the user asks about today's date.` },
        { role: "user", content: userMessage }
      ],
      max_tokens: 300
    });

    const response = completion.choices[0].message.content.trim();

    // Edit placeholder with response
    await thinkingMsg.edit(response || "⚠️ Sorry, I couldn’t generate a response.");
  } catch (err) {
    console.error("Bot error:", err);
    msg.reply("⚠️ I hit an error while processing that.");
  }
});

// 🔹 Use env var for login token
client.login(process.env.DISCORD_TOKEN);
