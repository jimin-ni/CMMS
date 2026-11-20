"use client";

// 방의 배경음악. 평소에는 기본 곡, 쪽지 트리 모드(heap:mode 'tree')에서는 캐롤을 반복 재생한다.
// - 소리 크기는 설정의 배경음악(prefs.volume.music)을 따른다. 기본값은 0(꺼짐)이고, 0이면 틀지 않는다
//   (크기만 0이면 iOS Safari 에서는 소리가 난다: 아래 참고).
// - paused(영사기로 영상을 볼 때, 음악 플레이어가 열려 있을 때)면 FADE_MS 동안 줄인 뒤 멈추고, 풀리면 같은 시간 동안 키운다.
//   iOS Safari 는 audio.volume 을 바꿀 수 없어서 줄이는 과정 없이 FADE_MS 뒤에 멈춘다.
// - 브라우저는 사용자가 누르기 전의 자동 재생을 막는다. 막히면 첫 클릭이나 키 입력 때 튼다.
// - 캐롤(Mixkit)은 원본 배포 금지 조항 때문에 저장소에 없다 (docs/planning/10-audio.md §3).
//   파일이 없으면(배포본) 트리 모드에서도 기본 곡을 계속 튼다.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { usePrefs } from "@/lib/settings/prefs";

const ROOM_TRACK = "/audio/bgm/bgm-warm-retro-soul-backbeat-budgetpixel.mp3";
const TREE_TRACK = "/audio/bgm/carol-christmas-lullaby-mixkit-985.mp3";
const FADE_MS = 2000;

export function RoomBgm({ tree, paused }: { tree: boolean; paused: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [treeMissing, setTreeMissing] = useState(false);
  const music = usePrefs().volume.music;
  // 멈춰 둘 때: 영상·음악 플레이어가 열렸거나, 설정에서 배경음악을 0으로 두었을 때
  const off = paused || music === 0;
  const src = tree && !treeMissing ? TREE_TRACK : ROOM_TRACK;
  // 키울 때의 목표 크기. 키우는 도중에 설정이 바뀌어도 새 값까지 키운다.
  const target = useRef(music / 100);
  // 진행 중인 줄이기·키우기 (requestAnimationFrame 번호)
  const fade = useRef(0);

  // 설정의 크기가 바뀌면 바로 맞춘다. 멈춤이 풀릴 때는 다시 돌지 않는다 (돌면 키우기 전에 목표 크기로 튄다).
  const applyVolume = useEffectEvent(() => {
    target.current = music / 100;
    const el = ref.current;
    if (el && !off && !fade.current) el.volume = target.current;
  });
  useEffect(() => {
    applyVolume();
  }, [music]);

  // 곡이 바뀌면 처음부터 튼다. paused 가 켜지면 줄여서 멈추고, 풀리면 지금 크기에서 목표 크기까지 키운다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fadeTo = (getTo: () => number, done?: () => void) => {
      cancelAnimationFrame(fade.current);
      const from = el.volume;
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / FADE_MS);
        el.volume = from + (getTo() - from) * k;
        if (k < 1) {
          fade.current = requestAnimationFrame(step);
        } else {
          fade.current = 0;
          done?.();
        }
      };
      fade.current = requestAnimationFrame(step);
    };
    if (off) {
      fadeTo(
        () => 0,
        () => el.pause(),
      );
      return () => {
        cancelAnimationFrame(fade.current);
        fade.current = 0;
      };
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
    fadeTo(() => target.current);
    return () => {
      stopWaiting();
      cancelAnimationFrame(fade.current);
      fade.current = 0;
    };
  }, [src, off]);

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
