"use client";

// 설정 화면 (/settings): 클립보드 종이 한 장 (틀은 clipboard.tsx, Figma "6차" Home - Setting).
// LANGUAGE: 화면 글을 영어/한국어로 바꾼다. ROOM TIME: 방의 빛 (실시간 또는 아침·점심·저녁·밤).
// 고른 값은 이 브라우저에 남는다 (src/lib/settings/prefs.ts). 갈색 단추가 지금 고른 값이다.
import { Clipboard, Section } from "./clipboard";
import { setPrefs, usePrefs, type Language, type RoomTime } from "@/lib/settings/prefs";

const TEXT = {
  ko: {
    title: "설정",
    close: "설정 닫기",
    language: "언어",
    roomTime: "방 시간대",
    times: { auto: "실시간", morning: "아침", noon: "점심", dusk: "저녁", night: "밤" },
  },
  en: {
    title: "Setting",
    close: "Close settings",
    language: "Language",
    roomTime: "Room time",
    times: { auto: "Live", morning: "Morning", noon: "Noon", dusk: "Evening", night: "Night" },
  },
};

// 언어 이름은 고른 언어와 상관없이 그 언어로 쓴다 (Figma: ENGLISH, 한국어)
const LANGUAGE_CHOICES: [Language, string][] = [
  ["en", "English"],
  ["ko", "한국어"],
];
// LIVE 한 줄, 그 아래 두 칸씩
const TIME_ROWS: Exclude<RoomTime, "auto">[] = ["morning", "noon", "dusk", "night"];

export function SettingsBook() {
  const { language, roomTime } = usePrefs();
  const t = TEXT[language];
  const timeButton = (v: RoomTime) => (
    <button
      key={v}
      type="button"
      className={`cb-btn${roomTime === v ? " on" : ""}`}
      aria-pressed={roomTime === v}
      onClick={() => setPrefs({ roomTime: v })}
    >
      {t.times[v]}
    </button>
  );

  return (
    <Clipboard title={t.title} closeLabel={t.close} className="cb-settings">
      <Section head={t.language}>
        <div className="cb-buttons" role="group" aria-label={t.language}>
          {LANGUAGE_CHOICES.map(([v, label]) => (
            <button
              key={v}
              type="button"
              lang={v}
              className={`cb-btn${language === v ? " on" : ""}`}
              aria-pressed={language === v}
              onClick={() => setPrefs({ language: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
      <Section head={t.roomTime}>
        <div role="group" aria-label={t.roomTime}>
          <div className="cb-buttons">{timeButton("auto")}</div>
          <div className="cb-buttons cb-gap">{TIME_ROWS.map(timeButton)}</div>
        </div>
      </Section>
    </Clipboard>
  );
}
