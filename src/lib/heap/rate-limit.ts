// 프로세스 메모리 안의 슬라이딩 창 제한기. DB에 남지 않는 짧은 제한(방 만들기 시도, 채널 확인 시도)에 쓴다.
// 서버가 여러 개로 늘면 인스턴스마다 따로 센다. 그래서 돈이 들거나 데이터를 바꾸는 제한은 DB 쪽 검사가 따로 지킨다
// (방은 creator_id unique, 가져오기는 채널 행의 updated_at과 advisory lock).
// 개발 중 핫 리로드로 표가 비지 않도록 전역에 둔다.
const globalForLimit = globalThis as unknown as { heapRateHits?: Map<string, number[]> };
const hits = (globalForLimit.heapRateHits ??= new Map<string, number[]>());

// key의 시도를 한 번 센다. windowMs 안에 max번을 넘으면 false(시도를 거절)이고 그 시도는 세지 않는다.
export function takeAttempt(key: string, max: number, windowMs: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // 표가 끝없이 자라지 않게 가끔 오래된 키를 치운다.
  if (hits.size > 5000) {
    for (const [k, list] of hits) {
      if (list.every((at) => now - at >= windowMs)) hits.delete(k);
    }
  }
  return true;
}
