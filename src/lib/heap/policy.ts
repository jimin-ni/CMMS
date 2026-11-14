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

// 크리에이터 깔때기(방 만들기, 방 목록, 영상 가져오기) 규칙. 위와 마찬가지로 1차 값이다.
export const HEAP_FUNNEL_POLICY = {
  // 방 주소(슬러그). 글자 수는 db/migrations/0007의 check(2~40자)보다 좁다. 규칙 본문은 slug.ts.
  slugMinChars: 3,
  slugMaxChars: 24,
  // 방 이름은 한글 기준 글자 수(코드포인트). 0007의 check와 같다.
  roomNameMaxChars: 40,
  // 방 만들기를 시도할 수 있는 횟수(사용자당, 10분 동안). 슬러그를 하나씩 찔러 보는 일을 막는다.
  claimAttemptsPer10Min: 10,

  // /rooms의 추천 방. 이 slug 목록을 바꾸면 된다. 없는 방은 건너뛴다.
  featuredSlugs: ["lovesoo", "dname", "sample"],
  roomsFollowedMax: 30,
  roomsFeaturedMax: 12,
  roomsSearchMax: 24,
  // 검색어는 공백을 다듬은 뒤 이 길이로 자른다 (코드포인트).
  roomsSearchQueryMaxChars: 40,

  // 영상 가져오기 상한. 크리에이터 한 명이 방에 둘 수 있는 영상 수다 (채널이 여럿이어도 합산).
  // 쇼츠는 모든 채널(틱톡 포함), 롱폼은 모든 채널, 인스타그램은 따로 센다. 안 쓴 몫은 다른 쪽으로 넘어간다 (caps.ts).
  importCaps: { shorts: 150, long: 100, instagram: 50 },
  importTotalMax: 300,
  // 가져오기는 크리에이터당 이 간격마다 한 번. 실패한 시도도 채널을 찾은 뒤에는 간격에 든다.
  importMinIntervalMs: 10 * 60 * 1000,
  // 채널 확인만 하다 끝나는 시도(찾지 못한 핸들 등)는 메모리 제한기가 막는다: 사용자당 10분에 이 횟수까지.
  importAttemptsPer10Min: 5,
  // 업로드 목록은 50개씩 읽는다. 이 쪽수까지만 거슬러 올라간다 (쪽당 API 1유닛).
  importMaxPages: 8,
  // 크리에이터 한 명이 연결할 수 있는 유튜브 채널 수
  importChannelsMax: 5,
  // 영상 길이가 이 초 이하면 쇼츠로 본다 (가로 여부는 wide = false). 쇼츠는 2024년 10월부터 3분까지 올릴 수 있다.
  // 길이로 짐작하는 값이다. Data API에는 쇼츠 표시가 없어서 3분 이하의 가로 영상이 쇼츠로 잘못 분류될 수 있다.
  shortMaxSeconds: 180,
  // 방 layout의 excludedReels(힙에서 뺀 영상 목록) 상한
  excludedReelsMax: 600,

  // 게시물 링크 붙여넣기 (채널 탭, 판정 J12). 가져오기와 달리 네트워크를 쓰지 않아 간격 제한은 없고 줄 수와 횟수만 막는다.
  pasteLinksMax: 30,
  pasteTextMaxChars: 8000,
  pasteAttemptsPer10Min: 20,
  // 붙여 넣은 제목("<주소> | <제목>")의 길이. 0007의 check(300자)보다 좁다.
  pasteTitleMaxChars: 100,
} as const;
