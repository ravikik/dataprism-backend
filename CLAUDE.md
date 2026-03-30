# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm install              # Install dependencies
npm run dev              # Development with hot reload (tsx watch, port 3001)
npm start                # Production run
npm run mcp:databricks   # Run Databricks MCP server standalone
npm run mcp:aws          # Run AWS MCP server standalone
```

No test framework is configured. No ESLint/Prettier is configured.

## Environment Setup

Copy `.env.example` to `.env`. The server operates in three tiers based on which credentials are present:

| Tier | Required Keys | Behavior |
|------|--------------|----------|
| Full | `ANTHROPIC_API_KEY` + Databricks + AWS credentials | Live AI with real tool execution |
| AI-only | `ANTHROPIC_API_KEY` only | Claude with mock schema context |
| Demo | None | Pattern-matching NLP engine (`server/nlp/mock-engine.ts`) |

Set `USE_MCP=true` to route tool calls through MCP servers (stdio transport) instead of the default direct executor.

## Architecture

**Express REST API that orchestrates Claude AI with external data tools (Databricks, AWS), with graceful degradation to mock data.**

### Request Flow

```
POST /api/chat → Resolve credentials (OAuth session → .env → frontend headers → mock)
  → Claude API call with 18 tool definitions
  → Tool call loop (max 8 iterations):
      Execute tools (MCP server or direct executor) → Feed results back to Claude
  → Parse structured JSON response → Return to frontend
```

### Key Modules

- **`server/index.ts`** — Express app entry, middleware stack, route mounting
- **`server/routes/chat.ts`** — Core chat endpoint; credential resolution, Claude interaction, tool execution loop
- **`server/mcp/tools.ts`** — 18 Claude tool definitions (Anthropic tool format)
- **`server/mcp/executor.ts`** — Direct tool execution via Databricks REST API and AWS SDK
- **`server/mcp/mcp-client.ts`** — MCP server lifecycle management (alternative to direct executor)
- **`server/mcp/databricks-server.ts`** / **`aws-server.ts`** — Standalone MCP servers
- **`server/auth/oauth.ts`** — Databricks OAuth 2.0 (authorization code flow, token refresh)
- **`server/services/settings-storage.ts`** — JSON file-based settings persistence (no database)
- **`server/mock-data.ts`** — Mock catalog/schema/query data for demo and fallback

### Credential Priority Chain (in chat.ts)

1. OAuth tokens from Express session (auto-refreshed)
2. Backend `.env` values
3. Frontend request headers (legacy PAT fallback)
4. No credentials → mock data mode

### Tool Categories (18 tools in `mcp/tools.ts`)

- **Data:** `get_schema_context`, `execute_sql`, `search_tables`
- **Governance:** `get_table_lineage`, `get_table_permissions`, `get_audit_logs`, `get_data_classification`, `get_data_quality_metrics`, `list_governed_tags`
- **AI Column Enrichment:** `generate_column_descriptions`, `update_column_descriptions`, `update_column_tags`
- **Jobs:** `get_job_failures`, `get_job_run_logs`, `get_job_run_rca`
- **AWS:** `describe_aws_resources`, `get_aws_health`, `get_aws_costs`

## Conventions

- **ES Modules** with TypeScript strict mode, target ES2020
- **Console logging with `[Component]` prefixes:** `[DataPrism]`, `[Chat]`, `[Auth]`, `[OAuth]`, `[MCP]`, `[Settings]`, `[AWS MCP]`, `[Databricks MCP]`
- **Chat responses** must follow the structured JSON schema with `type`, `explanation`, `sql?`, `results?`, `tokenUsage`, and `mode` fields
- **Databricks API** uses mixed versions (`/api/2.0/` and `/api/2.1/`)
- **Frontend is a separate repo** (React+Vite); this is backend only

## Specs & Documentation

Detailed specifications live in `docs/specs/` (architecture, API, data models, auth, frontend, integration flows, deployment). Read `docs/specs/01-SYSTEM_ARCHITECTURE.md` for the full system design.
