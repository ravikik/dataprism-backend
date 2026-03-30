# Custom Data Quality Monitoring
# Replicates Databricks Lakehouse Monitoring using PySpark on classic compute
# Schedule this notebook as a Databricks Job with classic cluster

from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# ============================================================================
# CONFIGURATION
# ============================================================================

# Tables to monitor
MONITORED_TABLES = [
    "toyota_production.sales.transactions",
    "toyota_production.manufacturing.production_schedule",
    "toyota_analytics.reporting.sales_summary",
    "toyota_analytics.customer_insights.customers"
]

# Monitoring configuration
MONITORING_CONFIG = {
    "retention_days": 90,  # Keep monitoring history for 90 days
    "alert_thresholds": {
        "null_percentage": 10.0,      # Alert if > 10% nulls
        "freshness_hours": 24,        # Alert if data older than 24 hours
        "drift_threshold": 0.5,       # Alert if drift score > 0.5
        "row_count_change": 0.3       # Alert if 30% change in row count
    }
}

# Output catalog for monitoring results
MONITORING_CATALOG = "monitoring"
MONITORING_SCHEMA = "data_quality"

# ============================================================================
# INITIALIZE
# ============================================================================

spark = SparkSession.builder.getOrCreate()

# Create monitoring schema if not exists
spark.sql(f"CREATE CATALOG IF NOT EXISTS {MONITORING_CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {MONITORING_CATALOG}.{MONITORING_SCHEMA}")

print(f"[Monitoring] Initialized at {datetime.now()}")
print(f"[Monitoring] Tables to monitor: {len(MONITORED_TABLES)}")

# ============================================================================
# 1. PROFILE METRICS (Like _profile_metrics tables)
# ============================================================================

def calculate_column_profile(df: DataFrame, col_name: str, col_type: str) -> dict:
    """
    Calculate comprehensive statistics for a single column
    Replicates Databricks profile metrics
    """
    total_count = df.count()
    
    profile = {
        "column_name": col_name,
        "data_type": col_type,
        "total_count": total_count,
    }
    
    # Null analysis
    null_count = df.filter(F.col(col_name).isNull()).count()
    profile["null_count"] = null_count
    profile["null_percentage"] = (null_count / total_count * 100) if total_count > 0 else 0
    
    # Distinct values
    distinct_count = df.select(col_name).distinct().count()
    profile["distinct_count"] = distinct_count
    profile["distinct_percentage"] = (distinct_count / total_count * 100) if total_count > 0 else 0
    
    # Type-specific statistics
    if col_type in ["int", "bigint", "double", "float", "decimal"]:
        # Numeric columns
        stats = df.select(
            F.min(col_name).alias("min_value"),
            F.max(col_name).alias("max_value"),
            F.mean(col_name).alias("mean"),
            F.stddev(col_name).alias("stddev"),
            F.percentile_approx(col_name, [0.25, 0.5, 0.75]).alias("quantiles")
        ).collect()[0]
        
        profile["min_value"] = stats["min_value"]
        profile["max_value"] = stats["max_value"]
        profile["mean"] = stats["mean"]
        profile["stddev"] = stats["stddev"]
        profile["quantiles"] = stats["quantiles"]
        
    elif col_type in ["string", "varchar"]:
        # String columns
        length_stats = df.select(
            F.min(F.length(col_name)).alias("min_length"),
            F.max(F.length(col_name)).alias("max_length"),
            F.mean(F.length(col_name)).alias("avg_length")
        ).collect()[0]
        
        profile["min_length"] = length_stats["min_length"]
        profile["max_length"] = length_stats["max_length"]
        profile["avg_length"] = length_stats["avg_length"]
        
        # Top values
        top_values = df.groupBy(col_name).count() \
            .orderBy(F.desc("count")) \
            .limit(10) \
            .collect()
        profile["top_values"] = [{"value": row[col_name], "count": row["count"]} for row in top_values]
    
    elif col_type in ["date", "timestamp"]:
        # Date/timestamp columns
        date_stats = df.select(
            F.min(col_name).alias("min_date"),
            F.max(col_name).alias("max_date")
        ).collect()[0]
        
        profile["min_date"] = str(date_stats["min_date"])
        profile["max_date"] = str(date_stats["max_date"])
    
    return profile


def profile_table(table_name: str, window_start: datetime, window_end: datetime) -> list:
    """
    Generate comprehensive profile for all columns in a table
    Returns list of column profiles
    """
    print(f"[Profile] Processing {table_name}...")
    
    try:
        df = spark.table(table_name)
        row_count = df.count()
        
        profiles = []
        
        for field in df.schema.fields:
            col_name = field.name
            col_type = str(field.dataType).lower()
            
            profile = calculate_column_profile(df, col_name, col_type)
            profile["table_name"] = table_name
            profile["window_start_time"] = window_start
            profile["window_end_time"] = window_end
            profile["row_count"] = row_count
            profile["created_at"] = datetime.now()
            
            profiles.append(profile)
        
        print(f"[Profile] ✓ {table_name}: {len(profiles)} columns profiled, {row_count:,} rows")
        return profiles
        
    except Exception as e:
        print(f"[Profile] ✗ Error profiling {table_name}: {e}")
        return []


# ============================================================================
# 2. FRESHNESS METRICS
# ============================================================================

def calculate_freshness(table_name: str, timestamp_column: str = None) -> dict:
    """
    Calculate data freshness metrics
    """
    try:
        df = spark.table(table_name)
        
        # Auto-detect timestamp column if not provided
        if timestamp_column is None:
            for field in df.schema.fields:
                if field.dataType in [TimestampType(), DateType()]:
                    timestamp_column = field.name
                    break
        
        if timestamp_column is None:
            return {
                "table_name": table_name,
                "freshness_status": "NO_TIMESTAMP_COLUMN",
                "message": "No timestamp column found for freshness check"
            }
        
        # Get latest record timestamp
        latest_record = df.select(F.max(timestamp_column).alias("latest")).collect()[0]["latest"]
        
        if latest_record is None:
            return {
                "table_name": table_name,
                "timestamp_column": timestamp_column,
                "freshness_status": "NO_DATA",
                "latest_record": None,
                "age_hours": None
            }
        
        # Calculate age
        now = datetime.now()
        age = now - latest_record
        age_hours = age.total_seconds() / 3600
        
        # Determine status
        if age_hours < MONITORING_CONFIG["alert_thresholds"]["freshness_hours"]:
            status = "FRESH"
        elif age_hours < MONITORING_CONFIG["alert_thresholds"]["freshness_hours"] * 2:
            status = "WARNING"
        else:
            status = "STALE"
        
        return {
            "table_name": table_name,
            "timestamp_column": timestamp_column,
            "latest_record": latest_record,
            "age_hours": round(age_hours, 2),
            "freshness_status": status,
            "checked_at": now
        }
        
    except Exception as e:
        return {
            "table_name": table_name,
            "freshness_status": "ERROR",
            "error": str(e)
        }


# ============================================================================
# 3. DRIFT DETECTION
# ============================================================================

def calculate_drift(table_name: str, baseline_days: int = 30) -> list:
    """
    Detect statistical drift by comparing current data to baseline
    """
    try:
        df = spark.table(table_name)
        
        # Find date column for windowing
        date_col = None
        for field in df.schema.fields:
            if field.dataType in [TimestampType(), DateType()]:
                date_col = field.name
                break
        
        if date_col is None:
            return []
        
        # Define windows
        baseline_start = datetime.now() - timedelta(days=baseline_days + 7)
        baseline_end = datetime.now() - timedelta(days=7)
        current_start = datetime.now() - timedelta(days=7)
        current_end = datetime.now()
        
        baseline_df = df.filter(
            (F.col(date_col) >= baseline_start) & 
            (F.col(date_col) < baseline_end)
        )
        
        current_df = df.filter(
            (F.col(date_col) >= current_start) & 
            (F.col(date_col) < current_end)
        )
        
        drift_results = []
        
        # Compare numeric columns
        for field in df.schema.fields:
            if str(field.dataType).lower() in ["int", "bigint", "double", "float", "decimal"]:
                col_name = field.name
                
                baseline_stats = baseline_df.select(
                    F.mean(col_name).alias("mean"),
                    F.stddev(col_name).alias("stddev")
                ).collect()[0]
                
                current_stats = current_df.select(
                    F.mean(col_name).alias("mean"),
                    F.stddev(col_name).alias("stddev")
                ).collect()[0]
                
                if baseline_stats["mean"] is not None and current_stats["mean"] is not None:
                    # Calculate drift score (normalized difference)
                    mean_diff = abs(current_stats["mean"] - baseline_stats["mean"])
                    baseline_std = baseline_stats["stddev"] or 1
                    drift_score = mean_diff / baseline_std
                    
                    if drift_score > MONITORING_CONFIG["alert_thresholds"]["drift_threshold"]:
                        drift_status = "DRIFTED"
                    else:
                        drift_status = "STABLE"
                    
                    drift_results.append({
                        "table_name": table_name,
                        "column_name": col_name,
                        "drift_type": "NUMERIC_MEAN",
                        "drift_score": round(drift_score, 4),
                        "drift_status": drift_status,
                        "baseline_mean": baseline_stats["mean"],
                        "current_mean": current_stats["mean"],
                        "baseline_stddev": baseline_stats["stddev"],
                        "current_stddev": current_stats["stddev"],
                        "checked_at": datetime.now()
                    })
        
        return drift_results
        
    except Exception as e:
        print(f"[Drift] Error calculating drift for {table_name}: {e}")
        return []


# ============================================================================
# 4. CUSTOM QUALITY RULES
# ============================================================================

def apply_custom_rules(table_name: str) -> list:
    """
    Apply custom business rules for data quality validation
    """
    rules_results = []
    
    try:
        df = spark.table(table_name)
        total_count = df.count()
        
        # Define rules based on table
        rules = []
        
        if "transactions" in table_name:
            rules = [
                {
                    "rule_name": "transaction_id_unique",
                    "description": "Transaction ID must be unique",
                    "check": lambda d: d.select("transaction_id").distinct().count() == d.count()
                },
                {
                    "rule_name": "sale_price_positive",
                    "description": "Sale price must be positive",
                    "check": lambda d: d.filter(F.col("sale_price") <= 0).count()
                },
                {
                    "rule_name": "transaction_date_recent",
                    "description": "Transaction date within last 5 years",
                    "check": lambda d: d.filter(
                        F.col("transaction_date") < F.date_sub(F.current_date(), 365*5)
                    ).count()
                }
            ]
        elif "customers" in table_name:
            rules = [
                {
                    "rule_name": "email_format_valid",
                    "description": "Email must contain @ symbol",
                    "check": lambda d: d.filter(
                        F.col("email").isNotNull() & ~F.col("email").contains("@")
                    ).count()
                },
                {
                    "rule_name": "customer_id_non_null",
                    "description": "Customer ID cannot be null",
                    "check": lambda d: d.filter(F.col("customer_id").isNull()).count()
                }
            ]
        
        # Execute rules
        for rule in rules:
            try:
                violation_count = rule["check"](df)
                passing_rate = ((total_count - violation_count) / total_count * 100) if total_count > 0 else 100
                
                if passing_rate >= 99:
                    status = "PASS"
                elif passing_rate >= 95:
                    status = "WARNING"
                else:
                    status = "FAIL"
                
                rules_results.append({
                    "table_name": table_name,
                    "rule_name": rule["rule_name"],
                    "description": rule["description"],
                    "total_records": total_count,
                    "violation_count": violation_count,
                    "passing_rate": round(passing_rate, 2),
                    "status": status,
                    "checked_at": datetime.now()
                })
                
            except Exception as e:
                print(f"[Rules] Error applying rule {rule['rule_name']}: {e}")
        
    except Exception as e:
        print(f"[Rules] Error processing {table_name}: {e}")
    
    return rules_results


# ============================================================================
# 5. SAVE MONITORING RESULTS
# ============================================================================

def save_profile_metrics(profiles: list):
    """Save profile metrics to monitoring table"""
    if not profiles:
        return
    
    schema = StructType([
        StructField("table_name", StringType()),
        StructField("column_name", StringType()),
        StructField("data_type", StringType()),
        StructField("window_start_time", TimestampType()),
        StructField("window_end_time", TimestampType()),
        StructField("total_count", LongType()),
        StructField("null_count", LongType()),
        StructField("null_percentage", DoubleType()),
        StructField("distinct_count", LongType()),
        StructField("distinct_percentage", DoubleType()),
        StructField("row_count", LongType()),
        StructField("min_value", StringType()),
        StructField("max_value", StringType()),
        StructField("mean", DoubleType()),
        StructField("stddev", DoubleType()),
        StructField("created_at", TimestampType())
    ])
    
    # Convert to DataFrame
    profile_data = []
    for p in profiles:
        profile_data.append((
            p.get("table_name"),
            p.get("column_name"),
            p.get("data_type"),
            p.get("window_start_time"),
            p.get("window_end_time"),
            p.get("total_count"),
            p.get("null_count"),
            p.get("null_percentage"),
            p.get("distinct_count"),
            p.get("distinct_percentage"),
            p.get("row_count"),
            str(p.get("min_value")),
            str(p.get("max_value")),
            p.get("mean"),
            p.get("stddev"),
            p.get("created_at")
        ))
    
    df = spark.createDataFrame(profile_data, schema)
    
    # Save to Delta table
    table_name = f"{MONITORING_CATALOG}.{MONITORING_SCHEMA}.profile_metrics"
    df.write.format("delta").mode("append").saveAsTable(table_name)
    
    print(f"[Save] ✓ Saved {len(profiles)} profile metrics")


def save_freshness_metrics(freshness_data: list):
    """Save freshness metrics"""
    if not freshness_data:
        return
    
    df = spark.createDataFrame(freshness_data)
    table_name = f"{MONITORING_CATALOG}.{MONITORING_SCHEMA}.freshness_metrics"
    df.write.format("delta").mode("append").saveAsTable(table_name)
    
    print(f"[Save] ✓ Saved {len(freshness_data)} freshness metrics")


def save_drift_metrics(drift_data: list):
    """Save drift detection results"""
    if not drift_data:
        return
    
    df = spark.createDataFrame(drift_data)
    table_name = f"{MONITORING_CATALOG}.{MONITORING_SCHEMA}.drift_metrics"
    df.write.format("delta").mode("append").saveAsTable(table_name)
    
    print(f"[Save] ✓ Saved {len(drift_data)} drift metrics")


def save_quality_rules(rules_data: list):
    """Save custom quality rules results"""
    if not rules_data:
        return
    
    df = spark.createDataFrame(rules_data)
    table_name = f"{MONITORING_CATALOG}.{MONITORING_SCHEMA}.quality_rules"
    df.write.format("delta").mode("append").saveAsTable(table_name)
    
    print(f"[Save] ✓ Saved {len(rules_data)} quality rule results")


# ============================================================================
# 6. MAIN EXECUTION
# ============================================================================

def run_monitoring():
    """Main monitoring execution"""
    print("\n" + "="*70)
    print(f"CUSTOM DATA QUALITY MONITORING - {datetime.now()}")
    print("="*70 + "\n")
    
    window_start = datetime.now() - timedelta(hours=1)
    window_end = datetime.now()
    
    all_profiles = []
    all_freshness = []
    all_drift = []
    all_rules = []
    
    for table_name in MONITORED_TABLES:
        print(f"\n[Monitor] Processing: {table_name}")
        print("-" * 70)
        
        # 1. Profile metrics
        profiles = profile_table(table_name, window_start, window_end)
        all_profiles.extend(profiles)
        
        # 2. Freshness check
        freshness = calculate_freshness(table_name)
        all_freshness.append(freshness)
        print(f"[Freshness] Status: {freshness.get('freshness_status')} "
              f"(Age: {freshness.get('age_hours', 'N/A')} hours)")
        
        # 3. Drift detection
        drift = calculate_drift(table_name)
        all_drift.extend(drift)
        if drift:
            drifted = [d for d in drift if d['drift_status'] == 'DRIFTED']
            print(f"[Drift] {len(drifted)} columns showing drift out of {len(drift)} checked")
        
        # 4. Custom rules
        rules = apply_custom_rules(table_name)
        all_rules.extend(rules)
        if rules:
            failed = [r for r in rules if r['status'] == 'FAIL']
            print(f"[Rules] {len(rules)} rules executed, {len(failed)} failed")
    
    # Save all results
    print("\n" + "="*70)
    print("SAVING RESULTS")
    print("="*70)
    
    save_profile_metrics(all_profiles)
    save_freshness_metrics(all_freshness)
    save_drift_metrics(all_drift)
    save_quality_rules(all_rules)
    
    # Generate summary
    print("\n" + "="*70)
    print("MONITORING SUMMARY")
    print("="*70)
    print(f"Tables monitored: {len(MONITORED_TABLES)}")
    print(f"Columns profiled: {len(all_profiles)}")
    print(f"Freshness checks: {len(all_freshness)}")
    print(f"Drift checks: {len(all_drift)}")
    print(f"Quality rules: {len(all_rules)}")
    
    # Alerts
    stale_tables = [f for f in all_freshness if f.get('freshness_status') in ['STALE', 'WARNING']]
    drifted_columns = [d for d in all_drift if d['drift_status'] == 'DRIFTED']
    failed_rules = [r for r in all_rules if r['status'] == 'FAIL']
    
    if stale_tables or drifted_columns or failed_rules:
        print("\n⚠️  ALERTS:")
        if stale_tables:
            print(f"  - {len(stale_tables)} tables with stale data")
        if drifted_columns:
            print(f"  - {len(drifted_columns)} columns with drift detected")
        if failed_rules:
            print(f"  - {len(failed_rules)} quality rules failed")
    else:
        print("\n✓ No issues detected - all checks passed")
    
    print("\n" + "="*70)
    print("MONITORING COMPLETE")
    print("="*70 + "\n")


# ============================================================================
# RUN
# ============================================================================

if __name__ == "__main__":
    run_monitoring()
