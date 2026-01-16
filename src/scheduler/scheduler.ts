import cron from 'node-cron';
import { scrapeTopKeywords } from './tasks';

// Type for scheduled task
type ScheduledTask = ReturnType<typeof cron.schedule>;

let schedulerTask: ScheduledTask | null = null;

/**
 * Initialize the scheduler
 * Runs scraping every 4 hours based on TOP 50 popular keywords
 * Keywords are automatically collected from user searches (POST /api/scrape)
 */
export async function initializeScheduler(): Promise<void> {
  console.log('[Scheduler] Initializing scheduler...');

  // Schedule recurring scraping: every 4 hours (0 */4 * * *)
  // This means at minute 0 of every 4th hour (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
  const cronExpression = '0 */4 * * *';
  const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '4');

  schedulerTask = cron.schedule(cronExpression, async () => {
    console.log(`[Scheduler] ⏰ Starting scheduled TOP 50 keywords scrape (every ${intervalHours} hours)...`);
    try {
      await scrapeTopKeywords();
    } catch (error) {
      console.error('[Scheduler] Scheduled scrape failed:', error);
    }
  });

  console.log(`[Scheduler] ✅ Scheduler initialized (interval: every ${intervalHours} hours)`);
  console.log('[Scheduler] Keywords will be automatically collected from user searches');
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('[Scheduler] ✅ Scheduler stopped');
  }
}

/**
 * Get current scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
} {
  return {
    isRunning: schedulerTask !== null,
  };
}
