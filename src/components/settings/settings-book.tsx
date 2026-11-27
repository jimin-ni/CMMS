"use client";

// 설정 화면 (/settings): 책상 위에 펼친 O링 수첩 (틀은 book.tsx).
// 고른 값은 이 브라우저에 남는다 (src/lib/settings/prefs.ts).
import type { ReactNode } from "react";
import { Book, BookPage } from "./book";
import {
  setPrefs,
  usePrefs,
  type Language,
  type RoomTime,
} from "@/lib/settings/prefs";

export function SettingsBook() {
  return (
    <Book heading="SETTINGS" closeLabel="Close settings">
      <LanguagePage />
      <RoomTimePage />
    </Book>
  );
}

function Page({ no, tag, title, children }: { no: number; tag: string; title: string; children: ReactNode }) {
  return (
    <BookPage id={String(no)} no={no} tag={tag} title={title}>
      {children}
    </BookPage>
  );
}

// 둘 이상 중에서 하나 고르기 (라디오). 고른 칸은 진흙색 테두리와 손그림 체크
function Choice<T extends string>({
  name,
  value,
  checked,
  onPick,
  className = "",
  children,
}: {
  name: string;
  value: T;
  checked: boolean;
  onPick: (v: T) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`sb-choice ${className}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onPick(value)} />
      {children}
    </label>
  );
}

const LANGUAGE_LABELS: [Language, string][] = [
  ["ko", "Korean"],
  ["en", "English"],
];

function LanguagePage() {
  const { language } = usePrefs();
  return (
    <Page no={1} tag="language" title="setting">
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">Language</legend>
        <div className="sb-row">
          {LANGUAGE_LABELS.map(([v, label]) => (
            <Choice key={v} name="language" value={v} checked={language === v} onPick={(language) => setPrefs({ language })} className="sb-chip">
              <b className="ob-rounded">{label}</b>
            </Choice>
          ))}
        </div>
      </fieldset>
      <p className="ob-hand sb-note">pick the words you read best ♡</p>
    </Page>
  );
}

// 시간대 칸의 하늘색: 엔진(heap/engine/time.js)의 같은 시간대 배경색(bd)
const ROOM_TIME_LABELS: [Exclude<RoomTime, "auto">, string, string][] = [
  ["morning", "Morning", "linear-gradient(180deg, #b4cfde, #eee4cb)"],
  ["noon", "Noon", "linear-gradient(180deg, #a6cbe2, #e6f0f1)"],
  ["dusk", "Evening", "linear-gradient(180deg, #4b416c, #d68a62)"],
  ["night", "Night", "linear-gradient(180deg, #121833, #2a3157)"],
];

function RoomTimePage() {
  const { roomTime } = usePrefs();
  const pick = (roomTime: RoomTime) => setPrefs({ roomTime });
  return (
    <Page no={2} tag="room time" title="room time">
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">Room time</legend>
        <Choice name="room-time" value="auto" checked={roomTime === "auto"} onPick={pick} className="sb-chip sb-wide">
          <b className="ob-rounded">Live</b>
          <small>Follows Korea time</small>
        </Choice>
        <p className="ob-hand sb-or">or</p>
        <div className="sb-grid">
          {ROOM_TIME_LABELS.map(([v, label, sky]) => (
            <Choice key={v} name="room-time" value={v} checked={roomTime === v} onPick={pick} className="sb-card sb-polaroid">
              <span className="sb-sky" style={{ background: sky }} aria-hidden="true" />
              <b className="ob-rounded">{label}</b>
            </Choice>
          ))}
        </div>
      </fieldset>
      {roomTime === null && <p className="ob-hand sb-note">Not set: shows the owner&apos;s time</p>}
    </Page>
  );
}
