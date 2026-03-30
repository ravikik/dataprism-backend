"use strict";
/**
 * Mock data for DataPrism AI when live data platforms are not connected.
 * Provides a realistic Toyota/automotive-themed sample catalog with
 * franchise (dealer) and review (survey) data for NLP demonstrations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOCK_SCHEMA_CONTEXT = exports.MOCK_SCHEMAS = exports.MOCK_CATALOGS = void 0;
exports.getMockQueryResult = getMockQueryResult;
exports.getMockSchemaContext = getMockSchemaContext;
exports.getAllMockSchemaContext = getAllMockSchemaContext;
exports.MOCK_CATALOGS = [
    { name: 'toyota_production', comment: 'Production data catalog', owner: 'data_engineering' },
    { name: 'toyota_analytics', comment: 'Analytics and reporting catalog', owner: 'data_analytics' },
];
exports.MOCK_SCHEMAS = {
    toyota_production: [
        { name: 'sales', fullName: 'toyota_production.sales', comment: 'Vehicle sales data' },
        { name: 'inventory', fullName: 'toyota_production.inventory', comment: 'Dealer inventory tracking' },
        { name: 'manufacturing', fullName: 'toyota_production.manufacturing', comment: 'Manufacturing plant data' },
    ],
    toyota_analytics: [
        { name: 'reporting', fullName: 'toyota_analytics.reporting', comment: 'Aggregated reports' },
        { name: 'customer_insights', fullName: 'toyota_analytics.customer_insights', comment: 'Customer analytics' },
    ],
};
exports.MOCK_SCHEMA_CONTEXT = {
    'toyota_production.sales': [
        'Table: toyota_production.sales.transactions -- Vehicle sales transactions (columns: transaction_id STRING, sale_date DATE, dealer_id STRING, vehicle_vin STRING, model_name STRING, model_year INT, trim_level STRING, exterior_color STRING, sale_price DECIMAL(10,2), msrp DECIMAL(10,2), discount_amount DECIMAL(10,2), payment_method STRING, finance_term_months INT, customer_id STRING, region STRING, state STRING)',
        'Table: toyota_production.sales.dealers -- Dealer/franchise information (columns: dealer_id STRING, dealer_name STRING, city STRING, state STRING, region STRING, dealer_type STRING, open_date DATE, annual_target INT, latitude DOUBLE, longitude DOUBLE)',
        'Table: toyota_production.sales.monthly_targets -- Monthly sales targets by dealer (columns: dealer_id STRING, month DATE, target_units INT, target_revenue DECIMAL(12,2), actual_units INT, actual_revenue DECIMAL(12,2))',
    ].join('\n'),
    'toyota_production.inventory': [
        'Table: toyota_production.inventory.vehicle_stock -- Current dealer inventory (columns: vin STRING, model_name STRING, model_year INT, trim_level STRING, exterior_color STRING, interior_color STRING, dealer_id STRING, arrival_date DATE, days_on_lot INT, status STRING -- Available/Sold/In-Transit, msrp DECIMAL(10,2), invoice_price DECIMAL(10,2))',
        'Table: toyota_production.inventory.allocation -- Vehicle allocation to dealers (columns: allocation_id STRING, model_name STRING, model_year INT, trim_level STRING, dealer_id STRING, allocation_date DATE, expected_arrival DATE, quantity INT, status STRING)',
    ].join('\n'),
    'toyota_production.manufacturing': [
        'Table: toyota_production.manufacturing.production_lines -- Assembly line output (columns: line_id STRING, plant_name STRING, model_name STRING, shift STRING, production_date DATE, units_produced INT, units_passed_qc INT, defect_count INT, downtime_minutes INT)',
        'Table: toyota_production.manufacturing.plants -- Manufacturing plants (columns: plant_id STRING, plant_name STRING, location STRING, country STRING, capacity_per_day INT, established_year INT, active BOOLEAN)',
        'Table: toyota_production.manufacturing.quality_metrics -- Quality control data (columns: metric_id STRING, plant_name STRING, production_date DATE, model_name STRING, inspection_type STRING, pass_rate DECIMAL(5,2), defects_per_unit DECIMAL(5,3), rework_count INT)',
    ].join('\n'),
    'toyota_analytics.reporting': [
        'Table: toyota_analytics.reporting.sales_summary -- Monthly sales aggregates (columns: month DATE, region STRING, model_name STRING, units_sold INT, total_revenue DECIMAL(14,2), avg_sale_price DECIMAL(10,2), avg_discount DECIMAL(10,2), market_share DECIMAL(5,2))',
        'Table: toyota_analytics.reporting.dealer_performance -- Dealer scorecards (columns: dealer_id STRING, dealer_name STRING, quarter STRING, units_sold INT, revenue DECIMAL(14,2), target_achievement DECIMAL(5,2), customer_satisfaction DECIMAL(3,1), rank INT)',
    ].join('\n'),
    'toyota_analytics.customer_insights': [
        'Table: toyota_analytics.customer_insights.customers -- Customer profiles (columns: customer_id STRING, first_name STRING, last_name STRING, email STRING, phone STRING, city STRING, state STRING, zip_code STRING, age_group STRING, income_bracket STRING, first_purchase_date DATE, lifetime_value DECIMAL(12,2))',
        'Table: toyota_analytics.customer_insights.satisfaction_surveys -- Post-sale surveys / reviews (columns: survey_id STRING, customer_id STRING, dealer_id STRING, survey_date DATE, overall_score INT, sales_experience INT, vehicle_quality INT, service_quality INT, would_recommend BOOLEAN, comments STRING)',
    ].join('\n'),
};
var MOCK_QUERY_RESULTS = [
    // ── Reviews per franchise / dealer surveys ──
    {
        pattern: /review.*franchise|franchise.*review|survey.*dealer|dealer.*survey|review.*dealer|avg.*review|average.*review/i,
        columns: ['dealer_name', 'region', 'total_reviews', 'avg_overall_score', 'avg_sales_experience', 'avg_vehicle_quality', 'recommend_pct'],
        rows: [
            ['Toyota of Dallas', 'Southwest', '342', '4.6', '4.7', '4.5', '92.1'],
            ['Longo Toyota', 'West', '518', '4.5', '4.4', '4.6', '89.8'],
            ['Toyota of Orlando', 'Southeast', '287', '4.4', '4.3', '4.5', '88.5'],
            ['AutoNation Toyota', 'Southeast', '395', '4.3', '4.2', '4.4', '86.3'],
            ['Larry H. Miller Toyota', 'West', '221', '4.8', '4.9', '4.7', '96.4'],
            ['Toyota of Naperville', 'Midwest', '198', '4.2', '4.1', '4.3', '84.2'],
            ['Ira Toyota', 'Northeast', '267', '4.1', '4.0', '4.2', '82.7'],
            ['Hendrick Toyota', 'Southeast', '312', '4.5', '4.4', '4.6', '90.1'],
        ],
    },
    // ── Sales by region ──
    {
        pattern: /sales.*region|region.*sales|group by.*region/i,
        columns: ['region', 'units_sold', 'total_revenue', 'avg_sale_price'],
        rows: [
            ['Northeast', '4520', '158200000.00', '35000.00'],
            ['Southeast', '5830', '198620000.00', '34070.00'],
            ['Midwest', '3910', '132940000.00', '34000.00'],
            ['Southwest', '4210', '147350000.00', '35000.00'],
            ['West', '6120', '220320000.00', '36000.00'],
            ['Northwest', '2890', '101150000.00', '35000.00'],
        ],
    },
    // ── Sales by model ──
    {
        pattern: /model.*sale|sale.*model|group by.*model/i,
        columns: ['model_name', 'model_year', 'units_sold', 'total_revenue', 'avg_discount'],
        rows: [
            ['Camry', '2025', '8920', '267600000.00', '1250.00'],
            ['RAV4', '2025', '10540', '337280000.00', '980.00'],
            ['Corolla', '2025', '7350', '176400000.00', '1100.00'],
            ['Highlander', '2025', '5680', '238560000.00', '1500.00'],
            ['Tacoma', '2025', '6200', '223200000.00', '800.00'],
            ['Tundra', '2025', '3150', '157500000.00', '2100.00'],
            ['4Runner', '2025', '4100', '172200000.00', '600.00'],
            ['GR86', '2025', '1890', '56700000.00', '200.00'],
        ],
    },
    // ── Dealer performance / top dealers ──
    {
        pattern: /dealer.*performance|dealer.*rank|top.*dealer|best.*dealer/i,
        columns: ['dealer_name', 'region', 'units_sold', 'revenue', 'target_achievement', 'satisfaction'],
        rows: [
            ['Toyota of Dallas', 'Southwest', '892', '31220000.00', '112.5', '4.8'],
            ['Longo Toyota', 'West', '1045', '37620000.00', '108.3', '4.7'],
            ['Toyota of Orlando', 'Southeast', '780', '27300000.00', '105.1', '4.6'],
            ['AutoNation Toyota', 'Southeast', '720', '25200000.00', '102.8', '4.5'],
            ['Larry H. Miller Toyota', 'West', '695', '25020000.00', '101.2', '4.9'],
            ['Toyota of Naperville', 'Midwest', '640', '22400000.00', '98.5', '4.4'],
            ['Ira Toyota', 'Northeast', '615', '21525000.00', '96.2', '4.3'],
            ['Hendrick Toyota', 'Southeast', '590', '20650000.00', '94.8', '4.6'],
        ],
    },
    // ── Manufacturing / production / quality ──
    {
        pattern: /manufactur|production|plant|quality|defect/i,
        columns: ['plant_name', 'model_name', 'units_produced', 'pass_rate', 'defects_per_unit', 'downtime_minutes'],
        rows: [
            ['Georgetown, KY', 'Camry', '1250', '98.50', '0.032', '45'],
            ['Georgetown, KY', 'RAV4', '980', '98.80', '0.028', '30'],
            ['Princeton, IN', 'Highlander', '870', '97.90', '0.041', '60'],
            ['San Antonio, TX', 'Tacoma', '760', '98.20', '0.035', '55'],
            ['San Antonio, TX', 'Tundra', '520', '97.50', '0.048', '75'],
            ['Huntsville, AL', 'Corolla', '1100', '99.10', '0.022', '20'],
            ['Blue Springs, MS', '4Runner', '680', '98.60', '0.030', '35'],
        ],
    },
    // ── Customer / satisfaction / survey ──
    {
        pattern: /customer|satisfaction|survey|recommend/i,
        columns: ['age_group', 'avg_satisfaction', 'would_recommend_pct', 'avg_lifetime_value', 'customer_count'],
        rows: [
            ['18-25', '4.2', '82.5', '35000.00', '2150'],
            ['26-35', '4.4', '86.1', '52000.00', '5840'],
            ['36-45', '4.5', '88.3', '78000.00', '7200'],
            ['46-55', '4.6', '90.2', '95000.00', '6100'],
            ['56-65', '4.7', '92.0', '110000.00', '4300'],
            ['65+', '4.8', '93.5', '85000.00', '2900'],
        ],
    },
    // ── Inventory / stock ──
    {
        pattern: /inventory|stock|days.*lot|in.transit/i,
        columns: ['model_name', 'available', 'in_transit', 'avg_days_on_lot', 'total_msrp'],
        rows: [
            ['Camry', '3200', '1500', '28', '128000000.00'],
            ['RAV4', '2800', '2100', '18', '123200000.00'],
            ['Corolla', '4100', '1200', '35', '98400000.00'],
            ['Highlander', '1900', '800', '22', '79800000.00'],
            ['Tacoma', '1500', '1800', '15', '54000000.00'],
            ['Tundra', '1100', '600', '32', '55000000.00'],
            ['4Runner', '900', '1100', '12', '37800000.00'],
            ['GR86', '650', '400', '42', '19500000.00'],
        ],
    },
    // ── Monthly trends ──
    {
        pattern: /month|trend|over time|quarterly|year/i,
        columns: ['month', 'units_sold', 'revenue', 'avg_price', 'yoy_growth_pct'],
        rows: [
            ['2025-01', '18200', '637000000.00', '35000.00', '5.2'],
            ['2025-02', '17800', '623000000.00', '35000.00', '4.8'],
            ['2025-03', '21500', '752500000.00', '35000.00', '6.1'],
            ['2025-04', '22100', '773500000.00', '35000.00', '7.3'],
            ['2025-05', '23400', '819000000.00', '35000.00', '8.0'],
            ['2025-06', '24800', '868000000.00', '35000.00', '6.5'],
            ['2025-07', '23100', '808500000.00', '35000.00', '5.9'],
            ['2025-08', '22600', '791000000.00', '35000.00', '4.2'],
            ['2025-09', '21900', '766500000.00', '35000.00', '3.8'],
            ['2025-10', '24200', '847000000.00', '35000.00', '7.1'],
            ['2025-11', '20500', '717500000.00', '35000.00', '3.5'],
            ['2025-12', '25600', '896000000.00', '35000.00', '9.2'],
        ],
    },
];
/** Default fallback result */
var DEFAULT_RESULT = {
    pattern: /./,
    columns: ['model_name', 'units_sold', 'revenue', 'market_share_pct'],
    rows: [
        ['Camry', '8920', '267600000.00', '12.4'],
        ['RAV4', '10540', '337280000.00', '14.7'],
        ['Corolla', '7350', '176400000.00', '10.2'],
        ['Highlander', '5680', '238560000.00', '7.9'],
        ['Tacoma', '6200', '223200000.00', '8.6'],
        ['Tundra', '3150', '157500000.00', '4.4'],
        ['4Runner', '4100', '172200000.00', '5.7'],
        ['GR86', '1890', '56700000.00', '2.6'],
    ],
};
function getMockQueryResult(sql) {
    var match = MOCK_QUERY_RESULTS.find(function (m) { return m.pattern.test(sql); });
    var result = match || DEFAULT_RESULT;
    return {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
        truncated: false,
    };
}
function getMockSchemaContext(schemas) {
    return schemas
        .map(function (s) { return exports.MOCK_SCHEMA_CONTEXT[s] || ''; })
        .filter(Boolean)
        .join('\n');
}
/** Get all available mock schema context (for NLP engine) */
function getAllMockSchemaContext() {
    return Object.values(exports.MOCK_SCHEMA_CONTEXT).join('\n');
}
