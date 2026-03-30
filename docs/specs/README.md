# DataPrism - Specification Documentation

**Version:** 1.0.0
**Last Updated:** 2026-03-13

---

## Overview

DataPrism is an AI-powered data platform assistant that provides natural language access to Databricks data, governance insights, AWS infrastructure monitoring, and job failure analysis. It consists of a Node.js/Express backend and a React/TypeScript frontend.

---

## Specification Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [System Architecture](01-SYSTEM_ARCHITECTURE.md) | High-level architecture, operational tiers, technology stack, directory structure, communication patterns |
| 02 | [API Specification](02-API_SPECIFICATION.md) | Complete REST API reference: endpoints, request/response schemas, error codes, rate limits |
| 03 | [Data Models](03-DATA_MODELS.md) | TypeScript interfaces, tool definitions, mock data catalog, session schema |
| 04 | [Authentication & Security](04-AUTHENTICATION_SECURITY.md) | OAuth 2.0 flow, PAT fallback, credential priority chain, session security, CORS, admin auth |
| 05 | [Frontend Architecture](05-FRONTEND_ARCHITECTURE.md) | React component hierarchy, routing, state management, theming, API integration layer |
| 06 | [Integration & Data Flow](06-INTEGRATION_DATA_FLOW.md) | End-to-end request flows, tool execution pipeline, OAuth sequence, MCP integration, error handling |
| 07 | [Configuration & Deployment](07-CONFIGURATION_DEPLOYMENT.md) | Environment variables, configuration profiles, dev setup, production checklist, dependencies |

---

## Quick Reference

### Architecture at a Glance

```
React UI (Vite :5173) ──HTTP/JSON──> Express Backend (:3001)
                                        ├── Claude AI (Anthropic API)
                                        ├── Databricks (Unity Catalog + SQL Warehouse + Jobs)
                                        └── AWS (EC2, S3, RDS, Lambda, CloudWatch, Cost Explorer)
```

### Operational Tiers

| Tier | Mode | What You Need |
|------|------|--------------|
| Tier 1 | Full | Claude API key + Databricks + AWS |
| Tier 2 | AI | Claude API key only |
| Tier 3 | Demo | Nothing (mock NLP engine) |

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/chat` | Main AI chat interface |
| `POST /api/chat/execute-sql` | Direct SQL execution |
| `GET /api/auth/status` | Check authentication |
| `GET /api/auth/login` | Start OAuth flow |
| `GET /api/health` | Health check |
| `GET /api/settings/status` | Configuration status |

### AI Tools (15 total)

**Data (3):** `get_schema_context`, `execute_sql`, `search_tables`
**Governance (6):** `get_table_lineage`, `get_table_permissions`, `get_audit_logs`, `get_data_classification`, `get_data_quality_metrics`, `list_governed_tags`
**Jobs (3):** `get_job_failures`, `get_job_run_logs`, `get_job_run_rca`
**AWS (3):** `describe_aws_resources`, `get_aws_health`, `get_aws_costs`

---

## Related Documentation

| Document | Location | Description |
|----------|----------|-------------|
| [Settings Management](../SETTINGS_MANAGEMENT.md) | `docs/` | Admin settings UI guide |
| [PGVector Setup](../PGVECTOR_SETUP.md) | `docs/` | PostgreSQL vector DB setup |
| [Data Quality Monitoring](../DATA_QUALITY_MONITORING.md) | `docs/` | Quality monitoring guide |
| [Lakehouse Monitoring](../LAKEHOUSE_MONITORING_INTEGRATION.md) | `docs/` | Lakehouse integration |
| [Frontend Integration](../FRONTEND_INTEGRATION.md) | `docs/` | Frontend integration guide |
| [OAuth Setup](../../OAUTH_SETUP.md) | root | OAuth configuration guide |
| [Settings Quickstart](../../SETTINGS_QUICKSTART.md) | root | Quick settings setup |
