// 사람 모양과 걸음 움직임. 내 캐릭터(walk.js)와 함께 있는 다른 사람(presence.js)이 같이 쓴다.
import * as THREE from 'three';
import { flat } from './draw.js';
import { tone } from './palette.js';

export const WALK_SPEED = 2.4; // 미터/초
export const SIT_DROP = 0.28; // 의자 자리 높이에서 몸을 내리는 양
export const SIT_LEGS = -1.2; // 앉은 다리 각도

// 몸 색: 없으면 방 팔레트의 accent. 머리, 눈, 다리 색은 모두 같다.
export function makeFigure(C, bodyMat) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.45, 7), bodyMat ?? tone(C, 'accent')); body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), flat('#f2cfb3')); head.position.y = 0.95;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), flat('#3a2a22')); hair.position.set(0, 0.98, -0.02);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 5), tone(C, 'olive')), legR = legL.clone();
  legL.geometry.translate(0, -0.15, 0); legL.position.set(-0.09, 0.3, 0); legR.position.set(0.09, 0.3, 0);
  const eyeGeo = new THREE.SphereGeometry(0.035, 5, 4), eyeMat = flat('#2a2230');
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat), eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.09, 0.97, 0.23); eyeR.position.set(0.09, 0.97, 0.23);
  for (const m of [body, head, hair, legL, legR]) { m.castShadow = true; group.add(m); }
  group.add(eyeL, eyeR);
  return { group, legL, legR, phase: 0 };
}

// 움직이는 방향(dir, 길이 무관)으로 몸을 부드럽게 돌린다.
export function turnToward(fig, dx, dz, dt) {
  const want = Math.atan2(dx, dz);
  let dr = want - fig.group.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  fig.group.rotation.y += dr * Math.min(1, dt * 12);
}

// 걸음: 다리 흔들기와 위아래 출렁임. 멈추면 바로 선다.
export function stepGait(fig, moving, dt) {
  if (moving) fig.phase += dt * 11; else fig.phase = 0;
  const swing = Math.sin(fig.phase) * 0.6;
  fig.legL.rotation.x = swing; fig.legR.rotation.x = -swing;
  fig.group.position.y = moving ? Math.abs(Math.sin(fig.phase)) * 0.04 : 0;
}

export function seatLegs(fig) { fig.legL.rotation.x = fig.legR.rotation.x = SIT_LEGS; }
