"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPostLinksAction,
  addYoutubePicksAction,
  browseYoutubeAction,
  connectYoutubeChannelAction,
  excludeReelAction,
  restoreReelAction,
  type AddPostLinksResult,
  type AddYoutubePicksResult,
  type BrowseYoutubeResult,
  type ConnectChannelResult,
  type PasteLinkRow,
  type PasteLinkStatus,
  type YoutubePickOutcome,
} from "@/lib/heap/funnel-actions";
import { HEAP_PLATFORM_NAME } from "@/lib/heap/messages";
import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";
import { REEL_CLASSES, type ReelClass } from "@/lib/heap/caps";
import type { HeapOwnerData } from "./heap-room";

// 꾸미기 독의 채널 탭 (판정 J6). 방 주인의 연결한 채널, 채널 연결(유튜브 주소 또는 @핸들), 가져온 영상 목록과 영상마다 빼기·되돌리기.
// 쓰기는 서버 액션(funnel-actions.ts)이 하고, 방은 서버가 세션으로 찾는다. 성공하면 router.refresh() 로 새 스냅샷을 받는다:
// 이 탭의 목록은 page.tsx 가 다시 읽은 값이고, 방의 더미는 heap-room.tsx 가 heap:reels 로 엔진에 넘긴다 (엔진은 다시 뜨지 않는다).
// 채널이 정말 이 크리에이터의 것인지는 확인하지 않는다 (판정 I1). 다른 크리에이터가 이미 연결한 채널만 거절한다.
// 게시물 링크 붙여넣기(판정 J12): 인스타그램·틱톡 게시물 주소를 한 줄에 하나씩 받아 제목 카드로 만든다. 가져오기(API)는 없다.
// 유튜브 영상 고르기: 영상·재생목록·아무 채널의 주소로 후보를 찾고(오른쪽 목록 자리에 보인다), 고른 영상만 넣는다. 채널을 연결하지 않는다.

const KIND_NAME: Record<ReelClass, string> = { shorts: "쇼츠", long: "롱폼", instagram: "인스타그램" };
const PLATFORM_NAME = HEAP_PLATFORM_NAME;
// 붙여 넣은 줄 하나의 결과를 보여 줄 글자. bad면 들어가지 않은 줄이다.
const PASTE_STATUS: Record<PasteLinkStatus, { text: string; bad: boolean }> = {
  added: { text: "넣었어요", bad: false },
  duplicate: { text: "이미 있어요", bad: true },
  excluded: { text: "뺀 링크예요", bad: true },
  cap: { text: "상한이 찼어요", bad: true },
  unsupported: { text: "아직 안 돼요", bad: true },
  unknown: { text: "모르는 주소", bad: true },
};
// 목록에 한 번에 그리는 줄 수. 넘치면 검색으로 좁힌다.
const LIST_MAX = 150;
// 유튜브 영상 고르기: 찾은 곳의 종류와 영상 하나의 표시
const SOURCE_NAME = { video: "영상", playlist: "재생목록", channel: "채널" } as const;
const PICK_STATUS: Record<YoutubePickOutcome | "have", string> = {
  added: "넣었어요",
  have: "이미 있어요",
  duplicate: "이미 있어요",
  excluded: "뺀 영상",
  cap: "상한이 찼어요",
  unavailable: "넣을 수 없어요",
};
type Picker = Extract<BrowseYoutubeResult, { ok: true }>;

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
  const [paste, setPaste] = useState("");
  // 마지막 붙여넣기의 줄별 결과. null이면 아직 넣어 본 적이 없다.
  const [rows, setRows] = useState<PasteLinkRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyExcluded, setOnlyExcluded] = useState(false);
  // 지금 빼거나 되돌리는 영상 (그동안 다른 단추도 잠근다)
  const [busyId, setBusyId] = useState<string | null>(null);
  // 유튜브 영상 고르기: 찾을 주소, 찾은 후보(있으면 오른쪽 목록 자리에 보인다), 고른 영상 ID, 넣은 결과
  const [source, setSource] = useState("");
  const [picker, setPicker] = useState<Picker | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [pickOutcome, setPickOutcome] = useState<Record<string, YoutubePickOutcome>>({});

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

  // 게시물 링크 붙여넣기. 줄마다의 결과를 받아 그대로 보여 준다 (무엇이 들어갔고 무엇이 왜 안 들어갔는지).
  const submitPaste = () => {
    const v = paste.trim();
    if (!v) {
      setNote({ text: "인스타그램이나 틱톡 게시물 주소를 한 줄에 하나씩 붙여 넣어 주세요.", bad: true });
      return;
    }
    setNote({ text: "링크를 넣는 중이에요…", bad: false });
    setRows(null);
    startTransition(async () => {
      let r: AddPostLinksResult;
      try {
        r = await addPostLinksAction(v);
      } catch {
        setNote({ text: "넣지 못했어요. 잠시 뒤에 다시 해 주세요.", bad: true });
        return;
      }
      if (!r.ok) {
        setNote({ text: r.message, bad: true });
        return;
      }
      setRows(r.rows);
      const missed = r.rows.length - r.added;
      setNote({
        text:
          r.added > 0
            ? `링크 ${r.added}개를 힙에 넣었어요${missed > 0 ? ` · 넣지 못한 줄 ${missed}개` : ""}`
            : "넣은 링크가 없어요. 줄마다의 이유를 확인해 주세요.",
        bad: r.added === 0,
      });
      if (r.added > 0) {
        setPaste("");
        router.refresh();
      }
    });
  };

  // 유튜브 주소(영상, 재생목록, 채널, @핸들)로 후보를 찾는다. 아직 아무것도 넣지 않는다.
  const browse = () => {
    const v = source.trim();
    if (!v) {
      setNote({ text: "유튜브 영상, 재생목록, 채널 주소나 @핸들을 적어 주세요.", bad: true });
      return;
    }
    setNote({ text: "영상을 찾는 중이에요…", bad: false });
    startTransition(async () => {
      let r: BrowseYoutubeResult;
      try {
        r = await browseYoutubeAction(v);
      } catch {
        setNote({ text: "찾지 못했어요. 잠시 뒤에 다시 해 주세요.", bad: true });
        return;
      }
      if (!r.ok) {
        setNote({ text: r.message, bad: true });
        return;
      }
      setPicker(r);
      setPickOutcome({});
      // 영상 하나를 찾았으면 바로 골라 둔다.
      setChosen(new Set(r.source.kind === "video" ? r.videos.filter((x) => x.status === "new").map((x) => x.id) : []));
      setNote({
        text:
          r.videos.length === 0
            ? `「${r.source.title}」에 넣을 수 있는 공개 영상이 없어요`
            : `「${r.source.title}」에서 영상 ${r.videos.length}개를 찾았어요${r.more ? " (최근 것만)" : ""} · 넣을 영상을 골라 주세요`,
        bad: r.videos.length === 0,
      });
    });
  };

  const addPicks = () => {
    const ids = [...chosen];
    if (ids.length === 0) return;
    setNote({ text: "고른 영상을 넣는 중이에요…", bad: false });
    startTransition(async () => {
      let r: AddYoutubePicksResult;
      try {
        r = await addYoutubePicksAction(ids);
      } catch {
        setNote({ text: "넣지 못했어요. 잠시 뒤에 다시 해 주세요.", bad: true });
        return;
      }
      if (!r.ok) {
        setNote({ text: r.message, bad: true });
        return;
      }
      setPickOutcome((prev) => ({ ...prev, ...r.outcome }));
      setChosen(new Set());
      const missed = ids.length - r.added;
      setNote({
        text:
          r.added > 0
            ? `영상 ${r.added}개를 힙에 넣었어요${missed > 0 ? ` · 넣지 못한 영상 ${missed}개` : ""}`
            : "넣은 영상이 없어요. 영상마다의 이유를 확인해 주세요.",
        bad: r.added === 0,
      });
      if (r.added > 0) router.refresh();
    });
  };

  // 후보 하나가 지금 고를 수 있는지. 이미 방에 있거나, 뺀 영상이거나, 이번에 넣기를 해 본 영상은 고르지 않는다.
  const pickable = (id: string, status: string) => status === "new" && !(id in pickOutcome);
  const pickMax = HEAP_FUNNEL_POLICY.picksMax;
  const flip = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < pickMax) next.add(id);
      return next;
    });

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
        <form
          className="ch-connect"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) browse();
          }}
        >
          <input
            className="ed-search"
            value={source}
            maxLength={2048}
            placeholder="영상·재생목록·채널 주소나 @핸들"
            aria-label="골라 넣을 유튜브 영상, 재생목록, 채널 주소"
            onChange={(e) => setSource(e.target.value)}
          />
          <button className="btn small" type="submit" disabled={busy} title="내 채널이 아니어도 돼요. 찾은 영상 중에서 골라 넣어요.">
            찾기
          </button>
        </form>
        <form
          className="ch-paste"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submitPaste();
          }}
        >
          <textarea
            value={paste}
            maxLength={HEAP_FUNNEL_POLICY.pasteTextMaxChars}
            placeholder={`인스타그램·틱톡 게시물 주소 (한 줄에 하나, ${HEAP_FUNNEL_POLICY.pasteLinksMax}줄까지)
제목을 붙이려면 "주소 | 제목"`}
            aria-label="힙에 넣을 게시물 주소"
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="ch-paste-row">
            <button className="btn small" type="submit" disabled={busy}>
              링크 넣기
            </button>
            <small>링크 하나가 카드 하나가 돼요. 재생은 각 플랫폼의 공식 임베드로 열려요.</small>
          </div>
          {rows && rows.length > 0 && (
            <ul className="ch-rows" aria-label="붙여 넣은 링크 결과">
              {rows.map((row, i) => {
                const st = PASTE_STATUS[row.status];
                return (
                  <li key={`${i}-${row.line}`} className={st.bad ? "bad" : undefined}>
                    <b>{st.text}</b>
                    <span title={row.line}>
                      {row.platform ? `${PLATFORM_NAME[row.platform] ?? row.platform} · ` : ""}
                      {row.line}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </form>
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
      {picker ? (
        <div className="ch-main">
          <div className="ch-tools">
            <b className="ch-title" title={picker.source.title}>
              {SOURCE_NAME[picker.source.kind]} ·{" "}
              <a href={picker.source.url} target="_blank" rel="noopener noreferrer">
                {picker.source.title || "제목 없음"}
              </a>
            </b>
            <small>
              고른 영상 {chosen.size}/{Math.min(pickMax, picker.videos.length)}
            </small>
            <button
              type="button"
              className="ed-chip"
              disabled={busy}
              onClick={() => {
                const open = picker.videos.filter((x) => pickable(x.id, x.status)).map((x) => x.id);
                setChosen(chosen.size > 0 ? new Set() : new Set(open.slice(0, pickMax)));
              }}
              title={`한 번에 ${pickMax}개까지 고를 수 있어요`}
            >
              {chosen.size > 0 ? "모두 풀기" : "모두 고르기"}
            </button>
            <button className="btn small" type="button" disabled={busy || chosen.size === 0} onClick={addPicks}>
              힙에 넣기
            </button>
            <button type="button" className="ed-chip" disabled={pending} onClick={() => setPicker(null)}>
              닫기
            </button>
          </div>
          <ul className="ch-reels" aria-label="골라 넣을 영상">
            {picker.videos.map((x) => {
              const done = pickOutcome[x.id];
              const open = pickable(x.id, x.status);
              const status = done ?? (x.status === "new" ? null : x.status);
              return (
                <li key={x.id} className={open ? undefined : "taken"}>
                  <input
                    type="checkbox"
                    checked={chosen.has(x.id)}
                    disabled={!open || busy || (!chosen.has(x.id) && chosen.size >= pickMax)}
                    onChange={() => flip(x.id)}
                    aria-label={`「${x.title || "제목 없음"}」 고르기`}
                  />
                  <span className="ch-kind">{x.short ? KIND_NAME.shorts : KIND_NAME.long}</span>
                  <span className="ch-title" title={x.title}>
                    <a href={x.url} target="_blank" rel="noopener noreferrer">
                      {x.title || "제목 없음"}
                    </a>
                  </span>
                  <small>{[status ? PICK_STATUS[status] : null, x.channelTitle, x.published].filter(Boolean).join(" · ")}</small>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
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
                  {[
                    r.platform === "youtube" ? null : (PLATFORM_NAME[r.platform] ?? r.platform),
                    r.channelId ? channelName.get(r.channelId) : null,
                    r.published,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
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
      )}
    </div>
  );
}
