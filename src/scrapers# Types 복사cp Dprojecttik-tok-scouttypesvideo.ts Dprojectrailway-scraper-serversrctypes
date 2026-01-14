import { VideoResult } from '@/types/video';
import { parseXiaohongshuTime } from '@/lib/utils/xiaohongshuTimeParser';

/**
 * Xiaohongshu(小红书) 영상 검색 (easyapi Search Scraper)
 * ⚠️ 현재 액터가 Selector Timeout 이슈 발생 중
 * 액터 복구 후 자동으로 작동
 */
export async function searchXiaohongshuVideos(
  query: string,
  limit: number,
  apiKey: string,
  dateRange?: string
): Promise<VideoResult[]> {
  try {
    const actorId = 'easyapi~rednote-xiaohongshu-search-scraper';
    const startTime = Date.now();
    console.log(`[Xiaohongshu] 검색 시작: ${query} (제한: ${limit})`);

    // Note: Search Scraper는 날짜 필터 미지원
    const inputParams = {
      keywords: [query],
      maxItems: Math.min(limit, 100),
    };

    // 1️⃣ Run 시작
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputParams),
      }
    );

    const runData = await runRes.json();
    if (!runRes.ok) {
      console.error('[Xiaohongshu] Run 시작 실패:', runData);
      return [];
    }

    const runId = runData.data.id;
    console.log(`[Xiaohongshu] Run ID: ${runId}`);

    // 2️⃣ 완료 대기 (Polling)
    let status = 'RUNNING';
    let attempt = 0;
    const maxAttempts = 60;
    let waitTime = 500;
    const maxWaitTime = 5000;

    while ((status === 'RUNNING' || status === 'READY') && attempt < maxAttempts) {
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
      );

      const statusData = await statusRes.json();
      status = statusData.data.status;
      attempt++;

      if (status === 'SUCCEEDED') break;
      if (status === 'FAILED' || status === 'ABORTED') {
        console.error('[Xiaohongshu] Run 실패:', statusData.data.statusMessage);
        return [];
      }

      if (status === 'RUNNING' || status === 'READY') {
        await new Promise(r => setTimeout(r, waitTime));
        waitTime = Math.min(waitTime * 1.5, maxWaitTime);
      }
    }

    if (status !== 'SUCCEEDED') {
      console.error(`[Xiaohongshu] 타임아웃 (상태: ${status})`);
      return [];
    }

    // 3️⃣ 결과 조회
    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
    );

    if (!datasetRes.ok) {
      console.error('[Xiaohongshu] Dataset 조회 실패:', datasetRes.status);
      return [];
    }

    const dataset = await datasetRes.json();
    if (!Array.isArray(dataset) || dataset.length === 0) {
      console.log('[Xiaohongshu] 검색 결과 없음');
      return [];
    }

    // 결과 변환 - 비디오만 필터링
    const results = dataset
      .filter((item: any) => {
        // 비디오 포스트만 포함
        return (
          item.item?.note_card?.type === "video" ||
          item.item?.type === "video" ||
          !!item.item?.video?.media
        );
      })
      .slice(0, limit)
      .map((item: any, index: number) => {
        const title =
          item.item?.note_card?.display_title ||
          item.item?.title ||
          item.title ||
          item.desc ||
          item.description ||
          `포스트 ${index + 1}`;

        const creator =
          item.item?.note_card?.user?.nickname ||
          item.item?.note_card?.user?.nick_name ||
          item.author ||
          item.creator ||
          'Unknown';

        const likeCount = parseInt(
          item.item?.note_card?.interact_info?.liked_count ||
          item.likes ||
          item.like_count ||
          0
        );

        const playCount = parseInt(
          item.item?.note_card?.interact_info?.play_count ||
          item.views ||
          item.view_count ||
          likeCount ||
          0
        );

        const commentCount = parseInt(
          item.item?.note_card?.interact_info?.comment_count ||
          item.comments ||
          item.comment_count ||
          0
        );

        const shareCount = parseInt(
          item.item?.note_card?.interact_info?.shared_count ||
          item.shares ||
          item.share_count ||
          0
        );

        const thumbnail =
          item.item?.video?.media?.cover ||
          item.item?.note_card?.cover?.url_default;

        return {
          id: item.item?.id || item.id || `xiaohongshu-${index}`,
          title: title,
          description: title,
          creator: creator,
          creatorUrl: item.item?.note_card?.user?.avatar || undefined,
          followerCount: undefined,
          playCount: playCount,
          likeCount: likeCount,
          commentCount: commentCount,
          shareCount: shareCount,
          createTime: parseXiaohongshuTime(item.item?.note_card?.corner_tag_info),
          videoDuration:
            item.item?.video?.media?.duration ||
            item.item?.note_card?.video?.media?.duration ||
            0,
          hashtags: [],
          thumbnail: thumbnail,
          videoUrl: undefined,
          webVideoUrl: item.link || item.postUrl || item.url || undefined,
        };
      });

    const duration = Date.now() - startTime;
    console.log(`[Xiaohongshu] ✅ 완료: ${results.length}개 (${(duration / 1000).toFixed(2)}초)`);

    return results;
  } catch (error) {
    console.error('[Xiaohongshu] 오류:', error);
    return [];
  }
}

/**
 * Xiaohongshu 병렬 검색 (3개 정렬 방식)
 * Douyin과 동일한 패턴으로 더 많은 결과 확보
 */
export async function searchXiaohongshuVideosParallel(
  query: string,
  limit: number,
  apiKey: string,
  dateRange?: string
): Promise<VideoResult[]> {
  try {
    const actorId = 'easyapi~rednote-xiaohongshu-search-scraper';
    const startTime = Date.now();

    // 🔑 3가지 정렬 옵션으로 다양한 결과 확보
    const sortTypes = ['general', 'latest', 'hotest'];

    console.log(`[Xiaohongshu Parallel] 3개 Run 병렬 시작: ${query} (제한: ${limit})`);

    // 1️⃣ 3개 Run 동시 시작 (각각 다른 정렬)
    const runPromises = sortTypes.map(async (sortType) => {
      const inputParams = {
        keywords: [query],
        sortType,  // 🔑 각 Run마다 다른 정렬
        noteType: 'video',  // 🔑 비디오만 필터링 (API 레벨)
        maxItems: 20,  // 각 Run당 20개 (3 × 20 = 60개)
      };

      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inputParams),
        }
      );

      const runData = await runRes.json();
      if (!runRes.ok) {
        console.error(`[Xiaohongshu Parallel ${sortType}] Run 시작 실패:`, runData);
        return { runId: null, sortType };
      }

      console.log(`[Xiaohongshu Parallel] Run 시작: ${sortType}, ID: ${runData.data.id}`);
      return { runId: runData.data.id, sortType };
    });

    const runs = await Promise.all(runPromises);
    const validRuns = runs.filter(r => r.runId !== null);

    if (validRuns.length === 0) {
      console.error('[Xiaohongshu Parallel] 모든 Run 시작 실패');
      return [];
    }

    // 2️⃣ 모든 Run 병렬 폴링
    const datasetPromises = validRuns.map(async ({ runId, sortType }) => {
      let status = 'RUNNING';
      let attempt = 0;
      const maxAttempts = 60;
      let waitTime = 500;
      const maxWaitTime = 5000;

      while ((status === 'RUNNING' || status === 'READY') && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, waitTime));

        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
        );
        const statusData = await statusRes.json();
        status = statusData.data.status;

        if (status === 'SUCCEEDED') break;
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          console.error(`[Xiaohongshu Parallel ${sortType}] Run 실패: ${status}`);
          return [];
        }

        attempt++;
        waitTime = Math.min(waitTime * 1.2, maxWaitTime);
      }

      if (status !== 'SUCCEEDED') {
        console.error(`[Xiaohongshu Parallel ${sortType}] Timeout`);
        return [];
      }

      // 3️⃣ Dataset 조회
      const datasetRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
      );

      if (!datasetRes.ok) {
        console.error(`[Xiaohongshu Parallel ${sortType}] Dataset 조회 실패`);
        return [];
      }

      const dataset = await datasetRes.json();
      console.log(`[Xiaohongshu Parallel ${sortType}] ✅ ${dataset.length}개 결과`);
      return dataset;
    });

    const allDatasets = await Promise.all(datasetPromises);
    const combinedDataset = allDatasets.flat();

    if (combinedDataset.length === 0) {
      console.log('[Xiaohongshu Parallel] 검색 결과 없음');
      return [];
    }

    // 4️⃣ 클라이언트 사이드 필터링 - 이미지 전용 포스트 제거
    const videoOnlyDataset = combinedDataset.filter((item: any) => {
      // 비디오 포스트 확인 (구 버전 함수의 필터링 로직과 동일)
      return (
        item.item?.note_card?.type === "video" ||
        item.item?.type === "video" ||
        !!item.item?.video?.media
      );
    });

    // 필터링 통계 로그
    console.log(`[Xiaohongshu Parallel] 필터링: ${combinedDataset.length}개 → ${videoOnlyDataset.length}개 비디오`);
    if (combinedDataset.length > videoOnlyDataset.length) {
      const filtered = combinedDataset.length - videoOnlyDataset.length;
      console.log(`[Xiaohongshu Parallel] ⚠️ ${filtered}개 이미지 포스트 제거됨`);
    }

    if (videoOnlyDataset.length === 0) {
      console.log('[Xiaohongshu Parallel] 필터링 후 비디오 결과 없음');
      return [];
    }

    // 5️⃣ 결과 변환 (API에서 noteType: 'video'로 이미 필터링됨)
    // ✅ 50개 이상의 결과도 모두 반환
    const results = videoOnlyDataset.map((item: any, index: number) => {
      const title =
        item.item?.note_card?.display_title ||
        item.item?.title ||
        item.title ||
        item.desc ||
        item.description ||
        `포스트 ${index + 1}`;

      const creator =
        item.item?.note_card?.user?.nickname ||
        item.item?.note_card?.user?.nick_name ||
        item.author ||
        item.creator ||
        'Unknown';

      const likeCount = parseInt(
        item.item?.note_card?.interact_info?.liked_count ||
        item.likes ||
        item.like_count ||
        0
      );

      const playCount = parseInt(
        item.item?.note_card?.interact_info?.play_count ||
        item.views ||
        item.view_count ||
        likeCount ||
        0
      );

      const commentCount = parseInt(
        item.item?.note_card?.interact_info?.comment_count ||
        item.comments ||
        item.comment_count ||
        0
      );

      const shareCount = parseInt(
        item.item?.note_card?.interact_info?.shared_count ||
        item.shares ||
        item.share_count ||
        0
      );

      const thumbnail =
        item.item?.video?.media?.cover ||
        item.item?.note_card?.cover?.url_default;

      return {
        id: item.item?.id || item.id || `xiaohongshu-${index}`,
        title: title,
        description: title,
        creator: creator,
        creatorUrl: item.item?.note_card?.user?.avatar || undefined,
        followerCount: undefined,
        playCount: playCount,
        likeCount: likeCount,
        commentCount: commentCount,
        shareCount: shareCount,
        createTime: parseXiaohongshuTime(item.item?.note_card?.corner_tag_info),
        videoDuration:
          item.item?.video?.media?.duration ||
          item.item?.note_card?.video?.media?.duration ||
          0,
        hashtags: [],
        thumbnail: thumbnail,
        videoUrl: undefined,
        webVideoUrl: item.link || item.postUrl || item.url || undefined,
      };
    });

    // 6️⃣ 중복 제거 (ID 기준)
    const uniqueResults = Array.from(
      new Map(results.map((video) => [video.id, video])).values()
    );

    const duration = Date.now() - startTime;
    console.log(`[Xiaohongshu Parallel] ✅ 완료: ${uniqueResults.length}개 (${(duration / 1000).toFixed(2)}초)`);

    return uniqueResults;
  } catch (error) {
    console.error('[Xiaohongshu Parallel] 오류:', error);
    return [];
  }
}
