#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// ── Tool Definitions ──────────────────────────────────────────────
var TOOLS = [
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
var AWSServer = /** @class */ (function () {
    function AWSServer() {
        this.credentials = null;
        this.server = new index_js_1.Server({
            name: 'aws-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    AWSServer.prototype.setCredentials = function (credentials) {
        this.credentials = credentials;
        console.error('[AWS MCP] Credentials set:', {
            hasAccessKey: !!credentials.accessKey,
            hasSecretKey: !!credentials.secretKey,
            region: credentials.region,
        });
    };
    AWSServer.prototype.setupHandlers = function () {
        var _this = this;
        // List available tools
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, ({
                        tools: TOOLS,
                    })];
            });
        }); });
        // Handle tool calls
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, function (request) { return __awaiter(_this, void 0, void 0, function () {
            var _a, name, args, result;
            return __generator(this, function (_b) {
                _a = request.params, name = _a.name, args = _a.arguments;
                console.error("[AWS MCP] Tool called: ".concat(name));
                try {
                    result = void 0;
                    switch (name) {
                        case 'describe_aws_resources':
                            result = this.handleDescribeAWSResources(args);
                            break;
                        case 'get_aws_health':
                            result = this.handleGetAWSHealth(args);
                            break;
                        case 'get_aws_costs':
                            result = this.handleGetAWSCosts(args);
                            break;
                        default:
                            throw new Error("Unknown tool: ".concat(name));
                    }
                    return [2 /*return*/, {
                            content: [{ type: 'text', text: result }],
                        }];
                }
                catch (error) {
                    console.error("[AWS MCP] Error in ".concat(name, ":"), error.message);
                    return [2 /*return*/, {
                            content: [{ type: 'text', text: "Error: ".concat(error.message) }],
                            isError: true,
                        }];
                }
                return [2 /*return*/];
            });
        }); });
    };
    // ── Tool Handlers ────────────────────────────────────────────────
    AWSServer.prototype.handleDescribeAWSResources = function (input) {
        // TODO: Implement real AWS SDK calls when credentials are available
        // For now, return mock data
        var mockResources = {
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
        if (input.resource_type === 'all')
            return JSON.stringify(mockResources);
        var data = mockResources[input.resource_type];
        return data ? JSON.stringify(data) : "No mock data for resource type: ".concat(input.resource_type);
    };
    AWSServer.prototype.handleGetAWSHealth = function (input) {
        // TODO: Implement real CloudWatch API calls
        var health = {
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
    };
    AWSServer.prototype.handleGetAWSCosts = function (input) {
        // TODO: Implement real Cost Explorer API calls
        var costs = {
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
    };
    AWSServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('[AWS MCP] Server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return AWSServer;
}());
// ── Entry Point ────────────────────────────────────────────────────
var server = new AWSServer();
// Allow credentials to be set via environment variables
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    server.setCredentials({
        accessKey: process.env.AWS_ACCESS_KEY_ID,
        secretKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
    });
}
server.run().catch(console.error);
