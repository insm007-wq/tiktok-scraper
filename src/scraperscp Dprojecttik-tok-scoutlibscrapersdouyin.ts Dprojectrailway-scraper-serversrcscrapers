import { VideoResult } from '@/types/video';

/**
 * TikTok 영상 검색 (Api Dojo TikTok Scraper)
 * ⭐ 최고 평점 (4.8/5), 가장 정확하고 빠름
 */
export async function searchTikTokVideos(
  query: string,
  limit: number,
  apiKey: string,
  dateRange?: string
): Promise<VideoResult[]> {
  try {
    const actorId = 'apidojo~tiktok-scraper';
    const startTime = Date.now();
    console.log(`[TikTok] 검색 시작: ${query} (제한: ${limit}, 기간: ${dateRange || 'all'})`);

    // 날짜 범위 매핑
    const mapDateRange = (uploadPeriod?: string): string => {
      const mapping: Record<string, string> = {
        'all': 'DEFAULT',
        'yesterday': 'YESTERDAY',
        '7days': 'THIS_WEEK',
        '1month': 'THIS_MONTH',
        '3months': 'LAST_THREE_MONTHS',
      };
      return mapping[uploadPeriod || 'all'] || 'DEFAULT';
    };

    // 1️⃣ Run 시작
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: [query],
          maxItems: 50,
          sortType: 'RELEVANCE',
          location: 'US',
          dateRange: mapDateRange(dateRange),
          includeSearchKeywords: false,
          startUrls: [],
        }),
      }
    );

    const runData = await runRes.json();
    if (!runRes.ok) {
      console.error('[TikTok] Run 시작 실패:', runData);
      return [];
    }

    const runId = runData.data.id;
    console.log(`[TikTok] Run ID: ${runId}`);

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
        console.error('[TikTok] Run 실패:', statusData.data.statusMessage);
        return [];
      }

      if (status === 'RUNNING' || status === 'READY') {
        await new Promise(r => setTimeout(r, waitTime));
        waitTime = Math.min(waitTime * 2, maxWaitTime);
      }
    }

    if (status !== 'SUCCEEDED') {
      console.warn(`[TikTok] 타임아웃 (상태: ${status})`);
      return [];
    }

    // 3️⃣ 결과 조회
    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
    );

    const dataset = await datasetRes.json();
    if (!Array.isArray(dataset) || dataset.length === 0) {
      console.log('[TikTok] 검색 결과 없음');
      return [];
    }

    // 결과 변환
    const results = dataset.slice(0, Math.min(limit, 50)).map((item: any, index: number) => {
      const hashtags = Array.isArray(item.hashtags)
        ? item.hashtags
            .filter((h: any) => h !== null && h !== undefined)
            .map((h: any) => typeof h === 'string' ? h : (h && h.name ? h.name : h))
        : [];

      const videoUrl = item.video?.url || item.downloadUrl || item.videoUrl || undefined;
      const webVideoUrl = item.postPage ||
                         (item.channel?.url && item.id ? `${item.channel.url}/video/${item.id}` : undefined) ||
                         undefined;

      return {
        id: item.id || `video-${index}`,
        title: item.title || `영상 ${index + 1}`,
        description: item.title || '',
        creator: item.channel?.name || item.channel?.username || 'Unknown',
        creatorUrl: item.channel?.url || undefined,
        followerCount: item.channel?.followers ? parseInt(String(item.channel.followers)) : undefined,
        playCount: parseInt(String(item.views || 0)),
        likeCount: parseInt(String(item.likes || 0)),
        commentCount: parseInt(String(item.comments || 0)),
        shareCount: parseInt(String(item.shares || 0)),
        createTime: item.uploadedAt ? parseInt(String(item.uploadedAt)) * 1000 : Date.now(),
        videoDuration: item.video?.duration ? parseInt(String(item.video.duration)) : 0,
        hashtags: hashtags,
        thumbnail: item.video?.thumbnail || item.video?.cover || undefined,
        videoUrl: videoUrl,
        webVideoUrl: webVideoUrl,
      };
    });

    const duration = Date.now() - startTime;
    console.log(`[TikTok] ✅ 완료: ${results.length}개 (${(duration / 1000).toFixed(2)}초)`);

    return results;
  } catch (error) {
    console.error('[TikTok] 오류:', error);
    return [];
  }
}
