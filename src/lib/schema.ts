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
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { HEAP_CHANNEL_PLATFORMS, HEAP_PIECE_PLATFORMS } from "./heap/platform";

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

// 시참(기능 3). 기준은 db/migrations/0005_sicham.sql (제약·인덱스·시드는 SQL에만 있다).
export const sichamGames = pgTable("sicham_games", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  joinMethod: text("join_method", {
    enum: ["reveal-string", "search-invite", "platform-invite"],
  }).notNull(),
  handleLabel: text("handle_label"),
  defaultPartySize: integer("default_party_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sichamGameHandles = pgTable(
  "sicham_game_handles",
  {
    userId: text("user_id").notNull(),
    gameId: text("game_id").notNull(),
    handle: text("handle").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

export const sichamSessions = pgTable("sicham_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: text("creator_id").notNull(),
  gameId: text("game_id").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["recruiting", "frozen", "closed"] })
    .notNull()
    .default("recruiting"),
  partySize: integer("party_size").notNull(),
  approvalMode: text("approval_mode", { enum: ["fcfs", "lottery"] }).notNull().default("fcfs"),
  entryQuestion: text("entry_question"),
  entryAnswer: text("entry_answer"),
  joinCode: text("join_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const sichamMembers = pgTable("sicham_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status", { enum: ["queue", "ready", "party", "left", "kicked"] })
    .notNull()
    .default("queue"),
  locked: boolean("locked").notNull().default(false),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sichamBans = pgTable(
  "sicham_bans",
  {
    creatorId: text("creator_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.creatorId, t.userId] })],
);

export const sichamNotes = pgTable(
  "sicham_notes",
  {
    creatorId: text("creator_id").notNull(),
    userId: text("user_id").notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.creatorId, t.userId] })],
);

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
