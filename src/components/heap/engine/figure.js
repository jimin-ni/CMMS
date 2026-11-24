// 사람 모양과 걸음 움직임. 내 캐릭터(walk.js)와 함께 있는 다른 사람(presence.js)이 같이 쓴다.
import * as THREE from 'three';
import { flat } from './draw.js';
import { tone } from './palette.js';

export const WALK_SPEED = 2.4; // 미터/초
export const SIT_DROP = 0.17; // 의자 자리 높이에서 몸을 내리는 양 (SPIKE minimi: 몸 밑면 0.17)
export const SIT_LEGS = -1.2; // 앉은 다리 각도

// SPIKE (2026-11-24, uncommitted): minimi concept, variant "short hair · cardigan" from .claude/session-artifacts/minimi/render.mjs
// 몸 색: 없으면 방 팔레트의 accent.
export function makeFigure(C, bodyMat) {
  const group = new THREE.Group();
  const skin = flat('#efcdb2'), hairM = flat('#3a2a22'), topM = bodyMat ?? tone(C, 'accent'), bottomM = tone(C, 'olive'), shoeM = flat('#4a3426');
  hairM.side = THREE.DoubleSide;
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; parent.add(m); return m; };
  // 다리: 엉덩이(0.18)에서 흔든다. 발은 다리에 붙어 같이 움직인다
  const legs = [-0.085, 0.085].map(x => {
    const leg = add(new THREE.CylinderGeometry(0.058, 0.062, 0.13, 7), bottomM, x, 0.18);
    leg.geometry.translate(0, -0.065, 0);
    const foot = add(new THREE.SphereGeometry(0.075, 7, 5), shoeM, 0, -0.14, 0.03, leg); foot.scale.set(1, 0.6, 1.35);
    return leg;
  });
  const prof = [[0.0, 0.17], [0.15, 0.17], [0.185, 0.19], [0.2, 0.25], [0.18, 0.36], [0.14, 0.44], [0.07, 0.47], [0.0, 0.475]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(prof, 9), topM);
  add(new THREE.BoxGeometry(0.05, 0.27, 0.02), flat('#e9dcc6'), 0, 0.31, 0.19).rotation.x = -0.12;
  for (const y of [0.24, 0.31, 0.38]) add(new THREE.SphereGeometry(0.014, 5, 4), flat('#6e4a30'), 0, y, 0.205 - (y - 0.24) * 0.12, group, false);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0.17 * s, 0.42, 0); arm.rotation.z = 0.32 * s; group.add(arm);
    add(new THREE.CapsuleGeometry(0.048, 0.12, 2, 7), topM, 0, -0.09, 0, arm);
    add(new THREE.IcosahedronGeometry(0.05, 0), skin, 0, -0.19, 0.005, arm);
  }
  const HY = 0.70, HR = 0.265;
  add(new THREE.IcosahedronGeometry(HR, 1), skin, 0, HY).scale.set(1.04, 0.97, 0.96);
  const eyeM = flat('#2a2230'), blushM = flat('#e58f7c');
  for (const x of [-0.088, 0.088]) {
    add(new THREE.SphereGeometry(0.026, 6, 5), eyeM, x, HY - 0.025, HR * 0.9, group, false).scale.set(1, 1.25, 0.6);
    add(new THREE.SphereGeometry(0.034, 6, 4), blushM, x * 1.62, HY - 0.085, HR * 0.8, group, false).scale.set(1, 0.55, 0.35);
  }
  const hr = HR + 0.022;
  add(new THREE.SphereGeometry(hr, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.4), hairM, 0, HY + 0.01, -0.01);
  add(new THREE.SphereGeometry(hr, 14, 9, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.62), hairM, 0, HY, -0.005);
  return { group, legL: legs[0], legR: legs[1], phase: 0 };
}

// 움직이는 방향(dir, 길이 무관)으로 몸을 부드럽게 돌린다.
export function turnToward(fig, dx, dz, dt) {
  const want = Math.atan2(dx, dz);
  let dr = want - fig.group.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  fig.group.rotation.y = wrapAngle(fig.group.rotation.y + dr * Math.min(1, dt * 12));
}

// 각도를 -π..π 로. 같은 방향으로 계속 돌아도 값이 커지지 않는다 (presence 서버는 큰 각도를 버린다)
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// 걸음: 다리 흔들기와 위아래 출렁임. 멈추면 바로 선다.
export function stepGait(fig, moving, dt) {
  if (moving) fig.phase += dt * 11; else fig.phase = 0;
  const swing = Math.sin(fig.phase) * 0.6;
  fig.legL.rotation.x = swing; fig.legR.rotation.x = -swing;
  fig.group.position.y = moving ? Math.abs(Math.sin(fig.phase)) * 0.04 : 0;
}

export function seatLegs(fig) { fig.legL.rotation.x = fig.legR.rotation.x = SIT_LEGS; }
