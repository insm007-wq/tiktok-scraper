import { Router, Request, Response } from 'express';
import {
  getVideosByPlatform,
  getCacheStats,
  getCache,
  getAllCacheByPlatform,
  getTopKeywordsFromCache,
} from '../db/cache';

const router = Router();

/**
 * GET /api/videos
 * Get videos by platform with pagination
 * Query params: platform, limit, skip
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { platform, limit, skip } = req.query;

    if (!platform || typeof platform !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'platform parameter is required',
      });
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 20;
    const skipNum = skip ? parseInt(skip as string, 10) : 0;

    if (isNaN(limitNum) || isNaN(skipNum) || limitNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'limit and skip must be valid numbers',
      });
    }

    const videos = await getVideosByPlatform(platform, limitNum, skipNum);

    return res.json({
      success: true,
      platform,
      videos,
      count: videos.length,
      limit: limitNum,
      skip: skipNum,
    });
  } catch (error) {
    console.error('[Videos API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/videos/cache
 * Get specific cache by platform and query
 * Query params: platform, query
 */
router.get('/cache', async (req: Request, res: Response) => {
  try {
    const { platform, query } = req.query;

    if (!platform || typeof platform !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'platform parameter is required',
      });
    }

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'query parameter is required',
      });
    }

    const cache = await getCache(platform, query);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `No cache found for platform "${platform}" and query "${query}"`,
      });
    }

    return res.json({
      success: true,
      cache,
    });
  } catch (error) {
    console.error('[Videos API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/videos/stats
 * Get statistics about cached data
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getCacheStats();

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Videos API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/videos/platform/:platform
 * Get all cache documents for a specific platform
 * Query params: limit, skip
 */
router.get('/platform/:platform', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { limit, skip } = req.query;

    const limitNum = limit ? parseInt(limit as string, 10) : 100;
    const skipNum = skip ? parseInt(skip as string, 10) : 0;

    if (isNaN(limitNum) || isNaN(skipNum) || limitNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'limit and skip must be valid numbers',
      });
    }

    const caches = await getAllCacheByPlatform(platform, limitNum, skipNum);

    return res.json({
      success: true,
      platform,
      caches,
      count: caches.length,
      limit: limitNum,
      skip: skipNum,
    });
  } catch (error) {
    console.error('[Videos API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/videos/keywords/top
 * Get top N keywords by accessCount (조회 횟수)
 * Query params: limit (default: 50)
 */
router.get('/keywords/top', async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;

    if (isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'limit must be a positive number',
      });
    }

    const keywordStats = await getTopKeywordsFromCache(limitNum);

    return res.json({
      success: true,
      keywords: keywordStats,
      count: keywordStats.length,
      limit: limitNum,
    });
  } catch (error) {
    console.error('[Videos API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});


export default router;
