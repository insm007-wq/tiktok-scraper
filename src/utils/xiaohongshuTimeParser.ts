/**
 * 샤오홍슈 시간 텍스트를 타임스탬프로 변환
 * 샤오홍슈 API는 corner_tag_info[].text 형태로만 시간 정보를 제공함
 * 예: "2天前", "5分钟前", "1周前", "3个月前"
 */

export function parseXiaohongshuTime(cornerTagInfo?: any[]): number {
  if (!cornerTagInfo || cornerTagInfo.length === 0) {
    return Date.now();
  }

  // publish_time 타입의 tag 찾기
  const publishTimeTag = cornerTagInfo.find(
    (tag) => tag.type === 'publish_time'
  );

  if (!publishTimeTag || !publishTimeTag.text) {
    return Date.now();
  }

  const timeText = publishTimeTag.text; // 예: "2天前", "5分钟前"
  const now = Date.now();

  // 정규식으로 숫자와 단위 추출
  const minuteMatch = timeText.match(/(\d+)分钟前/); // N분 전
  const hourMatch = timeText.match(/(\d+)小时前/);   // N시간 전
  const dayMatch = timeText.match(/(\d+)天前/);      // N일 전
  const weekMatch = timeText.match(/(\d+)周前/);     // N주 전
  const monthMatch = timeText.match(/(\d+)个月前/);  // N개월 전
  const yearMatch = timeText.match(/(\d+)年前/);     // N년 전

  try {
    if (minuteMatch) {
      const minutes = parseInt(minuteMatch[1]);
      return now - minutes * 60 * 1000;
    } else if (hourMatch) {
      const hours = parseInt(hourMatch[1]);
      return now - hours * 60 * 60 * 1000;
    } else if (dayMatch) {
      const days = parseInt(dayMatch[1]);
      return now - days * 24 * 60 * 60 * 1000;
    } else if (weekMatch) {
      const weeks = parseInt(weekMatch[1]);
      return now - weeks * 7 * 24 * 60 * 60 * 1000;
    } else if (monthMatch) {
      const months = parseInt(monthMatch[1]);
      return now - months * 30 * 24 * 60 * 60 * 1000; // 근사값
    } else if (yearMatch) {
      const years = parseInt(yearMatch[1]);
      return now - years * 365 * 24 * 60 * 60 * 1000; // 근사값
    }
  } catch (error) {
    console.warn('[Xiaohongshu] Time parsing failed:', error, 'text:', timeText);
  }

  // 파싱 실패 시 현재 시간 반환
  return now;
}
