import { VideoResult } from "../types/video";

/**
 * TikTok 영상 검색
 */
export async function searchTikTokVideos(query: string, limit: number, apiKey: string, dateRange?: string): Promise<VideoResult[]> {
  try {
    const actorId = "apidojo~tiktok-scraper";
    const startTime = Date.now();
    console.log(`[TikTok] 검색 시작: ${query} (제한: ${limit}, 기간: ${dateRange || "all"})`);
    console.log(`[TikTok] API 키 확인: ${apiKey.substring(0, 10)}...${apiKey.length} chars`);

    const mapDateRange = (uploadPeriod?: string): string => {
      const mapping: Record<string, string> = {
        all: "DEFAULT",
        yesterday: "YESTERDAY",
        "7days": "THIS_WEEK",
        "1month": "THIS_MONTH",
        "3months": "LAST_THREE_MONTHS",
      };
      return mapping[uploadPeriod || "all"] || "DEFAULT";
    };

    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: [query],
        maxItems: 60,
        sortType: "RELEVANCE",
        location: "US",
        dateRange: mapDateRange(dateRange),
        includeSearchKeywords: false,
        startUrls: [],
      }),
    });

    // ✨ [수정] as any 추가
    const runData = (await runRes.json()) as any;
    console.log(`[TikTok] HTTP Status: ${runRes.status}, Response:`, JSON.stringify(runData).substring(0, 200));

    if (!runRes.ok) {
      console.error("[TikTok] Run 시작 실패:", runData);
      return [];
    }

    if (!runData.data || !runData.data.id) {
      console.error("[TikTok] Run ID 추출 실패. 응답:", JSON.stringify(runData));
      return [];
    }

    const runId = runData.data.id;
    console.log(`[TikTok] ✅ Run ID: ${runId}`);

    let status = "RUNNING";
    let attempt = 0;
    const maxAttempts = 90;
    let waitTime = 500;
    const maxWaitTime = 8000;
    console.log(`[TikTok] Run started. Requesting 75 items...`);
    const runStartTime = Date.now();

    while ((status === "RUNNING" || status === "READY") && attempt < maxAttempts) {
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);

      // ✨ [수정] as any 추가
      const statusData = (await statusRes.json()) as any;
      status = statusData.data.status;
      attempt++;

      if (attempt % 20 === 0) {
        const elapsed = (Date.now() - runStartTime) / 1000;
        console.log(`[TikTok] Polling ${attempt}/${maxAttempts} (${elapsed.toFixed(1)}s), Status: ${status}`);
      }

      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED") {
        console.error("[TikTok] Run 실패:", statusData.data.statusMessage);
        return [];
      }

      if (status === "RUNNING" || status === "READY") {
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime = Math.min(waitTime * 2, maxWaitTime);
      }
    }

    if (status !== "SUCCEEDED") {
      console.warn(`[TikTok] 타임아웃 (상태: ${status})`);
      return [];
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`);

    // ✨ [수정] as any 추가
    const dataset = (await datasetRes.json()) as any;
    if (!Array.isArray(dataset) || dataset.length === 0) {
      console.log("[TikTok] 검색 결과 없음");
      return [];
    }

    // Phase 1-A: Raw API response sample logging
    if (dataset.length > 0) {
      console.log(`[TikTok] 📦 Raw API response sample (first 3 items):`);
      dataset.slice(0, 3).forEach((item: any, idx: number) => {
        const sampleStr = JSON.stringify(item, null, 2);
        console.log(`[TikTok]   Item #${idx}: ${sampleStr.substring(0, 500)}${sampleStr.length > 500 ? "..." : ""}`);
      });
    }

    let thumbnailCount = 0;
    let noThumbnailCount = 0;
    let videoDurationStats = { total: 0, count: 0 };

    const results = dataset.slice(0, Math.min(limit, 60)).map((item: any, index: number) => {
      const hashtags = Array.isArray(item.hashtags)
        ? item.hashtags
            .filter((h: any) => h !== null && h !== undefined)
            .map((h: any) => (typeof h === "string" ? h : h && h.name ? h.name : h))
        : [];

      const videoUrl = item.video?.url || item.downloadUrl || item.videoUrl || undefined;
      const webVideoUrl = item.postPage || (item.channel?.url && item.id ? `${item.channel.url}/video/${item.id}` : undefined) || undefined;

      // Extended thumbnail fallback chain (Phase 3 expansion)
      const thumbnail =
        item.video?.thumbnail ||
        item.video?.cover ||
        item.cover ||
        item.coverUrl ||
        item.video?.dynamicCover ||
        item.video?.originCover ||
        item.thumbnail ||
        item.dynamicCover ||
        undefined;

      // Track thumbnail statistics
      if (thumbnail) {
        thumbnailCount++;
      } else {
        noThumbnailCount++;

        // Phase 1-B: Fallback chain tracking (first 5 missing cases)
        if (noThumbnailCount <= 5) {
          const thumbnailSources = {
            'video.thumbnail': item.video?.thumbnail,
            'video.cover': item.video?.cover,
            'cover': item.cover,
            'coverUrl': item.coverUrl,
          };
          console.warn(`[TikTok] ⚠️ Missing thumbnail for video ${item.id || index}:`);
          console.warn(`[TikTok]   Checked fields:`, JSON.stringify(thumbnailSources, null, 2));
        }
      }

      // Track video duration stats
      const duration = item.video?.duration ? parseInt(String(item.video.duration)) : 0;
      if (duration > 0) {
        videoDurationStats.total += duration;
        videoDurationStats.count++;
      }

      return {
        id: item.id || `video-${index}`,
        title: item.title || `영상 ${index + 1}`,
        description: item.title || "",
        creator: item.channel?.name || item.channel?.username || "Unknown",
        creatorUrl: item.channel?.url || undefined,
        followerCount: item.channel?.followers ? parseInt(String(item.channel.followers)) : undefined,
        playCount: parseInt(String(item.views || 0)),
        likeCount: parseInt(String(item.likes || 0)),
        commentCount: parseInt(String(item.comments || 0)),
        shareCount: parseInt(String(item.shares || 0)),
        createTime: item.uploadedAt ? parseInt(String(item.uploadedAt)) * 1000 : Date.now(),
        videoDuration: duration,
        hashtags: hashtags,
        thumbnail: thumbnail,
        videoUrl: videoUrl,
        webVideoUrl: webVideoUrl,
      };
    });

    const runDuration = (Date.now() - runStartTime) / 1000;
    const totalDuration = Date.now() - startTime;
    const avgDuration = videoDurationStats.count > 0 ? (videoDurationStats.total / videoDurationStats.count).toFixed(0) : 0;

    console.log(`[TikTok] ✅ Run completed in ${runDuration.toFixed(2)}s`);
    console.log(`[TikTok] Raw items: ${dataset.length}, Final: ${results.length}`);
    console.log(`[TikTok] 🎬 Thumbnails: ${thumbnailCount}/${results.length} (${results.length > 0 ? ((thumbnailCount / results.length) * 100).toFixed(1) : 0}%) | ⚠️ Missing: ${noThumbnailCount}`);
    console.log(`[TikTok] ⏱️  Avg duration: ${avgDuration}s | Yield: ${((results.length / 60) * 100).toFixed(1)}%`);

    return results;
  } catch (error) {
    console.error("[TikTok] 오류:", error);
    return [];
  }
}
