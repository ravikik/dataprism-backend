/**
 * Mock NLP Engine — answers natural language questions from mock data
 * without requiring a Claude API key. Pattern-matches common question
 * types and returns pre-computed answers with SQL and results.
 */

import { getMockQueryResult } from '../mock-data.js';

export interface NLPAnswer {
  type: 'sql' | 'general';
  explanation: string;
  sql: string;
  results?: {
    columns: string[];
    rows: string[][];
    rowCount: number;
    truncated: boolean;
  };
}

interface QuestionPattern {
  pattern: RegExp;
  sql: string;
  explanation: string;
}

const QUESTION_PATTERNS: QuestionPattern[] = [
  // ── Reviews per franchise / dealer ──
  {
    pattern: /average.*review.*franchise|avg.*review.*franchise|review.*per.*franchise|franchise.*review/i,
    sql: `SELECT
  d.dealer_name AS franchise,
  d.region,
  COUNT(s.survey_id) AS total_reviews,
  ROUND(AVG(s.overall_score), 1) AS avg_overall_score,
  ROUND(AVG(s.sales_experience), 1) AS avg_sales_experience,
  ROUND(AVG(s.vehicle_quality), 1) AS avg_vehicle_quality,
  ROUND(100.0 * SUM(CASE WHEN s.would_recommend THEN 1 ELSE 0 END) / COUNT(*), 1) AS recommend_pct
FROM toyota_analytics.customer_insights.satisfaction_surveys s
JOIN toyota_production.sales.dealers d ON s.dealer_id = d.dealer_id
GROUP BY d.dealer_name, d.region
ORDER BY total_reviews DESC`,
    explanation: `Here are the average reviews per franchise (dealer). Across 8 dealerships, there is an average of **317 reviews per franchise** with an overall satisfaction score of **4.4 out of 5**.\n\nKey highlights:\n- **Larry H. Miller Toyota** has the highest satisfaction (4.8) with 96.4% recommendation rate\n- **Longo Toyota** has the most reviews (518) with a solid 4.5 rating\n- **Ira Toyota** has the lowest scores (4.1) — may need attention\n\nThe data comes from post-sale satisfaction surveys joined with the dealer directory.`,
  },
  // ── Reviews per dealer (alternate phrasing) ──
  {
    pattern: /review.*dealer|dealer.*review|survey.*dealer|dealer.*survey|avg.*survey/i,
    sql: `SELECT
  d.dealer_name,
  d.region,
  COUNT(s.survey_id) AS total_reviews,
  ROUND(AVG(s.overall_score), 1) AS avg_score,
  ROUND(AVG(s.sales_experience), 1) AS avg_sales_exp,
  ROUND(AVG(s.vehicle_quality), 1) AS avg_vehicle_quality,
  ROUND(100.0 * SUM(CASE WHEN s.would_recommend THEN 1 ELSE 0 END) / COUNT(*), 1) AS recommend_pct
FROM toyota_analytics.customer_insights.satisfaction_surveys s
JOIN toyota_production.sales.dealers d ON s.dealer_id = d.dealer_id
GROUP BY d.dealer_name, d.region
ORDER BY avg_score DESC`,
    explanation: `Here are the customer review statistics per dealer. The average satisfaction score across all dealerships is **4.4 out of 5** with an **88.8% recommendation rate**.\n\nTop performers:\n- **Larry H. Miller Toyota** leads with 4.8 avg score and 96.4% recommendation\n- **Toyota of Dallas** follows with 4.6 avg score\n\nAreas for improvement:\n- **Ira Toyota** and **Toyota of Naperville** score below 4.3 — consider customer experience initiatives`,
  },
  // ── Sales by region ──
  {
    pattern: /sales.*region|region.*sales|revenue.*region|region.*revenue/i,
    sql: `SELECT region, SUM(units_sold) AS units_sold, SUM(total_revenue) AS total_revenue, ROUND(AVG(avg_sale_price), 2) AS avg_sale_price
FROM toyota_analytics.reporting.sales_summary
GROUP BY region
ORDER BY total_revenue DESC`,
    explanation: `Here's the sales breakdown by region. The **West** region leads with 6,120 units sold and $220.3M in revenue, while **Northwest** has the smallest market with 2,890 units.\n\nTotal across all regions: **27,480 units** generating over **$958M** in revenue.\n\nThe average sale price is remarkably consistent at ~$35,000 across regions, indicating stable pricing strategy.`,
  },
  // ── Top dealers ──
  {
    pattern: /top.*dealer|best.*dealer|dealer.*performance|dealer.*rank/i,
    sql: `SELECT dealer_name, region, units_sold, revenue, target_achievement, customer_satisfaction
FROM toyota_analytics.reporting.dealer_performance
ORDER BY revenue DESC
LIMIT 10`,
    explanation: `Here are the top-performing dealers ranked by revenue.\n\n**Longo Toyota** (West) leads with $37.6M revenue and 1,045 units sold, achieving 108.3% of their sales target. **Toyota of Dallas** (Southwest) follows with the highest satisfaction score of 4.8.\n\n5 out of 8 dealers exceeded their sales targets (>100% achievement). **Larry H. Miller Toyota** stands out with the highest customer satisfaction at 4.9, despite being 5th in revenue.`,
  },
  // ── Sales by model ──
  {
    pattern: /sales.*model|model.*sales|best.*selling|top.*model|popular.*model/i,
    sql: `SELECT model_name, model_year, units_sold, total_revenue, avg_discount
FROM toyota_analytics.reporting.sales_summary
WHERE model_year = 2025
GROUP BY model_name, model_year
ORDER BY units_sold DESC`,
    explanation: `Here are the 2025 model year sales rankings.\n\nThe **RAV4** is the best-selling model with 10,540 units and $337.3M in revenue, followed by the **Camry** (8,920 units). Together, these two models account for over 40% of total sales.\n\nNotably, the **RAV4** has one of the lowest average discounts ($980), indicating strong demand. The **Tundra** requires the highest discounting ($2,100) to move inventory.`,
  },
  // ── Monthly trends ──
  {
    pattern: /month.*trend|sales.*trend|monthly.*sales|over.*time|revenue.*trend/i,
    sql: `SELECT month, units_sold, revenue, avg_price, yoy_growth_pct
FROM toyota_analytics.reporting.sales_summary
ORDER BY month`,
    explanation: `Here's the monthly sales trend for 2025.\n\nSales peaked in **December** with 25,600 units ($896M) and 9.2% YoY growth. The lowest month was **February** with 17,800 units, which is typical seasonal softness.\n\nOverall, every month shows **positive year-over-year growth** (3.5% to 9.2%), indicating strong market momentum. The average monthly volume is approximately 22,100 units.`,
  },
  // ── Inventory ──
  {
    pattern: /inventory|stock|days.*lot|in.transit/i,
    sql: `SELECT model_name, available, in_transit, avg_days_on_lot, total_msrp
FROM toyota_production.inventory.vehicle_stock
GROUP BY model_name
ORDER BY available DESC`,
    explanation: `Here's the current inventory status across all dealers.\n\nThe **Corolla** has the highest available stock (4,100 units) but also the longest days on lot (35 days). The **4Runner** has only 12 days on lot, suggesting high demand and potential supply constraints.\n\nTotal inventory value across all models is approximately **$599M**. Models with low stock and low days-on-lot (4Runner, Tacoma) may need increased allocation.`,
  },
  // ── Manufacturing / quality ──
  {
    pattern: /manufactur|production|plant|quality|defect/i,
    sql: `SELECT plant_name, model_name, units_produced, pass_rate, defects_per_unit, downtime_minutes
FROM toyota_production.manufacturing.production_lines
JOIN toyota_production.manufacturing.quality_metrics USING (plant_name, model_name)
ORDER BY pass_rate DESC`,
    explanation: `Here's the manufacturing quality overview across plants.\n\n**Huntsville, AL** leads with a 99.1% pass rate for Corolla production and the lowest defects per unit (0.022). **Georgetown, KY** is the highest-volume plant producing both Camry and RAV4.\n\nAll plants maintain pass rates above 97.5%, well within quality thresholds. The **San Antonio Tundra line** has the most downtime (75 min) and highest defect rate (0.048) — may warrant process review.`,
  },
  // ── Customer satisfaction ──
  {
    pattern: /customer.*satisfaction|satisfaction.*score|would.*recommend|customer.*age/i,
    sql: `SELECT age_group, AVG(overall_score) AS avg_satisfaction,
  ROUND(100.0 * SUM(CASE WHEN would_recommend THEN 1 ELSE 0 END) / COUNT(*), 1) AS would_recommend_pct,
  AVG(lifetime_value) AS avg_lifetime_value, COUNT(*) AS customer_count
FROM toyota_analytics.customer_insights.satisfaction_surveys s
JOIN toyota_analytics.customer_insights.customers c ON s.customer_id = c.customer_id
GROUP BY c.age_group
ORDER BY age_group`,
    explanation: `Here's customer satisfaction broken down by age group.\n\nSatisfaction scores increase steadily with age, from **4.2** (18-25) to **4.8** (65+). The 65+ group also has the highest recommendation rate at 93.5%.\n\nThe **36-45** age group is the largest segment (7,200 customers) with solid satisfaction (4.5). Lifetime value peaks at **$110,000** for the 56-65 group.\n\nThe younger demographic (18-25) shows the lowest scores — targeted engagement programs could help improve retention.`,
  },
];

/** Answer a natural language question using pattern matching against mock data */
export function answerQuestion(question: string): NLPAnswer {
  const match = QUESTION_PATTERNS.find(p => p.pattern.test(question));

  if (match) {
    const results = getMockQueryResult(match.sql);
    return {
      type: 'sql',
      explanation: match.explanation,
      sql: match.sql,
      results,
    };
  }

  // Fallback: general response with default data
  const results = getMockQueryResult(question);
  return {
    type: 'general',
    explanation: `I found some relevant data for your question. Here's an overview of Toyota's model performance across key metrics.\n\nThe **RAV4** leads in unit sales with 10,540 units and a 14.7% market share, followed by **Camry** (8,920 units, 12.4%) and **Corolla** (7,350 units, 10.2%).\n\nTry asking more specific questions like:\n- "Average reviews per franchise"\n- "Top dealers by performance"\n- "Monthly sales trend"\n- "Manufacturing quality by plant"`,
    sql: `SELECT model_name, units_sold, revenue, market_share_pct
FROM toyota_analytics.reporting.sales_summary
ORDER BY units_sold DESC`,
    results,
  };
}

/** Check if the mock engine can handle this question (for routing decisions) */
export function canAnswer(question: string): boolean {
  return QUESTION_PATTERNS.some(p => p.pattern.test(question));
}
