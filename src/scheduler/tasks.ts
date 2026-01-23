import { searchTikTokVideos } from '../scrapers/tiktok';
import { searchDouyinVideosParallel } from '../scrapers/douyin';
import { saveCache, getTopKeywordsFromCache } from '../db/cache';
import { VideoResult } from '../types/video';

const apiKey = process.env.APIFY_API_KEY!;

/**
 * Scrape a keyword for TikTok and Douyin (Xiaohongshu disabled for cost savings)
 */
export async function scrapeKeywordForAllPlatforms(keyword: string): Promise<{
  tiktok: VideoResult[];
  douyin: VideoResult[];
}> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  console.log(`\n[Scraper] 📍 ${timestamp} - Scraping: "${keyword}"\n`);

  const results = {
    tiktok: [] as VideoResult[],
    douyin: [] as VideoResult[],
  };

  try {
    // Scrape TikTok and Douyin in parallel (Xiaohongshu disabled for cost savings)
    const [tikTokVideos, douyinVideos] = await Promise.all([
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
    ]);

    // Calculate thumbnail stats before saving
    const getThumbnailStats = (videos: VideoResult[]) => {
      const withThumbnail = videos.filter(v => v.thumbnail).length;
      return { withThumbnail, total: videos.length };
    };

    const tiktokStats = getThumbnailStats(results.tiktok);
    const douyinStats = getThumbnailStats(results.douyin);

    // Save results to database (Xiaohongshu disabled for cost savings)
    await Promise.all([
      saveCache('tiktok', keyword, results.tiktok),
      saveCache('douyin', keyword, results.douyin),
    ]);

    const duration = Date.now() - startTime;
    console.log(`\n[Scraper] ✨ Completed: "${keyword}" in ${(duration / 1000).toFixed(2)}s`);
    console.log(`[Scraper]   📊 Total: ${results.tiktok.length + results.douyin.length} videos`);
    console.log(`[Scraper]   • TikTok: ${results.tiktok.length} (🎬 ${tiktokStats.withThumbnail}/${tiktokStats.total}) | Douyin: ${results.douyin.length} (🎬 ${douyinStats.withThumbnail}/${douyinStats.total})\n`);

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

    // Scrape each keyword and collect statistics
    let successCount = 0;
    let failureCount = 0;

    // Phase 4: Track cumulative thumbnail statistics
    const thumbnailStats = {
      tiktok: { total: 0, withThumbnail: 0 },
      douyin: { total: 0, withThumbnail: 0 },
    };

    for (let i = 0; i < keywords.length; i++) {
      const item = keywords[i];
      process.stdout.write(`[Scheduler] Progress: [${String(i + 1).padStart(3)}/${keywords.length}] `);
      try {
        const result = await scrapeKeywordForAllPlatforms(item.keyword);
        successCount++;

        // Collect thumbnail statistics
        const getThumbnailStats = (videos: VideoResult[]) => {
          return videos.filter(v => v.thumbnail).length;
        };

        thumbnailStats.tiktok.total += result.tiktok.length;
        thumbnailStats.tiktok.withThumbnail += getThumbnailStats(result.tiktok);
        thumbnailStats.douyin.total += result.douyin.length;
        thumbnailStats.douyin.withThumbnail += getThumbnailStats(result.douyin);
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

    // Phase 4: Display aggregated thumbnail quality report
    const calcPercentage = (withThumbnail: number, total: number) => {
      return total > 0 ? ((withThumbnail / total) * 100).toFixed(1) : '0.0';
    };

    console.log(`\n[Scheduler] 📊 Thumbnail Quality Report:`);
    console.log(
      `[Scheduler]   🎬 TikTok:      ${thumbnailStats.tiktok.withThumbnail}/${thumbnailStats.tiktok.total} ` +
      `(${calcPercentage(thumbnailStats.tiktok.withThumbnail, thumbnailStats.tiktok.total)}%)`
    );
    console.log(
      `[Scheduler]   🎬 Douyin:      ${thumbnailStats.douyin.withThumbnail}/${thumbnailStats.douyin.total} ` +
      `(${calcPercentage(thumbnailStats.douyin.withThumbnail, thumbnailStats.douyin.total)}%)`
    );

    const totalVideos = thumbnailStats.tiktok.total + thumbnailStats.douyin.total;
    const totalWithThumbnail = thumbnailStats.tiktok.withThumbnail + thumbnailStats.douyin.withThumbnail;
    console.log(
      `[Scheduler]   📈 Overall:    ${totalWithThumbnail}/${totalVideos} ` +
      `(${calcPercentage(totalWithThumbnail, totalVideos)}%)`
    );
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n[Scheduler] ❌ Error in keyword scraping after ${duration}s:`, error);
  }
}
