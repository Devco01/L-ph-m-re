import { randomBytes } from 'crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  escapeMarkdown,
} from 'discord.js';
import { config, getGuildConfig } from '../config.js';
import {
  attachMpRequestMessage,
  countMpRequests,
  createMpRequest,
  deleteMpRequest,
  findPendingMpRequest,
  getMpRequest,
  resolveMpRequest,
} from '../database.js';
import { embedColor, getBotAuthor, getBotFooter } from '../embeds.js';
import { checkRateLimit } from '../rateLimit.js';

const ACCEPT_PREFIX = 'mpdm_ok_';
const REFUSE_PREFIX = 'mpdm_no_';

function requestCountLabel(count) {
  const n = Number(count) || 0;
  return n > 1 ? `**${n}** demandes` : `**${n}** demande`;
}

function buildButtons(requestId, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ACCEPT_PREFIX}${requestId}`)
      .setLabel('Accepter')
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(disabled)),
    new ButtonBuilder()
      .setCustomId(`${REFUSE_PREFIX}${requestId}`)
      .setLabel('Refuser')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(disabled))
  );
}

function buildRequestEmbed(client, guild, { requesterId, targetId, motif, count, status }) {
  const embed = new EmbedBuilder()
    .setColor(status === 'accepted' ? 0x57f287 : status === 'refused' ? 0xed4245 : embedColor(guild))
    .setAuthor(getBotAuthor(client, guild))
    .setTitle('Demande de MP')
    .setDescription(`<@${targetId}>`)
    .addFields(
      { name: 'Demandeur', value: `<@${requesterId}>`, inline: true },
      { name: 'Personne concernée', value: `<@${targetId}>`, inline: true },
      { name: 'Motif', value: escapeMarkdown(motif).slice(0, 1024) },
      { name: 'Demandes envoyées', value: requestCountLabel(count), inline: true }
    )
    .setFooter(
      getBotFooter(client, {
        extra: status === 'accepted' ? 'Acceptée' : status === 'refused' ? 'Refusée' : 'En attente',
        guild,
      })
    );
  return embed;
}

export function isMpRequestButton(customId) {
  return typeof customId === 'string' && (customId.startsWith(ACCEPT_PREFIX) || customId.startsWith(REFUSE_PREFIX));
}

export const mpRequestCommands = [
  new SlashCommandBuilder()
    .setName('demande-de-mp')
    .setDescription('Demander l’autorisation d’envoyer un MP à un membre.')
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName('utilisateur').setDescription('La personne concernée par la demande').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('motif').setDescription('Le motif de la demande').setRequired(true).setMaxLength(500)
    )
    .toJSON(),
];

export async function handleMpRequest(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: 'Commande utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
  }

  const mpChannelId = getGuildConfig(guild.id).mpRequestChannelId;
  if (!mpChannelId || interaction.channelId !== String(mpChannelId)) {
    return interaction.reply({
      content: mpChannelId
        ? `Utilise cette commande dans <#${mpChannelId}>.`
        : 'Cette commande n’est pas disponible sur ce serveur.',
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

  const target = interaction.options.getUser('utilisateur', true);
  const motif = String(interaction.options.getString('motif', true) || '').trim();
  if (!motif) {
    return interaction.reply({ content: 'Indique un motif.', flags: MessageFlags.Ephemeral });
  }
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: 'Tu ne peux pas te faire une demande de MP.', flags: MessageFlags.Ephemeral });
  }
  if (target.bot) {
    return interaction.reply({ content: 'Tu ne peux pas envoyer une demande à un bot.', flags: MessageFlags.Ephemeral });
  }

  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    return interaction.reply({
      content: 'Cette personne n’est pas sur le serveur.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const pending = await findPendingMpRequest(guild.id, interaction.user.id, target.id);
  if (pending) {
    return interaction.reply({
      content: 'Tu as déjà une demande en attente auprès de cette personne.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const requestId = randomBytes(8).toString('hex');
  await createMpRequest({
    id: requestId,
    guildId: guild.id,
    channelId: interaction.channelId,
    requesterId: interaction.user.id,
    targetId: target.id,
    motif,
  });

  const count = await countMpRequests(guild.id, interaction.user.id);
  try {
    const message = await interaction.reply({
      content: `<@${target.id}>`,
      embeds: [
        buildRequestEmbed(interaction.client, guild, {
          requesterId: interaction.user.id,
          targetId: target.id,
          motif,
          count,
          status: 'pending',
        }),
      ],
      components: [buildButtons(requestId, false)],
      allowedMentions: { users: [target.id] },
      fetchReply: true,
    });
    await attachMpRequestMessage(requestId, message.channelId, message.id);
  } catch (err) {
    await deleteMpRequest(requestId).catch(() => {});
    console.error("[L'éphémère] /demande-de-mp:", err?.message || err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Impossible de publier la demande dans ce salon.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

export async function handleMpRequestButton(interaction) {
  const customId = String(interaction.customId || '');
  const accepted = customId.startsWith(ACCEPT_PREFIX);
  const requestId = customId.slice(accepted ? ACCEPT_PREFIX.length : REFUSE_PREFIX.length);
  const request = await getMpRequest(requestId);
  if (!request || request.guildId !== interaction.guildId) {
    return interaction.reply({ content: 'Cette demande est introuvable.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.user.id !== request.targetId) {
    return interaction.reply({
      content: `Seule <@${request.targetId}> peut répondre à cette demande.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }
  if (request.status !== 'pending') {
    return interaction.reply({ content: 'Cette demande a déjà reçu une réponse.', flags: MessageFlags.Ephemeral });
  }

  const status = accepted ? 'accepted' : 'refused';
  const updated = await resolveMpRequest(requestId, status);
  if (!updated) {
    return interaction.reply({ content: 'Cette demande a déjà reçu une réponse.', flags: MessageFlags.Ephemeral });
  }

  const count = await countMpRequests(request.guildId, request.requesterId);
  const verb = accepted ? 'a accepté' : 'a refusé';
  const mark = accepted ? '✅' : '❌';
  await interaction.update({
    embeds: [
      buildRequestEmbed(interaction.client, interaction.guild, {
        requesterId: request.requesterId,
        targetId: request.targetId,
        motif: request.motif,
        count,
        status,
      }),
    ],
    components: [buildButtons(requestId, true)],
  });
  await interaction.channel
    .send({
      content: `${mark} <@${request.targetId}> ${verb} la demande de MP de <@${request.requesterId}>.\n<@${request.requesterId}> en est à ${requestCountLabel(count)}.`,
      allowedMentions: { users: [request.targetId, request.requesterId] },
    })
    .catch((err) => {
      console.error("[L'éphémère] /demande-de-mp résultat:", err?.message || err);
    });
}
