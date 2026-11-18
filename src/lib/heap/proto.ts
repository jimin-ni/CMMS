// 개발 전용: 방 배치 시안을 DB에 쓰지 않고 띄운다. /room/<id>?proto=<이름> 으로 연다.
// 시안 파일은 public/heap/rooms/<id>/proto-<이름>.json 이고, 그 안의 필드가 DB 배치의 같은 필드를 덮는다 (없는 필드는 DB 것).
// 덮은 결과는 저장할 때와 같은 검사(validateLayout)를 거친다. 배포(production)에서는 언제나 null 이다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { publicLayout, validateLayout } from "@/lib/heap/layout";

const NAME = /^[a-z0-9-]{1,40}$/;

export async function loadProtoLayout(
  roomId: string,
  name: string,
  base: Record<string, unknown>,
): Promise<{ layout: Record<string, unknown> } | { error: string } | null> {
  if (process.env.NODE_ENV === "production") return null;
  if (!NAME.test(name) || !NAME.test(roomId)) return { error: "시안 이름이 올바르지 않아요." };
  let proto: unknown;
  try {
    const file = path.join(process.cwd(), "public", "heap", "rooms", roomId, `proto-${name}.json`);
    proto = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    return { error: `시안 파일을 읽지 못했어요: ${(e as Error).message}` };
  }
  if (typeof proto !== "object" || proto === null || Array.isArray(proto)) return { error: "시안이 객체가 아니에요." };
  // _ 로 시작하는 필드는 메모다 (seed 파일의 _note 처럼). 검사에 넘기지 않는다
  const fields = Object.fromEntries(Object.entries(proto).filter(([key]) => !key.startsWith("_")));
  const check = validateLayout({ ...base, ...fields });
  if (!check.ok) return { error: check.error };
  return { layout: publicLayout(check.layout) };
}
