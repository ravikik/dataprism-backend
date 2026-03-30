# OAuth 2.0 Setup Guide for DataPrism

This guide explains how to configure OAuth 2.0 authentication with Databricks for secure, user-based access control.

## Why OAuth?

OAuth 2.0 provides several advantages over Personal Access Tokens (PAT):

✅ **User-Based Access Control** - Each user authenticates with their own Databricks account
✅ **Automatic Permission Enforcement** - Users can only access data they have permissions for in Unity Catalog
✅ **Audit Trail** - All queries are logged under the actual user's identity
✅ **Token Management** - Automatic refresh of expired tokens
✅ **No Shared Credentials** - No need to share or store PATs
✅ **Session-Based** - Secure server-side session storage

## Prerequisites

- Databricks workspace (AWS, Azure, or GCP)
- Workspace admin access to create OAuth applications
- Node.js 18+ installed

## Step 1: Create OAuth App in Databricks

### 1.1 Navigate to OAuth Settings

1. Log in to your Databricks workspace
2. Click on your username in the top right
3. Select **Settings** > **Workspace Settings**
4. Go to **OAuth** > **App Integrations**
5. Click **Create**

### 1.2 Configure OAuth Application

Fill in the following details:

- **Name**: `DataPrism AI`
- **Redirect URLs**: 
  - Development: `http://localhost:5173/auth/callback`
  - Production: `https://your-domain.com/auth/callback`
- **Scopes**: Select **all-apis** (grants access to all APIs the user has permissions for)

### 1.3 Save Credentials

After creating the app, you'll receive:
- **Client ID**: A UUID-like identifier
- **Client Secret**: A secret key (save this securely - it's only shown once)

## Step 2: Configure Backend

### 2.1 Update Environment Variables

Create or update `.env` in the backend directory:

```bash
# Databricks OAuth 2.0
DATABRICKS_OAUTH_CLIENT_ID=your-client-id-here
DATABRICKS_OAUTH_CLIENT_SECRET=your-client-secret-here
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_OAUTH_REDIRECT_URI=http://localhost:5173/auth/callback

# Session Security
SESSION_SECRET=generate-a-strong-random-secret-here

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Claude AI (Optional)
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 2.2 Generate Session Secret

For production, generate a strong random secret:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 32
```

### 2.3 Install Dependencies

```bash
cd DataPrism-Backend
npm install
```

## Step 3: Configure Frontend

### 3.1 Update Frontend URL (if different)

If your frontend runs on a different port or domain, update `FRONTEND_URL` in `.env`:

```bash
FRONTEND_URL=http://localhost:5173
```

### 3.2 Install Dependencies

```bash
cd DataPrism-UI
npm install
```

## Step 4: Start the Application

### 4.1 Start Backend

```bash
cd DataPrism-Backend
npm run dev
```

You should see:
```
[DataPrism] Server running on http://localhost:3001
[DataPrism] OAuth: Enabled
```

### 4.2 Start Frontend

```bash
cd DataPrism-UI
npm run dev
```

Visit: `http://localhost:5173`

## Step 5: Test OAuth Login

### 5.1 Initiate Login

1. Open DataPrism in your browser
2. Navigate to **Chat** page
3. Click the **Settings** icon (gear)
4. Click **Sign in with Databricks**

### 5.2 Complete Authentication

1. You'll be redirected to Databricks login
2. Enter your Databricks credentials
3. Grant permissions to DataPrism
4. You'll be redirected back to DataPrism
5. Settings will show your authenticated user

### 5.3 Verify Access

- Ask a question that queries your data
- Check that responses use data you have access to
- Verify governance features show your permissions

## Production Deployment

### SSL/HTTPS Configuration

For production, ensure:

1. Use HTTPS for both frontend and backend
2. Update redirect URI to use HTTPS:
   ```bash
   DATABRICKS_OAUTH_REDIRECT_URI=https://your-domain.com/auth/callback
   ```
3. Set secure session cookies:
   ```bash
   NODE_ENV=production
   ```

### Session Store

For production with multiple servers, use a persistent session store:

```bash
npm install connect-redis redis
```

Then update `server/index.ts` to use Redis for sessions.

### Environment Variables

Use environment variable management:
- **AWS**: AWS Secrets Manager or Parameter Store
- **Azure**: Azure Key Vault
- **GCP**: Secret Manager
- **Docker**: Docker secrets or Kubernetes secrets

## Troubleshooting

### "OAuth not configured" Error

**Cause**: Missing environment variables

**Solution**: 
1. Check `.env` file has all required OAuth variables
2. Restart the backend server
3. Verify variables are loaded: `console.log(process.env.DATABRICKS_OAUTH_CLIENT_ID)`

### "Invalid state parameter" Error

**Cause**: CSRF protection failure or session issue

**Solution**:
1. Ensure cookies are enabled in browser
2. Check CORS configuration includes `credentials: true`
3. Verify frontend and backend URLs match `.env` configuration

### "Token refresh failed" Error

**Cause**: Expired refresh token or invalid client credentials

**Solution**:
1. Log out and log in again
2. Verify client secret is correct
3. Check OAuth app is still active in Databricks

### Redirect URI Mismatch

**Cause**: Redirect URI in `.env` doesn't match OAuth app configuration

**Solution**:
1. Go to Databricks workspace settings > OAuth
2. Ensure redirect URI exactly matches (including protocol and trailing slash)
3. Update either the app or `.env` file to match

## Security Best Practices

1. **Never commit secrets** - Add `.env` to `.gitignore`
2. **Use HTTPS in production** - Protect tokens in transit
3. **Rotate secrets regularly** - Update client secret periodically
4. **Implement rate limiting** - Protect against brute force attacks
5. **Monitor sessions** - Log authentication events
6. **Set session timeouts** - Balance security and usability
7. **Use strong session secrets** - 32+ random bytes

## Legacy PAT Fallback

If OAuth is not configured, DataPrism falls back to Personal Access Token mode:

- Users can manually enter PAT in Settings
- Tokens stored in browser localStorage
- No automatic refresh or session management
- Less secure but works without OAuth setup

## Need Help?

- **Databricks OAuth Docs**: https://docs.databricks.com/dev-tools/auth/oauth-user.html
- **DataPrism Issues**: GitHub Issues
- **Security Concerns**: Email security team

## Next Steps

- Configure Unity Catalog permissions for users
- Set up governance tags for data classification
- Enable data quality monitoring
- Review audit logs for compliance
