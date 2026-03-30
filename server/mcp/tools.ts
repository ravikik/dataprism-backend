import type { Tool } from '../services/ai-client.js';

export const TOOL_GET_SCHEMA_CONTEXT: Tool = {
  name: 'get_schema_context',
  description:
    'Fetch table and column metadata for specified database schemas from Databricks Unity Catalog. Returns table names, column definitions, data types, and comments.',
  input_schema: {
    type: 'object' as const,
    properties: {
      schemas: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of schema identifiers in "catalog.schema" format, e.g. ["toyota_production.sales"]',
      },
    },
    required: ['schemas'],
  },
};

export const TOOL_EXECUTE_SQL: Tool = {
  name: 'execute_sql',
  description:
    'Execute a SQL query on the Databricks SQL warehouse. Returns column names and row data. Use this to test or validate queries before presenting them to the user.',
  input_schema: {
    type: 'object' as const,
    properties: {
      sql: {
        type: 'string',
        description: 'A valid Databricks / Spark SQL query to execute',
      },
    },
    required: ['sql'],
  },
};

export const TOOL_SEARCH_TABLES: Tool = {
  name: 'search_tables',
  description:
    'Search for tables in a Databricks Unity Catalog schema. Returns a list of table names with comments.',
  input_schema: {
    type: 'object' as const,
    properties: {
      catalog: {
        type: 'string',
        description: 'Catalog name to search within',
      },
      schema: {
        type: 'string',
        description: 'Schema name to search within',
      },
    },
    required: ['catalog', 'schema'],
  },
};

export const TOOL_DESCRIBE_AWS_RESOURCES: Tool = {
  name: 'describe_aws_resources',
  description:
    'List and describe AWS resources in the connected account. Returns details about EC2 instances, S3 buckets, RDS databases, and Lambda functions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      resource_type: {
        type: 'string',
        enum: ['all', 'ec2', 's3', 'rds', 'lambda'],
        description: 'Type of AWS resource to describe. Use "all" for a summary.',
      },
    },
    required: ['resource_type'],
  },
};

export const TOOL_GET_AWS_HEALTH: Tool = {
  name: 'get_aws_health',
  description:
    'Get AWS infrastructure health status including CloudWatch alarms and service availability.',
  input_schema: {
    type: 'object' as const,
    properties: {
      service: {
        type: 'string',
        enum: ['all', 'ec2', 'rds', 's3'],
        description: 'Specific AWS service to check health for, or "all".',
      },
    },
    required: ['service'],
  },
};

export const TOOL_GET_AWS_COSTS: Tool = {
  name: 'get_aws_costs',
  description:
    'Get AWS cost and billing data. Returns spending breakdowns by service and trends.',
  input_schema: {
    type: 'object' as const,
    properties: {
      period: {
        type: 'string',
        enum: ['last_7_days', 'last_30_days', 'this_month', 'last_month'],
        description: 'Time period for cost data.',
      },
    },
    required: [],
  },
};

// ── Unity Catalog Governance Tools ──────────────────────────────────

export const TOOL_GET_TABLE_LINEAGE: Tool = {
  name: 'get_table_lineage',
  description:
    'Get data lineage information for a Unity Catalog table. Returns upstream and downstream dependencies, source tables, and derived views or tables.',
  input_schema: {
    type: 'object' as const,
    properties: {
      table_name: {
        type: 'string',
        description: 'Full table name in format "catalog.schema.table"',
      },
      direction: {
        type: 'string',
        enum: ['upstream', 'downstream', 'both'],
        description: 'Lineage direction: upstream sources, downstream consumers, or both',
      },
    },
    required: ['table_name'],
  },
};

export const TOOL_GET_TABLE_PERMISSIONS: Tool = {
  name: 'get_table_permissions',
  description:
    'Get access permissions and grants for a Unity Catalog table or schema. Returns users, groups, and their permission levels (SELECT, MODIFY, ALL PRIVILEGES).',
  input_schema: {
    type: 'object' as const,
    properties: {
      object_name: {
        type: 'string',
        description: 'Full name of table/schema/catalog in format "catalog.schema.table" or "catalog.schema"',
      },
      object_type: {
        type: 'string',
        enum: ['table', 'schema', 'catalog'],
        description: 'Type of object to check permissions for',
      },
    },
    required: ['object_name', 'object_type'],
  },
};

export const TOOL_GET_AUDIT_LOGS: Tool = {
  name: 'get_audit_logs',
  description:
    'Retrieve Unity Catalog audit logs for compliance and security tracking. Returns access events, modifications, and data operations with timestamps and user information.',
  input_schema: {
    type: 'object' as const,
    properties: {
      object_name: {
        type: 'string',
        description: 'Object to get audit logs for (optional, omit for all events)',
      },
      event_type: {
        type: 'string',
        enum: ['all', 'read', 'write', 'grant', 'create', 'delete'],
        description: 'Type of audit events to retrieve',
      },
      time_range: {
        type: 'string',
        enum: ['last_24_hours', 'last_7_days', 'last_30_days'],
        description: 'Time range for audit logs',
      },
    },
    required: ['event_type'],
  },
};

export const TOOL_GET_DATA_CLASSIFICATION: Tool = {
  name: 'get_data_classification',
  description:
    'Get data classification and sensitivity tags for Unity Catalog objects. Returns PII indicators, compliance tags (GDPR, HIPAA), and data classification levels.',
  input_schema: {
    type: 'object' as const,
    properties: {
      object_name: {
        type: 'string',
        description: 'Full table name in format "catalog.schema.table"',
      },
      include_columns: {
        type: 'boolean',
        description: 'Include column-level classification (default: true)',
      },
    },
    required: ['object_name'],
  },
};

export const TOOL_GET_DATA_QUALITY_METRICS: Tool = {
  name: 'get_data_quality_metrics',
  description:
    'Get data quality metrics for Unity Catalog tables including completeness, freshness, validity, and custom quality rules status.',
  input_schema: {
    type: 'object' as const,
    properties: {
      table_name: {
        type: 'string',
        description: 'Full table name in format "catalog.schema.table"',
      },
      metric_type: {
        type: 'string',
        enum: ['all', 'completeness', 'freshness', 'validity', 'consistency'],
        description: 'Type of quality metrics to retrieve',
      },
    },
    required: ['table_name'],
  },
};

export const TOOL_LIST_GOVERNED_TAGS: Tool = {
  name: 'list_governed_tags',
  description:
    'List all governance tags and their usage across Unity Catalog. Returns tag definitions, assigned objects, and tag hierarchies.',
  input_schema: {
    type: 'object' as const,
    properties: {
      catalog: {
        type: 'string',
        description: 'Catalog name to list tags from (optional)',
      },
      tag_category: {
        type: 'string',
        enum: ['all', 'security', 'compliance', 'quality', 'business'],
        description: 'Filter tags by category',
      },
    },
    required: [],
  },
};

// ── AI Column Enrichment Tools ────────────────────────────────────────

export const TOOL_GENERATE_COLUMN_DESCRIPTIONS: Tool = {
  name: 'generate_column_descriptions',
  description:
    'Fetch detailed column metadata and optionally sample data for a Unity Catalog table to support AI-driven description generation. Returns column names, types, existing comments, nullability, and optionally sample values and distinct counts. When include_sample_data is false, only structural metadata is returned (no actual data leaves Databricks).',
  input_schema: {
    type: 'object' as const,
    properties: {
      table_name: {
        type: 'string',
        description: 'Full table name in format "catalog.schema.table"',
      },
      sample_rows: {
        type: 'number',
        description: 'Number of sample rows to fetch for context (default: 5, max: 20). Ignored when include_sample_data is false.',
      },
      include_sample_data: {
        type: 'boolean',
        description: 'Whether to fetch and include sample data values and distinct counts. Set to false to rely only on column names, types, and existing comments — useful for sensitive or regulated data. Default: true.',
      },
    },
    required: ['table_name'],
  },
};

export const TOOL_UPDATE_COLUMN_DESCRIPTIONS: Tool = {
  name: 'update_column_descriptions',
  description:
    'Write AI-generated descriptions (comments) to columns in a Unity Catalog table. Use this after analyzing column metadata and sample data to apply meaningful descriptions that help users understand each column\'s purpose and content.',
  input_schema: {
    type: 'object' as const,
    properties: {
      table_name: {
        type: 'string',
        description: 'Full table name in format "catalog.schema.table"',
      },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Column name' },
            description: { type: 'string', description: 'AI-generated description for the column' },
          },
          required: ['name', 'description'],
        },
        description: 'Array of column names and their AI-generated descriptions',
      },
    },
    required: ['table_name', 'columns'],
  },
};

export const TOOL_UPDATE_COLUMN_TAGS: Tool = {
  name: 'update_column_tags',
  description:
    'Apply AI-driven classification tags to columns in a Unity Catalog table. Tags can include PII classification (e.g. email, phone, ssn), sensitivity level (public, internal, confidential, restricted), data domain (financial, customer, product, operational), and compliance labels (gdpr, hipaa, pci).',
  input_schema: {
    type: 'object' as const,
    properties: {
      table_name: {
        type: 'string',
        description: 'Full table name in format "catalog.schema.table"',
      },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Column name' },
            tags: {
              type: 'object',
              description: 'Key-value tag pairs to apply, e.g. {"pii": "email", "sensitivity": "confidential", "domain": "customer"}',
            },
          },
          required: ['name', 'tags'],
        },
        description: 'Array of column names and their classification tags',
      },
    },
    required: ['table_name', 'columns'],
  },
};

// ── Databricks Jobs / Workflows Tools ────────────────────────────────

export const TOOL_GET_JOB_FAILURES: Tool = {
  name: 'get_job_failures',
  description:
    'Analyze Databricks job and workflow failures. Returns recent failed job runs with error messages, failure reasons, duration, and cluster information. Supports filtering by time range and job name.',
  input_schema: {
    type: 'object' as const,
    properties: {
      time_range: {
        type: 'string',
        enum: ['last_24_hours', 'last_7_days', 'last_30_days'],
        description: 'Time range to search for failed jobs (default: last_7_days)',
      },
      job_name_filter: {
        type: 'string',
        description: 'Optional substring filter to match job names (case-insensitive)',
      },
      include_successful: {
        type: 'boolean',
        description: 'Include successful runs for comparison (default: false). When true, returns all runs so you can calculate failure rates.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of runs to return (default: 25, max: 100)',
      },
    },
    required: [],
  },
};

export const TOOL_GET_JOB_RUN_LOGS: Tool = {
  name: 'get_job_run_logs',
  description:
    'Fetch detailed logs and output for a specific Databricks job run. Returns driver logs, stderr/stdout, Spark event logs, cluster events, and task-level output. Use this after get_job_failures to drill into a specific failure.',
  input_schema: {
    type: 'object' as const,
    properties: {
      run_id: {
        type: 'number',
        description: 'The run ID of the job run to fetch logs for (from get_job_failures results)',
      },
      log_type: {
        type: 'string',
        enum: ['all', 'driver', 'stderr', 'stdout', 'spark_events', 'cluster_events'],
        description: 'Type of logs to fetch. "all" returns a combined summary. Default: "all"',
      },
      max_lines: {
        type: 'number',
        description: 'Maximum number of log lines to return per log type (default: 200, max: 1000). Logs are tail-truncated to show the most recent/relevant lines.',
      },
    },
    required: ['run_id'],
  },
};

export const TOOL_GET_JOB_RUN_RCA: Tool = {
  name: 'get_job_run_rca',
  description:
    'Perform root cause analysis (RCA) on a failed Databricks job run. Analyzes error messages, log patterns, cluster configuration, historical failure patterns, and provides a structured diagnosis with probable root cause, contributing factors, and step-by-step remediation instructions. Use this after get_job_failures or get_job_run_logs to get actionable fix recommendations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      run_id: {
        type: 'number',
        description: 'The run ID of the failed job run to analyze',
      },
      include_history: {
        type: 'boolean',
        description: 'Include analysis of historical runs of the same job to detect recurring patterns (default: true)',
      },
    },
    required: ['run_id'],
  },
};

// ── Tool Collections ────────────────────────────────────────────────

export const ALL_TOOLS: Tool[] = [
  TOOL_GET_SCHEMA_CONTEXT,
  TOOL_EXECUTE_SQL,
  TOOL_SEARCH_TABLES,
  TOOL_DESCRIBE_AWS_RESOURCES,
  TOOL_GET_AWS_HEALTH,
  TOOL_GET_AWS_COSTS,
  TOOL_GET_TABLE_LINEAGE,
  TOOL_GET_TABLE_PERMISSIONS,
  TOOL_GET_AUDIT_LOGS,
  TOOL_GET_DATA_CLASSIFICATION,
  TOOL_GET_DATA_QUALITY_METRICS,
  TOOL_LIST_GOVERNED_TAGS,
  TOOL_GENERATE_COLUMN_DESCRIPTIONS,
  TOOL_UPDATE_COLUMN_DESCRIPTIONS,
  TOOL_UPDATE_COLUMN_TAGS,
  TOOL_GET_JOB_FAILURES,
  TOOL_GET_JOB_RUN_LOGS,
  TOOL_GET_JOB_RUN_RCA,
];

/** Return only the tools usable with the available credentials. */
export function getAvailableTools(hasAWS: boolean, hasDatabricks: boolean): Tool[] {
  const tools: Tool[] = [];
  if (hasDatabricks) {
    tools.push(
      TOOL_GET_SCHEMA_CONTEXT,
      TOOL_EXECUTE_SQL,
      TOOL_SEARCH_TABLES,
      TOOL_GET_TABLE_LINEAGE,
      TOOL_GET_TABLE_PERMISSIONS,
      TOOL_GET_AUDIT_LOGS,
      TOOL_GET_DATA_CLASSIFICATION,
      TOOL_GET_DATA_QUALITY_METRICS,
      TOOL_LIST_GOVERNED_TAGS,
      TOOL_GENERATE_COLUMN_DESCRIPTIONS,
      TOOL_UPDATE_COLUMN_DESCRIPTIONS,
      TOOL_UPDATE_COLUMN_TAGS,
      TOOL_GET_JOB_FAILURES,
      TOOL_GET_JOB_RUN_LOGS,
      TOOL_GET_JOB_RUN_RCA,
    );
  }
  if (hasAWS) {
    tools.push(TOOL_DESCRIBE_AWS_RESOURCES, TOOL_GET_AWS_HEALTH, TOOL_GET_AWS_COSTS);
  }
  return tools;
}
