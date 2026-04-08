const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

const PREFIX = '+';
const DATA_FILE = path.join(__dirname, 'data.json');

// --- Data helpers ---
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getGuildData(guildId) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = { botRole: null, modRole: null, watchList: [] };
  return { data, guildData: data[guildId] };
}

function updateGuildData(guildId, updates) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = { botRole: null, modRole: null, watchList: [] };
  Object.assign(data[guildId], updates);
  saveData(data);
}

// --- Permission helpers ---
function hasBotRole(member, guildData) {
  if (!guildData.botRole) return false;
  return member.roles.cache.has(guildData.botRole);
}

function hasModRole(member, guildData) {
  if (!guildData.modRole) return false;
  return member.roles.cache.has(guildData.modRole);
}

function isOwner(member) {
  return member.guild.ownerId === member.id;
}

// --- Watch log helper ---
async function logWatch(guild, userId, description) {
  const { guildData } = getGuildData(guild.id);
  if (!guildData.watchList || !guildData.watchList.includes(userId)) return;
  if (!guildData.watchLogChannel) return;

  const channel = guild.channels.cache.get(guildData.watchLogChannel);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('👁️ Watch Log')
    .setDescription(description)
    .setColor(0xff4444)
    .setTimestamp();

  try { await channel.send({ embeds: [embed] }); } catch {}
}

// --- Events ---
client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

// Watch: message
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const { guildData } = getGuildData(message.guild.id);
  if (guildData.watchList?.includes(message.author.id)) {
    await logWatch(
      message.guild,
      message.author.id,
      `📨 **Message** from <@${message.author.id}> in <#${message.channel.id}>:\n${message.content || '*[no text content]*'}`
    );
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Command router
  const handler = commands[command];
  if (handler) {
    try { await handler(message, args, guildData); }
    catch (err) {
      console.error(err);
      message.reply('something broke. classic.');
    }
  }
});

// Watch: nickname / username change
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.nickname !== newMember.nickname) {
    await logWatch(
      newMember.guild,
      newMember.id,
      `✏️ **Nickname changed** for <@${newMember.id}>:\n**Before:** ${oldMember.nickname || '*none*'}\n**After:** ${newMember.nickname || '*none*'}`
    );
  }
});

// Watch: avatar change
client.on('userUpdate', async (oldUser, newUser) => {
  if (oldUser.avatar !== newUser.avatar) {
    for (const [, guild] of client.guilds.cache) {
      const member = guild.members.cache.get(newUser.id);
      if (!member) continue;
      await logWatch(
        guild,
        newUser.id,
        `🖼️ **Avatar changed** for <@${newUser.id}>\nNew avatar: ${newUser.displayAvatarURL()}`
      );
    }
  }
});

// Watch: reactions
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (!reaction.message.guild) return;
  await logWatch(
    reaction.message.guild,
    user.id,
    `👍 **Reaction added** by <@${user.id}> in <#${reaction.message.channel.id}>: ${reaction.emoji.toString()}`
  );
});

// Watch: message delete
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  await logWatch(
    message.guild,
    message.author?.id,
    `🗑️ **Message deleted** from <@${message.author?.id}> in <#${message.channel.id}>:\n${message.content || '*[unknown content]*'}`
  );
});

// Watch: message edit
client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await logWatch(
    newMessage.guild,
    newMessage.author?.id,
    `✏️ **Message edited** by <@${newMessage.author?.id}> in <#${newMessage.channel.id}>:\n**Before:** ${oldMessage.content || '*unknown*'}\n**After:** ${newMessage.content}`
  );
});

// --- Commands ---
const commands = {

  ping: async (message) => {
    await message.reply(`yeah yeah yeah - I'm alive. I guess.`);
  },

  changerole: async (message, args, guildData) => {
    if (!isOwner(message.member)) return message.reply('owners only. sit down.');
    const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name === args.join(' '));
    if (!role) return message.reply('mention a valid role, genius.');
    updateGuildData(message.guild.id, { botRole: role.id });
    message.reply(`bot management role set to **${role.name}**. congrats.`);
  },

  modrole: async (message, args, guildData) => {
    if (!isOwner(message.member)) return message.reply('owners only. sit down.');
    const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name === args.join(' '));
    if (!role) return message.reply('mention a valid role.');
    updateGuildData(message.guild.id, { modRole: role.id });
    message.reply(`mod role set to **${role.name}**. try not to abuse it.`);
  },

  avatar: async (message, args, guildData) => {
    if (!hasBotRole(message.member, guildData)) return message.reply('you don\'t have the role for that. tough luck.');
    const attachment = message.attachments.first();
    if (!attachment) return message.reply('attach an image, rocket scientist.');
    try {
      await client.user.setAvatar(attachment.url);
      message.reply('avatar updated. stunning.');
    } catch (e) {
      message.reply(`failed: ${e.message}`);
    }
  },

  nickname: async (message, args, guildData) => {
    if (!hasBotRole(message.member, guildData)) return message.reply('no role, no nickname change. simple math.');
    const nick = args.join(' ');
    if (!nick) return message.reply('give me a name at least.');
    try {
      await message.guild.members.me.setNickname(nick);
      message.reply(`nickname changed to **${nick}**. creative choice.`);
    } catch (e) {
      message.reply(`failed: ${e.message}`);
    }
  },

  ban: async (message, args, guildData) => {
    if (!hasModRole(message.member, guildData)) return message.reply('not a mod. next.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone to ban.');
    if (!target.bannable) return message.reply('can\'t ban that person. they outrank me.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try {
      await target.ban({ reason });
      message.reply(`**${target.user.tag}** has been banned. bye bye. 👋`);
    } catch (e) {
      message.reply(`ban failed: ${e.message}`);
    }
  },

  kick: async (message, args, guildData) => {
    if (!hasModRole(message.member, guildData)) return message.reply('not a mod. sit.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone to kick.');
    if (!target.kickable) return message.reply('can\'t kick that person.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try {
      await target.kick(reason);
      message.reply(`**${target.user.tag}** has been kicked. see ya. 🚪`);
    } catch (e) {
      message.reply(`kick failed: ${e.message}`);
    }
  },

  timeout: async (message, args, guildData) => {
    if (!hasModRole(message.member, guildData)) return message.reply('not a mod. no.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone to timeout.');
    // Default timeout: 10 minutes
    const duration = parseInt(args[1]) || 10;
    try {
      await target.timeout(duration * 60 * 1000, `Timed out by ${message.author.tag}`);
      message.reply(`**${target.user.tag}** is in timeout for ${duration} minute(s). think about what you did. 🔇`);
    } catch (e) {
      message.reply(`timeout failed: ${e.message}`);
    }
  },

  watch: async (message, args, guildData) => {
    if (!hasModRole(message.member, guildData)) return message.reply('mods only for watch commands.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone to watch.');

    const currentList = guildData.watchList || [];
    const isWatched = currentList.includes(target.id);

    let newList;
    if (isWatched) {
      newList = currentList.filter(id => id !== target.id);
      updateGuildData(message.guild.id, { watchList: newList });
      message.reply(`**${target.user.tag}** removed from watch list. they can breathe now.`);
    } else {
      newList = [...currentList, target.id];
      updateGuildData(message.guild.id, { watchList: newList });

      // If no log channel set, use current channel
      if (!guildData.watchLogChannel) {
        updateGuildData(message.guild.id, { watchLogChannel: message.channel.id });
        message.reply(`**${target.user.tag}** is now being watched. logs → this channel. 👁️`);
      } else {
        message.reply(`**${target.user.tag}** is now being watched. 👁️`);
      }
    }
  },

  watchlog: async (message, args, guildData) => {
    if (!hasModRole(message.member, guildData)) return message.reply('mods only.');
    const channel = message.mentions.channels.first() || message.channel;
    updateGuildData(message.guild.id, { watchLogChannel: channel.id });
    message.reply(`watch logs will go to <#${channel.id}>. enjoy the surveillance.`);
  },

  send: async (message, args, guildData) => {
    if (!hasModRole(message.member, guildData)) return message.reply('mods only.');
    // +send #channel message here
    const targetChannel = message.mentions.channels.first();
    if (!targetChannel) return message.reply('mention a channel first. like `+send #channel your message`');
    // Remove the channel mention from args
    const msgContent = message.content
      .slice(PREFIX.length + 'send'.length)
      .replace(/<#\d+>/g, '')
      .trim();
    if (!msgContent) return message.reply('give me something to say.');
    try {
      await targetChannel.send(msgContent);
      message.reply(`sent. ✅`);
    } catch (e) {
      message.reply(`couldn't send: ${e.message}`);
    }
  },

};

client.login(process.env.BOT_TOKEN);
