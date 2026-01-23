# R2 썸네일 로딩 실패 문제 해결 가이드

## 🎯 문제 요약

- **현상**: 프론트엔드에서 동영상 썸네일이 표시되지 않음
- **원인**: API가 반환하는 CDN URL이 만료되었거나, R2 버킷에 공개 액세스가설정되지 않음
- **상태**: 현재 데이터베이스에 있는 대부분의 썸네일이 TikTok CDN URL (tiktokcdn-us.com)

---

## 📋 해결 단계

### Phase 1: 백엔드 R2 설정

#### Step 1-1: R2 CORS 및 공개 액세스 설정

1. **CORS 설정 (자동화)**:
   ```bash
   npm run setup:r2
   ```

   이 명령어는:
   - R2 버킷 CORS 정책 설정
   - 모든 GET 요청에 대해 CORS 허용
   - 1시간 캐싱 정책 설정

2. **Public Access 설정 (수동 - Cloudflare 대시보드)**:
   - https://dash.cloudflare.com/ 접속
   - R2 → tiktok-videos-storage 선택
   - Settings 탭 클릭
   - "Public Access" 섹션에서 "Allow Access" 클릭
   - Public URL 확인: `https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev`

#### Step 1-2: 기존 CDN 썸네일을 R2로 마이그레이션

데이터베이스에 있는 기존 CDN URL 썸네일을 R2로 업로드:

```bash
npm run migrate:thumbnails
```

**동작 원리**:
- 데이터베이스의 모든 video_cache 문서 스캔
- R2 URL이 아닌 썸네일만 추출
- 각 썸네일을 TikTok CDN에서 다운로드
- R2에 업로드
- 데이터베이스의 thumbnail URL을 R2 URL로 업데이트

**예상 결과**:
```
📦 Thumbnail Migration to R2

📊 Found 12 cache documents with non-R2 thumbnails

🔄 Processing: tiktok:공부
  ⬆️  Uploading thumbnail for 7501985038154878230...
  ✅ Completed in 2.3s

📊 Migration Summary:
   ✅ Migrated: 45
   ❌ Failed: 2
   ⏭️  Skipped: 3
   📈 Total: 50

✅ Migration Complete!
```

#### Step 1-3: API 확인

마이그레이션 완료 후 API 응답 확인:

```bash
curl -s "http://localhost:6000/api/videos?platform=tiktok&limit=1" | grep -o '"thumbnail":"[^"]*"' | head -1
```

**예상 결과**:
```
"thumbnail":"https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev/thumbnails/abc123def456.jpg"
```

---

### Phase 2: 프론트엔드 수정

프론트엔드가 분리된 프로젝트인 경우, 다음과 같이 수정해야 합니다:

#### Option A: React 함수형 컴포넌트

```tsx
<img
  src={video.thumbnail}
  alt={video.title}
  className="card-thumbnail"
  loading="lazy"
  crossOrigin="anonymous"
  onError={(e) => {
    (e.target as HTMLImageElement).src = '/placeholder.png';
  }}
/>
```

#### Option B: Next.js Image 컴포넌트

```tsx
import Image from 'next/image';

<Image
  src={video.thumbnail || '/placeholder.png'}
  alt={video.title}
  width={500}
  height={800}
  className="card-thumbnail"
  crossOrigin="anonymous"
  onError={() => {
    // Fallback handling
  }}
/>
```

#### Option C: Vue/Other Framework

```html
<img
  :src="video.thumbnail"
  :alt="video.title"
  class="card-thumbnail"
  loading="lazy"
  crossorigin="anonymous"
  @error="handleImageError"
/>
```

**중요**: `crossOrigin="anonymous"` 속성은 CORS 요청 시 필수입니다.

---

### Phase 3: 새로운 영상 스크래핑

새로 스크래핑하는 모든 영상은 자동으로 R2 URL을 가지게 됩니다:

```bash
curl -X POST "http://localhost:6000/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "platform":"tiktok",
    "query":"공부",
    "limit":10
  }'
```

**스크래핑 로그**:
```
[TikTok] 🎬 Thumbnails: 9/10 (90%) | ⚠️ Missing: 1
[R2] ✅ Uploaded thumbnail: thumbnails/xyz789.jpg (45.2KB)
[R2] ✅ Uploaded thumbnail: thumbnails/abc123.jpg (38.1KB)
```

---

## ✅ 검증 체크리스트

### R2 설정 확인
- [ ] `npm run setup:r2` 실행 완료
- [ ] Cloudflare 대시보드에서 Public Access 활성화
- [ ] 브라우저에서 R2 URL 직접 접근 가능 (200 OK)

### 데이터 마이그레이션
- [ ] `npm run migrate:thumbnails` 실행 완료
- [ ] 데이터베이스 업데이트 확인
- [ ] API 응답에서 R2 URL 확인

### 프론트엔드 수정
- [ ] `crossOrigin="anonymous"` 속성 추가
- [ ] 이미지 로드 실패 시 placeholder 표시
- [ ] 브라우저 콘솔에서 CORS 에러 없음 확인

### 전체 테스트
- [ ] 프론트엔드에서 검색 실행
- [ ] 썸네일 정상 표시 확인
- [ ] 브라우저 개발자 도구 Console 확인 (에러 없음)
- [ ] 네트워크 탭에서 R2 URL 요청 확인 (200 상태)

---

## 🔍 트러블슈팅

### 상황 1: R2 URL이 여전히 403 Forbidden 반환

**해결책**:
1. Cloudflare 대시보드에서 Public Access 설정 다시 확인
2. 혹은 R2 버킷 권한 설정:
   ```bash
   # 버킷 정책 확인
   aws s3api get-bucket-public-access-block --bucket tiktok-videos-storage --endpoint-url https://3c8ba7646687b6f7ffe269e42b6ab778.r2.cloudflarestorage.com
   ```

### 상황 2: CORS 에러 "Access-Control-Allow-Origin"

**해결책**:
1. `npm run setup:r2` 다시 실행
2. 혹은 수동 설정:
   - Cloudflare 대시보드 → R2 → Settings
   - CORS 정책에 다음 추가:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### 상황 3: 마이그레이션 실패

**해결책**:
1. TikTok CDN이 다운되었을 수 있음 → 다시 시도
   ```bash
   npm run migrate:thumbnails
   ```

2. 특정 썸네일만 재업로드하려면, 수동으로 업로드:
   ```typescript
   const { uploadToR2 } = require('./src/storage/r2');
   await uploadToR2('https://tiktokcdn-url...', 'thumbnail');
   ```

### 상황 4: 이미지가 로드되어도 표시되지 않음

**확인사항**:
1. 브라우저 콘솔에서 에러 확인
2. 네트워크 탭에서 R2 URL 요청 상태 확인
3. 이미지 해상도/크기 확인 (너무 작지 않은지)
4. CSS `max-width` 또는 `width` 설정 확인

---

## 📊 현재 상태 모니터링

API 엔드포인트로 현재 상태를 모니터링할 수 있습니다:

### 캐시 통계 조회
```bash
curl "http://localhost:6000/api/videos/stats"
```

**응답 예**:
```json
{
  "success": true,
  "stats": {
    "totalDocuments": 5,
    "platformCounts": {
      "tiktok": 3,
      "douyin": 2
    },
    "totalUniqueVideos": 127,
    "lastUpdate": "2026-01-23T12:34:56.789Z"
  }
}
```

### 특정 플랫폼의 모든 캐시 조회
```bash
curl "http://localhost:6000/api/videos/platform/tiktok?limit=10&skip=0"
```

---

## 🚀 배포 전 체크리스트

- [ ] 모든 R2 설정 완료
- [ ] 데이터베이스 마이그레이션 완료
- [ ] 프론트엔드 수정 (crossOrigin 추가)
- [ ] 로컬 테스트 완료 (썸네일 로드 확인)
- [ ] 프로덕션 환경 R2 설정 확인
- [ ] 프로덕션 환경 마이그레이션 실행
- [ ] 프로덕션 환경 프론트엔드 배포

---

## 📚 참고 자료

- [AWS SDK S3 클라이언트 설정](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)\n- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [CORS Policy MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Troubleshooting R2 Issues](https://community.cloudflare.com/c/r2/)

---

## 🆘 추가 도움

문제가 발생하면:

1. **백엔드 로그 확인**:
   ```bash
   # 개발 서버 로그에서 [R2] 태그 검색
   npm run dev
   ```

2. **API 응답 확인**:
   ```bash
   curl "http://localhost:6000/api/videos?platform=tiktok&limit=5" | jq '.videos[0].thumbnail'
   ```

3. **R2 직접 접근 테스트**:
   ```bash
   # 브라우저에서 다음 URL 접속
   https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev/thumbnails/[filename].jpg
   ```

---

**마지막 수정**: 2026-01-23
