import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  escapeMarkdown,
} from 'discord.js';
import { config, getGuildConfig } from '../config.js';
import { incrementAvisNumber, saveAvis } from '../database.js';
import { embedColor, getBotFooter } from '../embeds.js';
import { checkRateLimit } from '../rateLimit.js';

const HEART_FALLBACK = '💙';
const RATING_FALLBACK = '★';
const EMPTY_MARK = '☆';
const GAP = '\u2003';

function quoteAvis(text) {
  return escapeMarkdown(text)
    .replace(/\r/g, '')
    .slice(0, 1500)
    .split('\n')
    .map((line) => `> ${line || '\u200b'}`)
    .join('\n');
}

async function guildEmoji(guild, emojiId, fallback) {
  if (!emojiId) return fallback;
  let emoji = guild?.emojis?.cache?.get(emojiId) || null;
  if (!emoji && guild?.emojis?.fetch) {
    emoji = await guild.emojis.fetch(emojiId).catch(() => null);
  }
  return emoji ? emoji.toString() : fallback;
}

async function ratingMark(guild, note) {
  const guildConfig = getGuildConfig(guild?.id);
  const heart = await guildEmoji(guild, guildConfig.avisHeartEmojiId, HEART_FALLBACK);
  const filled = await guildEmoji(guild, guildConfig.avisRatingEmojiId, RATING_FALLBACK);
  const icons = Array.from({ length: 5 }, (_, i) => (i < note ? filled : EMPTY_MARK)).join(`${GAP}`);
  return { heart, icons };
}

function buildAvisEmbed(client, guild, { text, note, number, heart, icons }) {
  const color = getGuildConfig(guild?.id).avisColor || embedColor(guild);
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(
      [
        `🔒${GAP}•${GAP}**Anonyme**`,
        '',
        `${heart}${GAP}•${GAP}**Avis de la communauté**`,
        '',
        quoteAvis(text),
        '',
        `${heart}${GAP}•${GAP}**Note sur 5**${GAP}${GAP}${icons}${GAP}${GAP}**${note} / 5**`,
      ].join('\n')
    )
    .setFooter(getBotFooter(client, { extra: `Avis #${number}`, date: new Date(), guild }));
}

export const avisCommands = [
  new SlashCommandBuilder()
    .setName('avis')
    .setDescription('Publier un avis anonyme sur le serveur, avec une note sur 5.')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('texte').setDescription('Ton avis sur le serveur').setRequired(true).setMaxLength(1500)
    )
    .addIntegerOption((o) =>
      o
        .setName('note-sur-5')
        .setDescription('Note sur 5')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5)
    )
    .toJSON(),
];

export async function handleAvis(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: 'Commande utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
  }

  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig.avisEnabled) {
    return interaction.reply({
      content: 'Cette commande n’est pas disponible sur ce serveur.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (guildConfig.avisChannelId && interaction.channelId !== String(guildConfig.avisChannelId)) {
    return interaction.reply({
      content: `Utilise cette commande dans <#${guildConfig.avisChannelId}>.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  const limit = checkRateLimit(interaction.user.id, config.rateLimitPerMinute);
  if (!limit.allowed) {
    return interaction.reply({
      content: `Trop de requêtes. Réessaie dans ${Math.ceil(limit.retryAfterMs / 1000)} secondes.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const text = String(interaction.options.getString('texte', true) || '').trim();
  const note = interaction.options.getInteger('note-sur-5', true);
  if (!text) {
    return interaction.reply({ content: 'Indique ton avis.', flags: MessageFlags.Ephemeral });
  }
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return interaction.reply({ content: 'La note doit être entre 1 et 5.', flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased?.() || channel.isThread?.()) {
    return interaction.reply({
      content: 'Utilise cette commande dans un salon texte.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const perms = me && typeof me.permissionsIn === 'function' ? me.permissionsIn(channel) : null;
  if (
    perms &&
    (!perms.has(PermissionFlagsBits.ViewChannel) ||
      !perms.has(PermissionFlagsBits.SendMessages) ||
      !perms.has(PermissionFlagsBits.EmbedLinks))
  ) {
    return interaction.editReply({
      content: 'Je dois pouvoir voir ce salon, envoyer des messages et intégrer des liens.',
    });
  }

  let number = 0;
  try {
    number = await incrementAvisNumber(guild.id);
  } catch (err) {
    console.error("[L'éphémère] /avis numéro:", err?.message || err);
    return interaction.editReply({ content: 'Impossible d’enregistrer cet avis pour le moment.' });
  }

  const marks = await ratingMark(guild, note);
  let sent;
  try {
    sent = await channel.send({
      embeds: [buildAvisEmbed(interaction.client, guild, { text, note, number, ...marks })],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[L'éphémère] /avis envoi:", err?.message || err);
    return interaction.editReply({ content: 'Impossible de publier l’avis dans ce salon.' });
  }

  await saveAvis({
    guildId: guild.id,
    number,
    authorId: interaction.user.id,
    channelId: channel.id,
    messageId: sent.id,
    note,
    text,
  }).catch((err) => {
    console.error("[L'éphémère] /avis enregistrement:", err?.message || err);
  });

  return interaction.editReply({ content: `Ton avis anonyme n°${number} a été publié.` });
}
