# DataPrism - Data Models & Schemas Specification

**Version:** 1.0.0
**Last Updated:** 2026-03-13

---

## 1. Backend Data Models

### 1.1 Settings

Defined in `server/services/settings-storage.ts`. Persisted to `.dataprism-settings.json`.

```typescript
interface Settings {
  anthropicApiKey?: string;

  databricks?: {
    host?: string;           // e.g., "https://myworkspace.cloud.databricks.com"
    token?: string;          // Databricks PAT (dapi-...)
    warehouseId?: string;    // SQL Warehouse ID
  };

  aws?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;         // Default: "us-east-1"
  };

  oauth?: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;    // Default: "http://localhost:5173/auth/callback"
  };

  server?: {
    port?: number;           // Default: 3001
    sessionSecret?: string;
    frontendUrl?: string;    // Default: "http://localhost:5173"
  };

  cache?: {
    redisHost?: string;
    redisPort?: number;      // Default: 6379
    redisPassword?: string;
  };

  vectorDb?: {
    type?: 'pgvector' | 'pinecone' | 'qdrant';
    // PostgreSQL + pgvector
    postgresHost?: string;
    postgresPort?: number;   // Default: 5432
    postgresUser?: string;
    postgresPassword?: string;
    postgresDatabase?: string;
    postgresSSL?: boolean;
    // Pinecone
    pineconeApiKey?: string;
    pineconeEnvironment?: string;
    pineconeIndex?: string;
  };
}
```

### 1.2 OAuth Tokens

Defined in `server/auth/oauth.ts`. Stored in Express session.

```typescript
interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;       // "Bearer"
  expires_in: number;       // Seconds until expiry
  scope: string;
  expires_at: number;       // Unix timestamp (ms) of expiry
}
```

### 1.3 User Info

Retrieved from Databricks SCIM API. Stored in Express session.

```typescript
interface UserInfo {
  user_name: string;        // e.g., "john.doe@company.com"
  display_name: string;     // e.g., "John Doe"
  emails?: Array<{
    value: string;
    primary?: boolean;
  }>;
}
```

### 1.4 Tool Credentials

Runtime credential bundle passed to tool executors.

```typescript
interface ToolCredentials {
  host?: string;            // Databricks workspace URL
  token?: string;           // Databricks access token (OAuth or PAT)
  warehouseId?: string;     // SQL Warehouse ID
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
}
```

### 1.5 Tool Result

Standardized tool execution response.

```typescript
interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;      // Matches Claude's tool_use block ID
  content: string;          // JSON-serialized result
  is_error?: boolean;
}
```

---

## 2. Frontend Data Models

### 2.1 Chat Response

Defined in `src/services/api.ts`.

```typescript
interface ChatResponse {
  type: 'sql' | 'infrastructure' | 'governance' | 'general';
  explanation: string;
  sql: string;
  results?: {
    columns: string[];
    rows: string[][];
    rowCount: number;
    truncated: boolean;
  };
  tokenUsage?: TokenUsage;
  mode?: 'demo' | 'mock' | 'live';
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}
```

### 2.2 Auth Status

```typescript
interface AuthStatus {
  authenticated: boolean;
  authMethod: 'oauth' | 'pat' | 'none';
  user?: {
    username: string;
    displayName?: string;
    email?: string;
  };
}
```

### 2.3 OAuth Config

```typescript
interface OAuthConfig {
  oauthEnabled: boolean;
  oauthHost?: string;
}
```

### 2.4 Conversation

Defined in `src/hooks/useConversations.ts`. Persisted to localStorage.

```typescript
interface Conversation {
  id: string;               // Unique identifier
  title: string;            // Derived from first user message
  messages: Message[];
  createdAt: number;        // Unix timestamp
  updatedAt: number;        // Unix timestamp
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  explanation?: string;
  results?: {
    columns: string[];
    rows: string[][];
    rowCount: number;
    truncated: boolean;
  };
  error?: string;
  timestamp: number;
  responseType?: 'sql' | 'infrastructure' | 'governance' | 'general';
  mode?: 'demo' | 'mock' | 'live';
}
```

### 2.5 Token Stats

Defined in `src/hooks/useTokenStats.ts`. Tracked in memory via external store pattern.

```typescript
interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  lastModel: string;
}
```

---

## 3. Claude AI Tool Definitions

15 tools are defined in `server/mcp/tools.ts` for Claude's tool-use capability:

### 3.1 Databricks Data Tools

| Tool | Input Schema | Description |
|------|-------------|-------------|
| `get_schema_context` | `{ schemas: string[] }` | Fetch table/column metadata from Unity Catalog. Schemas in `catalog.schema` format |
| `execute_sql` | `{ sql: string }` | Execute SQL on Databricks SQL Warehouse |
| `search_tables` | `{ catalog: string, schema: string }` | Search tables in a catalog schema |

### 3.2 Databricks Governance Tools

| Tool | Input Schema | Description |
|------|-------------|-------------|
| `get_table_lineage` | `{ table_name: string, direction?: "upstream"\|"downstream"\|"both" }` | Data lineage (upstream/downstream dependencies) |
| `get_table_permissions` | `{ object_name: string, object_type: "table"\|"schema"\|"catalog" }` | Access grants and permission levels |
| `get_audit_logs` | `{ event_type: "all"\|"read"\|"write"\|"grant"\|"create"\|"delete", object_name?: string, time_range?: "last_24_hours"\|"last_7_days"\|"last_30_days" }` | Audit trail of data access/modifications |
| `get_data_classification` | `{ object_name: string, include_columns?: boolean }` | PII tags, compliance labels, sensitivity levels |
| `get_data_quality_metrics` | `{ table_name: string, metric_type?: "all"\|"completeness"\|"freshness"\|"validity"\|"consistency" }` | Quality scores and validation rules |
| `list_governed_tags` | `{ catalog?: string, tag_category?: "all"\|"security"\|"compliance"\|"quality"\|"business" }` | Browse governance tags by category |

### 3.3 Databricks Job Analysis Tools

| Tool | Input Schema | Description |
|------|-------------|-------------|
| `get_job_failures` | `{ time_range?: string, job_name_filter?: string, include_successful?: boolean, limit?: number }` | Recent failed job runs with errors |
| `get_job_run_logs` | `{ run_id: number, log_type?: "all"\|"driver"\|"stderr"\|"stdout"\|"spark_events"\|"cluster_events", max_lines?: number }` | Detailed logs for a specific run |
| `get_job_run_rca` | `{ run_id: number, include_history?: boolean }` | Root cause analysis with remediation steps |

### 3.4 AWS Infrastructure Tools

| Tool | Input Schema | Description |
|------|-------------|-------------|
| `describe_aws_resources` | `{ resource_type: "all"\|"ec2"\|"s3"\|"rds"\|"lambda" }` | List/describe AWS resources |
| `get_aws_health` | `{ service: "all"\|"ec2"\|"rds"\|"s3" }` | CloudWatch alarms and service health |
| `get_aws_costs` | `{ period?: "last_7_days"\|"last_30_days"\|"this_month"\|"last_month" }` | Cost breakdowns by service |

### 3.5 Tool Availability

Tools are filtered based on available credentials:

```typescript
function getAvailableTools(hasAWS: boolean, hasDatabricks: boolean): Tool[] {
  // Databricks → 12 tools (data + governance + jobs)
  // AWS       → 3 tools (resources + health + costs)
  // No creds  → ALL_TOOLS (15) — executor falls back to mock data
}
```

---

## 4. Mock Data Catalog

Used in Tier 2 (AI mode) and Tier 3 (demo mode). Toyota automotive theme.

### 4.1 Catalogs & Schemas

```
toyota_production (Production Data)
├── sales
│   ├── transactions         (sale_id, vehicle_id, dealer_id, customer_id, sale_date, sale_price, ...)
│   ├── dealers              (dealer_id, dealer_name, city, state, region, ...)
│   └── monthly_targets      (target_id, dealer_id, month, year, target_units, ...)
├── inventory
│   ├── vehicle_stock        (stock_id, vin, model, trim, color, status, ...)
│   └── allocation           (allocation_id, dealer_id, model, quantity, ...)
└── manufacturing
    ├── production_lines     (line_id, plant_id, model, daily_capacity, ...)
    ├── plants               (plant_id, plant_name, location, country, ...)
    └── quality_metrics      (metric_id, line_id, defect_rate, ...)

toyota_analytics (Analytics Data)
├── reporting
│   ├── sales_summary        (summary_id, region, month, total_units, total_revenue, ...)
│   └── dealer_performance   (perf_id, dealer_id, quarter, score, ...)
└── customer_insights
    ├── customers            (customer_id, name, email, segment, ...)
    └── satisfaction_surveys (survey_id, customer_id, rating, feedback, ...)
```

### 4.2 Mock NLP Patterns

8 pre-computed question patterns for demo mode:

| Pattern | Trigger Keywords | Response Type |
|---------|-----------------|---------------|
| Reviews/Surveys | "review", "survey", "satisfaction", "feedback" | sql |
| Sales by Model | "sales", "model", "selling" | sql |
| Dealer Performance | "dealer", "performance", "top dealer" | sql |
| Inventory Status | "inventory", "stock", "available" | sql |
| Production Quality | "quality", "defect", "production" | sql |
| Monthly Targets | "target", "goal", "monthly" | sql |
| Regional Analysis | "region", "regional", "geography" | sql |
| General Fallback | (any other) | general |

---

## 5. Session Schema

Express session augmented with OAuth data:

```typescript
interface SessionData {
  oauthTokens?: OAuthTokens;    // Databricks OAuth tokens
  userInfo?: UserInfo;           // SCIM user profile
  oauthState?: string;           // CSRF state for OAuth flow
}
```

Session configuration:
- **Secret**: `SESSION_SECRET` env var
- **Cookie secure**: HTTPS only in production
- **Cookie httpOnly**: Always true
- **Cookie maxAge**: 24 hours (86,400,000 ms)
- **Cookie sameSite**: `strict` in production, `lax` in development
- **resave**: false
- **saveUninitialized**: false
