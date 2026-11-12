import Link from "next/link";
import { OpenAlert } from "@/components/sicham/open-alert";
import { Thumbnail } from "@/components/sicham/thumbnail";
import {
  CREATORS,
  GAME_ORDER,
  GAMES,
  creatorName,
  liveFollowedCreators,
  streamsByGame,
} from "@/lib/sicham/mock";

function FollowedCreatorsRow() {
  const creators = liveFollowedCreators();

  return (
    <section>
      <h2 className="text-lg font-semibold text-key-brown">팔로우한 크리에이터</h2>
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
        {creators.map((creator) => {
          const inner = (
            <div className="flex w-28 shrink-0 flex-col items-center gap-2">
              <div
                className={`aspect-video w-full ${
                  creator.live ? "" : "opacity-40 grayscale"
                }`}
              >
                {creator.live && creator.gameId ? (
                  <Thumbnail
                    gameId={creator.gameId}
                    live
                    viewers={creator.viewers}
                    size="sm"
                  />
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center rounded-xl bg-key-stone/30 text-3xl">
                    {creator.avatar}
                    {creator.scheduled && (
                      <span className="absolute top-1 left-1 rounded-full bg-key-brown px-1.5 py-0.5 text-[10px] text-key-mist">
                        예약
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-center">
                <p className="truncate text-sm font-medium text-key-brown">
                  {creator.avatar} {creator.name}
                </p>
                <p className="text-xs text-key-stone">
                  {creator.live && creator.gameId
                    ? GAMES[creator.gameId].title
                    : creator.scheduled
                      ? "⏰ 예약 모집중"
                      : "오프라인"}
                </p>
              </div>
            </div>
          );

          return creator.live && creator.streamId ? (
            <Link
              key={creator.id}
              href={`/sicham/${creator.streamId}`}
              className="rounded-xl transition hover:-translate-y-0.5"
            >
              {inner}
            </Link>
          ) : (
            <div key={creator.id} className="cursor-default">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GameList() {
  return (
    <section className="mt-10 space-y-8">
      <h2 className="text-lg font-semibold text-key-brown">시참 모집 중인 방송</h2>

      {GAME_ORDER.map((gameId) => {
        const game = GAMES[gameId];
        const streams = streamsByGame(gameId);

        return (
          <div key={gameId}>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white"
                style={{ background: `linear-gradient(135deg, ${game.from}, ${game.to})` }}
              >
                <span aria-hidden>{game.emoji}</span>
                {game.title}
              </span>
              <span className="text-xs text-key-stone">
                {game.genre} · 한 판 {game.slots}자리
              </span>
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {streams.map((stream) => {
                const host = creatorName(stream.creatorId);
                return (
                  <Link
                    key={stream.id}
                    href={`/sicham/${stream.id}`}
                    className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="aspect-video">
                      <Thumbnail gameId={stream.gameId} live viewers={stream.viewers} />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="line-clamp-2 text-sm font-semibold text-key-brown">
                        {stream.title}
                      </p>
                      <p className="mt-1 text-xs text-key-stone">
                        {host.avatar} {host.name}
                      </p>
                      <div className="mt-3 flex items-center gap-2 border-t border-key-mist pt-3">
                        <span className="rounded-full bg-key-blue/30 px-2.5 py-0.5 text-xs font-medium text-key-brown">
                          {stream.lookingFor}자리 모집중
                        </span>
                        <span className="text-xs text-key-stone">
                          대기 {stream.waiting}명
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function Hub() {
  const liveCount = CREATORS.filter((creator) => creator.live).length;

  return (
    <>
      <OpenAlert avatar="🦋" name="별빛나비" game="펍지(PUBZ)" streamId="s-nabi" />

      <div>
        <h1 className="text-2xl font-bold text-key-brown">시참 · 시청자 참여</h1>
        <p className="mt-1 text-key-stone">
          팔로우한 크리에이터의 방송과, 함께 게임할 시청자를 찾는 방을 모았습니다.
          지금 {liveCount}명이 방송 중입니다.
        </p>
      </div>

      <div className="mt-8">
        <FollowedCreatorsRow />
      </div>

      <GameList />
    </>
  );
}
