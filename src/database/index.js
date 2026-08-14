const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure data directory exists
const dataDir = path.dirname(config.database.path);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Simple JSON-based database
const databasePath = config.database.path;

// Default data structure
const defaultData = {
  server_config: {},
  trusted_roles: [],
  trusted_users: [],
  pre_authorized_recovery: {},
  minecraft_accounts: [],
  recovery_sessions: {},
  recovery_log: []
};

// Load database from file
let dbData = { ...defaultData };

function loadDatabase() {
  try {
    if (fs.existsSync(databasePath)) {
      const fileContent = fs.readFileSync(databasePath, 'utf8');
      dbData = JSON.parse(fileContent);
    } else {
      dbData = { ...defaultData };
      saveDatabase();
    }
  } catch (error) {
    console.error('Error loading database:', error);
    dbData = { ...defaultData };
    saveDatabase();
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(databasePath, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Initialize database
loadDatabase();

// Helper function to create a secure hash of Microsoft account identifier
function createAccountHash(accountIdentifier) {
  return crypto.createHash('sha256').update(accountIdentifier).digest('hex');
}

const TokenDatabase = {
  // Server Configuration Management
  setServerConfig: (serverId, config) => {
    dbData.server_config[serverId] = config;
    saveDatabase();
  },

  getServerConfig: (serverId) => {
    return dbData.server_config[serverId];
  },

  deleteServerConfig: (serverId) => {
    delete dbData.server_config[serverId];
    saveDatabase();
  },

  // Trusted Role Management
  addTrustedRole: (serverId, roleId, addedBy) => {
    const existing = dbData.trusted_roles.find(r => r.server_id === serverId && r.role_id === roleId);
    if (!existing) {
      dbData.trusted_roles.push({
        server_id: serverId,
        role_id: roleId,
        added_by: addedBy,
        added_at: Math.floor(Date.now() / 1000)
      });
      saveDatabase();
    }
  },

  removeTrustedRole: (serverId, roleId) => {
    dbData.trusted_roles = dbData.trusted_roles.filter(r => !(r.server_id === serverId && r.role_id === roleId));
    saveDatabase();
  },

  getTrustedRoles: (serverId) => {
    return dbData.trusted_roles.filter(r => r.server_id === serverId);
  },

  isTrustedRole: (serverId, roleId) => {
    return dbData.trusted_roles.find(r => r.server_id === serverId && r.role_id === roleId);
  },

  // Trusted User Management
  addTrustedUser: (serverId, userId, addedBy) => {
    const existing = dbData.trusted_users.find(u => u.server_id === serverId && u.user_id === userId);
    if (!existing) {
      dbData.trusted_users.push({
        server_id: serverId,
        user_id: userId,
        added_by: addedBy,
        added_at: Math.floor(Date.now() / 1000)
      });
      saveDatabase();
    }
  },

  removeTrustedUser: (serverId, userId) => {
    dbData.trusted_users = dbData.trusted_users.filter(u => !(u.server_id === serverId && u.user_id === userId));
    saveDatabase();
  },

  getTrustedUsers: (serverId) => {
    return dbData.trusted_users.filter(u => u.server_id === serverId);
  },

  isTrustedUser: (serverId, userId) => {
    return dbData.trusted_users.find(u => u.server_id === serverId && u.user_id === userId);
  },

  // Check if user is trusted (by role or individual)
  isUserTrusted: (serverId, userId, memberRoles) => {
    // Check if user is individually trusted
    const trustedUser = TokenDatabase.isTrustedUser(serverId, userId);
    if (trustedUser) return true;

    // Check if user has any trusted role
    for (const roleId of memberRoles) {
      const trustedRole = TokenDatabase.isTrustedRole(serverId, roleId);
      if (trustedRole) return true;
    }

    return false;
  },

  // Pre-authorized Recovery Management
  createPreAuthorizedRecovery: (discordUserId, microsoftAccountHash, notes) => {
    const now = Math.floor(Date.now() / 1000);
    dbData.pre_authorized_recovery[discordUserId] = {
      microsoft_account_hash: microsoftAccountHash,
      setup_completed_at: now,
      last_verified_at: now,
      setup_notes: notes,
      created_at: now,
      updated_at: now
    };
    saveDatabase();
  },

  getPreAuthorizedRecovery: (discordUserId) => {
    return dbData.pre_authorized_recovery[discordUserId];
  },

  updateLastVerified: (discordUserId) => {
    const recovery = dbData.pre_authorized_recovery[discordUserId];
    if (recovery) {
      recovery.last_verified_at = Math.floor(Date.now() / 1000);
      recovery.updated_at = Math.floor(Date.now() / 1000);
      saveDatabase();
    }
  },

  deletePreAuthorizedRecovery: (discordUserId) => {
    delete dbData.pre_authorized_recovery[discordUserId];
    saveDatabase();
  },

  // Minecraft Account Management
  createMinecraftAccount: (discordUserId, serverId, microsoftAccountHash, minecraftUsername, minecraftUuid) => {
    const now = Math.floor(Date.now() / 1000);
    
    // Check if account already exists
    const existing = dbData.minecraft_accounts.find(a => a.discord_user_id === discordUserId && a.microsoft_account_hash === microsoftAccountHash);
    
    if (!existing) {
      dbData.minecraft_accounts.push({
        id: Date.now(), // Simple ID generation
        discord_user_id: discordUserId,
        server_id: serverId,
        minecraft_username: minecraftUsername,
        minecraft_uuid: minecraftUuid,
        microsoft_account_hash: microsoftAccountHash,
        link_status: 'linked',
        recovery_status: 'none',
        linked_at: now,
        last_recovery_attempt: null,
        last_recovery_initiator: null,
        notes: null,
        created_at: now,
        updated_at: now
      });
      saveDatabase();
    }
    
    return existing || dbData.minecraft_accounts[dbData.minecraft_accounts.length - 1];
  },

  getMinecraftAccount: (accountId) => {
    return dbData.minecraft_accounts.find(a => a.id === accountId);
  },

  getMinecraftAccountsByUser: (discordUserId) => {
    return dbData.minecraft_accounts.filter(a => a.discord_user_id === discordUserId).sort((a, b) => b.created_at - a.created_at);
  },

  getMinecraftAccountsByServer: (serverId) => {
    return dbData.minecraft_accounts.filter(a => a.server_id === serverId).sort((a, b) => b.created_at - a.created_at);
  },

  updateMinecraftAccount: (accountId, updates) => {
    const accountIndex = dbData.minecraft_accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex !== -1) {
      dbData.minecraft_accounts[accountIndex] = { ...dbData.minecraft_accounts[accountIndex], ...updates, updated_at: Math.floor(Date.now() / 1000) };
      saveDatabase();
    }
  },

  updateMinecraftAccountOwner: (accountId, newDiscordUserId) => {
    const accountIndex = dbData.minecraft_accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex !== -1) {
      dbData.minecraft_accounts[accountIndex].discord_user_id = newDiscordUserId;
      dbData.minecraft_accounts[accountIndex].updated_at = Math.floor(Date.now() / 1000);
      saveDatabase();
    }
  },

  deleteMinecraftAccount: (accountId) => {
    dbData.minecraft_accounts = dbData.minecraft_accounts.filter(a => a.id !== accountId);
    saveDatabase();
  },

  unlinkMinecraftAccount: (accountId) => {
    const accountIndex = dbData.minecraft_accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex !== -1) {
      dbData.minecraft_accounts[accountIndex].link_status = 'unlinked';
      dbData.minecraft_accounts[accountIndex].minecraft_username = null;
      dbData.minecraft_accounts[accountIndex].minecraft_uuid = null;
      dbData.minecraft_accounts[accountIndex].updated_at = Math.floor(Date.now() / 1000);
      saveDatabase();
    }
  },

  updateRecoveryStatus: (accountId, status, initiatorId) => {
    const accountIndex = dbData.minecraft_accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex !== -1) {
      dbData.minecraft_accounts[accountIndex].recovery_status = status;
      dbData.minecraft_accounts[accountIndex].last_recovery_attempt = Math.floor(Date.now() / 1000);
      dbData.minecraft_accounts[accountIndex].last_recovery_initiator = initiatorId;
      dbData.minecraft_accounts[accountIndex].updated_at = Math.floor(Date.now() / 1000);
      saveDatabase();
    }
  },

  // Recovery Session Management
  createRecoverySession: (discordUserId, serverId, minecraftAccountId, initiatorId) => {
    const now = Math.floor(Date.now() / 1000);
    dbData.recovery_sessions[discordUserId] = {
      server_id: serverId,
      minecraft_account_id: minecraftAccountId,
      recovery_initiator: initiatorId,
      recovery_status: 'in_progress',
      recovery_started_at: now,
      recovery_completed_at: null,
      sessions_revoked_at: null,
      notes: null,
      created_at: now,
      updated_at: now
    };
    saveDatabase();
  },

  getRecoverySession: (discordUserId) => {
    return dbData.recovery_sessions[discordUserId];
  },

  updateRecoveryStatus: (discordUserId, status) => {
    const session = dbData.recovery_sessions[discordUserId];
    if (session) {
      session.recovery_status = status;
      session.updated_at = Math.floor(Date.now() / 1000);
      saveDatabase();
    }
  },

  setRecoveryCompletionTime: (discordUserId) => {
    const session = dbData.recovery_sessions[discordUserId];
    if (session) {
      session.recovery_completed_at = Math.floor(Date.now() / 1000);
      session.recovery_status = 'completed';
      session.updated_at = Math.floor(Date.now() / 1000);
      saveDatabase();
    }
  },

  setSessionsRevokedTime: (discordUserId) => {
    const session = dbData.recovery_sessions[discordUserId];
    if (session) {
      session.sessions_revoked_at = Math.floor(Date.now() / 1000);
      session.updated_at = Math.floor(Date.now() / 1000);
      saveDatabase();
    }
  },

  deleteRecoverySession: (discordUserId) => {
    delete dbData.recovery_sessions[discordUserId];
    saveDatabase();
  },

  // Recovery Logging
  logRecoveryAction: (discordUserId, serverId, minecraftAccountId, action, details) => {
    dbData.recovery_log.push({
      id: Date.now(),
      discord_user_id: discordUserId,
      server_id: serverId,
      minecraft_account_id: minecraftAccountId,
      action: action,
      details: details,
      created_at: Math.floor(Date.now() / 1000)
    });
    saveDatabase();
  },

  getRecoveryLog: (discordUserId, limit = 50) => {
    const logs = dbData.recovery_log.filter(l => l.discord_user_id === discordUserId);
    return logs.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
  },

  getServerRecoveryLog: (serverId, limit = 100) => {
    const logs = dbData.recovery_log.filter(l => l.server_id === serverId);
    return logs.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
  },

  // Dashboard Management
  updateDashboardMessage: (serverId, messageId) => {
    const config = dbData.server_config[serverId] || {};
    config.dashboard_message_id = messageId;
    config.updated_at = Math.floor(Date.now() / 1000);
    dbData.server_config[serverId] = config;
    saveDatabase();
  },

  getDashboardMessage: (serverId) => {
    const config = dbData.server_config[serverId];
    return config ? config.dashboard_message_id : null;
  },

  // Export helper function
  createAccountHash
};

module.exports = TokenDatabase;
