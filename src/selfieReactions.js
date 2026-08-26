import { PermissionFlagsBits, parseEmoji } from 'discord.js';
import { config } from './config.js';

const MEDIA_ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i;

function parseReactionIdentifier(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/discord\.com\/assets\//i.test(s)) return null;
  const fromCdn = s.match(/emojis\/(\d+)/i);
  if (fromCdn) {
    const id = fromCdn[1];
    const animated = /<a:/i.test(s) || /animated=true/i.test(s);
    return animated ? { id, animated: true } : id;
  }
  const parsed = parseEmoji(s);
  if (parsed) return parsed;
  if (/^\d{17,20}$/.test(s)) return s;
  return s;
}

function messageHasImage(message) {
  if (!message) return false;
  if (message.attachments?.size) {
    for (const att of message.attachments.values()) {
      const ct = (att.contentType || '').toLowerCase();
      const name = att.name || '';
      if (ct.startsWith('image/')) return true;
      if (MEDIA_ATTACHMENT_EXT.test(name)) return true;
    }
  }
  for (const embed of message.embeds || []) {
    if (embed.image) return true;
    if (embed.type === 'image' || embed.type === 'gifv') return true;
  }
  return false;
}

export async function handleSelfieChannelReaction(message) {
  if (!message?.guild || message.author?.bot) return;
  if (!config.selfieChannelIds?.has(message.channelId)) return;
  if (!messageHasImage(message)) return;

  const reactions = config.selfieReactions;
  if (!reactions?.length || !message.react) return;

  const channel = message.channel;
  const me = message.guild.members.me ?? (await message.guild.members.fetchMe().catch(() => null));
  if (me && channel && !me.permissionsIn(channel).has(PermissionFlagsBits.AddReactions)) {
    console.warn(`[L'éphémère] selfie: permission « Ajouter des réactions » manquante.`);
    return;
  }

  for (const raw of reactions) {
    try {
      const emoji = parseReactionIdentifier(raw);
      if (!emoji) continue;
      await message.react(emoji);
    } catch (e) {
      console.warn(`[L'éphémère] selfie réaction « ${raw} » impossible:`, e?.message || e);
    }
  }
}
