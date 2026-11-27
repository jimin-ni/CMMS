"use client";

// 앨범 책장에서 고른 앨범 (먹방, 요리, 일상 브이로그, 협찬 …)을 설정·마이페이지와 같은 O링 수첩으로 보여 준다.
// 엔진(engine/shelf.js)이 heap:album 으로 앨범 이름과 영상 목록을 보내면 heap-room.tsx 가 이것을 띄운다.
// 한 쪽에 영상 PER_PAGE 개 (2 x 2). 영상을 누르면 원본이 새 탭에서 열린다.
import { Book, BookPage } from "@/components/settings/book";
import "./album-book.css";

export type AlbumVideo = { title: string; href: string; thumb: string | null };
export type Album = { name: string; items: AlbumVideo[] };

const PER_PAGE = 4;

export function AlbumBook({ album, onClose }: { album: Album; onClose: () => void }) {
  const { name, items } = album;
  const pageCount = Math.max(1, Math.ceil(items.length / PER_PAGE));
  return (
    <Book heading={name} closeLabel="앨범 닫기" onClose={onClose}>
      {Array.from({ length: pageCount }, (_, p) => {
        const chunk = items.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
        const first = p * PER_PAGE + 1;
        const tag = items.length ? `${first}–${first + chunk.length - 1} / ${items.length}` : "0";
        return (
          <BookPage key={p} id={`album-${p}`} no={p + 1} tag={tag} title={name}>
            {chunk.length ? (
              <ul className="ab-grid">
                {chunk.map((v, i) => (
                  <li key={i}>
                    <a className="ab-video" href={v.href} target="_blank" rel="noopener noreferrer">
                      <span className="ab-thumb">
                        {/* 유튜브 썸네일. 바깥 주소라 next/image 최적화를 거치지 않는다 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {v.thumb && <img src={v.thumb} alt="" loading="lazy" />}
                      </span>
                      <span className="ab-title">{v.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sb-note">아직 비어 있어요.</p>
            )}
          </BookPage>
        );
      })}
    </Book>
  );
}
