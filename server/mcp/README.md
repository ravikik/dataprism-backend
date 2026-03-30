# DataPrism MCP Servers

DataPrism now includes **Model Context Protocol (MCP)** servers for Databricks Unity Catalog and AWS infrastructure. These servers allow tools to be used by:
- DataPrism backend (via MCP client)
- Claude Desktop app
- Any other MCP-compatible client

## Architecture

```
┌─────────────────────────┐
│   Claude Desktop or     │
│   DataPrism Backend     │
└────────┬────────────────┘
         │ MCP Protocol (stdio/SSE)
         │
    ┌────┴────┐
    │         │
┌───▼──────┐  │  ┌────▼─────┐
│Databricks│  │  │   AWS    │
│ MCP      │  │  │   MCP    │
│ Server   │  │  │  Server  │
│          │  │  │          │
│ 9 tools  │  │  │ 3 tools  │
└──────────┘  │  └──────────┘
              │
        ┌─────▼──────┐
        │ Unity Cat. │
        │ REST APIs  │
        └────────────┘
```

## Available Servers

### 1. Databricks MCP Server (`databricks-server.ts`)
**9 Unity Catalog Tools:**
- `get_schema_context` - Discover catalogs, schemas, tables
- `execute_sql` - Run SQL queries on SQL Warehouse
- `search_tables` - Search tables in a schema
- `get_table_lineage` - Track upstream/downstream dependencies
- `get_table_permissions` - View access grants
- `get_audit_logs` - Compliance audit trails
- `get_data_classification` - PII/sensitivity tags
- `get_data_quality_metrics` - Data quality scores
- `list_governed_tags` - Browse governance tags

### 2. AWS MCP Server (`aws-server.ts`)
**3 Infrastructure Tools:**
- `describe_aws_resources` - EC2, S3, RDS, Lambda
- `get_aws_health` - CloudWatch alarms
- `get_aws_costs` - Spending analysis

## Usage Modes

### Mode 1: Direct Executor (Default)
Tools are called directly via API without MCP servers. Fast and simple.

```env
USE_MCP=false  # Default
```

**Pros:**
- ✅ Simpler architecture
- ✅ Faster (no IPC overhead)
- ✅ Easier debugging

**Cons:**
- ❌ Tools only usable in DataPrism
- ❌ Cannot connect from Claude Desktop

---

### Mode 2: MCP Servers (Optional)
Tools run as standalone MCP servers connected via stdio protocol.

```env
USE_MCP=true
```

**Pros:**
- ✅ Tools reusable by Claude Desktop
- ✅ Standard MCP protocol
- ✅ Clean separation of concerns
- ✅ Other apps can connect to servers

**Cons:**
- ❌ Slight IPC overhead
- ❌ More complex architecture

## How to Enable MCP Mode

### Step 1: Enable MCP Mode
Edit `.env`:
```env
USE_MCP=true
```

### Step 2: Restart Backend
```bash
npm run dev
```

You'll see:
```
[DataPrism] MCP mode enabled - will initialize servers on first request
[DataPrism] Initializing MCP servers...
[Databricks MCP] Server running on stdio
[AWS MCP] Server running on stdio
[DataPrism] MCP servers initialized
```

**Note:** MCP servers run using `tsx`, which handles TypeScript automatically. No build step required!

## Using MCP Servers with Claude Desktop

You can connect DataPrism's MCP servers directly to Claude Desktop app!

### Configuration

Edit Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "databricks": {
      "command": "npx",
      "args": ["tsx", "/path/to/DataPrism-Backend/server/mcp/databricks-server.ts"],
      "env": {
        "DATABRICKS_HOST": "https://your-workspace.cloud.databricks.com",
        "DATABRICKS_TOKEN": "dapi-your-token-here",
        "DATABRICKS_WAREHOUSE_ID": "your-warehouse-id"
      }
    },
    "aws": {
      "command": "npx",
      "args": ["tsx", "/path/to/DataPrism-Backend/server/mcp/aws-server.ts"],
      "env": {
        "AWS_ACCESS_KEY_ID": "your-access-key",
        "AWS_SECRET_ACCESS_KEY": "your-secret-key",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

### Restart Claude Desktop
The MCP servers will auto-start when Claude launches, and you can use the 12 tools directly in Claude conversations!

**Example prompts in Claude Desktop:**
- "What catalogs are available in my Databricks workspace?"
- "Show me the lineage for toyota_analytics.reporting.sales_summary"
- "What are my AWS costs for the last 30 days?"
- "Run this SQL query: SELECT * FROM catalog.schema.table LIMIT 10"

## Tool Execution Flow

### With MCP Mode Enabled:
```
User Question
    ↓
Chat Router (chat.ts)
    ↓
Claude AI ("use tools")
    ↓
executeTool() helper
    ↓
getMCPManager().callTool()
    ↓
MCP Client (stdio transport)
    ↓
Databricks/AWS MCP Server
    ↓
Unity Catalog / AWS API
    ↓
Return result to Claude
    ↓
Claude synthesizes response
    ↓
Return to user
```

### Without MCP (Direct Executor):
```
User Question → Chat Router → Claude AI → executeTool()
    → executeToolCall() → Unity Catalog API → Return result
```

## Logging

Both modes provide comprehensive logging:

```
[DataPrism] MCP mode enabled
[MCP Client] Starting databricks server...
[Databricks MCP] Server running on stdio
[Databricks MCP] Credentials set: { hasHost: true, hasToken: true }
[MCP Client] databricks server connected
[MCP Client] Calling get_schema_context on databricks server
[Databricks MCP] Tool called: get_schema_context
[Databricks MCP] Fetching schemas from live API: toyota_production.sales
[Databricks MCP] Fetched 5 tables from live API
```

## Development

### Running Servers Standalone (Testing)
```bash
# Run Databricks server
DATABRICKS_HOST=https://... \
DATABRICKS_TOKEN=dapi... \
DATABRICKS_WAREHOUSE_ID=... \
npx tsx server/mcp/databricks-server.ts

# Run AWS server
AWS_ACCESS_KEY_ID=... \
AWS_SECRET_ACCESS_KEY=... \
AWS_REGION=us-east-1 \
npx tsx server/mcp/aws-server.ts
```

### Testing with MCP Inspector
Use Anthropic's MCP Inspector tool to test servers:
```bash
npx @modelcontextprotocol/inspector npx tsx server/mcp/databricks-server.ts
```

## Migration Path

**Current Users (Direct Executor):**
- ✅ No action needed
- ✅ Everything works as before
- ✅ `USE_MCP=false` is default

**Advanced Users (Want Claude Desktop integration):**
1. Run `npm run build`
2. Set `USE_MCP=true` in `.env`
3. Restart backend
4. Optionally: Configure Claude Desktop

## Troubleshooting

**MCP servers not starting:**
- Check that `tsx` is installed: `npm list tsx`
- Check logs in terminal for error messages
- Verify credentials in `.env` file

**Claude Desktop can't connect:**
- Check file paths in config are absolute
- Verify credentials in `env` section
- Ensure `tsx` is globally available or use full path to npx
- Check Claude Desktop logs: `tail -f ~/Library/Logs/Claude/mcp*.log`

**Both modes available:**
- Direct mode: Faster, simpler ✅
- MCP mode: Reusable, standardized ✅

Choose based on your needs! 🚀

## References

- [MCP Documentation](https://modelcontextprotocol.io)
- [Anthropic MCP SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Claude Desktop Configuration](https://docs.anthropic.com/claude/docs/model-context-protocol)
