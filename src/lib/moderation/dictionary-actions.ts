"use server";

// 판정 사전 관리 화면의 쓰기 동작. 지금은 허용 목록 추가·삭제만 있다.
// Server Action은 화면 없이도 직접 부를 수 있으므로 여기서 로그인을 보고, 관리자 확인은 repo에서 다시 한다.
import { getViewer } from "@/lib/session";
import { addAllowTerm, removeAllowTerm, type DictWriteResult } from "./dictionary-repo";

export async function addAllowAction(term: string, note: string): Promise<DictWriteResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  return addAllowTerm(viewer, String(term ?? ""), String(note ?? ""));
}

export async function removeAllowAction(id: number): Promise<DictWriteResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  return removeAllowTerm(viewer, Number(id));
}
