"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Book, BookPage } from "@/components/settings/book";
import { SignOutButton } from "@/components/sign-out-button";
import type { HeapChannelPlatform } from "@/lib/heap/platform";
import { useLanguage, type Language } from "@/lib/settings/prefs";
import { BlockList, type MyBlock } from "./block-list";

// 마이페이지 (/mypage): 설정과 같은 책상 위에 펼친 O링 수첩 (틀은 settings/book.tsx).
// 모든 계정: 계정 정보와 로그아웃, 결제 정보. 크리에이터와 관리자: 쪽지, 대화방, 채널, 내 방.
// 지금은 화면 구성만 잡는다. 상세 기능은 기존 화면(/creator, 방의 꾸미기)으로 보내거나 "준비 중"으로 둔다.
// 글은 설정의 언어를 따른다 (TEXT). 세션 값은 서버(page.tsx)가 읽어 넘긴다.

export type MyAccount = {
  name: string;
  email: string;
  // 역할 값 (admin, creator, public). 이름은 고른 언어로 여기서 붙인다
  role: string | null;
  joinedAt: Date;
  // 관리자면 계정 정보 장에 관리자 페이지 버튼을 보인다. 접근 권한은 관리자 페이지가 서버에서 다시 확인한다.
  isAdmin: boolean;
};

// 크리에이터·관리자에게만 있는 값. room 이 null 이면 아직 방이 없다.
export type MyCreatorData = {
  room: { slug: string; name: string } | null;
  visits: { today: number; total: number };
  notes: { received: number; unread: number; replied: number };
  chat: { openRoomId: string | null };
  channels: { platform: HeapChannelPlatform; title: string; url: string }[];
};

const PLATFORM_LABELS: Record<HeapChannelPlatform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  chzzk: "CHZZK",
  twitch: "Twitch",
  soop: "SOOP",
  tiktok: "TikTok",
};

const MY_ROOM_HREF = "/room/me";
const CREATOR_HREF = "/creator";
// 관리자 페이지. 지금은 AI 스크리닝 검토 화면 하나다 (docs/planning/12-ai-screening.md 11장).
const ADMIN_HREF = "/admin/moderation";

const LOCALES: Record<Language, string> = { ko: "ko-KR", en: "en-US" };

// 화면 글. 쪽 표시(tag)와 쪽 제목(title)은 쪽마다 [tag, title] 이다
const TEXT = {
  ko: {
    heading: "마이페이지",
    close: "마이페이지 닫기",
    roles: { admin: "관리자", creator: "크리에이터", public: "구독자" } as Record<string, string>,
    account: ["계정", "내 계정"],
    accountHead: "계정 정보",
    name: "이름",
    email: "이메일",
    role: "계정 종류",
    joined: "가입일",
    admin: "관리자 페이지",
    payment: ["결제", "결제"],
    cardHead: "등록된 카드",
    noCard: "등록된 카드가 없어요",
    historyHead: "결제 내역",
    noHistory: "결제 내역이 없어요",
    paymentSoon: "결제는 준비 중이에요",
    blocked: ["차단", "차단"],
    blockedHead: "차단한 사람",
    noRoom: "아직 내 방이 없어요.",
    makeRoom: "방 만들기",
    letters: ["쪽지", "쪽지"],
    lettersHead: "받은 쪽지와 답장",
    received: "받은 쪽지",
    replied: "답장",
    inboxHead: "받은 쪽지",
    unreadBefore: "안 읽은 쪽지 ",
    unreadAfter: "장",
    openInbox: "쪽지함 열기",
    chat: ["대화방", "대화방"],
    chatHead: "대화방",
    isOpen: "열려 있어요",
    isClosed: "닫혀 있어요",
    goChat: "대화방 가기",
    closeChat: "닫기",
    openChat: "열기",
    usersHead: "사용자 관리",
    limited: "제한한 사용자",
    blockedUsers: "차단한 사용자",
    people: (n: number) => `${n}명`,
    usersSoon: "제한과 차단은 준비 중이에요",
    channels: ["채널", "채널"],
    channelsHead: "채널과 영상 가져오기",
    noChannel: "연결한 채널이 없어요",
    importInRoom: "내 방에서 가져오기",
    channelsNote: "채널과 영상은 방 꾸미기의 채널 탭에서 가져와요",
    room: ["내 방", "내 방"],
    visitsHead: "방문 수",
    today: "오늘",
    total: "전체",
    decorateHead: "방 꾸미기",
    decorate: "방 꾸미러 가기",
  },
  en: {
    heading: "MY PAGE",
    close: "Close my page",
    roles: { admin: "Admin", creator: "Creator", public: "Subscriber" } as Record<string, string>,
    account: ["account", "my account"],
    accountHead: "Account",
    name: "Name",
    email: "Email",
    role: "Account type",
    joined: "Joined",
    admin: "Admin page",
    payment: ["payment", "payment"],
    cardHead: "Card",
    noCard: "No card added",
    historyHead: "History",
    noHistory: "No payments yet",
    paymentSoon: "Payments coming soon",
    blocked: ["blocked", "blocked"],
    blockedHead: "Blocked",
    noRoom: "You don't have a room yet.",
    makeRoom: "Make a room",
    letters: ["letters", "letters"],
    lettersHead: "Letters",
    received: "Received",
    replied: "Replied",
    inboxHead: "Inbox",
    unreadBefore: "Unread letters: ",
    unreadAfter: "",
    openInbox: "Open inbox",
    chat: ["chat", "chat room"],
    chatHead: "Chat",
    isOpen: "Open",
    isClosed: "Closed",
    goChat: "Go to chat",
    closeChat: "Close",
    openChat: "Open",
    usersHead: "Users",
    limited: "Limited users",
    blockedUsers: "Blocked users",
    people: (n: number) => String(n),
    usersSoon: "Limits and blocks coming soon",
    channels: ["channels", "channels"],
    channelsHead: "Channels",
    noChannel: "No channels linked",
    importInRoom: "Import in my room",
    channelsNote: "Import channels and videos from the Channel tab in room decorating",
    room: ["my room", "my room"],
    visitsHead: "Visits",
    today: "Today",
    total: "Total",
    decorateHead: "Decorate",
    decorate: "Decorate my room",
  },
};
type MyText = (typeof TEXT)["en"];

export function MyBook({
  account,
  creator,
  blocks,
}: {
  account: MyAccount;
  creator: MyCreatorData | null;
  blocks: MyBlock[];
}) {
  const language = useLanguage();
  const t = TEXT[language];
  const pages = [
    <AccountPage key="account" no={1} account={account} t={t} language={language} />,
    <PaymentPage key="payment" no={2} t={t} />,
    <BlocksPage key="blocks" no={3} blocks={blocks} t={t} />,
  ];
  if (creator) {
    pages.push(
      <NotesPage key="notes" no={4} creator={creator} t={t} language={language} />,
      <ChatPage key="chat" no={5} creator={creator} t={t} />,
      <ChannelsPage key="channels" no={6} creator={creator} t={t} />,
      <RoomPage key="room" no={7} creator={creator} t={t} language={language} />,
    );
  }
  return (
    <Book heading={t.heading} closeLabel={t.close}>
      {pages}
    </Book>
  );
}

// 칸 제목 (설정의 legend 와 같은 모양)
function Head({ children }: { children: ReactNode }) {
  return <h3 className="ob-rounded sb-legend">{children}</h3>;
}

// 수첩의 한 쪽. at: [tag, title]
function Page({ id, no, at, children }: { id: string; no: number; at: string[]; children: ReactNode }) {
  return (
    <BookPage id={id} no={no} tag={at[0]} title={at[1]}>
      {children}
    </BookPage>
  );
}

// 이름: 값 한 줄
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mp-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// 큰 숫자 칸 (방문 수, 쪽지 수)
function Stat({ label, value, language }: { label: string; value: number; language: Language }) {
  return (
    <div className="mp-stat">
      <span className="ob-pixel mp-stat-value">{value.toLocaleString(LOCALES[language])}</span>
      <b className="ob-rounded">{label}</b>
    </div>
  );
}

// 아직 만들지 않은 기능 자리
function Soon({ children }: { children: ReactNode }) {
  return <p className="ob-hand mp-soon">{children}</p>;
}

function AccountPage({ no, account, t, language }: { no: number; account: MyAccount; t: MyText; language: Language }) {
  const role = account.role ?? "public";
  const joined = new Intl.DateTimeFormat(LOCALES[language], { dateStyle: "long", timeZone: "Asia/Seoul" });
  return (
    <Page id="account" no={no} at={t.account}>
      <Head>{t.accountHead}</Head>
      <dl className="mp-list">
        <Row label={t.name}>{account.name}</Row>
        <Row label={t.email}>{account.email}</Row>
        <Row label={t.role}>{t.roles[role] ?? role}</Row>
        <Row label={t.joined}>{joined.format(account.joinedAt)}</Row>
      </dl>
      <div className="mp-actions">
        {account.isAdmin && (
          <Link href={ADMIN_HREF} className="mp-btn">
            {t.admin}
          </Link>
        )}
        <SignOutButton className="mp-btn" />
      </div>
    </Page>
  );
}

// 결제는 Lemon Squeezy 를 검토 중이다 (아직 정하지 않음). 연결 전까지 빈 자리만 보인다.
function PaymentPage({ no, t }: { no: number; t: MyText }) {
  return (
    <Page id="payment" no={no} at={t.payment}>
      <Head>{t.cardHead}</Head>
      <div className="mp-card mp-empty">
        <span className="mp-card-chip" aria-hidden="true" />
        <span>{t.noCard}</span>
      </div>
      <Head>{t.historyHead}</Head>
      <div className="mp-box mp-empty">{t.noHistory}</div>
      <Soon>{t.paymentSoon}</Soon>
    </Page>
  );
}

// 개인 차단 (0013): 방에서 "차단"으로 가린 사람. 풀면 다시 보인다. 쓰기를 막는 크리에이터 차단은 검토 화면에서 푼다.
function BlocksPage({ no, blocks, t }: { no: number; blocks: MyBlock[]; t: MyText }) {
  return (
    <Page id="blocks" no={no} at={t.blocked}>
      <Head>{t.blockedHead}</Head>
      <BlockList blocks={blocks} />
    </Page>
  );
}

// 방이 없을 때 방 만들기로 보내는 칸 (내 방이 필요한 장에서 함께 쓴다)
function NoRoom({ t }: { t: MyText }) {
  return (
    <div className="mp-box mp-empty">
      {t.noRoom}{" "}
      <Link href={MY_ROOM_HREF} className="mp-link">
        {t.makeRoom}
      </Link>
    </div>
  );
}

function NotesPage({ no, creator, t, language }: { no: number; creator: MyCreatorData; t: MyText; language: Language }) {
  const { room, notes } = creator;
  return (
    <Page id="notes" no={no} at={t.letters}>
      <Head>{t.lettersHead}</Head>
      <div className="mp-stats">
        <Stat label={t.received} value={notes.received} language={language} />
        <Stat label={t.replied} value={notes.replied} language={language} />
      </div>
      <Head>{t.inboxHead}</Head>
      {room ? (
        <div className="mp-box">
          <p className="mp-line">
            {t.unreadBefore}
            <b className="ob-pixel mp-accent">{notes.unread}</b>
            {t.unreadAfter}
          </p>
          <Link href={`/room/${room.slug}`} className="mp-btn">
            {t.openInbox}
          </Link>
        </div>
      ) : (
        <NoRoom t={t} />
      )}
    </Page>
  );
}

function ChatPage({ no, creator, t }: { no: number; creator: MyCreatorData; t: MyText }) {
  const open = creator.chat.openRoomId !== null;
  return (
    <Page id="chat" no={no} at={t.chat}>
      <Head>{t.chatHead}</Head>
      <div className="mp-box">
        <p className="mp-line">
          <span className={`mp-dot${open ? " on" : ""}`} aria-hidden="true" />
          {open ? t.isOpen : t.isClosed}
        </p>
        <div className="mp-actions">
          {open && (
            <Link href={`/bubble/${creator.chat.openRoomId}`} className="mp-btn">
              {t.goChat}
            </Link>
          )}
          <Link href={CREATOR_HREF} className="mp-btn">
            {open ? t.closeChat : t.openChat}
          </Link>
        </div>
      </div>
      <Head>{t.usersHead}</Head>
      <dl className="mp-list">
        <Row label={t.limited}>{t.people(0)}</Row>
        <Row label={t.blockedUsers}>{t.people(0)}</Row>
      </dl>
      <Soon>{t.usersSoon}</Soon>
    </Page>
  );
}

function ChannelsPage({ no, creator, t }: { no: number; creator: MyCreatorData; t: MyText }) {
  const { room, channels } = creator;
  return (
    <Page id="channels" no={no} at={t.channels}>
      <Head>{t.channelsHead}</Head>
      {channels.length > 0 ? (
        <ul className="mp-channels">
          {channels.map((channel) => (
            <li key={`${channel.platform}:${channel.url}`}>
              <b className="ob-rounded">{PLATFORM_LABELS[channel.platform]}</b>
              <a href={channel.url} target="_blank" rel="noopener noreferrer" className="mp-link">
                {channel.title || channel.url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mp-box mp-empty">{t.noChannel}</div>
      )}
      <p className="mp-platforms">
        {Object.values(PLATFORM_LABELS).map((label) => (
          <span key={label} className="mp-tag">
            {label}
          </span>
        ))}
      </p>
      {room ? (
        <div className="mp-actions">
          <Link href={`/room/${room.slug}`} className="mp-btn">
            {t.importInRoom}
          </Link>
        </div>
      ) : (
        <NoRoom t={t} />
      )}
      <p className="ob-hand sb-note">{t.channelsNote}</p>
    </Page>
  );
}

function RoomPage({ no, creator, t, language }: { no: number; creator: MyCreatorData; t: MyText; language: Language }) {
  const { room, visits } = creator;
  return (
    <Page id="room" no={no} at={t.room}>
      <Head>{t.visitsHead}</Head>
      <div className="mp-stats">
        <Stat label={t.today} value={visits.today} language={language} />
        <Stat label={t.total} value={visits.total} language={language} />
      </div>
      <Head>{t.decorateHead}</Head>
      {room ? (
        <div className="mp-box">
          <p className="mp-line">
            <b className="ob-rounded">{room.name}</b> <small className="mp-sub">/room/{room.slug}</small>
          </p>
          <Link href={`/room/${room.slug}`} className="mp-btn">
            {t.decorate}
          </Link>
        </div>
      ) : (
        <NoRoom t={t} />
      )}
    </Page>
  );
}
