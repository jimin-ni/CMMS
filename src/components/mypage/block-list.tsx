"use client";

// 마이페이지 BLOCKED: 차단을 건 자리(대화방, 쪽지, 방명록)마다 접는 칸 하나 (Figma "6차" MYPAGE- blocked).
// 한 줄: 차단한 날, 그때 보이던 이름, 그때 글의 앞부분, UNBLOCK.
// - hide: 방에서 "차단"으로 나에게서만 가린 사람 (0013 heap_blocks). 풀면 그 사람의 쪽지·방명록·방 안 모습이 다시 보인다.
// - sanction: 크리에이터·관리자가 건 차단 (0011 sanctions). 풀면 그 사람이 다시 글을 쓸 수 있다.
import { useState, useTransition } from "react";
import { Fold } from "@/components/settings/clipboard";
import { unblockAction } from "@/lib/heap/moderation-actions";
import { useLanguage, type Language } from "@/lib/settings/prefs";

export type MyBlock = {
  id: string;
  kind: "hide" | "sanction";
  surface: "chat" | "note" | "guestbook";
  label: string;
  excerpt: string;
  createdAt: string;
};

const TEXT = {
  ko: {
    folds: { chat: "채팅", note: "편지", guestbook: "방명록" },
    empty: "차단한 사람이 없어요",
    unblock: "차단 풀기",
  },
  en: {
    folds: { chat: "Chat", note: "Letter", guestbook: "Guest book" },
    empty: "No one blocked",
    unblock: "Unblock",
  },
};
const SURFACES = ["chat", "note", "guestbook"] as const;

// 한국어 2026.11.29, 영어 11.29.2026 (한국 시간)
function formatDate(iso: string, language: Language) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return language === "ko" ? `${get("year")}.${get("month")}.${get("day")}` : `${get("month")}.${get("day")}.${get("year")}`;
}

export function BlockList({ blocks }: { blocks: MyBlock[] }) {
  const [list, setList] = useState(blocks);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const language = useLanguage();
  const t = TEXT[language];

  const unblock = (b: MyBlock) =>
    start(async () => {
      const res = await unblockAction(b.kind, b.id);
      // 이미 풀린 것도 목록에서 뺀다
      if (res.ok || res.error === "이미 풀린 차단이에요." || res.error === "처리할 수 없는 차단이에요.") {
        setError("");
        setList((cur) => cur.filter((x) => !(x.id === b.id && x.kind === b.kind)));
      } else setError(res.error);
    });

  return (
    <>
      {SURFACES.map((surface) => {
        const rows = list.filter((b) => b.surface === surface);
        return (
          <Fold key={surface} label={t.folds[surface]}>
            {rows.length === 0 ? (
              <p className="cb-empty">{t.empty}</p>
            ) : (
              rows.map((b) => (
                <div key={`${b.kind}:${b.id}`} className="cb-item">
                  <p className="cb-date">{formatDate(b.createdAt, language)}</p>
                  <div className="cb-item-row">
                    <p className="cb-value">{b.label}</p>
                    <p className="cb-value" title={b.excerpt}>
                      {b.excerpt || "—"}
                    </p>
                    <button type="button" className="cb-btn" disabled={pending} onClick={() => unblock(b)}>
                      {t.unblock}
                    </button>
                  </div>
                </div>
              ))
            )}
          </Fold>
        );
      })}
      {error && (
        <p className="cb-error" role="status">
          {error}
        </p>
      )}
    </>
  );
}
