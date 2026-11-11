"use server";

import { PERSONA_MAX, savePersona } from "./profile";
import { getViewer } from "@/lib/session";

export type PersonaResult = { ok: true } | { ok: false; error: string };

export async function savePersonaAction(
  _prev: PersonaResult | null,
  formData: FormData,
): Promise<PersonaResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (viewer.role !== "creator") return { ok: false, error: "크리에이터만 성격을 저장할 수 있어요." };

  const persona = String(formData.get("persona") ?? "").trim();
  if (Array.from(persona).length > PERSONA_MAX) {
    return { ok: false, error: `성격은 ${PERSONA_MAX}자까지 쓸 수 있어요.` };
  }

  await savePersona(viewer.id, persona);
  return { ok: true };
}
