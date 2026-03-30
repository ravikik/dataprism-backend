/**
 * Session type declarations for Express Session
 */

import type { OAuthTokens, UserInfo } from './oauth.js';

declare module 'express-session' {
  interface SessionData {
    oauthTokens?: OAuthTokens;
    userInfo?: UserInfo;
    oauthState?: string;
  }
}

export {};
