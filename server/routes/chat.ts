import { Router, type Request, type Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import type { Session } from 'express-session';
import { getMockSchemaContext, getMockQueryResult, getAllMockSchemaContext } from '../mock-data.js';
import { ALL_TOOLS, getAvailableTools } from '../mcp/tools.js';
import { executeToolCall, type ToolCredentials } from '../mcp/executor.js';
import { getMCPManager, initializeMCP } from '../mcp/mcp-client.js';
import { answerQuestion } from '../nlp/mock-engine.js';
import { ensureValidToken, type DatabricksOAuthConfig, type OAuthTokens, type UserInfo } from '../auth/oauth.js';

// Extend Express Request interface
declare module 'express-serve-static-core' {
  interface Request {
    session: Session & {
      oauthTokens?: OAuthTokens;
      userInfo?: UserInfo;
      oauthState?: string;
    };
  }
}

async function getDatabricksCredentials(req: Request): Promise<{ host: string; token: string } | null> {
  // Priority 1: Try OAuth tokens from session first
  if (req.session.oauthTokens && process.env.DATABRICKS_HOST) {
    try {
      // OAuth config for token refresh
      const oauthConfig: DatabricksOAuthConfig | null = (() => {
        const clientId = process.env.DATABRICKS_OAUTH_CLIENT_ID;
        const clientSecret = process.env.DATABRICKS_OAUTH_CLIENT_SECRET;
        const host = process.env.DATABRICKS_HOST;
        const redirectUri = process.env.DATABRICKS_OAUTH_REDIRECT_URI || 'http://localhost:5173/auth/callback';

        if (!clientId || !clientSecret || !host) return null;
        return { clientId, clientSecret, host, redirectUri };
      })();

      if (oauthConfig) {
        // Ensure token is valid, refresh if needed
        const validTokens = await ensureValidToken(oauthConfig, req.session.oauthTokens);
        
        // Update session if token was refreshed
        if (validTokens !== req.session.oauthTokens) {
          req.session.oauthTokens = validTokens;
        }

        console.log('[Chat] Using OAuth credentials');
        return {
          host: process.env.DATABRICKS_HOST,
          token: validTokens.access_token,
        };
      }
    } catch (err: any) {
      console.error('[Chat] OAuth token refresh failed:', err.message);
      // Fall through to next option
    }
  }

  // Priority 2: Backend .env configuration (preferred for non-OAuth)
  const envHost = process.env.DATABRICKS_HOST;
  const envToken = process.env.DATABRICKS_TOKEN;
  if (envHost && envToken) {
    console.log('[Chat] Using Databricks credentials from .env');
    console.log('[Chat] Host:', envHost);
    console.log('[Chat] Token prefix:', envToken.substring(0, 10) + '...');
    return { host: envHost.replace(/\/+$/, ''), token: envToken };
  }

  // Priority 3: Frontend headers as fallback (legacy Settings)
  const headerHost = req.headers['x-databricks-host'] as string;
  const headerToken = req.headers['x-databricks-token'] as string;
  if (headerHost && headerToken) {
    console.log('[Chat] Using Databricks credentials from frontend headers');
    return { host: headerHost.replace(/\/+$/, ''), token: headerToken };
  }

  console.log('[Chat] No Databricks credentials found');
  return null;
}

function getDatabricksWarehouseId(req: Request): string | undefined {
  // Priority 1: Backend .env configuration (preferred)
  const envWarehouse = process.env.DATABRICKS_WAREHOUSE_ID;
  if (envWarehouse) {
    console.log('[Chat] Using Databricks Warehouse ID from .env:', envWarehouse);
    return envWarehouse;
  }

  // Priority 2: Frontend headers as fallback (legacy Settings)
  const headerWarehouse = req.headers['x-databricks-warehouse'] as string;
  if (headerWarehouse) {
    console.log('[Chat] Using Databricks Warehouse ID from frontend headers:', headerWarehouse);
    return headerWarehouse;
  }

  console.log('[Chat] No Databricks Warehouse ID found');
  return undefined;
}

function getAWSHeaders(req: Request): { accessKey: string; secretKey: string; region: string } | null {
  // Try to get credentials from headers first (for frontend-provided credentials)
  let accessKey = req.headers['x-aws-access-key'] as string;
  let secretKey = req.headers['x-aws-secret-key'] as string;
  
  // Fallback to environment variables if not provided in headers
  if (!accessKey && process.env.AWS_ACCESS_KEY_ID) {
    accessKey = process.env.AWS_ACCESS_KEY_ID;
  }
  if (!secretKey && process.env.AWS_SECRET_ACCESS_KEY) {
    secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  }
  
  if (!accessKey || !secretKey) return null;
  const region = (req.headers['x-aws-region'] as string) || process.env.AWS_REGION || 'us-east-1';
  return { accessKey, secretKey, region };
}

function getClaudeClient(req: Request, defaultClient: Anthropic | null): Anthropic | null {
  const runtimeKey = (req.headers['x-anthropic-api-key'] as string)?.trim();
  if (runtimeKey && runtimeKey.startsWith('sk-ant-')) {
    return new Anthropic({ apiKey: runtimeKey });
  }
  return defaultClient;
}

export function createChatRouter(): Router {
  const router = Router();

  const rawApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const apiKey = rawApiKey?.trim();
  let defaultClaude: Anthropic | null = null;

  if (apiKey && apiKey.startsWith('sk-ant-')) {
    defaultClaude = new Anthropic({ apiKey });
    console.log('[DataPrism] Claude AI initialized');
  } else {
    console.log('[DataPrism] No API key — running in demo mode (mock NLP engine)');
  }

  // ── MCP Server Mode (Optional) ──────────────────────────────────
  const USE_MCP = process.env.USE_MCP === 'true';
  let mcpInitialized = false;

  if (USE_MCP) {
    console.log('[DataPrism] MCP mode enabled - will initialize servers on first request');
  } else {
    console.log('[DataPrism] Using direct executor mode (set USE_MCP=true for MCP servers)');
  }

  // ── Main Chat Endpoint ──────────────────────────────────────────
  router.post('/chat', async (req: Request, res: Response) => {
    const { question, selectedSchemas, history, conversationSummary } = req.body as {
      question: string;
      selectedSchemas?: string[];
      history: { role: 'user' | 'assistant'; content: string }[];
      conversationSummary?: string;
    };

    if (!question) { res.status(400).json({ error: 'Missing question' }); return; }

    const claude = getClaudeClient(req, defaultClaude);
    const dbCreds = await getDatabricksCredentials(req);
    const warehouseId = getDatabricksWarehouseId(req);
    const awsCreds = getAWSHeaders(req);

    // ── Tier 3: No Claude API key → mock NLP engine ──
    if (!claude) {
      console.log('[DataPrism] Using mock NLP engine (no API key)');
      const answer = answerQuestion(question);
      res.json({
        type: answer.type,
        explanation: answer.explanation,
        sql: answer.sql,
        results: answer.results,
        tokenUsage: { inputTokens: 0, outputTokens: 0, model: 'mock-nlp' },
        mode: 'demo',
      });
      return;
    }

    // ── Tier 1 & 2: Claude-powered response ──
    const credentials: ToolCredentials = {
      host: dbCreds?.host,
      token: dbCreds?.token,
      warehouseId: warehouseId,
      awsAccessKey: awsCreds?.accessKey,
      awsSecretKey: awsCreds?.secretKey,
      awsRegion: awsCreds?.region,
    };

    const hasLiveCredentials = !!dbCreds || !!awsCreds;

    // ── Initialize MCP servers if enabled (lazy initialization) ──
    if (USE_MCP && hasLiveCredentials && !mcpInitialized) {
      try {
        console.log('[DataPrism] Initializing MCP servers...');
        await initializeMCP(credentials);
        mcpInitialized = true;
        console.log('[DataPrism] MCP servers initialized');
      } catch (err: any) {
        console.error('[DataPrism] MCP initialization failed:', err.message);
        console.log('[DataPrism] Falling back to direct executor mode');
      }
    }

    // ── Helper: Execute tool via MCP or direct executor ──
    const executeTool = async (toolName: string, toolInput: any, toolId: string) => {
      if (USE_MCP && mcpInitialized) {
        const mcpManager = getMCPManager();
        if (mcpManager.isConnected()) {
          try {
            const result = await mcpManager.callTool(toolName, toolInput);
            return { type: 'tool_result' as const, tool_use_id: toolId, content: result };
          } catch (err: any) {
            console.error(`[DataPrism] MCP tool call failed, falling back to direct:`, err.message);
          }
        }
      }
      // Fallback to direct executor
      return await executeToolCall({ id: toolId, name: toolName, input: toolInput }, credentials);
    };
    const availableTools = hasLiveCredentials
      ? getAvailableTools(!!awsCreds, !!dbCreds)
      : ALL_TOOLS; // Provide all tools even in mock — executor falls back to mock data

    // Build capability description
    const capabilities: string[] = [];
    if (dbCreds) {
      capabilities.push('- Databricks SQL: Generate and execute SQL queries against the connected warehouse');
      capabilities.push('- Schema exploration: Search and inspect tables in Unity Catalog');
      capabilities.push('- Unity Catalog Governance: Data lineage tracking, access permissions, audit logs');
      capabilities.push('- Data Classification: View PII tags, compliance labels, and sensitivity levels');
      capabilities.push('- Data Quality: Monitor completeness, freshness, validity, and consistency metrics');
      capabilities.push('- Governance Tags: List and search security, compliance, quality, and business tags');
      capabilities.push('- AI Column Enrichment: Generate intelligent column descriptions and apply classification tags to Unity Catalog tables');
      capabilities.push('- Job Failure Analysis: Analyze failed Databricks jobs/workflows, error patterns, and failure rates');
      capabilities.push('- Job Run Logs: Fetch detailed driver logs, stderr, Spark events, and cluster events for specific job runs');
      capabilities.push('- Root Cause Analysis: Automated RCA for job failures with severity, diagnosis, and step-by-step remediation');
    } else {
      capabilities.push('- SQL generation: Generate SQL queries against the available schema (demo data available)');
      capabilities.push('- Schema exploration: Browse the available mock data catalog');
      capabilities.push('- Governance features: Explore mock lineage, permissions, and data quality (demo mode)');
      capabilities.push('- Job Failure Analysis: Analyze job failures, logs, and root cause analysis (demo mode)');
    }
    if (awsCreds) {
      capabilities.push('- AWS infrastructure: Describe EC2, S3, RDS, Lambda resources');
      capabilities.push('- AWS health: Check CloudWatch alarms, service health');
      capabilities.push('- AWS costs: Spending breakdowns and trends');
    }
    if (selectedSchemas?.length) {
      capabilities.push(`- Selected schemas: ${selectedSchemas.join(', ')}`);
    }

    // Only use mock schema context when there are no live credentials
    const schemaContext = hasLiveCredentials
      ? '**NO SCHEMA DATA PROVIDED** - You MUST use the get_schema_context tool to discover available catalogs, schemas, and tables before answering any data-related questions. Do not make assumptions about available data.'
      : (selectedSchemas?.length
          ? getMockSchemaContext(selectedSchemas)
          : getAllMockSchemaContext());

    const conversationContext = conversationSummary
      ? `\n\nConversation Context (previous queries, results, and errors):\n${conversationSummary}`
      : '';

    // Get current date for context
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentDateReadable = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const systemPrompt = `You are DataPrism AI, an intelligent data platform assistant. You help users explore data, generate SQL queries, and answer analytical questions with strong governance and compliance capabilities.

**Current Date: ${currentDateReadable} (${currentDate})**

Your capabilities:
${capabilities.join('\n')}${conversationContext}

Available schema context:
${schemaContext}

Governance Tools Available:
- get_table_lineage: Track data lineage (upstream sources, downstream consumers)
- get_table_permissions: View access grants and permissions for tables/schemas/catalogs
- get_audit_logs: Retrieve audit trails of data access and modifications
- get_data_classification: Check PII tags, compliance labels, and sensitivity levels
- get_data_quality_metrics: Monitor data quality scores and validation rules
- list_governed_tags: Browse governance tags by category (security, compliance, quality, business)

AI Column Enrichment Tools:
- generate_column_descriptions: Fetch detailed column metadata, sample values, and distinct counts for a table. Use this first to understand columns before generating descriptions.
- update_column_descriptions: Write AI-generated descriptions (comments) to Unity Catalog columns. Generates clear, business-friendly descriptions based on column name, type, and sample data.
- update_column_tags: Apply AI-driven classification tags to columns. Tag categories include: pii (email, phone, ssn, name, address), sensitivity (public, internal, confidential, restricted), domain (financial, customer, product, operational, temporal), and compliance (gdpr, hipaa, pci).

Job Analysis Tools:
- get_job_failures: Analyze Databricks job/workflow failures, error patterns, and failure rates
- get_job_run_logs: Fetch detailed logs (driver, stderr, Spark events, cluster events) for a specific job run
- get_job_run_rca: Root cause analysis for a failed run — severity, diagnosis, historical patterns, and step-by-step remediation

Rules:
- **CRITICAL**: If the schema context says "NO SCHEMA DATA PROVIDED", you MUST use get_schema_context tool first - you cannot answer without it.
- Use the appropriate tools to answer questions. You can use multiple tools in sequence.
- For schema discovery: When asked about catalogs, schemas, or tables, ALWAYS use the get_schema_context tool first to see what's available.
- For SQL questions: After discovering the schema, generate SQL and use execute_sql to run queries and include results.
- For governance questions: use lineage, permissions, audit logs, or classification tools as appropriate.
- For job failure questions: use get_job_failures first, then get_job_run_logs for detailed logs, then get_job_run_rca for root cause analysis and fix recommendations. Always provide actionable remediation steps.
- For AI column enrichment: When asked to generate descriptions or tag columns, ALWAYS call generate_column_descriptions first to fetch metadata and sample data. Then analyze the column names, types, sample values, and distinct counts to craft accurate descriptions. Finally, call update_column_descriptions and/or update_column_tags. For descriptions, write clear business-friendly explanations. For tags, classify PII (email, phone, ssn, name, address, ip), sensitivity level, data domain, and compliance requirements.
- For infrastructure questions: use describe_aws_resources, get_aws_health, or get_aws_costs.
- All operations are READ-ONLY except for AI column enrichment (update_column_descriptions, update_column_tags) which can write metadata to Unity Catalog.
- For follow-up questions, use conversation context to resolve references like "that table" or "those results".
- IMPORTANT: When you generate SQL, always use the execute_sql tool to run it and include the results in your response.

Writing style:
- Write in clear, conversational natural language.
- Summarize findings in 2-4 sentences first, then provide details using bullet points.
- Format numbers readably (e.g., "$1,234.56" not "1234.56", "3 instances" not raw arrays).
- Highlight important items naturally in the narrative.
- Do NOT return a "data" field. Put ALL information in the "explanation" text.

Response format — always respond with valid JSON:
{
  "type": "sql" | "infrastructure" | "governance" | "general",
  "explanation": "your natural language explanation here (use \\n for line breaks)",
  "sql": "SELECT ... (only when type is sql, omit otherwise)"
}`;

    let messages: Anthropic.MessageParam[] = [
      ...(history || []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: question },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let modelName = '';
    const maxIterations = 8;

    console.log('[DataPrism] Request configuration:');
    console.log('  - Has live credentials:', hasLiveCredentials);
    console.log('  - Databricks connected:', !!dbCreds);
    console.log('  - AWS connected:', !!awsCreds);
    console.log('  - Available tools:', availableTools.map(t => t.name).join(', '));
    console.log('  - Schema context:', schemaContext.substring(0, 100) + '...');

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        console.log(`[DataPrism] Iteration ${iteration + 1}`);

        // Force tool usage on first iteration when we have live credentials
        const shouldForceTools = iteration === 0 && hasLiveCredentials && availableTools.length > 0;
        
        const response = await claude.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: availableTools,
          ...(shouldForceTools && { tool_choice: { type: 'any' as const } }),
        });

        if (shouldForceTools) {
          console.log('[DataPrism] Forced tool usage with tool_choice=any');
        }

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;
        modelName = response.model;

        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        if (toolUseBlocks.length === 0) {
          console.log('[DataPrism] No tools called by Claude - returning direct response');
          const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
          console.log(`[DataPrism] Final response after ${iteration + 1} iteration(s)`);

          const tokenUsage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model: modelName };

          // Try to parse structured JSON response
          const jsonMatch = text.match(/\{[\s\S]*"type"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);

              // Auto-execute SQL if present and not already executed via tools
              let results;
              if (parsed.sql && parsed.type === 'sql') {
                try {
                  const sqlResult = await executeTool('execute_sql', { sql: parsed.sql }, 'auto-exec');
                  const parsedResult = JSON.parse(sqlResult.content);
                  results = {
                    columns: parsedResult.columns,
                    rows: parsedResult.rows,
                    rowCount: parsedResult.rowCount || parsedResult.rows?.length || 0,
                    truncated: false,
                  };
                } catch { /* SQL execution failed, skip results */ }
              }

              res.json({
                type: parsed.type || 'general',
                explanation: parsed.explanation || text,
                sql: parsed.sql || '',
                results,
                tokenUsage,
                mode: hasLiveCredentials ? 'live' : 'mock',
              });
              return;
            } catch { /* fall through to raw text */ }
          }

          // Fallback: return as general response
          res.json({ type: 'general', explanation: text, sql: '', tokenUsage, mode: hasLiveCredentials ? 'live' : 'mock' });
          return;
        }

        // Execute tool calls and continue
        console.log(`[DataPrism] Executing ${toolUseBlocks.length} tool(s): ${toolUseBlocks.map(b => b.name).join(', ')}`);
        messages.push({ role: 'assistant', content: response.content });

        const toolResults = await Promise.all(
          toolUseBlocks.map(block =>
            executeTool(block.name, block.input, block.id),
          ),
        );

        messages.push({ role: 'user', content: toolResults });
      }

      res.status(500).json({ error: 'Max tool-use iterations reached' });
    } catch (err: any) {
      console.error('[DataPrism] Error:', err.message);
      res.status(500).json({ error: `DataPrism error: ${err.message}` });
    }
  });

  // ── Execute SQL Endpoint ──────────────────────────────────────────
  router.post('/chat/execute-sql', async (req: Request, res: Response) => {
    const dbCreds = await getDatabricksCredentials(req);
    const warehouseId = getDatabricksWarehouseId(req);
    const { sql } = req.body as { sql: string };

    if (!sql) { res.status(400).json({ error: 'Missing sql' }); return; }

    // Try live Databricks
    if (dbCreds && warehouseId) {
      try {
        const response = await fetch(`${dbCreds.host}/api/2.0/sql/statements`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${dbCreds.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            statement: sql,
            warehouse_id: warehouseId,
            wait_timeout: '30s',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status?.state === 'SUCCEEDED') {
            const columns = (data.manifest?.schema?.columns || []).map((c: any) => c.name);
            const rows = data.result?.data_array || [];
            res.json({ columns, rows, rowCount: rows.length, truncated: !!data.result?.truncated });
            return;
          }
        }
      } catch (err: any) {
        console.warn(`[DataPrism] Live SQL failed, using mock: ${err.message}`);
      }
    }

    // Fall back to mock data
    res.json({ ...getMockQueryResult(sql), mock: true });
  });

  // ── AI Config Check ─────────────────────────────────────────────
  router.get('/ai/config', (_req: Request, res: Response) => {
    res.json({
      serverKeyConfigured: !!defaultClaude,
      mode: defaultClaude ? 'ai' : 'demo',
    });
  });

  return router;
}
