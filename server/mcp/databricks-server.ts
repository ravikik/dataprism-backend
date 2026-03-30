#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { getMockSchemaContext, getMockQueryResult, MOCK_SCHEMAS } from '../mock-data.js';

// ── Tool Definitions ──────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'get_schema_context',
    description: 'Fetch table and column metadata for specified database schemas from Databricks Unity Catalog. Returns table names, column definitions, data types, and comments.',
    inputSchema: {
      type: 'object',
      properties: {
        schemas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of schema identifiers in "catalog.schema" format, e.g. ["toyota_production.sales"]',
        },
      },
      required: ['schemas'],
    },
  },
  {
    name: 'execute_sql',
    description: 'Execute a SQL query on the Databricks SQL warehouse. Returns column names and row data.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'A valid Databricks / Spark SQL query to execute',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'search_tables',
    description: 'Search for tables in a Databricks Unity Catalog schema. Returns a list of table names with comments.',
    inputSchema: {
      type: 'object',
      properties: {
        catalog: { type: 'string', description: 'Catalog name to search within' },
        schema: { type: 'string', description: 'Schema name to search within' },
      },
      required: ['catalog', 'schema'],
    },
  },
  {
    name: 'get_table_lineage',
    description: 'Track data lineage for a table. Returns upstream sources and downstream consumers.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Full table name (catalog.schema.table)' },
        direction: {
          type: 'string',
          enum: ['upstream', 'downstream', 'both'],
          description: 'Direction of lineage to retrieve (default: both)',
        },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'get_table_permissions',
    description: 'View access grants and permissions for tables, schemas, or catalogs.',
    inputSchema: {
      type: 'object',
      properties: {
        object_name: { type: 'string', description: 'Full object name' },
        object_type: {
          type: 'string',
          enum: ['catalog', 'schema', 'table'],
          description: 'Type of object',
        },
      },
      required: ['object_name', 'object_type'],
    },
  },
  {
    name: 'get_audit_logs',
    description: 'Retrieve audit trails of data access and modifications.',
    inputSchema: {
      type: 'object',
      properties: {
        object_name: { type: 'string', description: 'Optional: filter by object name' },
        event_type: {
          type: 'string',
          enum: ['all', 'read', 'write', 'grant', 'create', 'delete'],
          description: 'Type of events to retrieve',
        },
        time_range: {
          type: 'string',
          enum: ['last_24_hours', 'last_7_days', 'last_30_days'],
          description: 'Time range for audit logs',
        },
      },
      required: ['event_type'],
    },
  },
  {
    name: 'get_data_classification',
    description: 'Check PII tags, compliance labels, and sensitivity levels for tables and columns.',
    inputSchema: {
      type: 'object',
      properties: {
        object_name: { type: 'string', description: 'Full table name' },
        include_columns: {
          type: 'boolean',
          description: 'Include column-level classification (default: true)',
        },
      },
      required: ['object_name'],
    },
  },
  {
    name: 'get_data_quality_metrics',
    description: 'Monitor data quality scores including completeness, freshness, validity, and consistency.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Full table name' },
        metric_type: {
          type: 'string',
          enum: ['all', 'completeness', 'freshness', 'validity', 'consistency'],
          description: 'Type of quality metric to retrieve',
        },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'list_governed_tags',
    description: 'Browse governance tags by category (security, compliance, quality, business).',
    inputSchema: {
      type: 'object',
      properties: {
        catalog: { type: 'string', description: 'Optional: filter by catalog' },
        tag_category: {
          type: 'string',
          enum: ['all', 'security', 'compliance', 'quality', 'business'],
          description: 'Category of tags to list',
        },
      },
    },
  },
];

// ── Server Implementation ──────────────────────────────────────────

interface DatabricksCredentials {
  host: string;
  token: string;
  warehouseId?: string;
}

class DatabricksServer {
  private server: Server;
  private credentials: DatabricksCredentials | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'databricks-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  setCredentials(credentials: DatabricksCredentials) {
    this.credentials = credentials;
    console.error('[Databricks MCP] Credentials set:', {
      hasHost: !!credentials.host,
      hasToken: !!credentials.token,
      hasWarehouseId: !!credentials.warehouseId,
    });
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`[Databricks MCP] Tool called: ${name}`);

      try {
        let result: string;

        switch (name) {
          case 'get_schema_context':
            result = await this.handleGetSchemaContext(args as any);
            break;
          case 'execute_sql':
            result = await this.handleExecuteSQL(args as any);
            break;
          case 'search_tables':
            result = await this.handleSearchTables(args as any);
            break;
          case 'get_table_lineage':
            result = await this.handleGetTableLineage(args as any);
            break;
          case 'get_table_permissions':
            result = await this.handleGetTablePermissions(args as any);
            break;
          case 'get_audit_logs':
            result = this.handleGetAuditLogs(args as any);
            break;
          case 'get_data_classification':
            result = await this.handleGetDataClassification(args as any);
            break;
          case 'get_data_quality_metrics':
            result = this.handleGetDataQualityMetrics(args as any);
            break;
          case 'list_governed_tags':
            result = this.handleListGovernedTags(args as any);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: 'text', text: result }],
        };
      } catch (error: any) {
        console.error(`[Databricks MCP] Error in ${name}:`, error.message);
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  // ── Tool Handlers ────────────────────────────────────────────────

  private async handleGetSchemaContext(input: { schemas: string[] }): Promise<string> {
    const { schemas } = input;
    if (!schemas?.length) return 'No schemas specified';

    // Try live API if credentials available
    if (this.credentials?.host && this.credentials?.token) {
      console.error(`[Databricks MCP] Fetching schemas from live API: ${schemas.join(', ')}`);
      try {
        const results: string[] = [];
        for (const schemaPath of schemas) {
          const [catalog, schema] = schemaPath.split('.');
          if (!catalog || !schema) continue;

          const apiUrl = `${this.credentials.host}/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`;
          const tablesRes = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${this.credentials.token}` },
          });

          if (!tablesRes.ok) {
            console.error(`[Databricks MCP] API error: ${tablesRes.status}`);
            continue;
          }

          const tablesData = await tablesRes.json();
          const tables = tablesData.tables || [];

          for (const t of tables) {
            const fullName = t.full_name || `${catalog}.${schema}.${t.name}`;
            const detailRes = await fetch(
              `${this.credentials.host}/api/2.1/unity-catalog/tables/${encodeURIComponent(fullName)}`,
              { headers: { Authorization: `Bearer ${this.credentials.token}` } }
            );
            if (!detailRes.ok) continue;
            const detail = await detailRes.json();
            const cols = (detail.columns || [])
              .map((c: any) => `${c.name} ${c.type_text || c.type_name || 'STRING'}${c.comment ? ` -- ${c.comment}` : ''}`)
              .join(', ');
            const comment = detail.comment ? ` -- ${detail.comment}` : '';
            results.push(`Table: ${fullName}${comment} (columns: ${cols})`);
          }
        }
        if (results.length > 0) {
          console.error(`[Databricks MCP] Fetched ${results.length} tables from live API`);
          return results.join('\n');
        }
      } catch (err: any) {
        console.error(`[Databricks MCP] Live API failed:`, err.message);
      }
    }

    // Fallback to mock
    console.error('[Databricks MCP] Using mock schema context');
    return getMockSchemaContext(schemas) || 'No tables found for the specified schemas.';
  }

  private async handleExecuteSQL(input: { sql: string }): Promise<string> {
    const { sql } = input;
    if (!sql) return 'No SQL query provided';

    // Try live API
    if (this.credentials?.host && this.credentials?.token && this.credentials?.warehouseId) {
      try {
        const response = await fetch(`${this.credentials.host}/api/2.0/sql/statements`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            statement: sql,
            warehouse_id: this.credentials.warehouseId,
            wait_timeout: '30s',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status?.state === 'SUCCEEDED') {
            const columns = (data.manifest?.schema?.columns || []).map((c: any) => c.name);
            const rows = data.result?.data_array || [];
            return JSON.stringify({ columns, rows, rowCount: rows.length });
          }
        }
      } catch (err: any) {
        console.error(`[Databricks MCP] SQL execution failed:`, err.message);
      }
    }

    // Fallback to mock
    const result = getMockQueryResult(sql);
    return JSON.stringify(result);
  }

  private async handleSearchTables(input: { catalog: string; schema: string }): Promise<string> {
    const { catalog, schema } = input;

    // Try live API
    if (this.credentials?.host && this.credentials?.token) {
      try {
        const res = await fetch(
          `${this.credentials.host}/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`,
          { headers: { Authorization: `Bearer ${this.credentials.token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const tables = (data.tables || []).map((t: any) => ({
            name: t.name,
            fullName: t.full_name,
            comment: t.comment || '',
            tableType: t.table_type || 'MANAGED',
          }));
          if (tables.length > 0) return JSON.stringify(tables);
        }
      } catch (err: any) {
        console.error(`[Databricks MCP] Search tables failed:`, err.message);
      }
    }

    // Fallback to mock
    const mockSchemas = MOCK_SCHEMAS[catalog];
    if (!mockSchemas) return `No catalog found: ${catalog}`;
    const schemaMatch = mockSchemas.find((s: any) => s.name === schema);
    if (!schemaMatch) return `No schema found: ${catalog}.${schema}`;

    const context = getMockSchemaContext([`${catalog}.${schema}`]);
    const tables = context.split('\n').filter(Boolean).map(line => {
      const nameMatch = line.match(/Table:\s+(\S+)/);
      const commentMatch = line.match(/-- (.+?) \(columns/);
      return {
        name: nameMatch?.[1]?.split('.').pop() || 'unknown',
        fullName: nameMatch?.[1] || 'unknown',
        comment: commentMatch?.[1] || '',
      };
    });

    return JSON.stringify(tables);
  }

  private async handleGetTableLineage(input: { table_name: string; direction?: string }): Promise<string> {
    const { table_name, direction = 'both' } = input;

    // Try live API
    if (this.credentials?.host && this.credentials?.token) {
      try {
        const response = await fetch(
          `${this.credentials.host}/api/2.1/unity-catalog/lineage-by-name/table/${encodeURIComponent(table_name)}?direction=${direction}`,
          { headers: { Authorization: `Bearer ${this.credentials.token}` } }
        );
        if (response.ok) {
          const data = await response.json();
          return JSON.stringify(data);
        }
      } catch (err: any) {
        console.error(`[Databricks MCP] Lineage fetch failed:`, err.message);
      }
    }

    // Fallback to mock
    return this.getMockTableLineage(table_name, direction);
  }

  private async handleGetTablePermissions(input: { object_name: string; object_type: string }): Promise<string> {
    const { object_name, object_type } = input;

    // Try live API
    if (this.credentials?.host && this.credentials?.token) {
      try {
        const response = await fetch(
          `${this.credentials.host}/api/2.1/unity-catalog/permissions/${object_type}/${encodeURIComponent(object_name)}`,
          { headers: { Authorization: `Bearer ${this.credentials.token}` } }
        );
        if (response.ok) {
          const data = await response.json();
          return JSON.stringify(data);
        }
      } catch (err: any) {
        console.error(`[Databricks MCP] Permissions fetch failed:`, err.message);
      }
    }

    // Fallback to mock
    return this.getMockTablePermissions(object_name, object_type);
  }

  private handleGetAuditLogs(input: { object_name?: string; event_type: string; time_range?: string }): string {
    const { object_name, event_type, time_range = 'last_7_days' } = input;
    return this.getMockAuditLogs(object_name, event_type, time_range);
  }

  private async handleGetDataClassification(input: { object_name: string; include_columns?: boolean }): Promise<string> {
    const { object_name, include_columns = true } = input;

    // Try live API
    if (this.credentials?.host && this.credentials?.token) {
      try {
        const response = await fetch(
          `${this.credentials.host}/api/2.1/unity-catalog/tables/${encodeURIComponent(object_name)}`,
          { headers: { Authorization: `Bearer ${this.credentials.token}` } }
        );
        if (response.ok) {
          const data = await response.json();
          const classification = {
            table: object_name,
            tags: data.properties || {},
            columns: include_columns ? (data.columns || []).map((c: any) => ({
              name: c.name,
              type: c.type_name,
              tags: c.tags || [],
            })) : [],
          };
          return JSON.stringify(classification);
        }
      } catch (err: any) {
        console.error(`[Databricks MCP] Classification fetch failed:`, err.message);
      }
    }

    // Fallback to mock
    return this.getMockDataClassification(object_name, include_columns);
  }

  private handleGetDataQualityMetrics(input: { table_name: string; metric_type?: string }): string {
    const { table_name, metric_type = 'all' } = input;
    return this.getMockDataQualityMetrics(table_name, metric_type);
  }

  private handleListGovernedTags(input: { catalog?: string; tag_category?: string }): string {
    const { catalog, tag_category = 'all' } = input;
    return this.getMockGovernedTags(catalog, tag_category);
  }

  // ── Mock Data Methods (imported from executor.ts logic) ────────────

  private getMockTableLineage(table_name: string, direction: string): string {
    const lineageData: Record<string, any> = {
      'toyota_analytics.reporting.sales_summary': {
        upstream: [
          { table: 'toyota_production.sales.transactions', type: 'table', relationship: 'source' },
          { table: 'toyota_production.sales.dealers', type: 'table', relationship: 'dimension' },
        ],
        downstream: [
          { table: 'toyota_analytics.reporting.executive_dashboard', type: 'view', relationship: 'derived' },
          { table: 'toyota_analytics.reporting.monthly_kpis', type: 'table', relationship: 'aggregated' },
        ],
      },
    };

    const data = lineageData[table_name] || { upstream: [], downstream: [], message: 'No lineage data available' };
    if (direction === 'upstream') return JSON.stringify({ table: table_name, upstream: data.upstream });
    if (direction === 'downstream') return JSON.stringify({ table: table_name, downstream: data.downstream });
    return JSON.stringify({ table: table_name, ...data });
  }

  private getMockTablePermissions(object_name: string, object_type: string): string {
    return JSON.stringify({
      object: object_name,
      type: object_type,
      owner: 'data_engineering',
      grants: [
        { principal: 'data_analysts', type: 'GROUP', privileges: ['SELECT', 'USE_SCHEMA'] },
        { principal: 'etl_service_account', type: 'SERVICE_PRINCIPAL', privileges: ['SELECT', 'MODIFY'] },
      ],
    });
  }

  private getMockAuditLogs(object_name: string | undefined, event_type: string, time_range: string): string {
    const now = new Date();
    const logs = [
      {
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        event: 'READ',
        object: object_name || 'toyota_production.sales.transactions',
        user: 'alice@toyota.com',
        action: 'SELECT query executed',
      },
    ];
    return JSON.stringify({ time_range, event_type, total_events: logs.length, events: logs });
  }

  private getMockDataClassification(object_name: string, include_columns: boolean): string {
    const data: any = {
      table: object_name,
      classification_level: 'CONFIDENTIAL',
      tags: ['PII', 'GDPR'],
      contains_sensitive_data: true,
    };
    if (include_columns) {
      data.columns = [
        { name: 'customer_id', classification: 'PUBLIC', tags: [] },
        { name: 'email', classification: 'CONFIDENTIAL', tags: ['PII', 'EMAIL'] },
      ];
    }
    return JSON.stringify(data);
  }

  private getMockDataQualityMetrics(table_name: string, metric_type: string): string {
    const metrics = {
      table: table_name,
      overall_score: 92.5,
      completeness: { score: 95.2, null_percentage: 4.8 },
      freshness: { score: 98.0, lag_minutes: 15 },
      validity: { score: 89.8, invalid_records: 1024 },
      consistency: { score: 94.0, duplicate_records: 45 },
    };
    return JSON.stringify(metric_type === 'all' ? metrics : { table: table_name, [metric_type]: (metrics as any)[metric_type] });
  }

  private getMockGovernedTags(catalog: string | undefined, tag_category: string): string {
    const tags = [
      { name: 'PII', category: 'security', description: 'Personally Identifiable Information', usage_count: 15 },
      { name: 'GDPR', category: 'compliance', description: 'GDPR compliance requirement', usage_count: 8 },
      { name: 'business_critical', category: 'business', description: 'Business-critical data asset', usage_count: 23 },
    ];
    const filtered = tag_category === 'all' ? tags : tags.filter(t => t.category === tag_category);
    return JSON.stringify({ catalog: catalog || 'all', category: tag_category, tags: filtered });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Databricks MCP] Server running on stdio');
  }
}

// ── Entry Point ────────────────────────────────────────────────────

const server = new DatabricksServer();

// Allow credentials to be set via environment variables
if (process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN) {
  server.setCredentials({
    host: process.env.DATABRICKS_HOST,
    token: process.env.DATABRICKS_TOKEN,
    warehouseId: process.env.DATABRICKS_WAREHOUSE_ID,
  });
}

server.run().catch(console.error);
