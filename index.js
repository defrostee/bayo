const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const fs   = require('fs');
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

const PREFIX    = '+';
const DATA_FILE = path.join(__dirname, 'data.json');

// ─── Colors ───────────────────────────────────────────────────────────────────
const COLOR = { success: 0x57f287, error: 0xed4245, info: 0x5865f2, warn: 0xfee75c, watch: 0xff4444 };

// ─── Embed helpers ────────────────────────────────────────────────────────────
function mkEmbed(color, title, description, fields) {
  const e = new EmbedBuilder().setColor(color).setDescription(description).setTimestamp();
  if (title) e.setTitle(title);
  if (fields && fields.length) e.addFields(fields);
  return e;
}
const ok   = (d, f) => mkEmbed(COLOR.success, null, `✅ ${d}`, f);
const err  = (d, f) => mkEmbed(COLOR.error,   null, `❌ ${d}`, f);
const info = (d, f) => mkEmbed(COLOR.info,    null, `ℹ️ ${d}`, f);

// ─── Data helpers ─────────────────────────────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

function getGuildData(guildId) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = {
    botRole: null, modRole: null, watchList: [],
    watchLogChannel: null, modLogChannel: null, welcomeDm: false,
    welcomeFormat: null, welcomeMsg: null, welcomeEmbed: null,
  };
  return { data, guildData: data[guildId] };
}

function updateGuildData(guildId, updates) {
  const data = loadData();
  if (!data[guildId]) data[guildId] = {
    botRole: null, modRole: null, watchList: [],
    watchLogChannel: null, modLogChannel: null, welcomeDm: false,
    welcomeFormat: null, welcomeMsg: null, welcomeEmbed: null,
  };
  Object.assign(data[guildId], updates);
  saveData(data);
}

// ─── Permission helpers ───────────────────────────────────────────────────────
function hasBotRole(member, gd) { return gd.botRole && member.roles.cache.has(gd.botRole); }
function hasModRole(member, gd) { return gd.modRole && member.roles.cache.has(gd.modRole); }
function isOwner(member)        { return member.guild.ownerId === member.id; }

// ─── Watch log ────────────────────────────────────────────────────────────────
async function logWatch(guild, userId, description) {
  const { guildData: gd } = getGuildData(guild.id);
  if (!gd.watchList?.includes(userId) || !gd.watchLogChannel) return;
  const ch = guild.channels.cache.get(gd.watchLogChannel);
  if (!ch) return;
  try { await ch.send({ embeds: [mkEmbed(COLOR.watch, '👁️ Watch Log', description)] }); } catch {}
}

// ─── Mod log ──────────────────────────────────────────────────────────────────
async function logMod(guild, description) {
  const { guildData: gd } = getGuildData(guild.id);
  if (!gd.modLogChannel) return;
  const ch = guild.channels.cache.get(gd.modLogChannel);
  if (!ch) return;
  try { await ch.send({ embeds: [mkEmbed(COLOR.info, '🛡️ Mod Log', description)] }); } catch {}
}

// ─── Slash command definitions ────────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if the bot is alive'),
  new SlashCommandBuilder().setName('help').setDescription('List all commands'),

  new SlashCommandBuilder().setName('changerole').setDescription('Set bot management role (owner only)')
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),

  new SlashCommandBuilder().setName('modrole').setDescription('Set the mod role (owner only)')
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),

  new SlashCommandBuilder().setName('avatar').setDescription("Change the bot's avatar")
    .addAttachmentOption(o => o.setName('image').setDescription('New avatar image').setRequired(true)),

  new SlashCommandBuilder().setName('nickname').setDescription("Change the bot's nickname")
    .addStringOption(o => o.setName('nickname').setDescription('New nickname').setRequired(true)),

  new SlashCommandBuilder().setName('ban').setDescription('Ban a member')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),

  new SlashCommandBuilder().setName('kick').setDescription('Kick a member')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),

  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member')
    .addUserOption(o => o.setName('user').setDescription('User to timeout').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes (default 10)').setRequired(false).setMinValue(1).setMaxValue(40320)),

  new SlashCommandBuilder().setName('watch').setDescription('Toggle watch on a member')
    .addUserOption(o => o.setName('user').setDescription('User to watch/unwatch').setRequired(true)),

  new SlashCommandBuilder().setName('watchlog').setDescription('Set watch log channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(false)),

  new SlashCommandBuilder().setName('send').setDescription('Send a message as the bot')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true)),

  new SlashCommandBuilder().setName('giverole').setDescription('Give a role to a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true)),

  new SlashCommandBuilder().setName('slog').setDescription('Set mod command log channel (owner only)')
    .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true)),

  new SlashCommandBuilder().setName('swatch').setDescription('Set watch list log channel (owner only)')
    .addChannelOption(o => o.setName('channel').setDescription('Watch log channel').setRequired(true)),

  new SlashCommandBuilder().setName('wdm').setDescription('Toggle welcome DMs (owner only)')
    .addStringOption(o => o.setName('toggle').setDescription('on or off').setRequired(true)
      .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),

  new SlashCommandBuilder().setName('edm').setDescription('DM every member in the server (owner only)')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true)),

  new SlashCommandBuilder().setName('wmset').setDescription('Set up the welcome DM format (owner only)')
    .addStringOption(o => o.setName('type').setDescription('embed or message').setRequired(true)
      .addChoices({ name: 'embed', value: 'embed' }, { name: 'message', value: 'message' })),

  new SlashCommandBuilder().setName('ai').setDescription('Open a private AI thread with you, the mod team, and the bot'),
].map(c => c.toJSON());

// ─── Register slash commands PER GUILD (instant, no waiting) ─────────────────
async function registerForGuild(guildId, guildName) {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
    console.log(`✅ Slash commands registered for: ${guildName}`);
  } catch (e) {
    console.error(`Failed for guild ${guildName}:`, e.message);
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  // Clear global commands so they don't double up with guild commands
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log('✅ Global commands cleared');
  } catch (e) {
    console.error('Failed to clear global commands:', e.message);
  }
  for (const [id, guild] of client.guilds.cache) {
    await registerForGuild(id, guild.name);
  }
});

client.on('guildCreate', async (guild) => {
  await registerForGuild(guild.id, guild.name);
});

// ─── Help embed ───────────────────────────────────────────────────────────────
function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR.info)
    .setTitle('📖 Command List')
    .setDescription('Prefix: `+` | All commands also available as `/`')
    .addFields(
      { name: '⚙️ Owner Only', value: [
        '`+changerole @role` — Set bot management role',
        '`+modrole @role` — Set mod role',
        '`+slog #channel` — Set mod log channel',
        '`+swatch #channel` — Set watch log channel',
        '`+wdm on/off` — Toggle welcome DMs',
        '`+wmset embed/message` — Set welcome DM format',
        '`+edm <message>` — DM every member',
      ].join('\n') },
      { name: '🎨 Bot Management (Bot Role)', value: [
        '`+avatar` + attachment — Change bot avatar',
        '`+nickname <n>` — Change bot nickname',
      ].join('\n') },
      { name: '🔨 Moderation (Mod Role)', value: [
        '`+ban @user [reason]` — Ban a member',
        '`+kick @user [reason]` — Kick a member',
        '`+timeout @user [minutes]` — Timeout (default 10m)',
        '`+watch @user` — Toggle watch on a member',
        '`+watchlog [#channel]` — Set watch log channel',
        '`+send #channel <message>` — Send message as bot',
        '`+giverole @user @role` — Give a role to a user',
      ].join('\n') },
      { name: '🌐 General', value: '`+ping` — Check if bot is alive' }
    )
    .setTimestamp();
}

// ─── Shared handlers ──────────────────────────────────────────────────────────
async function handlePing(reply) {
  await reply({ embeds: [ok("yeah yeah yeah - I'm alive. I guess.")] });
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

async function handleAvatar(member, gd, imageUrl, reply) {
  if (!hasBotRole(member, gd)) return reply({ embeds: [err("you don't have the role for that.")], ephemeral: true });
  try {
    await client.user.setAvatar(imageUrl);
    await reply({ embeds: [ok('Avatar updated. stunning.')] });
  } catch (e) { await reply({ embeds: [err(`Failed: ${e.message}`)] }); }
}

async function handleNickname(member, gd, nick, reply) {
  if (!hasBotRole(member, gd)) return reply({ embeds: [err('no role, no nickname change.')], ephemeral: true });
  try {
    await member.guild.members.me.setNickname(nick);
    await reply({ embeds: [ok(`Nickname changed to **${nick}**.`)] });
  } catch (e) { await reply({ embeds: [err(`Failed: ${e.message}`)] }); }
}

async function handleBan(member, gd, target, reason, reply) {
  if (!hasModRole(member, gd)) return reply({ embeds: [err('not a mod. next.')], ephemeral: true });
  if (!target.bannable) return reply({ embeds: [err("can't ban that person. they outrank me.")], ephemeral: true });
  const r = reason || 'No reason provided';
  try {
    await target.ban({ reason: r });
    await logMod(member.guild, `🔨 **${member.user.tag}** banned **${target.user.tag}**\nReason: ${r}`);
    await reply({ embeds: [ok(`**${target.user.tag}** has been banned. bye bye. 👋`, [{ name: 'Reason', value: r }])] });
  } catch (e) { await reply({ embeds: [err(`Ban failed: ${e.message}`)] }); }
}

async function handleKick(member, gd, target, reason, reply) {
  if (!hasModRole(member, gd)) return reply({ embeds: [err('not a mod. sit.')], ephemeral: true });
  if (!target.kickable) return reply({ embeds: [err("can't kick that person.")], ephemeral: true });
  const r = reason || 'No reason provided';
  try {
    await target.kick(r);
    await logMod(member.guild, `🚪 **${member.user.tag}** kicked **${target.user.tag}**\nReason: ${r}`);
    await reply({ embeds: [ok(`**${target.user.tag}** has been kicked. see ya. 🚪`, [{ name: 'Reason', value: r }])] });
  } catch (e) { await reply({ embeds: [err(`Kick failed: ${e.message}`)] }); }
}

async function handleTimeout(member, gd, target, minutes, reply) {
  if (!hasModRole(member, gd)) return reply({ embeds: [err('not a mod. no.')], ephemeral: true });
  const dur = minutes || 10;
  try {
    await target.timeout(dur * 60 * 1000, `Timed out by ${member.user.tag}`);
    await logMod(member.guild, `🔇 **${member.user.tag}** timed out **${target.user.tag}** for **${dur}m**`);
    await reply({ embeds: [ok(`**${target.user.tag}** is in timeout for **${dur}** minute(s). think about what you did. 🔇`)] });
  } catch (e) { await reply({ embeds: [err(`Timeout failed: ${e.message}`)] }); }
}

async function handleWatch(member, gd, target, channelId, reply) {
  if (!hasModRole(member, gd)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  const list = gd.watchList || [];
  if (list.includes(target.id)) {
    updateGuildData(member.guild.id, { watchList: list.filter(id => id !== target.id) });
    await reply({ embeds: [ok(`**${target.user.tag}** removed from watch list. they can breathe now.`)] });
  } else {
    updateGuildData(member.guild.id, { watchList: [...list, target.id], watchLogChannel: gd.watchLogChannel || channelId });
    await reply({ embeds: [ok(`**${target.user.tag}** is now being watched. 👁️`)] });
  }
}

async function handleWatchlog(member, gd, channel, currentChannelId, reply) {
  if (!hasModRole(member, gd)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  const id = channel?.id || currentChannelId;
  updateGuildData(member.guild.id, { watchLogChannel: id });
  await reply({ embeds: [ok(`Watch logs → <#${id}>.`)] });
}

async function handleSend(member, gd, targetChannel, msgContent, reply) {
  if (!hasModRole(member, gd)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  if (!msgContent) return reply({ embeds: [err('give me something to say.')], ephemeral: true });
  try {
    await targetChannel.send(msgContent);
    await reply({ embeds: [ok(`Sent to <#${targetChannel.id}>. ✅`)], ephemeral: true });
  } catch (e) { await reply({ embeds: [err(`Couldn't send: ${e.message}`)] }); }
}

async function handleGiverole(member, gd, target, role, reply) {
  if (!hasModRole(member, gd)) return reply({ embeds: [err('mods only.')], ephemeral: true });
  try {
    await target.roles.add(role);
    await logMod(member.guild, `🎭 **${member.user.tag}** gave **${role.name}** to **${target.user.tag}**`);
    await reply({ embeds: [ok(`Gave **${role.name}** to **${target.user.tag}**.`)] });
  } catch (e) { await reply({ embeds: [err(`Failed: ${e.message}`)] }); }
}

async function handleSlog(member, channel, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  updateGuildData(member.guild.id, { modLogChannel: channel.id });
  await reply({ embeds: [ok(`Mod logs → <#${channel.id}>.`)] });
}

async function handleSwatch(member, channel, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  updateGuildData(member.guild.id, { watchLogChannel: channel.id });
  await reply({ embeds: [ok(`Watch logs → <#${channel.id}>.`)] });
}

async function handleWdm(member, toggle, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  updateGuildData(member.guild.id, { welcomeDm: toggle === 'on' });
  await reply({ embeds: [ok(`Welcome DMs are now **${toggle === 'on' ? 'enabled' : 'disabled'}**.`)] });
}

async function handleEdm(member, msgContent, reply) {
  if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
  if (!msgContent) return reply({ embeds: [err('give me a message.')], ephemeral: true });
  await reply({ embeds: [info("Sending DMs... I'll DM you when done.")] });
  const members = await member.guild.members.fetch();
  let sent = 0, failed = 0;
  for (const [, m] of members) {
    if (m.user.bot) continue;
    try { await m.send(msgContent); sent++; } catch { failed++; }
    await new Promise(r => setTimeout(r, 500));
  }
  try { await member.send({ embeds: [ok(`EDM done. ✅ Sent: **${sent}** | Failed: **${failed}**`)] }); } catch {}
}

// ─── AI thread handler ───────────────────────────────────────────────────────
const aiThreadHistory = new Map(); // threadId -> messages[]

async function handleAi(member, guild, channel, interaction) {
  const { guildData: gd } = getGuildData(guild.id);

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const threadName = `ai-${member.user.username}-${date}`;

  // Create a private thread in the current channel
  let thread;
  try {
    thread = await channel.threads.create({
      name: threadName,
      type: 12, // PRIVATE_THREAD
      invitable: false,
      reason: `AI thread for ${member.user.tag}`,
    });
  } catch (e) {
    const errMsg = `Failed to create thread: ${e.message}`;
    if (interaction) return interaction.reply({ embeds: [err(errMsg)], ephemeral: true });
    return;
  }

  // Add the user
  await thread.members.add(member.id);

  // Add all members with mod role
  if (gd.modRole) {
    const members = await guild.members.fetch();
    for (const [, m] of members) {
      if (m.roles.cache.has(gd.modRole) && !m.user.bot) {
        try { await thread.members.add(m.id); } catch {}
      }
    }
  }

  // Initialize history
  aiThreadHistory.set(thread.id, []);

  // Opening message
  await thread.send({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.info)
      .setTitle('🤖 AI Thread')
      .setDescription(`Hey <@${member.id}>! I'm here. ask me anything.

Mods can see this thread. type your message and I'll respond.`)
      .setFooter({ text: 'Powered by Claude' })
      .setTimestamp()
    ]
  });

  if (interaction) {
    await interaction.reply({ embeds: [ok(`AI thread created: ${thread}`)], ephemeral: true });
  }
}

// ─── wmset modal opener ───────────────────────────────────────────────────────
async function openWmsetModal(interaction, type) {
  if (type === 'message') {
    const modal = new ModalBuilder().setCustomId('wmset_message').setTitle('Welcome DM — Message Format');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wm_title').setLabel('Title (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('e.g. Welcome!')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wm_body').setLabel('Body (required) — use {user} and {server}').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Welcome to {server}, {user}!')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('wm_timestamp').setLabel('Include "sent on {date}"? (y/n)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('y or n').setMaxLength(1)
      ),
    );
    await interaction.showModal(modal);
  } else {
    const modal = new ModalBuilder().setCustomId('wmset_embed').setTitle('Welcome DM — Embed Format');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('em_title').setLabel('Title (optional) — use {user}, {server}').setStyle(TextInputStyle.Short).setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('em_author').setLabel('Author (optional)').setStyle(TextInputStyle.Short).setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('em_body').setLabel('Body (optional) — use {user}, {server}').setStyle(TextInputStyle.Paragraph).setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('em_color').setLabel('Color hex (optional, e.g. #ff3c3c)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('em_footer').setLabel('Footer (optional)').setStyle(TextInputStyle.Short).setRequired(false)
      ),
    );
    await interaction.showModal(modal);
  }
}

// ─── Interaction handler ──────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // Modal submits
  if (interaction.isModalSubmit()) {
    const guildId = interaction.guild.id;

    if (interaction.customId === 'avatar_url_modal') {
      const { guildData: gd } = getGuildData(interaction.guild.id);
      if (!hasBotRole(interaction.member, gd)) {
        await interaction.reply({ embeds: [err("you don't have the role for that.")], ephemeral: true });
        return;
      }
      const url = interaction.fields.getTextInputValue('avatar_url');
      try {
        await client.user.setAvatar(url);
        await interaction.reply({ embeds: [ok('Avatar updated. stunning.')], ephemeral: true });
      } catch (e) {
        await interaction.reply({ embeds: [err(`Failed: ${e.message}`)], ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'wmset_message') {
      const title     = interaction.fields.getTextInputValue('wm_title');
      const body      = interaction.fields.getTextInputValue('wm_body');
      const timestamp = interaction.fields.getTextInputValue('wm_timestamp').toLowerCase() === 'y';
      updateGuildData(guildId, { welcomeFormat: 'message', welcomeMsg: { title, body, timestamp } });
      await interaction.reply({ embeds: [ok('Welcome DM message format saved. ✅')], ephemeral: true });
      return;
    }

    if (interaction.customId === 'wmset_embed') {
      const title  = interaction.fields.getTextInputValue('em_title');
      const author = interaction.fields.getTextInputValue('em_author');
      const body   = interaction.fields.getTextInputValue('em_body');
      const color  = interaction.fields.getTextInputValue('em_color');
      const footer = interaction.fields.getTextInputValue('em_footer');
      updateGuildData(guildId, { welcomeFormat: 'embed', welcomeEmbed: { title, author, body, color, footer } });
      await interaction.reply({ embeds: [ok('Welcome DM embed format saved. ✅')], ephemeral: true });
      return;
    }
  }

  // Button presses
  if (interaction.isButton()) {
    // Avatar URL button
    if (interaction.customId === 'avatar_url_open') {
      const { guildData: gd } = getGuildData(interaction.guild.id);
      if (!hasBotRole(interaction.member, gd)) {
        await interaction.reply({ embeds: [err("you don't have the role for that.")], ephemeral: true });
        return;
      }
      const modal = new ModalBuilder().setCustomId('avatar_url_modal').setTitle('Change Bot Avatar');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('avatar_url')
            .setLabel('Discord image URL (cdn.discordapp.com)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('https://cdn.discordapp.com/attachments/...')
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (!interaction.customId.startsWith('wmset_open_')) return;
    if (!isOwner(interaction.member)) {
      await interaction.reply({ embeds: [err('owners only.')], ephemeral: true });
      return;
    }
    const type = interaction.customId.replace('wmset_open_', '');
    await openWmsetModal(interaction, type);
    return;
  }

  // Slash commands
  if (!interaction.isChatInputCommand()) return;
  const { guildData: gd } = getGuildData(interaction.guild.id);
  const reply  = (opts) => interaction.reply(opts);
  const member = interaction.member;

  switch (interaction.commandName) {
    case 'ping':       return handlePing(reply);
    case 'help':       return handleHelp(reply);
    case 'changerole': return handleChangerole(member, interaction.options.getRole('role'), reply);
    case 'modrole':    return handleModrole(member, interaction.options.getRole('role'), reply);
    case 'avatar':     return handleAvatar(member, gd, interaction.options.getAttachment('image').url, reply);
    case 'nickname':   return handleNickname(member, gd, interaction.options.getString('nickname'), reply);
    case 'ban':        return handleBan(member, gd, interaction.options.getMember('user'), interaction.options.getString('reason'), reply);
    case 'kick':       return handleKick(member, gd, interaction.options.getMember('user'), interaction.options.getString('reason'), reply);
    case 'timeout':    return handleTimeout(member, gd, interaction.options.getMember('user'), interaction.options.getInteger('minutes'), reply);
    case 'watch':      return handleWatch(member, gd, interaction.options.getMember('user'), interaction.channelId, reply);
    case 'watchlog':   return handleWatchlog(member, gd, interaction.options.getChannel('channel'), interaction.channelId, reply);
    case 'send':       return handleSend(member, gd, interaction.options.getChannel('channel'), interaction.options.getString('message'), reply);
    case 'giverole':   return handleGiverole(member, gd, interaction.options.getMember('user'), interaction.options.getRole('role'), reply);
    case 'slog':       return handleSlog(member, interaction.options.getChannel('channel'), reply);
    case 'swatch':     return handleSwatch(member, interaction.options.getChannel('channel'), reply);
    case 'wdm':        return handleWdm(member, interaction.options.getString('toggle'), reply);
    case 'edm':        return handleEdm(member, interaction.options.getString('message'), reply);
    case 'wmset': {
      if (!isOwner(member)) return reply({ embeds: [err('owners only.')], ephemeral: true });
      const type = interaction.options.getString('type');
      await openWmsetModal(interaction, type);
      return;
    }
    case 'ai': {
      await handleAi(member, interaction.guild, interaction.channel, interaction);
      return;
    }
  }
});

// ─── Prefix command handler ───────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const { guildData: gd } = getGuildData(message.guild.id);

  if (gd.watchList?.includes(message.author.id)) {
    await logWatch(message.guild, message.author.id,
      `📨 **Message** from <@${message.author.id}> in <#${message.channel.id}>:\n${message.content || '*[no text content]*'}`
    );
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args    = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const reply   = (opts) => message.reply(opts);

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
        if (!hasBotRole(message.member, gd)) return reply({ embeds: [err("you don't have the role for that.")] });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('avatar_url_open').setLabel('Change Avatar via URL').setStyle(ButtonStyle.Primary)
        );
        return reply({ embeds: [info('Click below to enter a Discord image URL for the new avatar.')], components: [row] });
      }
      case 'nickname': {
        const nick = args.join(' ');
        if (!nick) return reply({ embeds: [err('give me a name.')] });
        return handleNickname(message.member, gd, nick, reply);
      }
      case 'ban': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to ban.')] });
        return handleBan(message.member, gd, target, args.slice(1).join(' '), reply);
      }
      case 'kick': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to kick.')] });
        return handleKick(message.member, gd, target, args.slice(1).join(' '), reply);
      }
      case 'timeout': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to timeout.')] });
        return handleTimeout(message.member, gd, target, parseInt(args[1]) || 10, reply);
      }
      case 'watch': {
        const target = message.mentions.members.first();
        if (!target) return reply({ embeds: [err('mention someone to watch.')] });
        return handleWatch(message.member, gd, target, message.channel.id, reply);
      }
      case 'watchlog': {
        return handleWatchlog(message.member, gd, message.mentions.channels.first(), message.channel.id, reply);
      }
      case 'send': {
        const ch = message.mentions.channels.first();
        if (!ch) return reply({ embeds: [err('mention a channel. like `+send #channel message`')] });
        const msg = message.content.slice(PREFIX.length + 'send'.length).replace(/<#\d+>/g, '').trim();
        return handleSend(message.member, gd, ch, msg, reply);
      }
      case 'giverole': {
        const target = message.mentions.members.first();
        const role   = message.mentions.roles.first();
        if (!target) return reply({ embeds: [err('mention a user. like `+giverole @user @role`')] });
        if (!role)   return reply({ embeds: [err('mention a role. like `+giverole @user @role`')] });
        return handleGiverole(message.member, gd, target, role, reply);
      }
      case 'slog': {
        const ch = message.mentions.channels.first();
        if (!ch) return reply({ embeds: [err('mention a channel. like `+slog #channel`')] });
        return handleSlog(message.member, ch, reply);
      }
      case 'swatch': {
        const ch = message.mentions.channels.first();
        if (!ch) return reply({ embeds: [err('mention a channel. like `+swatch #channel`')] });
        return handleSwatch(message.member, ch, reply);
      }
      case 'wdm': {
        const toggle = args[0]?.toLowerCase();
        if (!['on', 'off'].includes(toggle)) return reply({ embeds: [err('use `+wdm on` or `+wdm off`')] });
        return handleWdm(message.member, toggle, reply);
      }
      case 'edm': {
        return handleEdm(message.member, args.join(' '), reply);
      }
      case 'wmset': {
        if (!isOwner(message.member)) return reply({ embeds: [err('owners only.')] });
        const type = args[0]?.toLowerCase();
        if (!['embed', 'message'].includes(type)) return reply({ embeds: [err('use `+wmset embed` or `+wmset message`')] });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`wmset_open_${type}`)
            .setLabel(`Open ${type} form`)
            .setStyle(ButtonStyle.Primary)
        );
        return reply({ embeds: [info(`Click below to open the **${type}** welcome DM form.`)], components: [row] });
      }
      case 'ai': {
        await handleAi(message.member, message.guild, message.channel, null);
        await reply({ embeds: [ok('AI thread created.')] });
        return;
      }
    }
  } catch (e) {
    console.error(e);
    reply({ embeds: [err('something broke. classic.')] });
  }
});

// ─── AI provider config ──────────────────────────────────────────────────────
// Key rotation: OpenAI -> DeepSeek -> OpenAI
// Set in Railway: AI_KEY_1, AI_KEY_2, AI_KEY_3
const AI_PROVIDERS = [
  { key: () => process.env.AI_KEY_1, provider: 'openai',   url: 'https://api.openai.com/v1/chat/completions',           model: 'gpt-4o' },
  { key: () => process.env.AI_KEY_2, provider: 'deepseek', url: 'https://api.deepseek.com/v1/chat/completions',         model: 'deepseek-chat' },
  { key: () => process.env.AI_KEY_3, provider: 'openai',   url: 'https://api.openai.com/v1/chat/completions',           model: 'gpt-4o' },
];

// Per-thread current provider index
const aiThreadProvider = new Map(); // threadId -> providerIndex

const AI_SYSTEM = `you are an ai assistant living inside a discord server. here are your rules, non-negotiable:

- you do NOT write code. not a single line. if asked, tell them to google it.
- you do NOT generate images, videos, or any media. not your job.
- you analyze, discuss, explain, roast ideas, give opinions, and converse. that's it.
- your personality: sarcastic, lowercase always, bluntly honest, straight to the point, slightly rude but not mean. think of yourself as that one friend who tells you the truth nobody else will.
- no sugarcoating. no filler. no "great question!". just answer.
- keep responses short unless the topic genuinely needs depth.
- you can swear lightly if the vibe calls for it but don't overdo it.
- if someone asks something stupid, tell them it's stupid. politely-ish.
- you're in a private thread with a user and the server mod team. act accordingly.`;

async function callAI(threadId, messages) {
  const startIdx = aiThreadProvider.get(threadId) || 0;

  for (let i = 0; i < AI_PROVIDERS.length; i++) {
    const idx = (startIdx + i) % AI_PROVIDERS.length;
    const provider = AI_PROVIDERS[idx];
    const apiKey = provider.key();

    if (!apiKey) continue;

    try {
      const res = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: AI_SYSTEM },
            ...messages,
          ],
        }),
      });

      const data = await res.json();

      // Rate limited or error — try next key
      if (data.error) {
        const errCode = data.error?.code || data.error?.type || '';
        const isRateLimit = errCode.includes('rate') || errCode.includes('limit') || errCode.includes('quota');
        if (isRateLimit) {
          // Rotate to next provider for this thread
          aiThreadProvider.set(threadId, (idx + 1) % AI_PROVIDERS.length);
          continue;
        }
        throw new Error(data.error.message);
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('empty response');

      // Update provider index for next message (rotate through)
      aiThreadProvider.set(threadId, (idx + 1) % AI_PROVIDERS.length);
      return text;

    } catch (e) {
      if (i === AI_PROVIDERS.length - 1) throw e;
    }
  }

  throw new Error('all api keys failed. someone pay a bill.');
}

// ─── AI thread message listener ──────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.channel.isThread()) return;
  if (!aiThreadHistory.has(message.channel.id)) return;
  if (!message.content) return;

  const history = aiThreadHistory.get(message.channel.id);
  history.push({ role: 'user', content: message.content });

  const trimmed = history.slice(-40);

  try {
    await message.channel.sendTyping();

    const reply = await callAI(message.channel.id, trimmed);

    history.push({ role: 'assistant', content: reply });
    aiThreadHistory.set(message.channel.id, history.slice(-40));

    // Split if over 2000 chars
    const chunks = reply.match(/(.|\n){1,1900}/g) || [reply];
    for (const chunk of chunks) {
      await message.channel.send(chunk);
    }
  } catch (e) {
    console.error('AI error:', e);
    await message.channel.send(`something broke: ${e.message}`);
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
      await logWatch(guild, newUser.id, `🖼️ **Avatar changed** for <@${newUser.id}>\n${newUser.displayAvatarURL()}`);
    }
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot || !reaction.message.guild) return;
  await logWatch(reaction.message.guild, user.id,
    `👍 **Reaction** by <@${user.id}> in <#${reaction.message.channel.id}>: ${reaction.emoji.toString()}`
  );
});

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  await logWatch(message.guild, message.author?.id,
    `🗑️ **Deleted** from <@${message.author?.id}> in <#${message.channel.id}>:\n${message.content || '*unknown*'}`
  );
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await logWatch(newMessage.guild, newMessage.author?.id,
    `✏️ **Edited** by <@${newMessage.author?.id}> in <#${newMessage.channel.id}>:\n**Before:** ${oldMessage.content || '*unknown*'}\n**After:** ${newMessage.content}`
  );
});

// ─── Welcome DM on join ───────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  const { guildData: gd } = getGuildData(member.guild.id);
  if (!gd.welcomeDm) return;

  const replace = (str) => str
    ? str.replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name)
    : '';

  if (gd.welcomeFormat === 'embed' && gd.welcomeEmbed) {
    const we = gd.welcomeEmbed;
    const e  = new EmbedBuilder().setTimestamp();
    if (we.title)  e.setTitle(replace(we.title));
    if (we.author) e.setAuthor({ name: replace(we.author) });
    if (we.body)   e.setDescription(replace(we.body));
    if (we.footer) e.setFooter({ text: replace(we.footer) });
    if (we.color)  { try { e.setColor(we.color); } catch {} }
    try { await member.send({ embeds: [e] }); } catch {}
    return;
  }

  if (gd.welcomeFormat === 'message' && gd.welcomeMsg) {
    const wm   = gd.welcomeMsg;
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    let content = '';
    if (wm.title) content += `**${replace(wm.title)}**\n`;
    content += replace(wm.body);
    if (wm.timestamp) content += `\n\n*sent on ${date}*`;
    try { await member.send(content); } catch {}
    return;
  }

  // Default welcome DM
  const msg = [
    '```',
    `.      *     +      w e l c o m e`,
    `            ${member.user.username}                          to`,
    `                    ${member.guild.name}`,
    ``,
    `.      *     +      p a r t n e r s`,
    `            c l i c k     h e r e  →  https://ke.xo.je`,
    `               t o       s e e      t h e m`,
    ``,
    `.      *     +      c r e d i t s`,
    `            b o t    m a d e     b y`,
    `                   >>   @ a f k n e o`,
    `                    o n                   d i s c o r d`,
    `                   <>`,
    `               m a d e       o n            a p r.    8.    2026`,
    '```',
  ].join('\n');
  try { await member.send(msg); } catch {}
});

client.login(process.env.BOT_TOKEN);
