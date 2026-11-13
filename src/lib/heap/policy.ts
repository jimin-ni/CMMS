// 힙 미니룸 규칙. 숫자를 바꿀 때는 이 파일만 고치면 된다.
// 전부 1차 값이다. 실제로 써 본 뒤에 조정한다.
// 글자 수와 투표 기준 범위는 db/migrations/0007_heap_rooms.sql의 check보다 느슨하면 안 된다.
export const HEAP_POLICY = {
  // 글자 수는 한글 기준으로 센다(코드포인트 단위).
  guestbookNameMaxChars: 12,
  pieceNoteMaxChars: 60,

  // 조각이 더미에 안착하는 투표 수. 방마다 크리에이터가 바꿀 수 있다.
  defaultVoteThreshold: 3,
  voteThresholdMin: 1,
  voteThresholdMax: 1000,

  // 도배 방지: 사용자 한 명이 방 하나에 하루 동안 남길 수 있는 개수.
  // 하루는 한국 시간 자정에 바뀐다 (방문 기록과 같은 기준).
  pieceSubmitsPerDay: 5,
  guestbookEntriesPerDay: 1,

  // 방 화면에 처음 보여 주는 방명록 줄 수
  guestbookPageSize: 30,

  // 방 꾸미기(layout) 저장 한도. 서버가 저장 전에 검사한다 (src/lib/heap/layout.ts).
  layoutMaxBytes: 64 * 1024,
  layoutMaxItems: 200,
  // 방 크기는 엔진의 roomDim 범위(6..12)와 같다. 가구 좌표는 가장 큰 방(12)의 반쪽에 여유를 둔 값.
  layoutRoomMin: 6,
  layoutRoomMax: 12,
  layoutCoordMax: 8,
  layoutItemSizeMin: 0.3,
  layoutItemSizeMax: 3,
  layoutItemYMax: 4,
  layoutPostersMax: 8,

  // 방 화면이 열려 있는 동안(탭이 보일 때) 바뀐 것을 가져오는 간격
  pollIntervalMs: 10_000,

  // 실시간 읽기(?since=)에서 다음 기준점을 serverTime보다 앞당기는 시간. 버블과 같은 값.
  changesCursorOverlapMs: 10_000,
} as const;
