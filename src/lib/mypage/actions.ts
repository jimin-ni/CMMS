"use server";

// 방 위에 띄우는 마이페이지(내비게이션 바의 이름 버튼)가 값을 읽는다. 로그인하지 않았으면 null.
import { loadMyPageData } from "./data";
import type { MyPageData } from "@/components/mypage/my-book";

export async function loadMyPageAction(): Promise<MyPageData | null> {
  return loadMyPageData();
}
