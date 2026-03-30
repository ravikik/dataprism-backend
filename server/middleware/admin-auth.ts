import { Request, Response, NextFunction } from 'express';

/**
 * Simple admin authentication middleware
 * In development, allows access. In production, requires admin token.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const IS_DEV = process.env.NODE_ENV !== 'production';

  // In development, allow all access
  if (IS_DEV) {
    return next();
  }

  // In production, require admin token
  if (!ADMIN_TOKEN) {
    return res.status(500).json({ 
      error: 'Admin authentication not configured. Set ADMIN_TOKEN environment variable.' 
    });
  }

  // Check for token in header or query param
  const token = req.headers['x-admin-token'] || req.query.token;

  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ 
      error: 'Unauthorized. Valid admin token required.' 
    });
  }

  next();
}

/**
 * Check if user has admin access
 */
export function hasAdminAccess(req: Request): boolean {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const IS_DEV = process.env.NODE_ENV !== 'production';

  if (IS_DEV) return true;
  if (!ADMIN_TOKEN) return false;

  const token = req.headers['x-admin-token'] || req.query.token;
  return token === ADMIN_TOKEN;
}
