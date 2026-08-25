import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import { config } from '../config.js';
import {
  createTicket,
  getTicketByThreadId,
  getOpenTicketForUser,
  claimTicket,
  closeTicket,
  setTicketPanel,
  getTicketPanel,
} from '../database.js';
import { COLOR_OTHER, getBotAuthor, getBotFooter } from '../embeds.js';
import { hasAdminRole, isStaffMember } from '../permissions.js';
import { sanitizeReason } from '../validation.js';

/**
 * Couleurs demandées (#ef233c, #edf6f9, #aaf683) : Discord n’accepte pas d’hex sur les boutons.
 * On mappe sur Danger (rouge), Secondary (gris clair), Success (vert).
 */
export const TICKET_TYPES = [
  {
    id: 'signalement',
    label: 'Signalement',
    emoji: '\u{1F3F3}\u{FE0F}',
    blurb: 'report / comportements / problèmes',
    threadPrefix: 'Signalement',
    title: '\u{1F3F3}\u{FE0F} - Signalement',
    buttonStyle: ButtonStyle.Danger,
  },
  {
    id: 'aide',
    label: 'Aide',
    emoji: '💬',
    blurb: 'questions, soucis de permissions ou signalement d’un bug',
    threadPrefix: 'Aide',
    title: '💬 - Aide',
    buttonStyle: ButtonStyle.Secondary,
  },
  {
    id: 'certification',
    label: 'Certification',
    emoji: '✅',
    blurb: 'vérification de ton âge et de l’authenticité de ton compte',
    threadPrefix: 'Certification',
    title: '✅ - Certification',
    buttonStyle: ButtonStyle.Success,
  },
];

function getTicketType(id) {
  return TICKET_TYPES.find((t) => t.id === id) || TICKET_TYPES[0];
}

function sanitizeThreadNamePart(name) {
  return String(name || 'membre')
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .replace(/\s+/g, '')
    .slice(0, 40) || 'membre';
}

function staffPingContent() {
  const ids = config.ticketStaffRoleIds;
  if (!ids.length) return null;
  return ids.map((id) => `<@&${id}>`).join(' ');
}

function ticketActionRow({ claimed = false, closed = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Revendiquer')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(claimed || closed),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Fermer')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed)
  );
}

function buildTicketEmbed({ client, userId, type, subject, claimedBy = null, closed = false }) {
  const meta = getTicketType(type);
  const desc = closed
    ? `Ce ticket est **fermé**. Seuls les modérateurs peuvent le rouvrir.`
    : `Bonjour <@${userId}>,\nL’équipe de modération prendra en charge ta demande dès que possible.`;
  const embed = new EmbedBuilder()
    .setColor(COLOR_OTHER)
    .setAuthor(getBotAuthor(client))
    .setTitle(meta.title)
    .setDescription(desc)
    .addFields({ name: 'Sujet', value: subject || '—', inline: false })
    .setFooter(getBotFooter(client, { extra: closed ? 'Ticket fermé' : claimedBy ? `Pris en charge` : undefined, date: new Date() }));
  if (claimedBy) {
    embed.addFields({ name: 'Pris en charge par', value: `<@${claimedBy}>`, inline: true });
  }
  return embed;
}

function buildPanelEmbed(client) {
  return new EmbedBuilder()
    .setColor(COLOR_OTHER)
    .setAuthor(getBotAuthor(client))
    .setTitle('🎫 Besoin d’aide ?')
    .setDescription(
      [
        'Clique sur le bouton qui correspond le mieux à ta demande afin que ton ticket soit traité correctement :',
        '',
        '🚨 **Signalement** — signaler un membre, un comportement ou un problème',
        '💬 **Aide** — questions, soucis de permissions ou signalement d’un bug',
        '✅ **Certification** — vérification de ton âge et de l’authenticité de ton compte',
        '',
        '📌 **À savoir :**',
        '• Sois clair et précis dès ton premier message.',
        '• Un seul ticket ouvert à la fois.',
        '• Un ticket resté sans réponse pendant plus de 24 heures pourra faire l’objet d’un warn.',
        '• La certification s’effectue uniquement par vérification en caméra + CNI.',
        '',
        '🔒 **Confidentialité :**',
        'Les tickets sont des espaces privés : seuls toi et les membres autorisés du staff peuvent les consulter.',
      ].join('\n')
    )
    .setFooter(getBotFooter(client, { extra: 'Support' }));
}

function buildPanelButtons() {
  return new ActionRowBuilder().addComponents(
    TICKET_TYPES.map((t) =>
      new ButtonBuilder()
        .setCustomId(`ticket_open_${t.id}`)
        .setLabel(t.label)
        .setEmoji(t.emoji)
        .setStyle(t.buttonStyle)
    )
  );
}

export const ticketCommands = [
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Poster le panneau d’ouverture de tickets (fils privés) dans ce salon.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),
];

export function isTicketOpenButton(customId) {
  return typeof customId === 'string' && customId.startsWith('ticket_open_');
}

export function isTicketSelect(customId) {
  return customId === 'ticket_open';
}

export function isTicketModal(customId) {
  return typeof customId === 'string' && customId.startsWith('ticket_modal_');
}

export function isTicketButton(customId) {
  return customId === 'ticket_claim' || customId === 'ticket_close';
}

async function showTicketSubjectModal(interaction, typeId) {
  const meta = getTicketType(typeId);
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ Utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
  }

  const existing = await getOpenTicketForUser(interaction.guild.id, interaction.user.id);
  if (existing) {
    return interaction.reply({
      content: `❌ Tu as déjà un ticket ouvert : <#${existing.thread_id}>. Ferme-le avant d’en ouvrir un autre.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder().setCustomId(`ticket_modal_${meta.id}`).setTitle(`${meta.label} — sujet`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sujet')
        .setLabel('Sujet de ta demande')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(400)
        .setPlaceholder('Décris brièvement le motif…')
    )
  );
  return interaction.showModal(modal);
}

export async function handleTicketOpenButton(interaction) {
  const typeId = String(interaction.customId || '').replace('ticket_open_', '');
  return showTicketSubjectModal(interaction, typeId);
}

export async function handleTicketSelect(interaction) {
  const typeId = interaction.values?.[0];
  return showTicketSubjectModal(interaction, typeId);
}

export async function handleTicketPanel(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ Commande utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
  }
  if (!(await hasAdminRole(interaction))) {
    return interaction.reply({ content: '❌ Tu n’as pas le droit d’utiliser cette commande.', flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased?.() || channel.isThread?.() || channel.isDMBased?.()) {
    return interaction.reply({
      content: '❌ Poster le panneau dans un salon texte (celui où les fils privés seront créés, ex. `#ticket`).',
      flags: MessageFlags.Ephemeral,
    });
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
  const perms = me?.permissionsIn(channel);
  const missing = [];
  if (!perms?.has(PermissionFlagsBits.SendMessages)) missing.push('Envoyer des messages');
  if (!perms?.has(PermissionFlagsBits.CreatePrivateThreads)) missing.push('Créer des fils privés');
  if (!perms?.has(PermissionFlagsBits.SendMessagesInThreads)) missing.push('Envoyer des messages dans les fils');
  if (!perms?.has(PermissionFlagsBits.ManageThreads)) missing.push('Gérer les fils');
  if (missing.length) {
    return interaction.reply({
      content: `❌ Permissions manquantes dans ce salon : **${missing.join(', ')}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const msg = await channel.send({
    embeds: [buildPanelEmbed(interaction.client)],
    components: [buildPanelButtons()],
  });
  await setTicketPanel(interaction.guild.id, channel.id, msg.id);
  const pingHint = config.ticketStaffRoleIds.length
    ? ''
    : '\n⚠️ `TICKET_STAFF_ROLE_IDS` est vide : aucun rôle ne sera pingé à l’ouverture.';
  return interaction.reply({
    content: `✅ Panneau de tickets posté dans ${channel}. Les fils privés s’ouvriront ici.${pingHint}`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleTicketModalSubmit(interaction) {
  const typeId = String(interaction.customId || '').replace('ticket_modal_', '');
  const meta = getTicketType(typeId);
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: '❌ Utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
  }

  const subject = sanitizeReason(interaction.fields.getTextInputValue('sujet')) || 'Non précisé';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = await getOpenTicketForUser(guild.id, interaction.user.id);
  if (existing) {
    return interaction.editReply({
      content: `❌ Tu as déjà un ticket ouvert : <#${existing.thread_id}>.`,
    });
  }

  const parentId = config.ticketChannelId || interaction.channelId;
  const parent = await interaction.client.channels.fetch(parentId).catch(() => null);
  if (!parent || !parent.isTextBased?.() || parent.isThread?.() || parent.type === ChannelType.DM) {
    return interaction.editReply({
      content: '❌ Salon tickets introuvable. Un staff doit relancer `/ticket-panel` dans le salon `#ticket`.',
    });
  }

  const username = sanitizeThreadNamePart(interaction.user.username || interaction.user.globalName || interaction.user.id);
  const threadName = `${meta.threadPrefix}-${username}`.slice(0, 100);

  let thread;
  try {
    thread = await parent.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Ticket ${meta.label} — ${interaction.user.tag}`,
    });
  } catch (err) {
    console.error("[L'éphémère] Création thread ticket:", err?.message || err);
    return interaction.editReply({
      content:
        '❌ Impossible de créer le fil privé. Vérifie que le bot a **Créer des fils privés** et **Gérer les fils** dans ce salon.',
    });
  }

  try {
    await thread.members.add(interaction.user.id);
  } catch (err) {
    console.warn("[L'éphémère] Ajout membre au ticket:", err?.message || err);
  }

  const ping = staffPingContent();
  const embed = buildTicketEmbed({
    client: interaction.client,
    userId: interaction.user.id,
    type: meta.id,
    subject,
  });

  try {
    const intro = await thread.send({
      content: ping || undefined,
      embeds: [embed],
      components: [ticketActionRow()],
      allowedMentions: { roles: config.ticketStaffRoleIds, users: [interaction.user.id] },
    });
    await createTicket({
      guildId: guild.id,
      threadId: thread.id,
      userId: interaction.user.id,
      type: meta.id,
      subject,
      panelMessageId: intro.id,
    });
  } catch (err) {
    console.error("[L'éphémère] Message initial ticket:", err?.message || err);
    return interaction.editReply({ content: `❌ Fil créé (<#${thread.id}>) mais le message d’accueil a échoué.` });
  }

  try {
    const panel = await getTicketPanel(guild.id);
    if (panel?.channel_id && panel?.message_id) {
      const ch = await interaction.client.channels.fetch(panel.channel_id).catch(() => null);
      const msg = ch?.messages ? await ch.messages.fetch(panel.message_id).catch(() => null) : null;
      if (msg) await msg.edit({ components: [buildPanelButtons()] }).catch(() => {});
    }
  } catch (_) {}

  return interaction.editReply({ content: `✅ Ticket ouvert : ${thread}` });
}

export async function handleTicketButton(interaction) {
  const thread = interaction.channel;
  if (!thread?.isThread?.()) {
    return interaction.reply({ content: '❌ Ces boutons ne fonctionnent que dans un fil de ticket.', flags: MessageFlags.Ephemeral });
  }

  const ticket = await getTicketByThreadId(thread.id);
  if (!ticket) {
    return interaction.reply({ content: '❌ Ce fil n’est pas un ticket connu.', flags: MessageFlags.Ephemeral });
  }

  const member = interaction.member;
  const staff = isStaffMember(member);
  const opener = ticket.user_id === interaction.user.id;

  if (interaction.customId === 'ticket_claim') {
    if (!staff) {
      return interaction.reply({ content: '❌ Seul le staff peut revendiquer un ticket.', flags: MessageFlags.Ephemeral });
    }
    if (ticket.status !== 'open') {
      return interaction.reply({ content: '❌ Ce ticket est déjà fermé.', flags: MessageFlags.Ephemeral });
    }
    if (ticket.claimed_by) {
      return interaction.reply({ content: `ℹ️ Déjà pris en charge par <@${ticket.claimed_by}>.`, flags: MessageFlags.Ephemeral });
    }

    await claimTicket(thread.id, interaction.user.id);
    const embed = buildTicketEmbed({
      client: interaction.client,
      userId: ticket.user_id,
      type: ticket.type,
      subject: ticket.subject,
      claimedBy: interaction.user.id,
    });

    try {
      await interaction.update({
        embeds: [embed],
        components: [ticketActionRow({ claimed: true })],
      });
    } catch (_) {
      await interaction.reply({ content: `✅ Ticket revendiqué par <@${interaction.user.id}>.`, flags: MessageFlags.Ephemeral });
    }

    await thread.send({
      content: `🛡️ Ticket revendiqué par <@${interaction.user.id}>.`,
      allowedMentions: { users: [interaction.user.id, ticket.user_id] },
    }).catch(() => {});
    return;
  }

  if (interaction.customId === 'ticket_close') {
    if (!staff && !opener) {
      return interaction.reply({ content: '❌ Seuls le staff ou l’auteur du ticket peuvent le fermer.', flags: MessageFlags.Ephemeral });
    }
    if (ticket.status === 'closed') {
      return interaction.reply({ content: 'ℹ️ Ce ticket est déjà fermé.', flags: MessageFlags.Ephemeral });
    }

    await closeTicket(thread.id);
    const embed = buildTicketEmbed({
      client: interaction.client,
      userId: ticket.user_id,
      type: ticket.type,
      subject: ticket.subject,
      claimedBy: ticket.claimed_by,
      closed: true,
    });

    try {
      await interaction.update({
        embeds: [embed],
        components: [ticketActionRow({ claimed: Boolean(ticket.claimed_by), closed: true })],
      });
    } catch (_) {
      await interaction.reply({ content: '✅ Ticket fermé.', flags: MessageFlags.Ephemeral });
    }

    await thread
      .send({
        content: `🔒 Ticket fermé par <@${interaction.user.id}>.`,
        allowedMentions: { users: [interaction.user.id] },
      })
      .catch(() => {});

    try {
      await thread.setLocked(true, `Ticket fermé par ${interaction.user.tag}`);
      await thread.setArchived(true, `Ticket fermé par ${interaction.user.tag}`);
    } catch (err) {
      console.warn("[L'éphémère] Archivage ticket:", err?.message || err);
    }
  }
}
