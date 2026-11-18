import { Nunito, Oswald } from "next/font/google";
import localFont from "next/font/local";

// 온보딩 컨셉 C의 글꼴. 제목과 강조는 머니그라피(Pixel, Rounded), 본문은 Pretendard Variable.
// CSS 변수로만 내보내고, 쓰는 화면의 바깥 요소에 variable 클래스를 붙인다.
export const moneygraphyPixel = localFont({
  src: "./Moneygraphy-Pixel.ttf",
  variable: "--font-oc-pixel",
  display: "swap",
});

export const moneygraphyRounded = localFont({
  src: "./Moneygraphy-Rounded.ttf",
  variable: "--font-oc-rounded",
  display: "swap",
});

// "memories" 표기 글꼴. 치폴레 디자인 가이드의 제목 글꼴(Trade Gothic LT Bold)은 유료라서 가이드가 권하는 대체 글꼴 Oswald 500을 쓴다.
// 쓰는 요소에 variable 클래스를 직접 붙인다 (스플래시, 인트로 제목, 왼쪽 위 표기).
export const oswald = Oswald({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-oc-display",
  display: "swap",
});

// 치폴레 디자인 가이드의 본문과 단추 글꼴. 방 안의 단추와 창(heap-room.css 의 --cp-ui)이 쓴다. 한글은 Pretendard 로 넘어간다.
export const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-oc-ui",
  display: "swap",
});

export const pretendard = localFont({
  src: "./PretendardVariable.woff2",
  variable: "--font-oc-body",
  weight: "45 920",
  display: "swap",
});
