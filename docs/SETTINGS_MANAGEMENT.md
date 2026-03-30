# Settings Management

DataPrism AI now includes a comprehensive web-based settings management interface in the backend.

## Access the Settings UI

1. **Start the backend server:**
   ```bash
   cd DataPrism-Backend
   npm run dev
   ```

2. **Open the settings UI in your browser:**
   ```
   http://localhost:3001/admin/settings
   ```

## Features

The settings UI provides a centralized interface to configure all DataPrism components:

### 🤖 AI Configuration
- Anthropic Claude API key
- Enables AI-powered natural language processing

### 📊 Databricks
- Workspace URL
- Personal Access Token (PAT)
- SQL Warehouse ID
- Required for live data queries

### ☁️ AWS
- Access Key ID
- Secret Access Key
- Default Region
- Enables infrastructure queries

### 🔐 OAuth 2.0
- Databricks OAuth Client ID
- OAuth Client Secret
- Redirect URI
- Provides user-based authentication

### ⚡ Caching
- **Redis Cache**
  - Host, Port, Password
  - Fast exact-match caching
  
- **Vector Database**
  - PostgreSQL pgvector (recommended)
  - Pinecone (SaaS alternative)
  - Qdrant
  - Semantic similarity matching

### 🔧 Advanced
- Server Port
- Frontend URL
- Session Secret
- Reset all settings

## Security

### Development Mode
In development (`NODE_ENV=development`), the settings UI is accessible without authentication.

### Production Mode
In production (`NODE_ENV=production`), you **must** set an `ADMIN_TOKEN` environment variable:

```bash
# .env
ADMIN_TOKEN=your-secure-random-token-here
```

Access the UI with the token:
```
http://your-server/admin/settings?token=your-secure-random-token-here
```

Or include it in API requests:
```bash
curl -H "X-Admin-Token: your-secure-random-token-here" \
  http://your-server/api/settings
```

## Storage

Settings are stored in `.dataprism-settings.json` in the backend root directory. This file:
- Contains all configuration values
- Is NOT committed to git (in .gitignore)
- Can be backed up and restored
- Merges with environment variables (env vars take precedence)

## API Endpoints

### GET `/api/settings`
Get current settings (masked sensitive values)

### GET `/api/settings/status`
Get configuration status (what's configured, operational tier)

### PUT `/api/settings`
Update settings (full or partial)

```json
{
  "anthropicApiKey": "sk-ant-...",
  "databricks": {
    "host": "https://your-workspace.cloud.databricks.com",
    "token": "dapi...",
    "warehouseId": "..."
  }
}
```

### POST `/api/settings/test`
Test connection with provided credentials

```json
{
  "type": "anthropic|databricks|aws|redis",
  "config": { /* relevant config */ }
}
```

### DELETE `/api/settings`
Reset settings to defaults (environment variables only)

## Migration from Frontend Settings

The frontend settings stored in `localStorage` are **not** automatically migrated. Users will need to:

1. Note their current settings from the frontend
2. Enter them in the backend settings UI
3. Restart the backend for changes to take effect

## Operational Tiers

Based on configured services, DataPrism operates in one of three tiers:

- **Tier 1 (Full Mode)**: Claude AI + Databricks + AWS
- **Tier 2 (AI Mode)**: Claude AI only (mock data for queries)
- **Tier 3 (Demo Mode)**: No API keys (mock NLP engine)

The status banner in the settings UI shows the current tier.

## Benefits of Backend Settings

1. **Centralized Management**: One place to configure everything
2. **Environment Agnostic**: Works across all frontend deployments
3. **Persistent Storage**: Settings survive browser cache clears
4. **Secure**: Credentials never stored in browser localStorage
5. **Team Sharing**: Multiple users can share the same configuration
6. **Easy Backup**: Single JSON file to backup/restore
7. **Environment Variable Fallback**: Use .env files in production

## Example Workflow

1. **Development**: Use the settings UI to configure locally
2. **Staging/Production**: Use environment variables for security
3. **Testing**: Quickly switch between configurations using the UI

## Troubleshooting

**Settings not taking effect?**
- Restart the backend server after changing settings
- Check `.dataprism-settings.json` exists and has valid JSON
- Verify environment variables aren't overriding your settings

**Can't access settings UI?**
- Verify backend is running on the correct port
- In production, ensure ADMIN_TOKEN is set and provided
- Check browser console for errors

**Lost settings?**
- Settings are in `.dataprism-settings.json` - check if file exists
- If deleted, settings revert to environment variables
- Always backup this file before making major changes
