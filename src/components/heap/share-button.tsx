"use client";

import { useEffect, useState, type RefObject } from "react";
import { markShared } from "./setup-checklist";

// 방 HUD의 공유 단추 (판정 J5). 방 주인과 방문자 모두에게 보인다.
// 누르면 엔진이 지금 구도를 한 장 그려(heap:capture, engine/loop.js) PNG로 만든다. 화면 위 글자와 단추는 들어가지 않는다.
// 사진은 클립보드에 넣고, 브라우저가 허락하면 같은 클릭에 방 주소도 글자로 함께 넣는다 (ClipboardItem 하나에 image/png + text/plain).
// 안 되면 사진만, 그것도 안 되면 내려받기와 링크 복사 단추로 대신한다. 서버로는 아무것도 보내지 않는다.

type Copied = "both" | "image" | "none";
type Outcome = { text: string; href: string | null; copied: Copied; seq: number };

const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/png"));

// 브라우저가 클립보드 쓰기를 막았는지 (권한, 사용자 동작 밖)
const denied = (error: unknown) => error instanceof DOMException && error.name === "NotAllowedError";

export function ShareButton({
  rootRef,
  roomId,
  roomUuid,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  // 주소의 방 이름(slug). 방 주소와 내려받을 파일 이름에 쓴다.
  roomId: string;
  roomUuid: string;
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);
  const [linkNote, setLinkNote] = useState("");

  // 내려받기 주소(object URL)는 다음 결과가 오거나 단추가 사라질 때 놓는다
  const href = out?.href ?? null;
  useEffect(() => {
    if (!href) return;
    return () => URL.revokeObjectURL(href);
  }, [href]);

  // Esc 로 닫는다
  useEffect(() => {
    if (!out) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOut(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [out]);

  const roomUrl = () => `${window.location.origin}/room/${encodeURIComponent(roomId)}`;

  const share = () => {
    if (busy) return;
    // 엔진이 이벤트 안에서 바로 그려 준다 (dispatchEvent 는 동기다). 방이 아직 뜨지 않았으면 null.
    const got: { canvas: HTMLCanvasElement | null } = { canvas: null };
    rootRef.current?.dispatchEvent(
      new CustomEvent("heap:capture", {
        detail: (c: HTMLCanvasElement | null) => {
          got.canvas = c;
        },
      }),
    );
    const canvas = got.canvas;
    const seq = (out?.seq ?? 0) + 1;
    setLinkNote("");
    if (!canvas) {
      setOut({ text: "지금 화면을 담지 못했어요. 방이 다 뜬 뒤에 다시 눌러 주세요.", href: null, copied: "none", seq });
      return;
    }
    const link = roomUrl();
    const png = canvasToPng(canvas);
    png.catch(() => {}); // 아래에서 다시 기다린다. 처리 안 된 거절 경고만 막는다
    setBusy(true);
    void (async () => {
      let copied: Copied = "none";
      let blocked = false;
      // Safari 는 사용자 동작 안에서 write 를 바로 불러야 한다: 첫 시도는 await 앞에서 부른다 (사진은 Promise 로 넘긴다).
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": png, "text/plain": new Blob([link], { type: "text/plain" }) }),
          ]);
          copied = "both";
        } catch (error) {
          blocked = denied(error);
          // 두 가지를 한 번에 받지 않는 브라우저: 사진만 다시 해 본다
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
            copied = "image";
          } catch (again) {
            blocked = blocked || denied(again);
          }
        }
      }
      let blob: Blob | null = null;
      try {
        blob = await png;
      } catch {
        blob = null;
      }
      if (copied !== "none") markShared(roomUuid);
      const text =
        copied === "both"
          ? "지금 화면 사진과 방 주소를 복사했어요. 붙여 넣는 곳에 따라 사진이나 주소가 들어가요."
          : copied === "image"
            ? "지금 화면 사진을 복사했어요. 방 주소는 ‘링크 복사’로 따로 복사해 주세요."
            : !blob
              ? "화면을 사진으로 만들지 못했어요. ‘링크 복사’로 방 주소를 보내 주세요."
              : blocked
                ? "브라우저가 클립보드에 사진을 넣지 못하게 했어요. ‘내려받기’로 저장하고 ‘링크 복사’로 주소를 복사해 주세요."
                : "이 브라우저는 사진을 바로 복사하지 못해요. ‘내려받기’로 저장하고 ‘링크 복사’로 주소를 복사해 주세요.";
      setOut({ text, href: blob ? URL.createObjectURL(blob) : null, copied, seq });
      setBusy(false);
    })();
  };

  const copyLink = async () => {
    const link = roomUrl();
    try {
      await navigator.clipboard.writeText(link);
      markShared(roomUuid);
      setLinkNote("방 주소를 복사했어요");
    } catch {
      setLinkNote(`주소를 복사하지 못했어요 · ${link}`);
    }
  };

  return (
    <>
      <button className="btn ghost" type="button" onClick={share} disabled={busy} title="지금 보이는 방을 사진으로 복사하고 방 주소도 함께 복사해요">
        {busy ? "담는 중…" : "공유"}
      </button>
      {out && (
        <div className="share-pop" role="status">
          <p>{out.text}</p>
          <div className="share-actions">
            {out.href && (
              <a className="btn small" href={out.href} download={`${roomId}-miniroom.png`} onClick={() => markShared(roomUuid)}>
                내려받기
              </a>
            )}
            {out.copied !== "both" && (
              <button className="btn small" type="button" onClick={() => void copyLink()}>
                링크 복사
              </button>
            )}
            <button className="btn ghost small" type="button" onClick={() => setOut(null)}>
              닫기
            </button>
          </div>
          {linkNote && <p className="share-note">{linkNote}</p>}
        </div>
      )}
    </>
  );
}
