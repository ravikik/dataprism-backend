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
exports.MCPClientManager = void 0;
exports.getMCPManager = getMCPManager;
exports.initializeMCP = initializeMCP;
var index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
var child_process_1 = require("child_process");
var url_1 = require("url");
var path_1 = require("path");
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = (0, path_1.dirname)(__filename);
var MCPClientManager = /** @class */ (function () {
    function MCPClientManager() {
        this.clients = new Map();
        this.processes = new Map();
    }
    /**
     * Start MCP servers based on available credentials
     */
    MCPClientManager.prototype.initialize = function (credentials) {
        return __awaiter(this, void 0, void 0, function () {
            var servers, databricksServer, awsServer, _i, servers_1, serverConfig;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        servers = [];
                        // Add Databricks server if credentials available
                        if (credentials.host && credentials.token) {
                            databricksServer = (0, path_1.join)(__dirname, 'databricks-server.js');
                            servers.push({
                                name: 'databricks',
                                command: 'node',
                                args: [databricksServer],
                                env: {
                                    DATABRICKS_HOST: credentials.host,
                                    DATABRICKS_TOKEN: credentials.token,
                                    DATABRICKS_WAREHOUSE_ID: credentials.warehouseId || '',
                                },
                            });
                        }
                        // Add AWS server if credentials available
                        if (credentials.awsAccessKey && credentials.awsSecretKey) {
                            awsServer = (0, path_1.join)(__dirname, 'aws-server.js');
                            servers.push({
                                name: 'aws',
                                command: 'node',
                                args: [awsServer],
                                env: {
                                    AWS_ACCESS_KEY_ID: credentials.awsAccessKey,
                                    AWS_SECRET_ACCESS_KEY: credentials.awsSecretKey,
                                    AWS_REGION: credentials.awsRegion || 'us-east-1',
                                },
                            });
                        }
                        _i = 0, servers_1 = servers;
                        _a.label = 1;
                    case 1:
                        if (!(_i < servers_1.length)) return [3 /*break*/, 4];
                        serverConfig = servers_1[_i];
                        return [4 /*yield*/, this.startServer(serverConfig)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MCPClientManager.prototype.startServer = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            var process_1, client, transport, error_1;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        console.log("[MCP Client] Starting ".concat(config.name, " server..."));
                        process_1 = (0, child_process_1.spawn)(config.command, config.args, {
                            env: __assign(__assign({}, process_1.env), config.env),
                            stdio: ['pipe', 'pipe', 'pipe'],
                        });
                        this.processes.set(config.name, process_1);
                        // Log stderr for debugging
                        (_a = process_1.stderr) === null || _a === void 0 ? void 0 : _a.on('data', function (data) {
                            console.error("[MCP ".concat(config.name, "] ").concat(data.toString()));
                        });
                        process_1.on('exit', function (code) {
                            console.error("[MCP ".concat(config.name, "] Process exited with code ").concat(code));
                            _this.clients.delete(config.name);
                            _this.processes.delete(config.name);
                        });
                        client = new index_js_1.Client({
                            name: "dataprism-".concat(config.name, "-client"),
                            version: '1.0.0',
                        }, {
                            capabilities: {},
                        });
                        transport = new stdio_js_1.StdioClientTransport({
                            command: config.command,
                            args: config.args,
                            env: __assign(__assign({}, process_1.env), config.env),
                        });
                        return [4 /*yield*/, client.connect(transport)];
                    case 1:
                        _b.sent();
                        this.clients.set(config.name, client);
                        console.log("[MCP Client] ".concat(config.name, " server connected"));
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _b.sent();
                        console.error("[MCP Client] Failed to start ".concat(config.name, " server:"), error_1.message);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Call a tool on the appropriate MCP server
     */
    MCPClientManager.prototype.callTool = function (toolName, args) {
        return __awaiter(this, void 0, void 0, function () {
            var server, client, result, textContent, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        server = this.getServerForTool(toolName);
                        if (!server) {
                            throw new Error("No MCP server available for tool: ".concat(toolName));
                        }
                        client = this.clients.get(server);
                        if (!client) {
                            throw new Error("MCP server ".concat(server, " not connected"));
                        }
                        console.log("[MCP Client] Calling ".concat(toolName, " on ").concat(server, " server"));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, client.callTool({
                                name: toolName,
                                arguments: args,
                            })];
                    case 2:
                        result = _a.sent();
                        textContent = result.content.find(function (c) { return c.type === 'text'; });
                        return [2 /*return*/, (textContent === null || textContent === void 0 ? void 0 : textContent.text) || JSON.stringify(result.content)];
                    case 3:
                        error_2 = _a.sent();
                        console.error("[MCP Client] Tool call failed:", error_2.message);
                        throw error_2;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get list of all available tools from all connected servers
     */
    MCPClientManager.prototype.listTools = function () {
        return __awaiter(this, void 0, void 0, function () {
            var allTools, _i, _a, _b, serverName, client, response, error_3;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        allTools = [];
                        _i = 0, _a = this.clients.entries();
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        _b = _a[_i], serverName = _b[0], client = _b[1];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, client.listTools()];
                    case 3:
                        response = _c.sent();
                        console.log("[MCP Client] ".concat(serverName, " server has ").concat(response.tools.length, " tools"));
                        allTools.push.apply(allTools, response.tools);
                        return [3 /*break*/, 5];
                    case 4:
                        error_3 = _c.sent();
                        console.error("[MCP Client] Failed to list tools from ".concat(serverName, ":"), error_3.message);
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6: return [2 /*return*/, allTools];
                }
            });
        });
    };
    /**
     * Determine which server handles a given tool
     */
    MCPClientManager.prototype.getServerForTool = function (toolName) {
        var databricksTools = [
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
        var awsTools = ['describe_aws_resources', 'get_aws_health', 'get_aws_costs'];
        if (databricksTools.includes(toolName))
            return 'databricks';
        if (awsTools.includes(toolName))
            return 'aws';
        return null;
    };
    /**
     * Shutdown all MCP servers
     */
    MCPClientManager.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, _b, name_1, client, error_4, _c, _d, _e, name_2, process_2;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        console.log('[MCP Client] Shutting down all servers...');
                        _i = 0, _a = this.clients.entries();
                        _f.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        _b = _a[_i], name_1 = _b[0], client = _b[1];
                        _f.label = 2;
                    case 2:
                        _f.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, client.close()];
                    case 3:
                        _f.sent();
                        console.log("[MCP Client] Closed ".concat(name_1, " client"));
                        return [3 /*break*/, 5];
                    case 4:
                        error_4 = _f.sent();
                        console.error("[MCP Client] Error closing ".concat(name_1, " client:"), error_4.message);
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        // Kill all processes
                        for (_c = 0, _d = this.processes.entries(); _c < _d.length; _c++) {
                            _e = _d[_c], name_2 = _e[0], process_2 = _e[1];
                            try {
                                process_2.kill();
                                console.log("[MCP Client] Killed ".concat(name_2, " process"));
                            }
                            catch (error) {
                                console.error("[MCP Client] Error killing ".concat(name_2, " process:"), error.message);
                            }
                        }
                        this.clients.clear();
                        this.processes.clear();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if any servers are connected
     */
    MCPClientManager.prototype.isConnected = function () {
        return this.clients.size > 0;
    };
    /**
     * Get list of connected server names
     */
    MCPClientManager.prototype.getConnectedServers = function () {
        return Array.from(this.clients.keys());
    };
    return MCPClientManager;
}());
exports.MCPClientManager = MCPClientManager;
// Singleton instance
var mcpManager = null;
/**
 * Get or create the global MCP client manager
 */
function getMCPManager() {
    if (!mcpManager) {
        mcpManager = new MCPClientManager();
    }
    return mcpManager;
}
/**
 * Initialize MCP servers with credentials (call once at startup or when credentials change)
 */
function initializeMCP(credentials) {
    return __awaiter(this, void 0, void 0, function () {
        var manager;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    manager = getMCPManager();
                    return [4 /*yield*/, manager.initialize(credentials)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, manager];
            }
        });
    });
}
