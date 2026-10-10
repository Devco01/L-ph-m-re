import { getGuildConfig } from './config.js';
import { clearPresentationDataForChannel } from './database.js';

export async function purgePresentationDataForChannelReset(channelId, context = {}) {
  const guildConfig = getGuildConfig(context.guildId);
  if (!channelId || !guildConfig.presentationResetChannelIds.has(channelId)) return null;

  const result = await clearPresentationDataForChannel(channelId).catch((err) => {
    console.error(`[L'éphémère] Purge présentations salon ${channelId} échouée:`, err?.message || err);
    return null;
  });
  if (!result) return null;

  const { messages = 0, drafts = 0 } = result;
  if (messages > 0 || drafts > 0) {
    const extra = context.deletedCount != null ? ` (${context.deletedCount} msg Discord supprimés)` : '';
    console.log(
      `[L'éphémère] Salon présentation reset (${channelId})${extra} → ${messages} publication(s) et ${drafts} brouillon(s) retirés de la base.`
    );
  }
  return result;
}

export function isPresentationResetChannel(channelId, guildId) {
  return Boolean(channelId && getGuildConfig(guildId).presentationResetChannelIds.has(channelId));
}

export async function handlePresentationChannelBulkDelete(channel, deletedCount) {
  const channelId = channel?.id;
  const guildId = channel?.guildId || channel?.guild?.id;
  if (!isPresentationResetChannel(channelId, guildId)) return;
  if ((deletedCount ?? 0) < getGuildConfig(guildId).presentationResetMinBulk) return;
  await purgePresentationDataForChannelReset(channelId, { deletedCount, guildId });
}

export async function handlePresentationChannelDelete(channel) {
  const channelId = channel?.id;
  const guildId = channel?.guildId || channel?.guild?.id;
  if (!isPresentationResetChannel(channelId, guildId)) return;
  await purgePresentationDataForChannelReset(channelId, { reason: 'channel_delete', guildId });
}
