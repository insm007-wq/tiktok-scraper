import cron from 'node-cron';
import { scrapeTopKeywords } from './tasks';

// Type for scheduled task
type ScheduledTask = ReturnType<typeof cron.schedule>;

let schedulerTask: ScheduledTask | null = null;

/**
 * Initialize the scheduler
 * Runs scraping every 6 hours based on TOP 50 popular keywords
 * Keywords are automatically collected from user searches (POST /api/scrape)
 */
export async function initializeScheduler(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`\n[Scheduler] ⏱️  ${timestamp} - Initializing scheduler...\n`);

  // Schedule recurring scraping: every 12 hours (0 */12 * * *)
  // This means at minute 0 of every 12th hour (00:00, 12:00)
  const cronExpression = '0 */12 * * *';
  const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '12');

  schedulerTask = cron.schedule(cronExpression, async () => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Scheduler] 🚀 ${timestamp}`);
    console.log(`[Scheduler] Starting scheduled TOP 50 keywords scrape`);
    console.log(`[Scheduler] Interval: Every ${intervalHours} hours`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    try {
      await scrapeTopKeywords();
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`\n[Scheduler] ❌ Scheduled scrape failed after ${(duration / 1000).toFixed(2)}s`);
      console.error(error);
    }
  });

  console.log(`[Scheduler] ✅ Scheduler initialized`);
  console.log(`[Scheduler] 📅 Schedule: Every ${intervalHours} hours`);
  console.log(`[Scheduler] 🏷️  Keywords: Automatically collected from user searches`);
  console.log(`[Scheduler] ⏰ Next scheduled run: ${getNextScheduledTime(intervalHours)}\n`);
}

/**
 * Get next scheduled run time
 */
function getNextScheduledTime(intervalHours: number): string {
  const now = new Date();
  const nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
  nextRun.setMinutes(0);
  nextRun.setSeconds(0);
  return nextRun.toISOString();
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    const timestamp = new Date().toISOString();
    console.log(`\n[Scheduler] ⏹️  ${timestamp} - Scheduler stopped\n`);
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
