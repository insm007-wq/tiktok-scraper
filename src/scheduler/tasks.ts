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

    // Calculate thumbnail stats before saving
    const getThumbnailStats = (videos: VideoResult[]) => {
      const withThumbnail = videos.filter(v => v.thumbnail).length;
      return { withThumbnail, total: videos.length };
    };

    const tiktokStats = getThumbnailStats(results.tiktok);
    const douyinStats = getThumbnailStats(results.douyin);
    const xiaohongshuStats = getThumbnailStats(results.xiaohongshu);

    // Save results to database
    await Promise.all([
      saveCache('tiktok', keyword, results.tiktok),
      saveCache('douyin', keyword, results.douyin),
      saveCache('xiaohongshu', keyword, results.xiaohongshu),
    ]);

    const duration = Date.now() - startTime;
    console.log(`\n[Scraper] ✨ Completed: "${keyword}" in ${(duration / 1000).toFixed(2)}s`);
    console.log(`[Scraper]   📊 Total: ${results.tiktok.length + results.douyin.length + results.xiaohongshu.length} videos`);
    console.log(`[Scraper]   • TikTok: ${results.tiktok.length} (🎬 ${tiktokStats.withThumbnail}/${tiktokStats.total}) | Douyin: ${results.douyin.length} (🎬 ${douyinStats.withThumbnail}/${douyinStats.total}) | Xiaohongshu: ${results.xiaohongshu.length} (🎬 ${xiaohongshuStats.withThumbnail}/${xiaohongshuStats.total})\n`);

    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n[Scraper] ❌ Error scraping "${keyword}" after ${(duration / 1000).toFixed(2)}s`);
    console.error(error);
    throw error;
  }
}

/**
 * Scrape keywords from cache based on filters
 * This is the main scheduler task - runs every 24 hours
 * Automatically picks up keywords from user searches with:
 * - accessCount >= minAccessCount (default: 2)
 * - lastAccessed within recentDays (default: 7 days)
 * - Limited to maxCount (default: 100)
 */
export async function scrapeTopKeywords(): Promise<void> {
  const startTime = Date.now();

  try {
    // Get configuration from environment variables
    const minAccessCount = parseInt(process.env.MIN_KEYWORD_ACCESS_COUNT || '2');
    const maxCount = parseInt(process.env.MAX_KEYWORDS_TO_SCRAPE || '100');
    const recentDays = parseInt(process.env.RECENT_KEYWORD_DAYS || '7');

    const keywords = await getTopKeywordsFromCache(minAccessCount, maxCount, recentDays);

    if (keywords.length === 0) {
      console.log(
        `[Scheduler] ⚠️  No keywords found matching filters: ` +
        `accessCount >= ${minAccessCount}, lastAccessed within ${recentDays} days`
      );
      return;
    }

    console.log(
      `\n[Scheduler] 📋 Found ${keywords.length}/${maxCount} keywords to scrape ` +
      `(accessCount >= ${minAccessCount}, recent ${recentDays}d):`
    );
    console.log(`[Scheduler] ${keywords.map(k => `"${k.keyword}"(${k.accessCount})`).join(', ')}\n`);

    // Scrape each keyword
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < keywords.length; i++) {
      const item = keywords[i];
      process.stdout.write(`[Scheduler] Progress: [${String(i + 1).padStart(3)}/${keywords.length}] `);
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
    console.log(`[Scheduler] ✅ Keyword scraping run completed`);
    console.log(`[Scheduler]   📊 Total: ${keywords.length} | Success: ${successCount} | Failed: ${failureCount}`);
    console.log(`[Scheduler]   ⏱️  Duration: ${duration}s`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n[Scheduler] ❌ Error in keyword scraping after ${duration}s:`, error);
  }
}
