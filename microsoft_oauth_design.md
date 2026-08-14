# Microsoft OAuth Application Design

## Overview
This design implements a secure Microsoft OAuth 2.0 authorization flow that allows users to authorize a Microsoft application, grants Discord roles upon successful authorization, and provides API access for legitimate account management operations.

## Architecture Components

### 1. Microsoft Azure AD Application Configuration

#### App Registration in Azure Portal
- **Application Type**: Web Application / API
- **Redirect URIs**: 
  - Production: `https://yourdomain.com/auth/callback`
  - Development: `http://localhost:3000/auth/callback`
- **Supported Account Types**: 
  - "Accounts in any organizational directory and personal Microsoft accounts"
  - This allows both personal Microsoft accounts and work/school accounts

#### Required Microsoft Graph API Permissions
**Maximum Legitimate Permissions** (user consent required):

**Basic Profile & Identity:**
- `User.Read` - Read user's basic profile (always include)
- `User.ReadWrite` - Read and write user profile information (limited fields)

**Email & Communication:**
- `Mail.Read` - Read mail in signed-in user's mailbox
- `Mail.ReadWrite` - Modify mail in signed-in user's mailbox

**Authentication Methods (Recovery):**
- `UserAuthenticationMethod.Read` - Read authentication methods
- `UserAuthenticationMethod.ReadWrite.All` - Read and write authentication methods (requires admin consent)

**Important Permission Policy:**
- Only request permissions that are actually needed for the application's functionality
- Let Microsoft's official consent page handle all permission explanations
- Do not claim or imply permissions that the application doesn't have
- User must explicitly approve each permission on Microsoft's official page
- Use the maximum legitimate permissions available for the account type while respecting Microsoft's security restrictions

**Account Type Considerations:**
- **Personal Microsoft Accounts**: Limited API capabilities, fewer recovery options
- **Organizational (Azure AD) Accounts**: More API capabilities, but subject to organizational policies
- **System should detect account type and adjust available permissions accordingly**

**Important Limitations:**
- **Email Changes**: Microsoft Graph API does NOT allow changing a user's primary email address through standard API endpoints. Email changes typically require direct Azure AD admin access and are often blocked by organizational policies.
- **Password Changes**: Limited password reset capabilities exist but require elevated permissions (`User.ChangePassword.All` - admin consent only) and are often restricted by organizational security policies.
- **Most account management operations require Azure AD administrator privileges** and cannot be performed through standard user-delegated OAuth permissions.

#### Important Security Notes
- Only request permissions that are actually needed for your use case
- User-facing applications should primarily use delegated permissions
- Application permissions require admin consent and are more sensitive
- Never request permissions that aren't used by your application

### 2. OAuth 2.0 Authorization Flow

#### Frontend Flow
```
1. User sees simple message: "To verify your account, you need to allow this application."
2. User clicks "Verify with Microsoft" button
3. Frontend redirects to Microsoft OAuth 2.0 endpoint:
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize?
   client_id={CLIENT_ID}
   &response_type=code
   &redirect_uri={REDIRECT_URI}
   &scope={SCOPES}
   &state={RANDOM_STATE}
   &response_mode=query

4. User signs in on Microsoft's official domain
5. Microsoft shows official consent screen with requested permissions
   - Microsoft handles all permission explanations and consent
   - Application does not claim permissions it doesn't have
   - User explicitly approves permissions on Microsoft's official page
6. User chooses "Accept" or "Deny"

7. If Accept: Microsoft redirects with authorization code
   {REDIRECT_URI}?code={AUTH_CODE}&state={STATE}

8. If Deny: Microsoft redirects with error
   {REDIRECT_URI}?error={ERROR}&error_description={DESCRIPTION}
   - User returned to original page without verification
```

#### Backend Token Exchange
```
1. Backend receives authorization code
2. Backend exchanges code for tokens:
   POST https://login.microsoftonline.com/common/oauth2/v2.0/token
   Content-Type: application/x-www-form-urlencoded

   client_id={CLIENT_ID}
   &client_secret={CLIENT_SECRET}
   &code={AUTH_CODE}
   &redirect_uri={REDIRECT_URI}
   &grant_type=authorization_code

3. Microsoft returns:
   - access_token (short-lived, ~1 hour)
   - refresh_token (long-lived, ~90 days)
   - expires_in
   - token_type
   - scope

4. Backend stores tokens securely (encrypted)
5. Backend triggers Discord role assignment
```

#### Token Refresh Flow
```
1. When access token expires (401 from Microsoft Graph API)
2. Backend uses refresh token to get new access token:
   POST https://login.microsoftonline.com/common/oauth2/v2.0/token
   Content-Type: application/x-www-form-urlencoded

   client_id={CLIENT_ID}
   &client_secret={CLIENT_SECRET}
   &refresh_token={REFRESH_TOKEN}
   &grant_type=refresh_token

3. Update stored tokens with new values
```

### 3. Backend API Design

#### Technology Stack Recommendation
- **Runtime**: Node.js with Express or Python with FastAPI
- **Database**: PostgreSQL for relational data + Redis for caching
- **Authentication**: JWT for admin sessions
- **Encryption**: AES-256 for token storage

#### API Endpoints

##### OAuth Endpoints
```
GET  /auth/microsoft/login          - Initiate OAuth flow
GET  /auth/microsoft/callback       - OAuth callback handler
POST /auth/microsoft/refresh        - Refresh access token
POST /auth/microsoft/revoke         - Revoke authorization
```

##### Admin Endpoints
```
GET    /api/admin/users             - List all authorized users
GET    /api/admin/users/:id         - Get specific user details
POST   /api/admin/users/:id/email   - Update user email (if permitted)
POST   /api/admin/users/:id/password - Reset user password (if permitted)
DELETE /api/admin/users/:id         - Revoke user authorization
GET    /api/admin/audit             - Audit log of actions
```

##### Microsoft Graph API Proxy Endpoints
```
GET    /api/microsoft/user/:id/profile    - Get user profile
PUT    /api/microsoft/user/:id/profile    - Update user profile
POST   /api/microsoft/user/:id/password   - Change user password
GET    /api/microsoft/user/:id/email      - Get user email
PUT    /api/microsoft/user/:id/email      - Update user email
```

### 4. Database Schema

#### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    microsoft_id VARCHAR(255) UNIQUE NOT NULL,
    discord_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    display_name VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_token_refresh TIMESTAMP
);
```

#### OAuth Tokens Table (Encrypted)
```sql
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP NOT NULL,
    scope TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Audit Log Table
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    admin_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Discord Sync Table
```sql
CREATE TABLE discord_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    discord_id VARCHAR(255) UNIQUE NOT NULL,
    guild_id VARCHAR(255) NOT NULL,
    role_assigned BOOLEAN DEFAULT FALSE,
    last_sync TIMESTAMP,
    sync_status VARCHAR(50) DEFAULT 'pending'
);
```

### 5. Administrator Interface

#### Frontend Design
- **Tech Stack**: React.js or Next.js with TypeScript
- **Authentication**: Admin login with JWT
- **UI Framework**: Material-UI or Tailwind CSS

#### Admin Dashboard Features

##### User Management Page
- List all authorized users with:
  - Microsoft account email/display name
  - Discord ID
  - Verification status
  - Last sync time
  - Authorization status
- Search and filter users
- View user details modal
- Actions per user:
  - View Microsoft profile data
  - Update email (if permitted by API)
  - Reset password (if permitted by API)
  - Revoke authorization
  - View audit history

##### Account Management Actions
**Important Reality Check:**
Microsoft Graph API has significant limitations for remote account management:

**What You CAN Do:**
- Read user profile information (name, display name, etc.)
- Read and send emails on behalf of the user
- Manage calendar events
- Access OneDrive files
- Manage some profile settings

**What You CANNOT Do (through standard OAuth):**
- Change the user's primary email address
- Change the user's password (extremely limited, requires admin consent)
- Delete the Microsoft account
- Change security settings
- Manage account recovery options

**Reality:**
Most account-level changes (email, password, security settings) require:
1. Azure AD administrator privileges
2. Direct Azure AD portal access
3. PowerShell with admin credentials
4. Are often blocked by organizational security policies

The admin interface should only expose actions that are:
1. **Actually permitted by Microsoft Graph API** (very limited for account changes)
2. **Explicitly consented to by the user** during OAuth flow
3. **Compliant with Microsoft's terms of service**

##### Example Implementation
```typescript
// Only show password reset if User.ChangePassword permission is granted
if (hasPermission('User.ChangePassword')) {
  renderPasswordResetButton();
}

// Only show email update if User.ReadWrite permission is granted
if (hasPermission('User.ReadWrite')) {
  renderEmailUpdateForm();
}
```

#### Security Measures
- Admin authentication with MFA
- Role-based access control (RBAC)
- IP whitelisting for admin access
- Audit logging for all admin actions
- Rate limiting on sensitive operations
- Confirmation dialogs for destructive actions

### 6. Discord Bot Integration

#### Bot Configuration
- **Discord Bot Token**: Stored securely in environment variables
- **Guild ID**: The Discord server where roles are assigned
- **Verified Role ID**: The role to assign upon successful OAuth
- **Bot Permissions**: `MANAGE_ROLES` permission required

#### Bot Implementation
```javascript
// Discord.js bot example
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Assign verified role after successful OAuth
async function assignVerifiedRole(discordUserId) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(discordUserId);
    const verifiedRole = await guild.roles.fetch(process.env.VERIFIED_ROLE_ID);
    
    await member.roles.add(verifiedRole);
    console.log(`Assigned verified role to user ${discordUserId}`);
    
    // Update database
    await updateDiscordSyncStatus(discordUserId, true);
  } catch (error) {
    console.error('Error assigning role:', error);
    throw error;
  }
}

// Remove verified role if authorization revoked
async function removeVerifiedRole(discordUserId) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(discordUserId);
    const verifiedRole = await guild.roles.fetch(process.env.VERIFIED_ROLE_ID);
    
    await member.roles.remove(verifiedRole);
    console.log(`Removed verified role from user ${discordUserId}`);
    
    // Update database
    await updateDiscordSyncStatus(discordUserId, false);
  } catch (error) {
    console.error('Error removing role:', error);
    throw error;
  }
}
```

#### OAuth Callback Integration
```javascript
// In the OAuth callback handler
app.get('/auth/microsoft/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      // User denied authorization
      return res.redirect('/?auth=denied');
    }
    
    // Validate state to prevent CSRF
    if (!validateState(state)) {
      return res.status(400).send('Invalid state parameter');
    }
    
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    
    // Get user info from Microsoft Graph
    const userInfo = await getMicrosoftUserInfo(tokens.access_token);
    
    // Get Discord ID from session or cookie
    const discordId = getDiscordIdFromSession(req);
    
    // Store user and tokens in database
    const userId = await storeUserAndTokens(userInfo, discordId, tokens);
    
    // Assign Discord role
    await assignVerifiedRole(discordId);
    
    // Redirect to success page
    res.redirect('/?auth=success');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/?auth=error');
  }
});
```

### 7. Security Best Practices

#### Token Storage
- Encrypt access tokens and refresh tokens using AES-256
- Store encryption keys in environment variables or secret management
- Never log tokens or include them in error messages
- Implement token rotation on refresh

#### State Management
- Generate cryptographically secure random state parameter
- Store state in session with expiration
- Validate state on callback to prevent CSRF attacks

#### Error Handling
- Never expose detailed errors to users
- Log errors securely on the backend
- Implement rate limiting on OAuth endpoints
- Monitor for suspicious authorization patterns

#### Data Protection
- Implement data retention policies
- Provide user ability to revoke authorization
- Comply with GDPR and other privacy regulations
- Regular security audits

### 8. Pre-Authorized Recovery System

#### Recovery System Architecture
The recovery system allows users to pre-configure recovery mechanisms while they have account access, then trigger automated recovery through Discord if access is lost. The goal is to provide maximum legitimate recovery automation while working within Microsoft's API capabilities.

#### Pre-Authorization Phase (User Has Access)
**User Setup Flow:**
1. User authorizes the application via OAuth (as designed above)
2. User accesses "Recovery Settings" in the application
3. User configures recovery methods they want to enable:
   - Recovery email address
   - Recovery phone number
   - Alternative authentication method
   - Recovery questions/answers (encrypted)
4. User explicitly authorizes each recovery method
5. System stores recovery information encrypted in database
6. User understands technical limitations of Microsoft's API capabilities

**Available Microsoft Graph API Recovery Permissions:**
- `User.ReadWrite` - Update profile information
- `User.ManageIdentities.All` - Manage authentication methods (admin consent required)
- `UserAuthenticationMethod.ReadWrite.All` - Read and write authentication methods (admin consent)

**Recovery Methods That Can Be Pre-Authorized:**
1. **Recovery Email**: Set alternative recovery email via Microsoft Graph API
2. **Recovery Phone**: Set recovery phone number via Microsoft Graph API  
3. **Password Reset**: Initiate password reset through Microsoft's official reset flow
4. **Security Info**: Manage security questions and backup codes (limited API support)

#### Recovery Information Storage (Encrypted)
```sql
CREATE TABLE recovery_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recovery_email_encrypted TEXT,
    recovery_phone_encrypted TEXT,
    recovery_method VARCHAR(50) NOT NULL, -- 'email', 'phone', 'both'
    is_enabled BOOLEAN DEFAULT FALSE,
    last_verified TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recovery_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    discord_id VARCHAR(255) NOT NULL,
    trigger_method VARCHAR(50) NOT NULL, -- 'discord_command', 'webhook'
    trigger_code VARCHAR(255) UNIQUE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recovery_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    recovery_trigger_id UUID REFERENCES recovery_triggers(id),
    action VARCHAR(100) NOT NULL,
    success BOOLEAN,
    error_message TEXT,
    microsoft_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Discord Bot Recovery Trigger
**Recovery Command Flow:**
```javascript
// Discord bot command
client.on('messageCreate', async (message) => {
  if (message.content.startsWith('!recover')) {
    const discordId = message.author.id;
    
    // Verify user has pre-authorized recovery
    const user = await getUserByDiscordId(discordId);
    if (!user || !user.recovery_enabled) {
      return message.reply('No recovery system configured for your account.');
    }
    
    // Generate one-time recovery code
    const recoveryCode = generateSecureCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    
    await storeRecoveryTrigger(user.id, discordId, recoveryCode, expiresAt);
    
    // Send recovery code via DM
    await message.author.send({
      content: `Recovery initiated. Use this code within 15 minutes: ${recoveryCode}\n` +
               `Reply with: !confirm ${recoveryCode} to execute recovery.`
    });
  }
  
  if (message.content.startsWith('!confirm')) {
    const code = message.content.split(' ')[1];
    const discordId = message.author.id;
    
    // Validate recovery code
    const trigger = await validateRecoveryTrigger(code, discordId);
    if (!trigger) {
      return message.reply('Invalid or expired recovery code.');
    }
    
    // Execute pre-authorized recovery
    const result = await executeRecovery(trigger.user_id);
    
    // Send embedded status message
    await sendRecoveryStatusEmbed(message.author, result);
  }
});

// Recovery Status Embed
async function sendRecoveryStatusEmbed(user, recoveryResult) {
  const userInfo = await getUserInfo(recoveryResult.userId);
  const recoverySettings = await getRecoverySettings(recoveryResult.userId);
  
  const embed = {
    title: 'Account Recovery Status',
    color: recoveryResult.success ? 0x00FF00 : 0xFF0000,
    fields: [
      {
        name: 'Account Status',
        value: recoveryResult.success ? '✅ Recovery Successful' : '❌ Recovery Failed',
        inline: true
      },
      {
        name: 'Recovery Method',
        value: recoveryResult.method || 'Unknown',
        inline: true
      },
      {
        name: 'Recovery Time',
        value: new Date().toISOString(),
        inline: true
      }
    ],
    timestamp: new Date()
  };
  
  // Only include email if Microsoft allows retrieval and user consented
  if (recoveryResult.success && userInfo.email && hasPermission('User.Read')) {
    embed.fields.push({
      name: 'Current Email',
      value: userInfo.email,
      inline: false
    });
  }
  
  // Password handling - Technical limitation: Cannot retrieve new password from Microsoft
  if (recoveryResult.passwordReset) {
    embed.fields.push({
      name: 'Password Reset Status',
      value: '✅ Password reset initiated. Check your recovery email for Microsoft\'s official reset link to complete the process and set your new password.',
      inline: false
    });
  }
  
  // Add error details if recovery failed
  if (!recoveryResult.success) {
    embed.fields.push({
      name: 'Error Details',
      value: recoveryResult.error || 'Unknown error occurred',
      inline: false
    });
  }
  
  await user.send({ embeds: [embed] });
}
```

#### Automated Recovery Execution
**Recovery Process:**
```javascript
async function executeRecovery(userId) {
  try {
    // Get user's recovery settings
    const recoverySettings = await getRecoverySettings(userId);
    const tokens = await getUserTokens(userId);
    
    // Get fresh access token if needed
    const accessToken = await getValidAccessToken(tokens);
    
    // Execute pre-authorized recovery method
    let recoveryResult;
    
    switch (recoverySettings.method) {
      case 'email':
        recoveryResult = await executeEmailRecovery(accessToken, recoverySettings);
        break;
      case 'phone':
        recoveryResult = await executePhoneRecovery(accessToken, recoverySettings);
        break;
      case 'both':
        recoveryResult = await executeMultiFactorRecovery(accessToken, recoverySettings);
        break;
    }
    
    // Log recovery attempt
    await logRecoveryAttempt(userId, recoveryResult);
    
    // Mark trigger as used
    await markRecoveryTriggerUsed(triggerId);
    
    return recoveryResult;
  } catch (error) {
    console.error('Recovery execution error:', error);
    return { success: false, error: error.message };
  }
}

async function executeEmailRecovery(accessToken, recoverySettings) {
  // Use Microsoft Graph API to initiate password reset to recovery email
  // Technical limitation: Can only initiate reset, cannot directly set and retrieve new password
  const response = await fetch('https://graph.microsoft.com/v1.0/users/~/authentication/passwordMethods', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      '@odata.type': '#microsoft.graph.passwordAuthenticationMethod',
      'recoveryEmail': decrypt(recoverySettings.recovery_email_encrypted)
    })
  });
  
  if (response.ok) {
    return { 
      success: true, 
      method: 'email',
      passwordReset: true,
      message: 'Password reset initiated to recovery email via Microsoft\'s official flow'
    };
  } else {
    return { success: false, error: 'Microsoft API rejected recovery request' };
  }
}
```

#### Password Handling and Technical Limitations
**Original Goal vs Technical Reality:**

**Original Recovery System Goal:**
- Pre-authorized recovery system for user's own Microsoft account
- Triggered through Discord bot when user loses access
- Automatically change password remotely to regain account control
- Send new password to user through Discord for immediate access

**Technical Limitations of Microsoft Graph API:**
- Microsoft Graph API does NOT provide endpoints to directly set and retrieve new passwords
- Password reset operations only send reset links to recovery email/phone; they don't return the new password
- Microsoft's security model deliberately prevents applications from retrieving or setting passwords directly
- Any password change requires user interaction through Microsoft's official recovery flow

**What the System CAN Achieve (Technically Possible):**
- Pre-authorized recovery enrollment while user has account access
- Discord bot trigger for recovery initiation
- Automated password reset initiation through Microsoft's official API
- Set recovery email/phone via Microsoft Graph API (with proper permissions)
- Manage authentication methods (with proper permissions)
- Initiate Microsoft's official password reset flow to pre-configured recovery email
- Discord status updates showing recovery progress and method used
- Guidance on completing the recovery through Microsoft's official process

**Technical Limitations (Documented):**
- Cannot directly set a new password and retrieve it via API
- Cannot send new password through Discord (Microsoft doesn't provide it)
- Password reset completion requires user interaction with Microsoft's official flow
- Cannot bypass Microsoft's security controls or authentication processes

**Implementation Approach:**
The system will implement the maximum legitimate recovery capabilities available through Microsoft's APIs while documenting the limitations. The Discord bot will:
1. Trigger the recovery process automatically
2. Initiate password reset through Microsoft's official flow
3. Send status updates and recovery method information
4. Guide the user to complete the recovery through Microsoft's official process
5. Provide as much automation as technically possible within Microsoft's API constraints

#### Microsoft Official Recovery Mechanisms
**What Microsoft Actually Allows:**

1. **Password Reset Flow**: Can initiate password reset through Microsoft's official reset process
   - API: `https://passwordreset.microsoftonline.com/`
   - Limited to organizational accounts in many cases

2. **Authentication Method Management**: 
   - API: Microsoft Graph Authentication Methods API
   - Can add/update recovery email and phone
   - Requires `UserAuthenticationMethod.ReadWrite.All` permission (admin consent)

3. **Security Info Management**:
   - API: Limited Microsoft Graph support
   - Can manage some security information via API
   - Often requires manual user interaction

**Limitations and Reality:**
- Many recovery operations still require some user interaction
- Microsoft may block automated recovery for security reasons
- Personal Microsoft accounts have different capabilities than organizational accounts
- Some operations may require additional verification

#### Recovery System Security Measures
1. **Pre-Authorization Only**: Recovery only works for users who explicitly configured it while having access
2. **One-Time Use**: Each recovery code can only be used once
3. **Time-Limited**: Recovery codes expire after 15 minutes
4. **Discord Verification**: Must authenticate via Discord to trigger recovery
5. **Audit Logging**: All recovery attempts are logged
6. **Rate Limiting**: Limit recovery attempts to prevent abuse
7. **Notification**: User is notified when recovery is triggered

#### Recovery System Limitations
**Important Reality Checks:**
- Microsoft may still require additional verification beyond pre-authorization
- Some recovery operations cannot be fully automated
- Personal Microsoft accounts have different recovery capabilities than organizational accounts
- Microsoft may change API capabilities at any time
- This system does not bypass Microsoft's security controls
- Recovery is not guaranteed - it depends on Microsoft's current policies and API capabilities

### 10. Environment Variables Required

```env
# Microsoft Azure AD
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=https://yourdomain.com/auth/callback
MICROSOFT_SCOPES=User.Read,User.ReadWrite,User.ChangePassword

# Database
DATABASE_URL=postgresql://user:password@localhost/dbname
REDIS_URL=redis://localhost:6379

# Discord
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_guild_id
DISCORD_VERIFIED_ROLE_ID=your_verified_role_id

# Application
APP_URL=https://yourdomain.com
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
```

### 11. Implementation Priority

1. **Phase 1**: Core OAuth flow and token storage
2. **Phase 2**: Discord bot integration and role assignment
3. **Phase 3**: Basic admin interface and user management
4. **Phase 4**: Recovery system pre-authorization interface
5. **Phase 5**: Discord bot recovery triggers and execution
6. **Phase 6**: Microsoft Graph API integration for recovery operations
7. **Phase 7**: Advanced admin features and audit logging

### 12. Important Compliance Notes

- **Microsoft Terms of Service**: Ensure all account management actions comply with Microsoft's ToS
- **User Consent**: Only perform actions that users explicitly consented to
- **Rate Limiting**: Respect Microsoft Graph API rate limits
- **Data Minimization**: Only collect and store data that's necessary
- **Transparency**: Clearly communicate to users what permissions are being requested

This design provides a secure, compliant implementation of Microsoft OAuth with proper authorization flow, Discord integration, and account management capabilities.