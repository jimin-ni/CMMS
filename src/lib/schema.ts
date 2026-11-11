import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Drizzle 쿼리용 테이블 정의. 실제 스키마(제약, 인덱스)는 db/migrations의 SQL 파일이 기준이다.
// 테이블을 바꿀 때는 새 마이그레이션 파일을 추가하고, 여기 정의도 같이 맞춘다.

// Better Auth가 관리하는 테이블(npm run auth:migrate). 조회에 필요한 열만 정의하고 여기서 쓰지 않는다.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
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
