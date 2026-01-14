/**
 * Apify Actor 실행 유틸리티
 * - Run → Polling (지수 백오프) → Dataset 패턴 추상화
 */

export interface ApifyRunOptions {
  actorId: string;
  input: Record<string, any>;
  apiKey: string;
  maxAttempts?: number;
  initialWaitTime?: number;
  maxWaitTime?: number;
}

export interface ApifyRunResult<T = any> {
  success: boolean;
  data?: T[];
  error?: string;
  runId?: string;
}

/**
 * Apify Actor 실행 및 결과 조회
 */
export async function runApifyActor<T = any>(options: ApifyRunOptions): Promise<ApifyRunResult<T>> {
  const { actorId, input, apiKey, maxAttempts = 60, initialWaitTime = 500, maxWaitTime = 5000 } = options;

  try {
    // Step 1: Actor Run 시작
    console.log(`[Apify] Starting actor: ${actorId}`);

    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    // ✨ [수정] as any 추가
    const runData = (await runRes.json()) as any;

    if (!runRes.ok) {
      console.error("[Apify] Run creation failed:", runData);
      return {
        success: false,
        error: `Failed to start actor: ${runRes.statusText}`,
      };
    }

    const runId = runData.data.id;
    console.log(`[Apify] Run created: ${runId}`);

    // Step 2: 폴링 (지수 백오프)
    let status = "RUNNING";
    let attempt = 0;
    let waitTime = initialWaitTime;

    while ((status === "RUNNING" || status === "READY") && attempt < maxAttempts) {
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);

      // ✨ [수정] as any 추가
      const statusData = (await statusRes.json()) as any;

      if (!statusRes.ok) {
        console.error("[Apify] Status check failed:", statusRes.status);
        return {
          success: false,
          error: "Failed to check actor status",
          runId,
        };
      }

      status = statusData.data.status;
      attempt++;

      console.log(`[Apify] Status check #${attempt}: ${status} (waited ${waitTime}ms)`);

      // 성공
      if (status === "SUCCEEDED") {
        console.log(`[Apify] Actor completed successfully`);
        break;
      }

      // 실패
      if (status === "FAILED" || status === "ABORTED") {
        const message = statusData.data.statusMessage || "Unknown error";
        console.error(`[Apify] Actor failed: ${message}`);
        return {
          success: false,
          error: `Actor execution failed: ${message}`,
          runId,
        };
      }

      // 계속 진행 중
      if (status === "RUNNING" || status === "READY") {
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime = Math.min(waitTime * 2, maxWaitTime);
      }
    }

    // 타임아웃
    if (status !== "SUCCEEDED") {
      console.error(`[Apify] Actor timeout (status: ${status}, attempts: ${attempt})`);
      return {
        success: false,
        error: `Actor execution timeout (current status: ${status})`,
        runId,
      };
    }

    // Step 3: Dataset 조회
    console.log(`[Apify] Fetching dataset for run: ${runId}`);

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`);

    // ✨ [수정] as any 추가
    const dataset = (await datasetRes.json()) as any;

    if (!Array.isArray(dataset)) {
      console.error("[Apify] Unexpected response format:", typeof dataset);
      return {
        success: false,
        error: "Unexpected response format from Apify",
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
    console.error("[Apify] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
