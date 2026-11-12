"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DevPanel, type DevPlayer } from "@/components/minigame/dev-panel";
import { Leaderboard } from "@/components/minigame/leaderboard";
import { StubGame } from "@/components/minigame/stub-game";
import type { GameResult, GameStart, LeaderboardEntry } from "@/lib/minigame/contract";

const GAME_ID = "stub";

const TABS = [
  { id: "game", label: "게임" },
  { id: "leaderboard", label: "전체 순위" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Arcade({ players }: { players: DevPlayer[] }) {
  const [playerId, setPlayerId] = useState(players[0].id);
  const [start, setStart] = useState<GameStart | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [boardVersion, setBoardVersion] = useState(0);
  const [tab, setTab] = useState<TabId>("game");

  useEffect(() => {
    fetch(`/api/minigames/${GAME_ID}/leaderboard?board=global`).then(async (response) => {
      if (!response.ok) {
        setErrorMessage("순위를 불러오지 못했습니다.");
        return;
      }
      const body: { entries: LeaderboardEntry[] } = await response.json();
      setEntries(body.entries);
    });
  }, [boardVersion]);

  async function startRun() {
    setErrorMessage(null);
    const response = await fetch(`/api/minigames/${GAME_ID}/runs`, {
      method: "POST",
      headers: { "x-mock-player": playerId },
    });
    if (!response.ok) {
      setErrorMessage("게임을 시작하지 못했습니다.");
      return;
    }
    setStart(await response.json());
  }

  async function submitResult(result: GameResult) {
    const response = await fetch(`/api/minigames/runs/${result.runId}/score`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mock-player": playerId },
      body: JSON.stringify(result),
    });
    setStart(null);
    if (!response.ok) {
      setErrorMessage("점수를 저장하지 못했습니다.");
      return;
    }
    setBoardVersion((version) => version + 1);
  }

  return (
    <>
      <div className="w-full max-w-md">
        <Link
          href="/features"
          className="inline-block rounded-full bg-white px-5 py-2 text-sm text-key-brown shadow-sm"
        >
          주요 기능으로 돌아가기
        </Link>

        <section className="mt-4 rounded-2xl bg-white p-8 shadow-sm">
          <div role="tablist" className="flex justify-center gap-2">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-full px-5 py-2 text-sm ${
                  tab === id ? "bg-key-brown text-key-mist" : "bg-key-mist text-key-brown"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div hidden={tab !== "game"} className="mt-6">
            <div className="flex min-h-48 flex-col items-center justify-center">
              {start ? (
                <StubGame key={start.runId} start={start} onEnd={submitResult} />
              ) : (
                <button
                  type="button"
                  onClick={startRun}
                  className="rounded-full bg-key-brown px-5 py-2 text-key-mist"
                >
                  게임 시작
                </button>
              )}
            </div>
          </div>

          <div hidden={tab !== "leaderboard"} className="mt-6 min-h-48">
            <Leaderboard entries={entries} />
          </div>

          {errorMessage && <p className="mt-4 text-sm text-red-700">{errorMessage}</p>}
        </section>
      </div>

      <DevPanel players={players} playerId={playerId} onPlayerChange={setPlayerId} run={start} />
    </>
  );
}
