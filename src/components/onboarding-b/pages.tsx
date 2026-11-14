// 바인더 노트 세 장의 앞면. 다꾸 콜라주: 크고 작은 글자, 종이 스티커, 원형 스티커, 폴라로이드, 테이프, 손그림.
// 크기와 자리는 장(.ob-sheet, container-type: size)에 맞춘 cqw 와 % 라서 노트 크기가 바뀌어도 같은 모양이다 (onboarding-b.css).
// 러브쑤 소개에 쓰는 사실은 public/heap/rooms/index.json(blurb)과 lovesoo/creator.json(채널, 앨범)에 있는 것만 쓴다.
import type { CSSProperties, ReactNode } from "react";
import { Paper } from "../onboarding-c/paper";
import { PixelIcon } from "../onboarding-c/icons";
import { DoodleArrow, DoodleCircle, DoodleHeart, DoodleRoom, DoodleSquiggle, DoodleStar, DoodleUnderline } from "./doodles";

// 자리: top, left (%), 기울기(deg), 너비(%)
type Spot = { t: number; l: number; r?: number; w?: number };
const at = ({ t, l, r = 0, w }: Spot): CSSProperties => ({
  top: `${t}%`,
  left: `${l}%`,
  width: w ? `${w}%` : undefined,
  transform: r ? `rotate(${r}deg)` : undefined,
});

function Bit({ spot, className = "", children }: { spot: Spot; className?: string; children: ReactNode }) {
  return (
    <div className={`ob-bit ${className}`} style={at(spot)}>
      {children}
    </div>
  );
}

function Polaroid({ color, caption, size = 13 }: { color: string; caption?: string; size?: number }) {
  return (
    <figure className="ob-polaroid">
      <span className="ob-photo" style={{ backgroundColor: color, width: `${size}cqw`, height: `${size}cqw` }} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

// 원형 종이 스티커
function Dot({ tone, children }: { tone: "clay" | "olive" | "blue" | "pink" | "cream"; children: ReactNode }) {
  return (
    <Paper className={`ob-dot ob-tone-${tone}`}>
      <span className="ob-dot-text">{children}</span>
    </Paper>
  );
}

function Sticker({ tone, tape, children }: { tone: "yellow" | "pink" | "blue" | "cream"; tape?: boolean; children: ReactNode }) {
  return (
    <Paper className={`ob-sticker ob-tone-${tone}`} tape={tape ? ["top"] : []}>
      {children}
    </Paper>
  );
}

function Tape({ spot }: { spot: Spot }) {
  return <span className="oc-tape ob-tape" style={at(spot)} aria-hidden="true" />;
}

export function PageOne() {
  return (
    <>
      <Bit spot={{ t: 4, l: 3 }} className="ob-tiny">p.01 — hello!</Bit>
      <Bit spot={{ t: 4, l: 80, r: 4 }} className="ob-tiny ob-hand">warm · funny · real</Bit>
      <Bit spot={{ t: 10, l: 5, r: -3 }} className="ob-rounded ob-s">hello, meet</Bit>
      <Bit spot={{ t: 14, l: 4 }} className="ob-pixel ob-xl">LOVE</Bit>
      <Bit spot={{ t: 37, l: 12 }} className="ob-pixel ob-xl ob-ink-clay">
        SOO
        <DoodleCircle className="ob-wrap-circle" />
      </Bit>
      <Bit spot={{ t: 13, l: 37, r: 12 }} className="ob-c-gold"><DoodleStar className="ob-w4" /></Bit>
      <Bit spot={{ t: 58, l: 4, r: -2, w: 27 }}>
        <Sticker tone="yellow" tape>
          <b className="ob-rounded ob-m">50s, living in the U.S.</b>
          <span className="ob-xs">Korean home food &amp; mukbang</span>
          <DoodleUnderline className="ob-under" />
        </Sticker>
      </Bit>
      <Bit spot={{ t: 5, l: 50, r: -8 }}><Polaroid color="#A6613C" caption="Mukbang" /></Bit>
      <Bit spot={{ t: 9, l: 70, r: 6 }}><Polaroid color="#565344" caption="Cooking" /></Bit>
      <Bit spot={{ t: 43, l: 60, r: -3 }}><Polaroid color="#c9a46a" caption="Daily vlog" /></Bit>
      <Tape spot={{ t: 4, l: 56, r: -20 }} />
      <Tape spot={{ t: 42, l: 66, r: 8 }} />
      <Bit spot={{ t: 38, l: 45, r: -10 }}><Dot tone="clay">MUK<br />BANG!</Dot></Bit>
      <Bit spot={{ t: 61, l: 34, r: 8 }}><Dot tone="pink">K-FOOD</Dot></Bit>
      <Bit spot={{ t: 63, l: 84, r: 12 }}><Dot tone="blue">small<br />days ♡</Dot></Bit>
      <Bit spot={{ t: 29, l: 33, r: -6, w: 13 }} className="ob-c-ink"><DoodleArrow /></Bit>
      <Bit spot={{ t: 25, l: 33, r: -8 }} className="ob-hand ob-xs">her shorts</Bit>
      <Bit spot={{ t: 83, l: 33, r: -4 }}><span className="ob-ticket">@lovesoostrong</span></Bit>
      <Bit spot={{ t: 82, l: 55, r: 3 }}><span className="ob-ticket ob-ticket-2">러브쑤의 작은 하루</span></Bit>
      <Bit spot={{ t: 79, l: 82 }} className="ob-turn">
        <PixelIcon name="mouse" size={18} />
        <span>scroll to flip</span>
      </Bit>
    </>
  );
}

export function PageTwo() {
  return (
    <>
      <Bit spot={{ t: 4, l: 3 }} className="ob-tiny">p.02 — the pile</Bit>
      <Bit spot={{ t: 9, l: 4 }} className="ob-pixel ob-l">EVERY</Bit>
      <Bit spot={{ t: 27, l: 4 }} className="ob-pixel ob-l ob-ink-clay">SHORT,</Bit>
      <Bit spot={{ t: 46, l: 6, r: -2 }} className="ob-rounded ob-m2">
        = a <span className="ob-mark">polaroid</span>
      </Bit>
      <Bit spot={{ t: 5, l: 40, r: -12 }}><Dot tone="clay">DIG!</Dot></Bit>
      <Bit spot={{ t: 8, l: 52, r: -14 }}><Polaroid color="#A6613C" size={11} /></Bit>
      <Bit spot={{ t: 4, l: 64, r: 9 }}><Polaroid color="#8fb0cf" size={11} /></Bit>
      <Bit spot={{ t: 26, l: 57, r: -4 }}><Polaroid color="#565344" size={11} /></Bit>
      <Bit spot={{ t: 22, l: 72, r: 15 }}><Polaroid color="#c9a46a" size={11} /></Bit>
      <Bit spot={{ t: 36, l: 64, r: -9 }}><Polaroid color="#d98b8b" size={11} caption="you loved this one" /></Bit>
      <Tape spot={{ t: 34, l: 67, r: -6 }} />
      <Bit spot={{ t: 7, l: 85, r: 10 }}><Dot tone="pink">♡</Dot></Bit>
      <Bit spot={{ t: 49, l: 37, r: -5 }} className="ob-hand ob-xs">no feed. no algorithm.</Bit>
      <Bit spot={{ t: 31, l: 41, r: 160, w: 12 }} className="ob-c-ink"><DoodleArrow /></Bit>
      <Bit spot={{ t: 60, l: 4, r: -2, w: 31 }}>
        <Sticker tone="yellow" tape>
          <ol className="ob-steps">
            <li><b className="ob-pixel">1</b> dig the pile</li>
            <li><b className="ob-pixel">2</b> find the one</li>
            <li><b className="ob-pixel">3</b> press play, again</li>
          </ol>
        </Sticker>
      </Bit>
      <Bit spot={{ t: 66, l: 39, r: 6 }}><Dot tone="olive">PLAY<br />▶</Dot></Bit>
      <Bit spot={{ t: 60, l: 54, r: 3, w: 18 }} className="ob-c-olive"><DoodleRoom /></Bit>
      <Bit spot={{ t: 80, l: 70, r: -4 }} className="ob-hand ob-s">her room!</Bit>
      <Bit spot={{ t: 62, l: 77, r: 4, w: 19 }}>
        <Sticker tone="cream">
          <span className="ob-rounded ob-s">rediscover</span>
          <span className="ob-xs">again &amp; again</span>
        </Sticker>
      </Bit>
      <Bit spot={{ t: 57, l: 9, w: 14 }} className="ob-c-clay"><DoodleSquiggle /></Bit>
    </>
  );
}

export function PageThree() {
  return (
    <>
      <Bit spot={{ t: 4, l: 3 }} className="ob-tiny">p.03 — together</Bit>
      <Bit spot={{ t: 9, l: 5, r: -3 }} className="ob-rounded ob-m2">made by Lovesoo,</Bit>
      <Bit spot={{ t: 22, l: 4 }} className="ob-pixel ob-l">FILLED</Bit>
      <Bit spot={{ t: 41, l: 9 }} className="ob-pixel ob-l">
        <span className="ob-mark ob-mark-blue">BY YOU</span>
      </Bit>
      <Bit spot={{ t: 40, l: 44, r: 10 }} className="ob-c-pink"><DoodleHeart className="ob-w6" /></Bit>
      <Bit spot={{ t: 5, l: 54, r: -4, w: 20 }}>
        <Sticker tone="yellow" tape>
          <b className="ob-rounded ob-m">hang a note</b>
          <span className="ob-xs">on the note tree. she reads them.</span>
        </Sticker>
      </Bit>
      <Bit spot={{ t: 13, l: 77, r: 5, w: 20 }}>
        <Sticker tone="pink" tape>
          <b className="ob-rounded ob-m">sign the guestbook</b>
          <span className="ob-xs">your name stays. today counts.</span>
        </Sticker>
      </Bit>
      <Bit spot={{ t: 45, l: 60, r: -2, w: 21 }}>
        <Sticker tone="blue" tape>
          <b className="ob-rounded ob-m">come back</b>
          <span className="ob-xs">every visit makes it more alive.</span>
        </Sticker>
      </Bit>
      <Bit spot={{ t: 64, l: 4, r: -8 }}><Dot tone="olive">NOTE<br />TREE</Dot></Bit>
      <Bit spot={{ t: 68, l: 18, r: 6 }}><Dot tone="clay">GUEST<br />BOOK</Dot></Bit>
      <Bit spot={{ t: 63, l: 32, r: -4 }}><Dot tone="blue">TODAY<br />+1</Dot></Bit>
      <Bit spot={{ t: 76, l: 50, r: -3 }} className="ob-hand ob-s">
        your note could be here
        <DoodleCircle className="ob-wrap-circle" />
      </Bit>
      <Bit spot={{ t: 68, l: 84, r: 8 }}><Dot tone="cream">♡ ♡</Dot></Bit>
      <Bit spot={{ t: 30, l: 46, r: 20 }} className="ob-c-gold"><DoodleStar className="ob-w4" /></Bit>
      <Bit spot={{ t: 60, l: 43, r: -15 }} className="ob-c-gold"><DoodleStar className="ob-w3" /></Bit>
      <Bit spot={{ t: 58, l: 9, w: 22 }} className="ob-c-clay"><DoodleUnderline /></Bit>
      <Tape spot={{ t: 42, l: 77, r: 30 }} />
    </>
  );
}

export const PAGES = [PageOne, PageTwo, PageThree];
