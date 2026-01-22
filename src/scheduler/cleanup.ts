import cron from 'node-cron';
import { deleteExpiredCacheWithR2, cleanupStaleCache } from '../db/cache';

/**
 * 매일 새벽 3시: 만료된 캐시 삭제
 */
cron.schedule('0 3 * * *', async () => {
  console.log('[Cleanup] Running expired cache cleanup at 03:00 KST...');
  try {
    const result = await deleteExpiredCacheWithR2();
    console.log(`[Cleanup] ✅ Completed: ${result.deletedCaches} caches, ${result.deletedFiles} files deleted`);
  } catch (error) {
    console.error('[Cleanup] ❌ Error during expired cache cleanup:', error);
  }
});

/**
 * 매주 일요일 4시: 30일 이상 미접근 캐시 삭제
 */
cron.schedule('0 4 * * 0', async () => {
  console.log('[Cleanup] Running stale cache cleanup at 04:00 KST...');
  try {
    const result = await cleanupStaleCache(30);
    console.log(`[Cleanup] ✅ Completed: ${result.deletedCaches} caches, ${result.deletedFiles} files deleted`);
  } catch (error) {
    console.error('[Cleanup] ❌ Error during stale cache cleanup:', error);
  }
});

console.log('[Cleanup] ✅ Cleanup schedulers initialized');
