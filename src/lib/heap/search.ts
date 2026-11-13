import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";

// 방 검색어 다듬기. 순수 함수만 둔다 (DB 접근 없음). 쿼리는 repo.searchRooms가 파라미터로 보낸다.

// 검색어를 NFC로 맞추고 제어 문자를 공백으로 바꾼 뒤 공백을 다듬어 roomsSearchQueryMaxChars(코드포인트)로 자른다.
// 비어 있으면 null (검색하지 않는다).
export function normalizeSearchQuery(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const capped = Array.from(cleaned).slice(0, HEAP_FUNNEL_POLICY.roomsSearchQueryMaxChars).join("").trim();
  return capped.length > 0 ? capped : null;
}

// ILIKE 패턴에서 특별한 글자(\, %, _)를 글자 그대로 찾게 앞에 \를 붙인다. PostgreSQL의 기본 이스케이프 문자가 \다.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => "\\" + ch);
}

// 앞뒤 어디에 있어도 맞는 부분 일치 패턴
export function likePattern(query: string): string {
  return `%${escapeLike(query)}%`;
}
