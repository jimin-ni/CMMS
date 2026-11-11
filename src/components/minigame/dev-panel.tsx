"use client";

import { useState } from "react";
import type { GameStart } from "@/lib/minigame/contract";

export type DevPlayer = { id: string; name: string; roleLabel: string };

type DevPanelProps = {
  players: DevPlayer[];
  playerId: string;
  onPlayerChange: (id: string) => void;
  run: GameStart | null;
};

export function DevPanel({ players, playerId, onPlayerChange, run }: DevPanelProps) {
  const [open, setOpen] = useState(false);
  const player = players.find((candidate) => candidate.id === playerId) ?? players[0];

  return (
    <aside className="fixed top-20 right-4 z-10 flex flex-col items-end gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-full bg-key-blue px-4 py-1.5 text-sm text-key-brown shadow-sm"
      >
        개발 도구
      </button>
      {open && (
        <div className="flex w-64 flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <span className="w-fit rounded-full bg-key-blue px-2.5 py-0.5 text-sm text-key-brown">
            {player.roleLabel}
          </span>
          <label className="flex flex-col gap-1 text-sm">
            모의 플레이어
            <select
              value={playerId}
              disabled={run !== null}
              onChange={(event) => onPlayerChange(event.target.value)}
              className="rounded-lg border border-key-stone/50 px-3 py-2"
            >
              {players.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          {run && (
            <p className="text-xs break-all text-key-stone">
              runId {run.runId} · seed {run.seed}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
