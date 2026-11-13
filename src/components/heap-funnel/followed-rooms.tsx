"use client";

import { useSyncExternalStore } from "react";

// "따라가는 방" 줄의 틀. 업데이트 점을 켜고 끄는 스위치를 두고, 고른 값은 이 브라우저의 localStorage에 남긴다.
// 점 자체는 서버가 그린 카드 안에 있고, 이 틀의 data-dots 값으로 숨긴다 (room-card.tsx).
// localStorage를 못 쓰는 브라우저(사생활 보호 모드 등)에서는 이 탭이 열려 있는 동안만 기억한다.
const STORAGE_KEY = "heap-rooms-dots";
const CHANGE_EVENT = "heap-rooms-dots-change";
let memoryValue: "on" | "off" = "on";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readDotsOn(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "on" || stored === "off") memoryValue = stored;
  } catch {
    // 읽지 못하면 메모리 값을 쓴다.
  }
  return memoryValue === "on";
}

function writeDotsOn(on: boolean): void {
  memoryValue = on ? "on" : "off";
  try {
    window.localStorage.setItem(STORAGE_KEY, memoryValue);
  } catch {
    // 저장하지 못해도 이 탭에서는 바뀐 값이 유지된다.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function FollowedRooms({
  title,
  hasDots,
  children,
}: {
  title: string;
  // 점이 찍힌 방이 하나라도 있는지. 없으면 스위치를 보여 주지 않는다.
  hasDots: boolean;
  children: React.ReactNode;
}) {
  // 서버가 그릴 때와 처음 그릴 때는 점을 켠 상태다. 저장된 값은 그 뒤에 반영된다.
  const dotsOn = useSyncExternalStore(subscribe, readDotsOn, () => true);

  return (
    <section data-dots={dotsOn ? "on" : "off"} className="group/dots">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-key-brown">{title}</h2>
        {hasDots && (
          <button
            type="button"
            role="switch"
            aria-checked={dotsOn}
            onClick={() => writeDotsOn(!dotsOn)}
            className="rounded-full bg-white px-3 py-1 text-xs text-key-brown shadow-sm"
          >
            새 소식 점 {dotsOn ? "끄기" : "켜기"}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
