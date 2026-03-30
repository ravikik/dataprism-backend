# DataPrism - System Architecture Specification

**Version:** 1.0.0
**Last Updated:** 2026-03-13
**Status:** Living Document

---

## 1. Overview

DataPrism is an AI-powered data platform assistant that enables natural language interaction with enterprise data infrastructure. It translates user queries into SQL, provides data governance insights, monitors AWS infrastructure, and performs Databricks job failure analysis — all through a conversational interface powered by Claude AI.

### 1.1 System Purpose

- **Natural Language to SQL**: Convert plain-English questions into executable Databricks SQL
- **Data Governance**: Lineage tracking, access permissions, audit logs, PII classification, and data quality monitoring
- **Infrastructure Monitoring**: AWS resource inventory, health checks, and cost analysis
- **Job Failure Analysis**: Databricks job/workflow failure detection, log retrieval, and root cause analysis (RCA)

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DataPrism UI                              │
│  React 18 + TypeScript + Material-UI + Vite                      │
│  Port: 5173 (dev)                                                │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP / REST (JSON)
                               │ Session Cookies + Custom Headers
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DataPrism Backend                           │
│  Node.js + Express + TypeScript                                  │
│  Port: 3001                                                      │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Auth     │ │ Chat     │ │ Settings │ │ Admin UI (HTML)  │   │
│  │ Router   │ │ Router   │ │ Router   │ │ /admin/settings  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────────────┘   │
│       │            │            │                                │
│  ┌────▼────────────▼────────────▼──────────────────────────┐    │
│  │              Middleware Layer                             │    │
│  │  CORS · JSON Parser · Cookie Parser · Session Manager    │    │
│  │  Admin Auth (requireAdmin)                               │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────▼──────────────────────────────────┐    │
│  │              Service Layer                               │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │ Claude AI   │  │ Tool         │  │ Settings      │  │    │
│  │  │ Integration │  │ Executor     │  │ Storage       │  │    │
│  │  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │    │
│  │         │                │                               │    │
│  │  ┌──────▼──────┐  ┌─────▼────────┐                      │    │
│  │  │ Mock NLP    │  │ MCP Client   │                      │    │
│  │  │ Engine      │  │ (Optional)   │                      │    │
│  │  └─────────────┘  └──────────────┘                      │    │
│  └─────────────────────────────────────────────────────────┘    │
└───────────────────────┬────────────────────┬───────────────────┘
                        │                    │
            ┌───────────▼────────┐  ┌───────▼────────────────┐
            │  Databricks        │  │  AWS Services          │
            │  - Unity Catalog   │  │  - EC2, S3, RDS        │
            │  - SQL Warehouse   │  │  - Lambda, CloudWatch  │
            │  - Jobs API        │  │  - Cost Explorer       │
            │  - SCIM (users)    │  │                        │
            └────────────────────┘  └────────────────────────┘
```

---

## 2. Operational Tiers

DataPrism operates in three tiers based on available credentials, enabling graceful degradation:

| Tier | Name | Requirements | Capabilities |
|------|------|-------------|--------------|
| **Tier 1** | Full Mode | Claude AI + Databricks + AWS | All features: live SQL, governance, infrastructure, job analysis |
| **Tier 2** | AI Mode | Claude AI only | SQL generation against mock schema, mock governance data |
| **Tier 3** | Demo Mode | No API keys | Pattern-matching NLP engine, pre-computed mock responses |

**Tier determination logic** (from [settings.ts](../server/routes/settings.ts)):
```
hasAI && hasDB && hasAWS → Tier 1 (Full)
hasAI                    → Tier 2 (AI)
else                     → Tier 3 (Demo)
```

---

## 3. Technology Stack

### 3.1 Backend

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | ES2020+ |
| Language | TypeScript | 5.6.0 |
| Framework | Express.js | 4.21.0 |
| AI SDK | @anthropic-ai/sdk | 0.39.0 |
| MCP SDK | @modelcontextprotocol/sdk | 1.27.1 |
| AWS SDK | @aws-sdk/client-* (v3) | Latest |
| Module System | ES Modules | `"type": "module"` |
| Dev Runner | tsx | watch mode |

### 3.2 Frontend

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 18.3.x |
| Language | TypeScript | 5.6.0 |
| Build Tool | Vite | 5.4.0 |
| UI Library | Material-UI (MUI) | 5.16.0 |
| Routing | React Router DOM | 7.13.1 |
| Charting | Recharts | 3.7.0 |
| Code Highlighting | Prism React Renderer | 2.4.1 |
| CSS-in-JS | Emotion | 11.13.0 |

### 3.3 External Services

| Service | Purpose | Protocol |
|---------|---------|----------|
| Claude AI (Anthropic) | Natural language understanding, SQL generation | HTTPS REST |
| Databricks SQL Warehouse | Query execution | REST API (`/api/2.0/sql/statements`) |
| Databricks Unity Catalog | Schema metadata, governance | REST API |
| Databricks Jobs API | Job failure analysis, logs, RCA | REST API |
| Databricks SCIM API | User identity (OAuth) | REST API |
| AWS EC2 / S3 / RDS / Lambda | Infrastructure inventory | AWS SDK v3 |
| AWS CloudWatch | Health monitoring, alarms | AWS SDK v3 |
| AWS Cost Explorer | Billing analysis | AWS SDK v3 |

### 3.4 Optional Services

| Service | Purpose |
|---------|---------|
| Redis | Fast caching layer |
| PostgreSQL + pgvector | Vector similarity search for semantic caching |
| Pinecone | Managed vector database |
| Qdrant | Self-hosted vector database |

---

## 4. Directory Structure

### 4.1 Backend (`DataPrism-Backend/`)

```
server/
├── index.ts                    # Express app setup, middleware, route mounting
├── auth/
│   ├── oauth.ts                # Databricks OAuth 2.0 (auth code flow, token refresh)
│   └── session.d.ts            # Express session type augmentation
├── mcp/
│   ├── tools.ts                # Claude tool definitions (15 tools)
│   ├── executor.ts             # Direct tool execution (Databricks + AWS APIs)
│   ├── mcp-client.ts           # MCP server lifecycle manager
│   ├── databricks-server.ts    # MCP server for Databricks tools
│   └── aws-server.ts           # MCP server for AWS tools
├── middleware/
│   └── admin-auth.ts           # Admin token authentication
├── routes/
│   ├── chat.ts                 # POST /api/chat, POST /api/chat/execute-sql, GET /api/ai/config
│   ├── auth.ts                 # OAuth flow endpoints
│   └── settings.ts             # Admin settings CRUD
├── services/
│   └── settings-storage.ts     # JSON file-based settings persistence
├── nlp/
│   └── mock-engine.ts          # Pattern-matching NLP for demo mode
├── views/
│   └── settings.html           # Admin settings UI (standalone HTML)
└── mock-data.ts                # Mock catalog schemas and query results
```

### 4.2 Frontend (`DataPrism-UI/`)

```
src/
├── App.tsx                      # Root: routing, theme provider
├── main.tsx                     # React entry point
├── theme.ts                     # MUI theme (light/dark, colors, typography)
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx         # Top AppBar, dark mode toggle, version badge
│   │   └── Sidebar.tsx          # Navigation menu (5 main + 4 doc sub-items)
│   ├── chat/
│   │   ├── MessageBubble.tsx    # Message rendering (user/AI, SQL highlight, execute)
│   │   ├── ConversationDrawer.tsx  # Conversation history sidebar
│   │   └── ResultsView.tsx      # Table/chart toggle for query results
│   └── common/
│       ├── SyntaxHighlighter.tsx # Prism-based code blocks
│       └── ResultsChart.tsx     # Recharts wrapper (bar/line/area/pie)
├── pages/
│   ├── HomePage.tsx             # Landing page with feature cards
│   ├── ChatPage.tsx             # Main AI chat interface
│   ├── GovernancePage.tsx       # Governance feature showcase
│   ├── DemoPage.tsx             # Leadership demo plan
│   ├── DocsPage.tsx             # Documentation hub
│   ├── ComparisonPage.tsx       # DataPrism vs Databricks Genie
│   ├── AzureADSSOPage.tsx       # Azure AD SSO integration docs
│   ├── MCPPage.tsx              # Model Context Protocol docs
│   ├── CachingStrategyPage.tsx  # Caching strategy docs
│   └── OAuthCallbackPage.tsx    # OAuth redirect handler
├── services/
│   ├── api.ts                   # Backend API integration functions
│   └── credentials.ts           # localStorage credential management
└── hooks/
    ├── useConversations.ts      # Conversation state (localStorage)
    └── useTokenStats.ts         # Claude token usage tracking
```

---

## 5. Communication Patterns

### 5.1 Frontend → Backend

- **Protocol**: HTTP/REST over JSON
- **Base URL**: `http://localhost:3001` (dev, proxied via Vite as `/api`)
- **Authentication**: Session cookies (`credentials: 'include'`) + custom headers for legacy PAT
- **Request Headers**:
  - `Content-Type: application/json`
  - `x-anthropic-api-key` (optional, runtime Claude key)
  - `x-databricks-host`, `x-databricks-token`, `x-databricks-warehouse` (legacy PAT)
  - `x-aws-access-key`, `x-aws-secret-key`, `x-aws-region` (AWS credentials)

### 5.2 Backend → External Services

- **Databricks**: REST API with Bearer token (OAuth or PAT)
- **AWS**: SDK v3 clients with IAM credentials
- **Claude AI**: Anthropic SDK with API key (`sk-ant-*`)

### 5.3 Tool Execution Modes

```
                     ┌──────────────────────┐
                     │  USE_MCP=true?        │
                     └──────────┬───────────┘
                      Yes       │        No
                 ┌──────────────▼──────────────┐
                 │  MCP Server Manager          │
                 │  ┌──────────┐ ┌───────────┐ │
                 │  │Databricks│ │ AWS Server │ │
                 │  │ Server   │ │            │ │
                 │  └──────────┘ └───────────┘ │
                 └──────────────────────────────┘
                         │ fallback ▼
                 ┌──────────────────────────────┐
                 │  Direct Executor              │
                 │  (REST calls + AWS SDK)       │
                 └──────────────────────────────┘
                         │ no credentials ▼
                 ┌──────────────────────────────┐
                 │  Mock Data Fallback           │
                 │  (Pre-computed responses)     │
                 └──────────────────────────────┘
```
