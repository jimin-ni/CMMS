"use client";

// 온보딩 컨셉 B: 책상 위에 놓인 바인더 노트. 링은 아래에 있고, 스크롤하면 다음 장이 아래에서 올라와 앞장 위에 겹친다.
// 종이 판, 테이프, 아이콘, 글꼴은 컨셉 C와 같은 것을 쓴다 (onboarding-c/paper.tsx, icons.tsx, app/fonts/onboarding.ts).
import "../onboarding-c/onboarding-c.css";
import "./onboarding-b.css";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { PaperFilters } from "../onboarding-c/paper";
import { PixelIcon } from "../onboarding-c/icons";
import { DoodleArrow, DoodleCircle, DoodleHeart, DoodleRoom, DoodleStar, DoodleUnderline } from "./doodles";

// 러브쑤 소개에 쓰는 사실은 public/heap/rooms/index.json(blurb)과 lovesoo/creator.json(채널, 앨범)에 있는 것만 쓴다.
const ALBUMS = [
  { name: "Mukbang", color: "#A6613C", note: "first bites" },
  { name: "Cooking", color: "#565344", note: "home recipes" },
  { name: "Daily vlog", color: "#c9a46a", note: "little days" },
];
const PILE = ["#A6613C", "#c9a46a", "#565344", "#8fb0cf", "#d98b8b"];

function Polaroid({ color, caption, className = "" }: { color: string; caption: string; className?: string }) {
  return (
    <figure className={`ob-polaroid ${className}`}>
      <span className="ob-photo" style={{ background: color }} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Tape({ className = "" }: { className?: string }) {
  return <span className={`oc-tape ob-tape ${className}`} aria-hidden="true" />;
}

export function ConceptB() {
  const rootRef = useRef<HTMLDivElement>(null);

  // 장이 화면에 들어오면 낙서 선이 그려진다
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("in");
      },
      { root, threshold: 0.35 },
    );
    root.querySelectorAll(".ob-page").forEach((page) => seen.observe(page));
    return () => seen.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="ob-root">
      <PaperFilters />
      <div className="ob-shadow" aria-hidden="true" />

      <main className="ob-notebook">
        {/* 1장: 러브쑤 소개 */}
        <section className="ob-page" style={{ zIndex: 1 }} aria-labelledby="ob-p1">
          <div className="ob-sheet">
            <p className="ob-date ob-rounded">p.01 · our little room</p>
            <div className="ob-a ob-title-1">
              <span className="ob-rounded ob-kicker">Meet</span>
              <h1 id="ob-p1" className="ob-pixel ob-name">
                Lovesoo
                <DoodleCircle className="ob-name-circle" />
              </h1>
            </div>

            <div className="ob-a ob-note ob-yellow ob-p1-note">
              <Tape className="ob-tape-top" />
              <ul>
                <li>In her 50s, living in the U.S.</li>
                <li>Mukbang &amp; Korean home food</li>
                <li>Small, warm, everyday moments</li>
              </ul>
              <DoodleUnderline className="ob-note-line" />
            </div>

            <div className="ob-a ob-p1-photos">
              {ALBUMS.map((album, i) => (
                <div key={album.name} className={`ob-photo-slot ob-tilt-${i}`}>
                  <Tape className="ob-tape-top" />
                  <Polaroid color={album.color} caption={album.name} />
                  <span className="ob-hand ob-photo-note">{album.note}</span>
                </div>
              ))}
            </div>

            <div className="ob-a ob-p1-tags">
              <span className="ob-ticket">@lovesoostrong</span>
              <span className="ob-ticket ob-ticket-2">러브쑤의 작은 하루</span>
            </div>

            <div className="ob-a ob-p1-arrow">
              <span className="ob-hand">every short she made…</span>
              <DoodleArrow className="ob-arrow-1" />
              <span className="ob-hand ob-strong">kept right here</span>
            </div>
            <DoodleStar className="ob-a ob-star-1" />

            <div className="ob-turn">
              <PixelIcon name="mouse" size={22} />
              <span>Scroll to turn the page</span>
            </div>
          </div>
        </section>

        {/* 2장: 쇼츠가 폴라로이드로 쌓인 방 */}
        <section className="ob-page" style={{ zIndex: 2 }} aria-labelledby="ob-p2">
          <div className="ob-sheet">
            <p className="ob-date ob-rounded">p.02 · the pile</p>
            <h2 id="ob-p2" className="ob-a ob-rounded ob-head-2">
              Every short,
              <br />a <span className="ob-mark">polaroid</span>
              <DoodleUnderline className="ob-head-line" />
            </h2>

            <div className="ob-a ob-pile">
              {PILE.map((color, i) => (
                <Polaroid key={color} color={color} caption="" className={`ob-pile-${i}`} />
              ))}
              <span className="ob-hand ob-pile-note">her shorts, stacked like old photos</span>
            </div>

            <ol className="ob-a ob-steps">
              <li>
                <b className="ob-pixel">1</b> Dig through the pile
              </li>
              <li>
                <b className="ob-pixel">2</b> Find the one you loved
              </li>
              <li>
                <b className="ob-pixel">3</b> Press play, again
              </li>
            </ol>

            <div className="ob-a ob-room-sketch">
              <DoodleRoom className="ob-room-svg" />
              <span className="ob-hand">her room ♡</span>
            </div>
            <DoodleArrow className="ob-a ob-arrow-2" flip />

            <div className="ob-a ob-strip-note">
              <Tape className="ob-tape-left" />
              No feed to scroll past. Just a pile of memories to dig through.
            </div>
          </div>
        </section>

        {/* 3장: 구독자와 함께 만드는 방 */}
        <section className="ob-page" style={{ zIndex: 3 }} aria-labelledby="ob-p3">
          <div className="ob-sheet">
            <p className="ob-date ob-rounded">p.03 · together</p>
            <h2 id="ob-p3" className="ob-a ob-rounded ob-head-3">
              Made by Lovesoo,
              <br />
              <span className="ob-mark ob-mark-2">filled by you.</span>
              <DoodleHeart className="ob-heart" />
            </h2>

            <div className="ob-a ob-notes">
              <div className="ob-note ob-yellow ob-tilt-0">
                <Tape className="ob-tape-top" />
                <b className="ob-rounded">Hang a note</b>
                <p>Leave a message on the note tree. She reads them.</p>
              </div>
              <div className="ob-note ob-pink ob-tilt-1">
                <Tape className="ob-tape-top" />
                <b className="ob-rounded">Sign the guestbook</b>
                <p>Your name stays in the room. Today counts too.</p>
              </div>
              <div className="ob-note ob-blue ob-tilt-2">
                <Tape className="ob-tape-top" />
                <b className="ob-rounded">Come back</b>
                <p>Every visit leaves the room a little more alive.</p>
              </div>
            </div>

            <div className="ob-a ob-circle-note">
              <span className="ob-hand">your note could be here</span>
              <DoodleCircle className="ob-small-circle" />
            </div>
            <DoodleStar className="ob-a ob-star-2" />

            <Link href="/room/lovesoo" className="ob-a ob-cta">
              <Tape className="ob-tape-top" />
              <span className="ob-rounded">Visit Lovesoo&apos;s room</span>
              <PixelIcon name="home" size={22} />
            </Link>
          </div>
        </section>
      </main>

      {/* 아래 바인더: 흰 종이 띠의 펀칭 구멍 4쌍, 원형 구멍에 꽂힌 은색 링, 겹친 종이와 바인더 커버 */}
      <div className="ob-binder" aria-hidden="true">
        <div className="ob-strip">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="ob-holes" style={{ left: `${12.5 + i * 25}%` }}>
              <span className="ob-hole-pill" />
              <span className="ob-hole-round">
                <svg className="ob-ring" viewBox="0 0 30 140" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`ob-metal-${i}`} x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0" stopColor="#6c7178" />
                      <stop offset="0.35" stopColor="#f4f6f8" />
                      <stop offset="0.55" stopColor="#b9bec4" />
                      <stop offset="1" stopColor="#5d6168" />
                    </linearGradient>
                  </defs>
                  <path d="M15 4 C15 40 22 70 20 140" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="9" strokeLinecap="round" transform="translate(2 3)" />
                  <path d="M15 4 C15 40 22 70 20 140" fill="none" stroke={`url(#ob-metal-${i})`} strokeWidth="8" strokeLinecap="round" />
                  <path d="M13.5 8 C13.5 40 20 70 18.5 140" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
            </span>
          ))}
        </div>
        <div className="ob-layers" />
        <div className="ob-cover" />
      </div>
    </div>
  );
}
