// 종이 질감 판. 글자는 선명하게 두고, 뒤의 바탕만 SVG 필터로 거칠게 만든다.
// - 가장자리: fractalNoise(feTurbulence)로 feDisplacementMap 을 걸어 단면이 부드럽게 울퉁불퉁하다
// - 결: 고운 fractalNoise 를 feDiffuseLighting 으로 비춰 종이 섬유처럼 보이게 하고 바탕에 곱한다
import type { CSSProperties, ReactNode } from "react";

// 페이지에 한 번만 둔다
export function PaperFilters() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        <filter id="oc-paper" x="-6%" y="-10%" width="112%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="7" result="edgeNoise" />
          <feDisplacementMap in="SourceGraphic" in2="edgeNoise" scale="9" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="2" result="fiber" />
          <feDiffuseLighting in="fiber" surfaceScale="1.4" diffuseConstant="1.1" lightingColor="#ffffff" result="lit">
            <feDistantLight azimuth="235" elevation="58" />
          </feDiffuseLighting>
          <feComponentTransfer in="lit" result="soft">
            <feFuncR type="linear" slope="0.22" intercept="0.8" />
            <feFuncG type="linear" slope="0.22" intercept="0.8" />
            <feFuncB type="linear" slope="0.22" intercept="0.8" />
          </feComponentTransfer>
          <feBlend in="soft" in2="rough" mode="multiply" result="textured" />
          <feComposite in="textured" in2="rough" operator="in" />
        </filter>
        <filter id="oc-tape" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="grain" />
          <feColorMatrix in="grain" type="saturate" values="0" result="mono" />
          <feComponentTransfer in="mono" result="soft">
            <feFuncA type="linear" slope="0" intercept="1" />
            <feFuncR type="linear" slope="0.3" intercept="0.75" />
            <feFuncG type="linear" slope="0.3" intercept="0.75" />
            <feFuncB type="linear" slope="0.3" intercept="0.75" />
          </feComponentTransfer>
          <feBlend in="soft" in2="SourceGraphic" mode="multiply" result="textured" />
          <feComposite in="textured" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

type TapeSpot = "tl" | "tr" | "top";

export function Paper({
  children,
  className = "",
  tape = [],
  style,
}: {
  children: ReactNode;
  className?: string;
  tape?: TapeSpot[];
  style?: CSSProperties;
}) {
  return (
    <div className={`oc-paper ${className}`} style={style}>
      <div className="oc-paper-bg" aria-hidden="true" />
      {tape.map((spot) => (
        <span key={spot} className={`oc-tape oc-tape-${spot}`} aria-hidden="true" />
      ))}
      <div className="oc-paper-body">{children}</div>
    </div>
  );
}
