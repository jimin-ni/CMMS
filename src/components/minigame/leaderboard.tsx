import { PlayerBadge } from "@/components/minigame/player-badge";
import type { LeaderboardEntry } from "@/lib/minigame/contract";

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] | null }) {
  if (!entries) return <p className="text-sm text-key-stone">불러오는 중...</p>;
  if (entries.length === 0) return <p className="text-sm text-key-stone">아직 기록이 없습니다.</p>;

  return (
    <ol className="flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.rank}
          className="flex items-center gap-3 border-t border-key-mist py-2 first:border-t-0"
        >
          <span className="w-6 text-sm text-key-stone">{entry.rank}</span>
          <PlayerBadge badge={entry.badge} />
          <span className="min-w-0 flex-1 wrap-anywhere text-key-brown">{entry.username}</span>
          <span className="font-semibold text-key-brown tabular-nums">{entry.score}</span>
        </li>
      ))}
    </ol>
  );
}
