import { GAMES, type GameId } from "@/lib/sicham/mock";

// 실제 방송 섬네일 대역. 이미지가 없으므로 게임별 그라데이션 + 이모지로 구분합니다.
export function Thumbnail({
  gameId,
  live,
  viewers,
  size = "md",
}: {
  gameId: GameId;
  live?: boolean;
  viewers?: number;
  size?: "sm" | "md";
}) {
  const game = GAMES[gameId];
  const emojiSize = size === "sm" ? "text-3xl" : "text-5xl";

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl"
      style={{ background: `linear-gradient(135deg, ${game.from}, ${game.to})` }}
    >
      <span className={emojiSize} aria-hidden>
        {game.emoji}
      </span>

      {live && (
        <span className="absolute top-1.5 left-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          LIVE
        </span>
      )}

      {typeof viewers === "number" && (
        <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
          👁 {viewers.toLocaleString()}
        </span>
      )}
    </div>
  );
}
