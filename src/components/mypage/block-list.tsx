"use client";

// 마이페이지의 차단한 사람 목록 (0013 개인 차단). 이름은 차단할 때 보이던 이름이다. 풀면 그 사람의 쪽지·방명록·방 안 모습이 다시 보인다.
import { useState, useTransition } from "react";
import { unhidePersonAction } from "@/lib/heap/moderation-actions";

export type MyBlock = { id: string; label: string; createdAt: string };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

export function BlockList({ blocks }: { blocks: MyBlock[] }) {
  const [list, setList] = useState(blocks);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (list.length === 0) return <div className="mp-box mp-empty">차단한 사람이 없어요</div>;
  return (
    <>
      <dl className="mp-list">
        {list.map((b) => (
          <div key={b.id} className="mp-row">
            <dt>{b.label}</dt>
            <dd>
              <small>{dateFormat.format(new Date(b.createdAt))}</small>{" "}
              <button
                type="button"
                className="mp-btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await unhidePersonAction(b.id);
                    if (res.ok || res.error === "이미 풀린 차단이에요.") {
                      setError("");
                      setList((cur) => cur.filter((x) => x.id !== b.id));
                    } else setError(res.error);
                  })
                }
              >
                풀기
              </button>
            </dd>
          </div>
        ))}
      </dl>
      {error && <p role="status">{error}</p>}
    </>
  );
}
