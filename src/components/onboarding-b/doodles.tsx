// 손으로 그린 듯한 낙서: 화살표, 동그라미, 밑줄, 별, 하트, 방 스케치.
// 선마다 얇은 두 번째 선을 살짝 어긋나게 겹치고, #ob-rough 필터(concept-b.tsx)로 가장자리를 거칠게 해 펜 자국처럼 보이게 한다.
// 장이 펼쳐지면 선이 그려진다 (onboarding-b.css 의 .ob-draw). 색은 currentColor.
import type { CSSProperties } from "react";

type DoodleProps = { className?: string; style?: CSSProperties };

// 굵은 선 + 어긋난 가는 선
function Ink({ d, width = 3.2 }: { d: string; width?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, pathLength: 1 };
  return (
    <>
      <path {...common} strokeWidth={width} d={d} />
      <path {...common} strokeWidth={width * 0.4} opacity={0.55} transform="translate(1.2 0.9)" d={d} />
    </>
  );
}

function Doodle({ viewBox, className = "", style, children }: DoodleProps & { viewBox: string; children: React.ReactNode }) {
  return (
    <svg viewBox={viewBox} className={`ob-doodle ob-draw ${className}`} style={style} aria-hidden="true">
      <g filter="url(#ob-rough)">{children}</g>
    </svg>
  );
}

export function DoodleCircle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 220 90" {...props}>
      <Ink d="M168 14 C130 2 52 4 22 26 C2 41 10 66 48 78 C92 91 168 86 200 64 C220 49 206 22 162 12 C140 7 112 8 96 10" />
    </Doodle>
  );
}

export function DoodleUnderline(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 240 24" {...props}>
      <Ink d="M4 14 C48 8 96 18 140 11 C172 6 204 9 236 12" />
      <Ink width={2} d="M30 20 C80 16 140 21 200 17" />
    </Doodle>
  );
}

export function DoodleArrow(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 160 110" {...props}>
      <Ink d="M8 18 C40 4 92 10 112 40 C124 58 126 78 122 96" />
      <Ink d="M104 80 C112 88 118 94 122 100 C128 92 134 86 142 80" />
    </Doodle>
  );
}

export function DoodleStar(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 48 48" {...props}>
      <Ink width={2.6} d="M24 4 L28 18 L43 19 L31 28 L36 43 L24 34 L12 43 L17 28 L5 19 L20 18 Z" />
    </Doodle>
  );
}

export function DoodleHeart(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 48 44" {...props}>
      <Ink width={2.8} d="M24 40 C10 30 2 22 4 13 C6 5 16 2 22 10 C24 13 24 13 25 10 C30 2 42 4 44 13 C46 23 36 31 24 40" />
    </Doodle>
  );
}

export function DoodleSquiggle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 120 30" {...props}>
      <Ink width={2.6} d="M4 18 C14 4 22 4 28 16 C34 28 42 28 50 16 C58 4 66 4 72 16 C78 28 86 28 94 16 C102 4 110 6 116 14" />
    </Doodle>
  );
}

// 작은 방 스케치: 바닥, 두 벽, 창문, 탁자 위 사진 더미
export function DoodleRoom(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 260 200" {...props}>
      <Ink d="M30 70 L130 22 L232 70 L232 150 L130 196 L30 150 Z" />
      <Ink d="M130 22 L130 120 M30 70 L130 120 L232 70" />
      <Ink width={2.2} d="M58 82 L96 64 L96 92 L58 110 Z M77 73 L77 101 M58 96 L96 78" />
      <Ink width={2.2} d="M112 146 L150 128 L188 146 L150 164 Z M120 150 L120 166 M180 150 L180 166" />
      <Ink width={2} d="M138 138 L152 132 L160 138 L146 144 Z M144 134 L158 130 L164 136" />
    </Doodle>
  );
}
