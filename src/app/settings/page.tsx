import { SettingsBook } from "@/components/settings/settings-book";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

// 설정 화면: 내비게이션 바의 설정 버튼이 연다. 책상 위의 세로 책자 (settings-book.tsx).
// 고른 값은 브라우저에 남으므로 세션이나 DB 를 읽지 않는다.
export default function SettingsPage() {
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <SettingsBook />
    </div>
  );
}
