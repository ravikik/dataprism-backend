# DataPrism - API Specification

**Version:** 1.0.0
**Last Updated:** 2026-03-13
**Base URL:** `http://localhost:3001` (development)

---

## 1. Overview

All API endpoints are prefixed with `/api`. Responses are JSON. Session cookies are used for OAuth authentication. Custom headers provide credential passthrough for legacy PAT mode.

### Global Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes (POST/PUT) | `application/json` |
| `Cookie` | Auto | Session cookie for OAuth |
| `x-anthropic-api-key` | No | Runtime Claude API key override |
| `x-databricks-host` | No | Legacy PAT: Databricks workspace URL |
| `x-databricks-token` | No | Legacy PAT: Databricks personal access token |
| `x-databricks-warehouse` | No | Legacy PAT: SQL warehouse ID |
| `x-aws-access-key` | No | AWS access key ID |
| `x-aws-secret-key` | No | AWS secret access key |
| `x-aws-region` | No | AWS region (default: `us-east-1`) |

---

## 2. Health Check

### `GET /api/health`

Returns server status and configuration state.

**Authentication:** None

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-13T12:00:00.000Z",
  "aiConfigured": true,
  "oauthConfigured": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` |
| `timestamp` | string | ISO 8601 timestamp |
| `aiConfigured` | boolean | Whether `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` is set |
| `oauthConfigured` | boolean | Whether OAuth client credentials are configured |

---

## 3. Chat Endpoints

### 3.1 `POST /api/chat`

Main conversational AI endpoint. Sends a natural language question to Claude AI (or the mock NLP engine in demo mode) and returns a structured response with optional SQL and results.

**Authentication:** None required (credentials enhance capabilities)

**Request Body:**
```json
{
  "question": "What are the top selling Toyota models this month?",
  "selectedSchemas": ["toyota_production.sales"],
  "history": [
    { "role": "user", "content": "Show me the sales data" },
    { "role": "assistant", "content": "{\"type\":\"sql\",\"explanation\":\"...\"}" }
  ],
  "conversationSummary": "User asked about Toyota sales data..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | **Yes** | Natural language query |
| `selectedSchemas` | string[] | No | Schema filter in `catalog.schema` format |
| `history` | object[] | No | Previous conversation messages |
| `history[].role` | `"user"` \| `"assistant"` | Yes | Message sender |
| `history[].content` | string | Yes | Message content |
| `conversationSummary` | string | No | Compressed summary of prior context |

**Response (200):**
```json
{
  "type": "sql",
  "explanation": "Here are the top selling Toyota models...\n\n- Camry: 1,234 units\n- RAV4: 987 units",
  "sql": "SELECT model, COUNT(*) as units FROM toyota_production.sales.transactions GROUP BY model ORDER BY units DESC LIMIT 10",
  "results": {
    "columns": ["model", "units"],
    "rows": [["Camry", "1234"], ["RAV4", "987"]],
    "rowCount": 2,
    "truncated": false
  },
  "tokenUsage": {
    "inputTokens": 1523,
    "outputTokens": 456,
    "model": "claude-sonnet-4-20250514"
  },
  "mode": "live"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"sql"` \| `"infrastructure"` \| `"governance"` \| `"general"` | Response category |
| `explanation` | string | Natural language explanation (Markdown-safe) |
| `sql` | string | Generated SQL query (only when `type: "sql"`) |
| `results` | object \| undefined | Query execution results |
| `results.columns` | string[] | Column names |
| `results.rows` | string[][] | Row data (all values as strings) |
| `results.rowCount` | number | Number of rows returned |
| `results.truncated` | boolean | Whether results were truncated |
| `tokenUsage` | object | Claude API token consumption |
| `tokenUsage.inputTokens` | number | Input tokens used |
| `tokenUsage.outputTokens` | number | Output tokens used |
| `tokenUsage.model` | string | Model identifier |
| `mode` | `"live"` \| `"mock"` \| `"demo"` | Execution mode |

**Response Modes:**
- `live` — Connected to Databricks/AWS with real data
- `mock` — Claude AI with mock schema context (no live credentials)
- `demo` — Pattern-matching NLP engine (no Claude API key)

**Error Response (400):**
```json
{ "error": "Missing question" }
```

**Error Response (500):**
```json
{ "error": "DataPrism error: <message>" }
```

**Processing Flow:**
1. Extract credentials from session/env/headers (priority order)
2. If no Claude key: use mock NLP engine (Tier 3)
3. If Claude key available: build system prompt with capabilities
4. Send to Claude with tool definitions
5. Force tool usage on first iteration when live credentials exist
6. Execute returned tools (up to 8 iterations)
7. Parse structured JSON from Claude's final text response
8. Auto-execute SQL if present but not already executed via tools

---

### 3.2 `POST /api/chat/execute-sql`

Execute a SQL query directly against Databricks (or return mock data).

**Authentication:** None required (credentials determine live vs mock)

**Request Body:**
```json
{
  "sql": "SELECT * FROM toyota_production.sales.transactions LIMIT 10"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sql` | string | **Yes** | SQL query to execute |

**Response (200):**
```json
{
  "columns": ["transaction_id", "model", "dealer_id", "sale_date", "amount"],
  "rows": [["TXN001", "Camry", "D101", "2026-03-01", "32500.00"]],
  "rowCount": 1,
  "truncated": false
}
```

**Mock Response (200):** When no live credentials are available:
```json
{
  "columns": ["..."],
  "rows": [["..."]],
  "rowCount": 5,
  "truncated": false,
  "mock": true
}
```

**Databricks SQL Execution:**
- Endpoint: `{host}/api/2.0/sql/statements`
- Method: POST with Bearer token
- Wait timeout: 30 seconds
- Falls back to mock data on failure

---

### 3.3 `GET /api/ai/config`

Check AI configuration status.

**Authentication:** None

**Response:**
```json
{
  "serverKeyConfigured": true,
  "mode": "ai"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `serverKeyConfigured` | boolean | Whether a valid Claude API key is configured server-side |
| `mode` | `"ai"` \| `"demo"` | Current operational mode |

---

## 4. Authentication Endpoints

### 4.1 `GET /api/auth/status`

Check current authentication state.

**Response (OAuth authenticated):**
```json
{
  "authenticated": true,
  "authMethod": "oauth",
  "user": {
    "username": "john.doe@company.com",
    "displayName": "John Doe",
    "email": "john.doe@company.com"
  }
}
```

**Response (PAT fallback):**
```json
{
  "authenticated": true,
  "authMethod": "pat"
}
```

**Response (Unauthenticated):**
```json
{
  "authenticated": false,
  "authMethod": "none"
}
```

---

### 4.2 `GET /api/auth/config`

Return OAuth availability.

**Response:**
```json
{
  "oauthEnabled": true,
  "oauthHost": "https://myworkspace.cloud.databricks.com"
}
```

---

### 4.3 `GET /api/auth/login`

Initiate OAuth 2.0 authorization code flow.

**Response (200):**
```json
{
  "authUrl": "https://myworkspace.cloud.databricks.com/oidc/v1/authorize?client_id=...&state=..."
}
```

**Response (501):**
```json
{ "error": "OAuth not configured" }
```

**Side Effects:**
- Generates random CSRF state token
- Stores state in session (`req.session.oauthState`)

---

### 4.4 `GET /api/auth/callback`

Handle OAuth redirect from Databricks.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | **Yes** | Authorization code from Databricks |
| `state` | string | **Yes** | CSRF state token (must match session) |
| `error` | string | No | OAuth error from provider |

**Response (200):**
```json
{
  "success": true,
  "user": {
    "username": "john.doe@company.com",
    "displayName": "John Doe",
    "email": "john.doe@company.com"
  }
}
```

**Error Responses:**
- `400` — Invalid state, missing code, or OAuth provider error
- `500` — Token exchange failure
- `501` — OAuth not configured

**Side Effects:**
- Exchanges authorization code for access/refresh tokens
- Fetches user info via SCIM API
- Stores tokens and user info in session

---

### 4.5 `POST /api/auth/logout`

Destroy session and log out.

**Response (200):**
```json
{ "success": true }
```

---

## 5. Settings Endpoints (Admin Protected)

All settings endpoints require admin authentication:
- **Development**: No token required
- **Production**: `ADMIN_TOKEN` header or `?token=` query parameter

### 5.1 `GET /api/settings`

Get current settings with sensitive values masked.

**Response (200):**
```json
{
  "anthropicApiKey": "••••••••api3",
  "databricks": {
    "host": "https://myworkspace.cloud.databricks.com",
    "token": "••••••••xy1z",
    "warehouseId": "abc123def456"
  },
  "aws": {
    "accessKeyId": "••••••••XY1Z",
    "secretAccessKey": "••••••••ab12",
    "region": "us-east-1"
  }
}
```

**Masking Format:** `••••••••` + last 4 characters

---

### 5.2 `GET /api/settings/status`

Get configuration status summary.

**Response (200):**
```json
{
  "hasAnthropicKey": true,
  "hasDatabricks": true,
  "hasAWS": false,
  "hasOAuth": true,
  "hasRedis": false,
  "hasVectorDb": false,
  "tier": "tier2"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tier` | `"tier1"` \| `"tier2"` \| `"tier3"` | Current operational tier |

---

### 5.3 `PUT /api/settings`

Update settings (deep merge with existing).

**Request Body:** Partial `Settings` object (see Data Models spec).

**Response (200):**
```json
{
  "success": true,
  "message": "Settings updated successfully",
  "settings": { /* masked settings */ }
}
```

---

### 5.4 `POST /api/settings/test`

Test connection credentials.

**Request Body:**
```json
{
  "type": "anthropic" | "databricks" | "aws" | "redis",
  "config": { /* type-specific config */ }
}
```

**Test Types:**

| Type | Required Config Fields |
|------|----------------------|
| `anthropic` | `apiKey` (must start with `sk-ant-`) |
| `databricks` | `host`, `token` |
| `aws` | `accessKeyId`, `secretAccessKey` |
| `redis` | `host` |

**Response (200):**
```json
{ "success": true, "message": "Valid API key format" }
```

---

### 5.5 `DELETE /api/settings`

Reset settings to environment variable defaults.

**Response (200):**
```json
{ "success": true, "message": "Settings reset to environment variables" }
```

---

## 6. Admin UI

### `GET /admin/settings`

Serves the standalone admin settings HTML page. Protected by `requireAdmin` middleware.

### `GET /admin`

Redirects to `/admin/settings`.

---

## 7. Rate Limits & Constraints

| Constraint | Value |
|-----------|-------|
| JSON body size limit | 5 MB |
| Session max age | 24 hours |
| Max tool-use iterations per chat | 8 |
| SQL wait timeout (Databricks) | 30 seconds |
| Claude model | `claude-sonnet-4-20250514` |
| Claude max tokens | 4096 |
