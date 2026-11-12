"use server";

import { PERSONA_MAX, savePersona } from "./profile";
import { AVATAR_MAX_BYTES, deleteAvatar, detectImageType, saveAvatar } from "./avatar";
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

export type AvatarResult = { ok: true } | { ok: false; error: string };

// 프로필 사진 등록·변경. 크리에이터만 할 수 있고, 구독자는 등록할 수 없다.
export async function saveAvatarAction(
  _prev: AvatarResult | null,
  formData: FormData,
): Promise<AvatarResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (viewer.role !== "creator") return { ok: false, error: "크리에이터만 프로필 사진을 등록할 수 있어요." };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "사진 파일을 골라 주세요." };
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: `사진은 ${AVATAR_MAX_BYTES / 1024}KB까지 올릴 수 있어요.` };
  }

  const content = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(content);
  if (!type) return { ok: false, error: "PNG, JPEG, WebP, GIF 사진만 올릴 수 있어요." };

  await saveAvatar(viewer.id, content, type);
  return { ok: true };
}

export async function deleteAvatarAction(): Promise<AvatarResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (viewer.role !== "creator") return { ok: false, error: "크리에이터만 프로필 사진을 바꿀 수 있어요." };

  await deleteAvatar(viewer.id);
  return { ok: true };
}
