"use client";

import { useState, useTransition } from "react";
import { claimRoomAction, type ClaimRoomFail } from "@/lib/heap/funnel-actions";
import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";
import { charCount, checkRoomName, checkSlug, SLUG_MESSAGES } from "@/lib/heap/slug";
import { HEAP_MESSAGES } from "@/lib/heap/messages";

type TemplateOption = { id: string; label: string; blurb: string; image: string };

// 방이 없는 크리에이터가 /room/me에서 보는 화면. 어둡게 한 템플릿 방 그림이 배경이고, 버튼을 누르면 짧은 폼이 열린다.
// 폼 검사는 보기 좋게 하려는 것이고, 서버 액션이 같은 규칙으로 다시 검사한다.
export function ClaimRoom({
  nickname,
  suggestedSlug,
  templates,
}: {
  nickname: string;
  suggestedSlug: string;
  templates: TemplateOption[];
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [slug, setSlug] = useState(suggestedSlug);
  const [name, setName] = useState(Array.from(nickname).slice(0, HEAP_FUNNEL_POLICY.roomNameMaxChars).join(""));
  const [failure, setFailure] = useState<ClaimRoomFail | null>(null);
  const [pending, startTransition] = useTransition();

  const slugCheck = checkSlug(slug);
  const nameCheck = checkRoomName(name);
  const slugProblem = slug.length > 0 && !slugCheck.ok ? SLUG_MESSAGES[slugCheck.reason] : null;
  const canSubmit = !pending && slugCheck.ok && nameCheck.ok;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setFailure(null);
    startTransition(async () => {
      // 성공하면 서버가 /room/<주소>로 보낸다. 여기로 돌아오는 것은 실패 결과뿐이다.
      const result = await claimRoomAction({ template: templateId, slug, name });
      if (result) setFailure(result);
    });
  }

  return (
    <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#2f2c24] px-6 py-12">
      {/* 템플릿 방 그림. 고른 템플릿이 배경으로 바뀐다. */}
      {templates.map((template) => (
        <div
          key={template.id}
          aria-hidden
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-500 ${
            template.id === templateId ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${template.image})` }}
        />
      ))}
      <div aria-hidden className="absolute inset-0 bg-black/60" />

      {!open ? (
        <div className="relative max-w-md text-center text-key-mist">
          <h1 className="text-3xl font-bold">아직 내 미니홈이 없어요</h1>
          <p className="mt-3 text-key-mist/80">
            템플릿을 고르고 주소를 정하면 바로 내 방이 열려요. 영상은 나중에 채널을 연결하면 쌓여요.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-8 rounded-full bg-key-brown px-7 py-3 text-lg font-medium text-key-mist shadow-sm transition hover:bg-key-brown/90"
          >
            내 미니홈 만들기
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="relative flex w-full max-w-lg flex-col gap-5 rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-key-brown">내 미니홈 만들기</h1>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-key-brown">템플릿</legend>
            {templates.map((template) => (
              <label
                key={template.id}
                className={`flex cursor-pointer flex-col rounded-xl border px-4 py-3 text-sm transition ${
                  template.id === templateId ? "border-key-brown bg-key-mist" : "border-key-stone/50 hover:bg-key-mist/60"
                }`}
              >
                <span className="flex items-center gap-2 font-medium text-key-brown">
                  <input
                    type="radio"
                    name="template"
                    value={template.id}
                    checked={template.id === templateId}
                    onChange={() => setTemplateId(template.id)}
                  />
                  {template.label}
                </span>
                <span className="mt-1 text-xs text-key-stone">{template.blurb}</span>
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1 text-sm">
            방 이름
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="off"
              className="rounded-lg border border-key-stone/50 px-3 py-2"
            />
            <span className="text-xs text-key-stone">
              {charCount(name.trim())} / {HEAP_FUNNEL_POLICY.roomNameMaxChars}자 · 나중에 바꿀 수 있어요.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            방 주소
            <span className="flex items-center gap-1 rounded-lg border border-key-stone/50 px-3 py-2">
              <span className="text-key-stone">/room/</span>
              <input
                name="slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                required
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                className="min-w-0 flex-1 outline-none"
              />
            </span>
            {slugProblem ? (
              <span className="text-xs text-red-700">{slugProblem}</span>
            ) : (
              <span className="text-xs text-key-stone">
                영문 소문자, 숫자, 하이픈. {HEAP_FUNNEL_POLICY.slugMinChars}~{HEAP_FUNNEL_POLICY.slugMaxChars}자. 만든 뒤에는 바꿀 수 없어요.
              </span>
            )}
          </label>

          {failure && (
            <p className="text-sm text-red-700" role="alert">
              {failure.reason === "invalid-slug" ? failure.message : HEAP_MESSAGES[failure.reason]}
              {failure.reason === "slug-taken" && failure.suggestion && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => {
                      setSlug(failure.suggestion ?? slug);
                      setFailure(null);
                    }}
                    className="font-medium underline"
                  >
                    {failure.suggestion} 쓰기
                  </button>
                </>
              )}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-full bg-key-brown px-5 py-2 text-key-mist disabled:opacity-60"
            >
              {pending ? "만드는 중..." : "방 만들기"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="rounded-full px-5 py-2 text-key-brown disabled:opacity-60"
            >
              닫기
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
