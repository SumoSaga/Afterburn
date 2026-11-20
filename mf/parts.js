/* Afterburn: a small kit of shapes for building machines and gear out of many plain pieces.
   Three kinds of piece, each given in metres with where it sits and what it is painted:
   - a box with softened edges;
   - a hull: a box whose top face can be made narrower or wider than its base and slid forward or back, which gives
     sloped armour plates, wedges, tapered guards and toes;
   - a drum: a cylinder or cone with a few flat sides, lying along any axis, for joints, pistons, barrels, tanks, rolls.
   - a loft: a skin drawn over a stack of rounded rings, each with its own width, depth and offset, for limbs that
     taper and swell the way a body's do, cuirasses, sleeves, tanks;
   - a ball: an egg shape, whole or just its top half, or only a patch of its surface (for a visor that wraps a helmet).
   Boxes, hulls and drums are flat shaded; lofts and balls are smooth. Every piece and takes one colour, a little lighter toward its top, so the outline pass and the toon
   light pick out each plate. A list of pieces is merged into one mesh per joint. */
import { THREE, clamp, lerp, charMat } from "./engine.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const box = (w, h, d, x, y, z, key, rx = 0, rz = 0, ry = 0) => ({ t: "box", w, h, d, x, y, z, key, rx, ry, rz });
// top: { sx, sz } scale of the top face against the base, { ox, oz } how far it is slid
export const hull = (w, h, d, x, y, z, key, top = {}, rx = 0, rz = 0, ry = 0) => ({ t: "hull", w, h, d, x, y, z, key, top, rx, ry, rz });
// r: radius, len: length, axis: "x" | "y" | "z", n: sides, r2: radius of the far end (for a cone), tilt: [rx, rz] after laying it along the axis
export const drum = (r, len, x, y, z, key, axis = "y", n = 8, r2 = r, tilt = [0, 0]) => ({ t: "drum", r, len, x, y, z, key, axis, n, r2, tilt });
// rings: [y, width, depth, ox = 0, oz = 0] from the bottom up; n: sides; sq: 0 for round rings, toward 1 for squarer ones
export const loft = (rings, x, y, z, key, n = 10, sq = 0, rx = 0, rz = 0, ry = 0) => ({ t: "loft", rings, x, y, z, key, n, sq, rx, ry, rz });
// o: { half: true } the top half only; { face, wide, from, to } a patch facing the angle `face` (0 is +z, PI is -z), `wide` radians across, between two heights given as angles down from the top
export const ball = (w, h, d, x, y, z, key, o = {}, rx = 0, rz = 0, ry = 0) => ({ t: "ball", w, h, d, x, y, z, key, o, rx, ry, rz });
function loftGeo(p) { const n = p.n, R0 = p.rings, R = []; for (let i = 0; i < R0.length; i++) { const a = R0[i], b = R0[i + 1]; R.push(a); if (b && b[0] - a[0] > .08) for (const k of [1 / 3, 2 / 3]) R.push([0, 1, 2, 3, 4].map((j) => (a[j] || 0) + ((b[j] || 0) - (a[j] || 0)) * k)); }
  const pos = [], idx = [], e = 1 - .62 * p.sq;
  for (const [y, w, d, ox = 0, oz = 0] of R) for (let i = 0; i < n; i++) { const a = (i + .5) / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pos.push(ox + Math.sign(c) * Math.pow(Math.abs(c), e) * w / 2, y, oz + Math.sign(s) * Math.pow(Math.abs(s), e) * d / 2); }
  for (let r = 0; r < R.length - 1; r++) for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n, c = a + n, d = b + n; idx.push(a, c, b, b, c, d); }
  const b0 = pos.length / 3; pos.push(R[0][3] || 0, R[0][0], R[0][4] || 0); for (let i = 0; i < n; i++) idx.push(b0, i, (i + 1) % n);
  const t0 = pos.length / 3, L = R.length - 1; pos.push(R[L][3] || 0, R[L][0], R[L][4] || 0); for (let i = 0; i < n; i++) idx.push(t0, L * n + (i + 1) % n, L * n + i);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
// grit: a smooth noise over the surface darkens it in patches (grime), bites dark chips out of painted plate, and
// fades the low parts of anything marked muddy toward the colour of the ground
const hsh = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y, z) { const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = x - i, v = y - j, w = z - k, f = (t) => t * t * (3 - 2 * t), a = f(u), b = f(v), c = f(w), L = (p, q, t) => p + (q - p) * t;
  return L(L(L(hsh(i, j, k), hsh(i + 1, j, k), a), L(hsh(i, j + 1, k), hsh(i + 1, j + 1, k), a), b), L(L(hsh(i, j, k + 1), hsh(i + 1, j, k + 1), a), L(hsh(i, j + 1, k + 1), hsh(i + 1, j + 1, k + 1), a), b), c); }
const PAINTED = { plate: 1, plate2: 1, shell: 1, accent: 1, cream: 1, vest: 1 }, _chip = new THREE.Color(), _mud = new THREE.Color();
const _c = new THREE.Color();
export function build(parent, list, S, glowMat, mat = charMat) {
  const solid = [], glow = [];
  for (let p of list) {
    if (Array.isArray(p)) p = box(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7] || 0, p[8] || 0);
    let g; const isGlow = p.key === "glow";
    if (p.t === "drum") { g = new THREE.CylinderGeometry(p.r2, p.r, p.len, p.n, 1); if (p.axis === "x") g.rotateZ(Math.PI / 2); else if (p.axis === "z") g.rotateX(Math.PI / 2); if (p.tilt[0]) g.rotateX(p.tilt[0]); if (p.tilt[1]) g.rotateZ(p.tilt[1]); }
    else if (p.t === "hull") { g = new THREE.BoxGeometry(p.w, p.h, p.d); const P = g.attributes.position, T = p.top; for (let i = 0; i < P.count; i++) if (P.getY(i) > 0) { P.setX(i, P.getX(i) * (T.sx ?? 1) + (T.ox || 0)); P.setZ(i, P.getZ(i) * (T.sz ?? 1) + (T.oz || 0)); } }
    else if (p.t === "loft") g = loftGeo(p);
    else if (p.t === "ball") { const o = p.o; g = o.wide ? new THREE.SphereGeometry(1, 8, 4, Math.PI / 2 + (o.face || 0) - o.wide / 2, o.wide, o.from, o.to - o.from) : new THREE.SphereGeometry(1, 12, o.half ? 5 : 8, 0, Math.PI * 2, 0, o.half ? Math.PI / 2 : Math.PI); g.scale(p.w / 2, p.h / 2, p.d / 2); }
    else g = isGlow ? new THREE.BoxGeometry(p.w, p.h, p.d) : new RoundedBoxGeometry(p.w, p.h, p.d, 1, Math.min(.05, Math.min(p.w, p.h, p.d) * .2));
    if (p.t !== "drum") { if (p.rx) g.rotateX(p.rx); if (p.ry) g.rotateY(p.ry); if (p.rz) g.rotateZ(p.rz); }
    g.translate(p.x, p.y, p.z); if (p.t === "hull" || p.t === "drum") { g = g.toNonIndexed(); g.computeVertexNormals(); } else if (g.index) g = g.toNonIndexed(); g.deleteAttribute("uv");
    if (isGlow) { glow.push(g); continue; }
    g.computeBoundingBox(); const y0 = g.boundingBox.min.y, h = g.boundingBox.max.y - y0 || 1;
    _c.set(S[p.key] || p.key); const P = g.attributes.position, a = new Float32Array(P.count * 3), j = .94 + Math.random() * .12;
    const grit = S.grit ?? .7, fq = S.gritScale || 2.2, mud = S.mud || 0, chips = PAINTED[p.key] ? grit : 0; _chip.set(S.chip || "#2b2622"); _mud.set(S.mudColor || "#5a4a36");
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), yn = clamp((y - y0) / h, 0, 1); let k = j * lerp(.8, 1.07, yn), r = _c.r, gg = _c.g, b = _c.b;
      if (grit) { const n1 = noise(x * fq, y * fq, z * fq), n2 = noise(x * fq * 3.1 + 9, y * fq * 3.1, z * fq * 3.1 + 4); k *= 1 - grit * .34 * n1 * n1 - grit * .1 * n2;
        if (chips && n2 > .7 - chips * .08) { const m = Math.min(1, (n2 - (.7 - chips * .08)) * 6) * .8; r += (_chip.r - r) * m; gg += (_chip.g - gg) * m; b += (_chip.b - b) * m; } }
      if (mud) { const m = clamp(mud * (1 - yn) * (.6 + .6 * noise(x * fq * 2, 3, z * fq * 2)), 0, .85); r += (_mud.r - r) * m; gg += (_mud.g - gg) * m; b += (_mud.b - b) * m; }
      a[i * 3] = r * k; a[i * 3 + 1] = gg * k; a[i * 3 + 2] = b * k; }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3)); solid.push(g);
  }
  if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid), mat); m.castShadow = m.receiveShadow = true; parent.add(m); }
  if (glow.length) { const m = new THREE.Mesh(mergeGeometries(glow), glowMat); parent.add(m); }
}
