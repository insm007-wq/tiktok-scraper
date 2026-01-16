/**
 * Environment Variable Validation
 *
 * Validates all required environment variables on application startup
 * Fails fast if configuration is invalid or incomplete
 */
export function validateEnvironment(): void {
  const required = [
    'APIFY_API_KEY',
    'RAILWAY_API_SECRET',
    'MONGODB_URI',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('[Environment] ❌ Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('[Environment] Please set these variables in .env or Railway Dashboard');
    process.exit(1);
  }

  console.log('[Environment] ✅ All required variables present');

  // Log optional variables
  if (process.env.PORT) {
    console.log(`[Environment] PORT=${process.env.PORT}`);
  }
  if (process.env.NODE_ENV) {
    console.log(`[Environment] NODE_ENV=${process.env.NODE_ENV}`);
  }
  if (process.env.SCRAPE_INTERVAL_HOURS) {
    console.log(`[Environment] SCRAPE_INTERVAL_HOURS=${process.env.SCRAPE_INTERVAL_HOURS}`);
  }
  if (process.env.CACHE_EXPIRY_DAYS) {
    console.log(`[Environment] CACHE_EXPIRY_DAYS=${process.env.CACHE_EXPIRY_DAYS}`);
  }

  console.log('[Environment] Keywords will be automatically collected from user searches');
}
