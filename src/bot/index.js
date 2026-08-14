const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const TokenDatabase = require('../database');
const DashboardManager = require('./dashboard');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

/**
 * Start the Discord bot
 */
async function startBot() {
  // Register slash commands
  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Configure the recovery dashboard channel (Server Admin only)')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel for the recovery dashboard')
          .setRequired(true))
      .addRoleOption(option =>
        option.setName('trusted-role')
          .setDescription('Role that can initiate recoveries (optional)')
          .setRequired(false))
      .addUserOption(option =>
        option.setName('trusted-user')
          .setDescription('Individual user who can initiate recoveries (optional)')
          .setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
      .setName('add-trusted-role')
      .setDescription('Add a trusted role for recovery management (Server Admin only)')
      .addRoleOption(option =>
        option.setName('role')
          .setDescription('The role to add as trusted')
          .setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
      .setName('remove-trusted-role')
      .setDescription('Remove a trusted role (Server Admin only)')
      .addRoleOption(option =>
        option.setName('role')
          .setDescription('The role to remove from trusted')
          .setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
      .setName('add-trusted-user')
      .setDescription('Add a trusted user for recovery management (Server Admin only)')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('The user to add as trusted')
          .setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
      .setName('remove-trusted-user')
      .setDescription('Remove a trusted user (Server Admin only)')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('The user to remove from trusted')
          .setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
      .setName('list-trusted')
      .setDescription('List all trusted roles and users (Server Admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
      .setName('link-account')
      .setDescription('Link your Minecraft/Microsoft account to the recovery dashboard')
      .addStringOption(option =>
        option.setName('minecraft-username')
          .setDescription('Your Minecraft username')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('microsoft-email')
          .setDescription('Your Microsoft account email (for identification hash only)')
          .setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('setup-recovery')
      .setDescription('Set up pre-authorized recovery for your Microsoft account (do this while you still have access)')
      .addStringOption(option =>
        option.setName('microsoft-email')
          .setDescription('Your Microsoft account email (for identification hash only)')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('notes')
          .setDescription('Optional notes about your recovery setup')
          .setRequired(false)),
    
    new SlashCommandBuilder()
      .setName('recover')
      .setDescription('Start immediate recovery process (requires pre-authorized setup)'),
    
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check your pre-authorized recovery status'),
    
    new SlashCommandBuilder()
      .setName('revoke')
      .setDescription('Get guidance for revoking existing sessions'),
    
    new SlashCommandBuilder()
      .setName('logout')
      .setDescription('Remove your recovery session from this bot'),
    
    new SlashCommandBuilder()
      .setName('security-guide')
      .setDescription('Get official Microsoft account security resources'),
  ].map(command => command.toJSON());

  // Handle slash commands
  client.on('interactionCreate', async (interaction) => {
    // Handle button interactions
    if (interaction.isButton()) {
      const handled = await DashboardManager.handleButtonInteraction(interaction, client);
      if (handled) return;
      
      const confirmHandled = await DashboardManager.handleConfirmationInteraction(interaction, client);
      if (confirmHandled) return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
      if (commandName === 'setup') {
        await handleSetupCommand(interaction);
      } else if (commandName === 'add-trusted-role') {
        await handleAddTrustedRoleCommand(interaction);
      } else if (commandName === 'remove-trusted-role') {
        await handleRemoveTrustedRoleCommand(interaction);
      } else if (commandName === 'add-trusted-user') {
        await handleAddTrustedUserCommand(interaction);
      } else if (commandName === 'remove-trusted-user') {
        await handleRemoveTrustedUserCommand(interaction);
      } else if (commandName === 'list-trusted') {
        await handleListTrustedCommand(interaction);
      } else if (commandName === 'link-account') {
        await handleLinkAccountCommand(interaction);
      } else if (commandName === 'setup-recovery') {
        await handleSetupRecoveryCommand(interaction);
      } else if (commandName === 'recover') {
        await handleRecoverCommand(interaction);
      } else if (commandName === 'status') {
        await handleStatusCommand(interaction);
      } else if (commandName === 'revoke') {
        await handleRevokeCommand(interaction);
      } else if (commandName === 'logout') {
        await handleLogoutCommand(interaction);
      } else if (commandName === 'security-guide') {
        await handleSecurityGuideCommand(interaction);
      }
    } catch (error) {
      console.error('Error handling command:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('An error occurred while processing your command.')
        .setTimestamp();
      
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  });

  // Bot ready event
  client.once('ready', async () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
    
    // Register slash commands after bot is ready
    try {
      console.log('Registering slash commands...');
      await client.rest.put(
        `/applications/${config.discord.clientId}/commands`,
        { body: commands }
      );
      console.log('Slash commands registered successfully');
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  });

  // Login to Discord
  await client.login(config.discord.token);
}

/**
 * Handle /setup command
 */
async function handleSetupCommand(interaction) {
  // Check if user has admin permissions
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Permission Denied')
      .setDescription('You need Administrator permissions to configure the recovery dashboard.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const trustedRole = interaction.options.getRole('trusted-role');
  const trustedUser = interaction.options.getUser('trusted-user');
  const serverId = interaction.guildId;
  const configuredBy = interaction.user.id;

  // Validate channel is a text channel
  if (channel.type !== 0) { // 0 is text channel type
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Invalid Channel Type')
      .setDescription('Please select a text channel for the recovery dashboard.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Save server configuration
  TokenDatabase.setServerConfig(serverId, {
    recovery_channel_id: channel.id,
    configured_by: configuredBy,
    configured_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000)
  });

  // Add trusted role if provided
  if (trustedRole) {
    TokenDatabase.addTrustedRole(serverId, trustedRole.id, configuredBy);
  }

  // Add trusted user if provided
  if (trustedUser) {
    TokenDatabase.addTrustedUser(serverId, trustedUser.id, configuredBy);
  }

  // Create the dashboard
  DashboardManager.createOrUpdateDashboard(client, serverId, channel.id);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Recovery Dashboard Configured')
    .setDescription(`Recovery dashboard has been created in <#${channel.id}>`)
    .addFields(
      { name: '📢 Channel', value: `<#${channel.id}>`, inline: true },
      { name: '👤 Configured by', value: `<@${configuredBy}>`, inline: true },
      { name: '�️ Trusted Role', value: trustedRole ? `<@&${trustedRole.id}>` : 'None configured', inline: true },
      { name: '👤 Trusted User', value: trustedUser ? `<@${trustedUser.id}>` : 'None configured', inline: true },
      { name: '�🔒 Privacy', value: 'Ensure this channel is private/restricted to authorized personnel only', inline: false },
      { name: '📋 Usage', value: 'Use `/link-account` to add Minecraft accounts to the dashboard. Use `/add-trusted-role` and `/add-trusted-user` to manage trusted members.', inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });

  console.log(`Server ${serverId} configured recovery dashboard in channel ${channel.id} by user ${configuredBy}`);
}

/**
 * Handle /add-trusted-role command
 */
async function handleAddTrustedRoleCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Permission Denied')
      .setDescription('You need Administrator permissions to manage trusted roles.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role');
  const serverId = interaction.guildId;
  const addedBy = interaction.user.id;

  TokenDatabase.addTrustedRole(serverId, role.id, addedBy);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Trusted Role Added')
    .setDescription(`Role <@&${role.id}> can now initiate recovery for accounts on this server.`)
    .addFields(
      { name: '🛡️ Role', value: `<@&${role.id}>`, inline: true },
      { name: '👤 Added by', value: `<@${addedBy}>`, inline: true },
      { name: '📋 Permissions', value: 'Members with this role can use Recover Account and Status functions. Destructive actions still require admin confirmation.', inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`Trusted role ${role.id} added to server ${serverId} by user ${addedBy}`);
}

/**
 * Handle /remove-trusted-role command
 */
async function handleRemoveTrustedRoleCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Permission Denied')
      .setDescription('You need Administrator permissions to manage trusted roles.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role');
  const serverId = interaction.guildId;

  TokenDatabase.removeTrustedRole(serverId, role.id);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Trusted Role Removed')
    .setDescription(`Role <@&${role.id}> can no longer initiate recovery for accounts on this server.`)
    .addFields(
      { name: '🛡️ Role', value: `<@&${role.id}>`, inline: true },
      { name: '📋 Note', value: 'Members with this role will need to be individually trusted or use other trusted roles.', inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`Trusted role ${role.id} removed from server ${serverId}`);
}

/**
 * Handle /add-trusted-user command
 */
async function handleAddTrustedUserCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Permission Denied')
      .setDescription('You need Administrator permissions to manage trusted users.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');
  const serverId = interaction.guildId;
  const addedBy = interaction.user.id;

  TokenDatabase.addTrustedUser(serverId, user.id, addedBy);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Trusted User Added')
    .setDescription(`User <@${user.id}> can now initiate recovery for accounts on this server.`)
    .addFields(
      { name: '👤 User', value: `<@${user.id}>`, inline: true },
      { name: '👤 Added by', value: `<@${addedBy}>`, inline: true },
      { name: '📋 Permissions', value: 'This user can use Recover Account and Status functions. Destructive actions still require admin confirmation.', inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`Trusted user ${user.id} added to server ${serverId} by user ${addedBy}`);
}

/**
 * Handle /remove-trusted-user command
 */
async function handleRemoveTrustedUserCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Permission Denied')
      .setDescription('You need Administrator permissions to manage trusted users.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');
  const serverId = interaction.guildId;

  TokenDatabase.removeTrustedUser(serverId, user.id);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Trusted User Removed')
    .setDescription(`User <@${user.id}> can no longer initiate recovery for accounts on this server.`)
    .addFields(
      { name: '👤 User', value: `<@${user.id}>`, inline: true },
      { name: '📋 Note', value: 'This user will need to be added as trusted again to initiate recoveries.', inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`Trusted user ${user.id} removed from server ${serverId}`);
}

/**
 * Handle /list-trusted command
 */
async function handleListTrustedCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Permission Denied')
      .setDescription('You need Administrator permissions to list trusted members.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const serverId = interaction.guildId;
  const trustedRoles = TokenDatabase.getTrustedRoles(serverId);
  const trustedUsers = TokenDatabase.getTrustedUsers(serverId);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ Trusted Recovery Members')
    .setDescription('Members who can initiate recovery for accounts on this server.')
    .setTimestamp();

  if (trustedRoles.length > 0) {
    const roleList = trustedRoles.map(r => `<@&${r.role_id}>`).join(', ');
    embed.addFields({
      name: '🛡️ Trusted Roles',
      value: roleList,
      inline: false
    });
  } else {
    embed.addFields({
      name: '🛡️ Trusted Roles',
      value: 'No trusted roles configured',
      inline: false
    });
  }

  if (trustedUsers.length > 0) {
    const userList = trustedUsers.map(u => `<@${u.user_id}>`).join(', ');
    embed.addFields({
      name: '👤 Trusted Users',
      value: userList,
      inline: false
    });
  } else {
    embed.addFields({
      name: '👤 Trusted Users',
      value: 'No trusted users configured',
      inline: false
    });
  }

  embed.addFields({
    name: '📋 Management',
    value: 'Use `/add-trusted-role`, `/remove-trusted-role`, `/add-trusted-user`, and `/remove-trusted-user` to manage trusted members.',
    inline: false
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`Trusted members listed for server ${serverId}`);
}

/**
 * Handle /setup-recovery command
 */
async function handleSetupRecoveryCommand(interaction) {
  const discordUserId = interaction.user.id;
  const microsoftEmail = interaction.options.getString('microsoft-email');
  const notes = interaction.options.getString('notes');

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(microsoftEmail)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Invalid Email Format')
      .setDescription('Please provide a valid Microsoft account email address.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Create secure hash of the email (only store hash, never the actual email)
  const accountHash = TokenDatabase.createAccountHash(microsoftEmail.toLowerCase());

  // Store pre-authorized recovery setup
  TokenDatabase.createPreAuthorizedRecovery(discordUserId, accountHash, notes);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Pre-Authorized Recovery Setup Complete')
    .setDescription('Your recovery setup has been configured. If your account is compromised, you can now use `/recover` for immediate recovery guidance.')
    .addFields(
      { name: '🔐 Security Note', value: 'Only a secure hash of your email is stored. Your actual email and credentials are never stored.', inline: false },
      { name: '⏰ When to Use', value: 'Use `/recover` immediately if you suspect your account has been compromised. This setup allows instant access to recovery guidance.', inline: false },
      { name: '📋 Setup Details', value: `Setup completed: ${new Date().toLocaleString()}\n${notes ? `Notes: ${notes}` : ''}`, inline: false },
      { name: '🔄 Maintain Setup', value: 'Re-run this command periodically (every 3-6 months) to keep your recovery setup current.', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Pre-Authorized Recovery System' });

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`Pre-authorized recovery setup completed for user ${discordUserId}`);
}

/**
 * Handle /link-account command
 */
async function handleLinkAccountCommand(interaction) {
  const discordUserId = interaction.user.id;
  const serverId = interaction.guildId;
  const minecraftUsername = interaction.options.getString('minecraft-username');
  const microsoftEmail = interaction.options.getString('microsoft-email');

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(microsoftEmail)) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Invalid Email Format')
      .setDescription('Please provide a valid Microsoft account email address.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Create secure hash of the email
  const accountHash = TokenDatabase.createAccountHash(microsoftEmail.toLowerCase());

  // Check if account already exists
  const existingAccounts = TokenDatabase.getMinecraftAccountsByUser(discordUserId);
  const alreadyLinked = existingAccounts.find(acc => acc.microsoft_account_hash === accountHash);

  if (alreadyLinked) {
    const embed = new EmbedBuilder()
      .setColor('#ff9900')
      .setTitle('Account Already Linked')
      .setDescription('This Microsoft account is already linked to your Discord account.')
      .addFields(
        { name: '🎮 Minecraft Username', value: alreadyLinked.minecraft_username || 'Not set', inline: true },
        { name: '🆔 UUID', value: alreadyLinked.minecraft_uuid || 'Not linked', inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Create the Minecraft account
  TokenDatabase.createMinecraftAccount(discordUserId, serverId, accountHash, minecraftUsername);
  TokenDatabase.logRecoveryAction(discordUserId, serverId, null, 'account_linked', `Minecraft account ${minecraftUsername} linked to dashboard`);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Account Linked Successfully')
    .setDescription('Your Minecraft account has been linked to the recovery dashboard.')
    .addFields(
      { name: '🎮 Minecraft Username', value: minecraftUsername, inline: true },
      { name: '👤 Discord User', value: `<@${discordUserId}>`, inline: true },
      { name: '🔐 Security Note', value: 'Only a secure hash of your Microsoft email is stored. Your actual credentials are never stored.', inline: false },
      { name: '📋 Next Steps', value: 'Use `/setup-recovery` to enable pre-authorized recovery for this account.', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Recovery Dashboard • Account Management' });

  await interaction.reply({ embeds: [embed], ephemeral: true });

  // Update dashboard
  const serverConfig = TokenDatabase.getServerConfig(serverId);
  if (serverConfig && serverConfig.recovery_channel_id) {
    await DashboardManager.createOrUpdateDashboard(client, serverId, serverConfig.recovery_channel_id);
  }

  console.log(`Minecraft account ${minecraftUsername} linked for user ${discordUserId} in server ${serverId}`);
}

/**
 * Handle /recover command
 */
async function handleRecoverCommand(interaction) {
  const discordUserId = interaction.user.id;
  const serverId = interaction.guildId;
  
  // Check if user has pre-authorized recovery setup
  const preAuthSetup = TokenDatabase.getPreAuthorizedRecovery(discordUserId);
  
  if (!preAuthSetup) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('No Pre-Authorized Recovery Setup')
      .setDescription('You need to set up pre-authorized recovery first while you still have access to your account.')
      .addFields(
        { name: '🔧 Setup Required', value: 'Use `/setup-recovery` to set up recovery access before your account is compromised.', inline: false },
        { name: '⚠️ Security Best Practice', value: 'Set up recovery access now, while you still have access to your Microsoft account. This enables instant recovery if you\'re later locked out.', inline: false }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Check if user is already in recovery process
  const existingSession = TokenDatabase.getRecoverySession(discordUserId);
  
  if (existingSession) {
    const embed = new EmbedBuilder()
      .setColor('#ff9900')
      .setTitle('Recovery Already in Progress')
      .setDescription('You already have an active recovery session. Use `/status` to check progress or `/logout` to end this session.')
      .addFields(
        { name: '⚠️ Important', value: 'If you need to start over, please complete the current recovery process first.' }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Create recovery session immediately (no OAuth required)
  TokenDatabase.createRecoverySession(discordUserId, serverId, null, discordUserId);
  TokenDatabase.logRecoveryAction(discordUserId, serverId, null, 'recovery_started', 'Pre-authorized recovery initiated');
  TokenDatabase.updateLastVerified(discordUserId);
  
  // Get server config for notification channel
  const serverConfig = TokenDatabase.getServerConfig(serverId);
  
  // Create embed with immediate recovery guidance
  const embed = new EmbedBuilder()
    .setColor('#ff6b6b')
    .setTitle('� Immediate Account Recovery Process')
    .setDescription('Your pre-authorized recovery has been activated. Follow these steps immediately to secure your Microsoft account.')
    .addFields(
      { name: '✅ Pre-Authorized', value: 'Your recovery setup was verified. No additional authentication required.', inline: false },
      { name: '🔒 STEP 1: Change Password (IMMEDIATE)', value: 'Go to [account.microsoft.com/security](https://account.microsoft.com/security) and change your password NOW.', inline: false },
      { name: '📱 STEP 2: Review All Activity', value: 'Check recent sign-in activity at [Microsoft Security Dashboard](https://account.microsoft.com/security). Look for unfamiliar locations or devices.', inline: false },
      { name: '🔧 STEP 3: Revoke Sessions', value: 'Use `/revoke` command for guidance on revoking all existing sessions.', inline: false },
      { name: '📧 STEP 4: Update Recovery Info', value: 'Ensure your recovery email and phone are secure and accessible.', inline: false },
      { name: '🛡️ STEP 5: Enable 2FA', value: 'Enable two-factor authentication if not already active.', inline: false },
      { name: '🎮 STEP 6: Check Minecraft', value: 'Review your Minecraft profile for any unauthorized changes.', inline: false },
      { name: '📋 What This Bot Does', value: '• Provides immediate recovery guidance\n• Tracks your recovery progress\n• Offers session revocation instructions\n• Sends security notifications to configured channel', inline: false },
      { name: '🚫 What This Bot Does NOT Do', value: '• Does not store Microsoft credentials\n• Does not bypass Microsoft authentication\n• Does not change passwords directly\n• Does not modify account security settings', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Pre-Authorized Recovery System - Immediate Guidance' });

  await interaction.reply({ 
    embeds: [embed], 
    ephemeral: true 
  });

  // Send notification to configured channel if exists
  if (serverConfig && serverConfig.recovery_channel_id) {
    try {
      const channel = await client.channels.fetch(serverConfig.recovery_channel_id);
      if (channel) {
        const notificationEmbed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🚨 PRE-AUTHORIZED RECOVERY ACTIVATED')
          .setDescription(`User <@${discordUserId}> has activated their pre-authorized recovery.`)
          .addFields(
            { name: '👤 User ID', value: discordUserId, inline: true },
            { name: '📅 Activated At', value: new Date().toLocaleString(), inline: true },
            { name: '✅ Pre-Authorized', value: 'Yes - Setup verified', inline: true },
            { name: '⏰ Setup Date', value: new Date(preAuthSetup.setup_completed_at * 1000).toLocaleString(), inline: true }
          )
          .setTimestamp();

        await channel.send({ embeds: [notificationEmbed] });
      }
    } catch (error) {
      console.error('Error sending recovery notification:', error);
    }
  }

  console.log(`Pre-authorized recovery activated for user ${discordUserId} in server ${serverId}`);
}

/**
 * Handle /status command
 */
async function handleStatusCommand(interaction) {
  const discordUserId = interaction.user.id;
  const preAuthSetup = TokenDatabase.getPreAuthorizedRecovery(discordUserId);
  const session = TokenDatabase.getRecoverySession(discordUserId);

  if (!preAuthSetup) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('No Pre-Authorized Recovery Setup')
      .setDescription('You do not have pre-authorized recovery configured. Use `/setup-recovery` to set it up.')
      .addFields(
        { name: '🛡️ Prevention', value: 'Set up recovery access now while you still have access to your account.' }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const statusColor = session ? (session.recovery_status === 'completed' ? '#00ff00' : '#ff9900') : '#00ff00';
  const statusEmoji = session ? (session.recovery_status === 'completed' ? '✅' : '🔄') : '✅';

  const embed = new EmbedBuilder()
    .setColor(statusColor)
    .setTitle('Pre-Authorized Recovery Status')
    .addFields(
      { name: '✅ Setup Status', value: 'Pre-authorized recovery configured', inline: true },
      { name: '� Setup Date', value: new Date(preAuthSetup.setup_completed_at * 1000).toLocaleString(), inline: true },
      { name: '� Last Verified', value: new Date(preAuthSetup.last_verified_at * 1000).toLocaleString(), inline: true },
    )
    .setTimestamp();

  if (session) {
    embed.addFields({
      name: '🚨 Recovery Session', 
      value: `${statusEmoji} ${session.recovery_status.charAt(0).toUpperCase() + session.recovery_status.slice(1)}`, 
      inline: true 
    });

    if (session.recovery_started_at) {
      embed.addFields({
        name: '⏱️ Recovery Duration', 
        value: `${Math.floor((Date.now() / 1000 - session.recovery_started_at) / 60)} minutes`, 
        inline: true 
      });
    }

    if (session.sessions_revoked_at) {
      embed.addFields({
        name: '🔒 Sessions Revoked', 
        value: `✅ ${new Date(session.sessions_revoked_at * 1000).toLocaleString()}`, 
        inline: true 
      });
    }
  } else {
    embed.addFields({
      name: '🚨 Recovery Session', 
      value: 'No active recovery session - ready for immediate activation', 
      inline: true 
    });
  }

  if (preAuthSetup.setup_notes) {
    embed.addFields({
      name: '📝 Setup Notes', 
      value: preAuthSetup.setup_notes, 
      inline: false 
    });
  }

  embed.addFields({
    name: '📋 Recommended Actions',
    value: session 
      ? 'Complete the recovery steps. Use `/revoke` for session revocation guidance.'
      : 'Your recovery setup is ready. Use `/recover` immediately if your account is compromised.',
    inline: false,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /revoke command
 */
async function handleRevokeCommand(interaction) {
  const discordUserId = interaction.user.id;
  const session = TokenDatabase.getRecoverySession(discordUserId);

  if (!session) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('No Active Recovery Session')
      .setDescription('You need to start the recovery process first with `/recover`.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Mark sessions as revoked in our tracking
  TokenDatabase.setSessionsRevokedTime(discordUserId);
  TokenDatabase.logRecoveryAction(discordUserId, session.server_id, 'sessions_revoked_guidance', 'User received session revocation guidance');

  const embed = new EmbedBuilder()
    .setColor('#ff9900')
    .setTitle('🔧 Session Revocation Guidance')
    .setDescription('Follow these steps to revoke all existing Microsoft sessions.')
    .addFields(
      { name: '🔒 Step 1: Device Management', value: 'Visit [account.microsoft.com/devices](https://account.microsoft.com/devices) to review all connected devices.', inline: false },
      { name: '📱 Step 2: Remove Unfamiliar Devices', value: 'Remove any devices or browsers you don\'t recognize or no longer use.', inline: false },
      { name: '🔐 Step 3: Review Apps', value: 'Check connected apps and remove any unfamiliar applications.', inline: false },
      { name: '� Step 4: Check Activity', value: 'Review recent sign-in activity at [Microsoft Security Dashboard](https://account.microsoft.com/security).', inline: false },
      { name: '� Step 5: Sign Out Everywhere', value: 'Use the "Sign out everywhere" option if available in your security settings.', inline: false },
      { name: '✅ Verification', value: 'After completing these steps, use `/status` to verify your recovery progress.', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Official Microsoft Session Revocation Guidance' });

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`User ${discordUserId} received session revocation guidance`);
}

/**
 * Handle /security-guide command
 */
async function handleSecurityGuideCommand(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ Official Microsoft Security Resources')
    .setDescription('Use these official Microsoft resources to secure and recover your account.')
    .addFields(
      { 
        name: '🔐 Account Recovery', 
        value: '[Recover your account](https://account.live.com/ResetPassword.aspx)\nFollow Microsoft\'s official recovery process' 
      },
      { 
        name: '📱 Security Dashboard', 
        value: '[Microsoft Security Basics](https://account.microsoft.com/security)\nReview security settings and recent activity' 
      },
      { 
        name: '🔑 Password Reset', 
        value: '[Reset your password](https://account.live.com/password/reset)\nOfficial password reset process' 
      },
      { 
        name: '📧 Recovery Info', 
        value: '[Update recovery info](https://account.microsoft.com/security)\nAdd or update recovery email/phone' 
      },
      { 
        name: '🚨 Report Compromise', 
        value: '[Report hacked account](https://www.microsoft.com/concern/AccountCompromise)\nOfficial compromise reporting' 
      },
      { 
        name: '🎮 Minecraft Support', 
        value: '[Minecraft Account Help](https://help.minecraft.net/hc/en-us)\nOfficial Minecraft account support' 
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Always use official Microsoft channels for account security' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /logout command
 */
async function handleLogoutCommand(interaction) {
  const discordUserId = interaction.user.id;
  const session = TokenDatabase.getRecoverySession(discordUserId);

  if (!session) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('No Active Recovery Session')
      .setDescription('You do not have an active recovery session to end.')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Delete recovery session from database
  TokenDatabase.deleteRecoverySession(discordUserId);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('Recovery Session Ended')
    .setDescription('Your recovery session has been removed from this bot. This does not affect your Microsoft account security.')
    .addFields(
      { name: '🔒 Account Status', value: 'Your Microsoft account remains secure according to Microsoft\'s official processes.' },
      { name: '📋 Remember', value: 'Continue following Microsoft\'s official security recommendations to keep your account protected.' },
      { name: '✅ Pre-Authorized Setup', value: 'Your pre-authorized recovery setup remains intact for future use.' }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });

  console.log(`User ${discordUserId} ended their recovery session`);
}

module.exports = {
  startBot,
  getClient: () => client, // Export for testing
};
