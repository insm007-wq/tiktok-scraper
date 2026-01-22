import express, { Router, Request, Response } from 'express';
import { deleteCacheWithR2, deleteExpiredCacheWithR2, cleanupStaleCache } from '../db/cache';

const router: Router = express.Router();

/**
 * POST /api/cache/delete
 * Delete specific cache or all expired/stale caches
 *
 * Body:
 * {
 *   "action": "single" | "expired" | "stale",
 *   "platform": "tiktok" (required for "single"),
 *   "query": "keyword" (required for "single"),
 *   "dateRange": "all" (optional, default: "all"),
 *   "daysInactive": 30 (optional, for "stale", default: 30)
 * }
 */
router.post('/delete', async (req: Request, res: Response) => {
  const { action, platform, query, dateRange, daysInactive } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Action is required' });
  }

  try {
    let result: any;

    switch (action) {
      case 'single':
        if (!platform || !query) {
          return res.status(400).json({ error: 'Platform and query are required for single delete' });
        }
        result = await deleteCacheWithR2(platform, query, dateRange || 'all');
        break;

      case 'expired':
        result = await deleteExpiredCacheWithR2();
        break;

      case 'stale':
        result = await cleanupStaleCache(daysInactive || 30);
        break;

      default:
        return res.status(400).json({ error: 'Invalid action. Must be "single", "expired", or "stale"' });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[CacheDelete] Error:', error);
    res.status(500).json({ error: 'Delete failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
