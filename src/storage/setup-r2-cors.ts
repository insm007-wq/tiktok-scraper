/**
 * R2 버킷 CORS 및 Public Access 설정 스크립트
 *
 * 실행: npx ts-node src/storage/setup-r2-cors.ts
 * 또는: npm run setup:r2
 */

import { S3Client, PutBucketCorsCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tiktok-videos-storage';

async function setupR2Config() {
  try {
    console.log(`\n🔧 R2 Configuration Setup`);
    console.log(`📦 Bucket: ${BUCKET_NAME}`);
    console.log(`🌐 Endpoint: ${process.env.R2_ENDPOINT}\n`);

    // 버킷 존재 확인
    console.log(`[1/2] ✅ Verifying bucket exists...`);
    try {
      await r2Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`    ✓ Bucket "${BUCKET_NAME}" is accessible\n`);
    } catch (error: any) {
      console.error(`    ✗ Failed to access bucket:`, error.message);
      process.exit(1);
    }

    // CORS 설정
    console.log(`[2/2] 🌍 Configuring CORS...`);
    await r2Client.send(new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));
    console.log(`    ✓ CORS policy configured\n`);

    console.log(`✅ R2 Configuration Complete!\n`);
    console.log(`📝 Configuration Details:`);
    console.log(`   • CORS Origins: * (allow all origins)`);
    console.log(`   • Allowed Methods: GET, HEAD`);
    console.log(`   • Max Age: 3600 seconds (1 hour)\n`);
    console.log(`📌 Public Access:`);
    console.log(`   To enable public access via Public URL:`);
    console.log(`   1. Go to Cloudflare Dashboard → R2 Buckets`);
    console.log(`   2. Select "tiktok-videos-storage"`);
    console.log(`   3. Go to Settings tab`);
    console.log(`   4. Under "Public Access", click "Allow Access"`);
    console.log(`   5. Copy your Public URL (https://pub-xxxxx.r2.dev)\n`);
    console.log(`🧪 Test URL:`);
    console.log(`   ${process.env.R2_PUBLIC_DOMAIN}/thumbnails/test.jpg\n`);

  } catch (error) {
    console.error(`\n❌ Setup failed:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// 실행
setupR2Config();
