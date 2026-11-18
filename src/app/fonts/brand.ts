import localFont from "next/font/local";
import { Nunito, Oswald } from "next/font/google";

// 사이트 공통 글꼴 (디자인 기준: Chipotle DESIGN.md). 루트 레이아웃의 <html> 에 variable 클래스를 붙인다.
// - 영문 제목: Trade Gothic LT Bold 대체로 Oswald 500, 대문자. 영문 본문: Nunito.
// - 한글 제목: 양진체(YANGJIN). 한글 본문: Pretendard Variable (onboarding.ts 의 --font-oc-body).
// Oswald 와 Nunito 에는 한글 글자가 없으므로, 한 글꼴 목록에 영문 글꼴을 먼저 두면 한글은 다음 글꼴로 넘어간다.
// 묶은 목록은 globals.css 의 --font-display, --font-text 이다.
export const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  display: "swap",
});

export const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

// 양진체 v0.9 (원본 otf 를 woff2 로 바꾼 파일). 굵기는 한 가지(500)뿐이다.
export const yangjin = localFont({
  src: "./Yangjin.woff2",
  variable: "--font-yangjin",
  weight: "500",
  display: "swap",
});
