import { Router, Request, Response } from 'express';
import { authenticateApiKey } from '../middleware/auth';
import { searchTikTokVideos } from '../scrapers/tiktok';
import { searchDouyinVideosParallel } from '../scrapers/douyin';
import { searchXiaohongshuVideosParallel } from '../scrapers/xiaohongshu';
import { VideoResult, Platform } from '../types/video';

const router = Router();

interface ScrapeRequest {
  query: string;
  platform: Platform;
  limit: number;
  dateRange?: string;
}

interface ScrapeResponse {
  success: boolean;
  query?: string;
  platform?: Platform;
  videos: VideoResult[];
  count: number;
  duration: number;
  error?: string;
}

/**
 * POST /api/scrape
 *
 * Long-running scraping endpoint (up to 10 minutes)
 * Protected by API key authentication
 *
 * Request body:
 * {
 *   "query": "makeup",
 *   "platform": "tiktok",
 *   "limit": 50,
 *   "dateRange": "last7days" (optional)
 * }
 */
router.post('/scrape', authenticateApiKey, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const { query, platform, limit, dateRange }: ScrapeRequest = req.body;

    // Input validation
    if (!query || !query.trim()) {
      res.status(400).json({
        success: false,
        videos: [],
        count: 0,
        duration: 0,
        error: 'Query is required',
      } as ScrapeResponse);
      return;
    }

    if (!['tiktok', 'douyin', 'xiaohongshu'].includes(platform)) {
      res.status(400).json({
        success: false,
        videos: [],
        count: 0,
        duration: 0,
        error: 'Invalid platform. Must be: tiktok, douyin, or xiaohongshu',
      } as ScrapeResponse);
      return;
    }

    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        success: false,
        videos: [],
        count: 0,
        duration: 0,
        error: 'APIFY_API_KEY not configured',
      } as ScrapeResponse);
      return;
    }

    console.log(`[Scrape] Starting: ${platform} - "${query}" (limit: ${limit})`);

    // Execute scraping based on platform
    let videos: VideoResult[] = [];

    switch (platform) {
      case 'tiktok':
        videos = await searchTikTokVideos(query, limit, apiKey, dateRange);
        break;
      case 'douyin':
        videos = await searchDouyinVideosParallel(query, limit, apiKey, dateRange);
        break;
      case 'xiaohongshu':
        videos = await searchXiaohongshuVideosParallel(query, limit, apiKey, dateRange);
        break;
    }

    const duration = Date.now() - startTime;

    console.log(`[Scrape] ✅ Completed: ${videos.length} videos in ${(duration / 1000).toFixed(2)}s`);

    res.json({
      success: true,
      query,
      platform,
      videos,
      count: videos.length,
      duration,
    } as ScrapeResponse);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Scrape] ❌ Error:', error);

    res.status(500).json({
      success: false,
      videos: [],
      count: 0,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    } as ScrapeResponse);
  }
});

export default router;
