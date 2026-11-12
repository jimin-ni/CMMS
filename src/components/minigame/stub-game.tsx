"use client";

import { useState } from "react";
import type { GameProps } from "@/lib/minigame/contract";

export function StubGame({ start, onEnd }: GameProps) {
  const [score, setScore] = useState(0);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-3xl font-bold text-key-brown">{score}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setScore((current) => current + 100)}
          className="rounded-full bg-key-blue px-5 py-2 text-key-brown"
        >
          +100점
        </button>
        <button
          type="button"
          onClick={() => onEnd({ runId: start.runId, score })}
          className="rounded-full bg-key-brown px-5 py-2 text-key-mist"
        >
          게임 종료
        </button>
      </div>
    </div>
  );
}
