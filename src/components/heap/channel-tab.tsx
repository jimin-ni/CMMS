"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectYoutubeChannelAction,
  excludeReelAction,
  restoreReelAction,
  type ConnectChannelResult,
} from "@/lib/heap/funnel-actions";
import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";
import { REEL_CLASSES, type ReelClass } from "@/lib/heap/caps";
import type { HeapOwnerData } from "./heap-room";

// 꾸미기 독의 채널 탭 (판정 J6). 방 주인의 연결한 채널, 채널 연결(유튜브 주소 또는 @핸들), 가져온 영상 목록과 영상마다 빼기·되돌리기.
// 쓰기는 서버 액션(funnel-actions.ts)이 하고, 방은 서버가 세션으로 찾는다. 성공하면 router.refresh() 로 새 스냅샷을 받는다:
// 이 탭의 목록은 page.tsx 가 다시 읽은 값이고, 방의 더미는 heap-room.tsx 가 heap:reels 로 엔진에 넘긴다 (엔진은 다시 뜨지 않는다).
// 채널이 정말 이 크리에이터의 것인지는 확인하지 않는다 (판정 I1). 다른 크리에이터가 이미 연결한 채널만 거절한다.

const KIND_NAME: Record<ReelClass, string> = { shorts: "쇼츠", long: "롱폼", instagram: "인스타그램" };
const PLATFORM_NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
// 목록에 한 번에 그리는 줄 수. 넘치면 검색으로 좁힌다.
const LIST_MAX = 150;

const caps = HEAP_FUNNEL_POLICY.importCaps;

// "3분 20초" 꼴
function waitText(sec: number): string {
  const s = Math.max(1, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return m > 0 ? (s % 60 ? `${m}분 ${s % 60}초` : `${m}분`) : `${s}초`;
}

// 연결 결과를 한 줄로. 실패는 서버가 준 문구(messages.ts)를 쓰고, 기다려야 하면 남은 시간을 붙인다.
function connectText(r: ConnectChannelResult): string {
  if (!r.ok) {
    if (r.reason === "import-too-soon") return `${r.message} (${waitText(r.retryAfterSec)} 뒤에 다시 할 수 있어요)`;
    return r.message;
  }
  const parts = [`「${r.channel.title}」 채널을 연결했어요`];
  if (r.fetched === 0) parts.push("가져올 수 있는 공개 영상이 없었어요");
  else {
    parts.push(`새로 넣은 영상: 쇼츠 ${r.added.shorts}개, 롱폼 ${r.added.long}개`);
    if (r.refreshed) parts.push(`정보를 새로 고친 영상 ${r.refreshed}개`);
    if (r.skippedByCap) parts.push(`상한이 차서 넣지 않은 영상 ${r.skippedByCap}개`);
    if (r.skippedExcluded) parts.push(`뺀 영상이라 건너뛴 것 ${r.skippedExcluded}개`);
  }
  return parts.join(" · ");
}

type Note = { text: string; bad: boolean };

export function ChannelTab({ owner }: { owner: HeapOwnerData | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [onlyExcluded, setOnlyExcluded] = useState(false);
  // 지금 빼거나 되돌리는 영상 (그동안 다른 단추도 잠근다)
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!owner) return <p className="note">방 주인만 볼 수 있어요.</p>;
  const { channels, reels } = owner;
  const busy = pending || busyId !== null;

  const visible = reels.filter((r) => !r.excluded);
  const count = (list: typeof reels) => {
    const c: Record<ReelClass, number> = { shorts: 0, long: 0, instagram: 0 };
    for (const r of list) c[r.kind] += 1;
    return c;
  };
  const totals = count(visible);
  const excludedCount = reels.length - visible.length;

  const connect = (value: string) => {
    const v = value.trim();
    if (!v) {
      setNote({ text: "유튜브 채널 주소(youtube.com/@이름 또는 /channel/UC…)나 @핸들을 적어 주세요.", bad: true });
      return;
    }
    setNote({ text: "채널을 찾고 영상을 가져오는 중이에요…", bad: false });
    startTransition(async () => {
      let r: ConnectChannelResult;
      try {
        r = await connectYoutubeChannelAction(v);
      } catch {
        setNote({ text: "연결하지 못했어요. 잠시 뒤에 다시 해 주세요.", bad: true });
        return;
      }
      setNote({ text: connectText(r), bad: !r.ok });
      if (r.ok) {
        setInput("");
        router.refresh();
      }
    });
  };

  const toggle = (id: string, exclude: boolean, title: string) => {
    setBusyId(id);
    setNote(null);
    startTransition(async () => {
      try {
        const r = exclude ? await excludeReelAction(id) : await restoreReelAction(id);
        if (r.ok) {
          setNote({ text: exclude ? `「${title || "제목 없음"}」을 힙에서 뺐어요` : `「${title || "제목 없음"}」을 힙에 되돌렸어요`, bad: false });
          if (r.changed) router.refresh();
        } else setNote({ text: r.message, bad: true });
      } catch {
        setNote({ text: "바꾸지 못했어요. 잠시 뒤에 다시 해 주세요.", bad: true });
      } finally {
        setBusyId(null);
      }
    });
  };

  const q = query.trim().toLowerCase();
  const matched = reels.filter((r) => (!onlyExcluded || r.excluded) && (!q || r.title.toLowerCase().includes(q)));
  const shown = matched.slice(0, LIST_MAX);
  const channelName = new Map(channels.map((c) => [c.id, c.title]));

  return (
    <div className="ed-pane ch-pane">
      <div className="ch-side">
        <form
          className="ch-connect"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) connect(input);
          }}
        >
          <input
            className="ed-search"
            value={input}
            maxLength={200}
            placeholder="youtube.com/@이름 또는 @핸들"
            aria-label="연결할 유튜브 채널 주소나 핸들"
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn small" type="submit" disabled={busy}>
            {pending && busyId === null ? "연결하는 중…" : "채널 연결"}
          </button>
        </form>
        {note && (
          <p className={note.bad ? "note ch-note ed-bad" : "note ch-note"} role="status">
            {note.text}
          </p>
        )}
        <p className="ch-totals" title={`갈래마다 기본 몫이 있고 합계는 ${HEAP_FUNNEL_POLICY.importTotalMax}개예요. 안 쓴 몫은 다른 갈래로 넘어가요.`}>
          힙에 보이는 영상 {REEL_CLASSES.map((k) => `${KIND_NAME[k]} ${totals[k]}/${caps[k]}`).join(" · ")} · 합계 {visible.length}/
          {HEAP_FUNNEL_POLICY.importTotalMax}
        </p>
        {channels.length === 0 ? (
          <p className="note">아직 연결한 채널이 없어요. 유튜브 채널을 연결하면 공개 영상이 힙에 쌓여요.</p>
        ) : (
          <ul className="ch-list" aria-label="연결한 채널">
            {channels.map((c) => {
              const mine = count(visible.filter((r) => r.channelId === c.id));
              return (
                <li key={c.id}>
                  <b>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a> : c.title}</b>
                  <small>
                    {PLATFORM_NAME[c.platform] ?? c.platform} · {REEL_CLASSES.filter((k) => k !== "instagram" || mine[k]).map((k) => `${KIND_NAME[k]} ${mine[k]}`).join(" · ")}
                  </small>
                  {c.platform === "youtube" && c.url && (
                    <button type="button" className="ed-chip" disabled={busy} onClick={() => connect(c.url!)} title={`새 영상 가져오기는 ${waitText(HEAP_FUNNEL_POLICY.importMinIntervalMs / 1000)}에 한 번이에요`}>
                      새 영상 가져오기
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="ch-main">
        <div className="ch-tools">
          <input
            className="ed-search"
            type="search"
            value={query}
            placeholder="가져온 영상 찾기"
            aria-label="가져온 영상 찾기"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
          <button type="button" className="ed-chip" aria-pressed={onlyExcluded} onClick={() => setOnlyExcluded(!onlyExcluded)}>
            뺀 것만 ({excludedCount})
          </button>
          <small>
            {matched.length > LIST_MAX ? `${matched.length}개 중 ${LIST_MAX}개만 보여요 · 찾기로 좁혀 보세요` : `${matched.length}개`}
          </small>
        </div>
        {reels.length === 0 ? (
          <p className="note">가져온 영상이 아직 없어요.</p>
        ) : (
          <ul className="ch-reels" aria-label="가져온 영상">
            {shown.map((r) => (
              <li key={r.id} className={r.excluded ? "out" : undefined}>
                <span className="ch-kind">{KIND_NAME[r.kind]}</span>
                <span className="ch-title" title={r.title}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.title || "제목 없음"}
                    </a>
                  ) : (
                    r.title || "제목 없음"
                  )}
                </span>
                <small>
                  {[r.channelId ? channelName.get(r.channelId) : null, r.published].filter(Boolean).join(" · ")}
                </small>
                <button
                  type="button"
                  className="ed-chip"
                  aria-pressed={r.excluded}
                  disabled={busy}
                  onClick={() => toggle(r.id, !r.excluded, r.title)}
                  title={r.excluded ? "힙에 되돌리기" : "힙에서 빼기 (영상은 지우지 않아요)"}
                >
                  {busyId === r.id ? "…" : r.excluded ? "되돌리기" : "빼기"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
