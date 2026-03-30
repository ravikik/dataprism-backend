# DataPrism - Authentication & Security Specification

**Version:** 1.0.0
**Last Updated:** 2026-03-13

---

## 1. Authentication Methods

DataPrism supports three authentication methods with a defined priority chain:

```
Priority 1: OAuth 2.0 (Databricks)     → Session-based tokens
Priority 2: Personal Access Token (PAT) → Environment variables
Priority 3: Frontend Headers (Legacy)   → Custom HTTP headers
```

### 1.1 OAuth 2.0 (Databricks)

**Flow:** Authorization Code Grant (RFC 6749)

```
┌──────────┐                    ┌──────────┐                    ┌──────────────┐
│  Browser  │                    │  Backend  │                    │  Databricks   │
└─────┬────┘                    └─────┬────┘                    └──────┬───────┘
      │  1. GET /api/auth/login       │                               │
      │──────────────────────────────>│                               │
      │  { authUrl }                  │                               │
      │<──────────────────────────────│                               │
      │                               │                               │
      │  2. Redirect to authUrl       │                               │
      │──────────────────────────────────────────────────────────────>│
      │                               │                               │
      │  3. User authenticates        │                               │
      │<──────────────────────────────────────────────────────────────│
      │  Redirect: /auth/callback?code=...&state=...                  │
      │                               │                               │
      │  4. GET /api/auth/callback    │                               │
      │──────────────────────────────>│                               │
      │                               │  5. POST /oidc/v1/token       │
      │                               │──────────────────────────────>│
      │                               │  { access_token, refresh }    │
      │                               │<──────────────────────────────│
      │                               │                               │
      │                               │  6. GET /api/2.0/preview/scim │
      │                               │──────────────────────────────>│
      │                               │  { user_name, display_name }  │
      │                               │<──────────────────────────────│
      │                               │                               │
      │  7. { success, user }         │                               │
      │<──────────────────────────────│                               │
      │  + Set-Cookie: session        │                               │
```

**Key Implementation Details:**

- **CSRF Protection**: Random 32-byte hex state parameter stored in session, validated on callback
- **Token Refresh**: Automatic refresh when token expires within 5-minute buffer
- **Token Storage**: Stored in server-side Express session (not client localStorage)
- **User Info**: Retrieved via Databricks SCIM API (`/api/2.0/preview/scim/v2/Me`)

**Required Environment Variables:**
```
DATABRICKS_OAUTH_CLIENT_ID=<app registration client ID>
DATABRICKS_OAUTH_CLIENT_SECRET=<app registration client secret>
DATABRICKS_HOST=https://<workspace>.cloud.databricks.com
DATABRICKS_OAUTH_REDIRECT_URI=http://localhost:5173/auth/callback
```

**Databricks OAuth Endpoints:**
- Authorization: `{host}/oidc/v1/authorize`
- Token Exchange: `{host}/oidc/v1/token`
- Scopes: `all-apis offline_access`

### 1.2 Personal Access Token (PAT)

**Backend PAT** (Priority 2):
```
DATABRICKS_HOST=https://<workspace>.cloud.databricks.com
DATABRICKS_TOKEN=dapi-xxxxxxxxxxxxxxxx
DATABRICKS_WAREHOUSE_ID=<warehouse_id>
```

**Frontend Headers** (Priority 3, Legacy):
```
x-databricks-host: https://<workspace>.cloud.databricks.com
x-databricks-token: dapi-xxxxxxxxxxxxxxxx
x-databricks-warehouse: <warehouse_id>
```

### 1.3 Claude API Key

**Server-side** (Priority 1):
```
ANTHROPIC_API_KEY=sk-ant-...
# or
CLAUDE_API_KEY=sk-ant-...
```

**Runtime override** (Priority 2):
```
x-anthropic-api-key: sk-ant-...
```

Validation: Key must start with `sk-ant-` prefix.

### 1.4 AWS Credentials

**Environment** (Priority 2):
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

**Frontend Headers** (Priority 1):
```
x-aws-access-key: AKIA...
x-aws-secret-key: ...
x-aws-region: us-east-1
```

---

## 2. Credential Priority Chain

For Databricks credentials, the resolution order is:

```typescript
async function getDatabricksCredentials(req): Promise<{host, token} | null> {
  // Priority 1: OAuth session tokens (auto-refreshed)
  if (session.oauthTokens && DATABRICKS_HOST) return { host, token: oauthToken };

  // Priority 2: Backend .env configuration
  if (DATABRICKS_HOST && DATABRICKS_TOKEN) return { host, token: envToken };

  // Priority 3: Frontend request headers (legacy)
  if (headers['x-databricks-host'] && headers['x-databricks-token']) return { host, token };

  return null; // No credentials → mock mode
}
```

---

## 3. Admin Authentication

The `/api/settings` routes and `/admin/*` pages are protected by `requireAdmin` middleware.

**Development Mode** (`NODE_ENV !== 'production'`):
- All requests are allowed without authentication

**Production Mode** (`NODE_ENV === 'production'`):
- Requires `ADMIN_TOKEN` environment variable to be set
- Token provided via:
  - Header: `Authorization: Bearer <token>` or custom header
  - Query parameter: `?token=<admin_token>`

---

## 4. Session Security

### 4.1 Session Configuration

```typescript
session({
  secret: SESSION_SECRET,           // Required: set in .env
  resave: false,                    // Don't save unchanged sessions
  saveUninitialized: false,         // Don't create empty sessions
  cookie: {
    secure: IS_PRODUCTION,          // HTTPS-only in production
    httpOnly: true,                 // No JavaScript access
    maxAge: 24 * 60 * 60 * 1000,   // 24-hour expiry
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
  },
})
```

### 4.2 Session Contents

| Key | Type | Description |
|-----|------|-------------|
| `oauthTokens` | OAuthTokens | Databricks access/refresh tokens |
| `userInfo` | UserInfo | SCIM user profile |
| `oauthState` | string | Temporary CSRF state (cleared after use) |

---

## 5. CORS Configuration

```typescript
cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,  // Allow cookies
})
```

- Single origin allowed (configured via `FRONTEND_URL`)
- Credentials (cookies) enabled for session-based auth
- In production, `FRONTEND_URL` must match the deployed UI domain

---

## 6. Security Measures

### 6.1 Input Validation

| Endpoint | Validation |
|----------|-----------|
| `POST /api/chat` | `question` required (400 if missing) |
| `POST /api/chat/execute-sql` | `sql` required (400 if missing) |
| `PUT /api/settings` | Object type check |
| `POST /api/settings/test` | Type-specific field validation |
| `GET /api/auth/callback` | State parameter CSRF check, code required |

### 6.2 Sensitive Data Handling

- **Settings masking**: All sensitive values masked to `••••••••` + last 4 chars via `maskSensitiveSettings()`
- **Token logging**: Only first 10 characters of tokens logged (`prefix...`)
- **Session tokens**: Stored server-side only, never exposed to client
- **Settings file**: `.dataprism-settings.json` stored in backend root (should be in `.gitignore`)

### 6.3 Read-Only Operations

All Databricks and AWS operations are **read-only**:
- SQL queries are executed but no DDL/DML mutations are suggested
- AWS operations use describe/list/get commands only
- The system prompt explicitly enforces: "All operations are READ-ONLY"

### 6.4 Request Size Limits

- JSON body parser: 5 MB max (`express.json({ limit: '5mb' })`)

### 6.5 Token Refresh Security

- OAuth tokens are refreshed automatically when within 5-minute expiry window
- Refresh failures fall through to next credential priority
- Session is updated with new tokens on successful refresh

---

## 7. Frontend Credential Storage

The UI stores legacy PAT credentials in `localStorage`:

```typescript
// src/services/credentials.ts
localStorage.setItem('dataprism_anthropic_key', key);
localStorage.setItem('dataprism_databricks_host', host);
localStorage.setItem('dataprism_databricks_token', token);
localStorage.setItem('dataprism_databricks_warehouse', warehouseId);
localStorage.setItem('dataprism_aws_access_key', accessKey);
localStorage.setItem('dataprism_aws_secret_key', secretKey);
localStorage.setItem('dataprism_aws_region', region);
```

**Note:** This is legacy behavior for PAT mode. OAuth authentication stores tokens server-side in the session, which is the preferred approach. When OAuth is active, localStorage PAT fields are disabled in the UI.

---

## 8. Authorization Model

### 8.1 Databricks Unity Catalog

When using OAuth, permissions are automatically enforced by the user's Databricks identity:
- SQL queries execute with the authenticated user's grants
- Unity Catalog ACLs apply transparently
- No additional authorization layer needed in DataPrism

### 8.2 Admin Access

Two-level access model:
- **User access**: All chat, auth, and AI config endpoints (no auth required)
- **Admin access**: Settings management, admin UI (requires `ADMIN_TOKEN` in production)
