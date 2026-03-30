# Automated Data Quality Monitoring Implementation Guide

## Overview
DataPrism supports automated data quality monitoring through multiple approaches, from built-in Databricks features to custom implementations.

---

## Option 1: Databricks Lakehouse Monitoring (Recommended)

### Setup
Unity Catalog includes built-in lakehouse monitoring for automated data quality tracking.

```python
from databricks import lakehouse_monitoring

# Create a monitor for a table
lakehouse_monitoring.create_monitor(
    table_name="toyota_production.sales.transactions",
    profile_type="TimeSeries",  # or "Snapshot"
    timestamp_col="transaction_date",
    granularities=["1 hour", "1 day"],
    schedule="0 */6 * * *",  # Cron schedule
    baseline_table=None,  # Optional: compare against baseline
    slicing_exprs=["dealer_id", "model_name"]  # Group metrics by dimensions
)
```

### Features
- **Automatic Drift Detection**: Monitors statistical properties over time
- **Data Profiling**: Null rates, uniqueness, distributions
- **Anomaly Detection**: Flags unusual patterns
- **Built-in Dashboards**: Pre-built visualizations in Databricks
- **Alert Integration**: Email/Slack notifications

### View Monitoring Results
```python
# Get monitor metrics
metrics = lakehouse_monitoring.get_monitor_metrics(
    table_name="toyota_production.sales.transactions",
    start_time="2026-01-01",
    end_time="2026-02-27"
)

# Check for issues
issues = lakehouse_monitoring.get_monitor_problems(
    table_name="toyota_production.sales.transactions"
)
```

---

## Option 2: Great Expectations Integration

### Installation
```bash
pip install great-expectations
```

### Create Expectations Suite
```python
import great_expectations as gx

context = gx.get_context()

# Define expectations for your table
suite = context.add_or_update_expectation_suite("toyota_sales_suite")

# Add expectations
expectations = [
    {
        "expectation_type": "expect_column_values_to_not_be_null",
        "kwargs": {"column": "transaction_id"}
    },
    {
        "expectation_type": "expect_column_values_to_be_unique",
        "kwargs": {"column": "transaction_id"}
    },
    {
        "expectation_type": "expect_column_values_to_be_between",
        "kwargs": {
            "column": "sale_price",
            "min_value": 0,
            "max_value": 200000
        }
    },
    {
        "expectation_type": "expect_table_row_count_to_be_between",
        "kwargs": {
            "min_value": 1000,
            "max_value": None
        }
    }
]

for exp in expectations:
    suite.add_expectation(**exp)
```

### Schedule Validation
Create a Databricks job that runs validations:

```python
# databricks_validation_job.py
import great_expectations as gx
from databricks import sql

def validate_table(table_name: str):
    context = gx.get_context()
    
    # Load data from Databricks
    connection = sql.connect(
        server_hostname=os.getenv("DATABRICKS_HOST"),
        http_path=f"/sql/1.0/warehouses/{os.getenv('DATABRICKS_WAREHOUSE_ID')}",
        access_token=os.getenv("DATABRICKS_TOKEN")
    )
    
    # Run validation
    results = context.run_checkpoint(
        checkpoint_name="toyota_sales_checkpoint",
        batch_request={
            "datasource_name": "databricks_datasource",
            "data_asset_name": table_name
        }
    )
    
    # Handle failures
    if not results.success:
        send_alert(results)
    
    return results

# Schedule this via Databricks Workflows
```

---

## Option 3: Custom SQL-Based Monitoring

### Create Monitoring Queries
```sql
-- Create a monitoring table
CREATE TABLE IF NOT EXISTS monitoring.data_quality_metrics (
  table_name STRING,
  metric_type STRING,
  metric_value DOUBLE,
  threshold DOUBLE,
  status STRING,
  check_timestamp TIMESTAMP,
  details STRING
)

-- Insert completeness metrics
INSERT INTO monitoring.data_quality_metrics
SELECT 
  'toyota_production.sales.transactions' as table_name,
  'null_rate_' || col_name as metric_type,
  (COUNT_IF(col_value IS NULL) / COUNT(*)) * 100 as metric_value,
  5.0 as threshold,
  CASE 
    WHEN (COUNT_IF(col_value IS NULL) / COUNT(*)) * 100 > 5.0 THEN 'FAIL'
    ELSE 'PASS'
  END as status,
  current_timestamp() as check_timestamp,
  'Check for null values' as details
FROM toyota_production.sales.transactions

-- Freshness check
INSERT INTO monitoring.data_quality_metrics
SELECT 
  'toyota_production.sales.transactions' as table_name,
  'data_freshness_hours' as metric_type,
  TIMESTAMPDIFF(HOUR, MAX(transaction_date), CURRENT_TIMESTAMP()) as metric_value,
  24.0 as threshold,
  CASE 
    WHEN TIMESTAMPDIFF(HOUR, MAX(transaction_date), CURRENT_TIMESTAMP()) > 24 THEN 'FAIL'
    ELSE 'PASS'
  END as status,
  current_timestamp() as check_timestamp,
  'Check data freshness' as details
FROM toyota_production.sales.transactions

-- Duplicate check
INSERT INTO monitoring.data_quality_metrics
SELECT 
  'toyota_production.sales.transactions' as table_name,
  'duplicate_rate' as metric_type,
  (COUNT(*) - COUNT(DISTINCT transaction_id)) / COUNT(*) * 100 as metric_value,
  1.0 as threshold,
  CASE 
    WHEN (COUNT(*) - COUNT(DISTINCT transaction_id)) / COUNT(*) * 100 > 1.0 THEN 'FAIL'
    ELSE 'PASS'
  END as status,
  current_timestamp() as check_timestamp,
  'Check for duplicate IDs' as details
FROM toyota_production.sales.transactions
```

### Schedule via Databricks Workflows
```yaml
# databricks_job_config.yml
name: Data Quality Monitoring
schedule:
  quartz_cron_expression: "0 0 */6 * * ?"  # Every 6 hours
  timezone_id: "America/New_York"

tasks:
  - task_key: run_quality_checks
    notebook_task:
      notebook_path: /Workspace/monitoring/quality_checks
    depends_on: []
```

---

## Option 4: Integrate with DataPrism Backend

### Add Monitoring Endpoints
Create scheduled monitoring that stores results and triggers alerts:

```typescript
// server/monitoring/quality-monitor.ts
import { getDatabricksCredentials } from '../routes/chat.js';

interface QualityCheckResult {
  table: string;
  timestamp: string;
  overall_score: number;
  failed_checks: string[];
  warnings: string[];
}

export async function runQualityChecks(
  tables: string[],
  credentials: any
): Promise<QualityCheckResult[]> {
  const results: QualityCheckResult[] = [];

  for (const table of tables) {
    const checks = await executeQualitySQL(table, credentials);
    
    const result = {
      table,
      timestamp: new Date().toISOString(),
      overall_score: calculateScore(checks),
      failed_checks: checks.filter(c => c.status === 'FAIL').map(c => c.metric),
      warnings: checks.filter(c => c.status === 'WARNING').map(c => c.metric)
    };

    results.push(result);

    // Send alerts if quality drops
    if (result.overall_score < 80) {
      await sendQualityAlert(result);
    }
  }

  return results;
}

async function executeQualitySQL(table: string, credentials: any) {
  const queries = [
    { metric: 'completeness', sql: `SELECT ... FROM ${table}` },
    { metric: 'freshness', sql: `SELECT ... FROM ${table}` },
    { metric: 'validity', sql: `SELECT ... FROM ${table}` }
  ];

  // Execute checks...
  return [];
}

async function sendQualityAlert(result: QualityCheckResult) {
  // Send to Slack, email, PagerDuty, etc.
  console.log(`🚨 Data Quality Alert for ${result.table}`);
  console.log(`Score: ${result.overall_score}`);
  console.log(`Failed Checks: ${result.failed_checks.join(', ')}`);
}
```

### Schedule Monitoring
```typescript
// server/index.ts
import cron from 'node-cron';
import { runQualityChecks } from './monitoring/quality-monitor.js';

// Run every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('[Monitor] Running data quality checks...');
  
  const tables = [
    'toyota_production.sales.transactions',
    'toyota_analytics.reporting.sales_summary',
    'toyota_analytics.customer_insights.customers'
  ];

  try {
    const results = await runQualityChecks(tables, credentials);
    console.log('[Monitor] Quality checks complete:', results);
  } catch (error) {
    console.error('[Monitor] Quality check failed:', error);
  }
});
```

---

## Alert Configuration

### Slack Integration
```typescript
import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_TOKEN);

async function sendSlackAlert(result: QualityCheckResult) {
  await slack.chat.postMessage({
    channel: '#data-quality-alerts',
    text: `⚠️ Data Quality Issue Detected`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⚠️ Data Quality Alert' }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Table:*\n${result.table}` },
          { type: 'mrkdwn', text: `*Score:*\n${result.overall_score}%` }
        ]
      },
      {
        type: 'section',
        text: { 
          type: 'mrkdwn', 
          text: `*Failed Checks:*\n${result.failed_checks.join('\n')}` 
        }
      }
    ]
  });
}
```

### Email Alerts
```typescript
import nodemailer from 'nodemailer';

async function sendEmailAlert(result: QualityCheckResult) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: 'dataprism@company.com',
    to: 'data-team@company.com',
    subject: `Data Quality Alert: ${result.table}`,
    html: `
      <h2>Data Quality Alert</h2>
      <p><strong>Table:</strong> ${result.table}</p>
      <p><strong>Score:</strong> ${result.overall_score}%</p>
      <p><strong>Failed Checks:</strong></p>
      <ul>${result.failed_checks.map(c => `<li>${c}</li>`).join('')}</ul>
    `
  });
}
```

---

## Recommended Architecture

### Hybrid Approach
1. **Use Databricks Lakehouse Monitoring** for automatic profiling and drift detection
2. **Add Great Expectations** for custom business rules and complex validations
3. **Integrate with DataPrism** for AI-powered analysis and natural language alerts
4. **Store history** in a monitoring table for trend analysis

### Monitoring Dashboard
Create a monitoring table that DataPrism can query:

```sql
CREATE TABLE monitoring.quality_dashboard AS
SELECT 
  table_name,
  DATE(check_timestamp) as check_date,
  AVG(CASE WHEN status = 'PASS' THEN 100 ELSE 0 END) as pass_rate,
  COUNT(CASE WHEN status = 'FAIL' THEN 1 END) as failures,
  COUNT(CASE WHEN status = 'WARNING' THEN 1 END) as warnings
FROM monitoring.data_quality_metrics
GROUP BY table_name, DATE(check_timestamp)
```

Users can then ask DataPrism: "Show me data quality trends for the last 30 days" and it will query this table.

---

## Best Practices

1. **Start Simple**: Begin with basic completeness and freshness checks
2. **Define Thresholds**: Set appropriate pass/fail criteria for each metric
3. **Prioritize Tables**: Focus on critical business tables first
4. **Incremental Rollout**: Add more sophisticated checks over time
5. **Document Expectations**: Record why each rule exists
6. **Review Regularly**: Adjust thresholds based on actual patterns
7. **Automate Remediation**: When possible, fix issues automatically (e.g., deduplication)

---

## Next Steps

1. Choose your monitoring approach
2. Install necessary dependencies
3. Configure credentials and connections
4. Set up monitoring schedules
5. Configure alert channels
6. Create monitoring dashboards
7. Document quality standards
