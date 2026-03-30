import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ToolCredentials {
  host?: string;
  token?: string;
  warehouseId?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
}

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  /**
   * Start MCP servers based on available credentials
   */
  async initialize(credentials: ToolCredentials) {
    const servers: MCPServerConfig[] = [];

    // Add Databricks server if credentials available
    if (credentials.host && credentials.token) {
      const databricksServer = join(__dirname, 'databricks-server.ts');
      servers.push({
        name: 'databricks',
        command: 'npx',
        args: ['tsx', databricksServer],
        env: {
          DATABRICKS_HOST: credentials.host,
          DATABRICKS_TOKEN: credentials.token,
          DATABRICKS_WAREHOUSE_ID: credentials.warehouseId || '',
        },
      });
    }

    // Add AWS server if credentials available
    if (credentials.awsAccessKey && credentials.awsSecretKey) {
      const awsServer = join(__dirname, 'aws-server.ts');
      servers.push({
        name: 'aws',
        command: 'npx',
        args: ['tsx', awsServer],
        env: {
          AWS_ACCESS_KEY_ID: credentials.awsAccessKey,
          AWS_SECRET_ACCESS_KEY: credentials.awsSecretKey,
          AWS_REGION: credentials.awsRegion || 'us-east-1',
        },
      });
    }

    // Start each server
    for (const serverConfig of servers) {
      await this.startServer(serverConfig);
    }
  }

  private async startServer(config: MCPServerConfig) {
    try {
      console.log(`[MCP Client] Starting ${config.name} server...`);

      // Spawn the server process
      const process = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.processes.set(config.name, process);

      // Log stderr for debugging
      process.stderr?.on('data', (data) => {
        console.error(`[MCP ${config.name}] ${data.toString()}`);
      });

      process.on('exit', (code) => {
        console.error(`[MCP ${config.name}] Process exited with code ${code}`);
        this.clients.delete(config.name);
        this.processes.delete(config.name);
      });

      // Create MCP client
      const client = new Client(
        {
          name: `dataprism-${config.name}-client`,
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Connect via stdio transport
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env },
      });

      await client.connect(transport);
      this.clients.set(config.name, client);

      console.log(`[MCP Client] ${config.name} server connected`);
    } catch (error: any) {
      console.error(`[MCP Client] Failed to start ${config.name} server:`, error.message);
    }
  }

  /**
   * Call a tool on the appropriate MCP server
   */
  async callTool(toolName: string, args: any): Promise<any> {
    // Determine which server handles this tool
    const server = this.getServerForTool(toolName);
    
    if (!server) {
      throw new Error(`No MCP server available for tool: ${toolName}`);
    }

    const client = this.clients.get(server);
    if (!client) {
      throw new Error(`MCP server ${server} not connected`);
    }

    console.log(`[MCP Client] Calling ${toolName} on ${server} server`);

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      // Extract text content from MCP response
      const textContent = result.content.find((c: any) => c.type === 'text');
      return textContent?.text || JSON.stringify(result.content);
    } catch (error: any) {
      console.error(`[MCP Client] Tool call failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get list of all available tools from all connected servers
   */
  async listTools(): Promise<any[]> {
    const allTools: any[] = [];

    for (const [serverName, client] of this.clients.entries()) {
      try {
        const response = await client.listTools();
        console.log(`[MCP Client] ${serverName} server has ${response.tools.length} tools`);
        allTools.push(...response.tools);
      } catch (error: any) {
        console.error(`[MCP Client] Failed to list tools from ${serverName}:`, error.message);
      }
    }

    return allTools;
  }

  /**
   * Determine which server handles a given tool
   */
  private getServerForTool(toolName: string): string | null {
    const databricksTools = [
      'get_schema_context',
      'execute_sql',
      'search_tables',
      'get_table_lineage',
      'get_table_permissions',
      'get_audit_logs',
      'get_data_classification',
      'get_data_quality_metrics',
      'list_governed_tags',
    ];

    const awsTools = ['describe_aws_resources', 'get_aws_health', 'get_aws_costs'];

    if (databricksTools.includes(toolName)) return 'databricks';
    if (awsTools.includes(toolName)) return 'aws';

    return null;
  }

  /**
   * Shutdown all MCP servers
   */
  async shutdown() {
    console.log('[MCP Client] Shutting down all servers...');

    // Close all clients
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
        console.log(`[MCP Client] Closed ${name} client`);
      } catch (error: any) {
        console.error(`[MCP Client] Error closing ${name} client:`, error.message);
      }
    }

    // Kill all processes
    for (const [name, process] of this.processes.entries()) {
      try {
        process.kill();
        console.log(`[MCP Client] Killed ${name} process`);
      } catch (error: any) {
        console.error(`[MCP Client] Error killing ${name} process:`, error.message);
      }
    }

    this.clients.clear();
    this.processes.clear();
  }

  /**
   * Check if any servers are connected
   */
  isConnected(): boolean {
    return this.clients.size > 0;
  }

  /**
   * Get list of connected server names
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }
}

// Singleton instance
let mcpManager: MCPClientManager | null = null;

/**
 * Get or create the global MCP client manager
 */
export function getMCPManager(): MCPClientManager {
  if (!mcpManager) {
    mcpManager = new MCPClientManager();
  }
  return mcpManager;
}

/**
 * Initialize MCP servers with credentials (call once at startup or when credentials change)
 */
export async function initializeMCP(credentials: ToolCredentials): Promise<MCPClientManager> {
  const manager = getMCPManager();
  await manager.initialize(credentials);
  return manager;
}
