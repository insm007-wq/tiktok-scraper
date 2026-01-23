# R2 썸네일 문제 - 빠른 시작 가이드

> 이 가이드는 R2 썸네일 로딩 문제를 빠르게 해결하기 위한 체크리스트입니다.

## 🚀 5분 안에 해결하기

### Step 1: R2 CORS 설정 (1분)
```bash
npm run setup:r2
```
✅ CORS 정책이 자동 설정됩니다.

### Step 2: Cloudflare 대시보드에서 Public Access 활성화 (2분)

1. https://dash.cloudflare.com/ 접속
2. **R2** → **tiktok-videos-storage** 클릭
3. **Settings** 탭
4. **Public Access** 섹션에서 **Allow Access** 클릭
5. Public URL 확인: `https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev`

### Step 3: R2 설정 검증 (1분)
```bash
npm run verify:r2
```

**예상 결과**:
```
✅ Verification Summary:

✅ Environment Variables
   └─ All required variables are set

✅ R2 Bucket Access
   └─ Can access bucket "tiktok-videos-storage"

✅ R2 Setup is Complete!
```

### Step 4: 기존 CDN 썸네일을 R2로 마이그레이션 (5분+)
```bash
npm run migrate:thumbnails
```

진행상황이 표시됩니다:
```
📊 Found 45 cache documents with non-R2 thumbnails
...
✅ Migration Complete!
   ✅ Migrated: 45
   ❌ Failed: 2
   ⏭️  Skipped: 3
```

### Step 5: 프론트엔드 수정 (1분)

모든 `<img>` 태그에 `crossOrigin="anonymous"` 추가:

```tsx
// Before
<img src={video.thumbnail} alt={video.title} />

// After
<img
  src={video.thumbnail}
  alt={video.title}
  crossOrigin="anonymous"
  onError={(e) => {
    (e.target as HTMLImageElement).src = '/placeholder.png';
  }}
/>
```

---

## ✅ 완료 확인

### 1. API 응답 확인
```bash
curl "http://localhost:6000/api/videos?platform=tiktok&limit=1" | grep -o '"thumbnail":"[^"]*"'
```

**정상**: `"thumbnail":"https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev/..."`
**문제**: `"thumbnail":"https://p16-sign.tiktokcdn-us.com/..."`

### 2. R2 URL 직접 접근
브라우저에서 다음 URL을 열어보세요:
```
https://pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev/thumbnails/[filename].jpg
```

**정상**: 이미지가 표시됨
**문제**: 404 또는 403 에러

### 3. 프론트엔드 확인
- 프론트엔드에서 검색 실행
- 썸네일이 표시되는지 확인
- 브라우저 F12 > Console 탭에서 에러 없음 확인

---

## 🆘 문제 해결

### Q: "403 Forbidden" 에러
**A**: Cloudflare 대시보드에서 Public Access를 활성화하지 않았습니다.
```
1. https://dash.cloudflare.com/ 접속
2. R2 → tiktok-videos-storage
3. Settings → Public Access → Allow Access
```

### Q: "CORS policy" 에러
**A**: 다시 실행하세요:
```bash
npm run setup:r2
```

### Q: 마이그레이션 실패
**A**: 다시 시도하세요 (TikTok CDN이 일시적으로 다운되었을 수 있음):
```bash
npm run migrate:thumbnails
```

### Q: 여전히 이미지가 보이지 않음
**A**:
1. 브라우저 개발자 도구 (F12) 열기
2. Console 탭에서 에러 확인
3. Network 탭에서 image 요청 확인 (상태 200인지 확인)
4. 이미지 URL이 `pub-e7c1a9fcc1354653a54a231bf19ecf7b.r2.dev`인지 확인

---

## 📊 모니터링 명령어

### 현재 상태 확인
```bash
# R2 설정 검증
npm run verify:r2

# API 통계
curl http://localhost:6000/api/videos/stats

# 특정 플랫폼의 캐시
curl "http://localhost:6000/api/videos/platform/tiktok?limit=5&skip=0"
```

---

## 🎯 완료 시나리오

### 새로운 영상 스크래핑
```bash
curl -X POST "http://localhost:6000/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"platform":"tiktok","query":"공부","limit":10}'
```

**결과**: 모든 새 영상은 자동으로 R2 URL을 가집니다.

### 정기적인 업데이트
스케줄러가 자동으로 백그라운드에서:
- 4시간마다 설정된 키워드 검색
- 새 영상을 R2에 업로드
- 데이터베이스 갱신

---

## 📚 자세한 정보

전체 가이드를 보려면:
```bash
cat R2_THUMBNAIL_FIX_GUIDE.md
```

---

**마지막 업데이트**: 2026-01-23
