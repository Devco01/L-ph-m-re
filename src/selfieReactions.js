import { PermissionFlagsBits, parseEmoji } from 'discord.js';
import { config } from './config.js';

const MEDIA_ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif|mp4|mov|webm)$/i;
const recentlyReacted = new Set();

/** Ordre imposé : orange, néon, slay, étoile. */
const SELFIE_REACTION_IDS = [
  '1541763451741802507',
  '1541763149538131978',
  '1541764065091780669',
  '1541786113188962314',
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rememberReacted(messageId) {
  recentlyReacted.add(messageId);
  if (recentlyReacted.size > 400) {
    const first = recentlyReacted.values().next().value;
    recentlyReacted.delete(first);
  }
}

function parseReactionIdentifier(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/discord\.com\/assets\//i.test(s)) return null;
  const fromCdn = s.match(/emojis\/(\d+)/i);
  if (fromCdn) {
    return {
      id: fromCdn[1],
      animated: /animated=true/i.test(s) || /<a:/i.test(s),
    };
  }
  const parsed = parseEmoji(s);
  if (parsed?.id) return { id: parsed.id, animated: Boolean(parsed.animated) };
  if (/^\d{17,20}$/.test(s)) return { id: s, animated: false };
  return s;
}

function selfieReactionList() {
  if (process.env.SELFIE_REACTIONS?.trim()) return config.selfieReactions;
  return SELFIE_REACTION_IDS;
}

function messageHasImage(message) {
  if (!message) return false;
  if (message.attachments?.size) {
    for (const att of message.attachments.values()) {
      const ct = (att.contentType || '').toLowerCase();
      const name = att.name || '';
      if (ct.startsWith('image/') || ct.startsWith('video/')) return true;
      if (MEDIA_ATTACHMENT_EXT.test(name)) return true;
    }
  }
  for (const embed of message.embeds || []) {
    if (embed.image || embed.thumbnail || embed.video) return true;
    if (embed.type === 'image' || embed.type === 'gifv' || embed.type === 'video') return true;
  }
  return false;
}

function isSelfieChannel(message) {
  const ids = config.selfieChannelIds;
  if (!ids?.size) return false;
  if (ids.has(message.channelId)) return true;
  const parentId = message.channel?.parentId;
  if (parentId && ids.has(parentId)) return true;
  return false;
}

async function resolveReactEmoji(guild, parsed) {
  if (!parsed) return null;
  if (typeof parsed === 'string') return parsed;
  const id = parsed.id;
  if (!id) return parsed;
  let emoji = guild.emojis.cache.get(id);
  if (!emoji) {
    try {
      const fetched = await guild.emojis.fetch(id);
      emoji = fetched;
    } catch (_) {
      try {
        const all = await guild.emojis.fetch();
        emoji = all.get(id);
      } catch (_) {}
    }
  }
  if (emoji) return emoji;
  return parsed.animated ? `a:${id}` : `_:${id}`;
}

export async function handleSelfieChannelReaction(message) {
  if (!message?.guild || message.author?.bot) return;
  if (!isSelfieChannel(message)) return;
  if (!messageHasImage(message)) return;
  if (recentlyReacted.has(message.id)) return;

  const reactions = selfieReactionList();
  if (!reactions?.length || !message.react) return;

  const channel = message.channel;
  try {
    const me = message.guild.members.me ?? (await message.guild.members.fetchMe().catch(() => null));
    if (me && channel && typeof me.permissionsIn === 'function') {
      const perms = me.permissionsIn(channel);
      if (perms && !perms.has(PermissionFlagsBits.AddReactions)) {
        console.warn(`[L'éphémère] selfie: permission « Ajouter des réactions » manquante sur ${message.channelId}.`);
        return;
      }
    }
  } catch (_) {}

  rememberReacted(message.id);

  for (let i = 0; i < reactions.length; i++) {
    const raw = reactions[i];
    try {
      const parsed = parseReactionIdentifier(raw);
      const emoji = await resolveReactEmoji(message.guild, parsed);
      if (!emoji) continue;
      await message.react(emoji);
      if (i < reactions.length - 1) await wait(400);
    } catch (e) {
      console.warn(`[L'éphémère] selfie réaction impossible (${raw}):`, e?.message || e);
    }
  }
}
