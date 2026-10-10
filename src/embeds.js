import { config, getGuildConfig } from './config.js';
import { formatFooterDateTime } from './validation.js';

const PRIMARY_BRAND = 'Chill Zoneˢᶠᵂ | FR';

export const COLOR_SANCTION = config.embedColorSanction;
export const COLOR_OTHER = config.embedColorOther;

export function embedColor(guild, kind = 'other') {
  const cfg = getGuildConfig(guild?.id);
  return kind === 'sanction' ? cfg.embedColorSanction : cfg.embedColorOther;
}

function getBotAvatarIconURL(client) {
  const user = client?.user;
  if (!user) return null;
  return user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
}

/** Nom affiché dans les embeds : Chill Zone sur le serveur principal, nom du serveur ailleurs. */
export function embedBrandName(guild) {
  if (!guild) return PRIMARY_BRAND;
  if (config.guildId && String(guild.id) === String(config.guildId)) return PRIMARY_BRAND;
  const name = String(guild.name || '').trim();
  return name || PRIMARY_BRAND;
}

function getEmbedBrandIconURL(client, guild) {
  const target =
    guild ||
    (config.guildId && client?.guilds?.cache?.get(String(config.guildId))) ||
    null;
  const guildIcon = target?.iconURL?.({ extension: 'png', size: 128, forceStatic: true });
  if (guildIcon) return guildIcon;
  return getBotAvatarIconURL(client);
}

export function getBotAuthor(client, guild) {
  const name = embedBrandName(guild);
  const iconURL = getEmbedBrandIconURL(client, guild);
  return iconURL ? { name, iconURL } : { name };
}

export function getBotFooter(client, options = {}) {
  const guild = options.guild ?? null;
  let text = embedBrandName(guild);
  if (options.extra) text += ` • ${options.extra}`;
  if (options.date != null) {
    const d = options.date instanceof Date ? options.date : new Date(options.date);
    const dateStr = formatFooterDateTime(d);
    if (dateStr) text += ` • ${dateStr}`;
  }
  const iconURL = getEmbedBrandIconURL(client, guild);
  return iconURL ? { text, iconURL } : { text };
}
