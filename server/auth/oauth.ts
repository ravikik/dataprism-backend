/**
 * Databricks OAuth 2.0 Service
 * 
 * Implements OAuth 2.0 Authorization Code Flow for Databricks authentication.
 * Tokens are stored in user sessions and automatically refreshed.
 */

export interface DatabricksOAuthConfig {
  clientId: string;
  clientSecret: string;
  host: string;
  redirectUri: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at: number;
}

export interface UserInfo {
  user_name: string;
  display_name?: string;
  emails?: { value: string; primary?: boolean }[];
  active: boolean;
}

/**
 * Generate OAuth authorization URL for user to login
 */
export function getAuthorizationUrl(config: DatabricksOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
    scope: 'all-apis', // Request all API scopes
  });

  return `${config.host}/oidc/v1/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access tokens
 */
export async function exchangeCodeForTokens(
  config: DatabricksOAuthConfig,
  code: string,
): Promise<OAuthTokens> {
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(`${config.host}/oidc/v1/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens = await response.json();
  
  // Calculate absolute expiration time
  return {
    ...tokens,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  };
}

/**
 * Refresh expired access token using refresh token
 */
export async function refreshAccessToken(
  config: DatabricksOAuthConfig,
  refreshToken: string,
): Promise<OAuthTokens> {
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(`${config.host}/oidc/v1/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokens = await response.json();
  
  return {
    ...tokens,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  };
}

/**
 * Get user information using access token
 */
export async function getUserInfo(config: DatabricksOAuthConfig, accessToken: string): Promise<UserInfo> {
  const response = await fetch(`${config.host}/api/2.0/preview/scim/v2/Me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch user info: ${error}`);
  }

  return await response.json();
}

/**
 * Check if token is expired or expiring soon (within 5 minutes)
 */
export function isTokenExpired(tokens: OAuthTokens): boolean {
  const fiveMinutes = 5 * 60 * 1000;
  return tokens.expires_at - Date.now() < fiveMinutes;
}

/**
 * Ensure token is valid, refresh if needed
 */
export async function ensureValidToken(
  config: DatabricksOAuthConfig,
  tokens: OAuthTokens,
): Promise<OAuthTokens> {
  if (isTokenExpired(tokens)) {
    console.log('[OAuth] Token expiring soon, refreshing...');
    return await refreshAccessToken(config, tokens.refresh_token);
  }
  return tokens;
}
