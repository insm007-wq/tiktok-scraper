import { Request, Response, NextFunction } from 'express';

/**
 * API Key Authentication Middleware
 *
 * Validates the X-API-Key header against RAILWAY_API_SECRET
 * All requests to protected routes must include this header
 */
export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const expectedKey = process.env.RAILWAY_API_SECRET;

  if (!expectedKey) {
    console.error('[Auth] ❌ RAILWAY_API_SECRET not configured');
    res.status(500).json({
      success: false,
      error: 'Server configuration error',
      videos: [],
      count: 0,
      duration: 0,
    });
    return;
  }

  if (!apiKey || apiKey !== expectedKey) {
    console.warn('[Auth] ❌ Invalid or missing API key from', req.ip);
    res.status(401).json({
      success: false,
      error: 'Invalid or missing API key',
      videos: [],
      count: 0,
      duration: 0,
    });
    return;
  }

  console.log('[Auth] ✅ API key validated');
  next();
}
