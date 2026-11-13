import Link from "next/link";
import type { HeapRoomCard } from "@/lib/heap/repo";

// 방 카드 위쪽 색. 방 주소로 하나를 고른다 (시참 목록의 섬네일 대역처럼 이미지 없이 색으로 구분한다).
const GRADIENTS: readonly [string, string][] = [
  ["#565344", "#7d7860"],
  ["#A6613C", "#c98a5f"],
  ["#6b4e37", "#9a7656"],
  ["#4f6a62", "#7f9a8f"],
];

function gradientFor(slug: string): string {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const [from, to] = GRADIENTS[hash % GRADIENTS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

// 방이 바뀌었을 때 카드 모서리에 찍는 점. 상위의 group/dots가 data-dots="off"이면 숨는다 (followed-rooms.tsx).
function UpdateDot() {
  return (
    <span
      role="img"
      aria-label="새 소식"
      className="absolute top-1.5 right-1.5 h-3 w-3 rounded-full bg-orange-500 ring-2 ring-white group-data-[dots=off]/dots:hidden"
    />
  );
}

// 시참 목록 카드(둥근 흰 카드, 위쪽 색 섬네일, 아래 글)를 따른다. compact는 가로로 넘기는 줄에 쓰는 작은 카드다.
export function RoomCard({
  room,
  changed = false,
  compact = false,
}: {
  room: HeapRoomCard;
  changed?: boolean;
  compact?: boolean;
}) {
  const initial = Array.from(room.name)[0] ?? "?";
  return (
    <Link
      href={`/room/${room.slug}`}
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md ${
        compact ? "w-40 shrink-0" : ""
      }`}
    >
      <div
        className="relative flex aspect-video items-center justify-center"
        style={{ background: gradientFor(room.slug) }}
      >
        <span aria-hidden className={`font-bold text-white/90 ${compact ? "text-3xl" : "text-5xl"}`}>
          {initial}
        </span>
        {changed && <UpdateDot />}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="truncate text-sm font-semibold text-key-brown">{room.name}</p>
        <p className="mt-0.5 truncate text-xs text-key-stone">{room.creatorName}</p>
        {!compact && room.blurb && <p className="mt-2 line-clamp-2 text-xs text-key-stone">{room.blurb}</p>}
      </div>
    </Link>
  );
}
