// AI 스크리닝(모더레이션) 정책 값. 숫자를 바꿀 때는 이 파일만 고친다.
// 기준 문서: docs/planning/12-ai-screening.md
export const MODERATION_POLICY = {
  // 경고가 이 수 이상이면 자동 차단한다.
  autoBlockStrikes: 3,

  // 같은 글 반복: 정규화한 글이 이 시간 안의 내 글과 같으면 판정 없이 거절한다.
  repeatWindowMs: 10 * 60 * 1000,
  // 위반 판정 뒤 이 시간 동안 같은 표면에 쓸 수 없다.
  cooldownAfterViolationMs: 60 * 1000,
  // 구독자 글 하나에 넣을 수 있는 링크 수
  maxLinksPerPost: 1,

  openai: {
    model: "omni-moderation-latest",
    timeoutMs: 1500,
    // 사용자당 호출 상한. 넘으면 사전·regex 결과로만 판정한다.
    perUserLimit: 20,
    perUserWindowMs: 10 * 60 * 1000,
    // 장애 차단기: breakerWindowMs 안에 breakerFailures번 연속 실패하면 breakerOpenMs 동안 부르지 않는다.
    breakerFailures: 5,
    breakerWindowMs: 30 * 1000,
    breakerOpenMs: 60 * 1000,
  },

  // OpenAI 카테고리 처리 (문서 5-4)
  // 걸리면 바로 위반
  hardBlockCategories: [
    "sexual/minors",
    "harassment/threatening",
    "hate/threatening",
    "hate",
    "sexual",
  ],
  // 50문장 평가셋(2026-11-20): 팬 관용 표현 16개 중 6개가 harassment에 걸렸고(0.40~0.88),
  // 실제 괴롭힘(0.72~0.98)과 점수가 겹쳐 "숨김 + 경고 없음 + 검토 목록"으로 시작한다 (문서 18-1, #82 1번).
  harassmentMode: "hold_review" as "block" | "hold_review",
  // 점수 기준 카테고리. 이 점수 이상이면 위반. null이면 OpenAI의 flagged 판단을 그대로 쓴다.
  // violence: 관용 표현("kill me, this is so good", "murder me with that smile")이 0.51~0.52,
  // 실제 위협이 0.69~0.87이라 0.7로 둔다. 나머지는 평가셋에 근거가 없어 같은 값으로 시작한다.
  scoreThresholds: {
    violence: 0.7,
    "violence/graphic": 0.7,
    illicit: 0.7,
    "illicit/violent": 0.7,
  } as Record<string, number | null>,
  // 바로 위반 카테고리의 점수 보완. OpenAI가 flagged를 붙이지 않아도 이 점수 이상이면 위반.
  // sexual: 성적 요구 문장이 0.60에도 flagged가 아니었다. 이름 "sexy fan"은 0.38.
  hardBlockScoreFloor: { sexual: 0.5 } as Record<string, number>,
  selfHarmCategories: ["self-harm", "self-harm/intent", "self-harm/instructions"],

  // 사전·regex는 메모리에 올리고 이 간격으로 다시 읽는다.
  lexiconReloadMs: 5 * 60 * 1000,

  // 판정 기록에 남기는 버전. 기준을 바꾸면 올린다.
  versions: { patterns: "2026-11-20.2", thresholds: "2026-11-20.2" },
} as const;

// 작성자 안내 문구 (문서 6장, 10장)
export const MODERATION_TEXT = {
  removed: "커뮤니티 정책 위반으로 삭제되었습니다.",
  blocked: (strikes: number) =>
    `규칙 위반으로 게시되지 않았어요. (경고 ${Math.min(strikes, MODERATION_POLICY.autoBlockStrikes)}/${MODERATION_POLICY.autoBlockStrikes})`,
  nowBlocked: "경고가 3회 쌓여 이제 글을 쓸 수 없어요.",
  contactFirst: "연락처나 SNS 계정은 공유할 수 없어요. 이 메시지는 게시되지 않았어요.",
  holdReview: "이 메시지는 검토 후에 보일 수 있어요.",
  selfHarm:
    "많이 힘드신가요? 이 메시지는 공개되지 않았어요. 혼자 견디지 않으셔도 돼요. 한국: 자살예방상담전화 109, 미국: 988, 그 밖의 나라: findahelpline.com",
  writeBlocked: "커뮤니티 규칙 위반으로 글을 쓸 수 없어요.",
  underAge: "만 14세 미만은 채팅, 쪽지, 방명록을 쓸 수 없어요.",
  repeat: "같은 메시지를 반복해서 보낼 수 없어요.",
  cooldown: (seconds: number) => `규칙 위반 직후라 ${seconds}초 뒤에 다시 보낼 수 있어요.`,
  tooManyLinks: "링크는 한 메시지에 1개까지 넣을 수 있어요.",
} as const;
