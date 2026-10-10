import { getGuildConfig } from './config.js';

async function emojiToken(guild, emojiId) {
  if (!emojiId) return '';
  let emoji = guild.emojis.cache.get(emojiId);
  if (!emoji && guild.emojis?.fetch) {
    emoji = await guild.emojis.fetch(emojiId).catch(() => null);
  }
  return emoji ? emoji.toString() : '';
}

export async function handleWelcome(member) {
  if (!member?.guild || member.user?.bot) return;
  const guildConfig = getGuildConfig(member.guild.id);
  if (!guildConfig.welcomeChannelId) return;

  const channel = await member.guild.channels.fetch(guildConfig.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased?.() || channel.guildId !== member.guild.id) {
    console.warn(`[L'éphémère] Salon de bienvenue introuvable: ${guildConfig.welcomeChannelId}`);
    return;
  }

  const [leftId, rightId] = guildConfig.welcomeEmojiIds || [];
  const left = await emojiToken(member.guild, leftId);
  const right = await emojiToken(member.guild, rightId);
  const reglement = guildConfig.welcomeReglementChannelId
    ? `<#${guildConfig.welcomeReglementChannelId}>`
    : 'règlement';
  const guide = guildConfig.welcomeGuideChannelId
    ? `<#${guildConfig.welcomeGuideChannelId}>`
    : 'guide du serveur';

  const content = [
    `${left ? `${left} ` : ''}Bienvenue <@${member.id}> !`,
    `N'oublie pas de prendre connaissance du ${reglement} et de lire le ${guide}.${right ? ` ${right}` : ''}`,
  ].join('\n');

  await channel.send({
    content,
    allowedMentions: { users: [member.id] },
  });
  console.log(`[L'éphémère] Bienvenue envoyée à ${member.id} sur ${member.guild.id}.`);
}
