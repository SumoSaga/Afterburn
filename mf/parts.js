/* Afterburn: a small kit of shapes for building machines and gear out of many plain pieces.
   Three kinds of piece, each given in metres with where it sits and what it is painted:
   - a box with softened edges;
   - a hull: a box whose top face can be made narrower or wider than its base and slid forward or back, which gives
     sloped armour plates, wedges, tapered guards and toes;
   - a drum: a cylinder or cone with a few flat sides, lying along any axis, for joints, pistons, barrels, tanks, rolls.
   Every piece is flat shaded and takes one colour, a little lighter toward its top, so the outline pass and the toon
   light pick out each plate. A list of pieces is merged into one mesh per joint. */
import { THREE, clamp, lerp, charMat } from "./engine.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const box = (w, h, d, x, y, z, key, rx = 0, rz = 0, ry = 0) => ({ t: "box", w, h, d, x, y, z, key, rx, ry, rz });
// top: { sx, sz } scale of the top face against the base, { ox, oz } how far it is slid
export const hull = (w, h, d, x, y, z, key, top = {}, rx = 0, rz = 0, ry = 0) => ({ t: "hull", w, h, d, x, y, z, key, top, rx, ry, rz });
// r: radius, len: length, axis: "x" | "y" | "z", n: sides, r2: radius of the far end (for a cone), tilt: [rx, rz] after laying it along the axis
export const drum = (r, len, x, y, z, key, axis = "y", n = 8, r2 = r, tilt = [0, 0]) => ({ t: "drum", r, len, x, y, z, key, axis, n, r2, tilt });
const _c = new THREE.Color();
export function build(parent, list, S, glowMat) {
  const solid = [], glow = [];
  for (let p of list) {
    if (Array.isArray(p)) p = box(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7] || 0, p[8] || 0);
    let g, h = p.h, y0 = p.y - p.h / 2;
    if (p.key === "glow") { g = new THREE.BoxGeometry(p.w || p.r * 2, p.h || p.len, p.d || p.r * 2); if (p.rx) g.rotateX(p.rx); if (p.rz) g.rotateZ(p.rz); g.translate(p.x, p.y, p.z); glow.push(g); continue; }
    if (p.t === "drum") { g = new THREE.CylinderGeometry(p.r2, p.r, p.len, p.n, 1); if (p.axis === "x") g.rotateZ(Math.PI / 2); else if (p.axis === "z") g.rotateX(Math.PI / 2); if (p.tilt[0]) g.rotateX(p.tilt[0]); if (p.tilt[1]) g.rotateZ(p.tilt[1]); h = p.axis === "y" ? p.len : p.r * 2; y0 = p.y - h / 2; }
    else if (p.t === "hull") { g = new THREE.BoxGeometry(p.w, p.h, p.d); const P = g.attributes.position, T = p.top; for (let i = 0; i < P.count; i++) if (P.getY(i) > 0) { P.setX(i, P.getX(i) * (T.sx ?? 1) + (T.ox || 0)); P.setZ(i, P.getZ(i) * (T.sz ?? 1) + (T.oz || 0)); } }
    else g = new RoundedBoxGeometry(p.w, p.h, p.d, 1, Math.min(.05, Math.min(p.w, p.h, p.d) * .2));
    if (p.t !== "drum") { if (p.rx) g.rotateX(p.rx); if (p.ry) g.rotateY(p.ry); if (p.rz) g.rotateZ(p.rz); }
    g.translate(p.x, p.y, p.z); g = g.toNonIndexed(); g.deleteAttribute("uv"); if (p.t !== "box") g.computeVertexNormals();
    _c.set(S[p.key] || p.key); const P = g.attributes.position, a = new Float32Array(P.count * 3), j = .93 + Math.random() * .14;
    for (let i = 0; i < P.count; i++) { const k = j * lerp(.8, 1.07, clamp((P.getY(i) - y0) / (h || 1), 0, 1)); a[i * 3] = _c.r * k; a[i * 3 + 1] = _c.g * k; a[i * 3 + 2] = _c.b * k; }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3)); solid.push(g);
  }
  if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid), charMat); m.castShadow = m.receiveShadow = true; parent.add(m); }
  if (glow.length) parent.add(new THREE.Mesh(mergeGeometries(glow), glowMat));
}
