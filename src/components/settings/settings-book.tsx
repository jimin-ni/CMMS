"use client";

// 설정 화면 (/settings): 책상 위에 세로로 긴 책자 장들이 옆으로 늘어서 있다.
// - 한 화면에 두 장이 보이고, 장의 아래 20% 는 화면 아래에 잘린다 (settings-book.css 의 --pw, --ph).
// - 아래로 스크롤하면 장들이 오른쪽에서 왼쪽으로 지나간다. 세로 스크롤 거리 = 가로 이동 거리 (1:1).
// - 장 바깥(책상)을 누르거나 Esc, 닫기 단추를 누르면 홈(/home)으로 간다.
// 고른 값은 이 브라우저에 남는다 (src/lib/settings/prefs.ts).
import "../onboarding-c/onboarding-c.css";
import "../onboarding-b/onboarding-b.css";
import "./settings-book.css";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PaperFilters } from "../onboarding-c/paper";
import { PixelIcon } from "../onboarding-c/icons";
import {
  setPrefs,
  usePrefs,
  type Language,
  type RoomTime,
  type Theme,
  type VolumeKey,
} from "@/lib/settings/prefs";

const HOME_HREF = "/home";

export function SettingsBook() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  // 세로 스크롤 -> 장들의 가로 이동
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onScroll = () => {
      const y = root.scrollTop;
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${-y}px, 0, 0)`;
      if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - y / 80));
    };
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(HOME_HREF);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Tab 으로 화면 밖 장의 칸에 가면 그 장이 보이게 스크롤한다.
  // 무대는 overflow: hidden 이라 브라우저가 무대를 가로로 밀어 버리므로 되돌린다.
  const onFocus = (event: React.FocusEvent) => {
    const root = rootRef.current, stage = stageRef.current, track = trackRef.current;
    const page = (event.target as HTMLElement).closest<HTMLElement>(".sb-page");
    if (!root || !stage || !track || !page) return;
    stage.scrollLeft = 0;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const r = page.getBoundingClientRect();
    if (r.left < gap) root.scrollTop += r.left - gap;
    else if (r.right > window.innerWidth - gap) root.scrollTop += r.right - (window.innerWidth - gap);
  };

  const onStageClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest(".sb-page, .sb-top")) return;
    router.push(HOME_HREF);
  };

  return (
    <div ref={rootRef} className="oc-root ob-root sb-root">
      <PaperFilters />
      <div className="sb-scroll">
        <div ref={stageRef} className="oc-stage" onClick={onStageClick}>
          <div className="oc-layer ob-desk" />

          <header className="sb-top">
            <h1 className="ob-pixel">SETTINGS</h1>
            <div ref={hintRef} className="sb-hint" aria-hidden="true">
              <PixelIcon name="mouse" size={20} />
              <span>scroll to turn</span>
            </div>
            <button type="button" className="sb-close" onClick={() => router.push(HOME_HREF)} aria-label="설정 닫기">
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div ref={trackRef} className="sb-track" onFocus={onFocus}>
            <LanguagePage />
            <ThemePage />
            <RoomTimePage />
            <SoundPage />
          </div>
        </div>
      </div>
    </div>
  );
}

function Page({ no, tag, title, children }: { no: number; tag: string; title: string; children: ReactNode }) {
  return (
    <section className="sb-page" aria-labelledby={`sb-title-${no}`}>
      <span className="oc-tape sb-tape" aria-hidden="true" />
      <p className="ob-tiny sb-no">
        p.0{no} — {tag}
      </p>
      <h2 id={`sb-title-${no}`} className="ob-pixel sb-title">
        {title}
      </h2>
      {children}
    </section>
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
