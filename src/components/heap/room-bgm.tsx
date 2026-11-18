"use client";

// 방의 배경음악. 평소에는 기본 곡, 쪽지 트리 모드(heap:mode 'tree')에서는 캐롤을 반복 재생한다.
// - 소리 크기는 설정의 배경음악(prefs.volume.music)을 따른다.
// - 브라우저는 사용자가 누르기 전의 자동 재생을 막는다. 막히면 첫 클릭이나 키 입력 때 튼다.
// - 캐롤(Mixkit)은 원본 배포 금지 조항 때문에 저장소에 없다 (docs/planning/10-audio.md §3).
//   파일이 없으면(배포본) 트리 모드에서도 기본 곡을 계속 튼다.
import { useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/settings/prefs";

const ROOM_TRACK = "/audio/bgm/bgm-warm-retro-soul-backbeat-budgetpixel.mp3";
const TREE_TRACK = "/audio/bgm/carol-christmas-lullaby-mixkit-985.mp3";

export function RoomBgm({ tree, paused }: { tree: boolean; paused: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [treeMissing, setTreeMissing] = useState(false);
  const music = usePrefs().volume.music;
  const src = tree && !treeMissing ? TREE_TRACK : ROOM_TRACK;

  useEffect(() => {
    if (ref.current) ref.current.volume = music / 100;
  }, [music]);

  // 곡이 바뀌면 처음부터 튼다. 멈춤(paused)이 풀리면 이어서 튼다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (paused) {
      el.pause();
      return;
    }
    const stopWaiting = () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
    };
    function play() {
      el!.play().then(stopWaiting, () => {
        // 자동 재생이 막혔거나 파일을 못 읽었다: 다음 사용자 입력 때 다시 시도한다
      });
    }
    window.addEventListener("pointerdown", play);
    window.addEventListener("keydown", play);
    play();
    return stopWaiting;
  }, [src, paused]);

  return (
    <audio
      ref={ref}
      src={src}
      loop
      preload="auto"
      onError={() => {
        if (src === TREE_TRACK) setTreeMissing(true);
      }}
    />
  );
}
