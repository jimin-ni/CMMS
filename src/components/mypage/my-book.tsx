import Link from "next/link";
import type { ReactNode } from "react";
import { Book, BookPage } from "@/components/settings/book";
import { SignOutButton } from "@/components/sign-out-button";
import type { HeapChannelPlatform } from "@/lib/heap/platform";

// 마이페이지 (/mypage): 설정과 같은 책상 위의 세로 책자 (틀은 settings/book.tsx).
// 모든 계정: 계정 정보와 로그아웃, 결제 정보. 크리에이터와 관리자: 쪽지, 대화방, 채널, 내 방.
// 지금은 화면 구성만 잡는다. 상세 기능은 기존 화면(/creator, 방의 꾸미기)으로 보내거나 "준비 중"으로 둔다.

export type MyAccount = {
  name: string;
  email: string;
  roleLabel: string;
  joinedAt: Date;
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

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" });

export function MyBook({ account, creator }: { account: MyAccount; creator: MyCreatorData | null }) {
  const pages = [
    <AccountPage key="account" no={1} account={account} />,
    <PaymentPage key="payment" no={2} />,
  ];
  if (creator) {
    pages.push(
      <NotesPage key="notes" no={3} creator={creator} />,
      <ChatPage key="chat" no={4} creator={creator} />,
      <ChannelsPage key="channels" no={5} creator={creator} />,
      <RoomPage key="room" no={6} creator={creator} />,
    );
  }
  return (
    <Book heading="MY PAGE" closeLabel="마이페이지 닫기">
      {pages}
    </Book>
  );
}

// 칸 제목 (설정의 legend 와 같은 모양)
function Head({ ko, en }: { ko: string; en: string }) {
  return (
    <h3 className="ob-rounded sb-legend">
      {ko} <small>{en}</small>
    </h3>
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
function Stat({ label, sub, value }: { label: string; sub: string; value: number }) {
  return (
    <div className="mp-stat">
      <span className="ob-pixel mp-stat-value">{value.toLocaleString("ko-KR")}</span>
      <b className="ob-rounded">{label}</b>
      <small>{sub}</small>
    </div>
  );
}

// 아직 만들지 않은 기능 자리
function Soon({ children }: { children: ReactNode }) {
  return <p className="ob-hand mp-soon">{children}</p>;
}

function AccountPage({ no, account }: { no: number; account: MyAccount }) {
  return (
    <BookPage id="account" no={no} tag="account" title="my account">
      <Head ko="계정 정보" en="Account" />
      <dl className="mp-list">
        <Row label="이름">{account.name}</Row>
        <Row label="이메일">{account.email}</Row>
        <Row label="계정 종류">{account.roleLabel}</Row>
        <Row label="가입일">{dateFormat.format(account.joinedAt)}</Row>
      </dl>
      <div className="mp-actions">
        <SignOutButton className="mp-btn" />
      </div>
    </BookPage>
  );
}

// 결제는 Lemon Squeezy 를 검토 중이다 (아직 정하지 않음). 연결 전까지 빈 자리만 보인다.
function PaymentPage({ no }: { no: number }) {
  return (
    <BookPage id="payment" no={no} tag="payment" title="payment">
      <Head ko="등록된 카드" en="Card" />
      <div className="mp-card mp-empty">
        <span className="mp-card-chip" aria-hidden="true" />
        <span>등록된 카드가 없어요</span>
      </div>
      <Head ko="결제 내역" en="History" />
      <div className="mp-box mp-empty">결제 내역이 없어요</div>
      <Soon>결제는 준비 중이에요</Soon>
    </BookPage>
  );
}

// 방이 없을 때 방 만들기로 보내는 칸 (내 방이 필요한 장에서 함께 쓴다)
function NoRoom() {
  return (
    <div className="mp-box mp-empty">
      아직 내 방이 없어요.{" "}
      <Link href={MY_ROOM_HREF} className="mp-link">
        방 만들기
      </Link>
    </div>
  );
}

function NotesPage({ no, creator }: { no: number; creator: MyCreatorData }) {
  const { room, notes } = creator;
  return (
    <BookPage id="notes" no={no} tag="letters" title="letters">
      <Head ko="받은 쪽지와 답장" en="Letters" />
      <div className="mp-stats">
        <Stat label="받은 쪽지" sub="Received" value={notes.received} />
        <Stat label="답장" sub="Replied" value={notes.replied} />
      </div>
      <Head ko="받은 쪽지" en="Inbox" />
      {room ? (
        <div className="mp-box">
          <p className="mp-line">
            안 읽은 쪽지 <b className="ob-pixel mp-accent">{notes.unread}</b>장
          </p>
          <Link href={`/room/${room.slug}`} className="mp-btn">
            쪽지함 열기
          </Link>
        </div>
      ) : (
        <NoRoom />
      )}
    </BookPage>
  );
}

function ChatPage({ no, creator }: { no: number; creator: MyCreatorData }) {
  const open = creator.chat.openRoomId !== null;
  return (
    <BookPage id="chat" no={no} tag="chat" title="chat room">
      <Head ko="대화방" en="Chat" />
      <div className="mp-box">
        <p className="mp-line">
          <span className={`mp-dot${open ? " on" : ""}`} aria-hidden="true" />
          {open ? "열려 있어요" : "닫혀 있어요"}
        </p>
        <div className="mp-actions">
          {open && (
            <Link href={`/bubble/${creator.chat.openRoomId}`} className="mp-btn">
              대화방 가기
            </Link>
          )}
          <Link href={CREATOR_HREF} className="mp-btn">
            {open ? "닫기" : "열기"}
          </Link>
        </div>
      </div>
      <Head ko="사용자 관리" en="Users" />
      <dl className="mp-list">
        <Row label="제한한 사용자">0명</Row>
        <Row label="차단한 사용자">0명</Row>
      </dl>
      <Soon>제한과 차단은 준비 중이에요</Soon>
    </BookPage>
  );
}

function ChannelsPage({ no, creator }: { no: number; creator: MyCreatorData }) {
  const { room, channels } = creator;
  return (
    <BookPage id="channels" no={no} tag="channels" title="channels">
      <Head ko="채널과 영상 가져오기" en="Channels" />
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
        <div className="mp-box mp-empty">연결한 채널이 없어요</div>
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
            내 방에서 가져오기
          </Link>
        </div>
      ) : (
        <NoRoom />
      )}
      <p className="ob-hand sb-note">채널과 영상은 방 꾸미기의 채널 탭에서 가져와요</p>
    </BookPage>
  );
}

function RoomPage({ no, creator }: { no: number; creator: MyCreatorData }) {
  const { room, visits } = creator;
  return (
    <BookPage id="room" no={no} tag="my room" title="my room">
      <Head ko="방문 수" en="Visits" />
      <div className="mp-stats">
        <Stat label="오늘" sub="Today" value={visits.today} />
        <Stat label="전체" sub="Total" value={visits.total} />
      </div>
      <Head ko="방 꾸미기" en="Decorate" />
      {room ? (
        <div className="mp-box">
          <p className="mp-line">
            <b className="ob-rounded">{room.name}</b> <small className="mp-sub">/room/{room.slug}</small>
          </p>
          <Link href={`/room/${room.slug}`} className="mp-btn">
            방 꾸미러 가기
          </Link>
        </div>
      ) : (
        <NoRoom />
      )}
    </BookPage>
  );
}
