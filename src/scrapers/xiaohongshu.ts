import { VideoResult } from "../types/video";
import { parseXiaohongshuTime } from "../utils/xiaohongshuTimeParser";

export async function searchXiaohongshuVideos(query: string, limit: number, apiKey: string, dateRange?: string): Promise<VideoResult[]> {
  try {
    const actorId = "easyapi~rednote-xiaohongshu-search-scraper";
    const startTime = Date.now();
    console.log(`[Xiaohongshu] 검색 시작: ${query} (제한: ${limit})`);

    const inputParams = {
      keywords: [query],
      maxItems: Math.min(limit, 100),
    };

    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputParams),
    });

    // ✨ [수정] as any 추가
    const runData = (await runRes.json()) as any;
    if (!runRes.ok) {
      console.error("[Xiaohongshu] Run 시작 실패:", runData);
      return [];
    }

    const runId = runData.data.id;
    console.log(`[Xiaohongshu] Run ID: ${runId}`);

    let status = "RUNNING";
    let attempt = 0;
    const maxAttempts = 60;
    let waitTime = 500;
    const maxWaitTime = 5000;

    while ((status === "RUNNING" || status === "READY") && attempt < maxAttempts) {
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);

      // ✨ [수정] as any 추가
      const statusData = (await statusRes.json()) as any;
      status = statusData.data.status;
      attempt++;

      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED") {
        console.error("[Xiaohongshu] Run 실패:", statusData.data.statusMessage);
        return [];
      }

      if (status === "RUNNING" || status === "READY") {
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime = Math.min(waitTime * 1.5, maxWaitTime);
      }
    }

    if (status !== "SUCCEEDED") {
      console.error(`[Xiaohongshu] 타임아웃 (상태: ${status})`);
      return [];
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`);

    // ✨ [수정] as any 추가
    const dataset = (await datasetRes.json()) as any;
    if (!Array.isArray(dataset) || dataset.length === 0) {
      console.log("[Xiaohongshu] 검색 결과 없음");
      return [];
    }

    const filteredDataset = dataset
      .filter((item: any) => {
        return item.item?.note_card?.type === "video" || item.item?.type === "video" || !!item.item?.video?.media;
      })
      .slice(0, limit);

    let thumbnailCount = 0;
    let noThumbnailCount = 0;

    const results = filteredDataset.map((item: any, index: number) => {
      const title = item.item?.note_card?.display_title || item.item?.title || `포스트 ${index + 1}`;
      const thumbnail = item.item?.video?.media?.cover || item.item?.note_card?.cover?.url_default;

      // Track thumbnail statistics
      if (thumbnail) {
        thumbnailCount++;
      } else {
        noThumbnailCount++;
      }

      return {
        id: item.item?.id || item.id || `xiaohongshu-${index}`,
        title: title,
        description: title,
        creator: item.item?.note_card?.user?.nickname || "Unknown",
        creatorUrl: item.item?.note_card?.user?.avatar || undefined,
        playCount: parseInt(item.item?.note_card?.interact_info?.play_count || 0),
        likeCount: parseInt(item.item?.note_card?.interact_info?.liked_count || 0),
        commentCount: parseInt(item.item?.note_card?.interact_info?.comment_count || 0),
        shareCount: parseInt(item.item?.note_card?.interact_info?.shared_count || 0),
        createTime: parseXiaohongshuTime(item.item?.note_card?.corner_tag_info),
        videoDuration: item.item?.video?.media?.duration || 0,
        hashtags: [],
        thumbnail: thumbnail,
        videoUrl: undefined,
        webVideoUrl: item.link || item.postUrl || item.url || undefined,
      } as VideoResult;
    });

    console.log(`[Xiaohongshu] 🎬 Thumbnails: ${thumbnailCount}/${results.length} (${results.length > 0 ? ((thumbnailCount / results.length) * 100).toFixed(1) : 0}%)`);

    return results;
  } catch (error) {
    console.error("[Xiaohongshu] 오류:", error);
    return [];
  }
}

export async function searchXiaohongshuVideosParallel(
  query: string,
  limit: number,
  apiKey: string,
  dateRange?: string
): Promise<VideoResult[]> {
  try {
    const actorId = "easyapi~rednote-xiaohongshu-search-scraper";
    const startTime = Date.now();
    const sortTypes = ["general", "latest", "hotest"];

    console.log(`[Xiaohongshu Parallel] 3개 Run 병렬 시작: ${query}`);

    const runPromises = sortTypes.map(async (sortType) => {
      const inputParams = {
        keywords: [query],
        sortType,
        noteType: "video",
        maxItems: 25,
      };

      const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputParams),
      });

      // ✨ [수정] as any 추가
      const runData = (await runRes.json()) as any;
      if (!runRes.ok) {
        console.error(`[Xiaohongshu Parallel ${sortType}] Run 시작 실패:`, runData);
        return { runId: null, sortType };
      }

      console.log(`[Xiaohongshu Parallel] Run 시작: ${sortType}, ID: ${runData.data.id}`);
      return { runId: runData.data.id, sortType };
    });

    const runs = await Promise.all(runPromises);
    const validRuns = runs.filter((r) => r.runId !== null);

    if (validRuns.length === 0) return [];

    const datasetPromises = validRuns.map(async ({ runId, sortType }) => {
      let status = "RUNNING";
      let attempt = 0;
      const maxAttempts = 90;
      let waitTime = 500;
      const maxWaitTime = 6000;

      while ((status === "RUNNING" || status === "READY") && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, waitTime));

        const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
        // ✨ [수정] as any 추가
        const statusData = (await statusRes.json()) as any;
        status = statusData.data.status;

        if (status === "SUCCEEDED") break;
        if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") return [];

        attempt++;
        waitTime = Math.min(waitTime * 1.2, maxWaitTime);
      }

      if (status !== "SUCCEEDED") return [];

      const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`);

      // ✨ [수정] as any 추가
      const dataset = (await datasetRes.json()) as any;
      return Array.isArray(dataset) ? dataset : [];
    });

    const allDatasets = await Promise.all(datasetPromises);
    const combinedDataset = allDatasets.flat();

    if (combinedDataset.length === 0) return [];

    const videoOnlyDataset = combinedDataset.filter((item: any) => {
      return item.item?.note_card?.type === "video" || item.item?.type === "video" || !!item.item?.video?.media;
    });

    let thumbnailCount = 0;
    let noThumbnailCount = 0;

    const results = videoOnlyDataset.map((item: any, index: number) => {
      const title = item.item?.note_card?.display_title || item.item?.title || `포스트 ${index + 1}`;
      const thumbnail = item.item?.video?.media?.cover || item.item?.note_card?.cover?.url_default;

      // Track thumbnail statistics
      if (thumbnail) {
        thumbnailCount++;
      } else {
        noThumbnailCount++;
      }

      return {
        id: item.item?.id || item.id || `xiaohongshu-${index}`,
        title: title,
        description: title,
        creator: item.item?.note_card?.user?.nickname || "Unknown",
        creatorUrl: item.item?.note_card?.user?.avatar || undefined,
        playCount: parseInt(item.item?.note_card?.interact_info?.play_count || 0),
        likeCount: parseInt(item.item?.note_card?.interact_info?.liked_count || 0),
        commentCount: parseInt(item.item?.note_card?.interact_info?.comment_count || 0),
        shareCount: parseInt(item.item?.note_card?.interact_info?.shared_count || 0),
        createTime: parseXiaohongshuTime(item.item?.note_card?.corner_tag_info),
        videoDuration: item.item?.video?.media?.duration || 0,
        hashtags: [],
        thumbnail: thumbnail,
        videoUrl: undefined,
        webVideoUrl: item.link || item.postUrl || item.url || undefined,
      };
    });

    const uniqueResults = Array.from(new Map(results.map((video: any) => [video.id, video])).values());

    console.log(`[Xiaohongshu Parallel] 🎬 Thumbnails: ${thumbnailCount}/${results.length} (${results.length > 0 ? ((thumbnailCount / results.length) * 100).toFixed(1) : 0}%)`);
    console.log(`[Xiaohongshu Parallel] ✅ 완료: ${uniqueResults.length}개`);
    return uniqueResults as VideoResult[];
  } catch (error) {
    console.error("[Xiaohongshu Parallel] 오류:", error);
    return [];
  }
}
