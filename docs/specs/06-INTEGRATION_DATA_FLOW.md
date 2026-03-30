# DataPrism - Integration & Data Flow Specification

**Version:** 1.0.0
**Last Updated:** 2026-03-13

---

## 1. End-to-End Chat Flow

### 1.1 Tier 1: Full Mode (Claude + Databricks + AWS)

```
User types: "What are the top 5 selling Toyota models this quarter?"
    │
    ▼
┌─ ChatPage ──────────────────────────────────────────────────────────┐
│ 1. Add user message to conversation                                 │
│ 2. Build history array from conversation                            │
│ 3. Build conversation summary (if long history)                     │
│ 4. Call chatWithPrismAI(question, history, summary)                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ POST /api/chat
                            ▼
┌─ Backend Chat Router ───────────────────────────────────────────────┐
│ 1. Extract credentials:                                             │
│    - OAuth tokens from session → host + access_token                │
│    - Warehouse ID from .env                                         │
│    - AWS creds from .env                                            │
│                                                                     │
│ 2. hasLiveCredentials = true                                        │
│    → Force tool usage (tool_choice: any) on first iteration         │
│    → Schema context = "NO SCHEMA DATA PROVIDED — use tools"         │
│                                                                     │
│ 3. Build system prompt with:                                        │
│    - Databricks capabilities (SQL, governance, jobs)                │
│    - AWS capabilities (resources, health, costs)                    │
│    - Current date context                                           │
│    - Response format rules                                          │
│                                                                     │
│ 4. Send to Claude: messages + tools + system prompt                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─ Claude AI (Iteration 1) ──────────────────────────────────────────┐
│ Returns tool_use: get_schema_context({ schemas: ["toyota_*"] })     │
└───────────────────────────┬────────────────────────────────────────┘
                            │
                            ▼
┌─ Tool Executor ────────────────────────────────────────────────────┐
│ Live mode: GET {host}/api/2.1/unity-catalog/tables?catalog=...      │
│ Returns: table names, columns, data types                           │
└───────────────────────────┬────────────────────────────────────────┘
                            │
                            ▼
┌─ Claude AI (Iteration 2) ──────────────────────────────────────────┐
│ Returns tool_use: execute_sql({ sql: "SELECT model, ..." })         │
└───────────────────────────┬────────────────────────────────────────┘
                            │
                            ▼
┌─ Tool Executor ────────────────────────────────────────────────────┐
│ POST {host}/api/2.0/sql/statements                                  │
│   { statement: "SELECT ...", warehouse_id: "...", wait_timeout: 30 }│
│ Returns: columns + rows                                             │
└───────────────────────────┬────────────────────────────────────────┘
                            │
                            ▼
┌─ Claude AI (Iteration 3) ──────────────────────────────────────────┐
│ No tool_use → returns text response with JSON:                      │
│ { type: "sql", explanation: "...", sql: "SELECT ..." }              │
└───────────────────────────┬────────────────────────────────────────┘
                            │
                            ▼
┌─ Backend Response ─────────────────────────────────────────────────┐
│ Parse JSON from Claude text                                         │
│ Attach results from tool execution                                  │
│ Return: { type, explanation, sql, results, tokenUsage, mode: live } │
└───────────────────────────┬────────────────────────────────────────┘
                            │
                            ▼
┌─ ChatPage ─────────────────────────────────────────────────────────┐
│ 1. Add assistant message to conversation                            │
│ 2. Display explanation in MessageBubble                             │
│ 3. Show SQL in SyntaxHighlighter                                    │
│ 4. Show results in ResultsView (table + chart)                      │
│ 5. Update token stats                                               │
│ 6. Persist conversation to localStorage                             │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 Tier 2: AI Mode (Claude Only)

Same flow as Tier 1, except:
- `hasLiveCredentials = false`
- Mock schema context injected directly into system prompt
- Tool calls return mock data from `mock-data.ts`
- `tool_choice` is not forced (Claude can respond without tools)
- Response mode: `mock`

### 1.3 Tier 3: Demo Mode (No API Keys)

```
User types question
    │
    ▼
POST /api/chat → No Claude client
    │
    ▼
answerQuestion(question)  [mock-engine.ts]
    │
    ├─ Pattern match against 8 question types
    ├─ Return pre-computed { type, explanation, sql, results }
    │
    ▼
Response: { type, explanation, sql, results, tokenUsage: {0,0,mock-nlp}, mode: demo }
```

---

## 2. Tool Execution Pipeline

### 2.1 Execution Modes

```
Tool Call from Claude
    │
    ├─ USE_MCP=true AND mcpInitialized AND connected?
    │   │
    │   ├─ Yes → MCP Server handles tool call
    │   │         (stdio transport, JSON-RPC)
    │   │
    │   └─ No (or MCP fails) → fallback to direct executor
    │
    └─ Direct Executor
        │
        ├─ Has live credentials?
        │   │
        │   ├─ Yes → Real API calls (Databricks REST, AWS SDK)
        │   │
        │   └─ No → Mock data fallback
        │
        └─ Return ToolResult { type, tool_use_id, content }
```

### 2.2 Databricks API Integration

**SQL Execution:**
```
POST {host}/api/2.0/sql/statements
Authorization: Bearer {token}
Content-Type: application/json

{
  "statement": "SELECT ...",
  "warehouse_id": "{warehouseId}",
  "wait_timeout": "30s"
}

Response:
{
  "status": { "state": "SUCCEEDED" },
  "manifest": { "schema": { "columns": [...] } },
  "result": { "data_array": [[...]], "truncated": false }
}
```

**Unity Catalog Schema Discovery:**
```
GET {host}/api/2.1/unity-catalog/tables?catalog_name=...&schema_name=...
Authorization: Bearer {token}
```

**Unity Catalog Governance:**
- Table lineage: `GET {host}/api/2.1/unity-catalog/lineage-tracking/table-lineage`
- Permissions: `GET {host}/api/2.1/unity-catalog/permissions/{type}/{name}`
- Data classification: `GET {host}/api/2.1/unity-catalog/tables/{name}` (tags)

**Jobs API:**
- List runs: `GET {host}/api/2.1/jobs/runs/list`
- Get run: `GET {host}/api/2.1/jobs/runs/get?run_id=...`
- Get output: `GET {host}/api/2.1/jobs/runs/get-output?run_id=...`

### 2.3 AWS API Integration

All AWS operations use SDK v3 clients:

| Service | Client | Operations |
|---------|--------|-----------|
| EC2 | `EC2Client` | `DescribeInstancesCommand` |
| S3 | `S3Client` | `ListBucketsCommand`, `GetBucketLocationCommand`, `HeadBucketCommand` |
| RDS | `RDSClient` | `DescribeDBInstancesCommand` |
| Lambda | `LambdaClient` | `ListFunctionsCommand`, `GetFunctionCommand` |
| CloudWatch | `CloudWatchClient` | `DescribeAlarmsCommand` |
| Cost Explorer | `CostExplorerClient` | `GetCostAndUsageCommand` |

Client initialization:
```typescript
new EC2Client({
  region: credentials.awsRegion || 'us-east-1',
  credentials: {
    accessKeyId: credentials.awsAccessKey,
    secretAccessKey: credentials.awsSecretKey,
  },
});
```

---

## 3. OAuth Flow

### 3.1 Login Sequence

```
Frontend                         Backend                          Databricks
   │                               │                               │
   │  GET /api/auth/config         │                               │
   │──────────────────────────────>│                               │
   │  { oauthEnabled: true }       │                               │
   │<──────────────────────────────│                               │
   │                               │                               │
   │  GET /api/auth/login          │                               │
   │──────────────────────────────>│                               │
   │                               │ Generate state (32 bytes hex) │
   │                               │ Store in session              │
   │  { authUrl: "https://..." }   │                               │
   │<──────────────────────────────│                               │
   │                               │                               │
   │  window.location = authUrl    │                               │
   │──────────────────────────────────────────────────────────────>│
   │                               │                               │
   │  User authenticates in browser│                               │
   │<──────────────────────────────────────────────────────────────│
   │  Redirect: /auth/callback?code=XXX&state=YYY                  │
   │                               │                               │
   │  OAuthCallbackPage:           │                               │
   │  GET /api/auth/callback       │                               │
   │──────────────────────────────>│                               │
   │                               │ Validate state === session    │
   │                               │                               │
   │                               │ POST /oidc/v1/token           │
   │                               │──────────────────────────────>│
   │                               │ { access_token, refresh_token}│
   │                               │<──────────────────────────────│
   │                               │                               │
   │                               │ GET /api/2.0/preview/scim/v2  │
   │                               │──────────────────────────────>│
   │                               │ { user_name, display_name }   │
   │                               │<──────────────────────────────│
   │                               │                               │
   │                               │ Store tokens + user in session│
   │  { success: true, user }      │                               │
   │<──────────────────────────────│                               │
   │                               │                               │
   │  Navigate to /chat            │                               │
```

### 3.2 Token Refresh

Happens transparently during chat requests:

```typescript
async function ensureValidToken(config, tokens): Promise<OAuthTokens> {
  const now = Date.now();
  const expiresAt = tokens.expires_at;
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (now < expiresAt - bufferMs) {
    return tokens; // Still valid
  }

  // Refresh using refresh_token
  const newTokens = await refreshToken(config, tokens.refresh_token);
  newTokens.expires_at = Date.now() + (newTokens.expires_in * 1000);
  return newTokens;
}
```

---

## 4. Conversation Persistence

### 4.1 Storage Format

```
localStorage key: "dataprism_conversations"
Value: JSON string of Conversation[]
```

### 4.2 Summary Generation

For long conversations, the UI builds a compressed summary to stay within Claude's context window:

```typescript
function buildConversationSummary(): string {
  // Concatenate recent messages with role prefixes
  // Include SQL results references
  // Include error messages for context
  return "User asked about X, got SQL Y with results Z...";
}
```

The summary is sent as `conversationSummary` in the chat request body, injected into Claude's system prompt.

---

## 5. MCP (Model Context Protocol) Integration

### 5.1 Architecture

Optional alternative to direct API calls. Enabled with `USE_MCP=true`.

```
Backend
├── MCP Client Manager (mcp-client.ts)
│   ├── Databricks MCP Server (databricks-server.ts)
│   │   └── stdio transport → child process
│   └── AWS MCP Server (aws-server.ts)
│       └── stdio transport → child process
```

### 5.2 Lazy Initialization

MCP servers are initialized on first request with live credentials:

```typescript
if (USE_MCP && hasLiveCredentials && !mcpInitialized) {
  await initializeMCP(credentials);
  mcpInitialized = true;
}
```

### 5.3 Fallback

If MCP call fails, the system falls back to the direct executor:

```typescript
try {
  result = await mcpManager.callTool(toolName, toolInput);
} catch (err) {
  // Fallback to direct executor
  result = await executeToolCall(toolCall, credentials);
}
```

---

## 6. Error Handling Flow

### 6.1 Backend Errors

```
Claude API Error → catch → 500 { error: "DataPrism error: <message>" }
Tool Execution Error → ToolResult with is_error: true → Claude retries
SQL Execution Error → Fall back to mock data
OAuth Token Error → Fall through to next credential priority
Max Iterations → 500 { error: "Max tool-use iterations reached" }
```

### 6.2 Frontend Errors

```
API Error → throw Error(response.error) → caught in ChatPage
           → Displayed as error MessageBubble
           → Conversation continues (user can retry)

OAuth Error → OAuthCallbackPage shows error + retry button
Network Error → Generic error message in chat
```

---

## 7. Data Transformation Pipeline

### 7.1 SQL Results

```
Databricks API Response
  │
  ├── manifest.schema.columns → column names (string[])
  ├── result.data_array → row data (string[][])
  └── result.truncated → boolean
  │
  ▼
Backend normalizes to:
  { columns, rows, rowCount, truncated }
  │
  ▼
Frontend ResultsView:
  ├── Table: MUI table with headers + scrollable body
  └── Chart: Recharts with auto-detected numeric columns
```

### 7.2 Claude Response Parsing

```
Claude text output
  │
  ▼
Regex: text.match(/\{[\s\S]*"type"[\s\S]*\}/)
  │
  ├── Match found → JSON.parse → structured response
  │   ├── Auto-execute SQL if type=sql and sql present
  │   └── Return { type, explanation, sql, results }
  │
  └── No match → Return as { type: "general", explanation: rawText }
```
