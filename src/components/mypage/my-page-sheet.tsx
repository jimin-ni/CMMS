"use client";

// 방 위에 띄우는 마이페이지 (내비게이션 바의 이름 버튼, room-tour.tsx). 뒤에는 지금 있는 방이 그대로 보인다.
// 열 때마다 서버 액션으로 값을 읽는다. 읽는 동안은 빈 종이에 제목만 보인다.
import { useCallback, useEffect, useState } from "react";
import { Clipboard } from "@/components/settings/clipboard";
import { loadMyPageAction } from "@/lib/mypage/actions";
import { useLanguage } from "@/lib/settings/prefs";
import { MyBook, type MyPageData } from "./my-book";

const TEXT = {
  ko: { title: "마이페이지", close: "마이페이지 닫기", loading: "불러오는 중…", failed: "불러오지 못했어요. 다시 열어 주세요." },
  en: { title: "Mypage", close: "Close my page", loading: "Loading…", failed: "Couldn't load. Please open it again." },
};

export function MyPageSheet({ onClose }: { onClose: () => void }) {
  const t = TEXT[useLanguage()];
  // undefined: 읽는 중, null: 실패(로그아웃 상태 포함)
  const [data, setData] = useState<MyPageData | null | undefined>(undefined);

  const load = useCallback(() => {
    loadMyPageAction()
      .then(setData)
      .catch(() => setData(null));
  }, []);
  useEffect(load, [load]);

  if (data) return <MyBook {...data} onClose={onClose} onRefresh={load} />;
  return (
    <Clipboard title={t.title} closeLabel={t.close} onClose={onClose}>
      <p className="cb-empty cb-gap" role="status">
        {data === undefined ? t.loading : t.failed}
      </p>
    </Clipboard>
  );
}
