import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { COLOR_OTHER, getBotAuthor, getBotFooter } from '../embeds.js';
import { canCloseTicket } from '../permissions.js';

const SAKURA = '<:CZsakurablossom:1542146100180418610>';
const MEMBER_ROLE_ID = (process.env.REGLEMENT_MEMBER_ROLE_ID || '1542149474200326174').trim();
const REGLEMENT_ACCEPT_BUTTON_ID = 'reglement_accept';

function quoteParagraph(...lines) {
  return lines
    .join('\n')
    .split('\n')
    .map((line) => (line.length ? `> ${line}` : '>'))
    .join('\n');
}

function buildReglementEmbed(client) {
  const description = [
    `${SAKURA} **__Bienvenue sur Chill Zoneˢᶠᵂ | FR__** ${SAKURA}`,
    '',
    'Afin de préserver un espace chill, convivial, bienveillant et sécurisé, merci de prendre connaissance du règlement avant de participer à la vie du serveur.',
    '',
    quoteParagraph(
      '1. 🔒 Serveur 100 % SFW :',
      'Ce serveur est exclusivement SFW. Tout contenu à caractère sexuel ou pornographique; illégal; gore; extrêmement violent; est strictement interdit. Tout contenu de ce type sera supprimé immédiatement et entraînera un ban définitif, sans avertissement préalable.'
    ),
    '',
    quoteParagraph(
      '2. 👶 Âge minimum :',
      'Les membres âgés de 15 à 17 ans sont autorisés sur le serveur. Les personnes ayant moins de 15 ans ne sont pas autorisées à rejoindre la communauté. L’âge minimum requis pour utiliser Discord en France est de 15 ans. Merci de respecter cette limite d’âge.'
    ),
    '',
    quoteParagraph(
      '3. 🛡️ Vérification de l’âge & protection des mineurs :',
      'Afin de garantir un environnement sécurisé pour notre population la plus jeune, les personnes âgées de plus de 40 ans ne sont pas autorisées sur le serveur. En cas de doute concernant l’âge déclaré d’un membre, la modération se réserve le droit de vous convoquer en entretien afin de procéder à une vérification d’âge. Cette vérification pourra être demandée notamment lorsqu’un profil, un comportement ou des informations fournies semblent incohérents avec l’âge déclaré. Un refus de coopérer à une vérification d’âge pourra entraîner une exclusion temporaire ou définitive du serveur.'
    ),
    '',
    quoteParagraph(
      '4. 🚨 Protection des mineurs & comportements inappropriés :',
      'Toute personne ayant des comportements de « pointeur » envers des mineurs sera bannie définitivement. Il est strictement interdit d’entretenir ou de rechercher une relation sexuelle et/ou amoureuse avec un(e) mineur(e). Si vous êtes témoin d’un comportement qui vous semble inapproprié, prédateur, manipulateur ou suspect envers un mineur, merci de le signaler immédiatement à la modération.'
    ),
    '',
    quoteParagraph(
      '5. 🏷️ Utilisation des salons :',
      'Merci de respecter l’utilisation prévue pour chaque salon. Postez vos messages dans les salons appropriés et évitez le hors sujet lorsque celui-ci n’est pas autorisé.'
    ),
    '',
    quoteParagraph(
      '6. 🎫 Tickets :',
      'Lorsque vous ouvrez un ticket auprès de la modération, merci de rester réactif et disponible. Nous faisons notre maximum pour vous répondre rapidement; nous vous demandons donc d’en faire de même. Un ticket resté sans réponse pendant plus de 24 heures entraînera un warn.'
    ),
    '',
    quoteParagraph(
      '7. 🚫 Respect & tolérance :',
      'Aucun comportement discriminatoire ou haineux ne sera toléré.',
      'Sont notamment interdits :',
      '❌ Les propos racistes ;',
      '❌ Les propos homophobes ou LGBTQphobes ;',
      '❌ Les propos sexistes ou misogynes ;',
      '❌ Les insultes visant à rabaisser ou humilier;',
      '❌ Le harcèlement;',
      '❌ Les menaces;',
      '❌ Toute forme de discrimination ou de haine.',
      'Tout comportement grave entraînera un ban immédiat et définitif, sans avertissement.'
    ),
    '',
    quoteParagraph(
      '8. 🌿 Le mot d’ordre : bienveillance',
      'Chill Zoneˢᶠᵂ | FR est avant tout un espace où chacun doit pouvoir se sentir à l’aise, respecté et en sécurité. Soyez respectueux envers les autres membres, la modération et vous-même. En cas de conflit ou de situation problématique, privilégiez le dialogue et faites appel à la modération.'
    ),
    '',
    `🌸 En rejoignant **__Chill Zoneˢᶠᵂ | FR__**, vous acceptez l’intégralité de ce règlement.`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(COLOR_OTHER)
    .setAuthor(getBotAuthor(client))
    .setDescription(description)
    .setFooter(getBotFooter(client, { extra: 'Règlement' }));
}

function buildReglementButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(REGLEMENT_ACCEPT_BUTTON_ID)
      .setLabel('Lu et approuvé')
      .setStyle(ButtonStyle.Success)
  );
}

export function isReglementButton(customId) {
  return customId === REGLEMENT_ACCEPT_BUTTON_ID;
}

export const reglementCommands = [
  new SlashCommandBuilder()
    .setName('reglement')
    .setNameLocalizations({ fr: 'règlement' })
    .setDescription('Poster le règlement du serveur dans ce salon.')
    .setDescriptionLocalizations({ fr: 'Poster le règlement du serveur dans ce salon.' })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addChannelOption((o) =>
      o
        .setName('salon')
        .setDescription('Salon où poster le règlement (sinon le salon actuel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .toJSON(),
];

export async function handleReglement(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: '❌ Commande utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
  }
  if (!(await canCloseTicket(interaction))) {
    return interaction.reply({
      content: '❌ Réservé aux **administrateurs** et au **propriétaire** du serveur.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = interaction.options.getChannel('salon') || interaction.channel;
  if (!channel?.isTextBased?.() || channel.isThread?.() || channel.isDMBased?.()) {
    return interaction.reply({
      content: '❌ Poster le règlement dans un salon texte ou annonces.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const perms = me?.permissionsIn(channel);
  if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
    return interaction.reply({
      content: `❌ Le bot doit pouvoir **voir** ${channel}, **y envoyer des messages** et **intégrer des liens**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({
      content: '❌ Le bot a besoin de la permission **Gérer les rôles** pour donner le rôle membre.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await channel.send({
      embeds: [buildReglementEmbed(interaction.client)],
      components: [buildReglementButtons()],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[L'éphémère] /règlement envoi:", err?.message || err);
    return interaction.reply({
      content: `❌ Impossible de poster le règlement : ${err?.message || 'erreur'}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `✅ Règlement posté dans ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleReglementButton(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: '❌ Utilisable uniquement sur un serveur.', flags: MessageFlags.Ephemeral });
  }

  const member =
    interaction.member && typeof interaction.member.roles?.add === 'function'
      ? interaction.member
      : await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: '❌ Impossible de récupérer ton profil membre.', flags: MessageFlags.Ephemeral });
  }

  if (member.roles.cache.has(MEMBER_ROLE_ID)) {
    return interaction.reply({
      content: '✅ Tu as déjà accepté le règlement.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const role = guild.roles.cache.get(MEMBER_ROLE_ID) ?? (await guild.roles.fetch(MEMBER_ROLE_ID).catch(() => null));
  if (!role) {
    return interaction.reply({
      content: '❌ Le rôle membre est introuvable. Préviens un administrateur.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({
      content: '❌ Le bot n’a pas la permission **Gérer les rôles**.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    return interaction.reply({
      content: '❌ Le rôle du bot doit être **au-dessus** du rôle membre pour pouvoir l’attribuer.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await member.roles.add(role, 'Règlement lu et approuvé');
  } catch (err) {
    console.error("[L'éphémère] règlement rôle:", err?.message || err);
    return interaction.reply({
      content: `❌ Impossible de t’attribuer le rôle : ${err?.message || 'erreur'}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: '✅ Règlement lu et approuvé. Tu as maintenant le rôle membre.',
    flags: MessageFlags.Ephemeral,
  });
}
