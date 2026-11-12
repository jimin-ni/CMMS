"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Thumbnail } from "@/components/sicham/thumbnail";
import { GAMES, type GameId, type Viewer } from "@/lib/sicham/mock";

type Role = "streamer" | "viewer";
type ApprovalMode = "fcfs" | "lottery";
type MyBlock = "none" | "cooldown" | "banned";

const ME_ID = "me";

const APPROVAL_LABELS: Record<ApprovalMode, string> = {
  fcfs: "선착순",
  lottery: "추첨(룰렛)",
};

type RoomProps = {
  streamId: string;
  gameId: GameId;
  title: string;
  hostName: string;
  hostAvatar: string;
  viewers: number;
  capacity: number;
  initialQueue: Viewer[];
  initialParticipants: Viewer[];
};

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function Room(props: RoomProps) {
  const game = GAMES[props.gameId];
  const joinCode = props.streamId.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6).padEnd(6, "0");

  const [role, setRole] = useState<Role>("viewer");

  // 방 설정 (스트리머) — 라이브 중에도 바꿀 수 있음
  const [frozen, setFrozen] = useState(false); // 모집 멈춤
  const [capacity, setCapacity] = useState(props.capacity);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("fcfs");
  const [entryOn, setEntryOn] = useState(false); // 입장 질문 사용
  const [question, setQuestion] = useState("1+1=?");
  const [answer, setAnswer] = useState("2");

  // 명단 상태
  const [queue, setQueue] = useState<Viewer[]>(props.initialQueue);
  const [participants, setParticipants] = useState<Viewer[]>(props.initialParticipants);
  const [onDeck, setOnDeck] = useState<Viewer[]>([]); // 준비(on-deck): 대기열과 참가자 사이
  // 고정(lock)된 멤버 id — 전원 대기열로에서 제외됨. 합방 파트너는 기본 고정.
  const [lockedIds, setLockedIds] = useState<string[]>(
    props.initialParticipants.filter((v) => v.collab).map((v) => v.id),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [banCount, setBanCount] = useState(0);
  const [noteEditing, setNoteEditing] = useState<string | null>(null);

  // 시청자 플로우
  const [showHandle, setShowHandle] = useState(false);
  const [handleSaved, setHandleSaved] = useState<string | null>(null);
  const [handleDraft, setHandleDraft] = useState("");
  const [showEntry, setShowEntry] = useState(false);
  const [entryDraft, setEntryDraft] = useState("");
  const [myBlock, setMyBlock] = useState<MyBlock>("none");
  const [toast, setToast] = useState<string | null>(null);

  const recruiting = !frozen;
  const full = participants.length >= capacity;
  const isLocked = (id: string) => lockedIds.includes(id);
  const myState: "none" | "waiting" | "onDeck" | "joined" = participants.some(
    (v) => v.id === ME_ID,
  )
    ? "joined"
    : onDeck.some((v) => v.id === ME_ID)
      ? "onDeck"
      : queue.some((v) => v.id === ME_ID)
        ? "waiting"
        : "none";

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2600);
  }

  // --- 스트리머 액션 ---
  // 대기열 → 준비(on-deck)
  function promoteToDeck(viewer: Viewer) {
    setQueue((q) => q.filter((v) => v.id !== viewer.id));
    setOnDeck((d) => [...d, viewer]);
    if (viewer.id === ME_ID) flashToast("레디로 올라갔어요!");
  }
  function promoteRandomToDeck() {
    if (queue.length === 0) return;
    promoteToDeck(queue[Math.floor(Math.random() * queue.length)]);
  }
  // 준비 → 참가자(게임 입장)
  function enterParty(viewer: Viewer) {
    if (full) return;
    setOnDeck((d) => d.filter((v) => v.id !== viewer.id));
    setParticipants((p) => [...p, viewer]);
    if (viewer.id === ME_ID) flashToast("게임에 입장했어요!");
  }
  // 준비 → 대기열 (되돌리기)
  function deckToQueue(viewer: Viewer) {
    setOnDeck((d) => d.filter((v) => v.id !== viewer.id));
    setQueue((q) => [...q, viewer]);
  }
  function reject(viewer: Viewer) {
    setQueue((q) => q.filter((v) => v.id !== viewer.id));
  }
  function kick(viewer: Viewer) {
    setParticipants((p) => p.filter((v) => v.id !== viewer.id));
    if (viewer.id === ME_ID) setMyBlock("cooldown");
  }
  function pushToWaitlist(viewer: Viewer) {
    setParticipants((p) => p.filter((v) => v.id !== viewer.id));
    setQueue((q) => [...q, viewer]);
  }
  function ban(viewer: Viewer) {
    setQueue((q) => q.filter((v) => v.id !== viewer.id));
    setOnDeck((d) => d.filter((v) => v.id !== viewer.id));
    setParticipants((p) => p.filter((v) => v.id !== viewer.id));
    setBanCount((n) => n + 1);
    if (viewer.id === ME_ID) setMyBlock("banned");
  }
  function toggleLock(id: string) {
    setLockedIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }
  // 두 setState를 분리해 순수 업데이터 유지 (중첩 setState는 dev 이중 호출로 중복 삽입됨)
  function kickAll() {
    const returned = participants.filter((v) => !isLocked(v.id));
    setQueue((q) => [...q, ...returned]);
    setParticipants((p) => p.filter((v) => isLocked(v.id)));
  }

  // --- 시청자 액션 ---
  function startRequest() {
    if (game.handleLabel && !handleSaved) {
      setShowHandle(true);
      return;
    }
    if (entryOn) {
      setShowEntry(true);
      return;
    }
    enqueueMe();
  }
  function enqueueMe() {
    const me: Viewer = {
      id: ME_ID,
      name: "나 (미리보기)",
      avatar: "🙋",
      handle: handleSaved ?? undefined,
      answer: entryOn ? answer : undefined,
    };
    setQueue((q) => [...q, me]);
  }
  function submitHandle() {
    setHandleSaved(handleDraft.trim() || "myname");
    setShowHandle(false);
    if (entryOn) setShowEntry(true);
    else enqueueMe();
  }
  function submitEntry() {
    if (entryDraft.trim() === answer.trim()) {
      setShowEntry(false);
      enqueueMe();
    } else {
      flashToast("정답이 아니라 입장할 수 없어요.");
    }
  }
  function cancelMine() {
    setQueue((q) => q.filter((v) => v.id !== ME_ID));
  }
  function leaveMine() {
    setParticipants((p) => p.filter((v) => v.id !== ME_ID));
  }
  function leaveDeck() {
    setOnDeck((d) => d.filter((v) => v.id !== ME_ID));
  }

  return (
    <>
      <Link
        href="/sicham"
        className="mb-6 inline-block rounded-full bg-white px-5 py-2 text-sm text-key-brown shadow-sm"
      >
        ← 시참 목록으로
      </Link>

      {/* 방송 헤더 */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="aspect-video w-full sm:aspect-[21/9]">
          <Thumbnail gameId={props.gameId} live viewers={props.viewers} />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3 p-6">
          <div>
            <h1 className="text-xl font-bold text-key-brown">{props.title}</h1>
            <p className="mt-1 text-sm text-key-stone">
              {props.hostAvatar} {props.hostName}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-medium text-white"
                style={{ background: `linear-gradient(135deg, ${game.from}, ${game.to})` }}
              >
                {game.emoji} {game.title}
              </span>
              <span className="rounded-full bg-key-mist px-2.5 py-0.5 text-xs text-key-brown">
                👁 {props.viewers.toLocaleString()}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  recruiting ? "bg-green-100 text-green-800" : "bg-key-stone/30 text-key-brown"
                }`}
              >
                {recruiting ? "모집중" : "모집 멈춤"}
              </span>
            </div>
          </div>
          <span className="rounded-full bg-key-brown px-3 py-1 text-xs text-key-mist">
            {role === "streamer" ? "스트리머 화면" : "시청자 화면"}
          </span>
        </div>
      </section>

      {role === "streamer" && (
        <StreamerSettings
          joinMethod={game.joinMethod}
          joinCode={joinCode}
          handleLabel={game.handleLabel}
          frozen={frozen}
          onToggleFreeze={() => setFrozen((f) => !f)}
          capacity={capacity}
          onCapacity={setCapacity}
          approvalMode={approvalMode}
          onApprovalMode={setApprovalMode}
          entryOn={entryOn}
          onEntryOn={setEntryOn}
          question={question}
          onQuestion={setQuestion}
          answer={answer}
          onAnswer={setAnswer}
          banCount={banCount}
        />
      )}

      <ParticipantSlots
        role={role}
        participants={participants}
        capacity={capacity}
        lockedIds={lockedIds}
        notes={notes}
        handleLabel={game.handleLabel}
        onKick={kick}
        onPushToWaitlist={pushToWaitlist}
        onBan={ban}
        onToggleLock={toggleLock}
        onNote={(id) => setNoteEditing(id)}
        onKickAll={kickAll}
      />

      {role === "streamer" && (
        <OnDeck
          onDeck={onDeck}
          full={full}
          handleLabel={game.handleLabel}
          notes={notes}
          onEnter={enterParty}
          onBack={deckToQueue}
          onBan={ban}
          onNote={(id) => setNoteEditing(id)}
        />
      )}

      {role === "streamer" ? (
        <StreamerQueue
          queue={queue}
          approvalMode={approvalMode}
          entryOn={entryOn}
          handleLabel={game.handleLabel}
          onPromote={promoteToDeck}
          onPromoteRandom={promoteRandomToDeck}
          onReject={reject}
          onBan={ban}
          onNote={(id) => setNoteEditing(id)}
        />
      ) : (
        <ViewerPanel
          myState={myState}
          myBlock={myBlock}
          position={queue.findIndex((v) => v.id === ME_ID) + 1}
          recruiting={recruiting}
          full={full}
          game={game}
          joinCode={joinCode}
          myHandle={handleSaved}
          onRequest={startRequest}
          onCancel={cancelMine}
          onLeave={leaveMine}
          onLeaveDeck={leaveDeck}
        />
      )}

      {/* 비공개 메모 (스트리머 전용) */}
      {noteEditing && (
        <NoteDialog
          initial={notes[noteEditing] ?? ""}
          onSave={(text) => {
            setNotes((n) => ({ ...n, [noteEditing]: text }));
            setNoteEditing(null);
          }}
          onClose={() => setNoteEditing(null)}
        />
      )}

      {/* 핸들 입력 팝업 */}
      {showHandle && game.handleLabel && (
        <Dialog title={`${game.handleLabel} 입력`} onClose={() => setShowHandle(false)}>
          <p className="text-sm text-key-stone">
            이 게임에 처음 참여하시네요. 스트리머가 초대할 수 있게 {game.handleLabel}을(를) 적어
            주세요.
          </p>
          <input
            autoFocus
            value={handleDraft}
            onChange={(e) => setHandleDraft(e.target.value)}
            placeholder={game.handleLabel}
            className="mt-3 w-full rounded-lg border border-key-stone/50 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-key-stone">
            이름을 잘못 적으면 초대가 안 될 수 있고, 그에 대한 책임은 지지 않습니다.
          </p>
          <button
            type="button"
            onClick={submitHandle}
            className="mt-4 w-full rounded-full bg-key-brown py-2.5 text-sm text-key-mist"
          >
            저장하고 계속
          </button>
        </Dialog>
      )}

      {/* 입장 질문 팝업 */}
      {showEntry && (
        <Dialog title="입장 질문" onClose={() => setShowEntry(false)}>
          <p className="text-sm font-medium text-key-brown">{question}</p>
          <input
            autoFocus
            value={entryDraft}
            onChange={(e) => setEntryDraft(e.target.value)}
            className="mt-3 w-full rounded-lg border border-key-stone/50 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={submitEntry}
            className="mt-4 w-full rounded-full bg-key-brown py-2.5 text-sm text-key-mist"
          >
            제출
          </button>
        </Dialog>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-key-brown px-5 py-2.5 text-sm text-key-mist shadow-lg">
          {toast}
        </div>
      )}

      <RoleDevPanel role={role} onRoleChange={setRole} />
    </>
  );
}

// ---------------------------------------------------------------------------

function StreamerSettings(props: {
  joinMethod: string;
  joinCode: string;
  handleLabel?: string;
  frozen: boolean;
  onToggleFreeze: () => void;
  capacity: number;
  onCapacity: (n: number) => void;
  approvalMode: ApprovalMode;
  onApprovalMode: (m: ApprovalMode) => void;
  entryOn: boolean;
  onEntryOn: (b: boolean) => void;
  question: string;
  onQuestion: (s: string) => void;
  answer: string;
  onAnswer: (s: string) => void;
  banCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-key-brown">방 설정</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onToggleFreeze}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              props.frozen ? "bg-key-brown text-key-mist" : "bg-key-mist text-key-brown"
            }`}
          >
            {props.frozen ? "모집 재개" : "모집 멈춤"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-xs text-key-stone"
          >
            {open ? "접기" : "설정 펼치기"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-key-brown">
              정원
              <input
                type="number"
                min={1}
                value={props.capacity}
                onChange={(e) => props.onCapacity(Number(e.target.value))}
                className="w-16 rounded-lg border border-key-stone/50 px-2 py-1"
              />
            </label>
            <span className="text-xs text-key-stone">누적 차단 {props.banCount}</span>
          </div>

          {/* 승인 방식 */}
          <div>
            <p className="mb-1.5 text-xs text-key-stone">승인 방식</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(APPROVAL_LABELS) as ApprovalMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => props.onApprovalMode(m)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    props.approvalMode === m
                      ? "bg-key-blue text-key-brown"
                      : "bg-key-mist text-key-brown"
                  }`}
                >
                  {APPROVAL_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* 입장 질문 — 입력 두 칸을 위아래로 */}
          <div>
            <label className="flex items-center gap-2 text-xs text-key-brown">
              <input
                type="checkbox"
                checked={props.entryOn}
                onChange={(e) => props.onEntryOn(e.target.checked)}
              />
              입장 질문 사용 (정답 일치만 입장)
            </label>
            {props.entryOn && (
              <div className="mt-2 flex flex-col gap-2">
                <input
                  value={props.question}
                  onChange={(e) => props.onQuestion(e.target.value)}
                  placeholder="질문"
                  className="w-full rounded-lg border border-key-stone/50 px-3 py-1.5 text-xs"
                />
                <input
                  value={props.answer}
                  onChange={(e) => props.onAnswer(e.target.value)}
                  placeholder="정답"
                  className="w-full rounded-lg border border-key-stone/50 px-3 py-1.5 text-xs"
                />
              </div>
            )}
          </div>

          {/* 입장 방식 안내 */}
          <div className="rounded-lg bg-key-mist/60 px-3 py-2 text-xs text-key-brown">
            입장 방식:{" "}
            {props.joinMethod === "reveal-string" ? (
              <>
                코드 공개 ·{" "}
                <button
                  type="button"
                  onClick={() => copy(props.joinCode)}
                  className="rounded bg-white px-2 py-0.5 font-mono tracking-widest"
                >
                  {props.joinCode} 복사
                </button>
              </>
            ) : props.joinMethod === "search-invite" ? (
              <>인게임 검색-초대 · 참가자의 {props.handleLabel}로 초대</>
            ) : (
              <>플랫폼 친구 초대</>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ParticipantSlots(props: {
  role: Role;
  participants: Viewer[];
  capacity: number;
  lockedIds: string[];
  notes: Record<string, string>;
  handleLabel?: string;
  onKick: (v: Viewer) => void;
  onPushToWaitlist: (v: Viewer) => void;
  onBan: (v: Viewer) => void;
  onToggleLock: (id: string) => void;
  onNote: (id: string) => void;
  onKickAll: () => void;
}) {
  const empty = Math.max(0, props.capacity - props.participants.length);
  const anyKickable = props.participants.some((v) => !props.lockedIds.includes(v.id));

  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-key-brown">
          현재 참가자{" "}
          <span className="text-key-stone">
            ({props.participants.length}/{props.capacity})
          </span>
        </h2>
        {props.role === "streamer" && anyKickable && (
          <button
            type="button"
            onClick={props.onKickAll}
            className="rounded-full bg-key-mist px-3 py-1 text-xs text-key-brown"
          >
            전원 대기열로 (고정 제외)
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {props.participants.map((v) => {
          const locked = props.lockedIds.includes(v.id);
          return (
            <div
              key={v.id}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                locked ? "bg-key-blue/30" : "bg-key-mist/60"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm text-key-brown">
                  {v.avatar} {v.name}
                </span>
                {v.collab && (
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-key-brown">
                    합방
                  </span>
                )}
                {locked && <span className="text-xs" title="고정됨">🔒</span>}
                {props.notes[v.id] && (
                  <span className="text-xs" title={props.notes[v.id]}>📝</span>
                )}
                {props.role === "streamer" && props.handleLabel && v.handle && (
                  <span className="truncate text-[11px] text-key-stone">
                    {props.handleLabel}: {v.handle}
                  </span>
                )}
              </span>
              {props.role === "streamer" && (
                <span className="flex shrink-0 gap-1">
                  <IconBtn
                    label={locked ? "고정 해제" : "고정"}
                    onClick={() => props.onToggleLock(v.id)}
                  >
                    {locked ? "🔓" : "🔒"}
                  </IconBtn>
                  <IconBtn label="메모" onClick={() => props.onNote(v.id)}>📝</IconBtn>
                  {!locked && (
                    <>
                      <IconBtn label="대기열로" onClick={() => props.onPushToWaitlist(v)}>↩</IconBtn>
                      <IconBtn label="내보내기" onClick={() => props.onKick(v)}>✕</IconBtn>
                      <IconBtn label="차단" onClick={() => props.onBan(v)}>🚫</IconBtn>
                    </>
                  )}
                </span>
              )}
            </div>
          );
        })}
        {Array.from({ length: empty }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="rounded-lg border border-dashed border-key-stone/50 px-3 py-2 text-sm text-key-stone"
          >
            빈 자리
          </div>
        ))}
      </div>
    </section>
  );
}

// 준비(on-deck): 대기열과 참가자 사이. 다음 판에 들어올 사람이 미리 준비하는 단계.
function OnDeck(props: {
  onDeck: Viewer[];
  full: boolean;
  handleLabel?: string;
  notes: Record<string, string>;
  onEnter: (v: Viewer) => void;
  onBack: (v: Viewer) => void;
  onBan: (v: Viewer) => void;
  onNote: (id: string) => void;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-key-blue/40 bg-key-blue/10 p-6">
      <h2 className="text-sm font-semibold text-key-brown">
        레디 <span className="text-key-stone">({props.onDeck.length})</span>
        <span className="ml-2 text-[11px] font-normal text-key-stone">
          다음 판 대기 · 미리 안내가 전달됩니다
        </span>
      </h2>

      <ul className="mt-3 space-y-2">
        {props.onDeck.length === 0 && (
          <li className="rounded-lg bg-white/70 px-4 py-5 text-center text-sm text-key-stone">
            레디로 올릴 사람이 없습니다. 대기열에서 올려 보내세요.
          </li>
        )}
        {props.onDeck.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm text-key-brown">
                {v.avatar} {v.name}
              </span>
              {props.notes[v.id] && <span className="text-xs" title={props.notes[v.id]}>📝</span>}
              {props.handleLabel && v.handle && (
                <span className="truncate text-[11px] text-key-stone">
                  {props.handleLabel}: {v.handle}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => props.onEnter(v)}
                disabled={props.full}
                className="rounded-full bg-key-brown px-3 py-1 text-xs text-key-mist disabled:opacity-40"
              >
                입장
              </button>
              <IconBtn label="대기열로" onClick={() => props.onBack(v)}>↩</IconBtn>
              <IconBtn label="메모" onClick={() => props.onNote(v.id)}>📝</IconBtn>
              <IconBtn label="차단" onClick={() => props.onBan(v)}>🚫</IconBtn>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StreamerQueue(props: {
  queue: Viewer[];
  approvalMode: ApprovalMode;
  entryOn: boolean;
  handleLabel?: string;
  onPromote: (v: Viewer) => void;
  onPromoteRandom: () => void;
  onReject: (v: Viewer) => void;
  onBan: (v: Viewer) => void;
  onNote: (id: string) => void;
}) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-key-brown">
          참여 대기열 <span className="text-key-stone">({props.queue.length})</span>
        </h2>
        {props.approvalMode === "lottery" && (
          <button
            type="button"
            onClick={props.onPromoteRandom}
            disabled={props.queue.length === 0}
            className="rounded-full bg-key-blue px-4 py-1.5 text-xs text-key-brown disabled:opacity-40"
          >
            🎲 무작위 승인
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {props.queue.length === 0 && (
          <li className="rounded-lg bg-key-mist/60 px-4 py-6 text-center text-sm text-key-stone">
            대기 중인 신청이 없습니다.
          </li>
        )}
        {props.queue.map((v, index) => (
          <li
            key={v.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-key-mist px-3 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-xs text-key-stone">{index + 1}</span>
              <span className="min-w-0">
                <span className="truncate text-sm text-key-brown">
                  {v.avatar} {v.name}
                </span>
                <span className="flex flex-wrap gap-x-2 text-[11px] text-key-stone">
                  {props.handleLabel && v.handle && (
                    <span className="truncate">{props.handleLabel}: {v.handle}</span>
                  )}
                  {props.entryOn && v.answer !== undefined && <span>답: {v.answer}</span>}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => props.onPromote(v)}
                className="rounded-full bg-key-brown px-3 py-1 text-xs text-key-mist"
              >
                레디로
              </button>
              <button
                type="button"
                onClick={() => props.onReject(v)}
                className="rounded-full bg-key-mist px-3 py-1 text-xs text-key-brown"
              >
                거절
              </button>
              <IconBtn label="메모" onClick={() => props.onNote(v.id)}>📝</IconBtn>
              <IconBtn label="차단" onClick={() => props.onBan(v)}>🚫</IconBtn>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ViewerPanel(props: {
  myState: "none" | "waiting" | "onDeck" | "joined";
  myBlock: MyBlock;
  position: number;
  recruiting: boolean;
  full: boolean;
  game: (typeof GAMES)[GameId];
  joinCode: string;
  myHandle: string | null;
  onRequest: () => void;
  onCancel: () => void;
  onLeave: () => void;
  onLeaveDeck: () => void;
}) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      {props.myBlock === "banned" ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          이 방송 참여가 차단되었습니다.
        </p>
      ) : props.myBlock === "cooldown" ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <span className="rounded-full bg-key-stone/30 px-4 py-1.5 text-sm text-key-brown">
            쿨다운 중 · 잠시 후 재참여 가능
          </span>
          <p className="text-xs text-key-stone">
            신청 후 미참여(노쇼)하거나 내보내진 경우 쿨다운이 적용됩니다.
          </p>
        </div>
      ) : props.myState === "none" ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {props.recruiting && !props.full ? (
            <>
              <p className="text-sm text-key-stone">이 게임에 함께 참여하고 싶다면 신청하세요.</p>
              <button
                type="button"
                onClick={props.onRequest}
                className="rounded-full bg-key-brown px-6 py-2.5 text-sm font-medium text-key-mist"
              >
                참여 신청하기
              </button>
            </>
          ) : (
            <p className="rounded-lg bg-key-mist px-4 py-3 text-sm text-key-stone">
              {props.full ? "자리가 가득 찼습니다." : "지금은 모집하지 않습니다."}
            </p>
          )}
        </div>
      ) : props.myState === "waiting" ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="rounded-full bg-key-blue/30 px-4 py-1.5 text-sm font-medium text-key-brown">
            대기 순번 {props.position}번
          </span>
          <p className="text-sm text-key-stone">스트리머가 승인하면 레디로 넘어갑니다.</p>
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-full bg-key-mist px-5 py-2 text-sm text-key-brown"
          >
            대기열 나가기
          </button>
        </div>
      ) : props.myState === "onDeck" ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="rounded-full bg-key-blue/30 px-4 py-1.5 text-sm font-medium text-key-brown">
            🟢 곧 입장! 레디 상태
          </span>
          <p className="text-sm text-key-stone">
            게임 실행·디스코드 접속을 미리 끝내 두세요. 스트리머가 입장시키면 바로 시작합니다.
          </p>
          <JoinReveal game={props.game} joinCode={props.joinCode} myHandle={props.myHandle} />
          <button
            type="button"
            onClick={props.onLeaveDeck}
            className="rounded-full bg-key-mist px-5 py-2 text-sm text-key-brown"
          >
            나가기
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="rounded-full bg-green-100 px-4 py-1.5 text-sm font-medium text-green-800">
            🎮 게임 입장 완료!
          </span>
          <JoinReveal game={props.game} joinCode={props.joinCode} myHandle={props.myHandle} />
          <button
            type="button"
            onClick={props.onLeave}
            className="rounded-full bg-key-mist px-5 py-2 text-sm text-key-brown"
          >
            나가기
          </button>
        </div>
      )}
    </section>
  );
}

function JoinReveal(props: {
  game: (typeof GAMES)[GameId];
  joinCode: string;
  myHandle: string | null;
}) {
  if (props.game.joinMethod === "reveal-string") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-key-mist px-4 py-3">
        <span className="font-mono text-lg tracking-widest text-key-brown">{props.joinCode}</span>
        <button
          type="button"
          onClick={() => copy(props.joinCode)}
          className="rounded-full bg-white px-3 py-1 text-xs text-key-brown shadow-sm"
        >
          복사
        </button>
      </div>
    );
  }
  if (props.game.joinMethod === "search-invite") {
    return (
      <p className="rounded-lg bg-key-mist px-4 py-3 text-sm text-key-brown">
        스트리머가 {props.game.handleLabel} <b>{props.myHandle ?? "내 이름"}</b>(으)로 초대 중입니다.
        게임을 켜고 기다려 주세요.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-key-mist px-4 py-3 text-sm text-key-brown">
      친구 추가 후 초대가 전송됩니다.
    </p>
  );
}

// ---------------------------------------------------------------------------

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-full bg-key-mist px-2 py-1 text-xs hover:bg-key-stone/30"
    >
      {children}
    </button>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-key-brown">{title}</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-key-stone">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function NoteDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <Dialog title="비공개 메모 (뷰어에게 안 보임)" onClose={onClose}>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-key-stone/50 px-3 py-2 text-sm"
        placeholder="예: 매너 좋음 / 지난번 노쇼"
      />
      <button
        type="button"
        onClick={() => onSave(text)}
        className="mt-3 w-full rounded-full bg-key-brown py-2.5 text-sm text-key-mist"
      >
        저장
      </button>
    </Dialog>
  );
}

// 스트리머/시청자 화면 전환은 개발용 토글입니다.
// 실제 제품에서는 방송 소유 여부(로그인)로 결정됩니다.
function RoleDevPanel({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className="fixed top-20 right-4 z-20 flex flex-col items-end gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-full bg-key-blue px-4 py-1.5 text-sm text-key-brown shadow-sm"
      >
        개발 도구
      </button>
      {open && (
        <div className="flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-key-stone">실제 제품에서는 방송 소유 여부로 자동 결정됩니다.</p>
          <div className="flex flex-col gap-2">
            {(["streamer", "viewer"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-key-brown">
                <input
                  type="radio"
                  name="sicham-role"
                  checked={role === option}
                  onChange={() => onRoleChange(option)}
                />
                {option === "streamer" ? "스트리머 화면" : "시청자 화면"}
              </label>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
