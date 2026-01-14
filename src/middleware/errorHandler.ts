import { Request, Response, NextFunction } from 'express';

/**
 * Global Error Handler Middleware
 *
 * Catches all unhandled errors and returns a consistent JSON response
 * Must be registered last in the middleware chain
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[Error Handler] Unhandled error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    videos: [],
    count: 0,
    duration: 0,
  });
}
