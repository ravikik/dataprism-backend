#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

// ── Tool Definitions ──────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'describe_aws_resources',
    description: 'List and describe AWS resources in the connected account. Returns details about EC2 instances, S3 buckets, RDS databases, and Lambda functions.',
    inputSchema: {
      type: 'object',
      properties: {
        resource_type: {
          type: 'string',
          enum: ['all', 'ec2', 's3', 'rds', 'lambda'],
          description: 'Type of AWS resource to describe. Use "all" for a summary.',
        },
      },
      required: ['resource_type'],
    },
  },
  {
    name: 'get_aws_health',
    description: 'Get AWS infrastructure health status including CloudWatch alarms and service availability.',
    inputSchema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'Specific service to check (optional, defaults to overall health)',
        },
      },
    },
  },
  {
    name: 'get_aws_costs',
    description: 'Get AWS cost analysis and breakdown by service.',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['last_7_days', 'last_30_days', 'last_90_days'],
          description: 'Time period for cost analysis',
        },
      },
    },
  },
];

// ── Server Implementation ──────────────────────────────────────────

interface AWSCredentials {
  accessKey: string;
  secretKey: string;
  region: string;
}

class AWSServer {
  private server: Server;
  private credentials: AWSCredentials | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'aws-mcp-server',
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

  setCredentials(credentials: AWSCredentials) {
    this.credentials = credentials;
    console.error('[AWS MCP] Credentials set:', {
      hasAccessKey: !!credentials.accessKey,
      hasSecretKey: !!credentials.secretKey,
      region: credentials.region,
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

      console.error(`[AWS MCP] Tool called: ${name}`);

      try {
        let result: string;

        switch (name) {
          case 'describe_aws_resources':
            result = await this.handleDescribeAWSResources(args as any);
            break;
          case 'get_aws_health':
            result = await this.handleGetAWSHealth(args as any);
            break;
          case 'get_aws_costs':
            result = await this.handleGetAWSCosts(args as any);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: 'text', text: result }],
        };
      } catch (error: any) {
        console.error(`[AWS MCP] Error in ${name}:`, error.message);
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  // ── Tool Handlers ────────────────────────────────────────────────

  private async handleDescribeAWSResources(input: { resource_type: string }): Promise<string> {
    // If no credentials, return mock data
    if (!this.credentials) {
      console.error('[AWS MCP] No credentials available, using mock data');
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

    console.error('[AWS MCP] Using live AWS credentials');
    const awsConfig = {
      region: this.credentials.region,
      credentials: {
        accessKeyId: this.credentials.accessKey,
        secretAccessKey: this.credentials.secretKey,
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
              region: this.credentials.region,
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
      console.error('[AWS MCP] Error fetching resources:', error.message);
      throw new Error(`Failed to fetch AWS resources: ${error.message}`);
    }
  }

  private async handleGetAWSHealth(input: { service?: string }): Promise<string> {
    // If no credentials, return mock data
    if (!this.credentials) {
      console.error('[AWS MCP] No credentials available, using mock health data');
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

    console.error('[AWS MCP] Fetching live CloudWatch alarms');
    const awsConfig = {
      region: this.credentials.region,
      credentials: {
        accessKeyId: this.credentials.accessKey,
        secretAccessKey: this.credentials.secretKey,
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
      console.error('[AWS MCP] Error fetching health data:', error.message);
      throw new Error(`Failed to fetch AWS health: ${error.message}`);
    }
  }

  private async handleGetAWSCosts(input: { period?: string }): Promise<string> {
    // If no credentials, return mock data
    if (!this.credentials) {
      console.error('[AWS MCP] No credentials available, using mock cost data');
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

    console.error('[AWS MCP] Fetching live cost data from Cost Explorer');
    const awsConfig = {
      region: 'us-east-1', // Cost Explorer is only available in us-east-1
      credentials: {
        accessKeyId: this.credentials.accessKey,
        secretAccessKey: this.credentials.secretKey,
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
      console.error('[AWS MCP] Error fetching cost data:', error.message);
      throw new Error(`Failed to fetch AWS costs: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[AWS MCP] Server running on stdio');
  }
}

// ── Entry Point ────────────────────────────────────────────────────

const server = new AWSServer();

// Allow credentials to be set via environment variables
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  server.setCredentials({
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

server.run().catch(console.error);
