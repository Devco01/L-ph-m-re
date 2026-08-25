import { config } from './config.js';
import { formatFooterDateTime } from './validation.js';

const FOOTER_BRAND = '꒰・Chill Zone・꒱ 🧋';

export const COLOR_SANCTION = config.embedColorSanction;
export const COLOR_OTHER = config.embedColorOther;

function getBotAvatarIconURL(client) {
  const user = client?.user;
  if (!user) return null;
  return user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
}

function getEmbedBrandIconURL(client) {
  const guildId = config.guildId;
  if (guildId && client) {
    const guild = client.guilds.cache.get(guildId);
    const guildIcon = guild?.iconURL?.({ extension: 'png', size: 128, forceStatic: true });
    if (guildIcon) return guildIcon;
  }
  return getBotAvatarIconURL(client);
}

export function getBotAuthor(client) {
  const iconURL = getEmbedBrandIconURL(client);
  return iconURL ? { name: FOOTER_BRAND, iconURL } : { name: FOOTER_BRAND };
}

export function getBotFooter(client, options = {}) {
  let text = FOOTER_BRAND;
  if (options.extra) text += ` • ${options.extra}`;
  if (options.date != null) {
    const d = options.date instanceof Date ? options.date : new Date(options.date);
    const dateStr = formatFooterDateTime(d);
    if (dateStr) text += ` • ${dateStr}`;
  }
  const iconURL = getEmbedBrandIconURL(client);
  return iconURL ? { text, iconURL } : { text };
}
