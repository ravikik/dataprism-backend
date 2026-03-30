import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import type { Session } from 'express-session';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo,
  type DatabricksOAuthConfig,
} from '../auth/oauth.js';
import type { OAuthTokens, UserInfo } from '../auth/oauth.js';

// Extend Express Request interface
declare module 'express-serve-static-core' {
  interface Request {
    session: Session & {
      oauthTokens?: OAuthTokens;
      userInfo?: UserInfo;
      oauthState?: string;
    };
  }
}

export function createAuthRouter(): Router {
  const router = Router();

  // OAuth configuration from environment variables
  const oauthConfig: DatabricksOAuthConfig | null = (() => {
    const clientId = process.env.DATABRICKS_OAUTH_CLIENT_ID;
    const clientSecret = process.env.DATABRICKS_OAUTH_CLIENT_SECRET;
    const host = process.env.DATABRICKS_HOST;
    const redirectUri = process.env.DATABRICKS_OAUTH_REDIRECT_URI || 'http://localhost:5173/auth/callback';

    if (!clientId || !clientSecret || !host) {
      console.warn('[Auth] OAuth not configured - missing environment variables');
      return null;
    }

    return { clientId, clientSecret, host, redirectUri };
  })();

  // ── GET /api/auth/status ────────────────────────────────────────
  // Check if user is authenticated
  router.get('/status', (req: Request, res: Response) => {
    if (req.session.oauthTokens && req.session.userInfo) {
      res.json({
        authenticated: true,
        user: {
          username: req.session.userInfo.user_name,
          displayName: req.session.userInfo.display_name,
          email: req.session.userInfo.emails?.[0]?.value,
        },
        authMethod: 'oauth',
      });
    } else {
      // Check for legacy PAT in headers
      const hasLegacyPAT = !!(req.headers['x-databricks-token'] as string);
      res.json({
        authenticated: hasLegacyPAT,
        authMethod: hasLegacyPAT ? 'pat' : 'none',
      });
    }
  });

  // ── GET /api/auth/config ────────────────────────────────────────
  // Return OAuth configuration availability
  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      oauthEnabled: !!oauthConfig,
      oauthHost: oauthConfig?.host,
    });
  });

  // ── GET /api/auth/login ─────────────────────────────────────────
  // Initiate OAuth login flow
  router.get('/login', (req: Request, res: Response) => {
    if (!oauthConfig) {
      res.status(501).json({ error: 'OAuth not configured' });
      return;
    }

    // Generate random state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;

    const authUrl = getAuthorizationUrl(oauthConfig, state);
    res.json({ authUrl });
  });

  // ── GET /api/auth/callback ──────────────────────────────────────
  // Handle OAuth callback from Databricks
  router.get('/callback', async (req: Request, res: Response) => {
    if (!oauthConfig) {
      res.status(501).json({ error: 'OAuth not configured' });
      return;
    }

    const { code, state, error } = req.query;

    // Check for OAuth errors
    if (error) {
      console.error('[Auth] OAuth error:', error);
      res.status(400).json({ error: `OAuth error: ${error}` });
      return;
    }

    // Validate state for CSRF protection
    if (!state || state !== req.session.oauthState) {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    // Clear state after validation
    delete req.session.oauthState;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(oauthConfig, code);
      
      // Get user information
      const userInfo = await getUserInfo(oauthConfig, tokens.access_token);

      // Store in session
      req.session.oauthTokens = tokens;
      req.session.userInfo = userInfo;

      console.log(`[Auth] User logged in: ${userInfo.user_name}`);

      res.json({
        success: true,
        user: {
          username: userInfo.user_name,
          displayName: userInfo.display_name,
          email: userInfo.emails?.[0]?.value,
        },
      });
    } catch (err: any) {
      console.error('[Auth] Token exchange failed:', err.message);
      res.status(500).json({ error: 'Authentication failed', details: err.message });
    }
  });

  // ── POST /api/auth/logout ───────────────────────────────────────
  // Logout user and clear session
  router.post('/logout', (req: Request, res: Response) => {
    const username = req.session.userInfo?.user_name;
    
    req.session.destroy((err: any) => {
      if (err) {
        console.error('[Auth] Session destruction error:', err);
        res.status(500).json({ error: 'Logout failed' });
        return;
      }
      
      if (username) {
        console.log(`[Auth] User logged out: ${username}`);
      }
      
      res.json({ success: true });
    });
  });

  return router;
}
