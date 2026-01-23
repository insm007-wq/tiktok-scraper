import { VideoResult } from "../types/video";
import { uploadMediaToR2 } from "../storage/r2";

/**
 * Douyin 영상 검색
 */
export async function searchDouyinVideos(query: string, limit: number, apiKey: string, dateRange?: string): Promise<VideoResult[]> {
  try {
    const actorId = "natanielsantos~douyin-scraper";
    const startTime = Date.now();
    console.log(`[Douyin] 검색 시작: ${query} (제한: ${limit}, 기간: ${dateRange || "all"})`);

    const mapSearchPublishTimeFilter = (uploadPeriod?: string): string => {
      const mapping: Record<string, string> = {
        all: "all",
        yesterday: "last_day",
        "7days": "last_week",
        "6months": "last_half_year",
      };
      return mapping[uploadPeriod || "all"] || "all";
    };

    const inputParams: any = {
      searchTermsOrHashtags: [query],
      searchSortFilter: "most_liked",
      searchPublishTimeFilter: mapSearchPublishTimeFilter(dateRange),
      maxItemsPerUrl: 40,
      shouldDownloadVideos: true,
      shouldDownloadCovers: true,
    };

    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputParams),
    });

    // ✨ [수정] as any 추가
    const runData = (await runRes.json()) as any;
    if (!runRes.ok) {
      console.error("[Douyin] Run 시작 실패:", runData);
      return [];
    }

    const runId = runData.data.id;
    console.log(`[Douyin] Run ID: ${runId}`);

    let status = "RUNNING";
    let attempt = 0;
    const maxAttempts = 120;
    let waitTime = 500;
    const maxWaitTime = 5000;

    while ((status === "RUNNING" || status === "READY") && attempt < maxAttempts) {
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);

      // ✨ [수정] as any 추가
      const statusData = (await statusRes.json()) as any;
      status = statusData.data.status;
      attempt++;

      if (attempt % 10 === 0) {
        console.log(`[Douyin] Polling ${attempt}/${maxAttempts}: ${status}`);
      }

      if (status === "SUCCEEDED") {
        console.log("[Douyin] Run 완료됨");
        break;
      }
      if (status === "FAILED" || status === "ABORTED") {
        console.error("[Douyin] Run 실패:", statusData.data.statusMessage);
        return [];
      }

      if (status === "RUNNING" || status === "READY") {
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime = Math.min(waitTime * 2, maxWaitTime);
      }
    }

    if (status !== "SUCCEEDED") {
      console.warn(`[Douyin] 타임아웃 (상태: ${status})`);
      return [];
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`);

    // ✨ [수정] as any 추가
    const dataset = (await datasetRes.json()) as any;
    console.log(`[Douyin] API 응답 데이터: ${Array.isArray(dataset) ? dataset.length : 0}개`);

    if (!Array.isArray(dataset) || dataset.length === 0) {
      console.log("[Douyin] 검색 결과 없음");
      return [];
    }

    // Phase 1-A: Raw API response sample logging
    if (dataset.length > 0) {
      console.log(`[Douyin] 📦 Raw API response sample (first 3 items):`);
      dataset.slice(0, 3).forEach((item: any, idx: number) => {
        const sampleStr = JSON.stringify(item, null, 2);
        console.log(`[Douyin]   Item #${idx}: ${sampleStr.substring(0, 500)}${sampleStr.length > 500 ? "..." : ""}`);
      });
    }

    let thumbnailCount = 0;
    let noThumbnailCount = 0;

    const results = await Promise.all(
      dataset.slice(0, limit).map(async (item: any, index: number) => {
        const hashtags = item.hashtags?.map((h: any) => (typeof h === "string" ? h : h.name)) || [];

        // Extended thumbnail fallback chain (Phase 3 expansion)
        const douyinThumbnail =
          item.videoMeta?.cover ||
          item.videoMeta?.originCover ||
          item.thumb ||
          item.cover ||
          item.coverUrl ||
          item.video?.cover ||
          item.videoMeta?.dynamicCover ||
          item.dynamicCover ||
          undefined;

        const videoUrl = item.videoMeta?.playUrl || item.video?.url || item.downloadUrl || item.playUrl || undefined;

        // Upload to R2 and get permanent URLs
        const r2Media = await uploadMediaToR2(douyinThumbnail, videoUrl);

        // Track thumbnail statistics
        if (r2Media.thumbnail) {
          thumbnailCount++;
        } else {
          noThumbnailCount++;

          // Phase 1-B: Fallback chain tracking (first 5 missing cases)
          if (noThumbnailCount <= 5) {
            const thumbnailSources = {
              'videoMeta.cover': item.videoMeta?.cover,
              'videoMeta.originCover': item.videoMeta?.originCover,
              'thumb': item.thumb,
            };
            console.warn(`[Douyin] ⚠️ Failed to upload thumbnail for video ${item.id || index}:`);
            console.warn(`[Douyin]   Checked fields:`, JSON.stringify(thumbnailSources, null, 2));
          }
        }

        return {
          id: item.id || `douyin-video-${index}`,
          title: item.text || item.desc || item.description || `영상 ${index + 1}`,
          description: item.text || item.desc || "",
          creator: item.authorMeta?.name || item.authorName || "Unknown",
          creatorUrl: item.authorMeta?.avatarLarge || item.authorUrl || undefined,
          followerCount: item.authorMeta?.followersCount ? parseInt(item.authorMeta.followersCount) : undefined,
          playCount: parseInt(item.statistics?.diggCount || 0),
          likeCount: parseInt(item.statistics?.diggCount || 0),
          commentCount: parseInt(item.statistics?.commentCount || 0),
          shareCount: parseInt(item.statistics?.shareCount || 0),
          createTime: item.createTime ? parseInt(item.createTime) * 1000 : Date.now(),
          videoDuration: parseInt(item.videoMeta?.duration || item.duration || 0),
          hashtags: hashtags,
          thumbnail: r2Media.thumbnail || douyinThumbnail,
          videoUrl: r2Media.video || videoUrl,
          webVideoUrl: item.url || undefined,
        };
      })
    );

    console.log(`[Douyin] 🎬 Thumbnails: ${thumbnailCount}/${results.length} (${results.length > 0 ? ((thumbnailCount / results.length) * 100).toFixed(1) : 0}%) | ⚠️ Missing: ${noThumbnailCount}`);

    return results;
  } catch (error) {
    console.error("[Douyin] 오류:", error);
    return [];
  }
}

/**
 * Douyin 병렬 검색
 */
export async function searchDouyinVideosParallel(query: string, limit: number, apiKey: string, dateRange?: string): Promise<VideoResult[]> {
  try {
    const actorId = "natanielsantos~douyin-scraper";
    const startTime = Date.now();

    const mapSearchPublishTimeFilter = (uploadPeriod?: string): string => {
      const mapping: Record<string, string> = {
        all: "all",
        yesterday: "last_day",
        "7days": "last_week",
        "6months": "last_half_year",
      };
      return mapping[uploadPeriod || "all"] || "all";
    };

    const sortFilters = ["most_liked", "latest", "general"];
    console.log(`[Douyin Parallel] 3개 Run 병렬 시작: ${query}`);

    const runPromises = sortFilters.map(async (sortFilter) => {
      const inputParams: any = {
        searchTermsOrHashtags: [query],
        searchSortFilter: sortFilter,
        searchPublishTimeFilter: mapSearchPublishTimeFilter(dateRange),
        maxItemsPerUrl: 20,
        shouldDownloadVideos: true,
        shouldDownloadCovers: true,
      };

      const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputParams),
      });

      // ✨ [수정] as any 추가
      const runData = (await runRes.json()) as any;
      if (!runRes.ok) {
        console.error(`[Douyin Parallel ${sortFilter}] Run 시작 실패:`, runData);
        return { runId: null, sortFilter };
      }

      console.log(`[Douyin Parallel] Run 시작: ${sortFilter}, ID: ${runData.data.id}`);
      return { runId: runData.data.id, sortFilter };
    });

    const runs = await Promise.all(runPromises);
    const validRuns = runs.filter((r) => r.runId !== null);

    if (validRuns.length === 0) return [];

    const datasetPromises = validRuns.map(async ({ runId, sortFilter }) => {
      let status = "RUNNING";
      let attempt = 0;
      const maxAttempts = 120;
      let waitTime = 500;
      const maxWaitTime = 5000;

      while ((status === "RUNNING" || status === "READY") && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, waitTime));

        const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
        // ✨ [수정] as any 추가
        const statusData = (await statusRes.json()) as any;
        status = statusData.data.status;
        attempt++;

        if (status === "SUCCEEDED") break;
        if (status === "FAILED" || status === "ABORTED") return [];

        waitTime = Math.min(waitTime * 1.5, maxWaitTime);
      }

      if (status !== "SUCCEEDED") return [];

      const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`);
      // ✨ [수정] as any 추가
      const dataset = (await datasetRes.json()) as any;

      // Phase 1-A: Raw API response sample logging (only for first run)
      if (Array.isArray(dataset) && dataset.length > 0 && sortFilter === "most_liked") {
        console.log(`[Douyin Parallel] 📦 Raw API response sample (${sortFilter}, first 2 items):`);
        dataset.slice(0, 2).forEach((item: any, idx: number) => {
          const sampleStr = JSON.stringify(item, null, 2);
          console.log(`[Douyin Parallel]   Item #${idx}: ${sampleStr.substring(0, 400)}${sampleStr.length > 400 ? "..." : ""}`);
        });
      }

      return Array.isArray(dataset) ? dataset : [];
    });

    const datasets = await Promise.all(datasetPromises);
    const allItems = datasets.flat();
    const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values());

    if (uniqueItems.length === 0) return [];

    let thumbnailCount = 0;
    let noThumbnailCount = 0;

    const results = await Promise.all(
      uniqueItems.slice(0, limit).map(async (item: any, index: number) => {
        const hashtags = item.hashtags?.map((h: any) => (typeof h === "string" ? h : h.name)) || [];

        // Extended thumbnail fallback chain (Phase 3 expansion)
        const douyinThumbnail =
          item.videoMeta?.cover ||
          item.videoMeta?.originCover ||
          item.thumb ||
          item.cover ||
          item.coverUrl ||
          item.video?.cover ||
          item.videoMeta?.dynamicCover ||
          item.dynamicCover ||
          undefined;

        const videoUrl = item.videoMeta?.playUrl || item.video?.url || item.downloadUrl || item.playUrl || undefined;

        // Upload to R2 and get permanent URLs
        const r2Media = await uploadMediaToR2(douyinThumbnail, videoUrl);

        // Track thumbnail statistics
        if (r2Media.thumbnail) {
          thumbnailCount++;
        } else {
          noThumbnailCount++;

          // Phase 1-B: Fallback chain tracking (first 5 missing cases)
          if (noThumbnailCount <= 5) {
            const thumbnailSources = {
              'videoMeta.cover': item.videoMeta?.cover,
              'videoMeta.originCover': item.videoMeta?.originCover,
              'thumb': item.thumb,
            };
            console.warn(`[Douyin Parallel] ⚠️ Failed to upload thumbnail for video ${item.id || index}:`);
            console.warn(`[Douyin Parallel]   Checked fields:`, JSON.stringify(thumbnailSources, null, 2));
          }
        }

        return {
          id: item.id || `douyin-video-${index}`,
          title: item.text || item.desc || item.description || `영상 ${index + 1}`,
          description: item.text || item.desc || "",
          creator: item.authorMeta?.name || item.authorName || "Unknown",
          creatorUrl: item.authorMeta?.avatarLarge || item.authorUrl || undefined,
          followerCount: item.authorMeta?.followersCount ? parseInt(item.authorMeta.followersCount) : undefined,
          playCount: parseInt(item.statistics?.diggCount || 0),
          likeCount: parseInt(item.statistics?.diggCount || 0),
          commentCount: parseInt(item.statistics?.commentCount || 0),
          shareCount: parseInt(item.statistics?.shareCount || 0),
          createTime: item.createTime ? parseInt(item.createTime) * 1000 : Date.now(),
          videoDuration: parseInt(item.videoMeta?.duration || item.duration || 0),
          hashtags: hashtags,
          thumbnail: r2Media.thumbnail || douyinThumbnail,
          videoUrl: r2Media.video || videoUrl,
          webVideoUrl: item.url || undefined,
        };
      })
    );

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[Douyin Parallel] 🎬 Thumbnails: ${thumbnailCount}/${results.length} (${results.length > 0 ? ((thumbnailCount / results.length) * 100).toFixed(1) : 0}%) | ⚠️ Missing: ${noThumbnailCount}`);
    console.log(`[Douyin Parallel] ✅ 최종 완료: ${results.length}개 (${(duration / 1000).toFixed(2)}초)`);

    return results;
  } catch (error) {
    console.error("[Douyin Parallel] 오류:", error);
    return [];
  }
}
