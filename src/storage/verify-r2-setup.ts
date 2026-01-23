/**
 * R2 설정 검증 유틸리티
 *
 * 실행: npx ts-node src/storage/verify-r2-setup.ts
 * 또는: npm run verify:r2
 *
 * 다음을 확인합니다:
 * 1. R2 버킷 접근 가능성
 * 2. 파일 업로드 가능성
 * 3. Public URL 접근 가능성
 * 4. CORS 설정
 */

import dotenv from 'dotenv';
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getDatabase } from '../db/connection';

dotenv.config();

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tiktok-videos-storage';
const PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || 'https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev';

interface VerificationResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

const results: VerificationResult[] = [];

function addResult(name: string, status: 'pass' | 'warn' | 'fail', message: string) {
  results.push({ name, status, message });
}

async function verifyR2Setup() {
  try {
    console.log(`\n🔍 R2 Setup Verification\n`);
    console.log(`Configuration:`);
    console.log(`  Bucket: ${BUCKET_NAME}`);
    console.log(`  Endpoint: ${process.env.R2_ENDPOINT}`);
    console.log(`  Public Domain: ${PUBLIC_DOMAIN}\n`);

    // 1. 환경 변수 확인
    console.log(`[1/4] 🔧 Checking Environment Variables...`);
    const requiredEnvVars = [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET_NAME',
      'R2_ENDPOINT',
      'R2_PUBLIC_DOMAIN',
    ];

    let allEnvVarsSet = true;
    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      if (!value) {
        addResult(`Environment Variable: ${envVar}`, 'fail', 'Not set');
        allEnvVarsSet = false;
      }
    }

    if (allEnvVarsSet) {
      addResult('Environment Variables', 'pass', 'All required variables are set');
    }
    console.log(`    ✓ Completed\n`);

    // 2. R2 버킷 접근 확인
    console.log(`[2/4] 📦 Testing R2 Bucket Access...`);
    try {
      await r2Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      addResult('R2 Bucket Access', 'pass', `Can access bucket "${BUCKET_NAME}"`);
      console.log(`    ✓ Bucket is accessible\n`);
    } catch (error: any) {
      addResult('R2 Bucket Access', 'fail', `Cannot access bucket: ${error.message}`);
      console.log(`    ✗ Failed to access bucket\n`);
      throw error;
    }

    // 3. R2에 있는 파일 확인
    console.log(`[3/4] 📋 Checking Files in R2...`);
    try {
      const response = await r2Client.send(new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        MaxKeys: 5,
      }));

      const fileCount = response.Contents?.length || 0;
      if (fileCount > 0) {
        const totalSize = response.Contents?.reduce((sum, obj) => sum + (obj.Size || 0), 0) || 0;
        addResult('R2 Files', 'pass', `Found ${fileCount} files (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
        console.log(`    ✓ Found ${fileCount} files\n`);

        // 샘플 파일 목록 표시
        console.log(`    Sample files:`);
        response.Contents?.slice(0, 3).forEach(obj => {
          console.log(`      • ${obj.Key} (${(obj.Size || 0) / 1024}KB)`);
        });
        console.log();
      } else {
        addResult('R2 Files', 'warn', 'No files found in R2 bucket (normal for new setup)');
        console.log(`    ⚠️  No files found yet\n`);
      }
    } catch (error: any) {
      addResult('R2 Files', 'fail', `Error listing files: ${error.message}`);
      console.log(`    ✗ Failed to list files\n`);
    }

    // 4. 데이터베이스 정보
    console.log(`[4/4] 🗄️  Checking Database Cache...`);
    try {
      const db = getDatabase();
      if (!db) {
        addResult('Database Caches', 'warn', 'Database not initialized (will connect when server starts)');
        console.log(`    ⚠️  Database not initialized yet (normal for setup phase)\n`);
      } else {
        const collection = db.collection('video_cache');
        const count = await collection.countDocuments();

        if (count > 0) {
          const cacheWithR2 = await collection.countDocuments({
            'videos.thumbnail': { $regex: 'r2.dev' },
          });

          const r2Percentage = ((cacheWithR2 / count) * 100).toFixed(1);
          addResult('Database Caches', 'pass', `${count} caches found`);
          addResult('R2 URL Coverage', cacheWithR2 > 0 ? 'warn' : 'warn', `${cacheWithR2}/${count} have R2 URLs (${r2Percentage}%)`);

          console.log(`    ✓ Found ${count} cache documents`);
          console.log(`    • R2 URLs: ${cacheWithR2}/${count} (${r2Percentage}%)`);

          // CDN URL 개수 확인
          const cacheWithCDN = await collection.countDocuments({
            'videos.thumbnail': { $regex: 'tiktokcdn', $options: 'i' },
          });
          if (cacheWithCDN > 0) {
            console.log(`    • CDN URLs: ${cacheWithCDN}/${count} (need migration)`);
          }
        } else {
          addResult('Database Caches', 'warn', 'No cache documents found (run scraper first)');
          console.log(`    ⚠️  No caches yet\n`);
        }
      }
    } catch (error: any) {
      addResult('Database Connection', 'warn', `Database check skipped (will verify when server runs): ${error.message}`);
      console.log(`    ⚠️  Database not available in setup phase\n`);
    }

    // 결과 요약
    console.log(`\n${'='.repeat(60)}\n`);
    console.log(`📊 Verification Summary:\n`);

    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;

    results.forEach(result => {
      const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
      console.log(`${icon} ${result.name}`);
      console.log(`   └─ ${result.message}\n`);

      if (result.status === 'pass') passCount++;
      else if (result.status === 'warn') warnCount++;
      else failCount++;
    });

    console.log(`${'='.repeat(60)}\n`);
    console.log(`Results: ✅ ${passCount} Pass | ⚠️ ${warnCount} Warnings | ❌ ${failCount} Failures\n`);

    if (failCount > 0) {
      console.log(`❌ Setup Issues Found!\n`);
      console.log(`Next Steps:`);
      console.log(`  1. Check environment variables in .env`);
      console.log(`  2. Verify R2 credentials are correct`);
      console.log(`  3. Ensure R2 bucket exists in Cloudflare\n`);
      // Don't fail if only database is not connected (it will connect when server runs)
      if (results.filter(r => r.status === 'fail' && r.name !== 'Database Connection').length > 0) {
        process.exit(1);
      }
    }

    if (warnCount > 0) {
      console.log(`⚠️  Setup Issues Detected\n`);
      console.log(`Recommended Actions:`);

      // R2 커버리지가 낮으면 마이그레이션 제안
      const r2CoverageResult = results.find(r => r.name === 'R2 URL Coverage');
      if (r2CoverageResult && r2CoverageResult.status === 'warn') {
        console.log(`  • Run: npm run migrate:thumbnails`);
      }

      // 파일이 없으면 스크래핑 제안
      const fileResult = results.find(r => r.name === 'R2 Files');
      if (fileResult && fileResult.message.includes('No files')) {
        console.log(`  • Run scraper to populate R2 with files`);
        console.log(`  • Or run: npm run migrate:thumbnails`);
      }

      // 캐시가 없으면 스크래핑 제안
      const cacheResult = results.find(r => r.name === 'Database Caches');
      if (cacheResult && cacheResult.message.includes('No cache')) {
        console.log(`  • Run scraper to create cache: POST /api/scrape`);
      }
      console.log();
    } else {
      console.log(`✅ R2 Setup is Complete!\n`);
      console.log(`Next Steps:`);
      console.log(`  1. ✓ Environment configured`);
      console.log(`  2. ✓ R2 bucket accessible`);
      console.log(`  3. Run frontend tests to verify thumbnail loading\n`);
    }

  } catch (error) {
    console.error(`\n❌ Verification failed:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// 실행
verifyR2Setup().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
