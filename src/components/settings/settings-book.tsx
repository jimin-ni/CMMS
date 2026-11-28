"use client";

// 설정 화면 (/settings): 책상 위에 펼친 O링 수첩 (틀은 book.tsx).
// 고른 값은 이 브라우저에 남는다 (src/lib/settings/prefs.ts).
import type { ReactNode } from "react";
import { Book, BookPage } from "./book";
import {
  LANGUAGES,
  setPrefs,
  useLanguage,
  usePrefs,
  type RoomTime,
} from "@/lib/settings/prefs";

// 화면 글. 영어는 영어화(2026-11-27) 때의 글 그대로다
const TEXT = {
  ko: {
    heading: "설정",
    close: "설정 닫기",
    langTag: "언어",
    langTitle: "설정",
    langLegend: "언어",
    langs: { ko: "한국어", en: "영어" },
    langNote: "가장 편한 말을 골라요 ♡",
    timeTag: "방 시간대",
    timeTitle: "방 시간대",
    timeLegend: "방 시간대",
    live: "실시간",
    liveSub: "한국 시간을 따라 바뀌어요",
    or: "또는",
    times: { morning: "아침", noon: "점심", dusk: "저녁", night: "밤" },
    notSet: "아직 고르지 않았어요: 방 주인이 정한 시간대로 보여요",
  },
  en: {
    heading: "SETTINGS",
    close: "Close settings",
    langTag: "language",
    langTitle: "setting",
    langLegend: "Language",
    langs: { ko: "Korean", en: "English" },
    langNote: "pick the words you read best ♡",
    timeTag: "room time",
    timeTitle: "room time",
    timeLegend: "Room time",
    live: "Live",
    liveSub: "Follows Korea time",
    or: "or",
    times: { morning: "Morning", noon: "Noon", dusk: "Evening", night: "Night" },
    notSet: "Not set: shows the owner's time",
  },
};

export function SettingsBook() {
  const t = TEXT[useLanguage()];
  return (
    <Book heading={t.heading} closeLabel={t.close}>
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

function LanguagePage() {
  const { language } = usePrefs();
  const t = TEXT[language];
  return (
    <Page no={1} tag={t.langTag} title={t.langTitle}>
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">{t.langLegend}</legend>
        <div className="sb-row">
          {LANGUAGES.map((v) => (
            <Choice key={v} name="language" value={v} checked={language === v} onPick={(language) => setPrefs({ language })} className="sb-chip">
              <b className="ob-rounded">{t.langs[v]}</b>
            </Choice>
          ))}
        </div>
      </fieldset>
      <p className="ob-hand sb-note">{t.langNote}</p>
    </Page>
  );
}

// 시간대 칸의 하늘색: 엔진(heap/engine/time.js)의 같은 시간대 배경색(bd)
const ROOM_TIME_SKIES: [Exclude<RoomTime, "auto">, string][] = [
  ["morning", "linear-gradient(180deg, #b4cfde, #eee4cb)"],
  ["noon", "linear-gradient(180deg, #a6cbe2, #e6f0f1)"],
  ["dusk", "linear-gradient(180deg, #4b416c, #d68a62)"],
  ["night", "linear-gradient(180deg, #121833, #2a3157)"],
];

function RoomTimePage() {
  const { roomTime, language } = usePrefs();
  const t = TEXT[language];
  const pick = (roomTime: RoomTime) => setPrefs({ roomTime });
  return (
    <Page no={2} tag={t.timeTag} title={t.timeTitle}>
      <fieldset className="sb-field">
        <legend className="ob-rounded sb-legend">{t.timeLegend}</legend>
        <Choice name="room-time" value="auto" checked={roomTime === "auto"} onPick={pick} className="sb-chip sb-wide">
          <b className="ob-rounded">{t.live}</b>
          <small>{t.liveSub}</small>
        </Choice>
        <p className="ob-hand sb-or">{t.or}</p>
        <div className="sb-grid">
          {ROOM_TIME_SKIES.map(([v, sky]) => (
            <Choice key={v} name="room-time" value={v} checked={roomTime === v} onPick={pick} className="sb-card sb-polaroid">
              <span className="sb-sky" style={{ background: sky }} aria-hidden="true" />
              <b className="ob-rounded">{t.times[v]}</b>
            </Choice>
          ))}
        </div>
      </fieldset>
      {roomTime === null && <p className="ob-hand sb-note">{t.notSet}</p>}
    </Page>
  );
}
