"use client";

import Link from "next/link";
import { useState } from "react";

// 팔로워 알림 "시참 열림" 의 화면 모양 데모.
// 실제로는 실시간 푸시(폴링→SSE, 페이지 밖은 크롬 토스트)로 도착합니다.
export function OpenAlert({
  avatar,
  name,
  game,
  streamId,
}: {
  avatar: string;
  name: string;
  game: string;
  streamId: string;
}) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-key-blue/30 px-4 py-3">
      <span className="text-sm text-key-brown">
        🔔 {avatar} <b>{name}</b> 님이 {game} 시참을 열었어요.
      </span>
      <span className="flex shrink-0 gap-2">
        <Link
          href={`/sicham/${streamId}`}
          className="rounded-full bg-key-brown px-3 py-1 text-xs text-key-mist"
        >
          보러가기
        </Link>
        <button
          type="button"
          onClick={() => setShown(false)}
          aria-label="닫기"
          className="rounded-full bg-white/70 px-2 py-1 text-xs text-key-stone"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
