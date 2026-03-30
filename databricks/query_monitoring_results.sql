-- ============================================================================
-- Query Custom Monitoring Results
-- Use these queries in DataPrism or Databricks SQL
-- ============================================================================

-- ── 1. Latest Profile Metrics (like _profile_metrics) ──
SELECT 
  table_name,
  column_name,
  null_percentage,
  distinct_count,
  window_end_time
FROM monitoring.data_quality.profile_metrics
WHERE window_end_time >= DATE_SUB(CURRENT_DATE(), 7)
ORDER BY window_end_time DESC, table_name, column_name;

-- ── 2. Freshness Status ──
SELECT 
  table_name,
  freshness_status,
  age_hours,
  latest_record,
  checked_at
FROM monitoring.data_quality.freshness_metrics
WHERE checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
ORDER BY age_hours DESC;

-- ── 3. Drift Detection Results ──
SELECT 
  table_name,
  column_name,
  drift_status,
  drift_score,
  baseline_mean,
  current_mean,
  checked_at
FROM monitoring.data_quality.drift_metrics
WHERE checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND drift_status = 'DRIFTED'
ORDER BY drift_score DESC;

-- ── 4. Quality Rules Status ──
SELECT 
  table_name,
  rule_name,
  description,
  status,
  passing_rate,
  violation_count,
  checked_at
FROM monitoring.data_quality.quality_rules
WHERE checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  AND status IN ('FAIL', 'WARNING')
ORDER BY passing_rate ASC;

-- ── 5. Quality Score by Table (Overall Summary) ──
WITH latest_profiles AS (
  SELECT 
    table_name,
    AVG(null_percentage) as avg_null_pct,
    COUNT(*) as columns_checked
  FROM monitoring.data_quality.profile_metrics
  WHERE window_end_time >= DATE_SUB(CURRENT_DATE(), 1)
  GROUP BY table_name
),
latest_freshness AS (
  SELECT 
    table_name,
    freshness_status,
    age_hours,
    ROW_NUMBER() OVER (PARTITION BY table_name ORDER BY checked_at DESC) as rn
  FROM monitoring.data_quality.freshness_metrics
),
latest_rules AS (
  SELECT 
    table_name,
    AVG(passing_rate) as avg_passing_rate,
    COUNT(CASE WHEN status = 'FAIL' THEN 1 END) as failed_rules
  FROM monitoring.data_quality.quality_rules
  WHERE checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  GROUP BY table_name
)
SELECT 
  p.table_name,
  ROUND(100 - p.avg_null_pct, 1) as completeness_score,
  CASE 
    WHEN f.freshness_status = 'FRESH' THEN 100
    WHEN f.freshness_status = 'WARNING' THEN 75
    WHEN f.freshness_status = 'STALE' THEN 25
    ELSE 50
  END as freshness_score,
  COALESCE(r.avg_passing_rate, 100) as rules_score,
  ROUND((
    (100 - p.avg_null_pct) + 
    CASE 
      WHEN f.freshness_status = 'FRESH' THEN 100
      WHEN f.freshness_status = 'WARNING' THEN 75
      WHEN f.freshness_status = 'STALE' THEN 25
      ELSE 50
    END + 
    COALESCE(r.avg_passing_rate, 100)
  ) / 3, 1) as overall_quality_score,
  f.age_hours,
  r.failed_rules
FROM latest_profiles p
LEFT JOIN latest_freshness f ON p.table_name = f.table_name AND f.rn = 1
LEFT JOIN latest_rules r ON p.table_name = r.table_name
ORDER BY overall_quality_score ASC;

-- ── 6. Quality Trends (Last 30 Days) ──
SELECT 
  table_name,
  DATE(window_end_time) as check_date,
  AVG(null_percentage) as avg_null_pct,
  100 - AVG(null_percentage) as quality_score
FROM monitoring.data_quality.profile_metrics
WHERE window_end_time >= DATE_SUB(CURRENT_DATE(), 30)
GROUP BY table_name, DATE(window_end_time)
ORDER BY table_name, check_date;

-- ── 7. Columns with Highest Null Rates ──
SELECT 
  table_name,
  column_name,
  AVG(null_percentage) as avg_null_pct,
  MAX(null_percentage) as max_null_pct
FROM monitoring.data_quality.profile_metrics
WHERE window_end_time >= DATE_SUB(CURRENT_DATE(), 7)
GROUP BY table_name, column_name
HAVING AVG(null_percentage) > 5
ORDER BY avg_null_pct DESC
LIMIT 20;

-- ── 8. Tables Needing Attention ──
WITH issues AS (
  SELECT table_name, 'High Null Rate' as issue_type, COUNT(*) as issue_count
  FROM monitoring.data_quality.profile_metrics
  WHERE null_percentage > 10 AND window_end_time >= DATE_SUB(CURRENT_DATE(), 1)
  GROUP BY table_name
  
  UNION ALL
  
  SELECT table_name, 'Stale Data' as issue_type, 1 as issue_count
  FROM monitoring.data_quality.freshness_metrics
  WHERE freshness_status IN ('STALE', 'WARNING')
    AND checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  
  UNION ALL
  
  SELECT table_name, 'Failed Quality Rule' as issue_type, COUNT(*) as issue_count
  FROM monitoring.data_quality.quality_rules
  WHERE status = 'FAIL'
    AND checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  GROUP BY table_name
  
  UNION ALL
  
  SELECT table_name, 'Data Drift' as issue_type, COUNT(*) as issue_count
  FROM monitoring.data_quality.drift_metrics
  WHERE drift_status = 'DRIFTED'
    AND checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  GROUP BY table_name
)
SELECT 
  table_name,
  COLLECT_LIST(issue_type) as issues,
  SUM(issue_count) as total_issues
FROM issues
GROUP BY table_name
ORDER BY total_issues DESC;

-- ── 9. Monitoring Coverage ──
SELECT 
  COUNT(DISTINCT table_name) as monitored_tables,
  SUM(columns_checked) as total_columns_monitored,
  MAX(window_end_time) as last_check_time,
  TIMESTAMPDIFF(HOUR, MAX(window_end_time), CURRENT_TIMESTAMP()) as hours_since_last_check
FROM (
  SELECT table_name, COUNT(DISTINCT column_name) as columns_checked, MAX(window_end_time) as window_end_time
  FROM monitoring.data_quality.profile_metrics
  GROUP BY table_name
);

-- ── 10. Alert Query (Tables Requiring Immediate Attention) ──
SELECT 
  'CRITICAL' as severity,
  table_name,
  'Stale data for ' || CAST(age_hours AS STRING) || ' hours' as issue
FROM monitoring.data_quality.freshness_metrics
WHERE freshness_status = 'STALE'
  AND checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)

UNION ALL

SELECT 
  'CRITICAL' as severity,
  table_name,
  'Quality rule failed: ' || rule_name as issue
FROM monitoring.data_quality.quality_rules
WHERE status = 'FAIL'
  AND checked_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)

UNION ALL

SELECT 
  'WARNING' as severity,
  table_name,
  'High null rate in ' || column_name || ': ' || CAST(ROUND(null_percentage, 1) AS STRING) || '%' as issue
FROM monitoring.data_quality.profile_metrics
WHERE null_percentage > 20
  AND window_end_time >= DATE_SUB(CURRENT_DATE(), 1)

ORDER BY severity, table_name;
