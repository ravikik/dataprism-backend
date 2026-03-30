# ⚙️ Backend Settings Management - Quick Start

The settings configuration UI has been moved from the frontend to the backend for better security and centralized management.

## 🚀 Getting Started

### 1. Start the Backend Server

```bash
cd DataPrism-Backend
npm run dev
```

### 2. Access the Settings UI

Open your browser and navigate to:
```
http://localhost:3001/admin/settings
```

You'll see a beautiful, user-friendly interface with tabs for all configuration options.

## 📋 What's New?

### ✅ Features
- **Web-Based UI**: Modern, tabbed interface for all settings
- **Centralized Storage**: Settings stored in backend (`.dataprism-settings.json`)
- **Real-time Status**: Visual indicators show what's configured
- **Operational Tier Display**: See your current mode (Tier 1/2/3)
- **Connection Testing**: Test each service before saving
- **Secure**: Admin token protection in production
- **Persistent**: Survives browser cache clears

### 📂 New Files Created

**Backend Routes & Services:**
- `server/routes/settings.ts` - API endpoints for settings management
- `server/services/settings-storage.ts` - Settings persistence layer
- `server/middleware/admin-auth.ts` - Admin authentication

**UI & Documentation:**
- `server/views/settings.html` - Beautiful settings interface
- `docs/SETTINGS_MANAGEMENT.md` - Complete documentation

**Configuration:**
- `.gitignore` - Excludes settings file from git
- `.env.example` - Updated with ADMIN_TOKEN

## 🎯 Configuration Sections

### 1. 🤖 AI Configuration
- Anthropic Claude API key
- Required for AI-powered responses

### 2. 📊 Databricks
- Workspace URL
- Personal Access Token
- SQL Warehouse ID

### 3. ☁️ AWS
- Access Key ID
- Secret Access Key
- Region selection

### 4. 🔐 OAuth 2.0
- OAuth Client ID & Secret
- Redirect URI configuration

### 5. ⚡ Caching
- **Redis**: Fast exact-match caching
- **Vector DB**: Semantic similarity matching
  - PostgreSQL pgvector (recommended)
  - Pinecone (SaaS)
  - Qdrant

### 6. 🔧 Advanced
- Server port & frontend URL
- Session secret
- Reset all settings

## 🔐 Security

### Development Mode
No authentication required - accessible at `http://localhost:3001/admin/settings`

### Production Mode
Set `ADMIN_TOKEN` in your `.env` file:

```bash
ADMIN_TOKEN=your-secure-random-token-here
NODE_ENV=production
```

Access with token:
```
http://your-server/admin/settings?token=your-secure-random-token-here
```

## 💾 Data Storage

Settings are stored in `.dataprism-settings.json` at the backend root:

```json
{
  "anthropicApiKey": "sk-ant-...",
  "databricks": {
    "host": "https://...",
    "token": "dapi...",
    "warehouseId": "..."
  },
  "aws": { ... },
  "oauth": { ... },
  "cache": { ... },
  "vectorDb": { ... }
}
```

**Important:**
- File is excluded from git
- Backup this file before major changes
- Environment variables override file settings

## 🔄 Migration from Frontend

The old frontend settings (localStorage) are **not** automatically migrated. To migrate:

1. Note your current settings from the frontend
2. Enter them in the new backend settings UI at `/admin/settings`
3. Restart the backend server
4. Settings are now centralized and persistent

## 📊 API Endpoints

All endpoints require admin authentication in production:

- `GET /api/settings` - Get current settings (masked)
- `GET /api/settings/status` - Get configuration status
- `PUT /api/settings` - Update settings
- `POST /api/settings/test` - Test connections
- `DELETE /api/settings` - Reset to defaults

## 🎨 UI Features

- **Status Indicators**: Green/red dots show what's configured
- **Tier Banner**: Shows operational mode (Full/AI/Demo)
- **Connection Testing**: Test before saving
- **Masked Passwords**: Security by default
- **Tabbed Interface**: Organized by category
- **Responsive Design**: Works on mobile/tablet
- **Auto-save Feedback**: Success/error alerts

## 🐛 Troubleshooting

**Settings not saving?**
- Check backend server is running
- Look for errors in terminal
- Verify `.dataprism-settings.json` is writable

**Can't access UI?**
- Verify URL: `http://localhost:3001/admin/settings`
- In production, ensure ADMIN_TOKEN is set
- Check `PORT` environment variable

**Changes not applying?**
- Restart the backend server after saving
- Environment variables override file settings
- Check for typos in URLs/tokens

## 🎓 Example Usage

```bash
# 1. Start backend
cd DataPrism-Backend
npm run dev

# 2. Open browser
# Navigate to http://localhost:3001/admin/settings

# 3. Configure Claude AI
# Go to "AI Configuration" tab
# Enter your Anthropic API key
# Click "Test Connection"
# Click "Save AI Settings"

# 4. Configure Databricks
# Go to "Databricks" tab
# Enter workspace URL, token, warehouse ID
# Click "Test Connection"
# Click "Save Databricks Settings"

# 5. Restart backend to apply
# Press Ctrl+C in terminal
# Run: npm run dev

# 6. Settings are now active!
```

## 📚 Next Steps

1. Read full documentation: `docs/SETTINGS_MANAGEMENT.md`
2. Configure your environment: Update `.env` file
3. Set admin token for production: `ADMIN_TOKEN=...`
4. Test all connections using the UI
5. Backup `.dataprism-settings.json` regularly

## 💡 Tips

- Use environment variables for production deployments
- Test connections before saving settings
- Keep `.dataprism-settings.json` backed up
- Use different settings per environment (dev/staging/prod)
- Review security section for production deployments

---

**Need Help?** Check `docs/SETTINGS_MANAGEMENT.md` for detailed documentation.
