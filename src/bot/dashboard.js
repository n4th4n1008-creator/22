const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const TokenDatabase = require('../database');

/**
 * Dashboard Management System
 * Handles the creation and maintenance of the recovery dashboard
 */

const DashboardManager = {
  /**
   * Create or update the recovery dashboard
   */
  async createOrUpdateDashboard(client, serverId, channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        console.error(`Channel ${channelId} not found for server ${serverId}`);
        return false;
      }

      // Get existing dashboard message ID
      const existingMessageId = TokenDatabase.getDashboardMessage(serverId);
      
      // Get all Minecraft accounts for this server
      const accounts = TokenDatabase.getMinecraftAccountsByServer(serverId);
      
      // Create dashboard embed
      const dashboardEmbed = this.createDashboardEmbed(accounts);
      
      // Create action rows for each account
      const components = this.createAccountComponents(accounts);

      // Update or create the dashboard message
      if (existingMessageId) {
        try {
          const existingMessage = await channel.messages.fetch(existingMessageId);
          await existingMessage.edit({
            embeds: [dashboardEmbed],
            components: components
          });
          console.log(`Dashboard updated for server ${serverId}`);
        } catch (error) {
          console.error('Error updating existing dashboard message:', error);
          // If message doesn't exist, create a new one
          await this.createNewDashboardMessage(channel, dashboardEmbed, components, serverId);
        }
      } else {
        await this.createNewDashboardMessage(channel, dashboardEmbed, components, serverId);
      }

      return true;
    } catch (error) {
      console.error('Error creating/updating dashboard:', error);
      return false;
    }
  },

  /**
   * Create a new dashboard message
   */
  async createNewDashboardMessage(channel, embed, components, serverId) {
    const message = await channel.send({
      embeds: [embed],
      components: components
    });
    
    // Save the message ID
    TokenDatabase.updateDashboardMessage(serverId, message.id);
    console.log(`New dashboard created for server ${serverId}, message ID: ${message.id}`);
  },

  /**
   * Create the main dashboard embed
   */
  createDashboardEmbed(accounts) {
    const totalAccounts = accounts.length;
    const linkedAccounts = accounts.filter(a => a.link_status === 'linked').length;
    const recoveringAccounts = accounts.filter(a => a.recovery_status !== 'none').length;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🔐 Account Recovery Dashboard')
      .setDescription('Manage linked Minecraft/Microsoft accounts and their recovery status.')
      .addFields(
        { name: '📊 Statistics', value: `Total Accounts: ${totalAccounts}\nLinked: ${linkedAccounts}\nIn Recovery: ${recoveringAccounts}`, inline: true },
        { name: '🛡️ Security', value: 'No credentials stored. Only non-sensitive account information displayed.', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Recovery Dashboard • Use buttons below to manage accounts' });

    if (totalAccounts === 0) {
      embed.addFields({
        name: '📋 No Accounts Linked',
        value: 'No Minecraft/Microsoft accounts are currently linked to this dashboard.',
        inline: false
      });
    }

    return embed;
  },

  /**
   * Create action components for each account
   */
  createAccountComponents(accounts) {
    const components = [];
    
    // Discord allows max 5 action rows, each with max 5 buttons
    // We'll create one action row per account
    for (const account of accounts) {
      if (components.length >= 5) break; // Max 5 action rows
      
      const row = new ActionRowBuilder();
      
      // Account info button (disabled, informational)
      const accountButton = new ButtonBuilder()
        .setCustomId(`account_info_${account.id}`)
        .setLabel(`🎮 ${account.minecraft_username || 'Unknown'} • ${account.recovery_status}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      // Recover Account button
      const recoverButton = new ButtonBuilder()
        .setCustomId(`recover_${account.id}`)
        .setLabel('🔄 Recover Account')
        .setStyle(ButtonStyle.Primary);

      // Unlink Account button
      const unlinkButton = new ButtonBuilder()
        .setCustomId(`unlink_${account.id}`)
        .setLabel('🔓 Unlink')
        .setStyle(ButtonStyle.Secondary);

      // Change Owner button
      const changeOwnerButton = new ButtonBuilder()
        .setCustomId(`change_owner_${account.id}`)
        .setLabel('👤 Change Owner')
        .setStyle(ButtonStyle.Secondary);

      // Delete Information button
      const deleteButton = new ButtonBuilder()
        .setCustomId(`delete_${account.id}`)
        .setLabel('🗑️ Delete')
        .setStyle(ButtonStyle.Danger);

      row.addComponents(accountButton, recoverButton, unlinkButton, changeOwnerButton, deleteButton);
      components.push(row);
    }

    return components;
  },

  /**
   * Create an individual account embed
   */
  createAccountEmbed(account) {
    const statusColors = {
      'none': '#00ff00',
      'in_progress': '#ff9900',
      'completed': '#00ff00',
      'failed': '#ff0000'
    };

    const statusEmojis = {
      'none': '✅',
      'in_progress': '🔄',
      'completed': '✅',
      'failed': '❌'
    };

    const embed = new EmbedBuilder()
      .setColor(statusColors[account.recovery_status] || '#5865F2')
      .setTitle(`🎮 Account: ${account.minecraft_username || 'Unknown'}`)
      .addFields(
        { name: '🆔 Account ID', value: `#${account.id}`, inline: true },
        { name: '👤 Original Owner', value: `<@${account.discord_user_id}>`, inline: true },
        { name: '🆔 UUID', value: account.minecraft_uuid || 'Not linked', inline: true },
        { name: '📅 Linked Date', value: account.linked_at ? new Date(account.linked_at * 1000).toLocaleDateString() : 'Not set', inline: true },
        { name: '🔗 Link Status', value: account.link_status.charAt(0).toUpperCase() + account.link_status.slice(1), inline: true },
        { name: '🛡️ Recovery Status', value: `${statusEmojis[account.recovery_status] || '❓'} ${account.recovery_status.charAt(0).toUpperCase() + account.recovery_status.slice(1)}`, inline: true },
        { name: '⏰ Last Recovery', value: account.last_recovery_attempt ? new Date(account.last_recovery_attempt * 1000).toLocaleString() : 'Never', inline: true }
      )
      .setTimestamp();

    // Add recovery initiator information if available
    if (account.last_recovery_initiator) {
      embed.addFields({
        name: '🚀 Last Recovery Initiated By',
        value: `<@${account.last_recovery_initiator}>`,
        inline: true
      });
    }

    if (account.notes) {
      embed.addFields({
        name: '📝 Notes',
        value: account.notes,
        inline: false
      });
    }

    return embed;
  },

  /**
   * Handle button interactions
   */
  async handleButtonInteraction(interaction, client) {
    const customId = interaction.customId;
    
    if (!customId.startsWith('recover_') && 
        !customId.startsWith('unlink_') && 
        !customId.startsWith('delete_') && 
        !customId.startsWith('change_owner_')) {
      return false;
    }

    const [action, accountId] = customId.split('_');
    const account = TokenDatabase.getMinecraftAccount(parseInt(accountId));

    if (!account) {
      await interaction.reply({
        content: 'Account not found. It may have been deleted.',
        ephemeral: true
      });
      return true;
    }

    // Check if user is trusted for recovery actions
    if (action === 'recover') {
      const isTrusted = TokenDatabase.isUserTrusted(
        account.server_id, 
        interaction.user.id, 
        interaction.member.roles.cache.map(r => r.id)
      );
      
      if (!isTrusted && interaction.user.id !== account.discord_user_id) {
        await interaction.reply({
          content: 'You need to be a trusted member or the account owner to initiate recovery.',
          ephemeral: true
        });
        return true;
      }
    }

    // Check permissions for destructive actions
    if (action === 'delete' || action === 'change_owner' || action === 'unlink') {
      if (!interaction.memberPermissions.has('Administrator')) {
        await interaction.reply({
          content: 'You need Administrator permissions to perform this action.',
          ephemeral: true
        });
        return true;
      }
    }

    // Handle different actions
    switch (action) {
      case 'recover':
        await this.handleRecoverAccount(interaction, account, client);
        break;
      case 'unlink':
        await this.handleUnlinkAccount(interaction, account, client);
        break;
      case 'delete':
        await this.handleDeleteAccount(interaction, account, client);
        break;
      case 'change_owner':
        await this.handleChangeOwner(interaction, account, client);
        break;
    }

    return true;
  },

  /**
   * Handle Recover Account button
   */
  async handleRecoverAccount(interaction, account, client) {
    const initiatorId = interaction.user.id;
    const isTrustedInitiator = initiatorId !== account.discord_user_id;

    // Create recovery session with initiator tracking
    TokenDatabase.createRecoverySession(account.discord_user_id, account.server_id, account.id, initiatorId);
    TokenDatabase.updateRecoveryStatus(account.id, 'in_progress', initiatorId);
    TokenDatabase.logRecoveryAction(account.discord_user_id, account.server_id, account.id, 'recovery_started', `Recovery initiated by <@${initiatorId}> from dashboard`);

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('🚨 Account Recovery Initiated')
      .setDescription(`Recovery process started for Minecraft account: ${account.minecraft_username || 'Unknown'}`)
      .addFields(
        { name: '🎮 Account', value: account.minecraft_username || 'Unknown', inline: true },
        { name: '🆔 UUID', value: account.minecraft_uuid || 'Not linked', inline: true },
        { name: '👤 Original Owner', value: `<@${account.discord_user_id}>`, inline: true },
        { name: '� Initiated By', value: `<@${initiatorId}> ${isTrustedInitiator ? '(Trusted Member)' : '(Account Owner)'}`, inline: true },
        { name: '�🔒 STEP 1: Change Password', value: 'Go to [account.microsoft.com/security](https://account.microsoft.com/security) and change your password NOW.', inline: false },
        { name: '📱 STEP 2: Review Activity', value: 'Check recent sign-in activity at [Microsoft Security Dashboard](https://account.microsoft.com/security).', inline: false },
        { name: '🔧 STEP 3: Revoke Sessions', value: 'Use `/revoke` command for session revocation guidance.', inline: false },
        { name: '📧 STEP 4: Update Recovery Info', value: 'Ensure your recovery email and phone are secure.', inline: false },
        { name: '🛡️ STEP 5: Enable 2FA', value: 'Enable two-factor authentication if not already active.', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Official Microsoft Recovery Process' });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

    // Update dashboard
    await this.createOrUpdateDashboard(client, account.server_id, interaction.channelId);

    console.log(`Recovery initiated for account ${account.id} by user ${initiatorId} from dashboard`);
  },

  /**
   * Handle Unlink Account button (with confirmation)
   */
  async handleUnlinkAccount(interaction, account, client) {
    // Double admin confirmation for destructive actions
    if (!interaction.memberPermissions.has('Administrator')) {
      await interaction.reply({
        content: 'You need Administrator permissions to unlink accounts.',
        ephemeral: true
      });
      return;
    }

    // Create confirmation buttons
    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_unlink_${account.id}`)
          .setLabel('✅ Confirm Unlink')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cancel_unlink_${account.id}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    const embed = new EmbedBuilder()
      .setColor('#ff9900')
      .setTitle('⚠️ Confirm Account Unlink')
      .setDescription(`Are you sure you want to unlink the Minecraft account "${account.minecraft_username || 'Unknown'}"?`)
      .addFields(
        { name: '⚠️ Administrator Action Required', value: 'This is a destructive action that requires administrator confirmation.', inline: false },
        { name: 'What this does:', value: '• Removes Discord-to-account association\n• Does not modify Microsoft account\n• Does not affect Minecraft account security\n• Account can be re-linked later', inline: false },
        { name: 'Account Details', value: `Username: ${account.minecraft_username || 'Unknown'}\nUUID: ${account.minecraft_uuid || 'Not linked'}\nOwner: <@${account.discord_user_id}>`, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      components: [confirmRow],
      ephemeral: true
    });
  },

  /**
   * Handle Delete Account button (with confirmation)
   */
  async handleDeleteAccount(interaction, account, client) {
    // Double admin confirmation for destructive actions
    if (!interaction.memberPermissions.has('Administrator')) {
      await interaction.reply({
        content: 'You need Administrator permissions to delete accounts.',
        ephemeral: true
      });
      return;
    }

    // Create confirmation buttons
    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_delete_${account.id}`)
          .setLabel('✅ Confirm Delete')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cancel_delete_${account.id}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🗑️ Confirm Account Deletion')
      .setDescription(`Are you sure you want to PERMANENTLY DELETE all information for this account?`)
      .addFields(
        { name: '⚠️ WARNING', value: 'This action cannot be undone. All stored information will be permanently removed.', inline: false },
        { name: '🔒 Administrator Action Required', value: 'This is a destructive action that requires administrator confirmation.', inline: false },
        { name: 'What this does:', value: '• Permanently removes all stored account information\n• Removes Discord-to-account association\n• Deletes recovery history and logs\n• Does not modify Microsoft account', inline: false },
        { name: 'Account Details', value: `Username: ${account.minecraft_username || 'Unknown'}\nUUID: ${account.minecraft_uuid || 'Not linked'}\nOwner: <@${account.discord_user_id}>`, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      components: [confirmRow],
      ephemeral: true
    });
  },

  /**
   * Handle Change Owner button (with confirmation)
   */
  async handleChangeOwner(interaction, account, client) {
    const embed = new EmbedBuilder()
      .setColor('#ff9900')
      .setTitle('👤 Change Account Owner')
      .setDescription(`Transfer ownership of "${account.minecraft_username || 'Unknown'}" to another Discord user.`)
      .addFields(
        { name: 'Current Owner', value: `<@${account.discord_user_id}>`, inline: true },
        { name: 'Account', value: account.minecraft_username || 'Unknown', inline: true },
        { name: 'Instructions', value: 'To transfer ownership, the new owner must use `/link-account` command to link this account.', inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  },

  /**
   * Handle confirmation button interactions
   */
  async handleConfirmationInteraction(interaction, client) {
    const customId = interaction.customId;
    
    if (!customId.startsWith('confirm_') && !customId.startsWith('cancel_')) {
      return false;
    }

    const [action, entity, accountId] = customId.split('_');
    const account = TokenDatabase.getMinecraftAccount(parseInt(accountId));

    if (!account) {
      await interaction.update({
        content: 'Account not found. It may have been deleted.',
        components: []
      });
      return true;
    }

    if (action === 'cancel') {
      await interaction.update({
        content: 'Action cancelled.',
        components: []
      });
      return true;
    }

    // Handle confirmations
    switch (entity) {
      case 'unlink':
        await this.confirmUnlink(interaction, account, client);
        break;
      case 'delete':
        await this.confirmDelete(interaction, account, client);
        break;
    }

    return true;
  },

  /**
   * Confirm unlink action
   */
  async confirmUnlink(interaction, account, client) {
    TokenDatabase.unlinkMinecraftAccount(account.id);
    TokenDatabase.logRecoveryAction(account.discord_user_id, account.server_id, account.id, 'account_unlinked', 'Account unlinked from dashboard');

    await interaction.update({
      content: '✅ Account successfully unlinked. The Discord-to-account association has been removed.',
      components: []
    });

    // Update dashboard
    await this.createOrUpdateDashboard(client, account.server_id, interaction.channelId);

    console.log(`Account ${account.id} unlinked by user ${interaction.user.id}`);
  },

  /**
   * Confirm delete action
   */
  async confirmDelete(interaction, account, client) {
    TokenDatabase.deleteMinecraftAccount(account.id);
    TokenDatabase.logRecoveryAction(account.discord_user_id, account.server_id, account.id, 'account_deleted', 'Account information permanently deleted');

    await interaction.update({
      content: '🗑️ Account information permanently deleted. All stored data has been removed.',
      components: []
    });

    // Update dashboard
    await this.createOrUpdateDashboard(client, account.server_id, interaction.channelId);

    console.log(`Account ${account.id} deleted by user ${interaction.user.id}`);
  }
};

module.exports = DashboardManager;
