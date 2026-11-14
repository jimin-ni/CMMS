// 손으로 그린 듯한 낙서: 화살표, 동그라미, 밑줄, 별, 하트. 화면에 들어오면 선이 그려진다 (onboarding-b.css 의 .ob-draw).
// 선은 일부러 조금씩 흔들리게 찍었다. 색은 currentColor 를 따른다.
import type { CSSProperties } from "react";

type DoodleProps = { className?: string; style?: CSSProperties };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  pathLength: 1,
};

export function DoodleCircle({ className = "", style }: DoodleProps) {
  return (
    <svg viewBox="0 0 220 90" className={`ob-doodle ob-draw ${className}`} style={style} aria-hidden="true">
      <path {...stroke} d="M168 14 C130 2 52 4 22 26 C2 41 10 66 48 78 C92 91 168 86 200 64 C220 49 206 22 162 12 C140 7 112 8 96 10" />
    </svg>
  );
}

export function DoodleUnderline({ className = "", style }: DoodleProps) {
  return (
    <svg viewBox="0 0 240 24" className={`ob-doodle ob-draw ${className}`} style={style} aria-hidden="true">
      <path {...stroke} d="M4 14 C48 8 96 18 140 11 C172 6 204 9 236 12" />
      <path {...stroke} strokeWidth={1.8} d="M30 20 C80 16 140 21 200 17" />
    </svg>
  );
}

export function DoodleArrow({ className = "", style, flip = false }: DoodleProps & { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={`ob-doodle ob-draw ${className}`}
      style={{ ...style, transform: `${style?.transform ?? ""} ${flip ? "scaleX(-1)" : ""}` }}
      aria-hidden="true"
    >
      <path {...stroke} d="M8 18 C40 4 92 10 112 40 C124 58 126 78 122 96" />
      <path {...stroke} d="M104 80 C112 88 118 94 122 100 C128 92 134 86 142 80" />
    </svg>
  );
}

export function DoodleStar({ className = "", style }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" className={`ob-doodle ob-draw ${className}`} style={style} aria-hidden="true">
      <path {...stroke} d="M24 4 L28 18 L43 19 L31 28 L36 43 L24 34 L12 43 L17 28 L5 19 L20 18 Z" />
    </svg>
  );
}

export function DoodleHeart({ className = "", style }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 44" className={`ob-doodle ob-draw ${className}`} style={style} aria-hidden="true">
      <path {...stroke} d="M24 40 C10 30 2 22 4 13 C6 5 16 2 22 10 C24 13 24 13 25 10 C30 2 42 4 44 13 C46 23 36 31 24 40" />
    </svg>
  );
}

// 작은 방 스케치 (2번 페이지): 바닥, 두 벽, 창문, 탁자 위 사진 더미
export function DoodleRoom({ className = "", style }: DoodleProps) {
  return (
    <svg viewBox="0 0 260 200" className={`ob-doodle ob-draw ${className}`} style={style} aria-hidden="true">
      <path {...stroke} d="M30 70 L130 22 L232 70 L232 150 L130 196 L30 150 Z" />
      <path {...stroke} d="M130 22 L130 120 M30 70 L130 120 L232 70" />
      <path {...stroke} strokeWidth={2} d="M58 82 L96 64 L96 92 L58 110 Z M77 73 L77 101 M58 96 L96 78" />
      <path {...stroke} strokeWidth={2} d="M112 146 L150 128 L188 146 L150 164 Z M120 150 L120 166 M180 150 L180 166" />
      <path {...stroke} strokeWidth={1.8} d="M138 138 L152 132 L160 138 L146 144 Z M144 134 L158 130 L164 136" />
    </svg>
  );
}
