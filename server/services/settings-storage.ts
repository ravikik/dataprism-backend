import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Settings file path (stored in backend root)
const SETTINGS_FILE = path.join(__dirname, '..', '..', '.dataprism-settings.json');

export interface Settings {
  aiPlatformBaseUrl?: string;
  aiPlatformCompletionsUrl?: string;
  aiPlatformUploadUrl?: string;
  aiPlatformSseUrl?: string;
  aiPlatformDefaultModel?: string;
  aiPlatformApiKey?: string;
  aiPlatformTokenUrl?: string;
  aiPlatformClientId?: string;
  aiPlatformClientSecret?: string;
  aiPlatformScope?: string;
  databricks?: {
    host?: string;
    token?: string;
    warehouseId?: string;
  };
  aws?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
  };
  oauth?: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  };
  server?: {
    port?: number;
    sessionSecret?: string;
    frontendUrl?: string;
  };
  cache?: {
    redisHost?: string;
    redisPort?: number;
    redisPassword?: string;
  };
  vectorDb?: {
    type?: 'pgvector' | 'pinecone' | 'qdrant';
    postgresHost?: string;
    postgresPort?: number;
    postgresUser?: string;
    postgresPassword?: string;
    postgresDatabase?: string;
    postgresSSL?: boolean;
    pineconeApiKey?: string;
    pineconeEnvironment?: string;
    pineconeIndex?: string;
  };
}

/**
 * Load settings from JSON file
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty settings
      return {};
    }
    throw error;
  }
}

/**
 * Save settings to JSON file
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Update specific settings (merge with existing)
 */
export async function updateSettings(partialSettings: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const updated = {
    ...current,
    ...partialSettings,
    // Deep merge for nested objects
    databricks: { ...current.databricks, ...partialSettings.databricks },
    aws: { ...current.aws, ...partialSettings.aws },
    oauth: { ...current.oauth, ...partialSettings.oauth },
    server: { ...current.server, ...partialSettings.server },
    cache: { ...current.cache, ...partialSettings.cache },
    vectorDb: { ...current.vectorDb, ...partialSettings.vectorDb },
  };
  await saveSettings(updated);
  return updated;
}

/**
 * Get settings with environment variable fallback
 */
export function getEffectiveSettings(): Settings {
  // In production, prioritize environment variables
  return {
    aiPlatformBaseUrl: process.env.AI_PLATFORM_BASE_URL,
    aiPlatformCompletionsUrl: process.env.AI_PLATFORM_COMPLETIONS_URL,
    aiPlatformUploadUrl: process.env.AI_PLATFORM_UPLOAD_URL,
    aiPlatformSseUrl: process.env.AI_PLATFORM_SSE_URL,
    aiPlatformDefaultModel: process.env.AI_PLATFORM_DEFAULT_MODEL,
    aiPlatformApiKey: process.env.AI_PLATFORM_API_KEY,
    aiPlatformTokenUrl: process.env.AI_PLATFORM_TOKEN_URL,
    aiPlatformClientId: process.env.AI_PLATFORM_CLIENT_ID,
    aiPlatformClientSecret: process.env.AI_PLATFORM_CLIENT_SECRET,
    aiPlatformScope: process.env.AI_PLATFORM_SCOPE,
    databricks: {
      host: process.env.DATABRICKS_HOST,
      token: process.env.DATABRICKS_TOKEN,
      warehouseId: process.env.DATABRICKS_WAREHOUSE_ID,
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
    },
    oauth: {
      clientId: process.env.DATABRICKS_OAUTH_CLIENT_ID,
      clientSecret: process.env.DATABRICKS_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.DATABRICKS_OAUTH_REDIRECT_URI,
    },
    server: {
      port: parseInt(process.env.PORT || '3001', 10),
      sessionSecret: process.env.SESSION_SECRET,
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    },
    cache: {
      redisHost: process.env.REDIS_HOST,
      redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
      redisPassword: process.env.REDIS_PASSWORD,
    },
    vectorDb: {
      type: (process.env.VECTOR_DB_TYPE as any) || 'pgvector',
      postgresHost: process.env.POSTGRES_HOST,
      postgresPort: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      postgresUser: process.env.POSTGRES_USER,
      postgresPassword: process.env.POSTGRES_PASSWORD,
      postgresDatabase: process.env.POSTGRES_DATABASE,
      postgresSSL: process.env.POSTGRES_SSL === 'true',
      pineconeApiKey: process.env.PINECONE_API_KEY,
      pineconeEnvironment: process.env.PINECONE_ENVIRONMENT,
      pineconeIndex: process.env.PINECONE_INDEX,
    },
  };
}

/**
 * Mask sensitive values for display
 */
export function maskSensitiveSettings(settings: Settings): Settings {
  const mask = (value?: string) => value ? '••••••••' + value.slice(-4) : undefined;
  
  return {
    ...settings,
    aiPlatformBaseUrl: settings.aiPlatformBaseUrl,
    aiPlatformCompletionsUrl: settings.aiPlatformCompletionsUrl,
    aiPlatformUploadUrl: settings.aiPlatformUploadUrl,
    aiPlatformSseUrl: settings.aiPlatformSseUrl,
    aiPlatformDefaultModel: settings.aiPlatformDefaultModel,
    aiPlatformApiKey: mask(settings.aiPlatformApiKey),
    aiPlatformTokenUrl: settings.aiPlatformTokenUrl,
    aiPlatformClientId: settings.aiPlatformClientId,
    aiPlatformClientSecret: mask(settings.aiPlatformClientSecret),
    aiPlatformScope: settings.aiPlatformScope,
    databricks: settings.databricks ? {
      ...settings.databricks,
      token: mask(settings.databricks.token),
    } : undefined,
    aws: settings.aws ? {
      ...settings.aws,
      accessKeyId: mask(settings.aws.accessKeyId),
      secretAccessKey: mask(settings.aws.secretAccessKey),
    } : undefined,
    oauth: settings.oauth ? {
      ...settings.oauth,
      clientSecret: mask(settings.oauth.clientSecret),
    } : undefined,
    server: settings.server ? {
      ...settings.server,
      sessionSecret: mask(settings.server.sessionSecret),
    } : undefined,
    cache: settings.cache ? {
      ...settings.cache,
      redisPassword: mask(settings.cache.redisPassword),
    } : undefined,
    vectorDb: settings.vectorDb ? {
      ...settings.vectorDb,
      postgresPassword: mask(settings.vectorDb.postgresPassword),
      pineconeApiKey: mask(settings.vectorDb.pineconeApiKey),
    } : undefined,
  };
}
