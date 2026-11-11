import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
