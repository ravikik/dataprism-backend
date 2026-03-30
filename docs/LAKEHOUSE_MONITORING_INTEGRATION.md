# Lakehouse Monitoring Integration with DataPrism

## Overview

Databricks Lakehouse Monitoring automatically profiles and monitors tables in Unity Catalog. DataPrism integrates with this monitoring data to provide AI-powered insights into data quality trends, anomalies, and issues.

---

## How It Works

### 1. Lakehouse Monitoring Setup

When you create a monitor on a table, Databricks automatically:
- Creates profile metric tables with suffix `_profile_metrics`
- Stores drift metric tables with suffix `_drift_metrics`
- Runs scheduled profiling jobs
- Generates statistical summaries

```python
from databricks import lakehouse_monitoring

# Create a monitor
lakehouse_monitoring.create_monitor(
    table_name="toyota_production.sales.transactions",
    profile_type="TimeSeries",
    timestamp_col="transaction_date",
    granularities=["1 hour", "1 day"],
    schedule="0 */6 * * *"  # Every 6 hours
)
```

This creates monitoring tables:
- `toyota_production.sales.transactions_profile_metrics`
- `toyota_production.sales.transactions_drift_metrics`

### 2. DataPrism Queries Monitoring Data

When users ask DataPrism about data quality, the backend:

1. **Detects Quality Questions**: 
   - "What's the data quality of transactions table?"
   - "Show me null rates for customer data"
   - "Are there any data quality issues?"

2. **Calls `get_data_quality_metrics` Tool**: 
   - Automatically queries Lakehouse Monitoring tables
   - Falls back to mock data if monitoring not configured

3. **Transforms Metrics**:
   - Converts Lakehouse Monitoring format to DataPrism format
   - Calculates aggregate scores
   - Identifies columns with issues

4. **Generates Natural Language Response**:
   - Summarizes findings in plain English
   - Highlights critical issues
   - Provides actionable recommendations

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Databricks Unity Catalog                  │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  toyota_production.sales.transactions              │    │
│  │  (Your actual data table)                          │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          │ Monitored by                      │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Lakehouse Monitoring Service                      │    │
│  │  - Runs every 6 hours                             │    │
│  │  - Profiles all columns                           │    │
│  │  - Detects drift/anomalies                        │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          │ Writes metrics to                 │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  transactions_profile_metrics                      │    │
│  │  - window_start_time, window_end_time             │    │
│  │  - column_name, null_count, null_percentage       │    │
│  │  - distinct_count, min, max, mean, stddev         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  transactions_drift_metrics                        │    │
│  │  - drift_type, column_name, drift_score           │    │
│  │  - baseline_stats, current_stats                  │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ SQL Query via Databricks API
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    DataPrism Backend                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  get_data_quality_metrics Tool                     │    │
│  │  - Queries _profile_metrics table                 │    │
│  │  - Transforms to DataPrism format                 │    │
│  │  - Calculates quality scores                      │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Claude AI (via API)                              │    │
│  │  - Receives quality metrics                       │    │
│  │  - Analyzes trends                                │    │
│  │  - Generates insights                             │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                   Natural Language Response
          "Your transactions table has a quality score of 92.5%.
           The email column has 4.8% null values, which is within
           acceptable limits. No critical issues detected."
```

---

## Integration Flow

### Step 1: User Asks Question
```
User: "What's the data quality of my sales transactions?"
```

### Step 2: DataPrism Selects Tool
Claude AI decides to use `get_data_quality_metrics` tool:
```json
{
  "name": "get_data_quality_metrics",
  "input": {
    "table_name": "toyota_production.sales.transactions",
    "metric_type": "all"
  }
}
```

### Step 3: Backend Queries Lakehouse Monitoring
```typescript
// In executor.ts
const profileQuery = `
  SELECT 
    window_start_time,
    window_end_time,
    column_name,
    null_count,
    null_percentage,
    distinct_count
  FROM toyota_production.sales.transactions_profile_metrics
  WHERE window_end_time >= DATE_SUB(CURRENT_DATE(), 7)
  ORDER BY window_end_time DESC
  LIMIT 100
`;

// Execute via Databricks SQL API
const response = await fetch(`${host}/api/2.0/sql/statements`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    warehouse_id: warehouseId,
    statement: profileQuery
  })
});
```

### Step 4: Transform Metrics
```typescript
// Convert Lakehouse Monitoring format to DataPrism format
const metrics = {
  table: "toyota_production.sales.transactions",
  last_updated: "2026-02-27T10:30:00Z",
  overall_score: 92.5,
  source: "lakehouse_monitoring",
  metrics: {
    completeness: {
      score: 95.2,
      null_percentage: 4.8,
      columns_with_nulls: ["email", "phone"],
      passing: true
    },
    freshness: {
      score: 98.0,
      last_update: "2026-02-27T08:15:00Z",
      passing: true
    }
  }
};
```

### Step 5: Claude Generates Response
```json
{
  "type": "governance",
  "explanation": "Your sales transactions table has a quality score of 92.5%, which is excellent.\n\nKey findings:\n- Overall completeness: 95.2% (passing)\n- Email column: 4.8% null values\n- Phone column: 5.2% null values\n- Data freshness: Updated 2 hours ago (passing)\n\nNo critical issues detected. The null rates are within acceptable limits for contact information fields."
}
```

---

## Configuration

### Enable Lakehouse Monitoring for Your Tables

```python
# In a Databricks notebook or job

from databricks import lakehouse_monitoring

# List of tables to monitor
tables_to_monitor = [
    "toyota_production.sales.transactions",
    "toyota_production.manufacturing.production_schedule",
    "toyota_analytics.reporting.sales_summary"
]

for table in tables_to_monitor:
    try:
        # Create monitor
        lakehouse_monitoring.create_monitor(
            table_name=table,
            profile_type="TimeSeries",
            granularities=["1 day"],
            schedule="0 */6 * * *",  # Every 6 hours
            baseline_table=None
        )
        print(f"✓ Monitor created for {table}")
    except Exception as e:
        print(f"✗ Failed to create monitor for {table}: {e}")
```

### Query Monitoring Status

```sql
-- Check which tables have monitors
SELECT 
  table_catalog,
  table_schema,
  table_name,
  monitor_status,
  schedule,
  last_refresh_time
FROM system.information_schema.lakehouse_monitors
WHERE table_catalog = 'toyota_production'
```

---

## DataPrism Query Examples

### Example 1: Overall Quality Check
**User:** "What's the quality score for my transactions table?"

**DataPrism:**
- Calls `get_data_quality_metrics(table_name="toyota_production.sales.transactions")`
- Queries `transactions_profile_metrics`
- Returns: "Quality score: 92.5% with completeness at 95.2% and freshness at 98%"

### Example 2: Null Value Analysis
**User:** "Which columns have missing data in the customers table?"

**DataPrism:**
- Calls `get_data_quality_metrics(table_name="toyota_analytics.customer_insights.customers", metric_type="completeness")`
- Analyzes null percentages
- Returns: "The email column has 8% null values and phone has 12% null values. All other columns are complete."

### Example 3: Data Freshness
**User:** "When was the sales data last updated?"

**DataPrism:**
- Calls `get_data_quality_metrics(metric_type="freshness")`
- Checks latest monitoring window
- Returns: "Sales data was last updated 2 hours ago at 8:15 AM, which meets the expected hourly refresh schedule."

### Example 4: Quality Trends
**User:** "Show me quality trends for the last week"

**DataPrism:**
- Queries monitoring data with 7-day window
- Analyzes score changes over time
- Returns: "Quality has been stable around 92-94% all week. There was a small dip to 89% on Tuesday due to a temporary increase in null values, but it recovered by Wednesday."

---

## Advanced Integration Features

### 1. Drift Detection

Lakehouse Monitoring tracks statistical drift. DataPrism can surface this:

```sql
-- Query drift metrics
SELECT 
  column_name,
  drift_type,
  drift_score,
  baseline_mean,
  current_mean
FROM toyota_production.sales.transactions_drift_metrics
WHERE drift_score > 0.5  -- Significant drift
ORDER BY drift_score DESC
```

**User:** "Have there been any unusual changes in my sales data?"

**DataPrism:** "Yes, the 'sale_price' column shows significant drift (score: 0.78). The average sale price increased from $28,500 to $34,200 compared to the baseline. This could indicate a shift toward higher-end models or regional pricing changes."

### 2. Custom Alerts

Set up quality thresholds in DataPrism:

```typescript
// In server/monitoring/quality-monitor.ts
const QUALITY_THRESHOLDS = {
  critical: 70,   // Alert immediately
  warning: 85,    // Flag for review
  good: 90        // No action needed
};

async function checkQualityThresholds(table: string, score: number) {
  if (score < QUALITY_THRESHOLDS.critical) {
    await sendSlackAlert({
      severity: 'critical',
      message: `🚨 Critical: ${table} quality dropped to ${score}%`
    });
  } else if (score < QUALITY_THRESHOLDS.warning) {
    await sendSlackAlert({
      severity: 'warning',
      message: `⚠️  Warning: ${table} quality at ${score}%`
    });
  }
}
```

### 3. Historical Analysis

Query monitoring history for trend analysis:

```sql
-- Calculate weekly quality trends
SELECT 
  DATE_TRUNC('week', window_end_time) as week,
  AVG(null_percentage) as avg_null_rate,
  COUNT(DISTINCT column_name) as columns_checked
FROM toyota_production.sales.transactions_profile_metrics
WHERE window_end_time >= DATE_SUB(CURRENT_DATE(), 90)
GROUP BY week
ORDER BY week DESC
```

**User:** "How has data quality changed over the last quarter?"

**DataPrism:** "Data quality has improved steadily over the last 90 days. Average null rates decreased from 6.2% to 4.8%, and we're now monitoring 45 columns (up from 38). The biggest improvement was in March when email validation was implemented."

---

## Benefits of Integration

### 1. **Automatic Monitoring**
- No manual quality checks needed
- Lakehouse Monitoring runs on schedule
- DataPrism provides instant access to results

### 2. **Natural Language Interface**
- Ask questions in plain English
- No SQL knowledge required
- AI interprets and explains metrics

### 3. **Proactive Alerting**
- Detect issues before they impact business
- Historical context helps identify trends
- Automated notifications for critical problems

### 4. **Unified Governance**
- Quality metrics alongside lineage and permissions
- Complete view of data health
- Traceable quality history

### 5. **Cost Effective**
- Uses existing Databricks infrastructure
- No additional monitoring tools needed
- Scales automatically with data volume

---

## Best Practices

### 1. **Monitor Critical Tables First**
Start with high-value tables that drive key business decisions:
- Sales transactions
- Customer master data
- Production metrics
- Financial reports

### 2. **Set Appropriate Granularities**
Balance freshness vs. cost:
- Real-time data: 1-hour granularity
- Daily reports: 1-day granularity
- Historical archives: Weekly granularity

### 3. **Define Quality Thresholds**
Establish acceptable ranges for your use cases:
- Customer contact info: 10-15% nulls acceptable
- Transaction IDs: 0% nulls required
- Analytics aggregates: 5% nulls acceptable

### 4. **Review Regularly**
Schedule weekly reviews of:
- Quality score trends
- New drift alerts
- Recurring issues

### 5. **Integrate with Workflows**
Connect quality checks to your data pipelines:
- Alert on quality drops
- Block downstream jobs if quality fails
- Automatically reprocess problematic data

---

## Example: Complete Workflow

### Setup (One Time)
```python
# Create monitor
lakehouse_monitoring.create_monitor(
    table_name="toyota_production.sales.transactions",
    schedule="0 */6 * * *"
)
```

### Daily Use
**Morning Check:**
```
User: "Any data quality issues today?"
DataPrism: "All systems green. Your 3 monitored tables have quality scores of 92%, 94%, and 91%. No issues detected."
```

**Investigation:**
```
User: "Why did the quality score drop yesterday?"
DataPrism: "The transactions table quality dropped from 94% to 89% due to a batch load that contained 8% null values in the dealer_id column. This was corrected in the next refresh cycle."
```

**Preventive Action:**
```
User: "Show me columns that frequently have null values"
DataPrism: "Over the last 30 days, the email column averages 5.2% null values and phone averages 6.8% null values. These are consistently the top two columns with missing data."
```

---

## Troubleshooting

### Monitor Not Found
**Issue:** DataPrism says "No monitoring data available"

**Solutions:**
1. Verify monitor exists:
   ```sql
   SELECT * FROM system.information_schema.lakehouse_monitors 
   WHERE table_name = 'transactions'
   ```

2. Check monitor refresh status:
   ```sql
   SELECT last_refresh_time, monitor_status 
   FROM system.information_schema.lakehouse_monitors
   ```

3. Manually trigger refresh:
   ```python
   lakehouse_monitoring.refresh_monitor(table_name="...")
   ```

### Stale Data
**Issue:** Quality metrics are outdated

**Solutions:**
1. Check schedule frequency
2. Verify warehouse is running
3. Look for errors in monitor execution logs

### Missing Columns
**Issue:** Not all columns appear in metrics

**Solutions:**
1. Lakehouse Monitoring may skip very sparse columns
2. Check column data types (some types excluded)
3. Verify column exists in latest table schema

---

## Next Steps

1. **Enable monitoring** on your critical tables
2. **Test DataPrism integration** by asking quality questions
3. **Set up alerts** for quality thresholds
4. **Review trends** weekly to identify patterns
5. **Expand coverage** to more tables over time

---

## Related Documentation

- [Data Quality Monitoring Guide](./DATA_QUALITY_MONITORING.md)
- [Databricks Lakehouse Monitoring Docs](https://docs.databricks.com/lakehouse-monitoring/index.html)
- [Unity Catalog System Tables](https://docs.databricks.com/administration-guide/system-tables/index.html)
