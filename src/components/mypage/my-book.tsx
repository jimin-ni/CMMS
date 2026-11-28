"use client";

// 마이페이지 (/mypage): 설정과 같은 클립보드 종이 (틀은 settings/clipboard.tsx, Figma "6차" MYPAGE).
// 모든 계정: ACCOUNT, PAYMENT HISTORY, BLOCKED. 크리에이터와 관리자: CHANNELS, MY ROOM, LETTERS, CHAT 도.
// 글은 설정의 언어를 따른다 (TEXT). 세션 값과 DB 값은 서버(page.tsx)가 읽어 넘긴다.
// 단추: 흰 바탕은 누를 수 있는 동작, 갈색 바탕은 지금 켜진 상태 (예: 연결한 채널).
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Clipboard, Fold, Section } from "@/components/settings/clipboard";
import { SignOutButton } from "@/components/sign-out-button";
import { closeRoomAction } from "@/lib/bubble/actions";
import type { HeapChannelPlatform } from "@/lib/heap/platform";
import { useLanguage, type Language } from "@/lib/settings/prefs";
import { BlockList, type MyBlock } from "./block-list";

export type MyAccount = {
  name: string;
  email: string;
  // 역할 값 (admin, creator, public). 이름은 고른 언어로 여기서 붙인다
  role: string | null;
  joinedAt: Date;
  // 관리자면 ACCOUNT 에 관리자 페이지 단추를 보인다. 접근 권한은 관리자 페이지가 서버에서 다시 확인한다.
  isAdmin: boolean;
};

// 크리에이터·관리자에게만 있는 값. room 이 null 이면 아직 방이 없다.
export type MyCreatorData = {
  room: { slug: string; name: string } | null;
  visits: { today: number; total: number };
  notes: { received: number; unread: number; replied: number };
  chat: { openRoomId: string | null; members: number };
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

// 플랫폼 단추 순서 (Figma: 세 칸씩 두 줄)
const BUTTON_ORDER: HeapChannelPlatform[] = ["youtube", "instagram", "chzzk", "twitch", "soop", "tiktok"];

const MY_ROOM_HREF = "/room/me";
const CREATOR_HREF = "/creator";
// 관리자 페이지. 지금은 AI 스크리닝 검토 화면 하나다 (docs/planning/12-ai-screening.md 11장).
const ADMIN_HREF = "/admin/moderation";

const LOCALES: Record<Language, string> = { ko: "ko-KR", en: "en-US" };

const TEXT = {
  ko: {
    title: "마이페이지",
    close: "마이페이지 닫기",
    roles: { admin: "관리자", creator: "크리에이터", public: "구독자" } as Record<string, string>,
    account: "계정",
    name: "이름",
    email: "이메일",
    role: "역할",
    logout: "로그아웃",
    admin: "관리자 페이지",
    channels: "채널",
    noChannel: "연결한 채널이 없어요",
    room: "내 방",
    today: "오늘 방문",
    total: "전체 방문",
    editRoom: "방 꾸미기",
    makeRoom: "방 만들기",
    payment: "결제 내역",
    viewHistory: "내역 보기",
    noHistory: "결제 내역이 없어요",
    letters: "편지",
    inbox: "받은 편지",
    outbox: "보낸 답장",
    openLetters: "편지함 열기",
    chat: "채팅",
    members: "참여자",
    closeChat: "채팅 닫기",
    closeConfirm: "대화방을 닫을까요? 참여자 모두 더 이상 대화할 수 없어요.",
    openChat: "채팅 열기",
    closed: "닫혀 있어요",
    blocked: "차단",
  },
  en: {
    title: "Mypage",
    close: "Close my page",
    roles: { admin: "Admin", creator: "Creator", public: "Subscriber" } as Record<string, string>,
    account: "Account",
    name: "Name",
    email: "E-mail",
    role: "Role",
    logout: "Logout",
    admin: "Admin page",
    channels: "Channels",
    noChannel: "No channels linked",
    room: "My room",
    today: "Today’s visitors",
    total: "Total visitors",
    editRoom: "Edit room",
    makeRoom: "Make room",
    payment: "Payment history",
    viewHistory: "View history",
    noHistory: "No payments yet",
    letters: "Letters",
    inbox: "Inbox",
    outbox: "Outbox",
    openLetters: "Open letters",
    chat: "Chat",
    members: "Members",
    closeChat: "Close chat",
    closeConfirm: "Close the chat room? No one will be able to talk in it.",
    openChat: "Open chat",
    closed: "Closed",
    blocked: "Blocked",
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
  const role = account.role ?? "public";
  const roomHref = creator?.room ? `/room/${creator.room.slug}` : MY_ROOM_HREF;

  return (
    <Clipboard title={t.title} closeLabel={t.close}>
      <Section head={t.account}>
        <dl className="cb-fields">
          <Field label={t.name}>{account.name}</Field>
          <Field label={t.email}>{account.email}</Field>
          <Field label={t.role}>{t.roles[role] ?? role}</Field>
        </dl>
        <div className="cb-buttons">
          <SignOutButton className="cb-btn" label={t.logout} />
          {account.isAdmin && (
            <Link href={ADMIN_HREF} className="cb-btn">
              {t.admin}
            </Link>
          )}
        </div>
      </Section>

      {creator && <ChannelsSection creator={creator} roomHref={roomHref} t={t} />}

      {creator && (
        <Section head={t.room}>
          <dl className="cb-fields">
            <Field label={t.today}>{creator.visits.today.toLocaleString(LOCALES[language])}</Field>
            <Field label={t.total}>{creator.visits.total.toLocaleString(LOCALES[language])}</Field>
          </dl>
          <div className="cb-buttons">
            <Link href={roomHref} className="cb-btn">
              {creator.room ? t.editRoom : t.makeRoom}
            </Link>
          </div>
        </Section>
      )}

      {/* 결제는 아직 없다 (Lemon Squeezy 검토 중). 펼치면 빈 내역만 보인다 */}
      <Section head={t.payment} brown>
        <Fold label={t.viewHistory}>
          <p className="cb-empty">{t.noHistory}</p>
        </Fold>
      </Section>

      {creator && (
        <Section head={t.letters}>
          <dl className="cb-fields">
            <Field label={t.inbox}>{creator.notes.received.toLocaleString(LOCALES[language])}</Field>
            <Field label={t.outbox}>{creator.notes.replied.toLocaleString(LOCALES[language])}</Field>
          </dl>
          <div className="cb-buttons">
            <Link href={roomHref} className="cb-btn">
              {creator.room ? t.openLetters : t.makeRoom}
            </Link>
          </div>
        </Section>
      )}

      {creator && <ChatSection creator={creator} t={t} language={language} />}

      <Section head={t.blocked}>
        <BlockList blocks={blocks} />
      </Section>
    </Clipboard>
  );
}

// 이름 / 값 한 칸
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cb-field">
      <dt className="cb-label">{label}</dt>
      <dd className="cb-value">{children}</dd>
    </div>
  );
}

// 연결한 채널(이름과 주소) 세 칸까지, 그 아래 플랫폼 단추 여섯 개.
// 연결한 플랫폼은 갈색(켜짐)이고 누르면 그 채널을 연다. 연결하지 않은 플랫폼은 흰색이고 누르면 내 방(채널 가져오기)으로 간다.
function ChannelsSection({ creator, roomHref, t }: { creator: MyCreatorData; roomHref: string; t: MyText }) {
  const { channels } = creator;
  return (
    <Section head={t.channels}>
      {channels.length > 0 ? (
        <dl className="cb-fields">
          {channels.map((c) => (
            <Field key={`${c.platform}:${c.url}`} label={PLATFORM_LABELS[c.platform]}>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="cb-value-link">
                {c.title || c.url}
              </a>
            </Field>
          ))}
        </dl>
      ) : (
        <p className="cb-empty">{t.noChannel}</p>
      )}
      <div className="cb-buttons">
        {BUTTON_ORDER.map((platform) => {
          const linked = channels.find((c) => c.platform === platform);
          return linked ? (
            <a key={platform} href={linked.url} target="_blank" rel="noopener noreferrer" className="cb-btn on">
              {PLATFORM_LABELS[platform]}
            </a>
          ) : (
            <Link key={platform} href={roomHref} className="cb-btn">
              {PLATFORM_LABELS[platform]}
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

// 열린 대화방의 참여자 수와 닫기. 닫혀 있으면 크리에이터 화면(/creator)에서 연다 (방 이름이 필요하다)
function ChatSection({ creator, t, language }: { creator: MyCreatorData; t: MyText; language: Language }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const { openRoomId, members } = creator.chat;
  return (
    <Section head={t.chat}>
      <dl className="cb-fields">
        <Field label={t.members}>{openRoomId ? members.toLocaleString(LOCALES[language]) : t.closed}</Field>
      </dl>
      <div className="cb-buttons">
        {openRoomId ? (
          <button
            type="button"
            className="cb-btn"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t.closeConfirm)) return;
              start(async () => {
                const res = await closeRoomAction(openRoomId);
                if (res.ok) {
                  setError("");
                  router.refresh();
                } else setError(res.error);
              });
            }}
          >
            {t.closeChat}
          </button>
        ) : (
          <Link href={CREATOR_HREF} className="cb-btn">
            {t.openChat}
          </Link>
        )}
      </div>
      {error && (
        <p className="cb-error" role="status">
          {error}
        </p>
      )}
    </Section>
  );
}
