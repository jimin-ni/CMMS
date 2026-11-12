export const GLOBAL_BOARD = "global";

export type GameStart = { runId: string; seed: number };
export type GameResult = { runId: string; score: number };

export type GameProps = {
  start: GameStart;
  onEnd: (result: GameResult) => void;
};

export type Badge = "admin" | "creator" | "follower";

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  badge: Badge;
};
