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
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  console.log(`\n[Scraper] 📍 ${timestamp} - Scraping: "${keyword}"\n`);

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
            `[Scraper]   ✅ TikTok    : ${String(result.length).padStart(3)} videos`
          );
          return result;
        })
        .catch(error => {
          console.error(`[Scraper]   ❌ TikTok error:`, error.message);
          return [];
        }),

      searchDouyinVideosParallel(keyword, 60, apiKey)
        .then(result => {
          results.douyin = result;
          console.log(
            `[Scraper]   ✅ Douyin    : ${String(result.length).padStart(3)} videos`
          );
          return result;
        })
        .catch(error => {
          console.error(`[Scraper]   ❌ Douyin error:`, error.message);
          return [];
        }),

      searchXiaohongshuVideosParallel(keyword, 75, apiKey)
        .then(result => {
          results.xiaohongshu = result;
          console.log(
            `[Scraper]   ✅ Xiaohongshu: ${String(result.length).padStart(3)} videos`
          );
          return result;
        })
        .catch(error => {
          console.error(`[Scraper]   ❌ Xiaohongshu error:`, error.message);
          return [];
        }),
    ]);

    // Save results to database
    await Promise.all([
      saveCache('tiktok', keyword, results.tiktok),
      saveCache('douyin', keyword, results.douyin),
      saveCache('xiaohongshu', keyword, results.xiaohongshu),
    ]);

    const duration = Date.now() - startTime;
    console.log(`\n[Scraper] ✨ Completed: "${keyword}" in ${(duration / 1000).toFixed(2)}s`);
    console.log(`[Scraper]   📊 Total: ${results.tiktok.length + results.douyin.length + results.xiaohongshu.length} videos`);
    console.log(`[Scraper]   • TikTok: ${results.tiktok.length} | Douyin: ${results.douyin.length} | Xiaohongshu: ${results.xiaohongshu.length}\n`);

    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n[Scraper] ❌ Error scraping "${keyword}" after ${(duration / 1000).toFixed(2)}s`);
    console.error(error);
    throw error;
  }
}

/**
 * Scrape TOP 50 keywords from cache
 * This is the main scheduler task - runs every 6 hours
 * Automatically picks up keywords from user searches
 */
export async function scrapeTopKeywords(): Promise<void> {
  const startTime = Date.now();

  try {
    // Get TOP 50 keywords from video_cache (by accessCount)
    const topKeywords = await getTopKeywordsFromCache(50);

    if (topKeywords.length === 0) {
      console.log('[Scheduler] ⚠️  No keywords found in cache yet');
      return;
    }

    console.log(`\n[Scheduler] 📋 Found ${topKeywords.length} keywords to scrape:`);
    console.log(`[Scheduler] ${topKeywords.map(k => `"${k.keyword}"`).join(', ')}\n`);

    // Scrape each keyword
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < topKeywords.length; i++) {
      const item = topKeywords[i];
      process.stdout.write(`[Scheduler] Progress: [${String(i + 1).padStart(2)}/${topKeywords.length}] `);
      try {
        await scrapeKeywordForAllPlatforms(item.keyword);
        successCount++;
      } catch (error) {
        console.error(`\n[Scheduler] ❌ Failed to scrape "${item.keyword}":`, error);
        failureCount++;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Scheduler] ✅ TOP 50 scraping run completed`);
    console.log(`[Scheduler]   ⏱️  Duration: ${duration}s`);
    console.log(`[Scheduler]   📊 Success: ${successCount} | Failed: ${failureCount}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n[Scheduler] ❌ Error in TOP 50 scraping after ${duration}s:`, error);
  }
}
