import { searchTikTokVideos } from '../scrapers/tiktok';
import { searchDouyinVideosParallel } from '../scrapers/douyin';
import { searchXiaohongshuVideosParallel } from '../scrapers/xiaohongshu';
import { saveCache, getTopKeywordsFromCache } from '../db/cache';
import { VideoResult } from '../types/video';

const apiKey = process.env.APIFY_API_KEY!;

/**
 * Scrape a keyword for all three platforms
 */
export async function scrapeKeywordForAllPlatforms(keyword: string): Promise<{
  tiktok: VideoResult[];
  douyin: VideoResult[];
  xiaohongshu: VideoResult[];
}> {
  console.log(`[Scraper] Starting scrape for keyword: "${keyword}"`);

  const results = {
    tiktok: [] as VideoResult[],
    douyin: [] as VideoResult[],
    xiaohongshu: [] as VideoResult[],
  };

  try {
    // Scrape all platforms in parallel
    const [tikTokVideos, douyinVideos, xiaohongshuVideos] = await Promise.all([
      searchTikTokVideos(keyword, 60, apiKey)
        .then(result => {
          results.tiktok = result;
          console.log(
            `[Scraper] ✅ TikTok: ${result.length} videos for "${keyword}"`
          );
          return result;
        })
        .catch(error => {
          console.error(`[Scraper] ❌ TikTok error for "${keyword}":`, error.message);
          return [];
        }),

      searchDouyinVideosParallel(keyword, 60, apiKey)
        .then(result => {
          results.douyin = result;
          console.log(
            `[Scraper] ✅ Douyin: ${result.length} videos for "${keyword}"`
          );
          return result;
        })
        .catch(error => {
          console.error(`[Scraper] ❌ Douyin error for "${keyword}":`, error.message);
          return [];
        }),

      searchXiaohongshuVideosParallel(keyword, 75, apiKey)
        .then(result => {
          results.xiaohongshu = result;
          console.log(
            `[Scraper] ✅ Xiaohongshu: ${result.length} videos for "${keyword}"`
          );
          return result;
        })
        .catch(error => {
          console.error(`[Scraper] ❌ Xiaohongshu error for "${keyword}":`, error.message);
          return [];
        }),
    ]);

    // Save results to database
    await Promise.all([
      saveCache('tiktok', keyword, results.tiktok),
      saveCache('douyin', keyword, results.douyin),
      saveCache('xiaohongshu', keyword, results.xiaohongshu),
    ]);

    console.log(
      `[Scraper] ✅ Completed scrape for "${keyword}" (TikTok: ${results.tiktok.length}, Douyin: ${results.douyin.length}, Xiaohongshu: ${results.xiaohongshu.length})`
    );

    return results;
  } catch (error) {
    console.error(`[Scraper] ❌ Error scraping "${keyword}":`, error);
    throw error;
  }
}

/**
 * Scrape TOP 50 keywords from cache
 * This is the main scheduler task - runs every 4 hours
 * Automatically picks up keywords from user searches
 */
export async function scrapeTopKeywords(): Promise<void> {
  console.log('[Scheduler] 🚀 Starting TOP 50 keywords scraping run');

  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;

  try {
    // Get TOP 50 keywords from video_cache (by accessCount)
    const topKeywords = await getTopKeywordsFromCache(50);

    if (topKeywords.length === 0) {
      console.log('[Scheduler] No keywords found in cache yet');
      return;
    }

    console.log(
      `[Scheduler] Found ${topKeywords.length} keywords to scrape`
    );

    // Scrape each keyword
    for (const item of topKeywords) {
      try {
        await scrapeKeywordForAllPlatforms(item.keyword);
        successCount++;
      } catch (error) {
        console.error(`[Scheduler] Failed to scrape "${item.keyword}":`, error);
        failureCount++;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[Scheduler] ✅ TOP 50 scraping run completed in ${duration}s (${successCount} succeeded, ${failureCount} failed)`
    );
  } catch (error) {
    console.error('[Scheduler] ❌ Error in TOP 50 scraping:', error);
  }
}
