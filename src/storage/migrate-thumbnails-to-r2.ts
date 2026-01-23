/**
 * 기존 CDN 썸네일을 R2로 마이그레이션
 *
 * 데이터베이스에 저장된 CDN URL 썸네일들을 R2로 업로드하고
 * 데이터베이스의 thumbnail URL을 R2 URL로 업데이트합니다.
 *
 * 실행: npx ts-node src/storage/migrate-thumbnails-to-r2.ts
 * 또는: npm run migrate:thumbnails
 */

import { getDatabase } from '../db/connection';
import { uploadMediaToR2 } from './r2';
import { CacheDocument } from '../db/cache';

async function migrateThumbnailsToR2() {
  try {
    console.log(`\n📦 Thumbnail Migration to R2\n`);

    const db = getDatabase();
    const collection = db.collection('video_cache');

    // R2 URL이 아닌 썸네일만 조회
    const query = {
      $or: [
        { 'videos.thumbnail': { $exists: true, $not: /r2\.dev/ } },
      ],
    };

    const caches = await collection.find(query).toArray() as any[];
    console.log(`📊 Found ${caches.length} cache documents with non-R2 thumbnails\n`);

    if (caches.length === 0) {
      console.log(`✅ All thumbnails are already R2 URLs or missing!\n`);
      process.exit(0);
    }

    let totalMigrated = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const cache of caches) {
      console.log(`\n🔄 Processing: ${cache.platform}:${cache.query}`);
      const startTime = Date.now();

      const updatedVideos = await Promise.all(
        cache.videos.map(async (video: any) => {
          // 이미 R2 URL이면 스킵
          if (video.thumbnail && video.thumbnail.includes('r2.dev')) {
            totalSkipped++;
            return video;
          }

          // CDN URL이 없으면 스킵
          if (!video.thumbnail) {
            console.log(`  ⏭️  Video ${video.id}: No thumbnail`);
            totalSkipped++;
            return video;
          }

          try {
            console.log(`  ⬆️  Uploading thumbnail for ${video.id}...`);
            const r2Url = await uploadMediaToR2(video.thumbnail, 'thumbnail');

            if (r2Url) {
              totalMigrated++;
              return { ...video, thumbnail: r2Url };
            } else {
              console.log(`  ⚠️  Failed to upload: ${video.id}`);
              totalFailed++;
              return video;
            }
          } catch (error) {
            console.log(`  ❌ Error uploading ${video.id}:`, error instanceof Error ? error.message : error);
            totalFailed++;
            return video;
          }
        })
      );

      // 데이터베이스 업데이트
      await collection.updateOne(
        { _id: cache._id },
        { $set: { videos: updatedVideos, updatedAt: new Date() } }
      );

      const duration = (Date.now() - startTime) / 1000;
      console.log(`  ✅ Completed in ${duration.toFixed(1)}s`);
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Migrated: ${totalMigrated}`);
    console.log(`   ❌ Failed: ${totalFailed}`);
    console.log(`   ⏭️  Skipped: ${totalSkipped}`);
    console.log(`   📈 Total: ${totalMigrated + totalFailed + totalSkipped}\n`);

    console.log(`✅ Migration Complete!\n`);

  } catch (error) {
    console.error(`\n❌ Migration failed:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// 실행
migrateThumbnailsToR2().then(() => process.exit(0));
