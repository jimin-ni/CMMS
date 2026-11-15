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

export const pretendard = localFont({
  src: "./PretendardVariable.woff2",
  variable: "--font-oc-body",
  weight: "45 920",
  display: "swap",
});
