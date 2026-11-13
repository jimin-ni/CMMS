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
  // 벽 액자: 꾸미기가 놓는 높이(액자 가운데)와, 벽을 따라 모서리에서 떨어뜨리는 거리. 서버는 이 자리만 받는다 (layout.ts).
  frameY: 1.9,
  frameWallMargin: 0.5,
  // 사진 탁자의 크기. 엔진의 TABLE과 같다. 앉는 가구(의자, 소파)는 이 탁자와 겹치게 둘 수 없다 (layout.ts).
  tableW: 2.6,
  tableD: 1.8,

  // 가구에 붙이는 기능(item.fn). 글자 수는 코드포인트 기준이다. 종류와 허용 가구는 public/heap/models/catalogue.json의 slots.
  // PC(링크 모음): 링크 개수와 한 줄의 길이
  pcLinksMax: 12,
  linkTitleMaxChars: 40,
  linkUrlMaxChars: 500,
  linkEmailMaxChars: 120,
  // 기념품(액자, 선반 위): 이름은 꼭 있어야 하고 나머지는 비워 둘 수 있다
  keepsakeNameMaxChars: 24,
  keepsakeCaptionMaxChars: 120,
  // 달력: 날짜 줄 수와 한 줄 설명의 길이
  calendarEntriesMax: 8,
  calendarLabelMaxChars: 30,

  // 방 화면이 열려 있는 동안(탭이 보일 때) 바뀐 것을 가져오는 간격
  pollIntervalMs: 10_000,

  // 실시간 읽기(?since=)에서 다음 기준점을 serverTime보다 앞당기는 시간. 버블과 같은 값.
  changesCursorOverlapMs: 10_000,
  // 실시간 읽기 한 번에 돌려주는 줄 수 상한. 방명록과 조각 목록에 각각 적용된다.
  // 한도에 닿으면 응답의 more가 true가 되고, 받은 cursor로 이어서 읽는다.
  changesPageSize: 100,
  // since가 거슬러 올라갈 수 있는 한계. 더 오래된 값은 오류 없이 이 한계로 당겨진다.
  changesMaxLookbackMs: 7 * 24 * 60 * 60 * 1000,

  // 방 화면이 처음 그릴 때 읽는 상한. 넘치면 오래된 것부터 빠진다.
  snapshotReelsMax: 300,
  snapshotPiecesMax: 200,
} as const;
