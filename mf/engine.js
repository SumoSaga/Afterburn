/* Machine-Fall FPS, prototype 2: the engine (drawing, light, effects, the yard and what grows in it).
   The picture is made the way the Circuit Breaker Pixel Table makes it: drawn small, lit in steps, figures in bigger
   blocks of pixels when they are close, outlines from depth and normals, haze the sun cuts shafts through, glow from
   anything brighter than white, a short dithered range of each colour. The soldiers, the walker, the trees, the grass
   and the weather are the Table's own files (cb/), so everything here is in the Table's units: 1 unit is 6 cm.
   The game itself (mf/game.js) thinks in metres and multiplies by U when it hands a place to the engine. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { planMap, THEMES } from "./mapgen.js";
/* Which field this is. "classic" is the refinery built by hand; anything else is "<kit>-<number>" and is made by
   mf/mapgen.js. The key comes from the address (?map=), or from the last one chosen on this machine. */
const okKey = (k) => !!k && /^[a-z]+-\d{1,6}-[sml][ad]$/.test(k) && !!THEMES[k.split("-")[0]];
export const MAPKEY = (() => { let k = null; try { if (sessionStorage.getItem("ab-autojoin")) k = sessionStorage.getItem("ab-map-join"); else sessionStorage.removeItem("ab-map-join"); } catch (e) {} if (!okKey(k)) k = new URLSearchParams(location.search).get("map"); try { if (!okKey(k)) k = localStorage.getItem("ab-map"); } catch (e) {} if (!okKey(k)) { k = "mixed-" + (1000 + Date.now() % 9000) + "-sa"; try { localStorage.setItem("ab-map", k); } catch (e) {} } return k; })();
export const setMap = (k, extra) => { if (!okKey(k)) return false; try { localStorage.setItem("ab-map", k); sessionStorage.removeItem("ab-map-join"); if (extra) sessionStorage.setItem("ab-map-go", JSON.stringify(extra)); } catch (e) {} const u = new URL(location.href); u.searchParams.delete("map"); location.href = u.toString(); return true; };
export const SALT = (() => { try { return Math.min(6, +localStorage.getItem("ab-salt:" + MAPKEY) || 0); } catch (e) { return 0; } })();
// a field that fails its walk test is made again with the next salt, so the same key still gives everyone the same field
export const retryField = (to) => { const n = to != null ? to : SALT + 1; if (n > 6 || n === SALT) return false; try { localStorage.setItem("ab-salt:" + MAPKEY, n); } catch (e) { return false; } location.reload(); return true; };
const KEYN = [...MAPKEY.slice(0, -1)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
export { THREE };
export const U = 1 / .06;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// While the field is being built, every roll comes from one fixed sequence, so that two players' fields are the same field.
const _mr = Math.random; { let sd = 20261120 ^ KEYN; Math.random = () => { sd |= 0; sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const rnd = () => Math.random();
export const $ = (id) => document.getElementById(id);
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const hash2 = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
function noise2(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }

/* ---------- settings ---------- */
export const DEF = { px: 3, fov: 95, sens: 1, walk: 4.5, sprint: 6.5, jump: 7.4, gravity: 22, air: 2, wallTime: 3, wallSpeed: 9.5, wallKick: 2, slideBoost: 3, outlines: 1, palette: 0, blocks: 1, weather: "clear", shadows: 1, fps: 0 };
export const CFG = { ...DEF };
try { Object.assign(CFG, JSON.parse(localStorage.getItem("mf-fps-cfg3") || "{}")); } catch (e) {}
export const saveCfg = () => { try { localStorage.setItem("mf-fps-cfg3", JSON.stringify(CFG)); } catch (e) {} };

/* ---------- renderer, cameras, materials ---------- */
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1); renderer.autoClear = false;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
document.body.prepend(renderer.domElement);
const GL = renderer.getContext();
const NEAR = .08 * U, FAR = 620 * U;
export const scene = new THREE.Scene();
export const cam = new THREE.PerspectiveCamera(CFG.fov, 1, NEAR, FAR); cam.rotation.order = "YXZ";
export const gunScene = new THREE.Scene();
export const gunCam = new THREE.PerspectiveCamera(62, 1, .02, 10);

const bands = new Uint8Array([46, 86, 128, 170, 212, 255].flatMap((v) => [v, v, v, 255]));
export const grad = new THREE.DataTexture(bands, 6, 1, THREE.RGBAFormat); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
export const flatToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, side: THREE.DoubleSide });
const genToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
// the alpha a surface writes tells the pixel pass what it is: .5 a figure, .6 what the pilot holds, .25 leaves and grass
const masked = (base, a, key) => { const m = base.clone(); m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.a = " + a + ";"); }; m.customProgramCacheKey = () => key; return m; };
export const charMat = masked(flatToon, "0.5", "mfChar"), gunMat = masked(flatToon, "0.6", "mfGun"), leafMat = masked(flatToon, "0.25", "mfLeaf");
const normMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });

/* ---------- light: a low sun at dusk ---------- */
const TOD = { sunI: 2.2, hemiI: .72, fogDen: .0011 };
export const sun = new THREE.DirectionalLight("#ff9a5e", TOD.sunI); sun.position.set(-200 * U, 125 * U, 125 * U); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -215 * U, right: 215 * U, top: 215 * U, bottom: -215 * U, near: 10, far: 560 * U }); sun.shadow.bias = -.0007;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight("#5a68a8", .32); fill.position.set(1, .6, -.8); scene.add(fill);
export const hemi = new THREE.HemisphereLight("#8388bc", "#3a2a30", TOD.hemiI); scene.add(hemi);
gunScene.add(new THREE.HemisphereLight("#a9a2c4", "#4a3c34", 1.1)); { const l = new THREE.DirectionalLight("#ffb07a", 2.0); l.position.set(-1, .9, .6); gunScene.add(l); }

// lights that come and go: muzzle flashes, blasts, a Titan coming down. A fixed pool, so nothing is rebuilt when one fires.
const LP = Array.from({ length: 6 }, () => { const l = new THREE.PointLight("#ffffff", 0, 420, 1.5); scene.add(l); return { l, t: 0, life: 0, i0: 0 }; });
export function flash(at, color, power, life) { const b = LP.find((x) => x.life <= 0) || LP.reduce((a, x) => (x.l.intensity < a.l.intensity ? x : a)); b.l.color.set(color); b.l.position.copy(at); b.i0 = power; b.l.intensity = power; b.t = 0; b.life = life; return b; }
// lamps and fires that stay lit
const LAMPS = [];
function lamp(x, y, z, color, power, o = {}) { const l = new THREE.PointLight(color, power, o.reach || 330, 1.5); l.position.set(x * U, y * U, z * U); scene.add(l); const L = { l, power, flicker: o.flicker || 0, blink: o.blink || 0, ph: rnd() * 9, bulb: null, col: new THREE.Color(color) }; LAMPS.push(L); return L; }

/* ---------- pixel particles ---------- */
const FX = [];
export const fxLayer = (o) => { o.traverse((c) => c.layers.set(1)); return o; };
const fxScene = { add: (o) => { fxLayer(o); scene.add(o); } };
export function puff(at, o = {}) {
  const n = Math.min(o.n || 12, 40), pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { pos.set([at.x, at.y, at.z], i * 3); vel.push(o.vel ? o.vel(i) : V3((rnd() - .5) * 60, rnd() * 60, (rnd() - .5) * 60)); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: new THREE.Color(o.color || "#ffc860").multiplyScalar(o.dark ? 1 : o.hot || 1.8), size: 2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: o.dark ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: o.opacity ?? 1 });
  const pts = fxLayer(new THREE.Points(g, m)); pts.frustumCulled = false; scene.add(pts);
  FX.push({ pts, vel, t: 0, life: o.life || 1, grav: o.grav ?? 0, drag: o.drag ?? 0, base: o.size || 3, grow: o.grow || 0, o0: m.opacity });
}
export function ringFx(at, color, r, life = .6) { const m = fxLayer(new THREE.Mesh(new THREE.RingGeometry(.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))); m.position.copy(at); scene.add(m); FX.push({ mesh: m, t: 0, life, r }); }
export function flareFx(at, color, power, life = .8) { flash(V3(at.x, (at.y || 0) + 8, at.z), color, 900 + power * 700, life * .8); const m = fxLayer(new THREE.Mesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .6 }))); m.position.set(at.x, (at.y || 0) + .6, at.z); m.scale.setScalar(12 + power * 5); scene.add(m); FX.push({ glow: m, t: 0, life }); }
export function chunksFx(at, color, n, speed) { for (let i = 0; i < Math.min(n, 8); i++) { const s = 1.4 + rnd() * 2.5, m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshToonMaterial({ color, gradientMap: grad })); m.position.copy(at); m.castShadow = true; scene.add(m); const a = rnd() * 6.28, sp = speed * (.4 + rnd() * .7); FX.push({ chunk: m, v: V3(Math.cos(a) * sp, speed * (.8 + rnd()), Math.sin(a) * sp), t: 0, life: 1.6 }); } }
// a round in flight: a short bright streak that runs from a to b
const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5);
export function tracer(a, b, color = "#ffd890", speed = 5200, thick = .55) { const d = a.distanceTo(b); if (d < 1) return; const m = fxLayer(new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))); m.position.copy(a); m.lookAt(b); scene.add(m); FX.push({ tr: m, a: a.clone(), b: b.clone(), d, t: 0, life: Math.max(.03, d / speed), thick, len: Math.min(d, Math.max(40, d * .22)) }); }
function tickFx(dt) {
  const ps = Math.max(1, Math.round(CFG.px));
  for (let i = FX.length - 1; i >= 0; i--) {
    const b = FX[i]; b.t += dt; const k = b.t / b.life;
    if (b.pts) { const p = b.pts.geometry.attributes.position;
      b.vel.forEach((v, j) => { v.y += b.grav * dt; if (b.drag) v.multiplyScalar(Math.max(0, 1 - b.drag * dt)); p.array[j * 3] += v.x * dt; p.array[j * 3 + 1] = Math.max(.5, p.array[j * 3 + 1] + v.y * dt); p.array[j * 3 + 2] += v.z * dt; });
      p.needsUpdate = true; b.pts.material.size = b.base * (1 + b.grow * k) * .5 / ps; b.pts.material.opacity = b.o0 * (1 - k); }
    else if (b.mesh) { b.mesh.scale.setScalar(2 + (b.r - 2) * k); b.mesh.material.opacity = 1 - k; }
    else if (b.glow) b.glow.material.opacity = .6 * (1 - k);
    else if (b.chunk) { b.v.y -= 260 * dt; b.chunk.position.addScaledVector(b.v, dt); if (b.chunk.position.y < 1) { b.chunk.position.y = 1; b.v.set(b.v.x * .4, -b.v.y * .3, b.v.z * .4); } b.chunk.rotation.x += dt * 6; }
    else if (b.tr) { const h = Math.min(1, k) * b.d, t0 = Math.max(0, h - b.len); b.tr.position.copy(b.a).lerp(b.b, t0 / b.d); b.tr.scale.set(b.thick, b.thick, Math.max(1, h - t0)); }
    if (k >= 1) { const o = b.pts || b.mesh || b.glow || b.chunk || b.tr; scene.remove(o); if (!b.tr) o.geometry.dispose(); o.material.dispose(); FX.splice(i, 1); }
  }
  for (const b of LP) { if (b.life <= 0) continue; b.t += dt; const k = b.t / b.life; b.l.intensity = b.i0 * Math.max(0, 1 - k) ** 2; if (k >= 1) { b.life = 0; b.l.intensity = 0; } }
}

/* ---------- the pixel pass ---------- */
const PAL = ["#14110e","#231d17","#332a21","#463a2d","#5c4c3a","#76634c","#917b5f","#ad9677","#c9b392","#e2d0ae","#f4ead2",
  "#2a2f22","#3b4430","#4f5a3c","#66704a","#7f8a5b","#9aa46e","#454c52","#5f676d","#7d858a","#a1a7a8","#c7cbc8",
  "#5a2a1a","#7c3a1e","#a4532a","#c9733a","#e4a050","#f2c46a","#fbe6a0","#4a1416","#7a1f1e","#b0312a","#e05a3a",
  "#2d4c5a","#4e8296","#8fe0f0","#d8f8ff","#5a4a6e","#a07ac8","#3e5c2a","#5c7f36","#86a849"];
const srgb = (h) => { const n = parseInt(h.slice(1), 16); return new THREE.Vector3((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
let LW = 0, LH = 0, colorRT, normRT;
export const post = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, tNorm: { value: null }, tShadow: { value: null }, lowSize: { value: new THREE.Vector2() }, px: { value: 3 }, usePal: { value: 0 }, useLine: { value: 1 }, useBlock: { value: 1 },
    near: { value: NEAR }, far: { value: FAR }, unit: { value: U }, time: { value: 0 }, hurt: { value: 0 }, cool: { value: 0 }, fogDen: { value: TOD.fogDen }, shaftK: { value: 1.0 }, fogMix: { value: 1.0 }, hasShadow: { value: 0 }, expo: { value: 1.22 },
    invPV: { value: new THREE.Matrix4() }, shadowM: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() },
    fogCol: { value: new THREE.Vector3(.56, .38, .42) }, sunCol: { value: new THREE.Vector3(1, .48, .28) }, gradeLo: { value: new THREE.Vector3(.82, .88, 1.18) }, gradeHi: { value: new THREE.Vector3(1.1, .97, .88) }, pal: { value: PAL.map(srgb) } },
  vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    precision highp float;
    uniform sampler2D tColor, tDepth, tNorm, tShadow; uniform vec2 lowSize; uniform float px, usePal, useLine, useBlock, near, far, unit, time, hurt, cool, fogDen, shaftK, fogMix, hasShadow, expo;
    uniform mat4 invPV, shadowM; uniform vec3 camPos, fogCol, sunCol, gradeLo, gradeHi; uniform vec3 pal[${PAL.length}];
    ivec2 cl(ivec2 p){ return clamp(p, ivec2(0), ivec2(lowSize) - 1); }
    float rawz(ivec2 p){ return texelFetch(tDepth, cl(p), 0).r; }
    float dep(ivec2 p){ return near * far / (far - rawz(p) * (far - near)); }
    vec3 nor(ivec2 p){ return texelFetch(tNorm, cl(p), 0).rgb * 2.0 - 1.0; }
    float mask(ivec2 p){ return texelFetch(tColor, cl(p), 0).a; }
    vec3 toS(vec3 c){ return pow(clamp(c, 0.0, 1.0), vec3(1.0/2.2)); }
    float bayer(ivec2 p){ int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[(p.y & 3) * 4 + (p.x & 3)]) + 0.5) / 16.0; }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    // is this point in the air in sunlight? (the sun's own shadow map, read back)
    float sunlit(vec3 w){ vec4 sc = shadowM * vec4(w, 1.0); vec3 q = sc.xyz / sc.w; if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
      float d = dot(texture(tShadow, q.xy), vec4(1.0 / 16777216.0, 1.0 / 65536.0, 1.0 / 256.0, 1.0)) * (255.0 / 256.0); return q.z - 0.003 > d ? 0.0 : 1.0; }
    void main(){
      ivec2 p = cl(ivec2(floor(gl_FragCoord.xy / px))); int st = 1;
      // a figure's pixels come in blocks when it is close: every pixel of a block shows the block's middle, so the
      // flat faces and hard corners of its parts melt into a sprite
      if (useBlock > 0.5) {
        ivec2 p3 = cl((p / 3) * 3 + 1), p2 = cl((p / 2) * 2); float a3 = mask(p3), a2 = mask(p2);
        // (the close tier of 3 by 3 blocks made troops hard to read at arm's length, so figures now only ever go to 2 by 2, and only within 6 m)
        if (a2 > 0.3 && a2 < 0.55 && dep(p2) < 6.0 * unit) { p = p2; st = 2; }   // what you hold is no longer blocked up: the model rifle and hands have detail worth seeing
      }
      vec3 lin = texelFetch(tColor, p, 0).rgb;
      if (st > 1) { ivec2 o0 = st == 3 ? p - 1 : p; vec3 sum = vec3(0.0); float n = 0.0;   // the block shows the average of the figure's pixels inside it
        for (int y = 0; y < st; y++) for (int x = 0; x < st; x++) { vec4 t = texelFetch(tColor, cl(o0 + ivec2(x, y)), 0); if (t.a > 0.3 && t.a < 0.7) { sum += t.rgb; n += 1.0; } }
        if (n > 0.0) lin = sum / n; } float z = rawz(p), d = dep(p), a = mask(p), w0 = 1.0 / d; bool sky = d > far * 0.6, held = a > 0.55 && a < 0.7, leaf = a < 0.3;
      // contact shadow: darker where the surface folds in toward the eye (corners, under things, where feet meet the ground)
      if (!sky && !held) { float ao = 0.0; ivec2 q4[4] = ivec2[4](ivec2(2,0), ivec2(0,2), ivec2(2,2), ivec2(2,-2));
        for (int i = 0; i < 4; i++) ao += clamp((1.0 / dep(p + q4[i]) + 1.0 / dep(p - q4[i]) - 2.0 * w0) / (0.09 * w0), 0.0, 1.0);
        lin *= 1.0 - 0.42 * ao / 4.0; }
      // the air between the eye and the surface: haze that lies low and drifts, and catches the sun where the sun
      // reaches it, so walls and Titans cut shafts through it
      if (!held) { vec2 uv = (vec2(p) + 0.5) / lowSize; vec4 wv = invPV * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); vec3 w = wv.xyz / wv.w, ray = w - camPos; float len = min(length(ray), 1300.0); vec3 dir = normalize(ray);
        float jit = bayer(p), fogA = 0.0, sh = 0.0, dt = len / 8.0;
        for (int i = 0; i < 8; i++) { vec3 q = camPos + dir * (dt * (float(i) + jit));
          float den = fogDen * exp(-max(q.y, 0.0) / 42.0) * (0.45 + 1.1 * vnoise(q.xz * 0.011 + vec2(time * 0.05, time * 0.03)));
          fogA += den * dt; sh += den * dt * (hasShadow > 0.5 ? sunlit(q) : 1.0); }
        lin = mix(lin, fogCol, (1.0 - exp(-fogA)) * (sky ? 0.3 : 0.55) * fogMix) + sunCol * shaftK * (1.0 - exp(-sh * 1.4)) * 0.34; }
      // glow: anything brighter than white spills onto the pixels round it
      vec3 bl = vec3(0.0);
      ivec2 o1[4] = ivec2[4](ivec2(2,0), ivec2(-2,0), ivec2(0,2), ivec2(0,-2)), o2[4] = ivec2[4](ivec2(3,3), ivec2(-3,3), ivec2(3,-3), ivec2(-3,-3)), o3[4] = ivec2[4](ivec2(6,0), ivec2(-6,0), ivec2(0,6), ivec2(0,-6));
      for (int i = 0; i < 4; i++) bl += max(texelFetch(tColor, cl(p + o1[i]), 0).rgb - 1.0, 0.0) * 0.14 + max(texelFetch(tColor, cl(p + o2[i]), 0).rgb - 1.0, 0.0) * 0.08 + max(texelFetch(tColor, cl(p + o3[i]), 0).rgb - 1.0, 0.0) * 0.05;
      lin += bl * 0.6;
      // film: exposure, a shoulder on the highlights, cool shadows and warm lights
      lin *= expo; lin = lin * (2.51 * lin + 0.03) / (lin * (2.43 * lin + 0.59) + 0.14);
      float lum = dot(lin, vec3(0.3, 0.59, 0.11)); lin = max(mix(vec3(lum), lin, 1.2), 0.0); lin = mix(lin, lin * mix(gradeLo, gradeHi, smoothstep(0.0, 0.55, lum)), 0.7);
      vec3 c = toS(lin);
      if (useLine > 0.5) {
        // 1/depth runs in a straight line across any flat surface, so a pixel is an outline when its neighbour
        // stands nearer than the surface it sits on would predict
        float edge = 0.0, hi = 0.0; vec3 n = nor(p);
        ivec2 o[4] = ivec2[4](ivec2(1,0), ivec2(-1,0), ivec2(0,1), ivec2(0,-1));
        for (int i = 0; i < 4; i++) {
          float wp = 1.0 / dep(p + o[i] * st), wm = 1.0 / dep(p - o[i] * st);
          if (wp + wm - 2.0 * w0 > 0.06 * w0 + 0.000025 && wp > w0) edge = 1.0;
          else if (!sky && d < 45.0 * unit && abs(wp - w0) < 0.05 * w0 && dot(n, nor(p + o[i] * st)) < 0.7) hi = 1.0;   // a fold in the same shape: a lit edge
        }
        if (edge > 0.5) c = leaf ? c * 0.8 : c * 0.42 + vec3(0.03, 0.02, 0.015);
        else if (hi > 0.5 && !leaf) c = min(c * 1.16 + 0.03, vec3(1.0));
      }
      if (usePal > 0.5) {
        float best = 1e9; vec3 bc = c;
        for (int i = 0; i < ${PAL.length}; i++) { vec3 e = (c - pal[i]) * vec3(0.9, 1.15, 0.75); float q = dot(e, e); if (q < best) { best = q; bc = pal[i]; } }
        c = bc;
      } else c = floor(c * 26.0 + bayer(p)) / 26.0;   // a limited range of each colour, dithered
      vec2 uv2 = gl_FragCoord.xy / (lowSize * px); float rim = smoothstep(0.38, 1.0, length((uv2 - 0.5) * vec2(1.25, 1.0)) * 1.25);
      c *= 1.0 - 0.42 * rim;
      c = mix(c, vec3(0.69, 0.19, 0.16), clamp(hurt, 0.0, 1.0) * (0.15 + 0.6 * rim));
      c = mix(c, vec3(0.56, 0.88, 0.94), clamp(cool, 0.0, 1.0) * rim * 0.5);
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene(); postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post)); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
export function makeRTs() {
  const PX = Math.max(1, Math.round(CFG.px));
  renderer.setSize(innerWidth, innerHeight);
  LW = Math.ceil(innerWidth / PX); LH = Math.ceil(innerHeight / PX);
  colorRT && colorRT.dispose(); normRT && normRT.dispose();
  const opt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType };
  colorRT = new THREE.WebGLRenderTarget(LW, LH, opt); colorRT.depthTexture = new THREE.DepthTexture(LW, LH); colorRT.depthTexture.type = THREE.FloatType;
  normRT = new THREE.WebGLRenderTarget(LW, LH, opt);
  post.uniforms.tColor.value = colorRT.texture; post.uniforms.tDepth.value = colorRT.depthTexture; post.uniforms.tNorm.value = normRT.texture;
  post.uniforms.lowSize.value.set(LW, LH); post.uniforms.px.value = PX;
  cam.aspect = gunCam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); gunCam.updateProjectionMatrix();
}
addEventListener("resize", makeRTs);

export const GEN = window.RevelryGenBuild ? window.RevelryGenBuild(THREE, mergeGeometries) : null;
/* ---------- the yard, built from boxes (authored in metres, drawn at U) ---------- */
export const BOXES = [];                 // everything solid: { min: [x,y,z], max: [x,y,z] } in metres
const geos = [], glowGeos = [], _c = new THREE.Color(), R1 = seeded(4242);
function boxGeo(w, h, d, x, y, z, col, grime = true) { const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed(); g.deleteAttribute("uv"); _c.set(col); const a = [], P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const k = grime && h >= 1 ? lerp(.74, 1.06, (P.getY(i) - y) / h) : 1; a.push(_c.r * k, _c.g * k, _c.b * k); } g.setAttribute("color", new THREE.Float32BufferAttribute(a, 3)); return g; }
function tone(col, k) { _c.set(col).multiplyScalar(k); return "#" + _c.getHexString(); }
const deco = (x, y, z, w, h, d, col, grime) => geos.push(boxGeo(w, h, d, x, y, z, col, grime));
const glow = (x, y, z, w, h, d) => glowGeos.push(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
function solid(x, y, z, w, h, d, col, o = {}) {
  BOXES.push({ min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2] });
  if (o.hide) return;
  geos.push(boxGeo(w, h, d, x, y, z, col));
  if (h >= 3) {
    deco(x, y, z, w + .12, .5, d + .12, o.base || "#3c4046", false); deco(x, y + h - .22, z, w + .1, .22, d + .1, o.cap || "#c9733a", false);
    if (o.stripe !== false) deco(x, y + 2.1, z, w + .06, .3, d + .06, "#e4a050", false);
    // plates, patches and a pipe or two, so a wall is not one flat colour
    for (const [len, ax, sg] of [[w, 0, 1], [w, 0, -1], [d, 2, 1], [d, 2, -1]]) { const n = Math.floor(len / 2.6);
      for (let i = 0; i < n; i++) { if (R1() < .35) continue; const pw = 1 + R1() * 1.6, ph = .7 + R1() * 1.3, u = (R1() - .5) * (len - pw - .4), py = y + .7 + R1() * Math.max(.1, h - ph - 1.4), c2 = tone(col, .84 + R1() * .26);
        if (py > y + 1.6 && py < y + 2.5 && o.stripe !== false) continue;
        if (ax === 0) deco(x + u, py, z + sg * (d / 2 + .02), pw, ph, .08, c2); else deco(x + sg * (w / 2 + .02), py, z + u, .08, ph, pw, c2); }
      if (len > 5 && R1() < .6) { const u = (R1() - .5) * (len - 1); if (ax === 0) deco(x + u, y, z + sg * (d / 2 + .1), .16, h - .3, .16, "#454c52"); else deco(x + sg * (w / 2 + .1), y, z + u, .16, h - .3, .16, "#454c52"); } }
  }
}
function cyl(x, y, z, r, h, col, seg = 8) { const g = new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z).toNonIndexed(); g.deleteAttribute("uv"); _c.set(col); const a = [], P = g.attributes.position; for (let i = 0; i < P.count; i++) { const k = lerp(.8, 1.05, (P.getY(i) - y) / h); a.push(_c.r * k, _c.g * k, _c.b * k); } g.setAttribute("color", new THREE.Float32BufferAttribute(a, 3)); geos.push(g); }
const CON = "#7d858a", CON2 = "#a1a7a8", STEEL = "#5f676d", DRAB = "#4f5a3c", DRAB2 = "#66704a", RUST = "#7c3a1e", SAND = "#917b5f";

/* ---------- the lie of the land: flat where things are built, hills and forest between ---------- */
export const WORLD = { x0: -160, x1: 160, z0: -190, z1: 150 };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }, fbm = (x, z) => noise2(x, z) * .65 + noise2(x * 2.1 + 5, z * 2.1 + 3) * .35;
const NOX = (KEYN % 977) * 1.3, NOZ = ((KEYN >>> 10) % 991) * 1.7;   // every made field has its own hills
const HK = KEYN ? .78 : 1, hillsRaw = (x, z) => 4 + HK * 17 * fbm(x * .011 + 3 + NOX, z * .011 + NOZ) + HK * 8 * fbm(x * .034 + 9 + NOX, z * .034 + NOZ) + Math.max(0, Math.hypot(x, z + 20) - 150) * .5 + clamp((-z - 40) / 150, 0, 1) * 7 + clamp((-x - 40) / 120, 0, 1) * 5;
const genDims = (model) => { try { const e = GEN.entry(model); return e ? [e.dims[0] / U, e.dims[1] / U, e.dims[2] / U] : null; } catch (e) { return null; } };
export const PLAN = GEN ? planMap(MAPKEY, { hills: hillsRaw, salt: SALT, dims: genDims, isVeh: (t) => !!(GEN.TYPES[t] && GEN.TYPES[t].vehicle) }) : null;
export const MAPNAME = PLAN ? PLAN.name : "The refinery", SITES = PLAN ? PLAN.sites : [["A", 100, 14, "Town square"], ["B", -6, -4, "Refinery"], ["C", -95, -20, "Lodge"], ["D", 52, -118, "Ridge relay"], ["E", -34, 86, "Depot"]];
// built ground: [x0, z0, x1, z1, height, how far it takes to blend into the hills]
const ZONES = PLAN ? PLAN.zones : [[-56, -56, 56, 56, 0, 34], [62, -48, 152, 66, 0, 30], [-34, 104, 34, 150, 0, 26], [-34, -190, 34, -146, 2, 26], [-8, 56, 8, 104, 0, 16], [-8, -146, 8, -56, 1, 16], [56, -7, 62, 7, 0, 14], [-112, -36, -80, -6, 9, 22], [36, -134, 66, -108, 17, 18], [-54, 68, -18, 98, 3, 20]];
function zoneW(x, z) { let wm = 0, sw = 0, sh = 0, idx = -1; for (let i = 0; i < ZONES.length; i++) { const Z = ZONES[i], ex = Math.max(Z[0] - x, 0, x - Z[2]), ez = Math.max(Z[1] - z, 0, z - Z[3]); if (ex >= Z[5] || ez >= Z[5]) continue; const d = Math.hypot(ex, ez), w = 1 - sstep(0, Z[5], d); if (w > 0) { sw += w; sh += w * Z[4]; } if (w > wm) { wm = w; idx = i; } } return [wm, sw, sh, idx]; }
function hraw(x, z) { const [wm, sw, sh] = zoneW(x, z); return (sh + (1 - wm) * hillsRaw(x, z)) / (sw + (1 - wm)); }
const HX0 = -220, HZ0 = -250, HW = 441, HD = 461, HM = new Float32Array(HW * HD); for (let j = 0; j < HD; j++) for (let i = 0; i < HW; i++) HM[j * HW + i] = hraw(HX0 + i, HZ0 + j);
export function groundH(x, z) { const fx = clamp(x - HX0, 0, HW - 1.001), fz = clamp(z - HZ0, 0, HD - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * HW + i; return (HM[k] * (1 - u) + HM[k + 1] * u) * (1 - v) + (HM[k + HW] * (1 - u) + HM[k + HW + 1] * u) * v; }
export const wild = (x, z) => 1 - zoneW(x, z)[0];   // 0 on built ground, 1 out in the hills
export const slopeAt = (x, z) => Math.hypot(groundH(x + 1, z) - groundH(x - 1, z), groundH(x, z + 1) - groundH(x, z - 1)) / 2;

if (!PLAN) {
// the refinery yard's walls, with a gate in the middle of each side
for (const s of [-1, 1]) { solid(s * 29, 0, -48, 40, 10, 2, CON); solid(s * 29, 0, 48, 40, 10, 2, CON); solid(-48, 0, s * 28, 2, 10, 38, CON); solid(48, 0, s * 28, 2, 10, 38, CON); }
// drop point
solid(0, 0, 38, 8, .3, 8, STEEL); deco(0, .3, 38, 6.4, .02, 6.4, "#c9733a", false); deco(0, .32, 38, 5.6, .02, 5.6, STEEL, false);
solid(-8, 0, 31, 2, 1.1, 2, DRAB); solid(-10.2, 0, 31, 2.2, 2.2, 2.2, DRAB2); solid(9, 0, 30, 2, 1.1, 2, DRAB2); solid(9, 1.1, 30, 1.4, 1, 1.4, DRAB);
// the canyon and the staggered panels
solid(-3.6, 0, 12, 1.2, 6.5, 22, CON2); solid(3.6, 0, 12, 1.2, 6.5, 22, CON2);
solid(11, 0, -3, 10, 6, .9, CON2); solid(22, 0, -9.5, 10, 6, .9, CON2); solid(33, 0, -3, 10, 6, .9, CON2);
// west workshop
solid(-28, 0, 12, 14, 4, 14, SAND, { cap: "#e4a050" }); solid(-31, 4, 9, 7, 3.2, 7, CON, { stripe: false });
glow(-20.95, 1.4, 9, .1, 1.2, 2.2); glow(-20.95, 1.4, 14.5, .1, 1.2, 2.2); glow(-28, 1.6, 19.05, 3, 1, .1);
solid(-18.5, 0, 20.5, 2.2, 1.2, 2.2, DRAB); solid(-18.5, 0, 17.8, 2, 2.3, 2, DRAB2);
// the tall refinery shed
solid(-27, 0, -26, 18, 7.5, 12, RUST, { cap: "#e4a050" }); solid(-33, 7.5, -27, 3, 6, 3, STEEL, { stripe: false }); solid(-24, 7.5, -28, 2.2, 3.5, 2.2, STEEL, { stripe: false });
glow(-27, 2.6, -19.95, 5, 1.4, .1); glow(-17.95, 3, -26, .1, 1.2, 4);
solid(-15, 0, -17, 2.2, 1.2, 2.2, DRAB2); solid(-12.6, 0, -17.6, 2.2, 2.4, 2.2, DRAB); solid(-15, 1.2, -17, 1.6, 1.1, 1.6, DRAB);
// the landing pad
solid(2, 0, -22, 12, .4, 12, STEEL); deco(2, .4, -22, 10.6, .02, 10.6, "#c9733a", false); deco(2, .42, -22, 9.6, .02, 9.6, STEEL, false); deco(2, .44, -22, 1, .02, 6, "#e2d0ae", false); deco(2, .44, -22, 6, .02, 1, "#e2d0ae", false);
solid(-3, .4, -19, 1.6, 1.2, 1.6, DRAB); solid(7, .4, -25.5, 2.4, 1.2, 1.4, DRAB2);
// the catwalk
solid(6, 5, -38, 34, .5, 4, STEEL); for (const x of [-9, 1, 11, 21]) { solid(x, 0, -39.4, .7, 5, .7, CON, { stripe: false }); solid(x, 0, -36.6, .7, 5, .7, CON, { stripe: false }); }
deco(6, 5.5, -39.9, 34, 1, .12, "#c9733a", false); solid(25.5, 0, -34.5, 2.4, 1.2, 2.4, DRAB); solid(25.5, 1.2, -36.6, 2.4, 2.4, 1.8, DRAB2);
// the stack
solid(34, 0, -30, 7, 13, 7, CON, { cap: "#b0312a" }); solid(34, 0, -24.6, 7, 3.4, 3.8, SAND, { stripe: false }); glow(30.45, 8, -30, .1, 2.4, 1.2); glow(34, 10, -26.45, 1.2, 1.6, .1);
// tanks and cover
solid(36, 0, 14, 6, 5, 6, RUST); solid(36, 0, 24, 6, 5, 6, RUST); solid(28, 0, 19, 2.4, 1.2, 2.4, DRAB); solid(20, 0, 26, 3, 1.3, 1.4, DRAB2); solid(16, 0, 12, 1.4, 1.3, 3.2, DRAB);
solid(-12, 0, -2, 3.2, 1.3, 1.4, DRAB2); solid(-16, 0, 30, 1.4, 1.3, 3.2, DRAB); solid(12, 0, -14, 2.2, 2.2, 2.2, DRAB);
}
// barrels, sandbags, pallets, pipes and tyres
function barrels(x, z, n, cols = [RUST, "#3b4430", "#5f676d"], y = 0) { for (let i = 0; i < n; i++) { const bx = x + (i % 2) * .75 + (R1() - .5) * .1, bz = z + Math.floor(i / 2) * .75; cyl(bx, y, bz, .32, .95, cols[i % cols.length]); cyl(bx, y + .95, bz, .3, .03, "#231d17"); } const nx = Math.min(n, 2), nz = Math.ceil(n / 2); BOXES.push({ min: [x - .35, y - .3, z - .35], max: [x + (nx - 1) * .75 + .35, y + .98, z + (nz - 1) * .75 + .35] }); }
function sandbags(x, z, len, rot, y = 0) { const dx = rot ? 0 : 1, dz = rot ? 1 : 0; for (let r = 0; r < 3; r++) for (let i = 0; i < Math.floor(len / .7) - (r % 2); i++) { const u = -len / 2 + .35 + i * .7 + (r % 2) * .35; deco(x + dx * u, y + r * .3, z + dz * u, rot ? .42 : .66, .3, rot ? .66 : .42, tone("#8f7d5a", .85 + R1() * .25), false); } BOXES.push({ min: [x - (rot ? .25 : len / 2), y - .3, z - (rot ? len / 2 : .25)], max: [x + (rot ? .25 : len / 2), y + .9, z + (rot ? len / 2 : .25)] }); }
if (!PLAN) {
barrels(-21, 22.5, 4); barrels(14, 36, 3); barrels(30, 9, 4); barrels(-40, -14, 2); barrels(8.5, -31, 3); barrels(-9, -30, 2);
sandbags(-7, 22, 4.2, 0); sandbags(10, 5, 3.5, 1); sandbags(-20, -6, 4.2, 0); sandbags(24, -18, 3.5, 0); sandbags(-36, 28, 3.5, 1);
for (const [x, z, n] of [[18, 20, 4], [-30, -8, 3], [40, -12, 5], [-14, 40, 3]]) for (let i = 0; i < n; i++) deco(x + (R1() - .5) * .1, i * .16, z + (R1() - .5) * .1, 1.2, .14, 1, tone("#76634c", .85 + R1() * .3), false);
for (const [x, z, l, r] of [[-41, 2, 9, 1], [-42, 2.4, 7, 1], [22, 42, 10, 0], [40, 2, 6, 1]]) deco(x, 0, z, r ? .3 : l, .3, r ? l : .3, "#5f676d", false);
for (const [x, z, n] of [[26, 30, 3], [-6, -10, 2], [-38, -40, 4]]) for (let i = 0; i < n; i++) cyl(x + (R1() - .5) * .15, i * .22, z + (R1() - .5) * .15, .42, .22, "#231d17", 10);
}
// lamp posts: a pole, an arm, a bulb that throws real light
const BULBS = [];
function lampPost(x, z, dx, dz, color = "#ffc27a", power = 1500, y = 0) { solid(x, y, z, .22, 6, .22, "#2a2724", { stripe: false, base: "#2a2724", cap: "#2a2724" }); deco(x + dx * .7, y + 5.9, z + dz * .7, dx ? 1.5 : .16, .14, dz ? 1.5 : .16, "#2a2724", false);
  const L = lamp(x + dx * 1.3, y + 5.6, z + dz * 1.3, color, power); BULBS.push({ L, at: [x + dx * 1.3, y + 5.72, z + dz * 1.3], s: [.4, .14, .34] }); }
function fireBarrel(x, z, y = 0) { const L = lamp(x, y + 1.6, z, "#ff7a2e", 1300, { flicker: .45 }); cyl(x, y, z, .34, .95, "#332a21"); BOXES.push({ min: [x - .34, y - .3, z - .34], max: [x + .34, y + .95, z + .34] }); BULBS.push({ L, at: [x, y + .95, z], s: [.5, .34, .5], fire: true }); }
if (!PLAN) {
lampPost(-6.5, 30, 1, 0); lampPost(17, -1, 0, 1); lampPost(-19, 4, 0, -1); lampPost(-9, -22, 1, 0); lampPost(26, 36, -1, 0); lampPost(40, -18, -1, 0);
{ const L = lamp(-18.5, 1.6, 23.6, "#ff7a2e", 1300, { flicker: .45 }); cyl(-18.5, 0, 23.6, .34, .95, "#332a21"); BULBS.push({ L, at: [-18.5, .95, 23.6], s: [.5, .34, .5], fire: true }); }
{ const L = lamp(34, 13.6, -30, "#ff3a3a", 2600, { blink: 1.2, reach: 500 }); BULBS.push({ L, at: [34, 13.25, -30], s: [.5, .4, .5] }); deco(34, 13, -30, .3, .3, .3, "#231d17", false); }

}
/* ---------- the ground: dirt, a cracked road, concrete aprons ---------- */
/* ---------- beyond the yard: a town to the east, a lodge in the forest, a relay on the ridge, a depot ---------- */
const R3 = seeded(777);
function building(x, z, w, h, d, col) { solid(x, 0, z, w, h, d, col, { cap: "#3c4046", stripe: false });
  for (let y = 1.6; y < h - 1; y += 3) { for (let u = -w / 2 + 2; u < w / 2 - 1; u += 3.2) if (R3() < .5) glow(x + u, y, z + d / 2 + .04, 1.1, 1.3, .08); for (let u = -d / 2 + 2; u < d / 2 - 1; u += 3.2) if (R3() < .35) glow(x + w / 2 + .04, y, z + u, .08, 1.3, 1.1); if (R3() < .5) glow(x - w / 2 - .04, y, z + (R3() - .5) * (d - 3), .08, 1.3, 1.1); } }
if (!PLAN) {
for (const [x, z, w, h, d] of [[74, -34, 14, 9, 12], [74, -14, 14, 6, 14], [76, 34, 16, 12, 14], [74, 54, 12, 7, 10], [100, -36, 18, 8, 10], [100, 46, 18, 14, 12], [124, -32, 14, 12, 14], [126, -8, 12, 7, 16], [124, 30, 16, 9, 12], [122, 52, 12, 6, 10], [143, -20, 10, 10, 18], [143, 12, 10, 7, 22], [143, 44, 10, 12, 14]])
  building(x, z, w, h, d, [SAND, CON, CON2, "#8a6f5a", "#6f7a80"][Math.floor(R3() * 5)]);
solid(100, 0, 10, 3, 1.2, 3, CON2); solid(100, 1.2, 10, 1.2, 2.6, 1.2, STEEL, { stripe: false });
for (const [x, z, l, r] of [[92, 2, 5, 0], [108, 18, 5, 0], [90, 18, 4, 1], [110, 2, 4, 1], [86, -22, 5, 0], [112, -20, 4, 1], [88, 40, 5, 1], [112, 38, 5, 0], [134, 8, 4, 1], [66, 10, 5, 1], [66, -8, 4, 0]]) solid(x, 0, z, r ? .5 : l, 1.1, r ? l : .5, CON);
for (const [x, z] of [[96, 24], [104, -4], [84, 8], [116, 10], [66, -20], [132, -44], [136, 60], [90, -4], [112, 26]]) { solid(x, 0, z, 1.6, 1.2, 1.6, DRAB); if (R3() < .5) solid(x + 1.7, 0, z + .2, 1.4, 1.1, 1.4, DRAB2); }
{ const y = 9; solid(-100, y, -26, 9, 4, 6, "#5c4030", { stripe: false, cap: "#463a2d", base: "#463a2d" }); solid(-88, y, -12, 6, 3.4, 5, "#634a34", { stripe: false, cap: "#463a2d", base: "#463a2d" }); solid(-107, y, -10, 2, 9, 2, "#463a2d", { stripe: false, base: "#463a2d" }); glow(-100, y + 1.4, -22.95, 2, 1, .08); glow(-88, y + 1.2, -9.45, 1.4, 1, .08);
  for (const [x, z, l, r] of [[-94, -18, 4, 0], [-90, -28, 3, 1], [-102, -16, 3, 0], [-84, -22, 3, 1], [-96, -8, 3, 0], [-106, -30, 3, 1]]) solid(x, y, z, r ? .8 : l, 1, r ? l : .8, "#5a4230"); }
{ const y = 17; solid(46, y, -126, 7, 3.2, 6, CON, { stripe: false }); solid(58, y, -116, .5, 16, .5, STEEL, { stripe: false, base: STEEL, cap: "#b0312a" }); glow(58, y + 16, -116, .7, .7, .7); glow(49.55, y + 1.2, -126, .08, 1, 2);
  for (const [x, z] of [[50, -114], [56, -124], [42, -116], [60, -110], [44, -130]]) solid(x, y, z, 1.6, 1.2, 1.6, DRAB); }
{ const y = 3; solid(-45, y, 76, 12, 6, 9, RUST, { cap: "#e4a050" }); glow(-38.95, y + 1.6, 76, .08, 1.2, 3);
  for (const [x, z, r, c] of [[-30, 80, 0, "#3f6f9a"], [-27, 90, 1, RUST], [-40, 92, 0, DRAB], [-23, 73, 1, "#5f676d"], [-34, 71, 0, "#c9733a"]]) solid(x, y, z, r ? 2.4 : 6, 2.6, r ? 6 : 2.4, c, { stripe: false }); for (const [x, z] of [[-36, 84], [-28, 96], [-22, 82]]) solid(x, y, z, 1.6, 1.2, 1.6, DRAB2); }
}
for (const [x, z, y] of [[-10, 112, 0], [10, 112, 0], [0, 108, 0], [-18, 120, 0], [18, 120, 0], [-12, -150, 2], [12, -150, 2], [2, -146, 2], [-18, -160, 2], [18, -160, 2]]) solid(x, y, z, 4, 1.1, .6, CON);
const roofGeos = [];
// a made field: every piece the plan wrote down, stood on the ground where it falls
if (PLAN) for (const p of PLAN.prims) { const k = p[0], x = p[1], z = p[2], y = groundH(x, z);
  if (k === "s" && p[7] && p[7].roof) { BOXES.push({ min: [x - p[3] / 2, y + p[8], z - p[5] / 2], max: [x + p[3] / 2, y + p[8] + p[4], z + p[5] / 2] }); roofGeos.push(boxGeo(p[3], p[4], p[5], x, y + p[8], z, p[6])); }
  else if (k === "d" && p[8]) roofGeos.push(boxGeo(p[3], p[4], p[5], x, y + p[7], z, p[6], true));
  else if (k === "s") { const sink = p[8] ? 0 : .15; solid(x, y + p[8] - sink, z, p[3], p[4] + sink, p[5], p[6], p[7]); } else if (k === "d") deco(x, y + p[7], z, p[3], p[4], p[5], p[6], true); else if (k === "g") glow(x, y + p[6], z, p[3], p[4], p[5]);
  else if (k === "sb") sandbags(x, z, p[3], p[4], y - .05); else if (k === "br") barrels(x, z, p[3], undefined, groundH(x + .4, z + .8) - .05); else if (k === "ct") { cyl(x, y - .15, z, p[3], p[4] + .15, p[5], 12); cyl(x, y + p[4], z, p[3] * .8, .12, "#3c4046", 12); BOXES.push({ min: [x - p[3] * .8, y - .3, z - p[3] * .8], max: [x + p[3] * .8, y + p[4], z + p[3] * .8] }); }
  else if (k === "li") { lamp(x, y + p[3], z, "#ffd9a0", 1100); glow(x, y + p[3] + .35, z, .9, .12, .9); }
  else if (k === "lp") lampPost(x, z, p[3], p[4], undefined, undefined, y - .1); else if (k === "fb") fireBarrel(x, z, y - .05); }
// the land itself
{ const N = 176, M = 184, g = new THREE.PlaneGeometry(440, 460, N, M).rotateX(-Math.PI / 2).translate(0, 0, -20).toNonIndexed(); g.deleteAttribute("uv"); const P = g.attributes.position, a = new Float32Array(P.count * 3), c2 = new THREE.Color();
  const grass = ["#4f5a3c", "#5c6a40", "#66704a", "#55603a", "#4a5636"], rock = ["#6f6a62", "#7a756c", "#625d56"];
  for (let i = 0; i < P.count; i++) P.setY(i, groundH(P.getX(i), P.getZ(i)) - .04);
  for (let q = 0; q < P.count / 6; q++) { const i = q * 6, x = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2) + P.getX(i + 4)) / 4, z = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2) + P.getZ(i + 4)) / 4, [wm, , , idx] = zoneW(x, z), h = groundH(x, z), s = slopeAt(x, z), n = noise2(x * .09, z * .09), n2 = noise2(x * .4 + 40, z * .4);
    const sf = PLAN && PLAN.surface(x, z, n, n2);
    if (sf) _c.set(sf);
    else if (!PLAN && idx === 1 && wm > .97) { _c.set(n2 > .75 ? "#33302e" : n > .5 ? "#454240" : "#3e3b39"); }
    else if (!PLAN && idx >= 4 && idx <= 6 && wm > .7) _c.set(n2 > .6 ? "#5c4c3a" : "#6c5a44");
    else if (wm > .9 && (!PLAN || Math.abs(x) < 34)) _c.set(!PLAN && idx >= 7 ? (n > .5 ? "#6a6458" : "#5e584c") : n > .5 ? "#64533f" : "#5c4c3a");
    else if (s > .8) _c.set(rock[Math.floor(n2 * 2.99)]);
    else if (h > 27 + n * 6) _c.set(n2 > .3 ? "#cfd4d8" : "#aab0b6");
    else { _c.set(grass[Math.floor(n * 4.99)]); if (n2 > .7) _c.lerp(c2.set("#7a7448"), .5); if (s > .55) _c.lerp(c2.set(rock[0]), .4); }
    _c.multiplyScalar(.92 + hash2(x * 3.1, z * 2.7) * .16); for (let k = 0; k < 6; k++) a.set([_c.r, _c.g, _c.b], (i + k) * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3)); g.computeVertexNormals(); geos.push(g); }

const APRONS = [[-36, 4, -20, 20], [-37, -33, -17, -19], [29, -35, 39, -22], [32, 10, 40, 28], [-5, -29, 9, -15], [-5, 33, 5, 43]];
const inApron = (x, z) => APRONS.some(([x0, z0, x1, z1]) => x > x0 - 1.5 && x < x1 + 1.5 && z > z0 - 1.5 && z < z1 + 1.5);
const isRoad = (x, z) => Math.abs(x) < 4.6 && z > -14 && z < 33;
export const isDirt = (x, z) => (PLAN ? PLAN.soft(x, z) : !inApron(x, z) && !isRoad(x, z) && Math.abs(x) < 46 && Math.abs(z) < 46);
if (!PLAN) { const N = 208, g = new THREE.PlaneGeometry(104, 104, N, N).rotateX(-Math.PI / 2).toNonIndexed(); g.deleteAttribute("uv"); const P = g.attributes.position, a = new Float32Array(P.count * 3), dirt = ["#5c4c3a", "#64533f", "#6c5a44", "#544636", "#4f4434"];
  for (let q = 0; q < P.count / 6; q++) { const i = q * 6, x = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2) + P.getX(i + 4)) / 4, z = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2) + P.getZ(i + 4)) / 4, n = noise2(x * .13, z * .13), n2 = noise2(x * .5 + 40, z * .5), sp = .93 + hash2(x * 3.1, z * 2.7) * .14;
    if (isRoad(x, z)) { _c.set(n2 > .72 ? "#33302e" : n > .55 ? "#454240" : "#3e3b39"); if (Math.abs(x) < .3 && Math.floor((z + 60) / 1.5) % 3 === 0 && n2 < .8) _c.set("#b9a582"); if (Math.abs(Math.abs(x) - 4.2) < .2 && n2 < .6) _c.set("#7d7a72"); }
    else if (inApron(x, z)) { _c.set(n > .6 ? "#6f6d68" : "#66645f"); const fx = Math.abs(x - Math.round(x / 4) * 4), fz = Math.abs(z - Math.round(z / 4) * 4); if (fx < .3 || fz < .3) _c.multiplyScalar(.8); if (n2 > .8) _c.multiplyScalar(.86); }
    else { _c.set(dirt[Math.floor(n * 4.99)]); if (n2 > .66) _c.lerp(new THREE.Color("#6a6842"), .5); if (n < .22) _c.multiplyScalar(.88); }
    _c.multiplyScalar(sp); for (let k = 0; k < 6; k++) a.set([_c.r, _c.g, _c.b], (i + k) * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3)); geos.push(g); }

// a made field: a finer sheet of ground over every built place, so streets, kerbs and crop rows read
if (PLAN) for (const [cx, cz, r] of PLAN.yards) { const N = Math.round(2 * r / .75), g = new THREE.PlaneGeometry(2 * r, 2 * r, N, N).rotateX(-Math.PI / 2).translate(cx, 0, cz).toNonIndexed(); g.deleteAttribute("uv"); const P = g.attributes.position, a = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) P.setY(i, groundH(P.getX(i), P.getZ(i)));
  for (let q = 0; q < P.count / 6; q++) { const i = q * 6, x = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2) + P.getX(i + 4)) / 4, z = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2) + P.getZ(i + 4)) / 4, n = noise2(x * .13, z * .13), n2 = noise2(x * .5 + 40, z * .5);
    _c.set(PLAN.surface(x, z, n, n2) || "#5c4c3a"); if (n < .22) _c.multiplyScalar(.9); _c.multiplyScalar(.93 + hash2(x * 3.1, z * 2.7) * .14); for (let k = 0; k < 6; k++) a.set([_c.r, _c.g, _c.b], (i + k) * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3)); g.computeVertexNormals(); geos.push(g); }

const world = new THREE.Mesh(mergeGeometries(geos), flatToon); world.scale.setScalar(U); world.castShadow = world.receiveShadow = true; scene.add(world);
export const ROOFS = roofGeos.length ? new THREE.Mesh(mergeGeometries(roofGeos), flatToon) : null; if (ROOFS) { ROOFS.scale.setScalar(U); ROOFS.castShadow = ROOFS.receiveShadow = true; scene.add(ROOFS); }   // the roofs of the objective halls, hidden when you look down from the battle map
{ const m = new THREE.Mesh(mergeGeometries(glowGeos), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 1.8, .7) })); m.scale.setScalar(U); scene.add(m); }
for (const b of BULBS) { const m = new THREE.Mesh(new THREE.BoxGeometry(b.s[0] * U, b.s[1] * U, b.s[2] * U), new THREE.MeshBasicMaterial({ color: "#ffd9a0" })); m.position.set(b.at[0] * U, b.at[1] * U, b.at[2] * U); scene.add(m); b.L.bulb = m; b.L.fire = !!b.fire; }

// sky: a dusk dome with a ringed giant, carried along with the camera
const sky = new THREE.Group(); sky.scale.setScalar(U); scene.add(sky);
{ const g = new THREE.SphereGeometry(600, 24, 14), a = [], P = g.attributes.position, stops = [[-.2, "#7c3a1e"], [0, "#d98a4a"], [.08, "#b0603a"], [.28, "#6a3a4a"], [.55, "#3e3a62"], [1, "#1a1826"]], c2 = new THREE.Color();
  for (let i = 0; i < P.count; i++) { const t = P.getY(i) / 600; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++; _c.set(stops[k][1]); c2.set(stops[k + 1][1]); _c.lerp(c2, clamp((t - stops[k][0]) / (stops[k + 1][0] - stops[k][0]), 0, 1)); a.push(_c.r, _c.g, _c.b); }
  g.setAttribute("color", new THREE.Float32BufferAttribute(a, 3)); sky.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const giant = new THREE.Group(); giant.position.set(-300, 225, -420); giant.scale.setScalar(1.5); giant.lookAt(0, 0, 0);
  giant.add(new THREE.Mesh(new THREE.CircleGeometry(56, 40), new THREE.MeshBasicMaterial({ color: "#c9b392" })));
  for (const [y, w, h, c] of [[11, 100, 8, "#ad9677"], [-17, 84, 5, "#917b5f"], [30, 70, 4, "#b9a582"]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c })); m.position.set(0, y, .5); giant.add(m); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(72, 90, 48), new THREE.MeshBasicMaterial({ color: "#f4ead2", side: THREE.DoubleSide })); ring.rotation.x = 1.25; ring.rotation.y = .3; giant.add(ring);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.4, 1) })); sunDisc.position.copy(sun.position).normalize().multiplyScalar(585); sunDisc.scale.setScalar(1.5); sunDisc.lookAt(0, 0, 0); sky.add(sunDisc);
  sky.add(giant); }

/* ---------- collision helpers (metres) ---------- */
export function hitsBox(x, y, z, h, b, r) { return x + r > b.min[0] && x - r < b.max[0] && y + h > b.min[1] && y < b.max[1] && z + r > b.min[2] && z - r < b.max[2]; }
// the boxes are kept in eight-metre squares, so a look-up or a ray only meets the few that are near it
const HC = 8, HNX = 56, HNZ = 60, HOX = -224, HOZ = -256; let hashN = -1, HASH = [], stamp = 0;
function ensure() { if (hashN === BOXES.length) return; hashN = BOXES.length; HASH = Array.from({ length: HNX * HNZ }, () => []);
  for (const b of BOXES) { b._s = 0; const i0 = clamp(Math.floor((b.min[0] - HOX) / HC), 0, HNX - 1), i1 = clamp(Math.floor((b.max[0] - HOX) / HC), 0, HNX - 1), j0 = clamp(Math.floor((b.min[2] - HOZ) / HC), 0, HNZ - 1), j1 = clamp(Math.floor((b.max[2] - HOZ) / HC), 0, HNZ - 1); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) HASH[j * HNX + i].push(b); } }
export function boxesNear(x, z, r) { ensure(); const i0 = clamp(Math.floor((x - r - HOX) / HC), 0, HNX - 1), i1 = clamp(Math.floor((x + r - HOX) / HC), 0, HNX - 1), j0 = clamp(Math.floor((z - r - HOZ) / HC), 0, HNZ - 1), j1 = clamp(Math.floor((z + r - HOZ) / HC), 0, HNZ - 1);
  if (i0 === i1 && j0 === j1) return HASH[j0 * HNX + i0]; const out = []; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const b of HASH[j * HNX + i]) out.push(b); return out; }
export function free(x, y, z, h, r = .35) { for (const b of boxesNear(x, z, r)) if (hitsBox(x, y, z, h, b, r)) return false; return true; }
// free of boxes when standing on the ground at this spot
export const freeG = (x, z, h, r = .35, lift = .1) => free(x, groundH(x, z) + lift, z, h, r);
export function rayBox(o, d, mn, mx, maxT) { let t0 = 0, t1 = maxT;
  for (let i = 0; i < 3; i++) { const oi = o.getComponent(i), di = d.getComponent(i);
    if (Math.abs(di) < 1e-8) { if (oi < mn[i] || oi > mx[i]) return Infinity; }
    else { let a = (mn[i] - oi) / di, b = (mx[i] - oi) / di; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; } }
  return t0; }
export function rayWorld(o, d, maxT, land = true) { ensure(); let best = maxT; const st = ++stamp, x = (o.x - HOX) / HC, z = (o.z - HOZ) / HC; let i = Math.floor(x), j = Math.floor(z);
  const si = d.x > 0 ? 1 : -1, sj = d.z > 0 ? 1 : -1, dx = Math.abs(d.x) < 1e-9 ? 1e12 : HC / Math.abs(d.x), dz = Math.abs(d.z) < 1e-9 ? 1e12 : HC / Math.abs(d.z); let tx = (d.x > 0 ? i + 1 - x : x - i) * dx, tz = (d.z > 0 ? j + 1 - z : z - j) * dz;
  for (let n = 0; n < 160; n++) { if (i >= 0 && j >= 0 && i < HNX && j < HNZ) for (const b of HASH[j * HNX + i]) { if (b._s === st) continue; b._s = st; const h = rayBox(o, d, b.min, b.max, best); if (h < best) best = h; }
    if (Math.min(tx, tz) > best) break; if (tx < tz) { tx += dx; i += si; } else { tz += dz; j += sj; } }
  if (land) for (let s = 1.5; s < best + 2.5; s += 2.5) { const q = Math.min(s, best); if (o.y + d.y * q < groundH(o.x + d.x * q, o.z + d.z * q)) { let a = Math.max(0, s - 2.5), b = q; for (let k = 0; k < 5; k++) { const m = (a + b) / 2; if (o.y + d.y * m < groundH(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } best = Math.min(best, b); break; } if (q >= best) break; }
  return best; }

/* ---------- the Table's own pieces: buildings and machines, soldiers, growing things, weather ---------- */
export const SOL = window.RevelrySoldiers(THREE, { mergeGeometries, RoundedBoxGeometry, material: charMat, scene, fx: {
  tracer: (a, b) => tracer(a, b, "#ff8a5a"),
  impact: (p, from) => { const d = from.clone().sub(p).normalize(); flash(p.clone().addScaledVector(d, 2), "#ffd28a", 420, .08);
    puff(p, { n: 7, color: "#ffe9b0", hot: 3, size: 2, life: .22, grav: -170, vel: () => d.clone().multiplyScalar(30 + rnd() * 50).add(V3((rnd() - .5) * 70, rnd() * 50, (rnd() - .5) * 70)) });
    puff(p, { n: 3, color: "#a09684", dark: true, opacity: .4, size: 3, life: .7, grow: 1.8, drag: 3, vel: () => d.clone().multiplyScalar(10).add(V3((rnd() - .5) * 12, 6, (rnd() - .5) * 12)) }); },
  muzzle: (p, d) => { flash(p.clone().addScaledVector(d, 3), "#ffc477", 1500, .09);
    puff(p.clone().addScaledVector(d, 1), { n: 9, color: "#ffe6a8", hot: 3.4, size: 4, life: .07, vel: () => d.clone().multiplyScalar(50 + rnd() * 70).add(V3((rnd() - .5) * 24, (rnd() - .5) * 24, (rnd() - .5) * 24)) });
    puff(p.clone().addScaledVector(d, 3), { n: 6, color: "#8f8a80", dark: true, opacity: .3, size: 4, life: 1.6, grow: 2.2, drag: 2.6, vel: () => d.clone().multiplyScalar(14 + rnd() * 22).add(V3((rnd() - .5) * 9, 5 + rnd() * 9, (rnd() - .5) * 9)) }); },
  casing: (p, d) => puff(p, { n: 1, color: "#e4a050", size: 2, life: .7, grav: -160, vel: () => d.clone().multiplyScalar(30).add(V3(0, 30, 0)) }),
  blood: (p, d) => puff(p, { n: 10, color: "#7a1f1e", dark: true, size: 3, life: .6, grav: -120, vel: () => d.clone().multiplyScalar(30).add(V3((rnd() - .5) * 30, rnd() * 30, (rnd() - .5) * 30)) }),
  dust: (p) => puff(p.clone().setY((p.y || 0) + 1), { n: 2, color: "#ad9677", dark: true, opacity: .35, size: 3, life: .35, drag: 3, vel: () => V3((rnd() - .5) * 16, 4, (rnd() - .5) * 16) }),
} });
SOL.setGround((x, z) => groundH(x / U, z / U) * U);
for (const b of BOXES) { const gb = groundH((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2), top = b.max[1] - gb; if (Math.abs(b.min[1] - gb) < .45 && top > .5) (top >= .8 && top <= 2.6 && b.max[0] - b.min[0] < 8 && b.max[2] - b.min[2] < 8 ? SOL.addCover : SOL.addSolid)({ x: (b.min[0] + b.max[0]) / 2 * U, z: (b.min[2] + b.max[2]) / 2 * U, yaw: 0, w: (b.max[0] - b.min[0]) / 2 * U, d: (b.max[2] - b.min[2]) / 2 * U, h: top * U }); }

// machines (the Table's rigs and animations): the shim below is the little of the Table that machines.js asks for
const pieces = new Map();
const T = { scene: fxScene, pieces, sfx() {}, heightAt: () => 0, baseY: (d) => d.y ?? 0, puff, ringFx, flareFx, chunksFx, canvas: renderer.domElement, canMove: () => true, refresh() {}, quake() {}, toast() {}, spawn() {}, threats: () => [], aimAt() {},
  game: { send: (topic, data) => { if (topic === "fx" && data.kind === "mach" && MACH) MACH.fx(data, true); } },
  put: (id, d) => { const p = pieces.get(id); if (!p) return; p.data = d; p.group.position.set(d.x, d.y ?? 0, d.z); p.group.rotation.y = d.rot || 0; MACH.sync(p, d); } };
export const MACH = GEN && window.RevelryMachines ? window.RevelryMachines(THREE, GEN, T) : null;
// a machine's own material, marked as a figure for the pixel pass (its alpha says so)
function figureMat(m) { if (!m || m.userData.mfFig || Array.isArray(m)) return; m.userData.mfFig = true; const was = m.onBeforeCompile, wk = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) { if (was) was.call(m, sh, r); sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, "  gl_FragColor.a = 0.5;\n}"); };
  m.customProgramCacheKey = function () { return (wk ? wk.call(m) : "") + "|mfFig"; }; m.needsUpdate = true; }
export function placeMachine(id, model, x, z, rot) {
  const group = new THREE.Group(); group.userData.id = id; group.position.set(x, 0, z); group.rotation.y = rot; scene.add(group);
  const e = GEN.entry(model), still = new THREE.Mesh(GEN.geo(e.variants.timber), genToon); still.layers.set(2); group.add(still);
  const data = { kind: "building", model, x, z, rot, variant: "timber", level: 1 }, p = { group, data, parts: { grounds: { timber: still }, floors: [] } };
  pieces.set(id, p); MACH.sync(p, data);
  const R = MACH.rigs.get(id); if (R) R.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; figureMat(o.material); } });
  return { p, R, group };
}
export function removeMachine(id) { const p = pieces.get(id); if (!p) return; scene.remove(p.group); pieces.delete(id); }
export const mfx = (o) => { try { T.game.send("fx", { kind: "mach", ...o }); } catch (e) { console.warn("[machine]", e); } };
// one of the Table's generated models as a thing that can be moved about (the battle's trucks)
export function genModel(model, state = "timber") { const en = GEN.entry(model), grp = new THREE.Group(), add = (key, dx, dy, dz) => { const m = new THREE.Mesh(GEN.geo(key), genToon); m.position.set(dx, dy, dz); m.castShadow = m.receiveShadow = true; figureMat; grp.add(m); };
  add(en.variants[state] || en.variants.timber, 0, 0, 0); (en.floors || []).forEach((_, i) => add(GEN.floorKey(model, state, i), en.shift[i][0], en.stack[i], en.shift[i][1])); return grp; }
// wrecks: the Table's vehicles, standing where they stopped
function placeGen(model, state, x, z, rot) { try {
  const e = GEN.entry(model), grp = new THREE.Group(); grp.position.set(x * U, 0, z * U); grp.rotation.y = rot;
  const add = (key, dx, dy, dz) => { const m = new THREE.Mesh(GEN.geo(key), genToon); m.position.set(dx, dy, dz); m.castShadow = m.receiveShadow = true; grp.add(m); };
  add(e.variants[state] || e.variants.timber, 0, 0, 0); (e.floors || []).forEach((_, i) => add(GEN.floorKey(model, state, i), e.shift[i][0], e.stack[i], e.shift[i][1]));
  scene.add(grp); grp.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(grp);
  BOXES.push({ min: [bx.min.x / U + .15, 0, bx.min.z / U + .15], max: [bx.max.x / U - .15, Math.max(.6, bx.max.y / U - .1), bx.max.z / U - .15] });
  SOL.addCover({ x: (bx.min.x + bx.max.x) / 2, z: (bx.min.z + bx.max.z) / 2, yaw: 0, w: (bx.max.x - bx.min.x) / 2 - 2, d: (bx.max.z - bx.min.z) / 2 - 2, h: Math.min(40, bx.max.y) });
} catch (e) { console.warn("[wreck]", model, e); } }
// a made field's buildings, structures and vehicles. A building's shape is read off its own triangles into columns of
// boxes a metre square, so a roof can be stood on, a ruin can be walked into and a gap in a wall is a gap.
const GENGEO = new Map();
function columns(mesh, y0) { const bb = new THREE.Box3().setFromObject(mesh), x0 = Math.floor(bb.min.x / U), z0 = Math.floor(bb.min.z / U), nx = Math.ceil(bb.max.x / U) - x0, nz = Math.ceil(bb.max.z / U) - z0, hi = new Float32Array(nx * nz).fill(-1), lo = new Float32Array(nx * nz).fill(99);
  const P = mesh.geometry.attributes.position, I = mesh.geometry.index, n = I ? I.count : P.count, m = mesh.matrixWorld.elements, v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let t = 0; t < n; t += 3) { for (let k = 0; k < 3; k++) { const i = I ? I.getX(t + k) : t + k, px = P.getX(i), py = P.getY(i), pz = P.getZ(i); v[k * 3] = (m[0] * px + m[4] * py + m[8] * pz + m[12]) / U - x0; v[k * 3 + 1] = (m[1] * px + m[5] * py + m[9] * pz + m[13]) / U - y0; v[k * 3 + 2] = (m[2] * px + m[6] * py + m[10] * pz + m[14]) / U - z0; }
    const ax = v[0], ay = v[1], az = v[2], bx = v[3], by = v[4], bz = v[5], cx = v[6], cy = v[7], cz = v[8], i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(nx - 1, Math.floor(Math.max(ax, bx, cx))), j0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), j1 = Math.min(nz - 1, Math.floor(Math.max(az, bz, cz)));
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz), top = Math.max(ay, by, cy), bot = Math.min(ay, by, cy), flat = Math.abs(det) < .02;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { let y = top, yl = bot; if (!flat) { const px = i + .5, pz = j + .5, l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det, l3 = 1 - l1 - l2; if (l1 < -.05 || l2 < -.05 || l3 < -.05) continue; y = yl = clamp(l1 * ay + l2 * by + l3 * cy, bot, top); }
      const k = j * nx + i; if (y > hi[k]) hi[k] = y; if (yl < lo[k]) lo[k] = yl; } }
  let prev = []; const made = []; for (let j = 0; j < nz; j++) { const row = []; for (let i = 0; i < nx; i++) { const k = j * nx + i; if (hi[k] < .45 || lo[k] > 2.3) continue; const h = Math.max(.5, Math.round(hi[k] * 2) / 2); let e = i; while (e + 1 < nx && hi[j * nx + e + 1] >= .45 && lo[j * nx + e + 1] <= 2.3 && Math.max(.5, Math.round(hi[j * nx + e + 1] * 2) / 2) === h) e++;
      const old = prev.find((q) => q.i === i && q.e === e && q.h === h); if (old) { old.b.max[2] = z0 + j + 1; row.push(old); } else { const b = { min: [x0 + i, y0 - .4, z0 + j], max: [x0 + e + 1, y0 + h, z0 + j + 1] }; BOXES.push(b); made.push([b, h]); row.push({ i, e, h, b }); } i = e; } prev = row; }
  for (const [b, h] of made) (h >= .8 && h <= 2.6 && b.max[0] - b.min[0] < 8 && b.max[2] - b.min[2] < 8 ? SOL.addCover : SOL.addSolid)({ x: (b.min[0] + b.max[0]) / 2 * U, z: (b.min[2] + b.max[2]) / 2 * U, yaw: 0, w: (b.max[0] - b.min[0]) / 2 * U, d: (b.max[2] - b.min[2]) / 2 * U, h: h * U }); }
function placePlan(q) { try { const e = GEN.entry(q.model), y = groundH(q.x, q.z) - (q.kind === "v" ? 0 : .08), key = q.model + "|" + q.state; let geo = GENGEO.get(key);
  if (!geo) { const parts = [GEN.geo(e.variants[q.state] || e.variants.timber)]; (e.floors || []).forEach((_, i) => parts.push(GEN.geo(GEN.floorKey(q.model, q.state, i)))); const live = parts.filter((g) => g && g.attributes.position && g.attributes.position.count); geo = live.length > 1 ? mergeGeometries(live) || live[0] : live[0]; GENGEO.set(key, geo); }
  if (!geo) return; const m = new THREE.Mesh(geo, genToon); m.position.set(q.x * U, y * U, q.z * U); m.rotation.y = q.rot; m.castShadow = m.receiveShadow = true; scene.add(m); m.updateMatrixWorld(true);
  const bx = new THREE.Box3().setFromObject(m), cxm = (bx.min.x + bx.max.x) / 2, czm = (bx.min.z + bx.max.z) / 2, top = bx.max.y / U;
  if (q.kind === "v") { BOXES.push({ min: [bx.min.x / U + .15, y - .3, bx.min.z / U + .15], max: [bx.max.x / U - .15, Math.max(y + .6, top - .1), bx.max.z / U - .15] }); SOL.addCover({ x: cxm, z: czm, yaw: 0, w: Math.max(4, (bx.max.x - bx.min.x) / 2 - 2), d: Math.max(4, (bx.max.z - bx.min.z) / 2 - 2), h: Math.min(40, bx.max.y - y * U) }); }
  else if (q.kind === "t") { if (q.core) { BOXES.push({ min: [q.x - q.core, y - .3, q.z - q.core], max: [q.x + q.core, top, q.z + q.core] }); SOL.addSolid({ x: q.x * U, z: q.z * U, yaw: 0, w: q.core * U, d: q.core * U, h: 80 }); } }
  else columns(m, y);
} catch (err) { console.warn("[map]", q.model, err); } }
if (PLAN) { const t0 = performance.now(); for (const q of PLAN.gens) placePlan(q); console.log("[map] " + MAPKEY + ": " + PLAN.gens.length + " pieces, " + GENGEO.size + " shapes, " + BOXES.length + " boxes, " + Math.round(performance.now() - t0) + " ms"); }
else if (GEN) { placeGen("gen:humvee:c1", "damaged", -12, 26, 0); placeGen("gen:sedan:a1", "ruined", 21, 2, Math.PI / 2); placeGen("gen:pickup:b1", "damaged", -22, -12, Math.PI / 2); placeGen("gen:sedan:e5", "ruined", 14, -40, 0); placeGen("gen:sedan:b3", "ruined", 88, 14, .0); placeGen("gen:pickup:c2", "damaged", 112, -12, Math.PI / 2); placeGen("gen:humvee:a4", "damaged", 132, 22, 0); placeGen("gen:sedan:d1", "ruined", 68, 44, Math.PI / 2); }

// growing things: trees, brush, rocks, logs and a few thousand blades of grass, all moving in the wind
export const NAT = window.CBNature ? window.CBNature(THREE, { leafMat, flatToon }) : null;
if (NAT) { const R2 = seeded(9173), clear = (x, z, r) => free(x, groundH(x, z) + .05, z, 1.5, r) && (PLAN || Math.hypot(x, z - 38) > 6);
  const YARDS = PLAN ? PLAN.yards : [[0, 0, 45]], YA = YARDS.reduce((t, y) => t + y[2] * y[2], 0), inYard = () => { let k = R2() * YA, y = YARDS[0]; for (const q of YARDS) { k -= q[2] * q[2]; if (k <= 0) { y = q; break; } } return [y[0] + (R2() - .5) * 2 * y[2], y[1] + (R2() - .5) * 2 * y[2]]; }, BIG = PLAN ? 4 : 1;
  // Scattered growth is gathered and drawn as one mesh per material (a few hundred small meshes each cost a draw in every pass otherwise).
  const HEAP = new Map(), M4h = new THREE.Matrix4(), Qh = new THREE.Quaternion(), UPh = V3(0, 1, 0), ONE = V3(1, 1, 1);
  const put = (geo, mat, x, z, rot = 0, cast = true, dy = 0) => { if (!geo) return; const g = geo.clone(); g.applyMatrix4(M4h.compose(V3(x * U, (groundH(x, z) + dy) * U, z * U), Qh.setFromAxisAngle(UPh, rot), ONE)); const k = mat.uuid + (cast ? "c" : "n"); if (!HEAP.has(k)) HEAP.set(k, { mat, cast, geos: [] }); HEAP.get(k).geos.push(g); };
  const heapOut = () => { for (const h of HEAP.values()) { let merged = null; try { merged = mergeGeometries(h.geos); } catch (e) {} for (const g of merged ? [merged] : h.geos) { const m = new THREE.Mesh(g, h.mat); m.castShadow = h.cast; m.receiveShadow = true; m.frustumCulled = false; if (h.cast && h.mat !== flatToon) m.customDepthMaterial = NAT.depth(); if (h.mat === NAT.leafSway) m.layers.set(3); scene.add(m); } if (merged) for (const g of h.geos) g.dispose(); } HEAP.clear(); };
  for (const [sp, x, z, sc] of PLAN ? PLAN.trees : [["dead", -41, 40, 1], ["pine", 41, 41, 1], ["pine", 43, 34, .8], ["oak", -42, -6, .9], ["dead", 14, 43, .9], ["birch", -43, 22, 1], ["pine", -43, -42, 1], ["dead", 43, -6, 1], ["oak", 20, 31, .75], ["birch", -9, -12, .8], ["dead", -38, -15, .8], ["pine", 44, 4, .9]]) {
    if (!clear(x, z, .6)) continue; const t = NAT.tree(sp, PLAN ? sp + Math.floor(R2() * 5) : sp + x + "|" + z, sc), gh = groundH(x, z); put(t.bark, NAT.barkSway, x, z); put(t.leaves, NAT.leafSway, x, z);
    const r = Math.max(.22, t.trunkR / U); BOXES.push({ min: [x - r, gh - .5, z - r], max: [x + r, gh + 4.5, z + r] }); SOL.addSolid({ x: x * U, z: z * U, yaw: 0, w: r * U, d: r * U, h: 80 }); }
  if (PLAN) PLAN.bushes.forEach(([kind, x, z, sc, dy], i) => { const b = NAT.bush(kind, "pb" + (i % 9), sc); put(b.leaves, NAT.leafSway, x, z, 0, true, dy); put(b.bark, NAT.barkSway, x, z, 0, true, dy); });
  if (PLAN) PLAN.rocks.forEach(([x, z, size], i) => { const o = NAT.rock("pr" + (i % 7), size, .25); put(o.geo, flatToon, x, z, R2() * 6.28); });
  let n = 0, guard = 0; while (n < 26 * BIG && guard++ < 20000) { const [x, z] = inYard(); if (!isDirt(x, z) || !clear(x, z, .9)) continue; n++; const b = NAT.bush(["dry", "dry", "leafy", "nettle", "round", "fern"][Math.floor(R2() * 6)], "b" + (PLAN ? n % 12 : n), .8 + R2() * .5); put(b.leaves, NAT.leafSway, x, z); put(b.bark, NAT.barkSway, x, z); }
  n = 0; guard = 0; while (n < 22 * BIG && guard++ < 20000) { const [x, z] = inYard(); if (!isDirt(x, z) || !clear(x, z, .7)) continue; n++; const k = R2(), o = k < .7 ? NAT.rock("r" + n, 4 + R2() * 9, .25) : k < .85 ? NAT.log("l" + n, .8) : NAT.stump("s" + n, .9); put(o.geo, flatToon, x, z, R2() * 6.28); }
  heapOut();
  // the forest on the hills: a few kinds of tree, each drawn many times over
  { const kinds = [["pine", 1], ["pine", 1.25], ["fir", 1], ["fir", 1.3], ["birch", .9], ["dead", 1], ["pine", .8]], vars = kinds.map(([sp, sc], i) => NAT.tree(sp, "forest" + i, sc)), lists = vars.map(() => []), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = V3(0, 1, 0); let got = 0, tries = 0;
    while (got < 340 && tries++ < 40000) { const x = -205 + R2() * 410, z = -235 + R2() * 430; if (wild(x, z) < .62 || slopeAt(x, z) > .85 || noise2(x * .028 + 50, z * .028) < .36 + R2() * .2 || groundH(x, z) > 30) continue; const k = Math.floor(R2() * vars.length), gh = groundH(x, z); lists[k].push([x, gh, z, R2() * 6.28, .8 + R2() * .5]); got++;
      if (x > WORLD.x0 && x < WORLD.x1 && z > WORLD.z0 && z < WORLD.z1) { const r = .3; BOXES.push({ min: [x - r, gh - 1, z - r], max: [x + r, gh + 5, z + r] }); SOL.addSolid({ x: x * U, z: z * U, yaw: 0, w: r * U, d: r * U, h: 80 }); } }
    vars.forEach((t, k) => { for (const [geo, mat] of [[t.bark, NAT.barkSway], [t.leaves, NAT.leafSway]]) { if (!geo || !lists[k].length) continue; const im = new THREE.InstancedMesh(geo, mat, lists[k].length);
      lists[k].forEach(([x, y, z, rot, sc], i) => { M4.compose(V3(x * U, y * U, z * U), Q.setFromAxisAngle(UP, rot), V3(sc, sc, sc)); im.setMatrixAt(i, M4); }); im.castShadow = im.receiveShadow = true; im.customDepthMaterial = NAT.depth(); im.frustumCulled = false; if (mat === NAT.leafSway) im.layers.set(3); scene.add(im); } });
    const rocks = [0, 1, 2, 3].map((i) => NAT.rock("fr" + i, 7 + i * 4, .35)), rl = rocks.map(() => []); for (let i = 0; i < 150; i++) { const x = -200 + R2() * 400, z = -230 + R2() * 420; if (wild(x, z) < .5) continue; rl[i % 4].push([x, groundH(x, z) - .1, z, R2() * 6.28, .7 + R2() * 1.2]); }
    rocks.forEach((o, k) => { if (!rl[k].length) return; const im = new THREE.InstancedMesh(o.geo, flatToon, rl[k].length); rl[k].forEach(([x, y, z, rot, sc], i) => { M4.compose(V3(x * U, y * U, z * U), Q.setFromAxisAngle(UP, rot), V3(sc, sc, sc)); im.setMatrixAt(i, M4); }); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im); }); }
  // grass grows where the ground is dirt, thicker in patches and along the foot of things
  const spots = { dry: [], tall: [], meadow: [], flowers: [], litter: [] }; let tries = 0, got = 0;
  while (got < 2300 * (PLAN ? 2.4 : 1) && tries++ < 90000) { const [x, z] = inYard(); if (!isDirt(x, z)) continue; const patch = noise2(x * .09 + 7, z * .09 + 3); if (patch < .34 + R2() * .22) continue; if (!free(x, groundH(x, z) + .02, z, .4, .12)) continue;
    const k = noise2(x * .21 + 90, z * .21), kind = k > .82 ? "tall" : k < .25 ? "meadow" : R2() < .05 ? "flowers" : "dry"; spots[kind].push([x * U, groundH(x, z) * U, z * U, .7 + R2() * .8, got]); got++; }
  for (let i = 0, n = 0; i < 30000 && n < 2600; i++) { const x = WORLD.x0 + R2() * 320, z = WORLD.z0 + R2() * 340; if (wild(x, z) < .35 || noise2(x * .07 + 7, z * .07 + 3) < .4 + R2() * .2 || slopeAt(x, z) > .8 || groundH(x, z) > 28) continue; const k = noise2(x * .2 + 90, z * .2); spots[k > .8 ? "tall" : k < .3 ? "meadow" : R2() < .06 ? "flowers" : "dry"].push([x * U, groundH(x, z) * U, z * U, .8 + R2() * .9, 5000 + n]); n++; }
  for (let i = 0; i < 420 * BIG; i++) { const [x, z] = inYard(); if (free(x, groundH(x, z) + .02, z, .4, .1)) spots.litter.push([x * U, groundH(x, z) * U + .5, z * U, 1, i]); }
  for (const kind in spots) { const g = NAT.cover(spots[kind], kind); if (!g) continue; const m = new THREE.Mesh(g, NAT.leafSway); m.scale.y = kind === "litter" ? 1 : .5; m.receiveShadow = true; m.frustumCulled = false; m.layers.set(3); scene.add(m); }
}

// dust in the low light: a loose cloud that stays round the pilot
const MOTE_N = 220, motes = (() => { const g = new THREE.BufferGeometry(), a = new Float32Array(MOTE_N * 3); for (let i = 0; i < MOTE_N; i++) a.set([(rnd() - .5) * 700, 3 + rnd() * 90, (rnd() - .5) * 700], i * 3); g.setAttribute("position", new THREE.BufferAttribute(a, 3));
  const m = fxLayer(new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.1, .7), size: 1, sizeAttenuation: false, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }))); m.frustumCulled = false; scene.add(m); return m; })();
function tickAir(dt, t) { const a = motes.geometry.attributes.position, c = cam.position;
  for (let i = 0; i < MOTE_N; i++) { let x = a.array[i * 3] + (Math.sin(t * .3 + i) * 5 + 9) * dt, y = a.array[i * 3 + 1] + Math.sin(t * .5 + i * 1.7) * 4 * dt, z = a.array[i * 3 + 2] + Math.cos(t * .27 + i * .6) * 5 * dt;
    if (x - c.x > 350) x -= 700; if (x - c.x < -350) x += 700; if (z - c.z > 350) z -= 700; if (z - c.z < -350) z += 700; a.array[i * 3] = x; a.array[i * 3 + 1] = clamp(y, 2, 100); a.array[i * 3 + 2] = z; }
  a.needsUpdate = true;
  for (const L of LAMPS) { let k = 1 + (L.flicker ? L.flicker * (Math.sin(t * 11 + L.ph) * .5 + Math.sin(t * 23.7 + L.ph * 2) * .5) : 0); if (L.blink) k = (t % L.blink) < L.blink * .35 ? 1 : .04; L.l.intensity = L.power * k; if (L.bulb) L.bulb.material.color.copy(L.col).multiplyScalar(L.fire ? 1.6 + k : .4 + 2.6 * k); } }

// weather, the Table's own: it dims the sun and the sky, thickens the haze and fills the air with rain or snow
export const WEATHER = { state: { weather: CFG.weather } };
const wxGroup = new THREE.Group(); scene.add(wxGroup);   // rain and snow are kept over wherever the eye is
if (window.CBWEATHER) window.CBWEATHER.start({ THREE, scene: wxGroup, game: WEATHER, size: () => [100 * U, 100 * U], target: () => cam.position, sun, hemi, post, tod: () => TOD, fxLayer, flash });

/* ---------- drawing a frame ---------- */
const _pv = new THREE.Matrix4(); let frameN = -1;
export function render(t, dt, hurt, cool, fromAbove) { if (ROOFS) ROOFS.visible = !fromAbove;
  tickFx(dt); tickAir(dt, t); if (NAT) NAT.WIND.uTime.value = t;
  sky.position.copy(cam.position); wxGroup.position.set(cam.position.x, Math.max(0, cam.position.y - 120 * U), cam.position.z); cam.updateMatrixWorld();
  const u = post.uniforms; u.time.value = t; u.shaftK.value = fromAbove ? .12 : 1; u.fogMix.value = fromAbove ? .25 : 1; u.hurt.value = hurt; u.cool.value = cool || 0; u.useLine.value = CFG.outlines; u.usePal.value = CFG.palette; u.useBlock.value = CFG.blocks;
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); u.invPV.value.copy(_pv).invert(); u.camPos.value.copy(cam.position);
  /* What a frame costs, and what is done about it:
     - the sun's shadow map covers the whole field and nearly all of it is still, so it is redrawn on one frame in three;
       with shadows turned off in Settings it is not drawn at all;
     - leaves and grass (layer 3) are drawn in colour only. They take no outlines, so the second pass, which exists to find
       outlines, leaves them out;
     - with outlines turned off that second pass is skipped altogether. */
  frameN++; const shOn = CFG.shadows !== 0; if (sun.castShadow !== shOn) sun.castShadow = shOn; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = shOn && frameN % 3 === 0;
  if (shOn && sun.shadow.map) { u.tShadow.value = sun.shadow.map.texture; u.shadowM.value.copy(sun.shadow.matrix); u.hasShadow.value = 1; } else u.hasShadow.value = 0;
  cam.layers.set(0); cam.layers.enable(1); cam.layers.enable(3);
  renderer.setRenderTarget(colorRT); renderer.clear(); renderer.render(scene, cam); GL.depthRange(0, .02); renderer.render(gunScene, gunCam); GL.depthRange(0, 1);   // what the pilot holds is drawn into the nearest sliver of depth, so it never pokes into a wall
  renderer.shadowMap.needsUpdate = false;
  if (CFG.outlines) { cam.layers.set(0); scene.overrideMaterial = gunScene.overrideMaterial = normMat;
    renderer.setRenderTarget(normRT); renderer.clear(); renderer.render(scene, cam); GL.depthRange(0, .02); renderer.render(gunScene, gunCam); GL.depthRange(0, 1);
    scene.overrideMaterial = gunScene.overrideMaterial = null; cam.layers.enable(1); cam.layers.enable(3); }
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
makeRTs();
Math.random = _mr;   // the field is built; from here on, chance is chance
