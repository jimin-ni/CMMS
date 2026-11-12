import { randomInt, randomUUID } from "node:crypto";
import type { Badge, GameStart, LeaderboardEntry } from "./contract";

export type MockPlayer = { id: string; name: string; role: string };

type Run = { id: string; gameId: string; boardId: string; playerId: string; submitted: boolean };
type Score = { gameId: string; boardId: string; playerId: string; score: number };

export type SubmitOutcome = "ok" | "not_found" | "forbidden" | "duplicate";

const LEADERBOARD_SIZE = 10;

export const MOCK_PLAYERS: MockPlayer[] = [
  { id: "mock-admin", name: "운영자", role: "admin" },
  { id: "mock-creator", name: "별빛아래노래하는크리에이터", role: "creator" },
  { id: "mock-fan", name: "토끼", role: "public" },
  { id: "mock-fan-long", name: "averyveryverylongnickname", role: "public" },
];

function seedScores(): Score[] {
  return [
    { playerId: "mock-creator", score: 2400 },
    { playerId: "mock-fan-long", score: 1800 },
    { playerId: "mock-admin", score: 1200 },
    { playerId: "mock-fan", score: 600 },
  ].map((entry) => ({ ...entry, gameId: "stub", boardId: "global" }));
}

// Route handlers can load as separate module instances in dev, so the state lives on globalThis.
const globalForStore = globalThis as unknown as {
  minigameStore?: { runs: Map<string, Run>; scores: Score[] };
};
const store = (globalForStore.minigameStore ??= { runs: new Map(), scores: seedScores() });

// Stands in for auth.api.getSession until the score API and local auth are connected.
export function resolveMockPlayer(request: Request): MockPlayer | undefined {
  const id = request.headers.get("x-mock-player");
  return MOCK_PLAYERS.find((player) => player.id === id);
}

export function openRun(gameId: string, boardId: string, playerId: string): GameStart {
  const run = { id: randomUUID(), gameId, boardId, playerId, submitted: false };
  store.runs.set(run.id, run);
  return { runId: run.id, seed: randomInt(2 ** 31) };
}

export function submitScore(runId: string, playerId: string, score: number): SubmitOutcome {
  const run = store.runs.get(runId);
  if (!run) return "not_found";
  if (run.playerId !== playerId) return "forbidden";
  if (run.submitted) return "duplicate";

  run.submitted = true;
  store.scores.push({ gameId: run.gameId, boardId: run.boardId, playerId, score });
  return "ok";
}

function toBadge(role: string): Badge {
  if (role === "admin") return "admin";
  return role === "creator" ? "creator" : "follower";
}

export function getLeaderboard(gameId: string, boardId: string): LeaderboardEntry[] {
  const bestByPlayer = new Map<string, number>();
  for (const entry of store.scores) {
    if (entry.gameId !== gameId || entry.boardId !== boardId) continue;
    bestByPlayer.set(entry.playerId, Math.max(bestByPlayer.get(entry.playerId) ?? 0, entry.score));
  }

  return [...bestByPlayer]
    .sort(([, a], [, b]) => b - a)
    .slice(0, LEADERBOARD_SIZE)
    .flatMap(([playerId, score], index) => {
      const player = MOCK_PLAYERS.find((candidate) => candidate.id === playerId);
      if (!player) return [];
      return [{ rank: index + 1, username: player.name, score, badge: toBadge(player.role) }];
    });
}
