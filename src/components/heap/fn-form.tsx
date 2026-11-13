"use client";

import { useEffect, useRef, useState } from "react";
import { HEAP_POLICY } from "@/lib/heap/policy";
import { parseMusicUrl, slotKindsFor, slotLabel, type CalendarEntry, type PcLink, type SlotFn, type SlotKind } from "@/lib/heap/slots";

// 꾸미기의 기능 칸. 고른 가구에 기능(item.fn)을 달고 내용을 적는다 (종류와 허용 가구: catalogue.json의 slots, 검사: slots.ts).
// room-editor.tsx의 기능 말풍선(가구 아래에 붙는다)이 그린다. 예전 평면도 패널에 있던 칸을 그대로 옮겨 왔다.
// 칸은 고칠 때마다 onChange 로 새 값을 올린다. 그 값을 저장할지(올바를 때만)는 말풍선이 slots.ts 의 checkFn 으로 정한다.

export type Item = {
  type: string;
  x: number;
  z: number;
  rot?: number;
  size?: number;
  model?: string;
  tint?: boolean;
  y?: number;
  fn?: SlotFn;
  // 조명 스위치. 없으면 켜진 것(밤에 불이 들어온다), false면 늘 꺼져 있다.
  lit?: boolean;
};
// mount: 벽·천장에 거는 것이나 벽 조각 ("wall" | "ceiling" | "structure"). 꾸미기 독에는 나오지 않는다.
export type Model = { id: string; label: string; category: string; w?: number; d?: number; lift?: number; mount?: string };

// 엔진이 직접 만드는 가구의 이름 (engine/edit.js의 HAND_LABEL과 같다).
export const HAND_LABEL: Record<string, string> = {
  bed: "침대",
  shelf: "앨범 책장",
  plant: "화분",
  snake: "산세베리아",
  lamp: "조명",
  books: "책 더미",
  frame: "벽 액자",
  calendar: "탁상 달력",
};
export const itemLabel = (it: Item, models: Model[]) =>
  (it.type === "model" ? models.find((m) => m.id === it.model)?.label : HAND_LABEL[it.type]) ?? it.model ?? it.type;
export const isLamp = (it: Item, models: Model[]) =>
  it.type === "lamp" || (it.type === "model" && models.find((m) => m.id === it.model)?.category === "lamp");
// 기능(음악, 최신 영상, PC 링크, 기념품, 달력)을 달 수 있는 가구인지. 조명 스위치는 가구 위 막대에 따로 있다.
export const canCarryFn = (it: Pick<Item, "type" | "model">) => slotKindsFor(it.type, it.model).length > 0;

const chars = (v: string) => [...v].length;

// 고른 가구의 기능 칸. 달 수 있는 종류가 없으면 아무것도 그리지 않는다.
export function FnForm({
  item,
  models,
  prefill,
  onChange,
}: {
  item: Item;
  models: Model[];
  prefill: () => PcLink[];
  onChange: (fn: SlotFn | undefined) => void;
}) {
  const kinds = slotKindsFor(item.type, item.model);
  if (kinds.length === 0) return null;
  const fn = item.fn;
  const name = itemLabel(item, models);

  if (!fn) {
    return (
      <div className="ed-fn">
        <b>{name}에 기능 달기</b>
        <div className="row">
          {kinds.map((kind: SlotKind) => (
            <button
              key={kind}
              type="button"
              className="btn small"
              onClick={() => onChange(newFn(kind, prefill))}
            >
              {slotLabel(kind)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 기능 빼기는 칸들 위, 제목 줄에 둔다: 아래 칸의 오류 줄이 나타나고 사라져도 이 버튼은 움직이지 않는다. 한 번 더 눌러야 빠진다.
  return (
    <div className="ed-fn">
      <div className="ed-fn-head">
        <b>
          {name} · {slotLabel(fn.kind)}
        </b>
        <RemoveFn onConfirm={() => onChange(undefined)} />
      </div>
      {fn.kind === "pc" && <PcFields fn={fn} prefill={prefill} onChange={onChange} />}
      {fn.kind === "keepsake" && <KeepsakeFields fn={fn} onChange={onChange} />}
      {fn.kind === "music" && <MusicFields fn={fn} onChange={onChange} />}
      {fn.kind === "latest" && <p className="note">TV 화면에 가장 최근 영상이 나와요. TV를 누르면 그 영상이 영사기로 가요.</p>}
      {fn.kind === "calendar" && <CalendarFields fn={fn} onChange={onChange} />}
    </div>
  );
}

// 새로 다는 기능의 처음 값. 비워 둔 칸이 있으면 올바르지 않은 값이라 말풍선이 저장하지 않고 들고 있는다.
export function newFn(kind: SlotKind, prefill: () => PcLink[]): SlotFn {
  if (kind === "pc") return { kind: "pc", links: prefill() };
  if (kind === "music") return { kind: "music", url: "" };
  if (kind === "latest") return { kind: "latest" };
  if (kind === "calendar") return { kind: "calendar", entries: [] };
  return { kind: "keepsake", name: "" };
}

// 두 번 눌러야 하는 버튼: 처음 누르면 확인 문구로 바뀌고, 4초 안에 다시 누르면 실행한다.
function RemoveFn({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="btn ghost small"
      onClick={() => {
        window.clearTimeout(timer.current);
        if (armed) return onConfirm();
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 4000);
      }}
    >
      {armed ? "정말 뺄까요?" : "기능 빼기"}
    </button>
  );
}

// 오류 줄: 자리는 늘 잡아 두고 글만 바뀐다 (칸이 밀리지 않게).
function ErrorLine({ text }: { text: string | null }) {
  return (
    <span className="note ed-bad ed-slot" aria-live="polite">
      {text ?? " "}
    </span>
  );
}

function MusicFields({ fn, onChange }: { fn: Extract<SlotFn, { kind: "music" }>; onChange: (fn: SlotFn | undefined) => void }) {
  const bad = fn.url.trim() !== "" && !parseMusicUrl(fn.url);
  return (
    <>
      <label className="ed-field">
        <span>유튜브 영상 또는 재생목록 주소</span>
        <input
          value={fn.url}
          maxLength={HEAP_POLICY.linkUrlMaxChars}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => onChange({ kind: "music", url: e.target.value.trim() })}
        />
      </label>
      <ErrorLine text={fn.url === "" ? "주소를 적어야 저장할 수 있어요." : bad ? "유튜브 영상(watch?v=, youtu.be) 또는 재생목록(playlist?list=) 주소여야 해요." : null} />
      <p className="note">누르면 방 오른쪽 위에 플레이어가 열려요. 소리는 누른 뒤에만 나요.</p>
    </>
  );
}

function CalendarFields({ fn, onChange }: { fn: Extract<SlotFn, { kind: "calendar" }>; onChange: (fn: SlotFn | undefined) => void }) {
  const entries = fn.entries ?? [];
  const set = (next: CalendarEntry[]) => onChange({ kind: "calendar", entries: next });
  const incomplete = entries.some((e) => e.date === "" || e.label.trim() === "");
  return (
    <>
      {entries.map((e, i) => (
        <div className="ed-calrow" key={i}>
          <input
            type="date"
            aria-label={`날짜 ${i + 1}`}
            value={e.date}
            onChange={(ev) => set(entries.map((o, j) => (j === i ? { ...o, date: ev.target.value } : o)))}
          />
          <input
            aria-label={`날짜 ${i + 1} 설명`}
            placeholder={`설명 (${HEAP_POLICY.calendarLabelMaxChars}자까지)`}
            value={e.label}
            maxLength={HEAP_POLICY.calendarLabelMaxChars}
            onChange={(ev) => set(entries.map((o, j) => (j === i ? { ...o, label: ev.target.value } : o)))}
          />
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => set(entries.filter((_, j) => j !== i))}>
              줄 지우기
            </button>
          </div>
        </div>
      ))}
      <ErrorLine text={incomplete ? "날짜와 설명을 모두 채워야 저장할 수 있어요." : null} />
      <div className="row">
        <button
          type="button"
          className="btn small"
          disabled={entries.length >= HEAP_POLICY.calendarEntriesMax}
          onClick={() => set([...entries, { date: "", label: "" }])}
        >
          날짜 추가 ({entries.length}/{HEAP_POLICY.calendarEntriesMax})
        </button>
      </div>
      <p className="note">오늘부터 앞으로의 날짜만 팬에게 보여요.</p>
    </>
  );
}

// 링크 한 줄의 주소 칸: http(s)·mailto 주소는 url로, 그 밖의 글은 이메일 주소로 본다.
const addressOf = (L: PcLink) => ("url" in L ? L.url : L.email);
const linkFrom = (title: string, address: string): PcLink =>
  /^(https?:\/\/|mailto:)/i.test(address) ? { title, url: address } : { title, email: address };
const addressBad = (address: string) =>
  address.trim() !== "" && !/^(https?:\/\/\S+|mailto:\S+|[^\s@]+@[^\s@]+\.[^\s@]+)$/i.test(address.trim());

function PcFields({
  fn,
  prefill,
  onChange,
}: {
  fn: Extract<SlotFn, { kind: "pc" }>;
  prefill: () => PcLink[];
  onChange: (fn: SlotFn | undefined) => void;
}) {
  const links = fn.links;
  if (!links) {
    return (
      <>
        <p className="note">링크를 따로 정하지 않았어요. 방에 걸려 있던 기존 링크 목록이 그대로 보여요.</p>
        <div className="row">
          <button type="button" className="btn small" onClick={() => onChange({ kind: "pc", links: prefill() })}>
            링크 직접 고치기
          </button>
        </div>
      </>
    );
  }
  const set = (next: PcLink[]) => onChange({ kind: "pc", links: next });
  return (
    <>
      {links.map((L, i) => (
        <div className="ed-linkrow" key={i}>
          <input
            aria-label={`링크 ${i + 1} 제목`}
            placeholder={`제목 (${HEAP_POLICY.linkTitleMaxChars}자까지)`}
            value={L.title}
            maxLength={HEAP_POLICY.linkTitleMaxChars}
            onChange={(e) => set(links.map((o, j) => (j === i ? linkFrom(e.target.value, addressOf(o)) : o)))}
          />
          <input
            aria-label={`링크 ${i + 1} 주소`}
            placeholder="https://… 또는 이메일 주소"
            value={addressOf(L)}
            maxLength={HEAP_POLICY.linkUrlMaxChars}
            onChange={(e) => set(links.map((o, j) => (j === i ? linkFrom(o.title, e.target.value.trim()) : o)))}
          />
          <ErrorLine text={addressBad(addressOf(L)) ? "http(s) 주소나 이메일 주소여야 해요." : null} />
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => set(links.filter((_, j) => j !== i))}>
              줄 지우기
            </button>
          </div>
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          className="btn small"
          disabled={links.length >= HEAP_POLICY.pcLinksMax}
          onClick={() => set([...links, { title: "", url: "" }])}
        >
          링크 추가 ({links.length}/{HEAP_POLICY.pcLinksMax})
        </button>
        <button type="button" className="btn ghost small" onClick={() => onChange({ kind: "pc" })}>
          기존 링크 목록으로
        </button>
      </div>
    </>
  );
}

function KeepsakeFields({
  fn,
  onChange,
}: {
  fn: Extract<SlotFn, { kind: "keepsake" }>;
  onChange: (fn: SlotFn | undefined) => void;
}) {
  // 비운 칸은 값에서 뺀다 (서버는 빈 글자를 받지 않는다). 이름만 비어도 남겨 두고, 저장할 때 서버가 알려 준다.
  const set = (field: "name" | "date" | "caption" | "link", value: string) => {
    const next: Extract<SlotFn, { kind: "keepsake" }> = { ...fn, [field]: value };
    if (field !== "name" && value === "") delete next[field];
    onChange(next);
  };
  return (
    <>
      <label className="ed-field">
        <span>이름 (꼭 필요해요, {HEAP_POLICY.keepsakeNameMaxChars}자까지)</span>
        <input value={fn.name} maxLength={HEAP_POLICY.keepsakeNameMaxChars} onChange={(e) => set("name", e.target.value)} />
      </label>
      <ErrorLine text={chars(fn.name) === 0 ? "이름을 적어야 저장할 수 있어요." : null} />
      <label className="ed-field">
        <span>날짜</span>
        <input type="date" value={fn.date ?? ""} onChange={(e) => set("date", e.target.value)} />
      </label>
      <label className="ed-field">
        <span>설명 ({HEAP_POLICY.keepsakeCaptionMaxChars}자까지)</span>
        <textarea value={fn.caption ?? ""} maxLength={HEAP_POLICY.keepsakeCaptionMaxChars} onChange={(e) => set("caption", e.target.value)} />
      </label>
      <label className="ed-field">
        <span>링크 (http(s) 주소. 유튜브 게시물이면 썸네일이 나와요)</span>
        <input
          value={fn.link ?? ""}
          maxLength={HEAP_POLICY.linkUrlMaxChars}
          placeholder="https://…"
          onChange={(e) => set("link", e.target.value.trim())}
        />
      </label>
      <ErrorLine text={fn.link && !/^https?:\/\/\S+$/i.test(fn.link) ? "http(s) 주소여야 해요." : null} />
    </>
  );
}
