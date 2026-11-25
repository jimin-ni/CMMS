// 방 효과(셰이더 팩) 시험 체인. ?debug=1 일 때만 index.js 가 불러온다 (배포 번들에는 따로 떨어진 조각으로만 있고, 디버그가 아니면 받지 않는다).
// 값은 fx-flags.js 의 FX 를 읽는다. 사이드바가 값을 바꾸면 heap:fx 를 보낸다.
//
// 순서: 장면(선형 HDR, MSAA 4) → AO(GTAO) → 블룸 → 피사계 심도 → 톤 매핑·sRGB(OutputPass) → 색 보정·비네트·그레인(화면 공간)
// 장면 단계의 효과(부드러운 그림자, 환경광)는 패스가 아니라 재질과 조명을 바꾼다.
// 모든 효과가 꺼지면 renderer.render 를 그대로 부른다: 지금 방과 같은 그림이다 (fxprobe 의 'parity' 로 잰다).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FX } from './fx-flags.js';

// ─── 부드러운 그림자: 방향광(직교 그림자 지도)용 PCSS ───
// 그림자 지도의 깊이는 직교 투영이라 선형이다. 가리개와 받는 면의 깊이 차(m)에 광원 각도의 tan 을 곱하면 반그림자 폭(m)이 된다.
// HEAP_PCSS_K 는 그 폭을 그림자 지도 UV 로 바꾼 값: tan(각도) × 깊이 범위(m) ÷ 지도 폭(m).
// 재질에 HEAP_PCSS define 이 있을 때만 이 길로 간다. define 이 없는 재질(꺼진 상태, 다른 렌더러)은 three 의 원래 PCF 그대로다.
const PCSS_FN = /* glsl */ `
#ifdef HEAP_PCSS
float heapIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
vec2 heapVogel( int i, int n, float phi ) { float r = sqrt( ( float( i ) + 0.5 ) / float( n ) ); float t = float( i ) * 2.39996323 + phi; return r * vec2( cos( t ), sin( t ) ); }
float heapPCSS( sampler2D sm, vec4 c ) {
  float zR = c.z;
  float phi = heapIGN( gl_FragCoord.xy ) * 6.2831853;
  float searchR = HEAP_PCSS_K * HEAP_PCSS_SEARCH + HEAP_PCSS_TEXEL;
  float sum = 0.0; float n = 0.0;
  for ( int i = 0; i < 16; i ++ ) {
    float d = unpackRGBAToDepth( textureLod( sm, c.xy + heapVogel( i, 16, phi ) * searchR, 0.0 ) );
    if ( d < zR ) { sum += d; n += 1.0; }
  }
  if ( n < 0.5 ) return 1.0;
  float pen = clamp( ( zR - sum / n ) * HEAP_PCSS_K, HEAP_PCSS_TEXEL, searchR );
  float lit = 0.0;
  for ( int i = 0; i < HEAP_PCSS_N; i ++ ) lit += step( zR, unpackRGBAToDepth( textureLod( sm, c.xy + heapVogel( i, HEAP_PCSS_N, phi ) * pen, 0.0 ) ) );
  return lit / float( HEAP_PCSS_N );
}
#endif
`;
let chunkPatched = false;
function patchShadowChunk() {
  if (chunkPatched) return;
  const src = THREE.ShaderChunk.shadowmap_pars_fragment;
  const A = 'float getShadow( sampler2D shadowMap', B = 'if ( frustumTest ) {';
  const a = src.indexOf(A), b = src.indexOf(B, a);
  if (a < 0 || b < 0) { console.warn('[fx] 그림자 셰이더 조각을 찾지 못해 PCSS 를 건너뜀'); return; }
  THREE.ShaderChunk.shadowmap_pars_fragment =
    src.slice(0, a) + PCSS_FN + src.slice(a, b + B.length) +
    '\n#ifdef HEAP_PCSS\nreturn heapPCSS( shadowMap, shadowCoord );\n#endif\n' + src.slice(b + B.length);
  chunkPatched = true;
}

// ─── 색 보정, 비네트, 그레인 (톤 매핑 뒤 sRGB 값에서) ───
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, gradeOn: { value: 0 }, filmOn: { value: 0 },
    wb: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: 0 }, sat: { value: 1 }, contrast: { value: 1 },
    vig: { value: 0 }, grain: { value: 0 }, seed: { value: 0 }, aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float gradeOn, filmOn, lift, sat, contrast, vig, grain, seed, aspect; uniform vec3 wb; varying vec2 vUv;
    vec3 toLin( vec3 c ) { return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) ); }
    vec3 toSrgb( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) + seed ) * 43758.5453 ); }
    void main() {
      vec3 c = texture2D( tDiffuse, vUv ).rgb;
      vec3 lin = toLin( c );
      if ( gradeOn > 0.5 ) {
        lin *= wb;
        float y = dot( lin, vec3( 0.2126, 0.7152, 0.0722 ) );
        lin = max( mix( vec3( y ), lin, sat ), 0.0 );
      }
      if ( filmOn > 0.5 ) {
        // 비네트: 가운데 0, 모서리 1 인 거리의 제곱만큼 노출을 줄인다. 모서리에서 정확히 vig EV 가 빠진다
        vec2 d = ( vUv - 0.5 ) * vec2( aspect, 1.0 );
        float r2 = dot( d, d ) / dot( vec2( aspect, 1.0 ) * 0.5, vec2( aspect, 1.0 ) * 0.5 );
        lin *= exp2( - vig * r2 );
      }
      c = toSrgb( lin );
      if ( gradeOn > 0.5 ) { c = ( c - 0.5 ) * contrast + 0.5; c = lift + ( 1.0 - lift ) * clamp( c, 0.0, 1.0 ); }
      if ( filmOn > 0.5 ) {
        // 그레인: 중간 톤에서 가장 크고 검정·흰색 끝에서 사라진다 (필름 입자처럼)
        float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
        c += ( hash( gl_FragCoord.xy ) - 0.5 ) * 2.0 * grain * 4.0 * l * ( 1.0 - l );
      }
      gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
    }`,
};

// 배경 깔기: 위 그림은 OutputPass 에서 알파로 나눈 표시용 sRGB 값이다 (곱해지지 않은 알파). 배경 텍스처는 sRGB 라 읽으면 선형이므로 다시 sRGB 로.
const BACKDROP_SHADER = {
  uniforms: { tDiffuse: { value: null }, tBg: { value: null }, hasBg: { value: 0 } },
  vertexShader: GRADE_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tBg; uniform float hasBg; varying vec2 vUv;
    vec3 toSrgb( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      float a = clamp( c.a, 0.0, 1.0 );
      vec3 bg = hasBg > 0.5 ? toSrgb( texture2D( tBg, vUv ).rgb ) : vec3( 0.0 );
      gl_FragColor = vec4( mix( bg, c.rgb, a ), 1.0 );
    }`,
};

// 색온도(K)의 sRGB 근사 (Tanner Helland 근사식). 따뜻함 +400 은 6500K 화면을 6100K 빛으로 비춘 것처럼 보이게 한다.
function kelvinRGB(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map(v => Math.min(255, Math.max(0, v)) / 255);
}
function wbGains(warmth) {
  const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const a = kelvinRGB(6500 - warmth).map(lin), b = kelvinRGB(6500).map(lin);
  const g = a.map((v, i) => v / b[i]);
  const y = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2]; // 밝기는 그대로 두고 색만 옮긴다
  return g.map(v => v / y);
}
// L* (0..100) → sRGB 값 (0..1)
function lstarToSrgb(L) {
  const Y = L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3;
  return Y <= 0.0031308 ? Y * 12.92 : 1.055 * Math.pow(Y, 1 / 2.4) - 0.055;
}

export function setupFx(ctx) {
  const { renderer, scene, camera, controls, hemi, sun, RX, RZ, WALL_H, onDispose, on, root } = ctx;
  patchShadowChunk();

  const size = new THREE.Vector2();
  renderer.getSize(size);
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-RX - 1, -0.5, -RZ - 1), new THREE.Vector3(RX + 1, WALL_H + 1, RZ + 1)));
  // 잡음 제거 값은 three 예제(webgl_postprocessing_gtao)의 기본값
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
  // AO 와 피사계 심도는 장면을 덮어쓰는 재질로 한 번 더 그려 깊이를 얻는다. 덮어쓰는 재질은 물체 자신의 재질 설정을 보지 않으므로
  // 투명한 것(빛줄기, 창유리), 반짝임과 장식 빛(Sprite), 보이지 않는 것(누르기 영역 상자, 바닥 판, colorWrite 를 끈 꾸미기 보조물)이
  // 깊이에 들어가 둘레에 그늘이 진다 (Yoon 이 본 반짝임 둘레의 어두운 네모). 이런 것은 깊이를 그릴 때 감춘다.
  const noDepth = m => !m || m.transparent || m.visible === false || m.colorWrite === false || m.depthWrite === false;
  const hideNoDepth = () => {
    const hid = [];
    scene.traverse(o => {
      if (!o.visible) return;
      if (o.isSprite || o.isPoints || o.isLine || ((o.isMesh) && [].concat(o.material).every(noDepth))) { o.visible = false; hid.push(o); }
    });
    return () => { for (const o of hid) o.visible = true; };
  };
  const baseOverride = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = () => { baseOverride(); hideNoDepth(); }; // GTAO 가 미리 기억해 둔 값으로 되돌린다
  // 해상도 배율: AO 버퍼만 줄인다 (가장 비싼 단계)
  const gtaoSetSize = gtao.setSize.bind(gtao);
  let aoRes = 1, lastW = 1, lastH = 1;
  gtao.setSize = (w, h) => { lastW = w; lastH = h; gtaoSetSize(Math.max(1, Math.round(w * aoRes)), Math.max(1, Math.round(h * aoRes))); };

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.4, 1.2);
  // 블룸은 색과 함께 알파도 더한다. 흐린 알파가 화면 전체로 퍼지면 배경 깔기(BACKDROP)가 하늘을 어둡게 섞는다 (fxprobe 열지도).
  // 색은 그대로 더하고(SrcAlpha, One) 알파는 장면이 남긴 값을 둔다(Zero, One)
  Object.assign(bloom.blendMaterial, {
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.003, maxblur: 0.006 });
  // BokehShader 는 알파를 1 로 덮는다. 배경을 나중에 깔려면 알파가 남아야 한다
  bokeh.materialBokeh.fragmentShader = bokeh.materialBokeh.fragmentShader.replace('gl_FragColor.a = 1.0;', 'gl_FragColor.a = texture2D( tColor, vUv.xy ).a;');
  bokeh.materialBokeh.needsUpdate = true;
  const bokehRender = bokeh.render.bind(bokeh);
  bokeh.render = (...a) => { const restore = hideNoDepth(); try { bokehRender(...a); } finally { restore(); } };
  const output = new OutputPass();
  // 장면은 투명한 바탕에 그려져 반투명 가장자리(땅의 흐려지는 끝, 경계 화소)의 색이 알파로 곱해져 있다.
  // 곱해진 색을 톤 매핑하면 바로 그릴 때(표시 공간에서 섞기)와 달라지므로, 톤 매핑 전에 알파로 나눈다
  output.material.fragmentShader = output.material.fragmentShader.replace(
    'gl_FragColor = texture2D( tDiffuse, vUv );',
    // 블룸은 더하기 섞기라 알파까지 1 을 넘길 수 있다. 넘은 알파로 나누면 방 전체가 어두워지므로 1 로 자른다
    'gl_FragColor = texture2D( tDiffuse, vUv ); gl_FragColor.a = clamp( gl_FragColor.a, 0.0, 1.0 ); if ( gl_FragColor.a > 0.0 ) gl_FragColor.rgb /= gl_FragColor.a;',
  );
  output.material.needsUpdate = true;
  // 배경(time.js 의 하늘 그라데이션)은 sRGB 텍스처라 three 가 바로 그릴 때는 톤 매핑을 하지 않는다 (WebGLBackground).
  // 체인은 OutputPass 에서 모든 화소를 톤 매핑하므로, 장면은 투명한 바탕에 그리고 톤 매핑 뒤에 배경을 그대로 밑에 깐다.
  const backdrop = new ShaderPass(BACKDROP_SHADER);
  const grade = new ShaderPass(GRADE_SHADER);
  for (const p of [renderPass, gtao, bloom, bokeh, output, backdrop, grade]) composer.addPass(p);
  renderPass.clearColor = new THREE.Color(0, 0, 0); renderPass.clearAlpha = 0;

  // 환경광: three 의 RoomEnvironment(흰 스튜디오 방)을 방의 반구광 색으로 물들여 PMREM 으로 굽는다
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = null;
  function bakeEnv() {
    const env = new RoomEnvironment(renderer);
    const sky = hemi.color, ground = hemi.groundColor;
    env.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.isMeshBasicMaterial) m.color.copy(sky).multiplyScalar(m.color.r); // 빛 판: 하늘색 × 원래 세기
      else if (m.isMeshStandardMaterial) m.color.copy(ground).lerp(sky, 0.35); // 벽: 바닥 반사색 쪽
    });
    envTex?.dispose();
    envTex = pmrem.fromScene(env, 0.04).texture;
    env.dispose();
  }

  // 재질 맞추기: PCSS define, 환경광 세기. 새로 놓인 가구도 잡도록 30 프레임마다 다시 본다
  let sigCache = '';
  function pcssDefines() {
    const cam = sun.shadow.camera, mapW = sun.shadow.mapSize.x;
    const K = Math.tan(THREE.MathUtils.degToRad(FX.shadow.angle)) * (cam.far - cam.near) / (cam.right - cam.left);
    return {
      HEAP_PCSS: '',
      HEAP_PCSS_K: K.toFixed(7),
      HEAP_PCSS_N: String(Math.round(FX.shadow.samples)),
      HEAP_PCSS_SEARCH: (4 / (cam.far - cam.near)).toFixed(6), // 4 m 위의 가리개까지 찾는다
      HEAP_PCSS_TEXEL: (1 / mapW).toFixed(7),
    };
  }
  function syncMaterials(force) {
    const pcss = FX.shadow.on && chunkPatched ? pcssDefines() : null;
    const sig = JSON.stringify([pcss, FX.ibl.on && FX.ibl.intensity, envScale]);
    if (!force && sig === sigCache) return sweepNew(pcss, sig);
    sigCache = sig;
    sweepNew(pcss, sig);
  }
  function sweepNew(pcss, sig) {
    scene.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || m.isShaderMaterial || m.isMeshBasicMaterial || m.userData.fxSig === sig) continue;
        const defs = { ...(m.defines ?? {}) };
        for (const k of Object.keys(defs)) if (k.startsWith('HEAP_PCSS')) delete defs[k];
        if (pcss) Object.assign(defs, pcss);
        m.defines = defs;
        if (m.isMeshStandardMaterial) m.envMapIntensity = FX.ibl.on ? FX.ibl.intensity * envScale : 1;
        m.userData.fxSig = sig;
        m.needsUpdate = true;
      }
    });
  }

  // 반구광: time.js 가 시간마다 hemi.intensity 를 다시 넣는다. 넣은 값을 기준으로 삼아 비율을 곱한다
  let hemiBase = hemi.intensity, hemiSet = hemi.intensity;
  // 환경광은 시간대를 따라야 한다: 한 번 구운 환경 지도는 밤에도 낮만큼 밝다 (fxprobe 21시: 평균 L* +9).
  // 세기는 그 시각의 반구광 세기에 비례시키고(기준 0.875 = 15시), 반구광 색이 바뀌면 환경 지도를 다시 굽는다.
  const HEMI_REF = 0.875;
  const SHAFT_K = 0.4; // fxprobe: 9·15·18시에 체인만 그린 그림의 ΔE 가 0.35~0.45 에서 가장 작다
  let envScale = 1, bakedFor = '';
  function applyHemi() {
    if (hemi.intensity !== hemiSet) hemiBase = hemi.intensity;
    hemiSet = hemiBase * (FX.ibl.on ? FX.ibl.hemi : 1);
    hemi.intensity = hemiSet;
    envScale = Math.round(hemiBase / HEMI_REF * 100) / 100;
    if (FX.ibl.on) {
      const key = hemi.color.getHexString() + hemi.groundColor.getHexString();
      if (key !== bakedFor) { bakeEnv(); bakedFor = key; scene.environment = envTex; }
    }
  }

  function apply() {
    gtao.enabled = FX.ao.on;
    gtao.blendIntensity = FX.ao.intensity;
    gtao.updateGtaoMaterial({ radius: FX.ao.radius, distanceExponent: 1, thickness: FX.ao.thickness, scale: 1, samples: 16, distanceFallOff: FX.ao.falloff, screenSpaceRadius: false });
    if (aoRes !== FX.ao.res) { aoRes = FX.ao.res; gtao.setSize(lastW, lastH); }
    bloom.enabled = FX.bloom.on;
    bloom.strength = FX.bloom.strength; bloom.radius = FX.bloom.radius; bloom.threshold = FX.bloom.threshold;
    bokeh.enabled = FX.dof.on;
    bokeh.uniforms.aperture.value = FX.dof.aperture; bokeh.uniforms.maxblur.value = FX.dof.maxblur;
    const gu = grade.uniforms;
    grade.enabled = FX.grade.on || FX.film.on;
    gu.gradeOn.value = FX.grade.on ? 1 : 0; gu.filmOn.value = FX.film.on ? 1 : 0;
    gu.wb.value.fromArray(wbGains(FX.grade.warmth));
    gu.lift.value = lstarToSrgb(FX.grade.lift);
    gu.sat.value = FX.grade.saturation; gu.contrast.value = FX.grade.contrast;
    gu.vig.value = FX.film.vignette; gu.grain.value = FX.film.grain;
    applyHemi();
    if (FX.ibl.on) { if (!envTex) { bakeEnv(); bakedFor = hemi.color.getHexString() + hemi.groundColor.getHexString(); } scene.environment = envTex; } else scene.environment = null;
    syncMaterials(true);
  }

  // ctx.fxForce: 효과가 모두 꺼져도 체인으로 그린다 (측정용: 체인 자체가 그림을 바꾸는지 본다)
  const composerOn = () => ctx.fxForce || FX.ao.on || FX.bloom.on || FX.dof.on || FX.grade.on || FX.film.on;
  const focusAt = new THREE.Vector3();
  let frameN = 0;
  ctx.draw = () => {
    if (++frameN % 30 === 0) syncMaterials(false);
    applyHemi();
    if (!composerOn()) { renderer.render(scene, camera); return; }
    // 초점: 사진 더미(방의 주인공) 윗면. 더미가 없으면 카메라가 보는 점
    if (FX.dof.on) bokeh.uniforms.focus.value = camera.position.distanceTo(ctx.HOST ? focusAt.set(ctx.HOST.x, ctx.HOST.top, ctx.HOST.z) : controls.target);
    grade.uniforms.seed.value = (frameN % 64) * 1.618;
    grade.uniforms.aspect.value = camera.aspect;
    const bg = scene.background;
    backdrop.uniforms.tBg.value = bg?.isTexture ? bg : null;
    backdrop.uniforms.hasBg.value = bg?.isTexture ? 1 : 0;
    scene.background = null;
    // 빛줄기(더하기 섞기)는 바로 그릴 때 표시 공간(sRGB)에서 더해진다. 체인은 톤 매핑 전 선형 공간에서 더하므로 어두운 곳에서 훨씬 밝아진다.
    // 체인으로 그릴 때만 불투명도를 줄여 지금 모습에 맞춘다. 값은 fxprobe 의 체인만 그린 그림이 지금 그림과 가장 덜 다른 값
    const shaft = ctx.shaftMat, shaftO = shaft?.opacity;
    if (shaft) shaft.opacity = shaftO * (ctx.fxShaftK ?? SHAFT_K);
    try { composer.render(); } finally { scene.background = bg; if (shaft) shaft.opacity = shaftO; }
  };
  ctx.fxResize = (w, h) => { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); };
  ctx.fxApply = apply;
  ctx.fx = { composer, gtao, bloom, bokeh, output, grade, FX };

  on(root, 'heap:fx', apply);
  apply();
  onDispose(() => { composer.dispose?.(); rt.dispose(); envTex?.dispose(); pmrem.dispose(); gtao.dispose?.(); bloom.dispose?.(); });
}
