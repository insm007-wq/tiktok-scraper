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
}
