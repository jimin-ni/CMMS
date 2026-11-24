"use client";

// 제작자 소개 카드의 캐릭터 그림: 글로브 속 물범이나 고양이를 한 번 그려 이미지로 바꾼다.
// 그린 뒤 렌더러를 바로 버려 WebGL 컨텍스트가 남지 않는다.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCat, buildSeal } from "./model.js";

const SIZE = 240;

function draw(kind: "seal" | "cat"): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2); renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6a7a90, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2, 3, 2.5); scene.add(sun);
  const model = kind === "seal" ? buildSeal() : buildCat();
  if (kind === "seal") model.rotation.y = 0.5;
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model), centre = box.getCenter(new THREE.Vector3());
  const half = Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 0.62;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 10);
  camera.position.copy(centre).add(new THREE.Vector3(1, 0.7, 1.4)); camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  model.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) mat.dispose();
  });
  renderer.dispose(); renderer.forceContextLoss();
  return url;
}

export function CharacterBadge({ kind, label }: { kind: "seal" | "cat"; label: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // 브라우저에서만 그린다 (서버 렌더에는 WebGL 이 없다)
    if (imgRef.current) imgRef.current.src = draw(kind);
  }, [kind]);
  return (
    <span className="flex h-24 w-24 items-center justify-center rounded-full bg-[#e7f0f8]">
      {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 그린 data URL 이라 next/image 최적화가 필요 없다 */}
      <img ref={imgRef} alt={label} width={88} height={88} />
    </span>
  );
}
