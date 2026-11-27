// 미니룸 채팅 창(chat-dock.tsx, dock-chat.tsx)이 함께 쓰는 배지와 둥근 프로필 사진

// 채팅 창을 펴는 window 이벤트. 방 안의 휴대폰(heap-room.tsx)과 로그인 팝업(room-tour.tsx)이 보낸다.
export const CHAT_DOCK_OPEN = "chat-dock:open";

export function Badge({ count, className = "" }: { count: number; className?: string }) {
  const text = count > 999 ? "999+" : String(count);
  return (
    <span
      className={`flex size-[18px] items-center justify-center rounded-full bg-rewards-red font-[family-name:var(--font-display)] leading-none font-bold text-white ${
        text.length > 2 ? "text-[7px]" : "text-[9.5px]"
      } ${className}`}
    >
      {text}
    </span>
  );
}

// 둥근 프로필 사진. 사진이 없으면 이름 첫 글자.
export function DockAvatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) {
    // DB에 저장한 사진을 API 주소로 바로 보여준다. next/image 최적화 대상이 아니다.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="block shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-white font-[family-name:var(--font-display)] text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {Array.from(name)[0] ?? "?"}
    </span>
  );
}
