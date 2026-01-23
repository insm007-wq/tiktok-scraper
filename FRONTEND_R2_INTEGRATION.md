# 프론트엔드 R2 통합 가이드

> 이 문서는 프론트엔드에서 R2 URL 썸네일을 올바르게 로드하는 방법을 설명합니다.

## 🎯 핵심 변경사항

**모든 썸네일 이미지에 `crossOrigin="anonymous"` 속성 추가**

이것은 CORS 정책에 따라 브라우저가 R2 버킷에서 이미지를 로드할 수 있도록 합니다.

---

## 📝 구현 예제

### React 함수형 컴포넌트

```tsx
import React from 'react';

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    thumbnail?: string;
    creator: string;
  };
}

export const VideoCard: React.FC<VideoCardProps> = ({ video }) => {
  const [imageError, setImageError] = React.useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <div className="video-card">
      <img
        src={imageError ? '/placeholder.png' : video.thumbnail}
        alt={video.title}
        className="card-thumbnail"
        loading="lazy"
        crossOrigin="anonymous"
        onError={handleImageError}
      />
      <h3>{video.title}</h3>
      <p>{video.creator}</p>
    </div>
  );
};
```

### Next.js Image 컴포넌트

```tsx
import Image from 'next/image';

export const VideoCard = ({ video }: { video: VideoResult }) => {
  return (
    <div className="video-card">
      <Image
        src={video.thumbnail || '/placeholder.png'}
        alt={video.title}
        width={500}
        height={800}
        className="card-thumbnail"
        crossOrigin="anonymous"
        priority={false}
        loading="lazy"
        onError={() => {
          // Fallback handling
        }}
      />
      <h3>{video.title}</h3>
    </div>
  );
};
```

### Vue 3 컴포넌트

```vue
<template>
  <div class="video-card">
    <img
      :src="imageError ? '/placeholder.png' : video.thumbnail"
      :alt="video.title"
      class="card-thumbnail"
      loading="lazy"
      crossorigin="anonymous"
      @error="handleImageError"
    />
    <h3>{{ video.title }}</h3>
    <p>{{ video.creator }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { VideoResult } from '@/types/video';

defineProps<{
  video: VideoResult;
}>();

const imageError = ref(false);

const handleImageError = () => {
  imageError.value = true;
};
</script>
```

### Vanilla JavaScript

```html
<div class="video-card">
  <img
    class="card-thumbnail"
    loading="lazy"
    crossorigin="anonymous"
    data-src=""
  />
  <h3></h3>
</div>

<script>
document.querySelectorAll('.video-card').forEach(card => {
  const img = card.querySelector('img');
  const video = getVideoData(); // Your data source

  img.src = video.thumbnail || '/placeholder.png';
  img.alt = video.title;

  img.onerror = () => {
    img.src = '/placeholder.png';
  };
});
</script>
```

---

## 🔍 검증 체크리스트

### 코드 검증

- [ ] 모든 `<img>` 태그에 `crossOrigin="anonymous"` 추가
- [ ] fallback image path가 올바름 (`/placeholder.png` 등)
- [ ] 에러 핸들링 구현 (이미지 로드 실패 시 placeholder 표시)

### 브라우저 테스트

1. **개발자 도구 열기** (F12)
2. **Console 탭**
   - CORS 관련 에러 없음 확인
   - 403/404 에러 없음 확인

3. **Network 탭**
   - R2 URL 요청 확인 (`https://pub-*.r2.dev/...`)
   - 요청 상태가 200 OK인지 확인

4. **프론트엔드에서 직접 테스트**
   - 검색 실행
   - 썸네일 표시 여부 확인

---

## 🚨 일반적인 문제와 해결책

### 문제 1: 403 Forbidden

**증상**: 이미지가 로드되지 않고, 콘솔에 403 에러

**원인**: R2 버킷이 공개 상태가 아님

**해결책**:
```
1. Cloudflare 대시보드 접속
2. R2 → tiktok-videos-storage → Settings
3. Public Access → Allow Access 클릭
```

### 문제 2: CORS 정책 위반

**증상**: 콘솔에 "CORS policy" 에러 메시지

**해결책**:
1. 이미지 태그에 `crossOrigin="anonymous"` 확인
2. 백엔드에서 CORS 설정 확인:
   ```bash
   npm run setup:r2
   ```

### 문제 3: Mixed Content

**증상**: HTTP 페이지에서 HTTPS R2 URL 로드 불가

**해결책**: HTTPS 사용 또는 프론트엔드를 HTTPS로 제공

### 문제 4: 이미지는 로드되지만 표시 안 됨

**증상**: 네트워크에서 200 OK이지만 이미지가 안 보임

**원인**:
- CSS `display: none` 또는 `width: 0`
- 이미지 해상도가 너무 작음
- z-index 문제

**확인사항**:
```javascript
// 개발자 도구 콘솔에서
const img = document.querySelector('img');
console.log('Width:', img.width);
console.log('Height:', img.height);
console.log('Display:', window.getComputedStyle(img).display);
console.log('Visibility:', window.getComputedStyle(img).visibility);
```

---

## 📊 성능 최적화

### 1. 이미지 로딩 최적화

```tsx
<img
  src={video.thumbnail}
  alt={video.title}
  loading="lazy"           // 스크롤 시에만 로드
  crossOrigin="anonymous"
  decoding="async"         // 비동기 디코딩
/>
```

### 2. 이미지 형식 선택

R2는 JPEG, PNG, WebP 등 모든 형식을 지원합니다:
```
jpg: 작은 파일 크기 (추천)
png: 투명도 필요 시
webp: 최신 브라우저 (더 작은 크기)
```

### 3. 이미지 프리로딩

```tsx
// 중요한 이미지는 미리 로드
<link rel="preload" as="image" href={video.thumbnail} />
```

---

## 🔗 API 응답 형식

백엔드에서 받는 데이터 형식:

```json
{
  "success": true,
  "platform": "tiktok",
  "videos": [
    {
      "id": "7501985038154878230",
      "title": "영상 제목",
      "description": "영상 설명",
      "creator": "크리에이터명",
      "creatorUrl": "https://www.tiktok.com/@creator",
      "followerCount": 4160,
      "playCount": 192601,
      "likeCount": 39606,
      "commentCount": 386,
      "shareCount": 946,
      "createTime": 1746692011000,
      "videoDuration": 18,
      "hashtags": ["태그1", "태그2"],
      "thumbnail": "https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev/thumbnails/abc123def456.jpg",
      "videoUrl": "https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev/videos/def789ghi012.mp4",
      "webVideoUrl": "https://www.tiktok.com/@creator/video/7501985038154878230"
    }
  ],
  "count": 1,
  "limit": 20,
  "skip": 0
}
```

**주요 필드**:
- `thumbnail`: R2 URL (pub-*.r2.dev로 시작)
- `videoUrl`: R2 비디오 URL (또는 원본 CDN)
- `webVideoUrl`: 원본 TikTok/Douyin 링크

---

## 🧪 테스트 시나리오

### 테스트 1: 로컬 개발 환경
```bash
# 백엔드 실행
npm run dev

# 프론트엔드 테스트
# 1. 검색 실행
# 2. 썸네일 로드 확인
# F12 > Console에서 에러 확인
```

### 테스트 2: 프로덕션 환경
```bash
# API 응답 확인
curl "https://api.example.com/api/videos?platform=tiktok&limit=1"

# R2 URL이 pub-*.r2.dev인지 확인
# 브라우저에서 직접 URL 접속해 200 OK 확인
```

---

## 🚀 배포 전 체크리스트

- [ ] 모든 이미지에 `crossOrigin="anonymous"` 추가
- [ ] 로컬에서 이미지 로드 테스트
- [ ] 브라우저 콘솔에서 CORS 에러 없음 확인
- [ ] 네트워크 탭에서 R2 URL 상태 200 확인
- [ ] 프로덕션 R2 URL과 로컬 개발 URL 일치 확인
- [ ] fallback image 정상 작동 확인

---

## 📚 참고 자료

### MDN 문서
- [img crossorigin attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#crossorigin)
- [CORS Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

### Cloudflare R2
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [Public URL Access](https://developers.cloudflare.com/r2/buckets/public-buckets/)

---

## 🆘 추가 지원

문제가 발생하면:

1. **백엔드 상태 확인**:
   ```bash
   npm run verify:r2
   ```

2. **API 응답 확인**:
   ```bash
   curl http://localhost:6000/api/videos?platform=tiktok&limit=1 | jq '.videos[0].thumbnail'
   ```

3. **R2 직접 접근**:
   브라우저에서 `https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev/thumbnails/test.jpg` 접속

---

**마지막 업데이트**: 2026-01-23
