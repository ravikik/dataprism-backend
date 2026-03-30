# DataPrism - Configuration & Deployment Specification

**Version:** 1.0.0
**Last Updated:** 2026-03-13

---

## 1. Environment Variables

### 1.1 Required Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | `dataprism-dev-secret-*` | Session encryption key. **Must change in production** |

### 1.2 AI Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Claude AI API key (starts with `sk-ant-`) |
| `CLAUDE_API_KEY` | — | Alias for `ANTHROPIC_API_KEY` |

### 1.3 Databricks Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABRICKS_HOST` | — | Workspace URL (e.g., `https://myworkspace.cloud.databricks.com`) |
| `DATABRICKS_TOKEN` | — | Personal access token (`dapi-...`) |
| `DATABRICKS_WAREHOUSE_ID` | — | SQL Warehouse ID |

### 1.4 Databricks OAuth

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABRICKS_OAUTH_CLIENT_ID` | — | OAuth app registration client ID |
| `DATABRICKS_OAUTH_CLIENT_SECRET` | — | OAuth app registration client secret |
| `DATABRICKS_OAUTH_REDIRECT_URI` | `http://localhost:5173/auth/callback` | OAuth callback URL |

### 1.5 AWS Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | — | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | — | IAM secret key |
| `AWS_REGION` | `us-east-1` | Default AWS region |

### 1.6 Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `NODE_ENV` | `development` | Environment (`development` / `production`) |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS |
| `ADMIN_TOKEN` | — | Admin UI access token (required in production) |
| `USE_MCP` | `false` | Enable MCP server mode |

### 1.7 Cache Configuration (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | — | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_PASSWORD` | — | Redis authentication password |

### 1.8 Vector Database (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `VECTOR_DB_TYPE` | `pgvector` | Vector DB type: `pgvector`, `pinecone`, `qdrant` |
| `POSTGRES_HOST` | — | PostgreSQL hostname |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | — | PostgreSQL password |
| `POSTGRES_DATABASE` | — | PostgreSQL database name |
| `POSTGRES_SSL` | `false` | Enable SSL for PostgreSQL |
| `PINECONE_API_KEY` | — | Pinecone API key |
| `PINECONE_ENVIRONMENT` | — | Pinecone environment |
| `PINECONE_INDEX` | — | Pinecone index name |

---

## 2. Configuration Profiles

### 2.1 Minimal (Demo Mode - Tier 3)

No environment variables needed. Runs with mock NLP engine and pre-computed data.

```env
# .env (empty or minimal)
PORT=3001
SESSION_SECRET=dev-secret
FRONTEND_URL=http://localhost:5173
```

### 2.2 AI Mode (Tier 2)

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
PORT=3001
SESSION_SECRET=dev-secret
FRONTEND_URL=http://localhost:5173
```

### 2.3 Full Mode (Tier 1)

```env
# AI
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx

# Databricks
DATABRICKS_HOST=https://myworkspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi-xxxxxxxxxxxxxxxx
DATABRICKS_WAREHOUSE_ID=abc123def456

# OAuth (recommended over PAT)
DATABRICKS_OAUTH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DATABRICKS_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABRICKS_OAUTH_REDIRECT_URI=http://localhost:5173/auth/callback

# AWS
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1

# Server
PORT=3001
NODE_ENV=development
SESSION_SECRET=change-this-in-production-use-64-chars-minimum
FRONTEND_URL=http://localhost:5173
ADMIN_TOKEN=your-secure-admin-token
```

---

## 3. Development Setup

### 3.1 Prerequisites

- Node.js 18+ (ES2020 support)
- npm or yarn

### 3.2 Backend Setup

```bash
cd DataPrism-Backend
npm install
cp .env.example .env    # Configure environment variables
npm run dev             # Starts on :3001 with hot reload (tsx watch)
```

**npm Scripts:**

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx watch server/index.ts` | Development with hot reload |
| `start` | `tsx server/index.ts` | Production start |
| `mcp:databricks` | `tsx server/mcp/databricks-server.ts` | Run Databricks MCP server |
| `mcp:aws` | `tsx server/mcp/aws-server.ts` | Run AWS MCP server |

### 3.3 Frontend Setup

```bash
cd DataPrism-UI
npm install
npm run dev             # Starts on :5173 with HMR
```

**npm Scripts:**

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Development with HMR |
| `build` | `tsc && vite build` | TypeScript check + production build |
| `preview` | `vite preview` | Preview production build |

### 3.4 Running Both

Start backend and frontend in separate terminals:

```bash
# Terminal 1: Backend
cd DataPrism-Backend && npm run dev

# Terminal 2: Frontend
cd DataPrism-UI && npm run dev
```

Frontend at `http://localhost:5173` proxies API calls to `http://localhost:3001`.

---

## 4. Settings Management

### 4.1 Dual Configuration Sources

DataPrism uses two configuration sources with the following priority:

1. **Environment variables** (`.env` file) — Primary, always loaded
2. **Settings file** (`.dataprism-settings.json`) — For runtime changes via admin UI

The `getEffectiveSettings()` function merges both, with environment variables taking precedence.

### 4.2 Admin Settings UI

Accessible at `http://localhost:3001/admin/settings`:
- Web-based configuration interface
- Protected by `ADMIN_TOKEN` in production
- Open access in development mode
- Test connections before saving
- Reset to environment variable defaults

### 4.3 Settings API

All settings endpoints require admin authentication and are documented in the API spec.

---

## 5. Production Considerations

### 5.1 Security Checklist

- [ ] Set strong `SESSION_SECRET` (64+ characters)
- [ ] Set `NODE_ENV=production`
- [ ] Set `ADMIN_TOKEN` for admin UI protection
- [ ] Use OAuth instead of PAT for Databricks authentication
- [ ] Set `FRONTEND_URL` to production domain
- [ ] Enable HTTPS (reverse proxy: nginx, Cloudflare, etc.)
- [ ] Add `.dataprism-settings.json` to `.gitignore`
- [ ] Remove or restrict `x-anthropic-api-key` header passthrough
- [ ] Restrict CORS origin to production frontend domain

### 5.2 Session Store

The default Express session uses in-memory store. For production:
- Use `connect-redis` for Redis-backed sessions
- Or `connect-pg-simple` for PostgreSQL-backed sessions
- Required for multi-instance deployments

### 5.3 Environment Differences

| Behavior | Development | Production |
|----------|------------|-----------|
| Admin auth | Disabled (open access) | `ADMIN_TOKEN` required |
| Session cookie secure | `false` | `true` (HTTPS only) |
| Session cookie sameSite | `lax` | `strict` |
| CORS origin | `localhost:5173` | `FRONTEND_URL` |
| Token logging | First 10 chars | Should be disabled |

---

## 6. TypeScript Configuration

### 6.1 Backend (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "."
  }
}
```

### 6.2 Frontend (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true
  }
}
```

---

## 7. Dependencies Summary

### 7.1 Backend Production Dependencies

| Package | Purpose |
|---------|---------|
| `express` | Web framework |
| `cors` | Cross-origin resource sharing |
| `cookie-parser` | Cookie handling |
| `express-session` | Session management |
| `dotenv` | Environment variable loading |
| `@anthropic-ai/sdk` | Claude AI API client |
| `@modelcontextprotocol/sdk` | MCP tool servers |
| `@aws-sdk/client-ec2` | AWS EC2 operations |
| `@aws-sdk/client-s3` | AWS S3 operations |
| `@aws-sdk/client-rds` | AWS RDS operations |
| `@aws-sdk/client-lambda` | AWS Lambda operations |
| `@aws-sdk/client-cloudwatch` | AWS CloudWatch operations |
| `@aws-sdk/client-cost-explorer` | AWS Cost Explorer |

### 7.2 Frontend Production Dependencies

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `@mui/material` | UI component library |
| `@mui/icons-material` | Material icons |
| `@emotion/react` / `@emotion/styled` | CSS-in-JS |
| `recharts` | Data visualization |
| `prism-react-renderer` | Code syntax highlighting |
