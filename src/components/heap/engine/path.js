// 걸을 수 있는 자리와 길 찾기.
import * as THREE from 'three';

export function setupPath(ctx) {
  const { TABLE, OBST, RX, RZ } = ctx;

  // ---------- 걷기 ----------
  const TBOX = { x0: TABLE.x - TABLE.w / 2 - 0.45, x1: TABLE.x + TABLE.w / 2 + 0.45, z0: TABLE.z - TABLE.d / 2 - 0.45, z1: TABLE.z + TABLE.d / 2 + 0.45 };
  function crossesTable(a, b) {
    for (let i = 1; i < 20; i++) {
      const x = a.x + (b.x - a.x) * i / 20, z = a.z + (b.z - a.z) * i / 20;
      if (x > TBOX.x0 + 0.1 && x < TBOX.x1 - 0.1 && z > TBOX.z0 + 0.1 && z < TBOX.z1 - 0.1) return true;
    }
    return false;
  }
  // ---------- 가구에 앉기 (방 모드) ----------
  // 자리는 stand 점 한 곳에서 들어서고, 그곳까지는 모든 걷기 장애물을 돌아 계획한 길로 걷고, 방문자는 도착해야 앉는다.
  // 가운데가 사진 탁자, 방명록 받침대, 다른 가구의 바닥 안에 있는 자리는 거절한다. 가구 속에 들어가 앉는 일이 없게 한다.
  // perchOn / unperch: 자리의 자세는 stepCharacter 가 프레임마다 붙든다. 걷기 키, 바닥 클릭, Esc 는 앉은 사람을 들어선 stand 점에 세운다.
  // 걷기를 막는 상자: 탁자, 가구들, 방명록 받침대 순서 (충돌은 이 순서로 검사한다)
  const walkBoxes = () => [OBST[0], ...ctx.build.obst, ...OBST.slice(1)];
  const walkFree = (x, z, margin = 0.05) => x > -RX + 0.35 && x < RX - 0.3 && z > -RZ + 0.35 && z < RZ - 0.3 && !walkBoxes().some(o => Math.abs(x - o.x) < o.hw + margin && Math.abs(z - o.z) < o.hd + margin);
  const seatUsable = s => s.pos.x > -RX + 0.2 && s.pos.x < RX - 0.2 && s.pos.z > -RZ + 0.2 && s.pos.z < RZ - 0.2 &&
    !walkBoxes().some(o => o.owner !== s.item && Math.abs(s.pos.x - o.x) < (o.rhw ?? o.hw) + 0.1 && Math.abs(s.pos.z - o.z) < (o.rhd ?? o.hd) + 0.1);
  // 바닥을 0.25 격자로 나눈 A* (장애물의 걷기 상자에 0.15 를 더한 안의 칸은 막힘). 그다음 선이 비는 곳마다 길을 곧게 편다.
  // 걸어갈 점들을 돌려준다. 마지막은 `to` 자신이고, `to` 에 닿을 수 없으면 null 이다.
  function planPath(from, to) {
    const S = 0.25, M = 0.15, x0 = -RX + 0.35, z0 = -RZ + 0.35, nx = Math.floor((2 * RX - 0.65) / S) + 1, nz = Math.floor((2 * RZ - 0.65) / S) + 1;
    const open = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) open[j * nx + i] = walkFree(x0 + i * S, z0 + j * S, M) ? 1 : 0;
    const cellOf = (x, z) => [THREE.MathUtils.clamp(Math.round((x - x0) / S), 0, nx - 1), THREE.MathUtils.clamp(Math.round((z - z0) / S), 0, nz - 1)];
    let [si, sj] = cellOf(from.x, from.z);
    if (!open[sj * nx + si]) { // 시작점이 장애물 여백 안일 수 있다: 가장 가까운 빈 칸에서 시작한다
      let best = null;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (open[j * nx + i]) { const d = Math.hypot(i - si, j - sj); if (d <= 8 && (!best || d < best[0])) best = [d, i, j]; }
      if (!best) return null;
      [, si, sj] = best;
    }
    const [gi, gj] = cellOf(to.x, to.z);
    if (!open[gj * nx + gi]) return null;
    const g = new Float32Array(nx * nz).fill(Infinity), came = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz), heap = [[0, sj * nx + si]];
    g[sj * nx + si] = 0;
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let reached = false;
    while (heap.length) {
      let k = 0; for (let n = 1; n < heap.length; n++) if (heap[n][0] < heap[k][0]) k = n;
      const [, cur] = heap.splice(k, 1)[0];
      if (done[cur]) continue;
      done[cur] = 1;
      const ci = cur % nx, cj = (cur - ci) / nx;
      if (ci === gi && cj === gj) { reached = true; break; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || !open[nj * nx + ni]) continue;
        if (di && dj && !(open[cj * nx + ni] && open[nj * nx + ci])) continue; // 모서리를 가로지르지 않는다
        const n = nj * nx + ni, cost = g[cur] + (di && dj ? 1.414 : 1);
        if (cost < g[n]) { g[n] = cost; came[n] = cur; heap.push([cost + h(ni, nj), n]); }
      }
    }
    if (!reached) return null;
    const cells = [];
    for (let c = gj * nx + gi; c !== -1; c = came[c]) { const ci = c % nx; cells.unshift({ x: x0 + ci * S, z: z0 + (c - ci) / nx * S }); }
    cells[cells.length - 1] = { x: to.x, z: to.z };
    const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1); for (let t = 1; t <= n; t++) if (!walkFree(a.x + (b.x - a.x) * t / n, a.z + (b.z - a.z) * t / n, 0.1)) return false; return true; };
    const out = []; let cur = { x: from.x, z: from.z }, k = 0;
    while (k < cells.length) {
      let m = k; for (let n = cells.length - 1; n > k; n--) if (clear(cur, cells[n])) { m = n; break; }
      out.push(new THREE.Vector3(cells[m].x, 0, cells[m].z)); cur = cells[m]; k = m + 1;
    }
    return out;
  }

  function collide(p) {
    p.x = THREE.MathUtils.clamp(p.x, -RX + 0.35, RX - 0.3);
    p.z = THREE.MathUtils.clamp(p.z, -RZ + 0.35, RZ - 0.3);
    for (const o of walkBoxes()) {
      const dx = p.x - o.x, dz = p.z - o.z;
      if (Math.abs(dx) < o.hw && Math.abs(dz) < o.hd) {
        const px = o.hw - Math.abs(dx), pz = o.hd - Math.abs(dz);
        if (px < pz) p.x = o.x + Math.sign(dx || 1) * o.hw; else p.z = o.z + Math.sign(dz || 1) * o.hd;
      }
    }
  }

  Object.assign(ctx, { TBOX, seatUsable, walkFree, planPath, collide, crossesTable });
}
