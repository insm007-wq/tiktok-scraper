/**
 * Apify Actor 실행 유틸리티
 * - Run → Polling (지수 백오프) → Dataset 패턴 추상화
 * - 재사용 가능한 함수로 제공
 */

export interface ApifyRunOptions {
  actorId: string;                    // 예: "apilabs~tiktok-downloader"
  input: Record<string, any>;         // Actor 입력 파라미터
  apiKey: string;                     // APIFY_API_KEY
  maxAttempts?: number;               // 최대 폴링 시도 (기본: 60)
  initialWaitTime?: number;           // 초기 대기 시간 ms (기본: 500)
  maxWaitTime?: number;               // 최대 대기 시간 ms (기본: 5000)
}

export interface ApifyRunResult<T = any> {
  success: boolean;
  data?: T[];                         // Dataset 항목 배열
  error?: string;                     // 에러 메시지
  runId?: string;                     // Actor Run ID
}

/**
 * Apify Actor 실행 및 결과 조회
 * @param options Actor 실행 옵션
 * @returns 실행 결과 (성공/실패 여부 및 데이터)
 */
export async function runApifyActor<T = any>(
  options: ApifyRunOptions
): Promise<ApifyRunResult<T>> {
  const {
    actorId,
    input,
    apiKey,
    maxAttempts = 60,
    initialWaitTime = 500,
    maxWaitTime = 5000,
  } = options;

  try {
    // Step 1: Actor Run 시작
    console.log(`[Apify] Starting actor: ${actorId}`);

    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }
    );

    if (!runRes.ok) {
      const errorData = await runRes.json();
      console.error('[Apify] Run creation failed:', errorData);
      return {
        success: false,
        error: `Failed to start actor: ${runRes.statusText}`,
      };
    }

    const runData = await runRes.json();
    const runId = runData.data.id;

    console.log(`[Apify] Run created: ${runId}`);

    // Step 2: 폴링 (지수 백오프)
    let status = 'RUNNING';
    let attempt = 0;
    let waitTime = initialWaitTime;

    while ((status === 'RUNNING' || status === 'READY') && attempt < maxAttempts) {
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
      );

      if (!statusRes.ok) {
        console.error('[Apify] Status check failed:', statusRes.status);
        return {
          success: false,
          error: 'Failed to check actor status',
          runId,
        };
      }

      const statusData = await statusRes.json();
      status = statusData.data.status;
      attempt++;

      console.log(
        `[Apify] Status check #${attempt}: ${status} (waited ${waitTime}ms)`
      );

      // 성공
      if (status === 'SUCCEEDED') {
        console.log(`[Apify] Actor completed successfully`);
        break;
      }

      // 실패
      if (status === 'FAILED' || status === 'ABORTED') {
        const message = statusData.data.statusMessage || 'Unknown error';
        console.error(`[Apify] Actor failed: ${message}`);
        return {
          success: false,
          error: `Actor execution failed: ${message}`,
          runId,
        };
      }

      // 계속 진행 중 → 대기 후 재확인
      if (status === 'RUNNING' || status === 'READY') {
        await new Promise((r) => setTimeout(r, waitTime));
        // 지수 백오프: 0.5s → 1s → 2s → 4s → 5s (최대)
        waitTime = Math.min(waitTime * 2, maxWaitTime);
      }
    }

    // 타임아웃 확인
    if (status !== 'SUCCEEDED') {
      console.error(
        `[Apify] Actor timeout (status: ${status}, attempts: ${attempt})`
      );
      return {
        success: false,
        error: `Actor execution timeout (current status: ${status})`,
        runId,
      };
    }

    // Step 3: Dataset 조회
    console.log(`[Apify] Fetching dataset for run: ${runId}`);

    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
    );

    if (!datasetRes.ok) {
      console.error('[Apify] Dataset fetch failed:', datasetRes.status);
      return {
        success: false,
        error: 'Failed to fetch dataset',
        runId,
      };
    }

    const dataset = await datasetRes.json();

    if (!Array.isArray(dataset)) {
      console.error('[Apify] Unexpected response format:', typeof dataset);
      return {
        success: false,
        error: 'Unexpected response format from Apify',
        runId,
      };
    }

    console.log(`[Apify] Successfully retrieved ${dataset.length} items`);

    return {
      success: true,
      data: dataset as T[],
      runId,
    };
  } catch (error) {
    console.error('[Apify] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
