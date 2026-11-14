// 온보딩 컨셉 C의 3D 방. 2번 방(public/heap/rooms/dname/layout.json)의 배치와 색을 따라 상자로 간단히 짓는다.
// 힙 엔진(src/components/heap/engine)은 DB 데이터와 걷기, 꾸미기까지 다루므로 쓰지 않고, 쌓이는 연출에 필요한 것만 여기서 만든다.
import * as THREE from "three";
import { STORY, itemWindow, ramp, TIMELINE, type ItemId } from "./story";

export type FrameState = {
  progress: number; // 부드럽게 따라간 스크롤 진행도 0~1
  zoom: number; // 0이면 방이 화면의 약 50%, 1이면 화면 가득
  dark: number; // 0~1. 배경과 방 조명을 어둡게
  room: boolean; // 방 안을 둘러보는 단계인지
};

// 2번 방 팔레트 (layout.json) + 힙 종이색
const COL = {
  wall: "#DCDCC6",
  trim: "#565344",
  accent: "#A6613C",
  paper: "#f3eadb",
  ink: "#2f2c24",
  wood: "#b08a62",
  woodDark: "#6b4e37",
  leaf: "#6f8a4a",
  leafDark: "#4f6a2a",
  sun: "#ffcf94",
};
const BG_START = new THREE.Color("#0c0a08");
const BG_DARK = new THREE.Color("#040303");

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function easeOutBounce(t: number) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

type Item = {
  id: ItemId;
  root: THREE.Group; // 최종 자리
  anim: THREE.Group; // 떨어지기, 눌림, 마우스 올림 움직임
  top: number; // 표시 점을 띄울 높이
  marker: THREE.Sprite;
  kick: number; // 마지막으로 누른 시각 (초). 없으면 -1
  hover: number; // 0~1
};

export class RoomScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private target = new THREE.Vector3(0, 0.9, 0);
  private items = new Map<ItemId, Item>();
  private pickables: THREE.Object3D[] = [];
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private parallax = new THREE.Vector2();
  private time = 0;
  private hovered: ItemId | null = null;
  private found = new Set<ItemId>();

  // 조명과 빛 연출
  private hemi = new THREE.HemisphereLight("#ffe9cc", "#3a2f25", 0);
  private sun = new THREE.DirectionalLight(COL.sun, 0);
  private windowGlass!: THREE.MeshStandardMaterial;
  private beamMat!: THREE.MeshBasicMaterial;
  private patchMat!: THREE.MeshBasicMaterial;
  private dust!: THREE.Points;
  private dustMat!: THREE.PointsMaterial;
  private lampLight = new THREE.PointLight("#ffb86b", 0, 9, 1.4);
  private lampShade!: THREE.MeshStandardMaterial;
  private lampOn = true;
  private lampLevel = 1;
  private screenMat!: THREE.MeshStandardMaterial;
  private screenOn = false;
  private screenLevel = 0;
  private topPolaroid!: THREE.Object3D;
  private notes: THREE.Object3D[] = [];
  private page!: THREE.Object3D;
  private slideBook!: THREE.Object3D;
  private pillow!: THREE.Object3D;
  private disposables: { dispose(): void }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = BG_START.clone();

    this.buildLights();
    this.buildShell();
    this.buildItems();
    this.resize();
  }

  // ---------- 짓기 ----------

  private mat(color: string, extra?: THREE.MeshStandardMaterialParameters) {
    const key = color + (extra ? JSON.stringify(extra) : "");
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
      this.mats.set(key, m);
    }
    return m;
  }

  private box(w: number, h: number, d: number, color: string | THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
    const geo = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, typeof color === "string" ? this.mat(color) : color);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildLights() {
    this.scene.add(this.hemi);
    // 창문 밖에서 드는 해 질 녘 빛. 왼쪽 벽은 그림자를 만들지 않아 빛이 방 안으로 들어온다.
    this.sun.position.set(-9, 7.5, -3);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.far = 30;
    this.scene.add(this.sun, this.sun.target);
  }

  private buildShell() {
    const shell = new THREE.Group();
    this.scene.add(shell);
    // 바닥: 판자 8장
    for (let i = 0; i < 8; i++) {
      const tone = ["#b08a62", "#a98159", "#b6906a", "#a47c55"][i % 4];
      this.box(1.05, 0.3, 8.4, tone, -3.675 + i * 1.05, -0.15, 0, shell);
    }
    // 벽 (뒤, 왼쪽). 왼쪽 벽은 창문 빛을 막지 않게 그림자를 만들지 않는다.
    const wallMat = this.mat(COL.wall);
    this.box(8.6, 3.4, 0.2, wallMat, -0.1, 1.7, -4.3, shell);
    const left = this.box(0.2, 3.4, 8.4, wallMat, -4.3, 1.7, 0, shell);
    left.castShadow = false;
    // 걸레받이
    this.box(8.4, 0.14, 0.06, COL.trim, 0, 0.07, -4.17, shell);
    this.box(0.06, 0.14, 8.4, COL.trim, -4.17, 0.07, 0, shell).castShadow = false;

    // 창문 (왼쪽 벽, z = -1.3, 가운데 높이 2.55, 1.6 × 1.2)
    const wz = -1.3, wy = 2.55, ww = 1.6, wh = 1.2;
    this.windowGlass = new THREE.MeshStandardMaterial({ color: "#3a3226", emissive: "#ffd9a0", emissiveIntensity: 0 });
    const glassGeo = new THREE.PlaneGeometry(ww, wh);
    this.disposables.push(glassGeo, this.windowGlass);
    const glass = new THREE.Mesh(glassGeo, this.windowGlass);
    glass.position.set(-4.19, wy, wz);
    glass.rotation.y = Math.PI / 2;
    shell.add(glass);
    const fr = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      this.box(w, h, d, COL.trim, x, y, z, shell).castShadow = false;
    };
    fr(0.1, 0.1, ww + 0.2, -4.15, wy + wh / 2 + 0.05, wz);
    fr(0.16, 0.1, ww + 0.3, -4.12, wy - wh / 2 - 0.05, wz);
    fr(0.1, wh, 0.1, -4.15, wy, wz - ww / 2 - 0.05);
    fr(0.1, wh, 0.1, -4.15, wy, wz + ww / 2 + 0.05);
    fr(0.06, wh, 0.05, -4.17, wy, wz);
    fr(0.06, 0.05, ww, -4.17, wy, wz);

    // 문 (왼쪽 벽, z = 2.7)
    this.box(0.08, 2.3, 1.1, COL.accent, -4.16, 1.15, 2.7, shell).castShadow = false;
    this.box(0.06, 0.08, 0.08, "#e8c27a", -4.1, 1.1, 2.35, shell).castShadow = false;

    // 빛줄기: 창문 네 모서리에서 빛 방향으로 바닥까지
    const dir = new THREE.Vector3(1, -0.78, 0.32).normalize();
    const corners = [
      new THREE.Vector3(-4.18, wy + wh / 2, wz - ww / 2),
      new THREE.Vector3(-4.18, wy + wh / 2, wz + ww / 2),
      new THREE.Vector3(-4.18, wy - wh / 2, wz + ww / 2),
      new THREE.Vector3(-4.18, wy - wh / 2, wz - ww / 2),
    ];
    const floorPts = corners.map((c) => c.clone().addScaledVector(dir, (c.y - 0.01) / -dir.y));
    const pos: number[] = [], colr: number[] = [];
    const sun = new THREE.Color(COL.sun);
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], c = floorPts[(i + 1) % 4], d = floorPts[i];
      for (const [p, alpha] of [[a, 1], [b, 1], [c, 0], [a, 1], [c, 0], [d, 0]] as const) {
        pos.push(p.x, p.y, p.z);
        colr.push(sun.r, sun.g, sun.b, alpha);
      }
    }
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    beamGeo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 4));
    this.beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    shell.add(beam);

    // 바닥에 떨어진 창문 모양 빛
    const patchGeo = new THREE.BufferGeometry();
    const fp = floorPts;
    patchGeo.setAttribute("position", new THREE.Float32BufferAttribute(
      [fp[0], fp[1], fp[2], fp[0], fp[2], fp[3]].flatMap((p) => [p.x, 0.012, p.z]), 3));
    this.patchMat = new THREE.MeshBasicMaterial({ color: COL.sun, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    shell.add(new THREE.Mesh(patchGeo, this.patchMat));
    this.disposables.push(beamGeo, this.beamMat, patchGeo, this.patchMat);

    // 빛줄기 안의 먼지
    const n = 140, dp: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = Math.random(), u = Math.random(), v = Math.random();
      const top = corners[0].clone().lerp(corners[1], u).lerp(corners[3].clone().lerp(corners[2], u), v);
      const bottom = floorPts[0].clone().lerp(floorPts[1], u).lerp(floorPts[3].clone().lerp(floorPts[2], u), v);
      const p = top.lerp(bottom, s * 0.85);
      dp.push(p.x, p.y, p.z);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
    this.dustMat = new THREE.PointsMaterial({ color: "#ffe2b8", size: 0.035, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    shell.add(this.dust);
    this.disposables.push(dustGeo, this.dustMat);
  }

  private makeItem(id: ItemId, x: number, z: number, rot: number, top: number) {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.rotation.y = (rot * Math.PI) / 180;
    const anim = new THREE.Group();
    root.add(anim);
    root.visible = false;
    this.scene.add(root);
    const marker = new THREE.Sprite(this.markerMaterial());
    marker.scale.setScalar(0.32);
    marker.position.set(x, top + 0.45, z);
    marker.visible = false;
    this.scene.add(marker);
    const item: Item = { id, root, anim, top, marker, kick: -1, hover: 0 };
    this.items.set(id, item);
    return anim;
  }

  private markerTex: THREE.CanvasTexture | null = null;
  // 아직 눌러 보지 않은 가구 위에 뜨는 작은 픽셀 반짝이. 투명도를 따로 바꾸므로 재질은 가구마다, 그림은 하나를 같이 쓴다.
  private markerMaterial() {
    const mat = new THREE.SpriteMaterial({ map: this.markerTexture(), transparent: true, depthTest: false, opacity: 0 });
    this.disposables.push(mat);
    return mat;
  }

  private markerTexture() {
    if (this.markerTex) return this.markerTex;
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff4dc";
    for (const [px, py] of [[7, 2], [7, 3], [7, 4], [7, 11], [7, 12], [7, 13], [2, 7], [3, 7], [4, 7], [11, 7], [12, 7], [13, 7], [6, 6], [7, 6], [8, 6], [6, 7], [7, 7], [8, 7], [6, 8], [7, 8], [8, 8], [7, 5], [5, 7], [9, 7], [7, 9], [7, 10], [10, 7]]) {
      g.fillRect(px, py, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.markerTex = tex;
    this.disposables.push(tex);
    return tex;
  }

  private buildItems() {
    // 탁자와 폴라로이드 더미 (table: x 0.5, z 0.6)
    {
      const g = this.makeItem("pile", 0.5, 0.6, 0, 1.0);
      this.box(2.4, 0.12, 1.5, COL.woodDark, 0, 0.72, 0, g);
      for (const [lx, lz] of [[-1.05, -0.6], [1.05, -0.6], [-1.05, 0.6], [1.05, 0.6]]) this.box(0.1, 0.66, 0.1, COL.woodDark, lx, 0.33, lz, g);
      const photo = ["#c98a5f", "#8fb0cf", "#7d9a4a", "#e0b25c", "#a6613c", "#6f7fa8", "#d98b8b"];
      let top: THREE.Object3D = g;
      for (let i = 0; i < 16; i++) {
        const card = new THREE.Group();
        const r = i / 16;
        card.position.set((Math.random() - 0.5) * (1.1 - r * 0.6), 0.785 + i * 0.012, (Math.random() - 0.5) * (0.7 - r * 0.4));
        card.rotation.y = Math.random() * Math.PI;
        this.box(0.34, 0.01, 0.4, "#f7f1e6", 0, 0, 0, card);
        this.box(0.28, 0.012, 0.27, photo[i % photo.length], 0, 0.001, -0.04, card).castShadow = false;
        g.add(card);
        top = card;
      }
      this.topPolaroid = top;
    }
    // 앨범 선반 (shelf: x 2.75, z -3.7)
    {
      const g = this.makeItem("shelf", 2.75, -3.75, 0, 2.3);
      const wood = COL.woodDark;
      this.box(1.6, 2.2, 0.12, wood, 0, 1.1, -0.22, g);
      for (const sx of [-0.77, 0.77]) this.box(0.06, 2.2, 0.5, wood, sx, 1.1, 0, g);
      const books = ["#a6613c", "#565344", "#c98a5f", "#8fb0cf", "#e0b25c", "#7d9a4a", "#f3eadb"];
      for (let s = 0; s < 4; s++) {
        this.box(1.6, 0.05, 0.5, wood, 0, 0.05 + s * 0.7, 0, g);
        if (s === 3) continue;
        for (let b = 0; b < 6; b++) {
          const h = 0.36 + ((b * 37 + s * 11) % 10) / 70;
          const book = this.box(0.16, h, 0.32, books[(s * 6 + b) % books.length], 0.55 - b * 0.21, 0.08 + s * 0.7 + h / 2, 0.02, g);
          if (s === 1 && b === 2) this.slideBook = book;
        }
      }
    }
    // 화면과 포스터 (screen: 뒤 벽 x 0.5, posters: x -3.0, -2.15, -1.3)
    {
      const g = this.makeItem("screen", 0.5, -4.13, 0, 2.6);
      this.box(2.1, 1.25, 0.08, "#2a2620", 0, 1.95, 0, g);
      const c = document.createElement("canvas");
      c.width = 256; c.height = 144;
      const ctx2 = c.getContext("2d")!;
      const grad = ctx2.createLinearGradient(0, 0, 256, 144);
      grad.addColorStop(0, "#ffcf94"); grad.addColorStop(1, "#c98a5f");
      ctx2.fillStyle = grad; ctx2.fillRect(0, 0, 256, 144);
      ctx2.fillStyle = "#fff8ec";
      ctx2.beginPath(); ctx2.moveTo(112, 50); ctx2.lineTo(112, 94); ctx2.lineTo(150, 72); ctx2.closePath(); ctx2.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.screenMat = new THREE.MeshStandardMaterial({ color: "#14120f", emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.06, roughness: 0.4 });
      const sg = new THREE.PlaneGeometry(1.95, 1.1);
      const screen = new THREE.Mesh(sg, this.screenMat);
      screen.position.set(0, 1.95, 0.045);
      g.add(screen);
      this.disposables.push(tex, this.screenMat, sg);
      const posters = ["#a6613c", "#8fb0cf", "#e0b25c"];
      [-3.0, -2.15, -1.3].forEach((px, i) => {
        const p = this.box(0.62, 0.84, 0.03, "#f7f1e6", px - 0.5, 2.1 + (i % 2) * 0.12, 0, g);
        p.rotation.z = (i - 1) * 0.05;
        this.box(0.5, 0.6, 0.02, posters[i], 0, 0.06, 0.012, p).castShadow = false;
      });
    }
    // 스탠드 조명 (lamp: x -0.55, z -3.55)
    {
      const g = this.makeItem("lamp", -0.55, -3.55, 0, 1.95);
      this.box(0.34, 0.04, 0.34, COL.trim, 0, 0.02, 0, g);
      this.box(0.04, 1.7, 0.04, COL.trim, 0, 0.87, 0, g);
      this.lampShade = new THREE.MeshStandardMaterial({ color: "#f6dcb2", emissive: "#ffb767", emissiveIntensity: 0, side: THREE.DoubleSide, flatShading: true });
      const shadeGeo = new THREE.CylinderGeometry(0.17, 0.28, 0.32, 8, 1, true);
      const shade = new THREE.Mesh(shadeGeo, this.lampShade);
      shade.position.y = 1.8;
      g.add(shade);
      this.lampLight.position.set(0, 1.7, 0.1);
      g.add(this.lampLight);
      this.disposables.push(shadeGeo, this.lampShade);
    }
    // 쪽지 트리 (plant: x -3.5, z -3.5, 크기 1.4 자리)
    {
      const g = this.makeItem("tree", -3.3, -3.35, 0, 2.6);
      this.box(0.5, 0.42, 0.5, COL.accent, 0, 0.21, 0, g);
      this.box(0.12, 1.0, 0.12, COL.woodDark, 0, 0.9, 0, g);
      [[0.9, 1.2, 0.85], [0.7, 1.7, 0.75], [0.48, 2.15, 0.6]].forEach(([r, y, h], i) => {
        const geo = new THREE.ConeGeometry(r, h, 7);
        this.disposables.push(geo);
        const cone = new THREE.Mesh(geo, this.mat(i % 2 ? COL.leaf : COL.leafDark));
        cone.position.y = y;
        cone.castShadow = cone.receiveShadow = true;
        g.add(cone);
      });
      const noteCol = ["#fff8ec", "#ffe7c4", "#f6d6d0", "#e3ecf5"];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.1, layer = i % 3, r = [0.72, 0.56, 0.38][layer], y = [1.0, 1.5, 1.95][layer];
        const pivot = new THREE.Group();
        pivot.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        this.box(0.14, 0.18, 0.01, noteCol[i % 4], 0, -0.1, 0, pivot).rotation.y = a;
        g.add(pivot);
        this.notes.push(pivot);
      }
    }
    // 방명록 받침대 (guestbook: 왼쪽 벽 z 3.6)
    {
      const g = this.makeItem("guestbook", -3.55, 3.55, 90, 1.25);
      this.box(0.5, 1.0, 0.4, COL.woodDark, 0, 0.5, 0, g);
      const top = this.box(0.7, 0.06, 0.55, COL.woodDark, 0, 1.03, 0, g);
      top.rotation.x = -0.25;
      const book = new THREE.Group();
      book.position.set(0, 1.08, 0);
      book.rotation.x = -0.25;
      g.add(book);
      this.box(0.6, 0.03, 0.42, COL.accent, 0, 0, 0, book);
      this.box(0.27, 0.02, 0.38, "#fff8ec", -0.14, 0.025, 0, book);
      const pagePivot = new THREE.Group();
      pagePivot.position.set(0, 0.03, 0);
      this.box(0.27, 0.015, 0.38, "#fff8ec", 0.14, 0, 0, pagePivot);
      book.add(pagePivot);
      this.page = pagePivot;
    }
    // 침대와 책 더미, 작은 화분 (bed: x -3.2, z 0.65, 90°)
    {
      const g = this.makeItem("bed", -3.1, 0.65, 90, 0.8);
      this.box(2.8, 0.3, 1.4, "#8a6a4c", 0, 0.15, 0, g);
      this.box(2.7, 0.18, 1.3, COL.paper, 0, 0.39, 0, g);
      this.box(1.6, 0.06, 1.36, COL.accent, 0.45, 0.5, 0, g);
      this.pillow = this.box(0.6, 0.16, 0.9, "#f7f1e6", -1.0, 0.56, 0, g);
      this.box(0.12, 0.9, 1.4, "#8a6a4c", -1.4, 0.45, 0, g);
      // 침대 옆 책 더미 (books: x 3.4, z 0.2 대신 침대 머리맡)
      for (let i = 0; i < 4; i++) {
        const b = this.box(0.42, 0.08, 0.3, ["#a6613c", "#565344", "#e0b25c", "#8fb0cf"][i], -1.2, 0.04 + i * 0.08, 1.2, g);
        b.rotation.y = (i % 2 ? 1 : -1) * 0.2;
      }
    }

    for (const item of this.items.values()) {
      item.root.traverse((o) => {
        o.userData.itemId = item.id;
        if ((o as THREE.Mesh).isMesh) this.pickables.push(o);
      });
    }
  }

  // ---------- 바깥에서 부르는 것 ----------

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // 마우스 위치 (-1~1). 방 안에서 시점이 살짝 따라온다.
  setPointer(nx: number, ny: number) {
    this.pointer.set(nx, ny);
  }

  // 화면 좌표의 가구. 방 안 단계에서만 쓴다.
  pick(nx: number, ny: number): ItemId | null {
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return (hit?.object.userData.itemId as ItemId | undefined) ?? null;
  }

  setHover(id: ItemId | null) {
    this.hovered = id;
  }

  setFound(ids: Iterable<ItemId>) {
    this.found = new Set(ids);
  }

  interact(id: ItemId) {
    const item = this.items.get(id);
    if (!item) return;
    item.kick = this.time;
    if (id === "lamp") this.lampOn = !this.lampOn;
    if (id === "screen") this.screenOn = !this.screenOn;
  }

  frame(dt: number, s: FrameState) {
    this.time += dt;
    const t = this.time;
    const reveal = ramp(s.progress, TIMELINE.reveal[0], TIMELINE.reveal[1]);

    // 배경과 조명
    this.scene.background = (this.scene.background as THREE.Color).copy(BG_START).lerp(BG_DARK, s.dark);
    const dim = 1 - 0.6 * s.dark;
    this.hemi.intensity = 0.58 * reveal * dim;
    this.sun.intensity = 2.4 * reveal * (1 - 0.75 * s.dark);
    this.windowGlass.emissiveIntensity = 1.5 * reveal * (1 - 0.5 * s.dark);
    const flicker = 0.92 + 0.08 * Math.sin(t * 1.3) * Math.sin(t * 0.7);
    this.beamMat.opacity = 0.16 * reveal * flicker * (1 - 0.6 * s.dark);
    this.patchMat.opacity = 0.22 * reveal * (1 - 0.6 * s.dark);
    this.dustMat.opacity = 0.75 * reveal * (1 - 0.5 * s.dark);
    this.dust.position.y = Math.sin(t * 0.35) * 0.05;
    this.dust.rotation.y = Math.sin(t * 0.15) * 0.02;

    // 가구: 스크롤로 떨어지고(되감으면 다시 올라가고), 방 안에서는 다 놓여 있다
    STORY.forEach((story, i) => {
      const item = this.items.get(story.id)!;
      const w = itemWindow(i);
      const d = s.room ? 1 : ramp(s.progress, w.drop[0], w.drop[1]);
      item.root.visible = d > 0.001;
      const fall = 1 - easeOutBounce(d);
      item.anim.position.y = fall * 3.4;
      item.anim.rotation.y = (1 - easeOutCubic(d)) * (i % 2 ? 0.8 : -0.8);
      item.anim.scale.setScalar(0.8 + 0.2 * easeOutCubic(d));

      // 마우스 올림: 살짝 뜬다. 누름: 통 튄다.
      item.hover += ((this.hovered === story.id && s.room ? 1 : 0) - item.hover) * Math.min(1, dt * 10);
      const k = item.kick < 0 ? 1 : Math.min(1, (t - item.kick) / 0.7);
      const bounce = k < 1 ? Math.sin(k * Math.PI) * (1 - k) * 0.35 : 0;
      item.anim.position.y += item.hover * 0.08 + bounce;
      const squash = k < 1 ? Math.sin(k * Math.PI * 2) * (1 - k) * 0.06 : 0;
      item.anim.scale.y *= 1 - squash;

      // 표시 점: 방 안에서 아직 누르지 않은 가구만
      const show = s.room && !this.found.has(story.id) ? 1 : 0;
      const mm = item.marker.material as THREE.SpriteMaterial;
      mm.opacity += (show * 0.9 - mm.opacity) * Math.min(1, dt * 4);
      item.marker.visible = mm.opacity > 0.01;
      item.marker.position.y = item.top + 0.5 + Math.sin(t * 2 + i) * 0.08;
      mm.rotation = Math.sin(t * 1.5 + i) * 0.2;
    });

    // 가구별 움직임
    const kt = (id: ItemId) => {
      const it = this.items.get(id)!;
      return it.kick < 0 ? 1 : Math.min(1, (t - it.kick) / 1.4);
    };
    const lampVisible = s.room ? 1 : ramp(s.progress, itemWindow(3).drop[0], itemWindow(3).drop[1]);
    this.lampLevel += ((this.lampOn ? 1 : 0) - this.lampLevel) * Math.min(1, dt * 6);
    this.lampShade.emissiveIntensity = 1.1 * this.lampLevel * lampVisible;
    this.lampLight.intensity = 3.4 * this.lampLevel * lampVisible * (0.97 + 0.03 * Math.sin(t * 7));

    this.screenLevel += ((this.screenOn ? 1 : 0) - this.screenLevel) * Math.min(1, dt * 5);
    this.screenMat.emissiveIntensity = 0.06 + 1.1 * this.screenLevel * (0.94 + 0.06 * Math.sin(t * 13));

    const p = kt("pile");
    this.topPolaroid.position.y = 0.785 + 15 * 0.012 + Math.sin(p * Math.PI) * 0.7;
    this.topPolaroid.rotation.x = Math.sin(p * Math.PI) * 1.1;
    this.topPolaroid.rotation.z = Math.sin(p * Math.PI * 2) * 0.3;

    const tr = kt("tree");
    const swing = tr < 1 ? (1 - tr) * 0.6 : 0;
    this.notes.forEach((n, i) => {
      n.rotation.z = Math.sin(t * 1.2 + i) * 0.06 + Math.sin(t * 9 + i) * swing;
    });

    this.page.rotation.z = Math.sin(kt("guestbook") * Math.PI) * -Math.PI * 0.9;
    this.slideBook.position.z = 0.02 + Math.sin(kt("shelf") * Math.PI) * 0.3;
    this.pillow.scale.y = 1 - Math.sin(kt("bed") * Math.PI) * 0.45;

    // 카메라: 스크롤에 따라 천천히 돌고, 방 안에서는 마우스를 살짝 따라온다
    this.parallax.lerp(s.room ? this.pointer : new THREE.Vector2(0, 0), Math.min(1, dt * 3));
    const az = -0.2 + s.progress * 0.32 + this.parallax.x * 0.07 + Math.sin(t * 0.2) * 0.01;
    const el = 0.6 + this.parallax.y * 0.035;
    const fill = 0.62 + (1.2 - 0.62) * easeInOut(s.zoom);
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const half = Math.tan(Math.min(vfov, hfov) / 2);
    const radius = 5.2;
    const dist = radius / (fill * half);
    const base = Math.PI / 4;
    this.camera.position.set(
      this.target.x + Math.sin(base + az) * Math.cos(el) * dist,
      this.target.y + Math.sin(el) * dist,
      this.target.z + Math.cos(base + az) * Math.cos(el) * dist,
    );
    this.camera.lookAt(this.target);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.renderer.dispose();
  }
}
