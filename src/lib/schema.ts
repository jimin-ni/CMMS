import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { HEAP_CHANNEL_PLATFORMS, HEAP_PIECE_PLATFORMS } from "./heap/platform";

export const SCREEN_STATUSES = ["published", "blocked", "removed", "held"] as const;

// Drizzle에 bytea 기본 타입이 없어서 직접 정의한다. node-postgres는 bytea를 Buffer로 주고받는다.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// Drizzle 쿼리용 테이블 정의. 실제 스키마(제약, 인덱스)는 db/migrations의 SQL 파일이 기준이다.
// 테이블을 바꿀 때는 새 마이그레이션 파일을 추가하고, 여기 정의도 같이 맞춘다.

// Better Auth가 관리하는 테이블(npm run auth:migrate). 조회에 필요한 열만 정의하고 여기서 쓰지 않는다.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // admin 플러그인이 추가한 열. 값은 public, creator, admin (null이면 public으로 본다).
  role: text("role"),
});

export const bubbleRooms = pgTable("bubble_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: text("creator_id").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const bubbleMembers = pgTable(
  "bubble_members",
  {
    roomId: uuid("room_id").notNull(),
    userId: text("user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })],
);

export const bubbleMessages = pgTable("bubble_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),
  senderId: text("sender_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // AI 스크리닝 (0011). published만 다른 사람에게 보인다. removed는 "삭제되었습니다" 자리만 남는다.
  screenStatus: text("screen_status", { enum: SCREEN_STATUSES }).notNull().default("published"),
  screenedAt: timestamp("screened_at", { withTimezone: true }),
  // 상태가 바뀐 시각. 폴링 기준점이라 DB now()로만 넣는다.
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  normalizedHash: text("normalized_hash"),
  // 인용 답장 (0015). 가리키는 메시지가 없으면 null.
  replyToId: uuid("reply_to_id"),
});

export const creatorProfiles = pgTable("creator_profiles", {
  userId: text("user_id").primaryKey(),
  persona: text("persona").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 크리에이터 톡 (0004). 크리에이터끼리만 쓰는 1:1 또는 그룹 대화.
export const creatorChats = pgTable("creator_chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  directKey: text("direct_key").unique(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creatorChatMembers = pgTable(
  "creator_chat_members",
  {
    chatId: uuid("chat_id").notNull(),
    userId: text("user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.userId] })],
);

export const creatorChatMessages = pgTable("creator_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id").notNull(),
  senderId: text("sender_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// 크리에이터 프로필 사진 (0006). 크리에이터만 등록한다.
export const creatorAvatars = pgTable("creator_avatars", {
  userId: text("user_id").primaryKey(),
  content: bytea("content").notNull(),
  contentType: text("content_type").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 힙 미니룸 (0007). 기준은 db/migrations/0007_heap_rooms.sql (제약·인덱스는 SQL에만 있다).
// 플랫폼 목록은 src/lib/heap/platform.ts의 상수를 쓴다. SQL의 check와 같아야 한다.

// 크리에이터가 연결한 공식 채널. 방이 아니라 크리에이터에 붙는다.
export const heapCreatorChannels = pgTable("heap_creator_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: text("creator_id").notNull(),
  platform: text("platform", { enum: HEAP_CHANNEL_PLATFORMS }).notNull(),
  externalId: text("external_id").notNull(),
  channelUrl: text("channel_url").notNull(),
  title: text("title").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 크리에이터별 방 1개. layout은 꾸미기 결과이며 형식은 앱이 검사한다.
export const heapRooms = pgTable("heap_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: text("creator_id").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  blurb: text("blurb").notNull().default(""),
  layout: jsonb("layout").$type<Record<string, unknown>>().notNull().default({}),
  voteThreshold: integer("vote_threshold").notNull().default(3),
  creatorVisitedAt: timestamp("creator_visited_at", { withTimezone: true }),
  // 쪽지 공개 시각 (0008). null이면 모두에게 열려 있고, 미래 시각이면 그때까지 봉인된다.
  noteRevealAt: timestamp("note_reveal_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 더미에 쌓이는 크리에이터의 영상. (room_id, platform, external_id)가 유니크다.
export const heapReels = pgTable("heap_reels", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),
  channelId: uuid("channel_id"),
  platform: text("platform", { enum: HEAP_CHANNEL_PLATFORMS }).notNull(),
  externalId: text("external_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  title: text("title").notNull().default(""),
  // 가로면 true, 세로면 false, 알 수 없으면 null
  wide: boolean("wide"),
  viewCount: bigint("view_count", { mode: "number" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 방명록. 이름과 날짜만 남는다.
export const heapGuestbook = pgTable("heap_guestbook", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // 0013. 판정 상태. status_changed_at은 변경 읽기 커서다 (DB now()로만 넣는다).
  screenStatus: text("screen_status", { enum: SCREEN_STATUSES }).notNull().default("published"),
  screenedAt: timestamp("screened_at", { withTimezone: true }),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  normalizedHash: text("normalized_hash"),
});

// 개인 차단 (0013). 보는 사람에게서만 상대의 쪽지·방명록·방 안 캐릭터를 가린다. 쓰기는 막지 않는다.
export const heapBlocks = pgTable("heap_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockerId: text("blocker_id").notNull(),
  blockedId: text("blocked_id").notNull(),
  label: text("label").notNull(),
  // 차단한 자리와 그때 글 (0016). 0016 전 행은 null
  surface: text("surface", { enum: ["note", "guestbook"] }),
  excerpt: text("excerpt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 방문 기록. 사용자당 하루 한 줄. visit_day는 한국 시간 날짜이며 DB 기본값만 쓴다.
export const heapVisits = pgTable(
  "heap_visits",
  {
    roomId: uuid("room_id").notNull(),
    userId: text("user_id").notNull(),
    visitDay: date("visit_day")
      .notNull()
      .default(sql`((now() at time zone 'Asia/Seoul')::date)`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId, t.visitDay] })],
);

// 팬이 올린 조각. (room_id, platform, external_id)가 유니크다.
// 상태와 landed_at·lifted_at은 SQL check로 묶여 있다.
export const heapPieces = pgTable("heap_pieces", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),
  // 제출한 사용자의 계정이 지워지면 null이 된다.
  submitterId: text("submitter_id"),
  platform: text("platform", { enum: HEAP_PIECE_PLATFORMS }).notNull(),
  externalId: text("external_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  title: text("title").notNull().default(""),
  wide: boolean("wide"),
  note: text("note").notNull().default(""),
  status: text("status", { enum: ["pending", "rejected", "voting", "landed", "lifted"] })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  landedAt: timestamp("landed_at", { withTimezone: true }),
  liftedAt: timestamp("lifted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 조각 투표. 사용자당 조각 하나에 한 표.
export const heapPieceVotes = pgTable(
  "heap_piece_votes",
  {
    pieceId: uuid("piece_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pieceId, t.userId] })],
);

// 쪽지 트리 (0008). 기준은 db/migrations/0008_heap_notes_audit.sql (제약·인덱스는 SQL에만 있다).
// 위치(pos_y, pos_angle)는 둘 다 있거나 둘 다 null이고, null이면 트리 아래 쪽지함에 있다.
export const heapNotes = pgTable("heap_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  tint: text("tint").notNull(),
  font: text("font").notNull(),
  anonymous: boolean("anonymous").notNull().default(false),
  // 0009. 모두 null 허용이고 null은 예전 동작이다 (자동 글자 크기, id로 정한 장식, 계정 이름).
  fontSize: smallint("font_size"),
  ornament: text("ornament"),
  ornamentColor: text("ornament_color"),
  displayName: text("display_name"),
  posY: real("pos_y"),
  posAngle: real("pos_angle"),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  ownerReadAt: timestamp("owner_read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // 0013. 판정 상태. 상태가 바뀌면 updated_at도 바꾼다 (쪽지의 변경 읽기 커서).
  screenStatus: text("screen_status", { enum: SCREEN_STATUSES }).notNull().default("published"),
  screenedAt: timestamp("screened_at", { withTimezone: true }),
  normalizedHash: text("normalized_hash"),
});

// 방 주인의 답장. 쪽지 하나에 답장 하나.
export const heapNoteReplies = pgTable("heap_note_replies", {
  noteId: uuid("note_id").primaryKey(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  font: text("font").notNull(),
  // 0009. 쪽지의 font_size와 같은 뜻이다 (null 은 자동 맞춤).
  fontSize: smallint("font_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 콘텐츠 열람 통계. 하루 단위 카운터만 둔다. day는 한국 시간 날짜, target은 링크 주소 또는 <platform>:<externalId>.
export const heapOpenCounts = pgTable("heap_open_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),
  day: date("day").notNull(),
  kind: text("kind", { enum: ["link", "reel"] }).notNull(),
  target: text("target").notNull(),
  opens: integer("opens").notNull().default(0),
});

// 실패 시도 제한(DB 기반). key는 앱이 정하고, 창이 지나면 앱이 window_start와 count를 되돌린다.
export const heapAttempts = pgTable("heap_attempts", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(1),
});

// AI 스크리닝 (0011). 기준 문서: docs/planning/12-ai-screening.md 15장
export const moderationEvents = pgTable("moderation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  roomOwnerId: text("room_owner_id"),
  surface: text("surface", { enum: ["chat", "note", "guestbook"] }).notNull(),
  targetId: uuid("target_id").notNull(),
  source: text("source", { enum: ["auto", "report"] }).notNull(),
  kind: text("kind", { enum: ["abuse", "contact", "self_harm"] }).notNull(),
  countsAsStrike: boolean("counts_as_strike").notNull(),
  reasons: text("reasons").array().notNull().default(sql`'{}'`),
  scores: jsonb("scores").$type<Record<string, number> | null>(),
  openaiStatus: text("openai_status"),
  versions: jsonb("versions"),
  reportedBy: text("reported_by"),
  reviewStatus: text("review_status", { enum: ["none", "pending", "upheld", "dismissed"] })
    .notNull()
    .default("none"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sanctions = pgTable("sanctions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  scope: text("scope", { enum: ["owner", "auto", "global"] }).notNull(),
  roomOwnerId: text("room_owner_id"),
  createdBy: text("created_by"),
  reason: text("reason"),
  reviewStatus: text("review_status", { enum: ["none", "pending", "upheld"] }).notNull().default("none"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"),
  // 차단한 자리와 그때 글 (0016). 자동 차단과 0016 전 행은 null
  surface: text("surface", { enum: ["chat", "note", "guestbook"] }),
  excerpt: text("excerpt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sanctionAppeals = pgTable("sanction_appeals", {
  id: uuid("id").primaryKey().defaultRandom(),
  sanctionId: uuid("sanction_id").notNull().unique(),
  userId: text("user_id").notNull(),
  status: text("status", { enum: ["pending", "reviewed"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userAgeChecks = pgTable("user_age_checks", {
  userId: text("user_id").primaryKey(),
  is14OrOlder: boolean("is_14_or_older").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  resetBy: text("reset_by"),
  resetAt: timestamp("reset_at", { withTimezone: true }),
});

export const moderationAccessLog = pgTable("moderation_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  viewerId: text("viewer_id"),
  eventId: uuid("event_id"),
  surface: text("surface", { enum: ["chat", "note", "guestbook"] }).notNull(),
  targetId: uuid("target_id").notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationTerms = pgTable("moderation_terms", {
  id: integer("id").primaryKey(),
  term: text("term").notNull(),
  lang: text("lang").notNull(),
  tag: text("tag").notNull(),
  source: text("source").notNull(),
  version: text("version").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const moderationPatterns = pgTable("moderation_patterns", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  pattern: text("pattern").notNull(),
  version: text("version").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const moderationAllowlist = pgTable("moderation_allowlist", {
  // 0011에서 serial로 만들었다. 관리 화면이 행을 넣으므로 기본값이 있는 열로 적는다.
  id: serial("id").primaryKey(),
  term: text("term").notNull().unique(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
