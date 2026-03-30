#!/usr/bin/env node
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var mock_data_js_1 = require("../mock-data.js");
// ── Tool Definitions ──────────────────────────────────────────────
var TOOLS = [
    {
        name: 'get_schema_context',
        description: 'Fetch table and column metadata for specified database schemas from Databricks Unity Catalog. Returns table names, column definitions, data types, and comments.',
        inputSchema: {
            type: 'object',
            properties: {
                schemas: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of schema identifiers in "catalog.schema" format, e.g. ["toyota_production.sales"]',
                },
            },
            required: ['schemas'],
        },
    },
    {
        name: 'execute_sql',
        description: 'Execute a SQL query on the Databricks SQL warehouse. Returns column names and row data.',
        inputSchema: {
            type: 'object',
            properties: {
                sql: {
                    type: 'string',
                    description: 'A valid Databricks / Spark SQL query to execute',
                },
            },
            required: ['sql'],
        },
    },
    {
        name: 'search_tables',
        description: 'Search for tables in a Databricks Unity Catalog schema. Returns a list of table names with comments.',
        inputSchema: {
            type: 'object',
            properties: {
                catalog: { type: 'string', description: 'Catalog name to search within' },
                schema: { type: 'string', description: 'Schema name to search within' },
            },
            required: ['catalog', 'schema'],
        },
    },
    {
        name: 'get_table_lineage',
        description: 'Track data lineage for a table. Returns upstream sources and downstream consumers.',
        inputSchema: {
            type: 'object',
            properties: {
                table_name: { type: 'string', description: 'Full table name (catalog.schema.table)' },
                direction: {
                    type: 'string',
                    enum: ['upstream', 'downstream', 'both'],
                    description: 'Direction of lineage to retrieve (default: both)',
                },
            },
            required: ['table_name'],
        },
    },
    {
        name: 'get_table_permissions',
        description: 'View access grants and permissions for tables, schemas, or catalogs.',
        inputSchema: {
            type: 'object',
            properties: {
                object_name: { type: 'string', description: 'Full object name' },
                object_type: {
                    type: 'string',
                    enum: ['catalog', 'schema', 'table'],
                    description: 'Type of object',
                },
            },
            required: ['object_name', 'object_type'],
        },
    },
    {
        name: 'get_audit_logs',
        description: 'Retrieve audit trails of data access and modifications.',
        inputSchema: {
            type: 'object',
            properties: {
                object_name: { type: 'string', description: 'Optional: filter by object name' },
                event_type: {
                    type: 'string',
                    enum: ['all', 'read', 'write', 'grant', 'create', 'delete'],
                    description: 'Type of events to retrieve',
                },
                time_range: {
                    type: 'string',
                    enum: ['last_24_hours', 'last_7_days', 'last_30_days'],
                    description: 'Time range for audit logs',
                },
            },
            required: ['event_type'],
        },
    },
    {
        name: 'get_data_classification',
        description: 'Check PII tags, compliance labels, and sensitivity levels for tables and columns.',
        inputSchema: {
            type: 'object',
            properties: {
                object_name: { type: 'string', description: 'Full table name' },
                include_columns: {
                    type: 'boolean',
                    description: 'Include column-level classification (default: true)',
                },
            },
            required: ['object_name'],
        },
    },
    {
        name: 'get_data_quality_metrics',
        description: 'Monitor data quality scores including completeness, freshness, validity, and consistency.',
        inputSchema: {
            type: 'object',
            properties: {
                table_name: { type: 'string', description: 'Full table name' },
                metric_type: {
                    type: 'string',
                    enum: ['all', 'completeness', 'freshness', 'validity', 'consistency'],
                    description: 'Type of quality metric to retrieve',
                },
            },
            required: ['table_name'],
        },
    },
    {
        name: 'list_governed_tags',
        description: 'Browse governance tags by category (security, compliance, quality, business).',
        inputSchema: {
            type: 'object',
            properties: {
                catalog: { type: 'string', description: 'Optional: filter by catalog' },
                tag_category: {
                    type: 'string',
                    enum: ['all', 'security', 'compliance', 'quality', 'business'],
                    description: 'Category of tags to list',
                },
            },
        },
    },
];
var DatabricksServer = /** @class */ (function () {
    function DatabricksServer() {
        this.credentials = null;
        this.server = new index_js_1.Server({
            name: 'databricks-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    DatabricksServer.prototype.setCredentials = function (credentials) {
        this.credentials = credentials;
        console.error('[Databricks MCP] Credentials set:', {
            hasHost: !!credentials.host,
            hasToken: !!credentials.token,
            hasWarehouseId: !!credentials.warehouseId,
        });
    };
    DatabricksServer.prototype.setupHandlers = function () {
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
            var _a, name, args, result, _b, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = request.params, name = _a.name, args = _a.arguments;
                        console.error("[Databricks MCP] Tool called: ".concat(name));
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 19, , 20]);
                        result = void 0;
                        _b = name;
                        switch (_b) {
                            case 'get_schema_context': return [3 /*break*/, 2];
                            case 'execute_sql': return [3 /*break*/, 4];
                            case 'search_tables': return [3 /*break*/, 6];
                            case 'get_table_lineage': return [3 /*break*/, 8];
                            case 'get_table_permissions': return [3 /*break*/, 10];
                            case 'get_audit_logs': return [3 /*break*/, 12];
                            case 'get_data_classification': return [3 /*break*/, 13];
                            case 'get_data_quality_metrics': return [3 /*break*/, 15];
                            case 'list_governed_tags': return [3 /*break*/, 16];
                        }
                        return [3 /*break*/, 17];
                    case 2: return [4 /*yield*/, this.handleGetSchemaContext(args)];
                    case 3:
                        result = _c.sent();
                        return [3 /*break*/, 18];
                    case 4: return [4 /*yield*/, this.handleExecuteSQL(args)];
                    case 5:
                        result = _c.sent();
                        return [3 /*break*/, 18];
                    case 6: return [4 /*yield*/, this.handleSearchTables(args)];
                    case 7:
                        result = _c.sent();
                        return [3 /*break*/, 18];
                    case 8: return [4 /*yield*/, this.handleGetTableLineage(args)];
                    case 9:
                        result = _c.sent();
                        return [3 /*break*/, 18];
                    case 10: return [4 /*yield*/, this.handleGetTablePermissions(args)];
                    case 11:
                        result = _c.sent();
                        return [3 /*break*/, 18];
                    case 12:
                        result = this.handleGetAuditLogs(args);
                        return [3 /*break*/, 18];
                    case 13: return [4 /*yield*/, this.handleGetDataClassification(args)];
                    case 14:
                        result = _c.sent();
                        return [3 /*break*/, 18];
                    case 15:
                        result = this.handleGetDataQualityMetrics(args);
                        return [3 /*break*/, 18];
                    case 16:
                        result = this.handleListGovernedTags(args);
                        return [3 /*break*/, 18];
                    case 17: throw new Error("Unknown tool: ".concat(name));
                    case 18: return [2 /*return*/, {
                            content: [{ type: 'text', text: result }],
                        }];
                    case 19:
                        error_1 = _c.sent();
                        console.error("[Databricks MCP] Error in ".concat(name, ":"), error_1.message);
                        return [2 /*return*/, {
                                content: [{ type: 'text', text: "Error: ".concat(error_1.message) }],
                                isError: true,
                            }];
                    case 20: return [2 /*return*/];
                }
            });
        }); });
    };
    // ── Tool Handlers ────────────────────────────────────────────────
    DatabricksServer.prototype.handleGetSchemaContext = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var schemas, results, _i, schemas_1, schemaPath, _a, catalog, schema, apiUrl, tablesRes, tablesData, tables, _b, tables_1, t, fullName, detailRes, detail, cols, comment, err_1;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        schemas = input.schemas;
                        if (!(schemas === null || schemas === void 0 ? void 0 : schemas.length))
                            return [2 /*return*/, 'No schemas specified'];
                        if (!(((_c = this.credentials) === null || _c === void 0 ? void 0 : _c.host) && ((_d = this.credentials) === null || _d === void 0 ? void 0 : _d.token))) return [3 /*break*/, 12];
                        console.error("[Databricks MCP] Fetching schemas from live API: ".concat(schemas.join(', ')));
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 11, , 12]);
                        results = [];
                        _i = 0, schemas_1 = schemas;
                        _e.label = 2;
                    case 2:
                        if (!(_i < schemas_1.length)) return [3 /*break*/, 10];
                        schemaPath = schemas_1[_i];
                        _a = schemaPath.split('.'), catalog = _a[0], schema = _a[1];
                        if (!catalog || !schema)
                            return [3 /*break*/, 9];
                        apiUrl = "".concat(this.credentials.host, "/api/2.1/unity-catalog/tables?catalog_name=").concat(encodeURIComponent(catalog), "&schema_name=").concat(encodeURIComponent(schema));
                        return [4 /*yield*/, fetch(apiUrl, {
                                headers: { Authorization: "Bearer ".concat(this.credentials.token) },
                            })];
                    case 3:
                        tablesRes = _e.sent();
                        if (!tablesRes.ok) {
                            console.error("[Databricks MCP] API error: ".concat(tablesRes.status));
                            return [3 /*break*/, 9];
                        }
                        return [4 /*yield*/, tablesRes.json()];
                    case 4:
                        tablesData = _e.sent();
                        tables = tablesData.tables || [];
                        _b = 0, tables_1 = tables;
                        _e.label = 5;
                    case 5:
                        if (!(_b < tables_1.length)) return [3 /*break*/, 9];
                        t = tables_1[_b];
                        fullName = t.full_name || "".concat(catalog, ".").concat(schema, ".").concat(t.name);
                        return [4 /*yield*/, fetch("".concat(this.credentials.host, "/api/2.1/unity-catalog/tables/").concat(encodeURIComponent(fullName)), { headers: { Authorization: "Bearer ".concat(this.credentials.token) } })];
                    case 6:
                        detailRes = _e.sent();
                        if (!detailRes.ok)
                            return [3 /*break*/, 8];
                        return [4 /*yield*/, detailRes.json()];
                    case 7:
                        detail = _e.sent();
                        cols = (detail.columns || [])
                            .map(function (c) { return "".concat(c.name, " ").concat(c.type_text || c.type_name || 'STRING').concat(c.comment ? " -- ".concat(c.comment) : ''); })
                            .join(', ');
                        comment = detail.comment ? " -- ".concat(detail.comment) : '';
                        results.push("Table: ".concat(fullName).concat(comment, " (columns: ").concat(cols, ")"));
                        _e.label = 8;
                    case 8:
                        _b++;
                        return [3 /*break*/, 5];
                    case 9:
                        _i++;
                        return [3 /*break*/, 2];
                    case 10:
                        if (results.length > 0) {
                            console.error("[Databricks MCP] Fetched ".concat(results.length, " tables from live API"));
                            return [2 /*return*/, results.join('\n')];
                        }
                        return [3 /*break*/, 12];
                    case 11:
                        err_1 = _e.sent();
                        console.error("[Databricks MCP] Live API failed:", err_1.message);
                        return [3 /*break*/, 12];
                    case 12:
                        // Fallback to mock
                        console.error('[Databricks MCP] Using mock schema context');
                        return [2 /*return*/, (0, mock_data_js_1.getMockSchemaContext)(schemas) || 'No tables found for the specified schemas.'];
                }
            });
        });
    };
    DatabricksServer.prototype.handleExecuteSQL = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var sql, response, data, columns, rows, err_2, result;
            var _a, _b, _c, _d, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        sql = input.sql;
                        if (!sql)
                            return [2 /*return*/, 'No SQL query provided'];
                        if (!(((_a = this.credentials) === null || _a === void 0 ? void 0 : _a.host) && ((_b = this.credentials) === null || _b === void 0 ? void 0 : _b.token) && ((_c = this.credentials) === null || _c === void 0 ? void 0 : _c.warehouseId))) return [3 /*break*/, 6];
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, fetch("".concat(this.credentials.host, "/api/2.0/sql/statements"), {
                                method: 'POST',
                                headers: {
                                    Authorization: "Bearer ".concat(this.credentials.token),
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    statement: sql,
                                    warehouse_id: this.credentials.warehouseId,
                                    wait_timeout: '30s',
                                }),
                            })];
                    case 2:
                        response = _h.sent();
                        if (!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _h.sent();
                        if (((_d = data.status) === null || _d === void 0 ? void 0 : _d.state) === 'SUCCEEDED') {
                            columns = (((_f = (_e = data.manifest) === null || _e === void 0 ? void 0 : _e.schema) === null || _f === void 0 ? void 0 : _f.columns) || []).map(function (c) { return c.name; });
                            rows = ((_g = data.result) === null || _g === void 0 ? void 0 : _g.data_array) || [];
                            return [2 /*return*/, JSON.stringify({ columns: columns, rows: rows, rowCount: rows.length })];
                        }
                        _h.label = 4;
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        err_2 = _h.sent();
                        console.error("[Databricks MCP] SQL execution failed:", err_2.message);
                        return [3 /*break*/, 6];
                    case 6:
                        result = (0, mock_data_js_1.getMockQueryResult)(sql);
                        return [2 /*return*/, JSON.stringify(result)];
                }
            });
        });
    };
    DatabricksServer.prototype.handleSearchTables = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var catalog, schema, res, data, tables_2, err_3, mockSchemas, schemaMatch, context, tables;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        catalog = input.catalog, schema = input.schema;
                        if (!(((_a = this.credentials) === null || _a === void 0 ? void 0 : _a.host) && ((_b = this.credentials) === null || _b === void 0 ? void 0 : _b.token))) return [3 /*break*/, 6];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, fetch("".concat(this.credentials.host, "/api/2.1/unity-catalog/tables?catalog_name=").concat(encodeURIComponent(catalog), "&schema_name=").concat(encodeURIComponent(schema)), { headers: { Authorization: "Bearer ".concat(this.credentials.token) } })];
                    case 2:
                        res = _c.sent();
                        if (!res.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _c.sent();
                        tables_2 = (data.tables || []).map(function (t) { return ({
                            name: t.name,
                            fullName: t.full_name,
                            comment: t.comment || '',
                            tableType: t.table_type || 'MANAGED',
                        }); });
                        if (tables_2.length > 0)
                            return [2 /*return*/, JSON.stringify(tables_2)];
                        _c.label = 4;
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        err_3 = _c.sent();
                        console.error("[Databricks MCP] Search tables failed:", err_3.message);
                        return [3 /*break*/, 6];
                    case 6:
                        mockSchemas = mock_data_js_1.MOCK_SCHEMAS[catalog];
                        if (!mockSchemas)
                            return [2 /*return*/, "No catalog found: ".concat(catalog)];
                        schemaMatch = mockSchemas.find(function (s) { return s.name === schema; });
                        if (!schemaMatch)
                            return [2 /*return*/, "No schema found: ".concat(catalog, ".").concat(schema)];
                        context = (0, mock_data_js_1.getMockSchemaContext)(["".concat(catalog, ".").concat(schema)]);
                        tables = context.split('\n').filter(Boolean).map(function (line) {
                            var _a;
                            var nameMatch = line.match(/Table:\s+(\S+)/);
                            var commentMatch = line.match(/-- (.+?) \(columns/);
                            return {
                                name: ((_a = nameMatch === null || nameMatch === void 0 ? void 0 : nameMatch[1]) === null || _a === void 0 ? void 0 : _a.split('.').pop()) || 'unknown',
                                fullName: (nameMatch === null || nameMatch === void 0 ? void 0 : nameMatch[1]) || 'unknown',
                                comment: (commentMatch === null || commentMatch === void 0 ? void 0 : commentMatch[1]) || '',
                            };
                        });
                        return [2 /*return*/, JSON.stringify(tables)];
                }
            });
        });
    };
    DatabricksServer.prototype.handleGetTableLineage = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var table_name, _a, direction, response, data, err_4;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        table_name = input.table_name, _a = input.direction, direction = _a === void 0 ? 'both' : _a;
                        if (!(((_b = this.credentials) === null || _b === void 0 ? void 0 : _b.host) && ((_c = this.credentials) === null || _c === void 0 ? void 0 : _c.token))) return [3 /*break*/, 6];
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, fetch("".concat(this.credentials.host, "/api/2.1/unity-catalog/lineage-by-name/table/").concat(encodeURIComponent(table_name), "?direction=").concat(direction), { headers: { Authorization: "Bearer ".concat(this.credentials.token) } })];
                    case 2:
                        response = _d.sent();
                        if (!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _d.sent();
                        return [2 /*return*/, JSON.stringify(data)];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        err_4 = _d.sent();
                        console.error("[Databricks MCP] Lineage fetch failed:", err_4.message);
                        return [3 /*break*/, 6];
                    case 6: 
                    // Fallback to mock
                    return [2 /*return*/, this.getMockTableLineage(table_name, direction)];
                }
            });
        });
    };
    DatabricksServer.prototype.handleGetTablePermissions = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var object_name, object_type, response, data, err_5;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        object_name = input.object_name, object_type = input.object_type;
                        if (!(((_a = this.credentials) === null || _a === void 0 ? void 0 : _a.host) && ((_b = this.credentials) === null || _b === void 0 ? void 0 : _b.token))) return [3 /*break*/, 6];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, fetch("".concat(this.credentials.host, "/api/2.1/unity-catalog/permissions/").concat(object_type, "/").concat(encodeURIComponent(object_name)), { headers: { Authorization: "Bearer ".concat(this.credentials.token) } })];
                    case 2:
                        response = _c.sent();
                        if (!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _c.sent();
                        return [2 /*return*/, JSON.stringify(data)];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        err_5 = _c.sent();
                        console.error("[Databricks MCP] Permissions fetch failed:", err_5.message);
                        return [3 /*break*/, 6];
                    case 6: 
                    // Fallback to mock
                    return [2 /*return*/, this.getMockTablePermissions(object_name, object_type)];
                }
            });
        });
    };
    DatabricksServer.prototype.handleGetAuditLogs = function (input) {
        var object_name = input.object_name, event_type = input.event_type, _a = input.time_range, time_range = _a === void 0 ? 'last_7_days' : _a;
        return this.getMockAuditLogs(object_name, event_type, time_range);
    };
    DatabricksServer.prototype.handleGetDataClassification = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var object_name, _a, include_columns, response, data, classification, err_6;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        object_name = input.object_name, _a = input.include_columns, include_columns = _a === void 0 ? true : _a;
                        if (!(((_b = this.credentials) === null || _b === void 0 ? void 0 : _b.host) && ((_c = this.credentials) === null || _c === void 0 ? void 0 : _c.token))) return [3 /*break*/, 6];
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, fetch("".concat(this.credentials.host, "/api/2.1/unity-catalog/tables/").concat(encodeURIComponent(object_name)), { headers: { Authorization: "Bearer ".concat(this.credentials.token) } })];
                    case 2:
                        response = _d.sent();
                        if (!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _d.sent();
                        classification = {
                            table: object_name,
                            tags: data.properties || {},
                            columns: include_columns ? (data.columns || []).map(function (c) { return ({
                                name: c.name,
                                type: c.type_name,
                                tags: c.tags || [],
                            }); }) : [],
                        };
                        return [2 /*return*/, JSON.stringify(classification)];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        err_6 = _d.sent();
                        console.error("[Databricks MCP] Classification fetch failed:", err_6.message);
                        return [3 /*break*/, 6];
                    case 6: 
                    // Fallback to mock
                    return [2 /*return*/, this.getMockDataClassification(object_name, include_columns)];
                }
            });
        });
    };
    DatabricksServer.prototype.handleGetDataQualityMetrics = function (input) {
        var table_name = input.table_name, _a = input.metric_type, metric_type = _a === void 0 ? 'all' : _a;
        return this.getMockDataQualityMetrics(table_name, metric_type);
    };
    DatabricksServer.prototype.handleListGovernedTags = function (input) {
        var catalog = input.catalog, _a = input.tag_category, tag_category = _a === void 0 ? 'all' : _a;
        return this.getMockGovernedTags(catalog, tag_category);
    };
    // ── Mock Data Methods (imported from executor.ts logic) ────────────
    DatabricksServer.prototype.getMockTableLineage = function (table_name, direction) {
        var lineageData = {
            'toyota_analytics.reporting.sales_summary': {
                upstream: [
                    { table: 'toyota_production.sales.transactions', type: 'table', relationship: 'source' },
                    { table: 'toyota_production.sales.dealers', type: 'table', relationship: 'dimension' },
                ],
                downstream: [
                    { table: 'toyota_analytics.reporting.executive_dashboard', type: 'view', relationship: 'derived' },
                    { table: 'toyota_analytics.reporting.monthly_kpis', type: 'table', relationship: 'aggregated' },
                ],
            },
        };
        var data = lineageData[table_name] || { upstream: [], downstream: [], message: 'No lineage data available' };
        if (direction === 'upstream')
            return JSON.stringify({ table: table_name, upstream: data.upstream });
        if (direction === 'downstream')
            return JSON.stringify({ table: table_name, downstream: data.downstream });
        return JSON.stringify(__assign({ table: table_name }, data));
    };
    DatabricksServer.prototype.getMockTablePermissions = function (object_name, object_type) {
        return JSON.stringify({
            object: object_name,
            type: object_type,
            owner: 'data_engineering',
            grants: [
                { principal: 'data_analysts', type: 'GROUP', privileges: ['SELECT', 'USE_SCHEMA'] },
                { principal: 'etl_service_account', type: 'SERVICE_PRINCIPAL', privileges: ['SELECT', 'MODIFY'] },
            ],
        });
    };
    DatabricksServer.prototype.getMockAuditLogs = function (object_name, event_type, time_range) {
        var now = new Date();
        var logs = [
            {
                timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
                event: 'READ',
                object: object_name || 'toyota_production.sales.transactions',
                user: 'alice@toyota.com',
                action: 'SELECT query executed',
            },
        ];
        return JSON.stringify({ time_range: time_range, event_type: event_type, total_events: logs.length, events: logs });
    };
    DatabricksServer.prototype.getMockDataClassification = function (object_name, include_columns) {
        var data = {
            table: object_name,
            classification_level: 'CONFIDENTIAL',
            tags: ['PII', 'GDPR'],
            contains_sensitive_data: true,
        };
        if (include_columns) {
            data.columns = [
                { name: 'customer_id', classification: 'PUBLIC', tags: [] },
                { name: 'email', classification: 'CONFIDENTIAL', tags: ['PII', 'EMAIL'] },
            ];
        }
        return JSON.stringify(data);
    };
    DatabricksServer.prototype.getMockDataQualityMetrics = function (table_name, metric_type) {
        var _a;
        var metrics = {
            table: table_name,
            overall_score: 92.5,
            completeness: { score: 95.2, null_percentage: 4.8 },
            freshness: { score: 98.0, lag_minutes: 15 },
            validity: { score: 89.8, invalid_records: 1024 },
            consistency: { score: 94.0, duplicate_records: 45 },
        };
        return JSON.stringify(metric_type === 'all' ? metrics : (_a = { table: table_name }, _a[metric_type] = metrics[metric_type], _a));
    };
    DatabricksServer.prototype.getMockGovernedTags = function (catalog, tag_category) {
        var tags = [
            { name: 'PII', category: 'security', description: 'Personally Identifiable Information', usage_count: 15 },
            { name: 'GDPR', category: 'compliance', description: 'GDPR compliance requirement', usage_count: 8 },
            { name: 'business_critical', category: 'business', description: 'Business-critical data asset', usage_count: 23 },
        ];
        var filtered = tag_category === 'all' ? tags : tags.filter(function (t) { return t.category === tag_category; });
        return JSON.stringify({ catalog: catalog || 'all', category: tag_category, tags: filtered });
    };
    DatabricksServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('[Databricks MCP] Server running on stdio');
                        return [2 /*return*/];
                }
            });
        });
    };
    return DatabricksServer;
}());
// ── Entry Point ────────────────────────────────────────────────────
var server = new DatabricksServer();
// Allow credentials to be set via environment variables
if (process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN) {
    server.setCredentials({
        host: process.env.DATABRICKS_HOST,
        token: process.env.DATABRICKS_TOKEN,
        warehouseId: process.env.DATABRICKS_WAREHOUSE_ID,
    });
}
server.run().catch(console.error);
