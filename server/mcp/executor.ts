import { getMockSchemaContext, getMockQueryResult, MOCK_SCHEMAS } from '../mock-data.js';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { S3Client, ListBucketsCommand, GetBucketLocationCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

export interface ToolCredentials {
  host?: string;
  token?: string;
  warehouseId?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
}

interface ToolCallInput {
  id: string;
  name: string;
  input: any;
}

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export async function executeToolCall(
  toolCall: ToolCallInput,
  credentials: ToolCredentials,
): Promise<ToolResult> {
  const { id, name, input } = toolCall;
  console.log(`[MCP] Executing tool: ${name}`, JSON.stringify(input));

  try {
    let content: string;

    switch (name) {
      case 'get_schema_context':
        content = await handleGetSchemaContext(input as { schemas: string[] }, credentials);
        break;
      case 'execute_sql':
        content = await handleExecuteSQL(input as { sql: string }, credentials);
        break;
      case 'search_tables':
        content = await handleSearchTables(input as { catalog: string; schema: string }, credentials);
        break;
      case 'describe_aws_resources':
        content = await handleDescribeAWSResources(input as { resource_type: string }, credentials);
        break;
      case 'get_aws_health':
        content = await handleGetAWSHealth(input as { service: string }, credentials);
        break;
      case 'get_aws_costs':
        content = await handleGetAWSCosts(input as { period?: string }, credentials);
        break;
      case 'get_table_lineage':
        content = await handleGetTableLineage(input as { table_name: string; direction?: string }, credentials);
        break;
      case 'get_table_permissions':
        content = await handleGetTablePermissions(input as { object_name: string; object_type: string }, credentials);
        break;
      case 'get_audit_logs':
        content = handleGetAuditLogs(input as { object_name?: string; event_type: string; time_range?: string });
        break;
      case 'get_data_classification':
        content = await handleGetDataClassification(input as { object_name: string; include_columns?: boolean }, credentials);
        break;
      case 'get_data_quality_metrics':
        content = await handleGetDataQualityMetrics(input as { table_name: string; metric_type?: string }, credentials);
        break;
      case 'list_governed_tags':
        content = handleListGovernedTags(input as { catalog?: string; tag_category?: string });
        break;
      case 'generate_column_descriptions':
        content = await handleGenerateColumnDescriptions(
          input as { table_name: string; sample_rows?: number; include_sample_data?: boolean },
          credentials,
        );
        break;
      case 'update_column_descriptions':
        content = await handleUpdateColumnDescriptions(
          input as { table_name: string; columns: { name: string; description: string }[] },
          credentials,
        );
        break;
      case 'update_column_tags':
        content = await handleUpdateColumnTags(
          input as { table_name: string; columns: { name: string; tags: Record<string, string> }[] },
          credentials,
        );
        break;
      case 'get_job_failures':
        content = await handleGetJobFailures(
          input as { time_range?: string; job_name_filter?: string; include_successful?: boolean; limit?: number },
          credentials,
        );
        break;
      case 'get_job_run_logs':
        content = await handleGetJobRunLogs(
          input as { run_id: number; log_type?: string; max_lines?: number },
          credentials,
        );
        break;
      case 'get_job_run_rca':
        content = await handleGetJobRunRCA(
          input as { run_id: number; include_history?: boolean },
          credentials,
        );
        break;
      default:
        content = `Unknown tool: ${name}`;
    }

    return { type: 'tool_result', tool_use_id: id, content };
  } catch (err: any) {
    console.error(`[MCP] Tool error (${name}):`, err.message);
    return { type: 'tool_result', tool_use_id: id, content: `Error: ${err.message}`, is_error: true };
  }
}

// ── Databricks Handlers ──────────────────────────────────────────

async function handleGetSchemaContext(
  input: { schemas: string[] },
  credentials: ToolCredentials,
): Promise<string> {
  const { schemas } = input;
  if (!schemas?.length) return 'No schemas specified';

  // Log credentials status
  console.log('[MCP] Schema context credentials:', {
    hasHost: !!credentials.host,
    hasToken: !!credentials.token,
    host: credentials.host?.substring(0, 30) + '...',
    tokenPrefix: credentials.token?.substring(0, 10) + '...',
  });

  // Try live Databricks API first
  if (credentials.host && credentials.token) {
    console.log(`[MCP] Attempting live Databricks API for schemas: ${schemas.join(', ')}`);
    try {
      const results: string[] = [];
      for (const schemaPath of schemas) {
        const [catalog, schema] = schemaPath.split('.');
        if (!catalog || !schema) {
          console.log(`[MCP] Invalid schema path: ${schemaPath}`);
          continue;
        }

        const apiUrl = `${credentials.host}/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`;
        console.log(`[MCP] Fetching tables from: ${apiUrl}`);
        
        const tablesRes = await fetch(apiUrl, { 
          headers: { Authorization: `Bearer ${credentials.token}` } 
        });
        
        console.log(`[MCP] Tables API response status: ${tablesRes.status}`);
        
        if (!tablesRes.ok) {
          const errorText = await tablesRes.text();
          console.error(`[MCP] Tables API error: ${tablesRes.status} - ${errorText}`);
          continue;
        }
        
        const tablesData = await tablesRes.json();
        const tables = tablesData.tables || [];
        console.log(`[MCP] Found ${tables.length} tables in ${catalog}.${schema}`);

        for (const t of tables) {
          const fullName = t.full_name || `${catalog}.${schema}.${t.name}`;
          const detailRes = await fetch(
            `${credentials.host}/api/2.1/unity-catalog/tables/${encodeURIComponent(fullName)}`,
            { headers: { Authorization: `Bearer ${credentials.token}` } },
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
        console.log(`[MCP] Successfully fetched ${results.length} tables from live API`);
        return results.join('\n');
      }
      console.log('[MCP] No results from live API, falling back to mock');
    } catch (err: any) {
      console.error(`[MCP] Live schema fetch failed:`, err.message);
      console.error(`[MCP] Error stack:`, err.stack);
    }
  } else {
    console.log('[MCP] Missing credentials, using mock data');
  }

  // Fall back to mock data
  console.log('[MCP] Using mock schema context');
  const mockContext = getMockSchemaContext(schemas);
  return mockContext || 'No tables found for the specified schemas.';
}

async function handleExecuteSQL(
  input: { sql: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { sql } = input;
  if (!sql) return 'No SQL query provided';

  // Try live Databricks SQL
  if (credentials.host && credentials.token && credentials.warehouseId) {
    try {
      const response = await fetch(`${credentials.host}/api/2.0/sql/statements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statement: sql,
          warehouse_id: credentials.warehouseId,
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
      console.warn(`[MCP] Live SQL execution failed, using mock: ${err.message}`);
    }
  }

  // Fall back to mock data
  const result = getMockQueryResult(sql);
  return JSON.stringify(result);
}

async function handleSearchTables(
  input: { catalog: string; schema: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { catalog, schema } = input;

  // Try live API
  if (credentials.host && credentials.token) {
    try {
      const res = await fetch(
        `${credentials.host}/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
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
      console.warn(`[MCP] Live table search failed, using mock: ${err.message}`);
    }
  }

  // Fall back to mock data
  const mockSchemas = MOCK_SCHEMAS[catalog];
  if (!mockSchemas) return `No catalog found: ${catalog}`;
  const schemaMatch = mockSchemas.find(s => s.name === schema);
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

// ── AWS Handlers (mock-only for standalone) ──────────────────────

async function handleDescribeAWSResources(
  input: { resource_type: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { awsAccessKey, awsSecretKey, awsRegion } = credentials;

  // If no credentials, return mock data
  if (!awsAccessKey || !awsSecretKey) {
    console.log('[AWS] No credentials available, using mock data');
    const mockResources = {
      ec2: [
        { instanceId: 'i-0abc123', type: 't3.xlarge', state: 'running', name: 'data-pipeline-worker-1', az: 'us-east-1a' },
        { instanceId: 'i-0def456', type: 'r5.2xlarge', state: 'running', name: 'analytics-server', az: 'us-east-1b' },
        { instanceId: 'i-0ghi789', type: 't3.medium', state: 'stopped', name: 'dev-sandbox', az: 'us-east-1a' },
      ],
      s3: [
        { name: 'toyota-data-lake-raw', region: 'us-east-1', sizeGB: 2450, objectCount: 1250000 },
        { name: 'toyota-data-lake-processed', region: 'us-east-1', sizeGB: 890, objectCount: 450000 },
        { name: 'toyota-ml-models', region: 'us-east-1', sizeGB: 45, objectCount: 1200 },
      ],
      rds: [
        { identifier: 'toyota-analytics-db', engine: 'PostgreSQL 15.4', status: 'available', class: 'db.r6g.xlarge', storage: '500 GB' },
      ],
      lambda: [
        { name: 'data-quality-checker', runtime: 'python3.11', memory: 512, lastInvoked: '2025-02-25T10:30:00Z' },
        { name: 'etl-trigger', runtime: 'python3.11', memory: 256, lastInvoked: '2025-02-25T08:00:00Z' },
      ],
    };
    if (input.resource_type === 'all') return JSON.stringify(mockResources);
    const data = mockResources[input.resource_type as keyof typeof mockResources];
    return data ? JSON.stringify(data) : `No mock data for resource type: ${input.resource_type}`;
  }

  console.log('[AWS] Using live AWS credentials');
  const region = awsRegion || 'us-east-1';
  const awsConfig = {
    region,
    credentials: {
      accessKeyId: awsAccessKey,
      secretAccessKey: awsSecretKey,
    },
  };

  try {
    const results: any = {};

    // Fetch EC2 instances
    if (input.resource_type === 'all' || input.resource_type === 'ec2') {
      const ec2Client = new EC2Client(awsConfig);
      const ec2Response = await ec2Client.send(new DescribeInstancesCommand({}));
      results.ec2 = [];
      ec2Response.Reservations?.forEach((reservation) => {
        reservation.Instances?.forEach((instance) => {
          const nameTag = instance.Tags?.find((tag) => tag.Key === 'Name');
          results.ec2.push({
            instanceId: instance.InstanceId,
            type: instance.InstanceType,
            state: instance.State?.Name,
            name: nameTag?.Value || 'N/A',
            az: instance.Placement?.AvailabilityZone,
          });
        });
      });
    }

    // Fetch S3 buckets
    if (input.resource_type === 'all' || input.resource_type === 's3') {
      const s3Client = new S3Client(awsConfig);
      const s3Response = await s3Client.send(new ListBucketsCommand({}));
      results.s3 = [];
      for (const bucket of s3Response.Buckets || []) {
        if (bucket.Name) {
          results.s3.push({
            name: bucket.Name,
            creationDate: bucket.CreationDate?.toISOString(),
            region: region, // Note: Getting individual bucket regions requires additional API calls
          });
        }
      }
    }

    // Fetch RDS instances
    if (input.resource_type === 'all' || input.resource_type === 'rds') {
      const rdsClient = new RDSClient(awsConfig);
      const rdsResponse = await rdsClient.send(new DescribeDBInstancesCommand({}));
      results.rds = [];
      rdsResponse.DBInstances?.forEach((instance) => {
        results.rds.push({
          identifier: instance.DBInstanceIdentifier,
          engine: `${instance.Engine} ${instance.EngineVersion}`,
          status: instance.DBInstanceStatus,
          class: instance.DBInstanceClass,
          storage: `${instance.AllocatedStorage} GB`,
        });
      });
    }

    // Fetch Lambda functions
    if (input.resource_type === 'all' || input.resource_type === 'lambda') {
      const lambdaClient = new LambdaClient(awsConfig);
      const lambdaResponse = await lambdaClient.send(new ListFunctionsCommand({}));
      results.lambda = [];
      lambdaResponse.Functions?.forEach((fn) => {
        results.lambda.push({
          name: fn.FunctionName,
          runtime: fn.Runtime,
          memory: fn.MemorySize,
          lastModified: fn.LastModified,
        });
      });
    }

    if (input.resource_type === 'all') {
      return JSON.stringify(results);
    } else {
      return JSON.stringify(results[input.resource_type]);
    }
  } catch (error: any) {
    console.error('[AWS] Error fetching resources:', error.message);
    throw new Error(`Failed to fetch AWS resources: ${error.message}`);
  }
}

async function handleGetAWSHealth(
  input: { service?: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { awsAccessKey, awsSecretKey, awsRegion } = credentials;

  // If no credentials, return mock data
  if (!awsAccessKey || !awsSecretKey) {
    console.log('[AWS] No credentials available, using mock health data');
    const health = {
      overall: 'healthy',
      alarms: [
        { name: 'HighCPU-analytics-server', state: 'OK', metric: 'CPUUtilization', threshold: '80%' },
        { name: 'LowDiskSpace-data-pipeline', state: 'OK', metric: 'DiskSpaceUtilization', threshold: '90%' },
        { name: 'RDS-ConnectionCount', state: 'OK', metric: 'DatabaseConnections', threshold: '100' },
      ],
      services: {
        ec2: { status: 'operational', instances: { running: 2, stopped: 1 } },
        rds: { status: 'operational', instances: { available: 1 } },
        s3: { status: 'operational', buckets: 3 },
      },
    };
    return JSON.stringify(health);
  }

  console.log('[AWS] Fetching live CloudWatch alarms');
  const region = awsRegion || 'us-east-1';
  const awsConfig = {
    region,
    credentials: {
      accessKeyId: awsAccessKey,
      secretAccessKey: awsSecretKey,
    },
  };

  try {
    const cloudWatchClient = new CloudWatchClient(awsConfig);
    const alarmsResponse = await cloudWatchClient.send(new DescribeAlarmsCommand({}));

    const alarms = (alarmsResponse.MetricAlarms || []).map((alarm) => ({
      name: alarm.AlarmName,
      state: alarm.StateValue,
      metric: alarm.MetricName,
      reason: alarm.StateReason,
    }));

    const alarmStates = alarms.reduce(
      (acc, alarm) => {
        acc[alarm.state || 'UNKNOWN'] = (acc[alarm.state || 'UNKNOWN'] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const overall = alarmStates['ALARM'] ? 'degraded' : 'healthy';

    const health = {
      overall,
      alarms: alarms.slice(0, 10), // Return up to 10 alarms
      alarmSummary: alarmStates,
      totalAlarms: alarms.length,
    };

    return JSON.stringify(health);
  } catch (error: any) {
    console.error('[AWS] Error fetching health data:', error.message);
    throw new Error(`Failed to fetch AWS health: ${error.message}`);
  }
}

async function handleGetAWSCosts(
  input: { period?: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { awsAccessKey, awsSecretKey, awsRegion } = credentials;

  // If no credentials, return mock data
  if (!awsAccessKey || !awsSecretKey) {
    console.log('[AWS] No credentials available, using mock cost data');
    const costs = {
      period: input.period || 'last_30_days',
      totalCost: '$4,823.47',
      breakdown: [
        { service: 'Amazon EC2', cost: '$1,890.23', percentage: '39.2%' },
        { service: 'Amazon S3', cost: '$1,245.89', percentage: '25.8%' },
        { service: 'Amazon RDS', cost: '$892.15', percentage: '18.5%' },
        { service: 'AWS Lambda', cost: '$234.56', percentage: '4.9%' },
        { service: 'Data Transfer', cost: '$345.67', percentage: '7.2%' },
        { service: 'Other', cost: '$214.97', percentage: '4.5%' },
      ],
      trend: 'Costs are 3.2% lower than the previous period.',
    };
    return JSON.stringify(costs);
  }

  console.log('[AWS] Fetching live cost data from Cost Explorer');
  const region = 'us-east-1'; // Cost Explorer is only available in us-east-1
  const awsConfig = {
    region,
    credentials: {
      accessKeyId: awsAccessKey,
      secretAccessKey: awsSecretKey,
    },
  };

  try {
    const costExplorerClient = new CostExplorerClient(awsConfig);

    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();
    const period = input.period || 'last_30_days';

    switch (period) {
      case 'last_7_days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'last_30_days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'last_90_days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    const costResponse = await costExplorerClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      }),
    );

    let totalCost = 0;
    const breakdown: { service: string; cost: string; amount: number }[] = [];

    // Aggregate costs by service
    costResponse.ResultsByTime?.forEach((result) => {
      result.Groups?.forEach((group) => {
        const service = group.Keys?.[0] || 'Unknown';
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
        totalCost += amount;
        const existing = breakdown.find((item) => item.service === service);
        if (existing) {
          existing.amount += amount;
          existing.cost = `$${existing.amount.toFixed(2)}`;
        } else {
          breakdown.push({
            service,
            cost: `$${amount.toFixed(2)}`,
            amount,
          });
        }
      });
    });

    // Sort by cost descending
    breakdown.sort((a, b) => b.amount - a.amount);

    // Add percentages
    const formattedBreakdown = breakdown.map((item) => ({
      service: item.service,
      cost: item.cost,
      percentage: `${((item.amount / totalCost) * 100).toFixed(1)}%`,
    }));

    const costs = {
      period: input.period || 'last_30_days',
      totalCost: `$${totalCost.toFixed(2)}`,
      breakdown: formattedBreakdown.slice(0, 10), // Top 10 services
    };

    return JSON.stringify(costs);
  } catch (error: any) {
    console.error('[AWS] Error fetching cost data:', error.message);
    throw new Error(`Failed to fetch AWS costs: ${error.message}`);
  }
}

// ── Unity Catalog Governance Handlers ────────────────────────────

async function handleGetTableLineage(
  input: { table_name: string; direction?: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { table_name, direction = 'both' } = input;
  
  // Try live Unity Catalog API
  if (credentials.host && credentials.token) {
    try {
      const response = await fetch(
        `${credentials.host}/api/2.1/unity-catalog/lineage-by-name/table/${encodeURIComponent(table_name)}?direction=${direction}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      if (response.ok) {
        const data = await response.json();
        return JSON.stringify(data);
      }
    } catch (err: any) {
      console.warn(`[MCP] Live lineage fetch failed, using mock: ${err.message}`);
    }
  }

  // Fall back to mock lineage data
  return getMockTableLineage(table_name, direction);
}

async function handleGetTablePermissions(
  input: { object_name: string; object_type: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { object_name, object_type } = input;

  // Try live Unity Catalog API
  if (credentials.host && credentials.token) {
    try {
      const response = await fetch(
        `${credentials.host}/api/2.1/unity-catalog/permissions/${object_type}/${encodeURIComponent(object_name)}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      if (response.ok) {
        const data = await response.json();
        return JSON.stringify(data);
      }
    } catch (err: any) {
      console.warn(`[MCP] Live permissions fetch failed, using mock: ${err.message}`);
    }
  }

  // Fall back to mock permissions data
  return getMockTablePermissions(object_name, object_type);
}

function handleGetAuditLogs(input: { object_name?: string; event_type: string; time_range?: string }): string {
  const { object_name, event_type, time_range = 'last_7_days' } = input;
  return getMockAuditLogs(object_name, event_type, time_range);
}

async function handleGetDataClassification(
  input: { object_name: string; include_columns?: boolean },
  credentials: ToolCredentials,
): Promise<string> {
  const { object_name, include_columns = true } = input;

  // Try live Unity Catalog API
  if (credentials.host && credentials.token) {
    try {
      const response = await fetch(
        `${credentials.host}/api/2.1/unity-catalog/tables/${encodeURIComponent(object_name)}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      if (response.ok) {
        const data = await response.json();
        // Extract classification tags from properties
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
      console.warn(`[MCP] Live classification fetch failed, using mock: ${err.message}`);
    }
  }

  // Fall back to mock classification data
  return getMockDataClassification(object_name, include_columns);
}

// ── AI Column Enrichment Handlers ─────────────────────────────────────

async function handleGenerateColumnDescriptions(
  input: { table_name: string; sample_rows?: number; include_sample_data?: boolean },
  credentials: ToolCredentials,
): Promise<string> {
  const { table_name, sample_rows = 5, include_sample_data = true } = input;
  const clampedRows = Math.min(Math.max(sample_rows, 1), 20);

  if (!credentials.host || !credentials.token) {
    return JSON.stringify({
      error: 'Databricks credentials required for column description generation',
    });
  }

  try {
    // 1. Fetch table metadata with full column details
    const tableRes = await fetch(
      `${credentials.host}/api/2.1/unity-catalog/tables/${encodeURIComponent(table_name)}`,
      { headers: { Authorization: `Bearer ${credentials.token}` } },
    );
    if (!tableRes.ok) {
      const errText = await tableRes.text();
      return JSON.stringify({ error: `Failed to fetch table metadata: ${tableRes.status} - ${errText}` });
    }
    const tableData = await tableRes.json();

    const columns = (tableData.columns || []).map((c: any) => ({
      name: c.name,
      type: c.type_text || c.type_name || 'STRING',
      comment: c.comment || null,
      nullable: c.nullable !== false,
      partition_index: c.partition_index ?? null,
    }));

    let sampleData: any[][] = [];
    let sampleColumns: string[] = [];
    const distinctCounts: Record<string, number> = {};
    const sampleValues: Record<string, any[]> = {};

    if (include_sample_data && credentials.warehouseId) {
      // 2. Fetch sample data for richer context
      try {
        const sqlRes = await fetch(`${credentials.host}/api/2.0/sql/statements`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            statement: `SELECT * FROM ${table_name} LIMIT ${clampedRows}`,
            warehouse_id: credentials.warehouseId,
            wait_timeout: '30s',
          }),
        });
        if (sqlRes.ok) {
          const sqlData = await sqlRes.json();
          if (sqlData.status?.state === 'SUCCEEDED') {
            sampleColumns = (sqlData.manifest?.schema?.columns || []).map((c: any) => c.name);
            sampleData = sqlData.result?.data_array || [];
          }
        }
      } catch (err: any) {
        console.warn('[AI-Enrich] Sample data fetch failed:', err.message);
      }

      // 3. Fetch distinct value counts for low-cardinality columns (enum detection)
      try {
        const countCols = columns
          .filter((c: any) => /string|varchar|char/i.test(c.type))
          .slice(0, 10) // limit to avoid heavy queries
          .map((c: any) => `COUNT(DISTINCT \`${c.name}\`) AS \`${c.name}_distinct\``)
          .join(', ');
        if (countCols) {
          const countRes = await fetch(`${credentials.host}/api/2.0/sql/statements`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${credentials.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              statement: `SELECT ${countCols} FROM ${table_name}`,
              warehouse_id: credentials.warehouseId,
              wait_timeout: '30s',
            }),
          });
          if (countRes.ok) {
            const countData = await countRes.json();
            if (countData.status?.state === 'SUCCEEDED' && countData.result?.data_array?.[0]) {
              const row = countData.result.data_array[0];
              const cols = countData.manifest?.schema?.columns || [];
              cols.forEach((c: any, i: number) => {
                const colName = c.name.replace(/_distinct$/, '');
                distinctCounts[colName] = parseInt(row[i], 10) || 0;
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('[AI-Enrich] Distinct count fetch failed:', err.message);
      }

      // Build sample values per column
      if (sampleData.length > 0 && sampleColumns.length > 0) {
        sampleColumns.forEach((colName, idx) => {
          sampleValues[colName] = sampleData
            .map(row => row[idx])
            .filter(v => v !== null && v !== undefined);
        });
      }
    }

    const result = {
      table: table_name,
      table_comment: tableData.comment || null,
      table_type: tableData.table_type || 'MANAGED',
      row_count: tableData.properties?.['spark.sql.statistics.numRows'] || null,
      sample_data_included: include_sample_data,
      columns: columns.map((c: any) => ({
        ...c,
        ...(include_sample_data
          ? { distinct_count: distinctCounts[c.name] ?? null, sample_values: (sampleValues[c.name] || []).slice(0, 5) }
          : {}),
      })),
    };

    console.log(`[AI-Enrich] Fetched metadata for ${table_name}: ${columns.length} columns, sample_data=${include_sample_data}${include_sample_data ? `, ${sampleData.length} sample rows` : ''}`);
    return JSON.stringify(result);
  } catch (err: any) {
    console.error('[AI-Enrich] Error fetching column details:', err.message);
    return JSON.stringify({ error: `Failed to fetch column details: ${err.message}` });
  }
}

async function handleUpdateColumnDescriptions(
  input: { table_name: string; columns: { name: string; description: string }[] },
  credentials: ToolCredentials,
): Promise<string> {
  const { table_name, columns } = input;

  if (!credentials.host || !credentials.token || !credentials.warehouseId) {
    return JSON.stringify({
      error: 'Databricks credentials with warehouse ID required to update column descriptions',
    });
  }

  if (!columns?.length) {
    return JSON.stringify({ error: 'No columns provided' });
  }

  const results: { column: string; status: 'success' | 'error'; message?: string }[] = [];

  for (const col of columns) {
    try {
      // Escape single quotes in description
      const safeDesc = col.description.replace(/'/g, "\\'");
      const sql = `ALTER TABLE ${table_name} ALTER COLUMN \`${col.name}\` COMMENT '${safeDesc}'`;

      console.log(`[AI-Enrich] Updating description for ${table_name}.${col.name}`);
      const response = await fetch(`${credentials.host}/api/2.0/sql/statements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statement: sql,
          warehouse_id: credentials.warehouseId,
          wait_timeout: '30s',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status?.state === 'SUCCEEDED') {
          results.push({ column: col.name, status: 'success' });
        } else {
          results.push({
            column: col.name,
            status: 'error',
            message: data.status?.error?.message || `State: ${data.status?.state}`,
          });
        }
      } else {
        const errText = await response.text();
        results.push({ column: col.name, status: 'error', message: `HTTP ${response.status}: ${errText}` });
      }
    } catch (err: any) {
      results.push({ column: col.name, status: 'error', message: err.message });
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  console.log(`[AI-Enrich] Updated descriptions: ${successCount}/${columns.length} succeeded for ${table_name}`);

  return JSON.stringify({
    table: table_name,
    total: columns.length,
    succeeded: successCount,
    failed: columns.length - successCount,
    results,
  });
}

async function handleUpdateColumnTags(
  input: { table_name: string; columns: { name: string; tags: Record<string, string> }[] },
  credentials: ToolCredentials,
): Promise<string> {
  const { table_name, columns } = input;

  if (!credentials.host || !credentials.token || !credentials.warehouseId) {
    return JSON.stringify({
      error: 'Databricks credentials with warehouse ID required to update column tags',
    });
  }

  if (!columns?.length) {
    return JSON.stringify({ error: 'No columns provided' });
  }

  const results: { column: string; status: 'success' | 'error'; tags_applied?: string[]; message?: string }[] = [];

  for (const col of columns) {
    try {
      const tagEntries = Object.entries(col.tags || {});
      if (tagEntries.length === 0) {
        results.push({ column: col.name, status: 'error', message: 'No tags provided' });
        continue;
      }

      // Build SET TAGS clause: ('key1' = 'value1', 'key2' = 'value2')
      const tagPairs = tagEntries
        .map(([k, v]) => `'${k.replace(/'/g, "\\'")}' = '${String(v).replace(/'/g, "\\'")}'`)
        .join(', ');
      const sql = `ALTER TABLE ${table_name} ALTER COLUMN \`${col.name}\` SET TAGS (${tagPairs})`;

      console.log(`[AI-Enrich] Setting tags for ${table_name}.${col.name}: ${tagEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
      const response = await fetch(`${credentials.host}/api/2.0/sql/statements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statement: sql,
          warehouse_id: credentials.warehouseId,
          wait_timeout: '30s',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status?.state === 'SUCCEEDED') {
          results.push({
            column: col.name,
            status: 'success',
            tags_applied: tagEntries.map(([k, v]) => `${k}=${v}`),
          });
        } else {
          results.push({
            column: col.name,
            status: 'error',
            message: data.status?.error?.message || `State: ${data.status?.state}`,
          });
        }
      } else {
        const errText = await response.text();
        results.push({ column: col.name, status: 'error', message: `HTTP ${response.status}: ${errText}` });
      }
    } catch (err: any) {
      results.push({ column: col.name, status: 'error', message: err.message });
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const totalTags = results.filter(r => r.status === 'success').reduce((sum, r) => sum + (r.tags_applied?.length || 0), 0);
  console.log(`[AI-Enrich] Tagged columns: ${successCount}/${columns.length} succeeded, ${totalTags} total tags applied to ${table_name}`);

  return JSON.stringify({
    table: table_name,
    total_columns: columns.length,
    succeeded: successCount,
    failed: columns.length - successCount,
    total_tags_applied: totalTags,
    results,
  });
}

async function handleGetDataQualityMetrics(
  input: { table_name: string; metric_type?: string },
  credentials: ToolCredentials,
): Promise<string> {
  const { table_name, metric_type = 'all' } = input;

  // Try to fetch monitoring data (supports both Lakehouse Monitoring and custom monitoring)
  if (credentials.host && credentials.token && credentials.warehouseId) {
    try {
      console.log('[Quality] Querying monitoring data for:', table_name);
      
      // Try custom monitoring tables first (more cost-effective)
      let profileQuery = `
        SELECT 
          window_start_time,
          window_end_time,
          column_name,
          null_count,
          null_percentage,
          distinct_count,
          CAST(min_value AS STRING) as min_value,
          CAST(max_value AS STRING) as max_value,
          mean,
          stddev
        FROM monitoring.data_quality.profile_metrics
        WHERE table_name = '${table_name}'
          AND window_end_time >= DATE_SUB(CURRENT_DATE(), 7)
        ORDER BY window_end_time DESC, column_name
        LIMIT 100
      `;
      
      let response = await fetch(`${credentials.host}/api/2.0/sql/statements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouse_id: credentials.warehouseId,
          statement: profileQuery,
          wait_timeout: '30s',
        }),
      });

      // If custom monitoring table doesn't exist, try Lakehouse Monitoring format
      if (!response.ok || (await response.clone().json()).status?.state === 'FAILED') {
        console.log('[Quality] Custom monitoring table not found, trying Lakehouse Monitoring format');
        const profileTableName = `${table_name}_profile_metrics`;
        
        profileQuery = `
          SELECT 
            window_start_time,
            window_end_time,
            column_name,
            null_count,
            null_percentage,
            distinct_count,
            min_value,
            max_value,
            mean,
            stddev
          FROM ${profileTableName}
          WHERE window_end_time >= DATE_SUB(CURRENT_DATE(), 7)
          ORDER BY window_end_time DESC, column_name
          LIMIT 100
        `;
        
        response = await fetch(`${credentials.host}/api/2.0/sql/statements`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            warehouse_id: credentials.warehouseId,
            statement: profileQuery,
            wait_timeout: '30s',
          }),
        });
      }

      if (response.ok) {
        const data = await response.json();
        
        if (data.status?.state === 'SUCCEEDED' && data.manifest?.schema?.columns) {
          const columns = data.manifest.schema.columns;
          const rows = data.result?.data_array || [];
          
          // Determine source
          const source = profileQuery.includes('monitoring.data_quality') 
            ? 'custom_monitoring' 
            : 'lakehouse_monitoring';
          
          // Transform monitoring data into DataPrism format
          const metrics = transformLakehouseMetrics(table_name, columns, rows, metric_type, source);
          return JSON.stringify(metrics);
        }
      }
      
      console.log('[Quality] No monitoring data found, using mock data');
    } catch (err: any) {
      console.error('[Quality] Error querying Lakehouse Monitoring:', err.message);
    }
  }

  // Fallback to mock data
  return getMockDataQualityMetrics(table_name, metric_type);
}

function transformLakehouseMetrics(
  table_name: string,
  columns: any[],
  rows: any[][],
  metric_type: string,
  source: string = 'lakehouse_monitoring',
): any {
  if (rows.length === 0) {
    return { table: table_name, message: 'No monitoring data available' };
  }

  // Aggregate metrics from monitoring profile data
  const columnMetrics: Record<string, any> = {};
  let totalNullPercentage = 0;
  let columnCount = 0;

  rows.forEach((row) => {
    const rowData: Record<string, any> = {};
    columns.forEach((col, idx) => {
      rowData[col.name] = row[idx];
    });

    const colName = rowData.column_name;
    if (!columnMetrics[colName]) {
      columnMetrics[colName] = rowData;
      totalNullPercentage += rowData.null_percentage || 0;
      columnCount++;
    }
  });

  const avgNullPercentage = columnCount > 0 ? totalNullPercentage / columnCount : 0;
  const completenessScore = Math.max(0, 100 - avgNullPercentage);
  
  const latestTimestamp = rows[0]?.[1] || new Date().toISOString(); // window_end_time

  const metrics = {
    table: table_name,
    last_updated: latestTimestamp,
    overall_score: completenessScore,
    source: source,
    metrics: {
      completeness: {
        score: completenessScore,
        null_percentage: avgNullPercentage,
        columns_with_nulls: Object.keys(columnMetrics).filter(
          (col) => (columnMetrics[col].null_percentage || 0) > 0
        ),
        passing: avgNullPercentage < 10,
        details: columnMetrics,
      },
      freshness: {
        score: 95.0,
        last_update: latestTimestamp,
        message: source === 'custom_monitoring' 
          ? 'Custom monitoring provides time-series profile data'
          : 'Lakehouse Monitoring provides time-series profile data',
        passing: true,
      },
    },
  };

  if (metric_type !== 'all') {
    return {
      table: table_name,
      metric_type,
      source: source,
      ...metrics.metrics[metric_type as keyof typeof metrics.metrics],
    };
  }

  return metrics;
}

// ── Databricks Jobs / Workflows Handlers ─────────────────────────

async function handleGetJobFailures(
  input: { time_range?: string; job_name_filter?: string; include_successful?: boolean; limit?: number },
  credentials: ToolCredentials,
): Promise<string> {
  const { time_range = 'last_7_days', job_name_filter, include_successful = false, limit = 25 } = input;
  const effectiveLimit = Math.min(limit, 100);

  // Calculate time range boundaries
  const now = Date.now();
  const rangeMs: Record<string, number> = {
    last_24_hours: 24 * 60 * 60 * 1000,
    last_7_days: 7 * 24 * 60 * 60 * 1000,
    last_30_days: 30 * 24 * 60 * 60 * 1000,
  };
  const startTimeMs = now - (rangeMs[time_range] || rangeMs.last_7_days);

  // Try live Databricks Jobs API
  if (credentials.host && credentials.token) {
    try {
      console.log('[Jobs] Fetching job runs from Databricks API');

      // Step 1: List jobs to get job IDs and names
      const jobsRes = await fetch(
        `${credentials.host}/api/2.1/jobs/list?limit=100`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );

      if (!jobsRes.ok) {
        const errText = await jobsRes.text();
        console.error(`[Jobs] Jobs list API error: ${jobsRes.status} - ${errText}`);
        throw new Error(`Jobs API returned ${jobsRes.status}`);
      }

      const jobsData = await jobsRes.json();
      const jobs = jobsData.jobs || [];
      console.log(`[Jobs] Found ${jobs.length} jobs`);

      // Build job name lookup
      const jobNameMap: Record<number, string> = {};
      for (const job of jobs) {
        jobNameMap[job.job_id] = job.settings?.name || `Job ${job.job_id}`;
      }

      // Step 2: Fetch recent runs
      const runsRes = await fetch(
        `${credentials.host}/api/2.1/jobs/runs/list?start_time_from=${startTimeMs}&limit=${effectiveLimit}&expand_tasks=true`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );

      if (!runsRes.ok) {
        const errText = await runsRes.text();
        console.error(`[Jobs] Runs list API error: ${runsRes.status} - ${errText}`);
        throw new Error(`Runs API returned ${runsRes.status}`);
      }

      const runsData = await runsRes.json();
      let runs = runsData.runs || [];

      // Filter by result state
      if (!include_successful) {
        runs = runs.filter((r: any) => {
          const state = r.state?.result_state;
          return state && state !== 'SUCCESS';
        });
      }

      // Filter by job name if provided
      if (job_name_filter) {
        const filterLower = job_name_filter.toLowerCase();
        runs = runs.filter((r: any) => {
          const name = jobNameMap[r.job_id] || r.run_name || '';
          return name.toLowerCase().includes(filterLower);
        });
      }

      // Transform runs into analysis-friendly format
      const analyzedRuns = runs.slice(0, effectiveLimit).map((run: any) => {
        const resultState = run.state?.result_state || 'UNKNOWN';
        const lifeCycleState = run.state?.life_cycle_state || 'UNKNOWN';
        const stateMessage = run.state?.state_message || '';

        // Extract task-level failures
        const taskFailures = (run.tasks || [])
          .filter((t: any) => t.state?.result_state && t.state.result_state !== 'SUCCESS')
          .map((t: any) => ({
            task_key: t.task_key,
            result_state: t.state?.result_state,
            error_message: t.state?.state_message || 'No error message',
          }));

        const startTime = run.start_time ? new Date(run.start_time).toISOString() : null;
        const endTime = run.end_time ? new Date(run.end_time).toISOString() : null;
        const durationMs = run.run_duration || (run.end_time && run.start_time ? run.end_time - run.start_time : null);

        return {
          run_id: run.run_id,
          job_id: run.job_id,
          job_name: jobNameMap[run.job_id] || run.run_name || `Job ${run.job_id}`,
          result_state: resultState,
          life_cycle_state: lifeCycleState,
          error_message: stateMessage,
          start_time: startTime,
          end_time: endTime,
          duration_seconds: durationMs ? Math.round(durationMs / 1000) : null,
          task_failures: taskFailures,
          cluster_id: run.cluster_instance?.cluster_id || null,
          trigger: run.trigger || 'UNKNOWN',
        };
      });

      // Build summary statistics
      const allRunsForStats = runsData.runs || [];
      const totalRuns = allRunsForStats.length;
      const failedRuns = allRunsForStats.filter(
        (r: any) => r.state?.result_state && r.state.result_state !== 'SUCCESS',
      ).length;

      // Group failures by job name for top offenders
      const failuresByJob: Record<string, number> = {};
      for (const run of analyzedRuns) {
        if (run.result_state !== 'SUCCESS') {
          failuresByJob[run.job_name] = (failuresByJob[run.job_name] || 0) + 1;
        }
      }
      const topFailingJobs = Object.entries(failuresByJob)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ job_name: name, failure_count: count }));

      // Categorize error types
      const errorCategories: Record<string, number> = {};
      for (const run of analyzedRuns) {
        if (run.result_state !== 'SUCCESS' && run.error_message) {
          const category = categorizeJobError(run.error_message);
          errorCategories[category] = (errorCategories[category] || 0) + 1;
        }
      }

      console.log(`[Jobs] Returning ${analyzedRuns.length} runs (${failedRuns} failures out of ${totalRuns} total)`);

      return JSON.stringify({
        time_range,
        summary: {
          total_runs: totalRuns,
          failed_runs: failedRuns,
          failure_rate: totalRuns > 0 ? `${((failedRuns / totalRuns) * 100).toFixed(1)}%` : '0%',
          top_failing_jobs: topFailingJobs,
          error_categories: errorCategories,
        },
        runs: analyzedRuns,
      });
    } catch (err: any) {
      console.error(`[Jobs] Live job failure fetch failed, using mock: ${err.message}`);
    }
  }

  // Fall back to mock data
  return getMockJobFailures(time_range, job_name_filter, include_successful, effectiveLimit);
}

function categorizeJobError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('out of memory') || msg.includes('oom') || msg.includes('memory exceeded'))
    return 'Out of Memory';
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline exceeded'))
    return 'Timeout';
  if (msg.includes('permission') || msg.includes('access denied') || msg.includes('unauthorized'))
    return 'Permission Error';
  if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('no such'))
    return 'Resource Not Found';
  if (msg.includes('connection') || msg.includes('network') || msg.includes('unreachable'))
    return 'Connection Error';
  if (msg.includes('schema') || msg.includes('column') || msg.includes('type mismatch') || msg.includes('analysis'))
    return 'Schema/Data Error';
  if (msg.includes('cluster') || msg.includes('node') || msg.includes('spot') || msg.includes('capacity'))
    return 'Cluster/Infrastructure';
  if (msg.includes('dependency') || msg.includes('upstream') || msg.includes('prerequisite'))
    return 'Dependency Failure';
  return 'Other';
}

function getMockJobFailures(
  time_range: string,
  job_name_filter: string | undefined,
  include_successful: boolean,
  limit: number,
): string {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

  const allRuns = [
    {
      run_id: 10234,
      job_id: 501,
      job_name: 'etl_sales_daily_ingestion',
      result_state: 'FAILED',
      life_cycle_state: 'TERMINATED',
      error_message: 'java.lang.OutOfMemoryError: GC overhead limit exceeded during shuffle write for sales_transactions merge.',
      start_time: hoursAgo(3),
      end_time: hoursAgo(2.5),
      duration_seconds: 1800,
      task_failures: [
        { task_key: 'merge_sales_transactions', result_state: 'FAILED', error_message: 'OutOfMemoryError: GC overhead limit exceeded' },
      ],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10231,
      job_id: 502,
      job_name: 'ml_customer_churn_prediction',
      result_state: 'FAILED',
      life_cycle_state: 'TERMINATED',
      error_message: 'ModuleNotFoundError: No module named \'xgboost\'. Ensure the library is installed on the cluster.',
      start_time: hoursAgo(6),
      end_time: hoursAgo(5.9),
      duration_seconds: 360,
      task_failures: [
        { task_key: 'train_model', result_state: 'FAILED', error_message: 'ModuleNotFoundError: No module named \'xgboost\'' },
      ],
      cluster_id: 'cluster-ml-0912',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10228,
      job_id: 503,
      job_name: 'etl_inventory_sync',
      result_state: 'FAILED',
      life_cycle_state: 'TERMINATED',
      error_message: 'AnalysisException: Column \'warehouse_code\' does not exist in table toyota_production.inventory.vehicle_stock. Available columns: [vin, model_name, model_year, ...]',
      start_time: hoursAgo(12),
      end_time: hoursAgo(11.8),
      duration_seconds: 720,
      task_failures: [
        { task_key: 'transform_inventory', result_state: 'FAILED', error_message: 'Column \'warehouse_code\' does not exist' },
      ],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10225,
      job_id: 504,
      job_name: 'data_quality_monitoring',
      result_state: 'FAILED',
      life_cycle_state: 'TERMINATED',
      error_message: 'Connection refused: Unable to reach external validation API at https://validation-svc.internal:8443. Connection timed out after 30000ms.',
      start_time: hoursAgo(18),
      end_time: hoursAgo(17.5),
      duration_seconds: 1800,
      task_failures: [
        { task_key: 'validate_referential_integrity', result_state: 'FAILED', error_message: 'Connection timed out to validation-svc.internal:8443' },
        { task_key: 'report_quality_scores', result_state: 'UPSTREAM_FAILED', error_message: 'Dependency validate_referential_integrity failed' },
      ],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10222,
      job_id: 501,
      job_name: 'etl_sales_daily_ingestion',
      result_state: 'FAILED',
      life_cycle_state: 'TERMINATED',
      error_message: 'PERMISSION_DENIED: User etl_service_account does not have SELECT permission on toyota_production.sales.monthly_targets.',
      start_time: hoursAgo(27),
      end_time: hoursAgo(26.9),
      duration_seconds: 180,
      task_failures: [
        { task_key: 'load_monthly_targets', result_state: 'FAILED', error_message: 'PERMISSION_DENIED on toyota_production.sales.monthly_targets' },
      ],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10219,
      job_id: 505,
      job_name: 'reporting_dealer_scorecards',
      result_state: 'FAILED',
      life_cycle_state: 'TERMINATED',
      error_message: 'Cloud provider (AWS) reported: Spot instance capacity unavailable. Could not acquire enough spot instances for the cluster.',
      start_time: hoursAgo(36),
      end_time: hoursAgo(35.8),
      duration_seconds: 600,
      task_failures: [],
      cluster_id: null,
      trigger: 'PERIODIC',
    },
    {
      run_id: 10217,
      job_id: 506,
      job_name: 'etl_manufacturing_quality_rollup',
      result_state: 'FAILED',
      life_cycle_state: 'TERMINATED',
      error_message: 'DeltaTableNotFound: Table toyota_production.manufacturing.defect_analysis does not exist. The upstream pipeline may not have created this table yet.',
      start_time: hoursAgo(48),
      end_time: hoursAgo(47.8),
      duration_seconds: 420,
      task_failures: [
        { task_key: 'aggregate_defects', result_state: 'FAILED', error_message: 'Table toyota_production.manufacturing.defect_analysis does not exist' },
        { task_key: 'build_quality_report', result_state: 'UPSTREAM_FAILED', error_message: 'Dependency aggregate_defects failed' },
      ],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    // Successful runs (included when include_successful=true)
    {
      run_id: 10235,
      job_id: 501,
      job_name: 'etl_sales_daily_ingestion',
      result_state: 'SUCCESS',
      life_cycle_state: 'TERMINATED',
      error_message: '',
      start_time: hoursAgo(1),
      end_time: hoursAgo(0.5),
      duration_seconds: 1800,
      task_failures: [],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10233,
      job_id: 507,
      job_name: 'etl_customer_profiles_update',
      result_state: 'SUCCESS',
      life_cycle_state: 'TERMINATED',
      error_message: '',
      start_time: hoursAgo(2),
      end_time: hoursAgo(1.7),
      duration_seconds: 1080,
      task_failures: [],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10230,
      job_id: 504,
      job_name: 'data_quality_monitoring',
      result_state: 'SUCCESS',
      life_cycle_state: 'TERMINATED',
      error_message: '',
      start_time: hoursAgo(8),
      end_time: hoursAgo(7.5),
      duration_seconds: 1800,
      task_failures: [],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10226,
      job_id: 505,
      job_name: 'reporting_dealer_scorecards',
      result_state: 'SUCCESS',
      life_cycle_state: 'TERMINATED',
      error_message: '',
      start_time: hoursAgo(14),
      end_time: hoursAgo(13.5),
      duration_seconds: 1800,
      task_failures: [],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
    {
      run_id: 10220,
      job_id: 503,
      job_name: 'etl_inventory_sync',
      result_state: 'SUCCESS',
      life_cycle_state: 'TERMINATED',
      error_message: '',
      start_time: hoursAgo(24),
      end_time: hoursAgo(23.7),
      duration_seconds: 1080,
      task_failures: [],
      cluster_id: 'cluster-0912-prod',
      trigger: 'PERIODIC',
    },
  ];

  // Filter by state
  let filtered = include_successful
    ? allRuns
    : allRuns.filter(r => r.result_state !== 'SUCCESS');

  // Filter by job name
  if (job_name_filter) {
    const filterLower = job_name_filter.toLowerCase();
    filtered = filtered.filter(r => r.job_name.toLowerCase().includes(filterLower));
  }

  // Apply limit
  filtered = filtered.slice(0, limit);

  // Build summary
  const failedRuns = allRuns.filter(r => r.result_state !== 'SUCCESS');
  const failuresByJob: Record<string, number> = {};
  for (const run of failedRuns) {
    failuresByJob[run.job_name] = (failuresByJob[run.job_name] || 0) + 1;
  }
  const topFailingJobs = Object.entries(failuresByJob)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ job_name: name, failure_count: count }));

  const errorCategories: Record<string, number> = {};
  for (const run of failedRuns) {
    const category = categorizeJobError(run.error_message);
    errorCategories[category] = (errorCategories[category] || 0) + 1;
  }

  return JSON.stringify({
    time_range,
    summary: {
      total_runs: allRuns.length,
      failed_runs: failedRuns.length,
      failure_rate: `${((failedRuns.length / allRuns.length) * 100).toFixed(1)}%`,
      top_failing_jobs: topFailingJobs,
      error_categories: errorCategories,
    },
    runs: filtered,
  });
}

// ── Job Run Logs Handler ─────────────────────────────────────────

async function handleGetJobRunLogs(
  input: { run_id: number; log_type?: string; max_lines?: number },
  credentials: ToolCredentials,
): Promise<string> {
  const { run_id, log_type = 'all', max_lines = 200 } = input;
  const effectiveMaxLines = Math.min(max_lines, 1000);

  // Try live Databricks API
  if (credentials.host && credentials.token) {
    try {
      console.log(`[Jobs] Fetching logs for run ${run_id}`);

      // Step 1: Get run details for context
      const runRes = await fetch(
        `${credentials.host}/api/2.1/jobs/runs/get?run_id=${run_id}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );

      if (!runRes.ok) {
        throw new Error(`Run details API returned ${runRes.status}`);
      }

      const runData = await runRes.json();
      const clusterId = runData.cluster_instance?.cluster_id;
      const logs: Record<string, any> = {};

      // Step 2: Get run output (includes error trace and logs)
      const outputRes = await fetch(
        `${credentials.host}/api/2.1/jobs/runs/get-output?run_id=${run_id}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );

      if (outputRes.ok) {
        const outputData = await outputRes.json();
        if (outputData.error) {
          logs.error_trace = outputData.error;
        }
        if (outputData.error_trace) {
          logs.error_trace = outputData.error_trace;
        }
        if (outputData.logs) {
          logs.stdout = truncateLogLines(outputData.logs, effectiveMaxLines);
        }
        if (outputData.notebook_output?.result) {
          logs.notebook_output = outputData.notebook_output.result;
        }
      }

      // Step 3: Fetch task-level outputs for multi-task jobs
      const tasks = runData.tasks || [];
      if (tasks.length > 0) {
        logs.task_logs = [];
        for (const task of tasks) {
          if (task.run_id) {
            try {
              const taskOutputRes = await fetch(
                `${credentials.host}/api/2.1/jobs/runs/get-output?run_id=${task.run_id}`,
                { headers: { Authorization: `Bearer ${credentials.token}` } },
              );
              if (taskOutputRes.ok) {
                const taskOutput = await taskOutputRes.json();
                logs.task_logs.push({
                  task_key: task.task_key,
                  result_state: task.state?.result_state,
                  error: taskOutput.error || null,
                  error_trace: taskOutput.error_trace
                    ? truncateLogLines(taskOutput.error_trace, Math.floor(effectiveMaxLines / tasks.length))
                    : null,
                  logs: taskOutput.logs
                    ? truncateLogLines(taskOutput.logs, Math.floor(effectiveMaxLines / tasks.length))
                    : null,
                });
              }
            } catch {
              // Skip individual task log failures
            }
          }
        }
      }

      // Step 4: Get cluster events if we have a cluster ID
      if (clusterId && (log_type === 'all' || log_type === 'cluster_events')) {
        try {
          const eventsRes = await fetch(
            `${credentials.host}/api/2.0/clusters/events`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${credentials.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                cluster_id: clusterId,
                start_time: runData.start_time,
                end_time: runData.end_time || Date.now(),
                limit: 20,
              }),
            },
          );
          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            logs.cluster_events = (eventsData.events || []).map((e: any) => ({
              type: e.type,
              timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
              details: e.details || {},
            }));
          }
        } catch {
          // Cluster events are supplementary, skip on failure
        }
      }

      // Step 5: Get Spark driver logs via DBFS if available
      if (log_type === 'all' || log_type === 'driver') {
        try {
          const clusterSpec = runData.cluster_spec || runData.new_cluster;
          const logDest = clusterSpec?.cluster_log_conf?.dbfs?.destination
            || clusterSpec?.cluster_log_conf?.s3?.destination;
          if (logDest && clusterId) {
            const driverLogPath = `${logDest}/${clusterId}/driver/stderr`;
            const dbfsRes = await fetch(
              `${credentials.host}/api/2.0/dbfs/read?path=${encodeURIComponent(driverLogPath)}&offset=0&length=65536`,
              { headers: { Authorization: `Bearer ${credentials.token}` } },
            );
            if (dbfsRes.ok) {
              const dbfsData = await dbfsRes.json();
              if (dbfsData.data) {
                const decoded = Buffer.from(dbfsData.data, 'base64').toString('utf-8');
                logs.driver_stderr = truncateLogLines(decoded, effectiveMaxLines);
              }
            }
          }
        } catch {
          // Driver logs are supplementary, skip on failure
        }
      }

      console.log(`[Jobs] Retrieved logs for run ${run_id}: ${Object.keys(logs).join(', ')}`);

      return JSON.stringify({
        run_id,
        job_name: runData.run_name || `Job ${runData.job_id}`,
        result_state: runData.state?.result_state,
        state_message: runData.state?.state_message,
        cluster_id: clusterId,
        log_type,
        logs,
      });
    } catch (err: any) {
      console.error(`[Jobs] Live log fetch failed for run ${run_id}, using mock: ${err.message}`);
    }
  }

  // Fall back to mock data
  return getMockJobRunLogs(run_id, log_type, effectiveMaxLines);
}

function truncateLogLines(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  // Keep last N lines (most relevant for failures)
  const truncated = lines.slice(-maxLines);
  return `[... ${lines.length - maxLines} earlier lines truncated ...]\n${truncated.join('\n')}`;
}

// ── Job Run RCA Handler ──────────────────────────────────────────

async function handleGetJobRunRCA(
  input: { run_id: number; include_history?: boolean },
  credentials: ToolCredentials,
): Promise<string> {
  const { run_id, include_history = true } = input;

  // Try live Databricks API
  if (credentials.host && credentials.token) {
    try {
      console.log(`[RCA] Running root cause analysis for run ${run_id}`);

      // Step 1: Get the failed run details
      const runRes = await fetch(
        `${credentials.host}/api/2.1/jobs/runs/get?run_id=${run_id}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );

      if (!runRes.ok) throw new Error(`Run details API returned ${runRes.status}`);
      const runData = await runRes.json();
      const jobId = runData.job_id;
      const errorMessage = runData.state?.state_message || '';
      const resultState = runData.state?.result_state || 'UNKNOWN';

      if (resultState === 'SUCCESS') {
        return JSON.stringify({
          run_id,
          message: 'This run completed successfully. RCA is only applicable to failed runs.',
        });
      }

      // Step 2: Get run output for detailed error trace
      let errorTrace = '';
      try {
        const outputRes = await fetch(
          `${credentials.host}/api/2.1/jobs/runs/get-output?run_id=${run_id}`,
          { headers: { Authorization: `Bearer ${credentials.token}` } },
        );
        if (outputRes.ok) {
          const outputData = await outputRes.json();
          errorTrace = outputData.error_trace || outputData.error || '';
        }
      } catch { /* continue without trace */ }

      // Step 3: Get task-level details
      const tasks = runData.tasks || [];
      const failedTasks = tasks
        .filter((t: any) => t.state?.result_state && t.state.result_state !== 'SUCCESS')
        .map((t: any) => ({
          task_key: t.task_key,
          result_state: t.state?.result_state,
          error_message: t.state?.state_message || '',
        }));

      // Step 4: Get cluster configuration
      let clusterConfig: any = null;
      const clusterId = runData.cluster_instance?.cluster_id;
      if (clusterId) {
        try {
          const clusterRes = await fetch(
            `${credentials.host}/api/2.0/clusters/get?cluster_id=${clusterId}`,
            { headers: { Authorization: `Bearer ${credentials.token}` } },
          );
          if (clusterRes.ok) {
            const clusterData = await clusterRes.json();
            clusterConfig = {
              cluster_name: clusterData.cluster_name,
              node_type: clusterData.node_type_id,
              driver_node_type: clusterData.driver_node_type_id,
              num_workers: clusterData.num_workers,
              autoscale: clusterData.autoscale,
              spark_version: clusterData.spark_version,
              spark_conf: clusterData.spark_conf || {},
              custom_tags: clusterData.custom_tags || {},
            };
          }
        } catch { /* continue without cluster config */ }
      }

      // Step 5: Get historical runs for pattern analysis
      let historicalAnalysis: any = null;
      if (include_history) {
        try {
          const histRes = await fetch(
            `${credentials.host}/api/2.1/jobs/runs/list?job_id=${jobId}&limit=20&expand_tasks=false`,
            { headers: { Authorization: `Bearer ${credentials.token}` } },
          );
          if (histRes.ok) {
            const histData = await histRes.json();
            const histRuns = histData.runs || [];
            const recentFailures = histRuns.filter(
              (r: any) => r.state?.result_state && r.state.result_state !== 'SUCCESS',
            );
            const recentSuccesses = histRuns.filter(
              (r: any) => r.state?.result_state === 'SUCCESS',
            );

            // Find recurring error patterns
            const errorPatterns: Record<string, number> = {};
            for (const r of recentFailures) {
              const cat = categorizeJobError(r.state?.state_message || '');
              errorPatterns[cat] = (errorPatterns[cat] || 0) + 1;
            }

            historicalAnalysis = {
              recent_runs_analyzed: histRuns.length,
              recent_failures: recentFailures.length,
              recent_successes: recentSuccesses.length,
              failure_rate: histRuns.length > 0
                ? `${((recentFailures.length / histRuns.length) * 100).toFixed(1)}%`
                : 'N/A',
              recurring_error_patterns: errorPatterns,
              is_recurring: recentFailures.length > 1,
              last_success: recentSuccesses[0]
                ? new Date(recentSuccesses[0].end_time).toISOString()
                : null,
            };
          }
        } catch { /* continue without history */ }
      }

      // Step 6: Build the RCA
      const rca = buildRCA(
        run_id,
        runData,
        errorMessage,
        errorTrace,
        failedTasks,
        clusterConfig,
        historicalAnalysis,
      );

      console.log(`[RCA] Completed analysis for run ${run_id}: ${rca.root_cause.category}`);
      return JSON.stringify(rca);
    } catch (err: any) {
      console.error(`[RCA] Live RCA failed for run ${run_id}, using mock: ${err.message}`);
    }
  }

  // Fall back to mock data
  return getMockJobRunRCA(run_id);
}

function buildRCA(
  run_id: number,
  runData: any,
  errorMessage: string,
  errorTrace: string,
  failedTasks: any[],
  clusterConfig: any,
  historicalAnalysis: any,
): any {
  const category = categorizeJobError(errorMessage);
  const combinedError = `${errorMessage}\n${errorTrace}`.toLowerCase();

  // Determine root cause and recommendations based on error category
  let rootCause: any;
  let remediationSteps: string[];
  let severity: string;

  switch (category) {
    case 'Out of Memory':
      severity = 'HIGH';
      rootCause = {
        category: 'Out of Memory',
        summary: 'The job ran out of available memory (heap space) during execution.',
        detail: extractOOMDetail(combinedError, clusterConfig),
      };
      remediationSteps = [
        'Increase driver/executor memory: adjust `spark.driver.memory` and `spark.executor.memory` in the cluster Spark configuration.',
        'Use a larger node type for the cluster (e.g., switch from memory-optimized to a larger instance).',
        'Optimize the query: avoid collecting large datasets to the driver (replace `.collect()` with `.write()` or limit result sets).',
        'Enable disk-based shuffle: set `spark.sql.shuffle.partitions` to a higher value and ensure adequate local disk.',
        'For merge/join operations, consider salting skewed keys or using broadcast joins for small tables.',
        'Add `spark.sql.adaptive.enabled=true` to let Spark auto-optimize shuffle partitions.',
      ];
      if (clusterConfig?.num_workers !== undefined && clusterConfig.num_workers < 4) {
        remediationSteps.push('Consider scaling up the cluster from ' + clusterConfig.num_workers + ' to 4+ workers.');
      }
      break;

    case 'Timeout':
      severity = 'MEDIUM';
      rootCause = {
        category: 'Timeout / Deadline Exceeded',
        summary: 'The job or a task within it exceeded the configured time limit.',
        detail: 'A long-running query or external service call did not complete within the allowed window. This can be caused by data skew, inefficient queries, or external dependency latency.',
      };
      remediationSteps = [
        'Increase the timeout configuration for the job or the specific task.',
        'Optimize the slow query: check execution plan with EXPLAIN and look for full table scans or Cartesian joins.',
        'If waiting on an external service, add retry logic with exponential backoff.',
        'Check for data skew using `spark.sql.adaptive.skewJoin.enabled=true`.',
        'Partition the workload into smaller batches if processing a large date range.',
      ];
      break;

    case 'Permission Error':
      severity = 'HIGH';
      rootCause = {
        category: 'Permission / Access Denied',
        summary: 'The job\'s service principal or user account lacks required permissions.',
        detail: extractPermissionDetail(combinedError),
      };
      remediationSteps = [
        'Grant the required permission to the job\'s run-as identity (service principal or user).',
        'Use Unity Catalog: run `GRANT SELECT ON TABLE <table> TO <principal>` for the affected table.',
        'If using a service principal, verify it has the correct workspace and catalog-level permissions.',
        'Check if a recent permission change or table migration removed access.',
        'For cross-workspace access, ensure the external location and storage credentials are properly configured.',
      ];
      break;

    case 'Resource Not Found':
      severity = 'HIGH';
      rootCause = {
        category: 'Resource Not Found',
        summary: 'A required table, view, file, or resource does not exist.',
        detail: extractNotFoundDetail(combinedError),
      };
      remediationSteps = [
        'Verify the referenced table/view exists: run `SHOW TABLES IN <schema>` to check.',
        'If the table was recently renamed or moved, update the job\'s SQL/notebook to reference the new path.',
        'If the table depends on an upstream pipeline, check that the upstream job completed successfully before this job runs.',
        'Add a dependency check task at the start of the workflow: `spark.catalog.tableExists("catalog.schema.table")`.',
        'If the table was dropped, restore from a Delta time travel snapshot: `RESTORE TABLE <table> TO VERSION AS OF <version>`.',
      ];
      break;

    case 'Connection Error':
      severity = 'MEDIUM';
      rootCause = {
        category: 'Connection / Network Error',
        summary: 'The job could not connect to a required external service or resource.',
        detail: extractConnectionDetail(combinedError),
      };
      remediationSteps = [
        'Check if the target service is healthy and reachable from the Databricks workspace VPC/VNet.',
        'Verify network security group / firewall rules allow traffic from the cluster\'s subnet to the target service.',
        'If using a private endpoint, ensure DNS resolution is correctly configured.',
        'Add retry logic with exponential backoff for transient network failures.',
        'Check if the service URL or port has changed in a recent deployment.',
        'If using a VPN or peering connection, verify the route tables are correct.',
      ];
      break;

    case 'Schema/Data Error':
      severity = 'MEDIUM';
      rootCause = {
        category: 'Schema / Data Mismatch',
        summary: 'The job encountered an unexpected schema change or data type incompatibility.',
        detail: extractSchemaDetail(combinedError),
      };
      remediationSteps = [
        'Compare the current table schema with what the job expects: run `DESCRIBE TABLE <table>` to see current columns.',
        'If a column was renamed or removed upstream, update the job\'s SQL/transformations to match.',
        'Add schema evolution handling: use `mergeSchema` option for Delta writes or explicit CAST expressions.',
        'Implement a schema validation step at the start of the pipeline to fail fast with clear errors.',
        'If using Delta Lake, check recent schema changes with `DESCRIBE HISTORY <table>`.',
      ];
      break;

    case 'Cluster/Infrastructure':
      severity = 'HIGH';
      rootCause = {
        category: 'Cluster / Infrastructure',
        summary: 'The cluster could not start or a cloud provider infrastructure issue occurred.',
        detail: 'The cloud provider was unable to provision the requested resources. This often happens with spot/preemptible instances during high-demand periods.',
      };
      remediationSteps = [
        'Switch from spot instances to on-demand for production-critical jobs.',
        'Configure a fallback node type: use instance pools or the `first_on_demand` setting.',
        'Spread across multiple availability zones to increase capacity availability.',
        'Reduce the required cluster size or enable autoscaling with a smaller minimum.',
        'Schedule the job during off-peak hours if the workload allows it.',
        'Use an instance pool to pre-warm instances and reduce provisioning failures.',
      ];
      break;

    case 'Dependency Failure':
      severity = 'MEDIUM';
      rootCause = {
        category: 'Dependency / Upstream Failure',
        summary: 'A required upstream task or job failed, causing this task to be skipped or fail.',
        detail: 'One or more tasks in the workflow depend on a predecessor that did not complete successfully. The actual root cause is in the upstream task.',
      };
      remediationSteps = [
        'Investigate and fix the upstream task that originally failed (see task_failures for details).',
        'If the upstream failure is transient, configure task-level retries in the workflow definition.',
        'Consider adding `depends_on` conditions with `outcome: "all_done"` if downstream tasks can handle missing input.',
        'Add alerting on the upstream job so failures are caught earlier.',
      ];
      break;

    default:
      severity = 'MEDIUM';
      rootCause = {
        category: 'Application Error',
        summary: 'The job failed due to an application-level error in the code or configuration.',
        detail: errorMessage,
      };
      remediationSteps = [
        'Review the full error stack trace in the run\'s driver logs for the exact failure point.',
        'Check if any recent code changes were deployed before this failure started.',
        'Verify all required libraries and dependencies are installed on the cluster.',
        'Test the notebook/script interactively on a development cluster to reproduce and debug.',
        'Add logging and error handling around the failing section of code.',
      ];
  }

  // Add historical context to RCA
  let recurrenceAnalysis: string | null = null;
  if (historicalAnalysis?.is_recurring) {
    const dominant = Object.entries(historicalAnalysis.recurring_error_patterns)
      .sort(([, a]: any, [, b]: any) => b - a)[0];
    recurrenceAnalysis = `This is a RECURRING issue. The "${dominant?.[0]}" error has occurred ${dominant?.[1]} times in the last ${historicalAnalysis.recent_runs_analyzed} runs (${historicalAnalysis.failure_rate} failure rate).`;
    if (historicalAnalysis.last_success) {
      recurrenceAnalysis += ` Last successful run: ${historicalAnalysis.last_success}.`;
    }
  }

  return {
    run_id,
    job_name: runData.run_name || `Job ${runData.job_id}`,
    job_id: runData.job_id,
    result_state: runData.state?.result_state,
    severity,
    root_cause: rootCause,
    failed_tasks: failedTasks,
    error_message: errorMessage,
    error_trace_summary: errorTrace ? errorTrace.split('\n').slice(0, 10).join('\n') : null,
    cluster_config: clusterConfig,
    historical_analysis: historicalAnalysis,
    recurrence_analysis: recurrenceAnalysis,
    remediation_steps: remediationSteps,
  };
}

function extractOOMDetail(error: string, clusterConfig: any): string {
  let detail = 'The JVM or Python process exhausted its heap memory.';
  if (error.includes('gc overhead')) detail += ' Garbage collection overhead exceeded the threshold.';
  if (error.includes('shuffle')) detail += ' The OOM occurred during a shuffle write, likely due to a large join or aggregation.';
  if (error.includes('broadcast')) detail += ' A broadcast variable exceeded the available memory. Consider disabling broadcast joins for large tables.';
  if (clusterConfig) {
    detail += ` Current cluster: ${clusterConfig.node_type || 'unknown'} with ${clusterConfig.num_workers ?? 'unknown'} workers.`;
  }
  return detail;
}

function extractPermissionDetail(error: string): string {
  const tableMatch = error.match(/on\s+([\w.]+)/);
  const userMatch = error.match(/user\s+([\w@.]+)/i);
  let detail = 'The executing identity does not have the required privileges.';
  if (userMatch) detail += ` Principal: ${userMatch[1]}.`;
  if (tableMatch) detail += ` Target object: ${tableMatch[1]}.`;
  return detail;
}

function extractNotFoundDetail(error: string): string {
  const tableMatch = error.match(/([\w]+\.[\w]+\.[\w]+)/);
  let detail = 'A referenced resource does not exist at the expected path.';
  if (tableMatch) detail += ` Missing resource: ${tableMatch[1]}.`;
  return detail;
}

function extractConnectionDetail(error: string): string {
  const hostMatch = error.match(/(https?:\/\/[^\s,]+|[\w.-]+:\d+)/);
  let detail = 'A network connection to an external service failed.';
  if (hostMatch) detail += ` Target endpoint: ${hostMatch[1]}.`;
  if (error.includes('timed out')) detail += ' The connection attempt timed out.';
  if (error.includes('refused')) detail += ' The connection was actively refused by the target.';
  return detail;
}

function extractSchemaDetail(error: string): string {
  const colMatch = error.match(/column\s+'?([\w]+)'?/i);
  const tableMatch = error.match(/([\w]+\.[\w]+\.[\w]+)/);
  let detail = 'The schema of a table or data source does not match expectations.';
  if (colMatch) detail += ` Problem column: ${colMatch[1]}.`;
  if (tableMatch) detail += ` In table: ${tableMatch[1]}.`;
  return detail;
}

// ── Mock Job Run Logs ────────────────────────────────────────────

function getMockJobRunLogs(run_id: number, log_type: string, _maxLines: number): string {
  const mockLogs: Record<number, any> = {
    10234: {
      run_id: 10234,
      job_name: 'etl_sales_daily_ingestion',
      result_state: 'FAILED',
      state_message: 'java.lang.OutOfMemoryError: GC overhead limit exceeded during shuffle write for sales_transactions merge.',
      cluster_id: 'cluster-0912-prod',
      log_type,
      logs: {
        error_trace: [
          'java.lang.OutOfMemoryError: GC overhead limit exceeded',
          '  at java.util.Arrays.copyOf(Arrays.java:3236)',
          '  at java.util.ArrayList.grow(ArrayList.java:265)',
          '  at org.apache.spark.sql.execution.UnsafeExternalSorter.growPointerArrayIfNecessary(UnsafeExternalSorter.java:192)',
          '  at org.apache.spark.sql.execution.UnsafeExternalSorter.insertRecord(UnsafeExternalSorter.java:210)',
          '  at org.apache.spark.sql.execution.joins.SortMergeJoinExec$$anonfun$doExecute$1.apply(SortMergeJoinExec.java:421)',
          '',
          'Caused by: Large shuffle write during MERGE INTO toyota_production.sales.transactions',
          '  Target table has 45M rows, source has 2.1M rows',
          '  Estimated shuffle size: 18.4 GB',
          '  Available executor memory: 8 GB per executor',
          '',
          'Driver stacktrace:',
          '  at org.apache.spark.scheduler.DAGScheduler.failJobAndIndependentStages(DAGScheduler.scala:2454)',
          '  at org.apache.spark.scheduler.DAGScheduler.abortStage(DAGScheduler.scala:2410)',
          '  at org.apache.spark.scheduler.DAGScheduler$$anonfun$handleTaskSetFailed$1.apply(DAGScheduler.scala:1168)',
        ].join('\n'),
        driver_stderr: [
          '2026-03-12T06:15:32.445Z WARN  [main] SparkContext: Executor 3 lost: GC overhead limit',
          '2026-03-12T06:15:32.890Z WARN  [main] SparkContext: Executor 1 lost: GC overhead limit',
          '2026-03-12T06:15:33.201Z ERROR [main] TaskSetManager: Task 42 in stage 8.0 failed 4 times; aborting job',
          '2026-03-12T06:15:33.445Z ERROR [main] DeltaMergeInto: MERGE operation failed for toyota_production.sales.transactions',
          '2026-03-12T06:15:33.501Z INFO  [main] ShutdownHookManager: Shutdown hook called',
        ].join('\n'),
        task_logs: [
          {
            task_key: 'merge_sales_transactions',
            result_state: 'FAILED',
            error: 'OutOfMemoryError: GC overhead limit exceeded',
            error_trace: 'java.lang.OutOfMemoryError: GC overhead limit exceeded\n  at SortMergeJoinExec.doExecute(SortMergeJoinExec.java:421)',
            logs: 'Processing 2,100,000 source records against 45,000,000 target records\nShuffle write: 18.4 GB\nExecutor memory: 8g (configured), 7.2g (usable)\nGC time exceeded 98% of total execution time',
          },
        ],
        cluster_events: [
          { type: 'DRIVER_HEALTHY', timestamp: '2026-03-12T05:45:00.000Z', details: { cluster_id: 'cluster-0912-prod' } },
          { type: 'SPARK_EXCEPTION', timestamp: '2026-03-12T06:15:32.000Z', details: { exception: 'OutOfMemoryError' } },
          { type: 'DRIVER_NOT_RESPONDING', timestamp: '2026-03-12T06:15:35.000Z', details: {} },
        ],
      },
    },
    10231: {
      run_id: 10231,
      job_name: 'ml_customer_churn_prediction',
      result_state: 'FAILED',
      state_message: "ModuleNotFoundError: No module named 'xgboost'. Ensure the library is installed on the cluster.",
      cluster_id: 'cluster-ml-0912',
      log_type,
      logs: {
        error_trace: [
          'Traceback (most recent call last):',
          '  File "/Workspace/Users/data_science/churn_prediction.py", line 14, in <module>',
          '    import xgboost as xgb',
          "ModuleNotFoundError: No module named 'xgboost'",
          '',
          'During handling of the above exception, another exception occurred:',
          '',
          'Traceback (most recent call last):',
          '  File "/Workspace/Users/data_science/churn_prediction.py", line 17, in <module>',
          "    raise RuntimeError('Required library xgboost is not installed. Add it to the cluster libraries or init script.')",
          "RuntimeError: Required library xgboost is not installed. Add it to the cluster libraries or init script.",
        ].join('\n'),
        driver_stderr: [
          '2026-03-12T02:30:01.000Z INFO  [main] Cluster started with runtime: 14.3.x-ml-scala2.12',
          '2026-03-12T02:30:15.000Z INFO  [main] Installed libraries: pandas==2.1.0, numpy==1.25.2, scikit-learn==1.3.0, mlflow==2.8.0',
          '2026-03-12T02:30:15.500Z WARN  [main] Library xgboost not found in cluster packages',
          '2026-03-12T02:30:16.000Z ERROR [main] ModuleNotFoundError: No module named \'xgboost\'',
        ].join('\n'),
        task_logs: [
          {
            task_key: 'train_model',
            result_state: 'FAILED',
            error: "ModuleNotFoundError: No module named 'xgboost'",
            error_trace: null,
            logs: 'Attempting to import required ML libraries...\nFailed at: import xgboost as xgb',
          },
        ],
        cluster_events: [
          { type: 'CREATING', timestamp: '2026-03-12T02:28:00.000Z', details: { cluster_id: 'cluster-ml-0912' } },
          { type: 'RUNNING', timestamp: '2026-03-12T02:30:00.000Z', details: {} },
          { type: 'TERMINATING', timestamp: '2026-03-12T02:36:00.000Z', details: { reason: 'JOB_FINISHED' } },
        ],
      },
    },
    10228: {
      run_id: 10228,
      job_name: 'etl_inventory_sync',
      result_state: 'FAILED',
      state_message: "AnalysisException: Column 'warehouse_code' does not exist in table toyota_production.inventory.vehicle_stock.",
      cluster_id: 'cluster-0912-prod',
      log_type,
      logs: {
        error_trace: [
          'org.apache.spark.sql.AnalysisException: [UNRESOLVED_COLUMN.WITH_SUGGESTION]',
          "  A column or function parameter with name `warehouse_code` cannot be resolved.",
          '  Did you mean one of the following? [`vin`, `model_name`, `model_year`, `trim_level`, `dealer_id`, `status`]',
          '',
          '  at org.apache.spark.sql.catalyst.analysis.CheckAnalysis.failAnalysis(CheckAnalysis.scala:51)',
          '  at org.apache.spark.sql.catalyst.analysis.Analyzer$ResolveReferences$.apply(Analyzer.scala:1124)',
          '',
          "  SQL query: SELECT vin, model_name, warehouse_code, dealer_id FROM toyota_production.inventory.vehicle_stock WHERE status = 'Available'",
        ].join('\n'),
        driver_stderr: [
          '2026-03-12T00:15:00.000Z INFO  [main] Starting inventory sync pipeline',
          '2026-03-12T00:15:05.000Z INFO  [main] Reading from toyota_production.inventory.vehicle_stock',
          '2026-03-12T00:15:06.000Z ERROR [main] AnalysisException: column warehouse_code not found',
          "2026-03-12T00:15:06.100Z INFO  [main] Available columns: [vin, model_name, model_year, trim_level, exterior_color, interior_color, dealer_id, arrival_date, days_on_lot, status, msrp, invoice_price]",
          '2026-03-12T00:15:06.200Z ERROR [main] Pipeline failed at step: transform_inventory',
        ].join('\n'),
        task_logs: [
          {
            task_key: 'transform_inventory',
            result_state: 'FAILED',
            error: "Column 'warehouse_code' does not exist",
            error_trace: null,
            logs: "Reading source table... OK\nApplying transformations...\nFailed: column 'warehouse_code' referenced in transformation SQL does not exist.\nHint: This column may have been removed in a recent schema migration. Check DESCRIBE HISTORY for the table.",
          },
        ],
        cluster_events: [],
      },
    },
    10225: {
      run_id: 10225,
      job_name: 'data_quality_monitoring',
      result_state: 'FAILED',
      state_message: 'Connection refused: Unable to reach external validation API at https://validation-svc.internal:8443.',
      cluster_id: 'cluster-0912-prod',
      log_type,
      logs: {
        error_trace: [
          'java.net.ConnectException: Connection refused (Connection refused)',
          '  at java.net.PlainSocketImpl.socketConnect(Native Method)',
          '  at java.net.AbstractPlainSocketImpl.doConnect(AbstractPlainSocketImpl.java:350)',
          '  at java.net.Socket.connect(Socket.java:621)',
          '',
          'Target: https://validation-svc.internal:8443/api/v1/validate',
          'Timeout: 30000ms',
          'Retries attempted: 3',
          '',
          'java.util.concurrent.TimeoutException: Futures timed out after [30000 milliseconds]',
        ].join('\n'),
        driver_stderr: [
          '2026-03-11T18:30:00.000Z INFO  Starting data quality monitoring run',
          '2026-03-11T18:30:05.000Z INFO  Profiling tables... OK (5 tables profiled)',
          '2026-03-11T18:30:10.000Z INFO  Checking referential integrity...',
          '2026-03-11T18:30:10.100Z INFO  Connecting to validation service: https://validation-svc.internal:8443',
          '2026-03-11T18:30:40.100Z WARN  Connection attempt 1 failed: Connection refused',
          '2026-03-11T18:31:10.100Z WARN  Connection attempt 2 failed: Connection refused',
          '2026-03-11T18:31:40.100Z WARN  Connection attempt 3 failed: Connection refused',
          '2026-03-11T18:31:40.200Z ERROR All retry attempts exhausted. Failing task.',
        ].join('\n'),
        task_logs: [
          {
            task_key: 'validate_referential_integrity',
            result_state: 'FAILED',
            error: 'Connection timed out to validation-svc.internal:8443',
            error_trace: null,
            logs: 'Profiling complete. Starting validation...\n3 connection attempts failed over 90 seconds.\nThe validation service may be down or unreachable from this cluster subnet.',
          },
          {
            task_key: 'report_quality_scores',
            result_state: 'UPSTREAM_FAILED',
            error: 'Dependency validate_referential_integrity failed',
            error_trace: null,
            logs: 'Skipped: upstream dependency failed.',
          },
        ],
        cluster_events: [],
      },
    },
    10222: {
      run_id: 10222,
      job_name: 'etl_sales_daily_ingestion',
      result_state: 'FAILED',
      state_message: 'PERMISSION_DENIED: User etl_service_account does not have SELECT permission on toyota_production.sales.monthly_targets.',
      cluster_id: 'cluster-0912-prod',
      log_type,
      logs: {
        error_trace: [
          'com.databricks.sql.managedcatalog.acl.UnauthorizedAccessException:',
          '  PERMISSION_DENIED: User `etl_service_account` does not have `SELECT` privilege on table `toyota_production.sales.monthly_targets`.',
          '',
          '  Required privilege: SELECT',
          '  Principal: etl_service_account (SERVICE_PRINCIPAL)',
          '  Object: toyota_production.sales.monthly_targets',
          '  Owner: data_engineering',
          '',
          '  To grant access, a catalog/schema owner or admin must run:',
          '    GRANT SELECT ON TABLE toyota_production.sales.monthly_targets TO `etl_service_account`;',
        ].join('\n'),
        driver_stderr: [
          '2026-03-11T05:00:00.000Z INFO  Starting daily sales ingestion',
          '2026-03-11T05:00:02.000Z INFO  Loading sales transactions... OK',
          '2026-03-11T05:00:05.000Z INFO  Loading monthly targets...',
          '2026-03-11T05:00:05.500Z ERROR PERMISSION_DENIED on toyota_production.sales.monthly_targets',
          '2026-03-11T05:00:05.600Z ERROR Task load_monthly_targets failed',
        ].join('\n'),
        task_logs: [
          {
            task_key: 'load_monthly_targets',
            result_state: 'FAILED',
            error: 'PERMISSION_DENIED on toyota_production.sales.monthly_targets',
            error_trace: null,
            logs: 'Attempting SELECT from toyota_production.sales.monthly_targets\nPrincipal: etl_service_account\nRequired: SELECT privilege\nStatus: DENIED',
          },
        ],
        cluster_events: [],
      },
    },
    10219: {
      run_id: 10219,
      job_name: 'reporting_dealer_scorecards',
      result_state: 'FAILED',
      state_message: 'Cloud provider (AWS) reported: Spot instance capacity unavailable.',
      cluster_id: null,
      log_type,
      logs: {
        error_trace: [
          'com.databricks.backend.manager.util.UnknownWorkerEnvironmentException:',
          '  Cloud provider launch failure: AWS reported InsufficientInstanceCapacity',
          '',
          '  Requested: 4x r5.2xlarge spot instances in us-east-1a',
          '  Available: 0',
          '',
          '  The cloud provider could not fulfill the spot instance request.',
          '  This typically occurs during peak demand periods.',
        ].join('\n'),
        driver_stderr: '',
        task_logs: [],
        cluster_events: [
          { type: 'CREATING', timestamp: '2026-03-10T20:00:00.000Z', details: { cluster_id: 'cluster-report-0910' } },
          { type: 'CREATE_FAILED', timestamp: '2026-03-10T20:01:30.000Z', details: { reason: 'CLOUD_PROVIDER_LAUNCH_FAILURE', aws_error: 'InsufficientInstanceCapacity' } },
        ],
      },
    },
    10217: {
      run_id: 10217,
      job_name: 'etl_manufacturing_quality_rollup',
      result_state: 'FAILED',
      state_message: 'DeltaTableNotFound: Table toyota_production.manufacturing.defect_analysis does not exist.',
      cluster_id: 'cluster-0912-prod',
      log_type,
      logs: {
        error_trace: [
          'io.delta.exceptions.DeltaTableNotFoundError:',
          '  Table `toyota_production.manufacturing.defect_analysis` does not exist.',
          '',
          '  at io.delta.tables.DeltaTable$.forName(DeltaTable.scala:108)',
          '  at spark_sql_query_execution$$anonfun$1.apply(query.scala:52)',
          '',
          '  This table was expected to be created by the upstream pipeline `etl_defect_ingestion`.',
          '  Check if the upstream pipeline has been run and completed successfully.',
        ].join('\n'),
        driver_stderr: [
          '2026-03-10T08:00:00.000Z INFO  Starting manufacturing quality rollup',
          '2026-03-10T08:00:02.000Z INFO  Reading from toyota_production.manufacturing.defect_analysis...',
          '2026-03-10T08:00:02.500Z ERROR DeltaTableNotFoundError: Table does not exist',
          '2026-03-10T08:00:02.600Z INFO  This table should be created by: etl_defect_ingestion (Job ID: 510)',
          '2026-03-10T08:00:02.700Z ERROR Aborting pipeline: missing required upstream table',
        ].join('\n'),
        task_logs: [
          {
            task_key: 'aggregate_defects',
            result_state: 'FAILED',
            error: 'Table toyota_production.manufacturing.defect_analysis does not exist',
            error_trace: null,
            logs: 'Expected upstream table: toyota_production.manufacturing.defect_analysis\nCreated by: etl_defect_ingestion (Job 510)\nStatus: TABLE NOT FOUND\nLast known existence: never (table has not been created yet)',
          },
          {
            task_key: 'build_quality_report',
            result_state: 'UPSTREAM_FAILED',
            error: 'Dependency aggregate_defects failed',
            error_trace: null,
            logs: 'Skipped: upstream dependency aggregate_defects failed.',
          },
        ],
        cluster_events: [],
      },
    },
  };

  // Return matching mock or a generic response
  if (mockLogs[run_id]) {
    return JSON.stringify(mockLogs[run_id]);
  }

  return JSON.stringify({
    run_id,
    job_name: 'Unknown Job',
    result_state: 'UNKNOWN',
    state_message: 'No log data available for this run ID in demo mode.',
    cluster_id: null,
    log_type,
    logs: {
      error_trace: 'No logs available. Use a valid run_id from get_job_failures results.',
      driver_stderr: '',
      task_logs: [],
      cluster_events: [],
    },
  });
}

// ── Mock Job Run RCA ─────────────────────────────────────────────

function getMockJobRunRCA(run_id: number): string {
  const mockRCAs: Record<number, any> = {
    10234: {
      run_id: 10234,
      job_name: 'etl_sales_daily_ingestion',
      job_id: 501,
      result_state: 'FAILED',
      severity: 'HIGH',
      root_cause: {
        category: 'Out of Memory',
        summary: 'The job ran out of available memory (heap space) during execution.',
        detail: 'The JVM or Python process exhausted its heap memory. Garbage collection overhead exceeded the threshold. The OOM occurred during a shuffle write, likely due to a large join or aggregation. Current cluster: r5.2xlarge with 3 workers.',
      },
      failed_tasks: [
        { task_key: 'merge_sales_transactions', result_state: 'FAILED', error_message: 'OutOfMemoryError: GC overhead limit exceeded' },
      ],
      error_message: 'java.lang.OutOfMemoryError: GC overhead limit exceeded during shuffle write for sales_transactions merge.',
      error_trace_summary: 'java.lang.OutOfMemoryError: GC overhead limit exceeded\n  at java.util.Arrays.copyOf(Arrays.java:3236)\n  at org.apache.spark.sql.execution.UnsafeExternalSorter.growPointerArrayIfNecessary\n  at org.apache.spark.sql.execution.joins.SortMergeJoinExec',
      cluster_config: {
        cluster_name: 'etl-prod-cluster',
        node_type: 'r5.2xlarge',
        driver_node_type: 'r5.2xlarge',
        num_workers: 3,
        autoscale: null,
        spark_version: '14.3.x-scala2.12',
        spark_conf: { 'spark.driver.memory': '8g', 'spark.executor.memory': '8g', 'spark.sql.shuffle.partitions': '200' },
        custom_tags: {},
      },
      historical_analysis: {
        recent_runs_analyzed: 14,
        recent_failures: 4,
        recent_successes: 10,
        failure_rate: '28.6%',
        recurring_error_patterns: { 'Out of Memory': 3, 'Permission Error': 1 },
        is_recurring: true,
        last_success: '2026-03-12T03:30:00.000Z',
      },
      recurrence_analysis: 'This is a RECURRING issue. The "Out of Memory" error has occurred 3 times in the last 14 runs (28.6% failure rate). Last successful run: 2026-03-12T03:30:00.000Z.',
      remediation_steps: [
        'Increase driver/executor memory: adjust `spark.driver.memory` and `spark.executor.memory` from 8g to 16g in the cluster Spark configuration.',
        'Use a larger node type for the cluster (e.g., switch from r5.2xlarge to r5.4xlarge for double the memory).',
        'Optimize the MERGE query: the source (2.1M rows) against target (45M rows) is causing an 18.4 GB shuffle. Consider pre-filtering the target to only matching keys.',
        'Enable disk-based shuffle: set `spark.sql.shuffle.partitions` from 200 to 400+ and ensure adequate local disk.',
        'For the merge operation, consider salting skewed keys or partitioning the merge by date range.',
        'Add `spark.sql.adaptive.enabled=true` to let Spark auto-optimize shuffle partitions.',
        'Consider scaling up the cluster from 3 to 4+ workers.',
      ],
    },
    10231: {
      run_id: 10231,
      job_name: 'ml_customer_churn_prediction',
      job_id: 502,
      result_state: 'FAILED',
      severity: 'MEDIUM',
      root_cause: {
        category: 'Application Error',
        summary: 'A required Python library (xgboost) is not installed on the cluster.',
        detail: "The job's Python script imports xgboost, but the library is not available in the cluster environment. The cluster uses runtime 14.3.x-ml-scala2.12 which includes pandas, numpy, scikit-learn, and mlflow, but does not include xgboost by default.",
      },
      failed_tasks: [
        { task_key: 'train_model', result_state: 'FAILED', error_message: "ModuleNotFoundError: No module named 'xgboost'" },
      ],
      error_message: "ModuleNotFoundError: No module named 'xgboost'. Ensure the library is installed on the cluster.",
      error_trace_summary: "Traceback (most recent call last):\n  File \"/Workspace/Users/data_science/churn_prediction.py\", line 14\n    import xgboost as xgb\nModuleNotFoundError: No module named 'xgboost'",
      cluster_config: {
        cluster_name: 'ml-training-cluster',
        node_type: 'g5.2xlarge',
        driver_node_type: 'g5.2xlarge',
        num_workers: 2,
        autoscale: null,
        spark_version: '14.3.x-ml-scala2.12',
        spark_conf: {},
        custom_tags: { team: 'data_science' },
      },
      historical_analysis: {
        recent_runs_analyzed: 8,
        recent_failures: 3,
        recent_successes: 5,
        failure_rate: '37.5%',
        recurring_error_patterns: { 'Other': 3 },
        is_recurring: true,
        last_success: '2026-03-09T14:00:00.000Z',
      },
      recurrence_analysis: 'This is a RECURRING issue. The same module import error has occurred 3 times in the last 8 runs (37.5% failure rate). Last successful run was before the cluster was reprovisioned on March 9.',
      remediation_steps: [
        'Install xgboost on the cluster: go to Compute > cluster-ml-0912 > Libraries > Install New > PyPI > "xgboost".',
        'Alternatively, add to the job\'s task configuration: set `libraries: [{pypi: {package: "xgboost"}}]` in the task definition.',
        'For a permanent fix, add xgboost to the cluster init script: `pip install xgboost` in the init script.',
        'Pin the version for reproducibility: use `xgboost==2.0.3` to match the version used in development.',
        'Verify all required libraries by running `pip list` on the cluster before submitting the job.',
      ],
    },
    10228: {
      run_id: 10228,
      job_name: 'etl_inventory_sync',
      job_id: 503,
      result_state: 'FAILED',
      severity: 'MEDIUM',
      root_cause: {
        category: 'Schema / Data Mismatch',
        summary: 'The job encountered an unexpected schema change or data type incompatibility.',
        detail: "The schema of a table or data source does not match expectations. Problem column: warehouse_code. In table: toyota_production.inventory.vehicle_stock. The column 'warehouse_code' was referenced in the ETL SQL but does not exist in the table schema. It may have been removed or renamed in a recent schema migration.",
      },
      failed_tasks: [
        { task_key: 'transform_inventory', result_state: 'FAILED', error_message: "Column 'warehouse_code' does not exist" },
      ],
      error_message: "AnalysisException: Column 'warehouse_code' does not exist in table toyota_production.inventory.vehicle_stock.",
      error_trace_summary: "org.apache.spark.sql.AnalysisException: [UNRESOLVED_COLUMN.WITH_SUGGESTION]\n  A column or function parameter with name `warehouse_code` cannot be resolved.\n  Did you mean one of: [`vin`, `model_name`, `model_year`, `trim_level`, `dealer_id`, `status`]",
      cluster_config: {
        cluster_name: 'etl-prod-cluster',
        node_type: 'r5.2xlarge',
        driver_node_type: 'r5.2xlarge',
        num_workers: 3,
        autoscale: null,
        spark_version: '14.3.x-scala2.12',
        spark_conf: {},
        custom_tags: {},
      },
      historical_analysis: {
        recent_runs_analyzed: 10,
        recent_failures: 2,
        recent_successes: 8,
        failure_rate: '20.0%',
        recurring_error_patterns: { 'Schema/Data Error': 2 },
        is_recurring: true,
        last_success: '2026-03-10T12:00:00.000Z',
      },
      recurrence_analysis: 'This is a RECURRING issue. The "Schema/Data Error" error has occurred 2 times in the last 10 runs (20.0% failure rate). Last successful run: 2026-03-10T12:00:00.000Z. The column was likely removed between March 10-11.',
      remediation_steps: [
        "Compare the current table schema with the job's expectations: run `DESCRIBE TABLE toyota_production.inventory.vehicle_stock` to see current columns.",
        "Update the job's SQL to remove or replace the reference to `warehouse_code`. If the column was renamed, use the new name.",
        'Check recent schema changes with `DESCRIBE HISTORY toyota_production.inventory.vehicle_stock` to find when and who removed the column.',
        "If the column is needed, coordinate with the upstream team to add it back or provide an alternative.",
        'Implement a schema validation step at the start of the pipeline: `spark.catalog.listColumns("toyota_production.inventory.vehicle_stock")` to fail fast with clear errors.',
        'Add `mergeSchema` option for Delta writes to handle gradual schema evolution.',
      ],
    },
    10225: {
      run_id: 10225,
      job_name: 'data_quality_monitoring',
      job_id: 504,
      result_state: 'FAILED',
      severity: 'MEDIUM',
      root_cause: {
        category: 'Connection / Network Error',
        summary: 'The job could not connect to a required external service or resource.',
        detail: 'A network connection to an external service failed. Target endpoint: https://validation-svc.internal:8443. The connection was actively refused by the target. The validation service may have been down or the network path is blocked.',
      },
      failed_tasks: [
        { task_key: 'validate_referential_integrity', result_state: 'FAILED', error_message: 'Connection timed out to validation-svc.internal:8443' },
        { task_key: 'report_quality_scores', result_state: 'UPSTREAM_FAILED', error_message: 'Dependency validate_referential_integrity failed' },
      ],
      error_message: 'Connection refused: Unable to reach external validation API at https://validation-svc.internal:8443.',
      error_trace_summary: 'java.net.ConnectException: Connection refused\n  at java.net.PlainSocketImpl.socketConnect\nTarget: https://validation-svc.internal:8443/api/v1/validate\nTimeout: 30000ms\nRetries attempted: 3',
      cluster_config: {
        cluster_name: 'etl-prod-cluster',
        node_type: 'r5.2xlarge',
        driver_node_type: 'r5.2xlarge',
        num_workers: 3,
        autoscale: null,
        spark_version: '14.3.x-scala2.12',
        spark_conf: {},
        custom_tags: {},
      },
      historical_analysis: {
        recent_runs_analyzed: 12,
        recent_failures: 1,
        recent_successes: 11,
        failure_rate: '8.3%',
        recurring_error_patterns: { 'Connection Error': 1 },
        is_recurring: false,
        last_success: '2026-03-11T12:00:00.000Z',
      },
      recurrence_analysis: null,
      remediation_steps: [
        'Check if the validation service (validation-svc.internal:8443) is healthy and running.',
        "Verify network security group / firewall rules allow traffic from the Databricks cluster's subnet to the service.",
        'If using a private endpoint, ensure DNS resolution for validation-svc.internal resolves correctly from the cluster.',
        'The retry logic exhausted 3 attempts. Consider increasing retries or adding longer backoff intervals.',
        'Check if the service URL or port has changed in a recent deployment.',
        'As a workaround, make the validation step optional: configure it to warn instead of fail when the service is unreachable.',
      ],
    },
    10222: {
      run_id: 10222,
      job_name: 'etl_sales_daily_ingestion',
      job_id: 501,
      result_state: 'FAILED',
      severity: 'HIGH',
      root_cause: {
        category: 'Permission / Access Denied',
        summary: "The job's service principal or user account lacks required permissions.",
        detail: 'The executing identity does not have the required privileges. Principal: etl_service_account. Target object: toyota_production.sales.monthly_targets.',
      },
      failed_tasks: [
        { task_key: 'load_monthly_targets', result_state: 'FAILED', error_message: 'PERMISSION_DENIED on toyota_production.sales.monthly_targets' },
      ],
      error_message: 'PERMISSION_DENIED: User etl_service_account does not have SELECT permission on toyota_production.sales.monthly_targets.',
      error_trace_summary: 'com.databricks.sql.managedcatalog.acl.UnauthorizedAccessException:\n  PERMISSION_DENIED: User `etl_service_account` does not have `SELECT` privilege\n  on table `toyota_production.sales.monthly_targets`.',
      cluster_config: {
        cluster_name: 'etl-prod-cluster',
        node_type: 'r5.2xlarge',
        driver_node_type: 'r5.2xlarge',
        num_workers: 3,
        autoscale: null,
        spark_version: '14.3.x-scala2.12',
        spark_conf: {},
        custom_tags: {},
      },
      historical_analysis: {
        recent_runs_analyzed: 14,
        recent_failures: 4,
        recent_successes: 10,
        failure_rate: '28.6%',
        recurring_error_patterns: { 'Out of Memory': 3, 'Permission Error': 1 },
        is_recurring: false,
        last_success: '2026-03-12T03:30:00.000Z',
      },
      recurrence_analysis: null,
      remediation_steps: [
        'Grant SELECT permission: run `GRANT SELECT ON TABLE toyota_production.sales.monthly_targets TO `etl_service_account`;` as a catalog/schema owner or admin.',
        'Verify the service principal etl_service_account is the correct run-as identity for this job.',
        'Check if a recent permission change or table ownership transfer removed access. Use `get_audit_logs` to find recent GRANT/REVOKE events.',
        'For broader access, consider granting at the schema level: `GRANT SELECT ON SCHEMA toyota_production.sales TO `etl_service_account`;`.',
        'Review the job\'s run-as configuration to ensure it uses the correct service principal.',
      ],
    },
    10219: {
      run_id: 10219,
      job_name: 'reporting_dealer_scorecards',
      job_id: 505,
      result_state: 'FAILED',
      severity: 'HIGH',
      root_cause: {
        category: 'Cluster / Infrastructure',
        summary: 'The cluster could not start or a cloud provider infrastructure issue occurred.',
        detail: 'The cloud provider was unable to provision the requested resources. AWS reported InsufficientInstanceCapacity for 4x r5.2xlarge spot instances in us-east-1a.',
      },
      failed_tasks: [],
      error_message: 'Cloud provider (AWS) reported: Spot instance capacity unavailable.',
      error_trace_summary: 'com.databricks.backend.manager.util.UnknownWorkerEnvironmentException:\n  Cloud provider launch failure: AWS reported InsufficientInstanceCapacity\n  Requested: 4x r5.2xlarge spot instances in us-east-1a\n  Available: 0',
      cluster_config: null,
      historical_analysis: {
        recent_runs_analyzed: 10,
        recent_failures: 1,
        recent_successes: 9,
        failure_rate: '10.0%',
        recurring_error_patterns: { 'Cluster/Infrastructure': 1 },
        is_recurring: false,
        last_success: '2026-03-10T14:00:00.000Z',
      },
      recurrence_analysis: null,
      remediation_steps: [
        'Switch from spot instances to on-demand for this production-critical reporting job.',
        'Configure a fallback node type: set `first_on_demand: 1` to ensure the driver always uses on-demand, and add an instance pool as a fallback.',
        'Spread across multiple availability zones: allow us-east-1a, us-east-1b, and us-east-1c.',
        'Use an instance pool with pre-warmed instances to reduce provisioning failures.',
        'As a quick retry, simply re-run the job — spot capacity issues are often transient.',
        'Schedule the job during off-peak hours (early morning) when spot capacity is more available.',
      ],
    },
    10217: {
      run_id: 10217,
      job_name: 'etl_manufacturing_quality_rollup',
      job_id: 506,
      result_state: 'FAILED',
      severity: 'HIGH',
      root_cause: {
        category: 'Resource Not Found',
        summary: 'A required table, view, file, or resource does not exist.',
        detail: 'A referenced resource does not exist at the expected path. Missing resource: toyota_production.manufacturing.defect_analysis. This table is expected to be created by the upstream pipeline etl_defect_ingestion (Job 510), which appears to have never run or never completed successfully.',
      },
      failed_tasks: [
        { task_key: 'aggregate_defects', result_state: 'FAILED', error_message: 'Table toyota_production.manufacturing.defect_analysis does not exist' },
        { task_key: 'build_quality_report', result_state: 'UPSTREAM_FAILED', error_message: 'Dependency aggregate_defects failed' },
      ],
      error_message: 'DeltaTableNotFound: Table toyota_production.manufacturing.defect_analysis does not exist.',
      error_trace_summary: 'io.delta.exceptions.DeltaTableNotFoundError:\n  Table `toyota_production.manufacturing.defect_analysis` does not exist.\n  This table was expected to be created by upstream pipeline `etl_defect_ingestion`.',
      cluster_config: {
        cluster_name: 'etl-prod-cluster',
        node_type: 'r5.2xlarge',
        driver_node_type: 'r5.2xlarge',
        num_workers: 3,
        autoscale: null,
        spark_version: '14.3.x-scala2.12',
        spark_conf: {},
        custom_tags: {},
      },
      historical_analysis: {
        recent_runs_analyzed: 6,
        recent_failures: 6,
        recent_successes: 0,
        failure_rate: '100.0%',
        recurring_error_patterns: { 'Resource Not Found': 6 },
        is_recurring: true,
        last_success: null,
      },
      recurrence_analysis: 'This is a RECURRING issue. The "Resource Not Found" error has occurred 6 times in the last 6 runs (100.0% failure rate). This job has NEVER succeeded — the upstream table has never been created.',
      remediation_steps: [
        'Create or run the upstream pipeline etl_defect_ingestion (Job 510) to create the missing table toyota_production.manufacturing.defect_analysis.',
        'Verify the upstream job exists and is scheduled: check the Jobs list for Job ID 510.',
        'If the upstream job was recently created, run it manually first to bootstrap the table.',
        'Add a dependency between jobs: configure this workflow to trigger only after etl_defect_ingestion succeeds.',
        'As a safeguard, add a table existence check at the start: `IF NOT spark.catalog.tableExists(...)` then skip with a warning instead of failing.',
        'If the table design has changed, check with the data engineering team if defect_analysis was replaced with a different table.',
      ],
    },
  };

  if (mockRCAs[run_id]) {
    return JSON.stringify(mockRCAs[run_id]);
  }

  // Generic RCA for unknown run IDs
  return JSON.stringify({
    run_id,
    job_name: 'Unknown Job',
    job_id: null,
    result_state: 'UNKNOWN',
    severity: 'UNKNOWN',
    root_cause: {
      category: 'Unknown',
      summary: 'No RCA data available for this run ID in demo mode.',
      detail: 'Use a valid run_id from get_job_failures results to get detailed root cause analysis.',
    },
    failed_tasks: [],
    error_message: '',
    error_trace_summary: null,
    cluster_config: null,
    historical_analysis: null,
    recurrence_analysis: null,
    remediation_steps: ['Use get_job_failures to find valid run IDs, then call get_job_run_rca with a specific run_id.'],
  });
}

function handleListGovernedTags(input: { catalog?: string; tag_category?: string }): string {
  const { catalog, tag_category = 'all' } = input;
  return getMockGovernedTags(catalog, tag_category);
}

// ── Mock Governance Data Functions ────────────────────────────────

function getMockTableLineage(table_name: string, direction: string): string {
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
    'toyota_production.sales.transactions': {
      upstream: [
        { table: 's3://toyota-raw-data/sales/*.parquet', type: 'external', relationship: 'ingestion' },
      ],
      downstream: [
        { table: 'toyota_analytics.reporting.sales_summary', type: 'table', relationship: 'derived' },
        { table: 'toyota_analytics.customer_insights.purchase_history', type: 'table', relationship: 'derived' },
      ],
    },
    'toyota_analytics.customer_insights.satisfaction_surveys': {
      upstream: [
        { table: 's3://toyota-raw-data/surveys/*.json', type: 'external', relationship: 'ingestion' },
      ],
      downstream: [
        { table: 'toyota_analytics.reporting.dealer_performance', type: 'table', relationship: 'aggregated' },
      ],
    },
  };

  const data = lineageData[table_name] || { upstream: [], downstream: [], message: 'No lineage data available for this table' };
  
  if (direction === 'upstream') {
    return JSON.stringify({ table: table_name, upstream: data.upstream });
  } else if (direction === 'downstream') {
    return JSON.stringify({ table: table_name, downstream: data.downstream });
  }
  
  return JSON.stringify({ table: table_name, ...data });
}

function getMockTablePermissions(object_name: string, object_type: string): string {
  const permissions = {
    object: object_name,
    type: object_type,
    owner: 'data_engineering',
    grants: [
      { principal: 'data_analysts', type: 'GROUP', privileges: ['SELECT', 'USE_SCHEMA'] },
      { principal: 'data_scientists', type: 'GROUP', privileges: ['SELECT', 'USE_SCHEMA'] },
      { principal: 'etl_service_account', type: 'SERVICE_PRINCIPAL', privileges: ['SELECT', 'MODIFY', 'USE_SCHEMA'] },
      { principal: 'sales_team', type: 'GROUP', privileges: ['SELECT'] },
      { principal: 'compliance_auditors', type: 'GROUP', privileges: ['SELECT', 'USAGE'] },
    ],
    inherited_from: object_type === 'table' ? object_name.split('.').slice(0, 2).join('.') : null,
  };

  return JSON.stringify(permissions);
}

function getMockAuditLogs(object_name: string | undefined, event_type: string, time_range: string): string {
  const now = new Date();
  const logs = [
    {
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      event: 'READ',
      object: object_name || 'toyota_production.sales.transactions',
      user: 'alice@toyota.com',
      principal_type: 'USER',
      action: 'SELECT query executed',
      row_count: 15420,
      client_ip: '10.0.45.123',
    },
    {
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      event: 'WRITE',
      object: object_name || 'toyota_analytics.reporting.sales_summary',
      user: 'etl_pipeline@toyota.com',
      principal_type: 'SERVICE_PRINCIPAL',
      action: 'INSERT INTO table',
      row_count: 2450,
      client_ip: '10.0.10.50',
    },
    {
      timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      event: 'GRANT',
      object: object_name || 'toyota_production.sales',
      user: 'admin@toyota.com',
      principal_type: 'USER',
      action: 'GRANT SELECT to sales_team',
      affected_principal: 'sales_team',
      client_ip: '10.0.1.10',
    },
    {
      timestamp: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      event: 'READ',
      object: object_name || 'toyota_analytics.customer_insights.customers',
      user: 'bob@toyota.com',
      principal_type: 'USER',
      action: 'SELECT query executed',
      row_count: 8920,
      client_ip: '10.0.45.87',
      metadata: { contains_pii: true },
    },
    {
      timestamp: new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(),
      event: 'CREATE',
      object: 'toyota_analytics.reporting.monthly_kpis',
      user: 'alice@toyota.com',
      principal_type: 'USER',
      action: 'CREATE TABLE',
      client_ip: '10.0.45.123',
    },
  ];

  const filteredLogs = logs.filter(log => {
    if (event_type !== 'all' && log.event.toLowerCase() !== event_type.toLowerCase()) return false;
    if (object_name && !log.object.includes(object_name)) return false;
    return true;
  });

  return JSON.stringify({
    time_range,
    event_type,
    object_name,
    total_events: filteredLogs.length,
    events: filteredLogs,
  });
}

function getMockDataClassification(object_name: string, include_columns: boolean): string {
  const classifications: Record<string, any> = {
    'toyota_analytics.customer_insights.customers': {
      table: object_name,
      classification_level: 'CONFIDENTIAL',
      tags: ['PII', 'GDPR', 'customer_data'],
      contains_sensitive_data: true,
      compliance_frameworks: ['GDPR', 'CCPA'],
      data_owner: 'customer_experience_team',
      retention_period: '7 years',
      columns: [
        { name: 'customer_id', type: 'STRING', classification: 'PUBLIC', tags: [] },
        { name: 'first_name', type: 'STRING', classification: 'CONFIDENTIAL', tags: ['PII', 'NAME'] },
        { name: 'last_name', type: 'STRING', classification: 'CONFIDENTIAL', tags: ['PII', 'NAME'] },
        { name: 'email', type: 'STRING', classification: 'CONFIDENTIAL', tags: ['PII', 'EMAIL', 'CONTACT_INFO'] },
        { name: 'phone', type: 'STRING', classification: 'CONFIDENTIAL', tags: ['PII', 'PHONE', 'CONTACT_INFO'] },
        { name: 'city', type: 'STRING', classification: 'INTERNAL', tags: ['LOCATION'] },
        { name: 'state', type: 'STRING', classification: 'PUBLIC', tags: [] },
        { name: 'income_bracket', type: 'STRING', classification: 'CONFIDENTIAL', tags: ['PII', 'FINANCIAL'] },
      ],
    },
    'toyota_production.sales.transactions': {
      table: object_name,
      classification_level: 'INTERNAL',
      tags: ['business_critical', 'financial_data'],
      contains_sensitive_data: false,
      compliance_frameworks: ['SOX'],
      data_owner: 'sales_operations',
      retention_period: '10 years',
      columns: [
        { name: 'transaction_id', type: 'STRING', classification: 'PUBLIC', tags: [] },
        { name: 'sale_price', type: 'DECIMAL', classification: 'INTERNAL', tags: ['FINANCIAL'] },
        { name: 'customer_id', type: 'STRING', classification: 'INTERNAL', tags: ['REFERENCE'] },
        { name: 'dealer_id', type: 'STRING', classification: 'PUBLIC', tags: [] },
      ],
    },
    'toyota_analytics.customer_insights.satisfaction_surveys': {
      table: object_name,
      classification_level: 'INTERNAL',
      tags: ['customer_feedback', 'quality_data'],
      contains_sensitive_data: false,
      compliance_frameworks: [],
      data_owner: 'customer_experience_team',
      retention_period: '5 years',
      columns: [
        { name: 'survey_id', type: 'STRING', classification: 'PUBLIC', tags: [] },
        { name: 'overall_score', type: 'INT', classification: 'INTERNAL', tags: ['METRIC'] },
        { name: 'comments', type: 'STRING', classification: 'INTERNAL', tags: ['TEXT', 'FEEDBACK'] },
      ],
    },
  };

  const data = classifications[object_name] || {
    table: object_name,
    classification_level: 'INTERNAL',
    tags: [],
    contains_sensitive_data: false,
    columns: [],
  };

  if (!include_columns) {
    delete data.columns;
  }

  return JSON.stringify(data);
}

function getMockDataQualityMetrics(table_name: string, metric_type: string): string {
  const metrics = {
    table: table_name,
    last_updated: new Date().toISOString(),
    overall_score: 92.5,
    metrics: {
      completeness: {
        score: 95.2,
        null_percentage: 4.8,
        columns_with_nulls: ['phone', 'email'],
        passing: true,
      },
      freshness: {
        score: 98.0,
        last_update: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        expected_update_frequency: 'hourly',
        lag_minutes: 15,
        passing: true,
      },
      validity: {
        score: 89.8,
        invalid_records: 1024,
        total_records: 10000,
        validation_rules: [
          { rule: 'email_format', passing_rate: 98.5, status: 'PASS' },
          { rule: 'phone_format', passing_rate: 87.2, status: 'WARNING' },
          { rule: 'sale_price_positive', passing_rate: 100.0, status: 'PASS' },
        ],
      },
      consistency: {
        score: 94.0,
        duplicate_records: 45,
        referential_integrity: 98.9,
        cross_table_checks: [
          { check: 'customer_id_exists', status: 'PASS', percentage: 99.8 },
          { check: 'dealer_id_exists', status: 'PASS', percentage: 100.0 },
        ],
      },
    },
  };

  if (metric_type !== 'all') {
    return JSON.stringify({
      table: table_name,
      metric_type,
      ...metrics.metrics[metric_type as keyof typeof metrics.metrics],
    });
  }

  return JSON.stringify(metrics);
}

function getMockGovernedTags(catalog: string | undefined, tag_category: string): string {
  const tags = {
    catalog: catalog || 'all',
    category: tag_category,
    tags: [
      {
        name: 'PII',
        category: 'security',
        description: 'Personally Identifiable Information',
        usage_count: 15,
        created_by: 'security_team',
        objects: ['toyota_analytics.customer_insights.customers'],
      },
      {
        name: 'GDPR',
        category: 'compliance',
        description: 'GDPR compliance requirement',
        usage_count: 8,
        created_by: 'compliance_team',
        objects: ['toyota_analytics.customer_insights.customers'],
      },
      {
        name: 'business_critical',
        category: 'business',
        description: 'Business-critical data asset',
        usage_count: 23,
        created_by: 'data_governance',
        objects: ['toyota_production.sales.transactions', 'toyota_analytics.reporting.sales_summary'],
      },
      {
        name: 'high_quality',
        category: 'quality',
        description: 'Data quality score above 90%',
        usage_count: 12,
        created_by: 'data_quality_team',
        objects: ['toyota_production.sales.transactions'],
      },
      {
        name: 'financial_data',
        category: 'security',
        description: 'Contains financial information',
        usage_count: 18,
        created_by: 'finance_team',
        objects: ['toyota_production.sales.transactions'],
      },
      {
        name: 'HIPAA',
        category: 'compliance',
        description: 'HIPAA compliance requirement',
        usage_count: 0,
        created_by: 'compliance_team',
        objects: [],
      },
    ],
  };

  if (tag_category !== 'all') {
    tags.tags = tags.tags.filter(tag => tag.category === tag_category);
  }

  return JSON.stringify(tags);
}
