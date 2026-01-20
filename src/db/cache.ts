import { Collection, ObjectId } from 'mongodb';
import { getDatabase } from './connection';
import { VideoResult } from '../types/video';

/**
 * Cache Document structure
 */
export interface CacheDocument {
  _id?: ObjectId;
  cacheKey: string; // "platform:query:dateRange"
  platform: string; // tiktok | douyin | xiaohongshu
  query: string;
  videos: VideoResult[];
  videoCount: number;
  dateRange: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  updatedAt?: Date; // For tracking last update time
}

/**
 * Get video_cache collection
 */
function getCacheCollection(): Collection<CacheDocument> {
  const db = getDatabase();
  const collectionName = process.env.MONGODB_CACHE_COLLECTION || 'video_cache';
  return db.collection<CacheDocument>(collectionName);
}

/**
 * Generate cache key from platform, query, and dateRange
 */
function generateCacheKey(
  platform: string,
  query: string,
  dateRange: string = 'all'
): string {
  return `${platform}:${query}:${dateRange}`;
}

/**
 * Save or update cache in MongoDB
 * Uses upsert to handle both new and existing entries
 */
export async function saveCache(
  platform: string,
  query: string,
  videos: VideoResult[],
  dateRange: string = 'all'
): Promise<void> {
  const collection = getCacheCollection();
  const cacheKey = generateCacheKey(platform, query, dateRange);
  const now = new Date();
  const expiryDays = parseInt(process.env.CACHE_EXPIRY_DAYS || '7');
  const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

  // Merge videos: update existing by ID, add new ones
  const existingDoc = await collection.findOne({ cacheKey });
  let mergedVideos = videos;
  let thumbnailPreservedCount = 0;
  let thumbnailLostCount = 0;

  if (existingDoc && existingDoc.videos) {
    const videoMap = new Map(videos.map(v => [v.id, v]));

    // Selective merge: preserve important fields if new data has undefined
    mergedVideos = existingDoc.videos.map(existing => {
      const newVideo = videoMap.get(existing.id);
      if (!newVideo) return existing;

      // Preserve optional fields if new data is undefined
      const merged = { ...newVideo };

      // 썸네일 병합: 새 데이터가 undefined면 기존 값 유지
      if (!newVideo.thumbnail && existing.thumbnail) {
        merged.thumbnail = existing.thumbnail;
        thumbnailPreservedCount++;
      } else if (newVideo.thumbnail && !existing.thumbnail) {
        thumbnailLostCount++;
      } else if (!newVideo.thumbnail && !existing.thumbnail) {
        thumbnailLostCount++;
      }

      // 비디오 URL 병합: 새 데이터가 undefined면 기존 값 유지
      if (!newVideo.videoUrl && existing.videoUrl) {
        merged.videoUrl = existing.videoUrl;
      }

      // 크리에이터 URL 병합: 새 데이터가 undefined면 기존 값 유지
      if (!newVideo.creatorUrl && existing.creatorUrl) {
        merged.creatorUrl = existing.creatorUrl;
      }

      return merged;
    });

    // Add new videos
    const existingIds = new Set(existingDoc.videos.map(v => v.id));
    videos.forEach(video => {
      if (!existingIds.has(video.id)) {
        mergedVideos.push(video);
      }
    });

    // Log merge statistics
    console.log(
      `[Cache] 📊 Merge stats for "${cacheKey}":` +
      ` ${mergedVideos.length} total videos` +
      ` | 🎬 Thumbnails preserved: ${thumbnailPreservedCount}` +
      ` | ⚠️ Missing: ${thumbnailLostCount}`
    );
  }

  await collection.updateOne(
    { cacheKey },
    {
      $set: {
        cacheKey,
        platform,
        query,
        videos: mergedVideos,
        videoCount: mergedVideos.length,
        dateRange,
        lastAccessedAt: now,
        updatedAt: now,
        expiresAt,
      },
      $setOnInsert: {
        createdAt: now,
        accessCount: 0,
      },
    },
    { upsert: true }
  );
  console.log(
    `[Cache] ✅ Saved cache: ${cacheKey} (${mergedVideos.length} videos)`
  );
}

/**
 * Get cache by platform and query
 */
export async function getCache(
  platform: string,
  query: string,
  dateRange: string = 'all'
): Promise<CacheDocument | null> {
  const collection = getCacheCollection();
  const cacheKey = generateCacheKey(platform, query, dateRange);

  const doc = await collection.findOne({ cacheKey });
  if (doc) {
    // Update access time
    await collection.updateOne({ cacheKey }, {
      $set: { lastAccessedAt: new Date() },
      $inc: { accessCount: 1 },
    });
  }
  return doc;
}

/**
 * Get all caches for a specific platform
 */
export async function getAllCacheByPlatform(
  platform: string,
  limit?: number,
  skip: number = 0
): Promise<CacheDocument[]> {
  const collection = getCacheCollection();
  let query = collection.find({ platform });

  if (skip > 0) {
    query = query.skip(skip);
  }

  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  // Sort by most recently updated
  query = query.sort({ updatedAt: -1 });

  return query.toArray();
}

/**
 * Get all videos from a specific platform (flattened)
 */
export async function getVideosByPlatform(
  platform: string,
  limit?: number,
  skip: number = 0
): Promise<VideoResult[]> {
  const collection = getCacheCollection();
  const caches = await getAllCacheByPlatform(platform);

  // Flatten all videos from all caches
  let allVideos: VideoResult[] = [];
  caches.forEach(cache => {
    allVideos = allVideos.concat(cache.videos);
  });

  // Remove duplicates by ID
  const videoMap = new Map<string, VideoResult>();
  allVideos.forEach(video => {
    if (!videoMap.has(video.id)) {
      videoMap.set(video.id, video);
    }
  });

  let videos = Array.from(videoMap.values());

  // Apply skip and limit
  if (skip > 0) {
    videos = videos.slice(skip);
  }
  if (limit && limit > 0) {
    videos = videos.slice(0, limit);
  }

  return videos;
}

/**
 * Get statistics about cached data
 */
export async function getCacheStats(): Promise<{
  totalDocuments: number;
  platformCounts: Record<string, number>;
  totalUniqueVideos: number;
  lastUpdate: Date | null;
}> {
  const collection = getCacheCollection();

  const totalDocuments = await collection.countDocuments();

  // Get platform counts
  const platformStats = await collection.aggregate([
    { $group: { _id: '$platform', count: { $sum: 1 } } },
  ]).toArray();

  const platformCounts: Record<string, number> = {};
  platformStats.forEach(stat => {
    platformCounts[stat._id] = stat.count;
  });

  // Count total unique videos
  const allCaches = await collection.find({}).toArray();
  const videoSet = new Set<string>();
  allCaches.forEach(cache => {
    cache.videos.forEach(video => {
      videoSet.add(video.id);
    });
  });

  // Get last update time
  const lastDoc = await collection.findOne({}, { sort: { updatedAt: -1 } });
  const lastUpdate = lastDoc?.updatedAt || null;

  return {
    totalDocuments,
    platformCounts,
    totalUniqueVideos: videoSet.size,
    lastUpdate,
  };
}

/**
 * Delete expired caches
 */
export async function deleteExpiredCache(): Promise<number> {
  const collection = getCacheCollection();
  const now = new Date();

  const result = await collection.deleteMany({
    expiresAt: { $lt: now },
  });

  if (result.deletedCount > 0) {
    console.log(`[Cache] ✅ Deleted ${result.deletedCount} expired cache documents`);
  }

  return result.deletedCount;
}

/**
 * Clear all cache (for testing)
 */
export async function clearAllCache(): Promise<number> {
  const collection = getCacheCollection();
  const result = await collection.deleteMany({});
  console.log(`[Cache] ⚠️ Cleared ${result.deletedCount} cache documents`);
  return result.deletedCount;
}

/**
 * Get keywords from video_cache by accessCount (조회 횟수)
 * Groups by query (keyword) and sums up accessCount across all platforms
 * Filters by minimum accessCount threshold with optional recency and max count limits
 */
export async function getTopKeywordsFromCache(
  minAccessCount: number = 2,
  maxCount: number = 100,
  recentDays: number = 7
): Promise<{
  keyword: string;
  accessCount: number;
  videoCount: number;
  lastAccessed: Date | undefined;
  platforms: string[];
}[]> {
  const collection = getCacheCollection();

  // Calculate the date threshold (e.g., 7 days ago)
  const recencyThreshold = new Date();
  recencyThreshold.setDate(recencyThreshold.getDate() - recentDays);

  const results = (await collection
    .aggregate([
      {
        $group: {
          _id: '$query', // keyword
          accessCount: { $sum: '$accessCount' }, // 총 조회 횟수
          videoCount: { $sum: '$videoCount' }, // 총 비디오 수
          lastAccessed: { $max: '$lastAccessedAt' }, // 마지막 조회 시간
          platforms: { $push: '$platform' }, // 플랫폼 목록
        },
      },
      {
        $match: {
          accessCount: { $gte: minAccessCount }, // 최소 접근 횟수 필터
          lastAccessed: { $gte: recencyThreshold }, // 최근 N일 이내 접근한 키워드
        },
      },
      {
        $sort: { accessCount: -1 }, // 조회 횟수 기준 정렬
      },
      {
        $limit: maxCount, // 최대 개수 제한
      },
    ])
    .toArray()) as Array<{
    _id: string;
    accessCount: number;
    videoCount: number;
    lastAccessed: Date | undefined;
    platforms: string[];
  }>;

  return results.map(doc => ({
    keyword: doc._id,
    accessCount: doc.accessCount,
    videoCount: doc.videoCount,
    lastAccessed: doc.lastAccessed,
    platforms: [...new Set(doc.platforms)], // 중복 제거
  }));
}
