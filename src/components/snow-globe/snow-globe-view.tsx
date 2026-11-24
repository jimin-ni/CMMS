"use client";

// 스노우 글로브를 가까이 보는 화면. 미니룸 좌식 탁자 위의 글로브를 누르면 방 위에 겹쳐 열린다 (heap-room.tsx).
// 드래그로 돌리고 휠/핀치로 확대한다. 열리면 3초 동안 눈이 내리고, 빈 곳을 누르면 다시 내린다.
// 누르기: 물범과 그 둘레는 지민 프로필, 고양이와 그 둘레는 규노 프로필, 글로브의 나머지는 제작자 소개 페이지.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildSnowGlobe, GLOBE_HEIGHT } from "./model.js";
import { MAKER_LINKS } from "./links";

const SNOW_MS = 3000;

export function SnowGlobeView({ onClose }: { onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [snowing, setSnowing] = useState(false);
  // effect 안의 three 코드가 최신 라우터와 닫기 함수를 부른다
  const actions = useRef({ router, onClose });
  useEffect(() => {
    actions.current = { router, onClose };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    const canvas = renderer.domElement;
    canvas.className = "block h-full w-full touch-none";
    canvas.setAttribute("aria-label", "스노우 글로브. 물범을 누르면 지민, 고양이를 누르면 규노, 글로브를 누르면 제작자 소개로 갑니다");
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x5a6a80, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xbcd8ff, 0.5); rim.position.set(-3, 2, -3); scene.add(rim);

    const globe = buildSnowGlobe();
    scene.add(globe.root);

    // 아이소메트릭 느낌의 직교 카메라: 비스듬한 위에서 글로브와 받침이 한눈에 들어온다
    const VIEW = GLOBE_HEIGHT * 0.68, centre = new THREE.Vector3(0, GLOBE_HEIGHT * 0.47, 0);
    const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 50);
    camera.position.set(4.2, 3.3, 4.2).add(centre);
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(centre); controls.enablePan = false; controls.enableDamping = true;
    controls.minZoom = 0.7; controls.maxZoom = 2.4; controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.5;
    controls.update();

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      const a = w / h;
      // 세로 화면에서도 글로브 폭이 잘리지 않게 좁은 쪽에 맞춘다
      const half = a >= 1 ? VIEW : VIEW / a;
      Object.assign(camera, { left: -half * a, right: half * a, top: half, bottom: -half });
      camera.updateProjectionMatrix();
    };
    const watch = new ResizeObserver(resize); watch.observe(host); resize();

    let snowTimer = 0;
    const snow = () => {
      globe.snow?.start(SNOW_MS);
      setSnowing(true);
      clearTimeout(snowTimer);
      snowTimer = window.setTimeout(() => setSnowing(false), SNOW_MS); // 다시 누르면 3초를 새로 잰다
    };
    snow();

    // 누르기와 끌기를 가른다: 6px 안에서 떼면 누르기다
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const aim = (ev: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    const target = (): "jimin" | "gyuno" | "makers" | null => {
      if (ray.intersectObject(globe.sealZone, false).length) return "jimin";
      if (ray.intersectObject(globe.catZone, false).length) return "gyuno";
      return ray.intersectObjects(globe.hitMeshes, false).length ? "makers" : null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => { down = { x: ev.clientX, y: ev.clientY }; };
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons) return;
      aim(ev); canvas.style.cursor = target() ? "pointer" : "grab";
    };
    const onUp = (ev: PointerEvent) => {
      const d = down; down = null;
      if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return;
      aim(ev);
      const t = target();
      if (t === "gyuno") window.open(MAKER_LINKS.gyuno, "_blank", "noopener,noreferrer");
      else if (t) actions.current.router.push(MAKER_LINKS[t]);
      else snow();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      globe.snow?.step(dt);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf); clearTimeout(snowTimer); watch.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      controls.dispose(); globe.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    };
  }, []);

  // Esc 로 닫는다. 방 엔진도 window 에서 Esc 를 듣으므로(일어나기 등) capture 에서 먼저 받아 막는다
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation(); actions.current.onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="스노우 글로브 가까이 보기"
      className="fixed inset-0 z-50 flex flex-col bg-[radial-gradient(circle_at_50%_40%,#2b3a55_0%,#141b2b_75%)] text-white"
    >
      <div ref={hostRef} className="relative min-h-0 flex-1" />
      <p
        aria-live="polite"
        className={`pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-white/15 px-4 py-1.5 text-sm backdrop-blur transition-opacity duration-500 ${snowing ? "opacity-100" : "opacity-0"}`}
      >
        ❄ 눈이 내리는 중
      </p>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/15 px-4 py-1.5 text-sm hover:bg-white/25"
      >
        닫기
      </button>
      <nav aria-label="제작자 링크" className="flex flex-wrap items-center justify-center gap-2 px-4 pb-6 text-sm text-white/80">
        <span className="w-full text-center text-xs text-white/60">글로브를 누르면 제작자 소개, 물범은 지민, 고양이는 규노, 빈 곳은 눈</span>
        <Link href={MAKER_LINKS.makers} className="rounded-full border border-white/30 px-3 py-1 hover:bg-white/10">제작자 소개</Link>
        <Link href={MAKER_LINKS.jimin} className="rounded-full border border-white/30 px-3 py-1 hover:bg-white/10">물범 · 지민</Link>
        <a href={MAKER_LINKS.gyuno} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/30 px-3 py-1 hover:bg-white/10">고양이 · 규노</a>
      </nav>
    </div>
  );
}
