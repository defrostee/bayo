const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  REST, Routes, SlashCommandBuilder, ApplicationCommandType,
  PermissionsBitField, AttachmentBuilder
} = require('discord.js');
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

// ─── Colors ───────────────────────────────────────────────────────────────────
const COLOR = {
  success: 0x57f287,
  error:   0xed4245,
  info:    0x5865f2,
  warn:    0xfee75c,
  watch:   0xff4444,
};

// ─── Embed helpers ────────────────────────────────────────────────────────────
function embed(color, title, description, fields = []) {
  const e = new EmbedBuilder().setColor(color).setDescription(description).setTimestamp();
  if (title) e.setTitle(title);
  if (fields.length) e.addFields(fields);
  return e;
}
const ok   = (desc, fields) => embed(COLOR.success, null, `✅ ${desc}`, fields);
const err  = (desc, fields) => embed(COLOR.error,   null, `❌ ${desc}`, fields);
const info = (desc, fields) => embed(COLOR.info,    null, `ℹ️ ${desc}`, fields);
const warn = (desc, fields) => embed(COLOR.warn,    null, `⚠️ ${desc}`, fields);

// ─── Data helpers ─────────────────────────────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function getGuildData(guildId) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = { botRole: null, modRole: null, watchList: [], watchLogChannel: null };
  return { data, guildData: data[guildId] };
}
function updateGuildData(guildId, updates) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = { botRole: null, modRole: null, watchList: [], watchLogChannel: null };
  Object.assign(data[guildId], updates);
  saveData(data);
}

// ─── Permission helpers ───────────────────────────────────────────────────────
function hasBotRole(member, guildData) {
  if (!guildData.botRole) return false;
  return member.roles.cache.has(guildData.botRole);
}
function hasModRole(member, guildData) {
  if (!guildData.modRole) return false;
  return member.roles.cache.has(guildData.modRole);
}
function isOwner(member) { return member.guild.ownerId === member.id; }

// ─── Watch log ────────────────────────────────────────────────────────────────
async function logWatch(guild, userId, description) {
  const { guildData } = getGuildData(guild.id);
  if (!guildData.watchList?.includes(userId)) return;
  if (!guildData.watchLogChannel) return;
  const channel = guild.channels.cache.get(guildData.watchLogChannel);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed(COLOR.watch, '👁️ Watch Log', description)] });
  } catch {}
}

// ─── Slash command definitions ────────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is alive'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all commands'),

  new SlashCommandBuilder()
    .setName('changerole')
    .setDescription('Set the role that can change bot appearance (owner only)')
    .addRoleOption(o => o.setName('role').setDescription('The role to set').setRequired(true)),

  new SlashCommandBuilder()
    .setName('modrole')
    .setDescription('Set the moderator role (owner only)')
    .addRoleOption(o => o.setName('role').setDescription('The role to set').setRequired(true)),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Change the bot\'s avatar')
    .addAttachmentOption(o => o.setName('image').setDescription('New avatar image').setRequired(true)),

  new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Change the bot\'s nickname')
    .addStringOption(o => o.setName('nickname').setDescription('The new nickname').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for ban').setRequired(false)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for kick').setRequired(false)),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member')
    .addUserOption(o => o.setName('user').setDescription('User to timeout').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes (default: 10)').setRequired(false).setMinValue(1).setMaxValue(40320)),

  new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Toggle watch on a member (logs all their activity)')
    .addUserOption(o => o.setName('user').setDescription('User to watch/unwatch').setRequired(true)),

  new SlashCommandBuilder()
    .setName('watchlog')
    .setDescription('Set the channel for watch logs')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send logs to').setRequired(false)),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a message as the bot to a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true)),

  new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give a role to a user')
    .addUserOption(o => o.setName('user').setDescription('User to give the role to').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true)),

  new SlashCommandBuilder()
    .setName('slog')
    .setDescription('Set the channel for mod command logs (owner only)')
    .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('swatch')
    .setDescription('Set the channel for watch list logs (owner only)')
    .addChannelOption(o => o.setName('channel').setDescription('Watch log channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('wdm')
    .setDescription('Toggle welcome DMs on or off (owner only)')
    .addStringOption(o => o.setName('toggle').setDescription('on or off').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),

  new SlashCommandBuilder()
    .setName('edm')
    .setDescription('DM every member in the server with a message (owner only)')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true)),
].map(cmd => cmd.toJSON());

// ─── Register slash commands ──────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ Slash commands registered globally');
  } catch (e) {
    console.error('Failed to register slash commands:', e);
  }
});

// ─── Help embed ───────────────────────────────────────────────────────────────
function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR.info)
    .setTitle('📖 Command List')
    .setDescription('Prefix: `+` | All commands also available as `/`')
    .addFields(
      {
        name: '⚙️ Owner Only',
        value: [
          '`+changerole @role` — Set the bot management role',
          '`+modrole @role` — Set the mod role',
          '`+slog #channel` — Set mod command log channel',
          '`+swatch #channel` — Set watch list log channel',
          '`+wdm on/off` — Toggle welcome DMs',
          '`+edm <message>` — DM every member in the server',
        ].join('\n'),
      },
      {
        name: '🎨 Bot Management (Bot Role)',
        value: [
          '`+avatar` + attachment — Change bot avatar',
          '`+nickname <name>` — Change bot nickname',
        ].join('\n'),
      },
      {
        name: '🔨 Moderation (Mod Role)',
        value: [
          '`+ban @user [reason]` — Ban a member',
          '`+kick @user [reason]` — Kick a member',
          '`+timeout @user [minutes]` — Timeout a member (default: 10m)',
          '`+watch @user` — Toggle watch on a member',
          '`+watchlog [#channel]` — Set watch log channel',
          '`+send #channel <message>` — Send a message as the bot',
          '`+giverole @user @role` — Give a role to a user',
        ].join('\n'),
      },
      {
        name: '🌐 General',
        value: '`+ping` — Check if bot is alive',
      }
    )
    .setTimestamp();
}

// ─── Shared logic ─────────────────────────────────────────────────────────────
async function handlePing(reply) {
  await reply({ embeds: [embed(COLOR.success, null, "yeah yeah yeah - I'm alive. I guess.")] });
}

async function handleHelp(reply) {
  await reply({ embeds: [buildHelpEmbed()] });
}

async function handleChangerole(member, role, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only. sit down.')], ephemeral: true });
  updateGuildData(member.guild.id, { botRole: role.id });
  await reply({ embeds: [ok(`Bot management role set to **${role.name}**.`)] });
}

async function handleModrole(member, role, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only. sit down.')], ephemeral: true });
  updateGuildData(member.guild.id, { modRole: role.id });
  await reply({ embeds: [ok(`Mod role set to **${role.name}**. try not to abuse it.`)] });
}

async function handleAvatar(member, guildData, imageUrl, reply) {
  if (!hasBotRole(member, guildData)) return reply({ embeds: [err("you don't have the role for that. tough luck.")], ephemeral: true });
  try {
    await client.user.setAvatar(imageUrl);
    await reply({ embeds: [ok('Avatar updated. stunning.')] });
  } catch (e) {
    await reply({ embeds: [err(`Failed: ${e.message}`)] });
  }
}

async function handleNickname(member, guildData, nick, reply) {
  if (!hasBotRole(member, guildData)) return reply({ embeds: [err('no role, no nickname change. simple math.')], ephemeral: true });
  try {
    await member.guild.members.me.setNickname(nick);
    await reply({ embeds: [ok(`Nickname changed to **${nick}**. creative choice.`)] });
  } catch (e) {
    await reply({ embeds: [err(`Failed: ${e.message}`)] });
  }
}

async function handleBan(member, guildData, target, reason, reply) {
  if (!hasModRole(member, guildData)) return reply({ embeds: [err('not a mod. next.')], ephemeral: true });
  if (!target.bannable) return reply({ embeds: [err("can't ban that person. they outrank me.")], ephemeral: true });
  try {
    await target.ban({ reason: reason || 'No reason provided' });
    await reply({ embeds: [ok(`**${target.user.tag}** has been banned. bye bye. 👋`, [{ name: 'Reason', value: reason || 'No reason provided' }])] });
  } catch (e) {
    await reply({ embeds: [err(`Ban failed: ${e.message}`)] });
  }
}

async function handleKick(member, guildData, target, reason, reply) {
  if (!hasModRole(member, guildData)) return reply({ embeds: [err('not a mod. sit.')], ephemeral: true });
  if (!target.kickable) return reply({ embeds: [err("can't kick that person.")], ephemeral: true });
  try {
    await target.kick(reason || 'No reason provided');
    await reply({ embeds: [ok(`**${target.user.tag}** has been kicked. see ya. 🚪`, [{ name: 'Reason', value: reason || 'No reason provided' }])] });
  } catch (e) {
    await reply({ embeds: [err(`Kick failed: ${e.message}`)] });
  }
}

async function handleTimeout(member, guildData, target, minutes, reply) {
  if (!hasModRole(member, guildData)) return reply({ embeds: [err('not a mod. no.')], ephemeral: true });
  const duration = minutes || 10;
  try {
    await target.timeout(duration * 60 * 1000, `Timed out by ${member.user.tag}`);
    await reply({ embeds: [ok(`**${target.user.tag}** is in timeout for **${duration}** minute(s). think about what you did. 🔇`)] });
  } catch (e) {
    await reply({ embeds: [err(`Timeout failed: ${e.message}`)] });
  }
}

async function handleWatch(member, guildData, target, channelId, reply) {
  if (!hasModRole(member, guildData)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  const currentList = guildData.watchList || [];
  const isWatched = currentList.includes(target.id);
  if (isWatched) {
    updateGuildData(member.guild.id, { watchList: currentList.filter(id => id !== target.id) });
    await reply({ embeds: [ok(`**${target.user.tag}** removed from watch list. they can breathe now.`)] });
  } else {
    updateGuildData(member.guild.id, {
      watchList: [...currentList, target.id],
      watchLogChannel: guildData.watchLogChannel || channelId,
    });
    await reply({ embeds: [ok(`**${target.user.tag}** is now being watched. 👁️`)] });
  }
}

async function handleWatchlog(member, guildData, channel, currentChannelId, reply) {
  if (!hasModRole(member, guildData)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  const targetId = channel?.id || currentChannelId;
  updateGuildData(member.guild.id, { watchLogChannel: targetId });
  await reply({ embeds: [ok(`Watch logs will go to <#${targetId}>. enjoy the surveillance.`)] });
}

async function handleSend(member, guildData, targetChannel, msgContent, reply) {
  if (!hasModRole(member, guildData)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  if (!msgContent) return reply({ embeds: [err('give me something to say.')], ephemeral: true });
  try {
    await targetChannel.send(msgContent);
    await reply({ embeds: [ok(`Message sent to <#${targetChannel.id}>. ✅`)], ephemeral: true });
  } catch (e) {
    await reply({ embeds: [err(`Couldn't send: ${e.message}`)] });
  }
}

async function handleGiverole(member, guildData, target, role, reply) {
  if (!hasModRole(member, guildData)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  try {
    await target.roles.add(role);
    await reply({ embeds: [ok(`Gave **${role.name}** to **${target.user.tag}**. enjoy your new rank.`)] });
  } catch (e) {
    await reply({ embeds: [err(`Failed: ${e.message}`)] });
  }
}

async function handleSlog(member, channel, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  updateGuildData(member.guild.id, { modLogChannel: channel.id });
  await reply({ embeds: [ok(`Mod command logs will go to <#${channel.id}>.`)] });
}

async function handleSwatch(member, channel, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  updateGuildData(member.guild.id, { watchLogChannel: channel.id });
  await reply({ embeds: [ok(`Watch list logs will go to <#${channel.id}>. eyes open.`)] });
}

async function handleWdm(member, toggle, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  const on = toggle === 'on';
  updateGuildData(member.guild.id, { welcomeDm: on });
  await reply({ embeds: [ok(`Welcome DMs are now **${on ? 'enabled' : 'disabled'}**.`)] });
}

async function handleEdm(member, msgContent, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  if (!msgContent) return reply({ embeds: [err('give me a message.')], ephemeral: true });
  await reply({ embeds: [info('Sending DMs... this might take a while.')] });
  const members = await member.guild.members.fetch();
  let sent = 0, failed = 0;
  for (const [, m] of members) {
    if (m.user.bot) continue;
    try { await m.send(msgContent); sent++; } catch { failed++; }
    await new Promise(r => setTimeout(r, 500)); // rate limit buffer
  }
  try {
    await member.send({ embeds: [ok(`EDM done. ✅ Sent: **${sent}** | Failed: **${failed}**`)] });
  } catch {}
}

// ─── Slash command handler ────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { guildData } = getGuildData(interaction.guild.id);
  const reply = (opts) => interaction.reply(opts);
  const member = interaction.member;

  switch (interaction.commandName) {
    case 'ping': return handlePing(reply);
    case 'help': return handleHelp(reply);
    case 'changerole': return handleChangerole(member, interaction.options.getRole('role'), reply);
    case 'modrole': return handleModrole(member, interaction.options.getRole('role'), reply);
    case 'avatar': {
      const attachment = interaction.options.getAttachment('image');
      return handleAvatar(member, guildData, attachment.url, reply);
    }
    case 'nickname': return handleNickname(member, guildData, interaction.options.getString('nickname'), reply);
    case 'ban': {
      const target = interaction.options.getMember('user');
      return handleBan(member, guildData, target, interaction.options.getString('reason'), reply);
    }
    case 'kick': {
      const target = interaction.options.getMember('user');
      return handleKick(member, guildData, target, interaction.options.getString('reason'), reply);
    }
    case 'timeout': {
      const target = interaction.options.getMember('user');
      return handleTimeout(member, guildData, target, interaction.options.getInteger('minutes'), reply);
    }
    case 'watch': {
      const target = interaction.options.getMember('user');
      return handleWatch(member, guildData, target, interaction.channelId, reply);
    }
    case 'watchlog': {
      const channel = interaction.options.getChannel('channel');
      return handleWatchlog(member, guildData, channel, interaction.channelId, reply);
    }
    case 'send': {
      const channel = interaction.options.getChannel('channel');
      const msg = interaction.options.getString('message');
      return handleSend(member, guildData, channel, msg, reply);
    }
    case 'giverole': {
      const target = interaction.options.getMember('user');
      const role = interaction.options.getRole('role');
      return handleGiverole(member, guildData, target, role, reply);
    }
    case 'slog': return handleSlog(member, interaction.options.getChannel('channel'), reply);
    case 'swatch': return handleSwatch(member, interaction.options.getChannel('channel'), reply);
    case 'wdm': return handleWdm(member, interaction.options.getString('toggle'), reply);
    case 'edm': return handleEdm(member, interaction.options.getString('message'), reply);
  }
});

// ─── Prefix command handler ───────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const { guildData } = getGuildData(message.guild.id);

  // Watch logging
  if (guildData.watchList?.includes(message.author.id)) {
    await logWatch(message.guild, message.author.id,
      `📨 **Message** from <@${message.author.id}> in <#${message.channel.id}>:\n${message.content || '*[no text content]*'}`
    );
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const reply = (opts) => message.reply(opts);

  try {
    switch (command) {
      case 'ping': return handlePing(reply);
      case 'help': return handleHelp(reply);

      case 'changerole': {
        const role = message.mentions.roles.first();
        if (!role) return reply({ embeds: [err('mention a role. like `+changerole @role`')] });
        return handleChangerole(message.member, role, reply);
      }
      case 'modrole': {
        const role = message.mentions.roles.first();
        if (!role) return reply({ embeds: [err('mention a role. like `+modrole @role`')] });
        return handleModrole(message.member, role, reply);
      }
      case 'avatar': {
        const attachment = message.attachments.first();
        if (!attachment) return reply({ embeds: [err('attach an image, rocket scientist.')] });
        return handleAvatar(message.member, guildData, attachment.url, reply);
      }
      case 'nickname': {
        const nick = args.join(' ');
        if (!nick) return reply({ embeds: [err('give me a name at least.')] });
        return handleNickname(message.member, guildData, nick, reply);
      }
      case 'ban': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to ban.')] });
        const reason = args.slice(1).join(' ');
        return handleBan(message.member, guildData, target, reason, reply);
      }
      case 'kick': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to kick.')] });
        const reason = args.slice(1).join(' ');
        return handleKick(message.member, guildData, target, reason, reply);
      }
      case 'timeout': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to timeout.')] });
        const minutes = parseInt(args[1]) || 10;
        return handleTimeout(message.member, guildData, target, minutes, reply);
      }
      case 'watch': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to watch.')] });
        return handleWatch(message.member, guildData, target, message.channel.id, reply);
      }
      case 'watchlog': {
        const channel = message.mentions.channels.first();
        return handleWatchlog(message.member, guildData, channel, message.channel.id, reply);
      }
      case 'send': {
        const targetChannel = message.mentions.channels.first();
        if (!targetChannel) return reply({ embeds: [err('mention a channel first. like `+send #channel your message`')] });
        const msgContent = message.content.slice(PREFIX.length + 'send'.length).replace(/<#\d+>/g, '').trim();
        return handleSend(message.member, guildData, targetChannel, msgContent, reply);
      }
      case 'giverole': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention a user. like `+giverole @user @role`')] });
        const role = message.mentions.roles.first();
        if (!role) return reply({ embeds: [err('mention a role. like `+giverole @user @role`')] });
        return handleGiverole(message.member, guildData, target, role, reply);
      }
      case 'slog': {
        const channel = message.mentions.channels.first();
        if (!channel) return reply({ embeds: [err('mention a channel. like `+slog #channel`')] });
        return handleSlog(message.member, channel, reply);
      }
      case 'swatch': {
        const channel = message.mentions.channels.first();
        if (!channel) return reply({ embeds: [err('mention a channel. like `+swatch #channel`')] });
        return handleSwatch(message.member, channel, reply);
      }
      case 'wdm': {
        const toggle = args[0]?.toLowerCase();
        if (!toggle || !['on', 'off'].includes(toggle)) return reply({ embeds: [err('use `+wdm on` or `+wdm off`')] });
        return handleWdm(message.member, toggle, reply);
      }
      case 'edm': {
        const msgContent = args.join(' ');
        return handleEdm(message.member, msgContent, reply);
      }
    }
  } catch (e) {
    console.error(e);
    reply({ embeds: [err('something broke. classic.')] });
  }
});

// ─── Watch events ─────────────────────────────────────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.nickname !== newMember.nickname) {
    await logWatch(newMember.guild, newMember.id,
      `✏️ **Nickname changed** for <@${newMember.id}>\n**Before:** ${oldMember.nickname || '*none*'}\n**After:** ${newMember.nickname || '*none*'}`
    );
  }
});

client.on('userUpdate', async (oldUser, newUser) => {
  if (oldUser.avatar !== newUser.avatar) {
    for (const [, guild] of client.guilds.cache) {
      const member = guild.members.cache.get(newUser.id);
      if (!member) continue;
      await logWatch(guild, newUser.id,
        `🖼️ **Avatar changed** for <@${newUser.id}>\nNew avatar: ${newUser.displayAvatarURL()}`
      );
    }
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot || !reaction.message.guild) return;
  await logWatch(reaction.message.guild, user.id,
    `👍 **Reaction added** by <@${user.id}> in <#${reaction.message.channel.id}>: ${reaction.emoji.toString()}`
  );
});

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  await logWatch(message.guild, message.author?.id,
    `🗑️ **Message deleted** from <@${message.author?.id}> in <#${message.channel.id}>:\n${message.content || '*[unknown content]*'}`
  );
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await logWatch(newMessage.guild, newMessage.author?.id,
    `✏️ **Message edited** by <@${newMessage.author?.id}> in <#${newMessage.channel.id}>:\n**Before:** ${oldMessage.content || '*unknown*'}\n**After:** ${newMessage.content}`
  );
});

// ─── Welcome DM ───────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  const { guildData } = getGuildData(member.guild.id);
  if (!guildData.welcomeDm) return;

  const msg = [
    `\`\`\``,
    `.      *     +      w e l c o m e`,
    `            ${member.user.username}                          to`,
    `                    ${member.guild.name}`,
    ``,
    `.      *     +      p a r t n e r s`,
    `            c l i c k     [ h e r e ](https://ke.xo.je)`,
    `               t o       s e e      t h e m`,
    ``,
    `.      *     +      c r e d i t s`,
    `            b o t    m a d e     b y  `,
    `                   >>   @ a f k n e o `,
    `                    o n                   d i s c o r d`,
    `                   <>`,
    `               m a d e       o n            a p r.    8.    2026`,
    `\`\`\``,
  ].join('\n');

  try { await member.send(msg); } catch {}
});

client.login(process.env.BOT_TOKEN);
