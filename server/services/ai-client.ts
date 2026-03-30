/**
 * Custom AI Client — connects to an OpenAI-compatible model endpoint with OAuth.
 *
 * Environment variables:
 *   AI_PLATFORM_BASE_URL        – base URL, e.g. https://api.chat.eai-qa.toyota.com
 *   AI_PLATFORM_COMPLETIONS_URL – full completions URL (overrides base + /chat/completions)
 *   AI_PLATFORM_UPLOAD_URL      – file upload endpoint (optional)
 *   AI_PLATFORM_SSE_URL         – server-sent events endpoint (optional)
 *   AI_PLATFORM_DEFAULT_MODEL   – model id, e.g. claude-haiku-4.5
 *   AI_PLATFORM_TOKEN_URL       – OAuth token endpoint
 *   AI_PLATFORM_CLIENT_ID       – OAuth client ID
 *   AI_PLATFORM_CLIENT_SECRET   – OAuth client secret
 *   AI_PLATFORM_SCOPE           – OAuth scope (optional, defaults to "api")
 *   AI_PLATFORM_API_KEY         – fallback static API key (when not using OAuth)
 */

// ── Types (OpenAI-compatible) ──────────────────────────────────────

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[] | ToolResultBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
}

export interface TextBlock extends ContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock extends ContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface ModelResponse {
  content: ContentBlock[];
  model: string;
  usage: Usage;
  stop_reason?: string;
}

interface OAuthTokenCache {
  access_token: string;
  expires_at: number;
}

// ── Client ─────────────────────────────────────────────────────────

export class AIClient {
  private baseUrl: string;
  private completionsUrl: string;
  private modelName: string;
  private tokenUrl?: string;
  private clientId?: string;
  private clientSecret?: string;
  private scope: string;
  private staticApiKey?: string;
  private cachedToken: OAuthTokenCache | null = null;

  constructor(config: {
    baseUrl: string;
    completionsUrl?: string;
    modelName?: string;
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    apiKey?: string;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.completionsUrl = config.completionsUrl || `${this.baseUrl}/chat/completions`;
    this.modelName = config.modelName || 'default';
    this.tokenUrl = config.tokenUrl;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.scope = config.scope || 'api';
    this.staticApiKey = config.apiKey;
  }

  // ── OAuth Token Management ────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    // If static API key is provided and no OAuth config, use it
    if (this.staticApiKey && !this.tokenUrl) {
      return this.staticApiKey;
    }

    // Check cached token (with 60s buffer)
    if (this.cachedToken && this.cachedToken.expires_at > Date.now() + 60_000) {
      return this.cachedToken.access_token;
    }

    if (!this.tokenUrl || !this.clientId || !this.clientSecret) {
      throw new Error('OAuth configuration incomplete: AI_PLATFORM_TOKEN_URL, AI_PLATFORM_CLIENT_ID, and AI_PLATFORM_CLIENT_SECRET are required');
    }

    console.log('[AIClient] Requesting OAuth token...');
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: this.scope,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OAuth token request failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    this.cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    };

    console.log('[AIClient] OAuth token acquired, expires in', data.expires_in || 3600, 'seconds');
    return this.cachedToken.access_token;
  }

  // ── Chat Completions (OpenAI-compatible) ──────────────────────

  async createMessage(params: {
    system: string;
    messages: MessageParam[];
    tools?: Tool[];
    max_tokens?: number;
    tool_choice?: { type: string };
  }): Promise<ModelResponse> {
    const token = await this.getAccessToken();

    // Convert our format to OpenAI-compatible format
    const openAIMessages = this.toOpenAIMessages(params.system, params.messages);
    const openAITools = params.tools?.map(t => this.toOpenAITool(t));

    const requestBody: any = {
      model: this.modelName,
      messages: openAIMessages,
      max_tokens: params.max_tokens || 4096,
    };

    if (openAITools?.length) {
      requestBody.tools = openAITools;
    }

    if (params.tool_choice) {
      requestBody.tool_choice = params.tool_choice.type === 'any' ? 'required' : params.tool_choice.type;
    }

    const response = await fetch(this.completionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Model API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return this.fromOpenAIResponse(data);
  }

  // ── Format Converters ─────────────────────────────────────────

  private toOpenAIMessages(system: string, messages: MessageParam[]): any[] {
    const result: any[] = [{ role: 'system', content: system }];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Handle content blocks (assistant responses with tool_use, or user tool_results)
        const firstItem = msg.content[0];
        if (firstItem && 'type' in firstItem) {
          if ((firstItem as any).type === 'tool_result') {
            // Tool results → individual tool messages
            for (const block of msg.content as ToolResultBlock[]) {
              result.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: block.content,
              });
            }
          } else {
            // Assistant content blocks (text + tool_use)
            const textParts = (msg.content as ContentBlock[])
              .filter((b): b is TextBlock => b.type === 'text')
              .map(b => b.text)
              .join('');

            const toolCalls = (msg.content as ContentBlock[])
              .filter((b): b is ToolUseBlock => b.type === 'tool_use')
              .map(b => ({
                id: b.id,
                type: 'function' as const,
                function: { name: b.name, arguments: JSON.stringify(b.input) },
              }));

            const assistantMsg: any = { role: 'assistant' };
            if (textParts) assistantMsg.content = textParts;
            if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
            result.push(assistantMsg);
          }
        }
      }
    }

    return result;
  }

  private toOpenAITool(tool: Tool): any {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    };
  }

  private fromOpenAIResponse(data: any): ModelResponse {
    const choice = data.choices?.[0];
    const message = choice?.message;
    const content: ContentBlock[] = [];

    // Extract text content
    if (message?.content) {
      content.push({ type: 'text', text: message.content });
    }

    // Extract tool calls
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
    }

    return {
      content,
      model: data.model || this.modelName,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
      stop_reason: choice?.finish_reason,
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────

export function createAIClient(overrides?: {
  baseUrl?: string;
  completionsUrl?: string;
  apiKey?: string;
}): AIClient | null {
  const baseUrl = overrides?.baseUrl || process.env.AI_PLATFORM_BASE_URL;
  if (!baseUrl) return null;

  return new AIClient({
    baseUrl,
    completionsUrl: overrides?.completionsUrl || process.env.AI_PLATFORM_COMPLETIONS_URL,
    modelName: process.env.AI_PLATFORM_DEFAULT_MODEL || 'default',
    tokenUrl: process.env.AI_PLATFORM_TOKEN_URL,
    clientId: process.env.AI_PLATFORM_CLIENT_ID,
    clientSecret: process.env.AI_PLATFORM_CLIENT_SECRET,
    scope: process.env.AI_PLATFORM_SCOPE || 'api',
    apiKey: overrides?.apiKey || process.env.AI_PLATFORM_API_KEY,
  });
}
