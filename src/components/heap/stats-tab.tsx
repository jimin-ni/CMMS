"use client";

import { useEffect, useState } from "react";

// 꾸미기 독의 통계 탭 (DECISIONS M). 최근 7일 또는 30일에 방문자가 연 링크와 카드를 많은 순서로 보여 준다.
// 숫자는 근사값이다. 주인 본인의 열람은 세지 않는다. 읽기는 주인 전용 GET 라우트(api/heap/rooms/[roomId]/opens)가 한다.

type LinkRow = { target: string; opens: number };
type ReelRow = { target: string; opens: number; title?: string };
type Stats = { links: LinkRow[]; reels: ReelRow[] };

const EMPTY = "아직 열어 본 사람이 없어요";
const DAYS = [7, 30] as const;

// 앞의 https://, www., mailto: 를 떼고 길면 줄인다. 전체 주소는 title 로 둔다.
function shortLink(u: string): string {
  const t = u.replace(/^(https?:\/\/(www\.)?|mailto:)/i, "").replace(/\/$/, "");
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

function RankList({ heading, rows }: { heading: string; rows: { key: string; label: string; full: string; opens: number }[] }) {
  return (
    <section className="min-w-0 flex-1 overflow-y-auto">
      <h3 className="mb-1 text-[13px] font-semibold">{heading}</h3>
      {rows.length === 0 ? (
        <p className="note">{EMPTY}</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-baseline gap-2 py-0.5 text-[12.5px]">
              <span className="w-5 flex-none text-right opacity-60">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate" title={r.full}>
                {r.label}
              </span>
              <b className="flex-none tabular-nums">{r.opens}회</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function StatsTab({ roomUuid }: { roomUuid: string }) {
  const [days, setDays] = useState<(typeof DAYS)[number]>(7);
  // 답은 어느 기간의 것인지와 함께 둔다. 기간이 바뀌면 옛 답은 저절로 "불러오는 중"이 된다.
  const [res, setRes] = useState<{ days: number; stats?: Stats; error?: string } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/heap/rooms/${encodeURIComponent(roomUuid)}/opens?days=${days}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Partial<Stats>;
        setRes({ days, stats: { links: Array.isArray(d.links) ? d.links : [], reels: Array.isArray(d.reels) ? d.reels : [] } });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.warn("[heap-room] 통계를 읽지 못했어요", e);
        setRes({ days, error: "통계를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요." });
      });
    return () => ac.abort();
  }, [roomUuid, days]);

  const cur = res && res.days === days ? res : null;
  const stats = cur?.stats ?? null;
  const error = cur?.error ?? "";

  return (
    <div className="ed-pane flex-col">
      <div className="flex flex-none items-center gap-1">
        {DAYS.map((d) => (
          <button key={d} type="button" className="ed-chip" aria-pressed={days === d} onClick={() => setDays(d)}>
            {d}일
          </button>
        ))}
        <span className="pl-2 text-[12px] opacity-60">방문자가 연 횟수 · 내가 연 것은 빼요</span>
      </div>
      {error ? (
        <p className="note ed-bad" role="status">
          {error}
        </p>
      ) : !stats ? (
        <p className="note" role="status">
          불러오는 중…
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <RankList heading="링크" rows={stats.links.map((r) => ({ key: r.target, label: shortLink(r.target), full: r.target, opens: r.opens }))} />
          <RankList heading="카드" rows={stats.reels.map((r) => ({ key: r.target, label: r.title || r.target, full: r.target, opens: r.opens }))} />
        </div>
      )}
    </div>
  );
}
