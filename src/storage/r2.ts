import dotenv from 'dotenv';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

dotenv.config();

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tiktok-videos-storage';
const PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || 'https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev';

/**
 * 파일 해시 생성 (중복 방지)
 */
function generateFileHash(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
}

/**
 * R2에 파일이 이미 존재하는지 확인 (재시도 로직 포함)
 */
async function fileExists(key: string, retries = 2): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await r2Client.send(new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }));
      return true;
    } catch (error: any) {
      if (attempt === retries) {
        return false;
      }
      // 지수 백오프 대기
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }
  return false;
}

/**
 * TikTok URL에서 파일 다운로드 후 R2에 업로드
 * @param tiktokUrl - TikTok CDN URL
 * @param type - 'thumbnail' | 'video'
 * @returns R2 public URL or undefined
 */
export async function uploadToR2(
  tiktokUrl: string,
  type: 'thumbnail' | 'video'
): Promise<string | undefined> {
  try {
    console.log(`[R2] Starting upload for ${type}...`);
    console.log(`[R2] Config: Bucket=${BUCKET_NAME}, Domain=${PUBLIC_DOMAIN}`);

    if (!tiktokUrl) {
      console.warn(`[R2] URL is empty for ${type}`);
      return undefined;
    }

    // 파일 경로 생성: {type}/{hash}.{ext}
    const hash = generateFileHash(tiktokUrl);
    const ext = type === 'thumbnail' ? 'jpg' : 'mp4';
    const key = `${type}s/${hash}.${ext}`;

    // 이미 존재하면 기존 URL 반환
    if (await fileExists(key)) {
      console.log(`[R2] File already exists: ${key}`);
      return `${PUBLIC_DOMAIN}/${key}`;
    }

    // TikTok CDN에서 다운로드 (플랫폼별 헤더)
    console.log(`[R2] Downloading from TikTok...`);

    // 플랫폼별 헤더 생성
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // URL 기반으로 플랫폼별 Referer 설정
    if (tiktokUrl.includes('douyinpic.com') || tiktokUrl.includes('douyin.com')) {
      headers['Referer'] = 'https://www.douyin.com/';
      headers['Origin'] = 'https://www.douyin.com';
      console.log(`[R2] Platform detected: Douyin`);
    } else if (tiktokUrl.includes('xiaohongshu') || tiktokUrl.includes('xhscdn')) {
      headers['Referer'] = 'https://www.xiaohongshu.com/';
      headers['Origin'] = 'https://www.xiaohongshu.com';
      console.log(`[R2] Platform detected: Xiaohongshu`);
    } else {
      headers['Referer'] = 'https://www.tiktok.com/';
      headers['Origin'] = 'https://www.tiktok.com';
      console.log(`[R2] Platform detected: TikTok`);
    }

    // 이미지 타입일 경우 Accept 헤더 추가
    if (type === 'thumbnail') {
      headers['Accept'] = 'image/webp,image/apng,image/avif,image/*,*/*;q=0.8';
    }

    // 30초 타임아웃
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response = await fetch(tiktokUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    // CDN URL은 시간 제한 파라미터로 인해 만료될 수 있음 → 재시도 (파라미터 제거)
    if (!response.ok && tiktokUrl.includes('?')) {
      const isCDN = tiktokUrl.includes('tiktokcdn') || tiktokUrl.includes('douyinpic') || tiktokUrl.includes('xhscdn');

      if (isCDN) {
        console.warn(`[R2] ⚠️ CDN download failed (${response.status}), retrying without query params...`);

        // URL에서 query string 제거 후 재시도
        const baseUrl = tiktokUrl.split('?')[0];
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), 30000);

        try {
          response = await fetch(baseUrl, { headers, signal: retryController.signal });
          clearTimeout(retryTimeout);

          if (response.ok) {
            console.log(`[R2] ✅ Retry successful with base URL`);
          }
        } catch (retryError) {
          console.error(`[R2] ⚠️ Retry also failed:`, retryError instanceof Error ? retryError.message : retryError);
          clearTimeout(retryTimeout);
        }
      }
    }

    if (!response.ok) {
      console.error(`[R2] ❌ Failed to download from TikTok: ${response.status}`);
      console.error(`[R2] URL: ${tiktokUrl.substring(0, 100)}...`);
      return undefined;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = type === 'thumbnail' ? 'image/jpeg' : 'video/mp4';
    console.log(`[R2] Downloaded: ${(buffer.length / 1024).toFixed(1)}KB`);

    // R2에 업로드 (재시도 로직)
    console.log(`[R2] Uploading to R2: ${key}...`);
    let uploadSuccess = false;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await r2Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000', // 1년 캐싱
        }));
        uploadSuccess = true;
        console.log(`[R2] ✅ Upload successful on attempt ${attempt + 1}`);
        break;
      } catch (error: any) {
        lastError = error;
        console.warn(`[R2] ⚠️ Upload attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : String(error));

        if (attempt === 2) {
          // 마지막 시도 실패
          console.error(`[R2] ❌ All 3 upload attempts failed for ${key}`);
          console.error(`[R2] Last error:`, error instanceof Error ? error.message : String(error));
          throw error;
        }

        // 지수 백오프 대기
        const waitTime = Math.pow(2, attempt) * 500;
        console.log(`[R2] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    if (!uploadSuccess) {
      console.error(`[R2] ❌ Upload failed after 3 attempts`);
      return undefined;
    }

    const publicUrl = `${PUBLIC_DOMAIN}/${key}`;
    console.log(`[R2] ✅ Uploaded ${type}: ${key} (${(buffer.length / 1024).toFixed(1)}KB)`);
    return publicUrl;
  } catch (error) {
    console.error(`[R2] ❌ Upload failed for ${type}:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

/**
 * 썸네일과 비디오를 병렬로 업로드
 */
export async function uploadMediaToR2(
  thumbnailUrl?: string,
  videoUrl?: string
): Promise<{ thumbnail?: string; video?: string }> {
  const [thumbnail, video] = await Promise.all([
    thumbnailUrl ? uploadToR2(thumbnailUrl, 'thumbnail') : Promise.resolve(undefined),
    videoUrl ? uploadToR2(videoUrl, 'video') : Promise.resolve(undefined),
  ]);

  // 업로드 결과 로깅
  const hasThumb = !!thumbnail;
  const hasVideo = !!video;

  console.log(`[R2] 📊 Upload results: Thumbnail=${hasThumb ? '✅' : '❌'}, Video=${hasVideo ? '✅' : '❌'}`);

  if (!thumbnail && thumbnailUrl) {
    console.warn(`[R2] ⚠️ Thumbnail upload failed, will fallback to CDN URL`);
  }
  if (!video && videoUrl) {
    console.warn(`[R2] ⚠️ Video upload failed, will fallback to original URL`);
  }

  return { thumbnail, video };
}

/**
 * R2에서 파일 삭제
 */
export async function deleteFromR2(r2Url: string): Promise<boolean> {
  try {
    // URL에서 key 추출
    // 예: "https://pub-xxx.r2.dev/thumbnails/abc123.jpg" → "thumbnails/abc123.jpg"
    const url = new URL(r2Url);
    const key = url.pathname.substring(1); // 앞의 '/' 제거

    await r2Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));

    console.log(`[R2] ✅ Deleted: ${key}`);
    return true;
  } catch (error) {
    console.error(`[R2] Delete failed:`, error);
    return false;
  }
}

/**
 * 여러 파일 일괄 삭제 (최대 1000개)
 */
export async function deleteMultipleFromR2(r2Urls: string[]): Promise<number> {
  try {
    const keys = r2Urls
      .map(url => {
        try {
          const u = new URL(url);
          return u.pathname.substring(1);
        } catch {
          return null;
        }
      })
      .filter(k => k !== null);

    if (keys.length === 0) return 0;

    await r2Client.send(new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: keys.map(key => ({ Key: key! })),
        Quiet: true,
      },
    }));

    console.log(`[R2] ✅ Deleted ${keys.length} files`);
    return keys.length;
  } catch (error) {
    console.error(`[R2] Batch delete failed:`, error);
    return 0;
  }
}
