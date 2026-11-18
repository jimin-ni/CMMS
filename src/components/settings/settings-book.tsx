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
  type Theme,
  type VolumeKey,
} from "@/lib/settings/prefs";

export function SettingsBook() {
  return (
    <Book heading="SETTINGS" closeLabel="설정 닫기">
      <LanguagePage />
      <ThemePage />
      <RoomTimePage />
      <SoundPage />
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

const LANGUAGE_LABELS: [Language, string, string][] = [
  ["ko", "한국어", "Korean"],
  ["en", "English", "영어"],
];

function LanguagePage() {
  const { language } = usePrefs();
  return (
    <Page no={1} tag="language" title="setting">
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">
          언어 <small>Language</small>
        </legend>
        <div className="sb-row">
          {LANGUAGE_LABELS.map(([v, label, sub]) => (
            <Choice key={v} name="language" value={v} checked={language === v} onPick={(language) => setPrefs({ language })} className="sb-chip">
              <b className="ob-rounded">{label}</b>
              <small>{sub}</small>
            </Choice>
          ))}
        </div>
      </fieldset>
      <p className="ob-hand sb-note">pick the words you read best ♡</p>
    </Page>
  );
}

const THEME_LABELS: [Theme, string, string][] = [
  ["light", "라이트", "Light"],
  ["dark", "다크", "Dark"],
];

function ThemePage() {
  const { theme } = usePrefs();
  return (
    <Page no={2} tag="theme" title="theme">
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">
          테마 <small>Theme</small>
        </legend>
        <div className="sb-row">
          {THEME_LABELS.map(([v, label, sub]) => (
            <Choice key={v} name="theme" value={v} checked={theme === v} onPick={(theme) => setPrefs({ theme })} className="sb-card">
              <span className={`sb-swatch sb-swatch-${v}`} aria-hidden="true" />
              <b className="ob-rounded">{label}</b>
              <small>{sub}</small>
            </Choice>
          ))}
        </div>
      </fieldset>
    </Page>
  );
}

// 시간대 칸의 하늘색: 엔진(heap/engine/time.js)의 같은 시간대 배경색(bd)
const ROOM_TIME_LABELS: [Exclude<RoomTime, "auto">, string, string, string][] = [
  ["morning", "아침", "Morning", "linear-gradient(180deg, #b4cfde, #eee4cb)"],
  ["noon", "점심", "Noon", "linear-gradient(180deg, #a6cbe2, #e6f0f1)"],
  ["dusk", "저녁", "Evening", "linear-gradient(180deg, #4b416c, #d68a62)"],
  ["night", "밤", "Night", "linear-gradient(180deg, #121833, #2a3157)"],
];

function RoomTimePage() {
  const { roomTime } = usePrefs();
  const pick = (roomTime: RoomTime) => setPrefs({ roomTime });
  return (
    <Page no={3} tag="room time" title="room time">
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">
          방 시간대 <small>Room time</small>
        </legend>
        <Choice name="room-time" value="auto" checked={roomTime === "auto"} onPick={pick} className="sb-chip sb-wide">
          <b className="ob-rounded">실시간</b>
          <small>Realtime · 한국 시간을 따라 바뀌어요</small>
        </Choice>
        <p className="ob-hand sb-or">or</p>
        <div className="sb-grid">
          {ROOM_TIME_LABELS.map(([v, label, sub, sky]) => (
            <Choice key={v} name="room-time" value={v} checked={roomTime === v} onPick={pick} className="sb-card sb-polaroid">
              <span className="sb-sky" style={{ background: sky }} aria-hidden="true" />
              <b className="ob-rounded">{label}</b>
              <small>{sub}</small>
            </Choice>
          ))}
        </div>
      </fieldset>
      {roomTime === null && <p className="ob-hand sb-note">아직 고르지 않았어요: 방 주인이 정한 시간대로 보여요</p>}
    </Page>
  );
}

const VOLUME_LABELS: [VolumeKey, string, string][] = [
  ["video", "재생 영상 소리", "Video"],
  ["music", "배경음악", "Music"],
  ["effects", "효과음", "Effects"],
];

function SoundPage() {
  const { volume } = usePrefs();
  return (
    <Page no={4} tag="sound" title="sound">
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">
          소리 <small>Sound</small>
        </legend>
        {VOLUME_LABELS.map(([key, label, sub]) => (
          <label key={key} className="sb-slider">
            <span className="sb-slider-head">
              <b className="ob-rounded">{label}</b>
              <small>{sub}</small>
              <output className="ob-pixel">{volume[key]}</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volume[key]}
              onChange={(e) => setPrefs({ volume: { ...volume, [key]: Number(e.target.value) } })}
              style={{ "--fill": `${volume[key]}%` } as React.CSSProperties}
            />
          </label>
        ))}
      </fieldset>
    </Page>
  );
}
