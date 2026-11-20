/* Circuit Breaker Pixel Table: growing things and natural scatter (table/cbnature.js).
   window.CBNature(THREE, { leafMat, flatToon }) -> { WIND, tree, bush, log, stump, rock, cover, sway(mat), depth(), SPECIES, BUSHES }
   Everything is built from small flat-coloured pieces so the pixel pass draws it crisply: a tree is a bent trunk with
   branches and clumps of a few hundred leaves (the light and the sight lines pass between them), grass is blades, a log
   is a tapered, ringed tube lying at any angle. Every vertex carries aSway, how far it gives in the wind (0 at the root,
   1 at a leaf tip or a blade's end), and the wind moves them in the vertex shader, the shadows with them. Each thing is
   seeded, so the same piece always grows the same way, and no two pieces are alike. Sizes are in table units (5 ft is
   25.4). */
(function () {
  window.CBNature = function (THREE, opt) {
    const WIND = { uTime: { value: 0 }, uWind: { value: 1 } };
    const WIND_GLSL = `
attribute float aSway; uniform float uTime, uWind;
vec3 windOff(vec3 wp, float s) {
  float t = uTime;
  float gust = .55 + .45 * sin(t * .23 + wp.x * .004 + wp.z * .003);
  float a = sin(t * 1.25 + wp.x * .045 + wp.z * .031) * .62 + sin(t * 2.6 + wp.x * .11 - wp.z * .07) * .22;
  float b = cos(t * 1.05 + wp.z * .052 + wp.x * .021) * .38 + sin(t * 3.1 + wp.x * .2) * .08;
  return vec3(a * 1.3 + .55, -abs(a) * .25, b) * s * uWind * gust;
}`;
    const VERT = `#include <begin_vertex>
  { vec4 wpw = modelMatrix * vec4(transformed, 1.0); vec3 off = windOff(wpw.xyz, aSway); transformed += transpose(mat3(modelMatrix)) * off; }`;
    function windPatch(sh) { Object.assign(sh.uniforms, WIND); sh.vertexShader = sh.vertexShader.replace("void main() {", WIND_GLSL + "\nvoid main() {").replace("#include <begin_vertex>", VERT); }
    // a material that sways: the given one with the wind laid on top of whatever it already did
    function sway(base, key) {
      const m = base.clone(), was = base.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { if (was) was.call(base, sh, r); windPatch(sh); };
      m.customProgramCacheKey = () => "cbsway-" + key; return m;
    }
    let depthM = null;
    function depth() { if (depthM) return depthM; depthM = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }); depthM.onBeforeCompile = windPatch; depthM.customProgramCacheKey = () => "cbsway-depth"; return depthM; }
    const leafSway = sway(opt.leafMat, "leaf"), barkSway = sway(opt.flatToon, "bark");

    /* ---------- building blocks ---------- */
    function rng(seed) { let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    class Mesher {
      constructor() { this.p = []; this.c = []; this.n = []; this.s = []; this.col = new THREE.Color(); }
      tri(a, b, d, col, n, sa = 0, sb = 0, sd = 0) {
        const P = this.p, C = this.c, N = this.n; let nx = n && n[0], ny = n && n[1], nz = n && n[2];
        if (!n) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
        for (const q of [a, b, d]) { P.push(q[0], q[1], q[2]); C.push(col.r, col.g, col.b); N.push(nx, ny, nz); }
        this.s.push(sa, sb, sd);
      }
      quad(a, b, d, e, col, n, s) { this.tri(a, b, d, col, n, s[0], s[1], s[2]); this.tri(a, d, e, col, n, s[0], s[2], s[3]); }
      geo() { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute("aSway", new THREE.Float32BufferAttribute(this.s, 1)); g.computeBoundingSphere(); return g; }
      get empty() { return !this.p.length; }
    }
    const C3 = (hex, k = 1, r) => { const c = new THREE.Color(hex); if (r) c.offsetHSL((r() - .5) * .025, (r() - .5) * .08, (r() - .5) * .07); return c.multiplyScalar(k); };
    // a tapered tube from a to b (radii r0, r1), n sides, coloured by col(i) per face; sway at each end
    function tube(M, a, b, r0, r1, n, col, s0, s1, rnd) {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); d.normalize();
      const up = Math.abs(d.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), u = new THREE.Vector3().crossVectors(d, up).normalize(), v = new THREE.Vector3().crossVectors(d, u).normalize();
      const ring = (p, r) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2, k = r * (1 + (rnd ? (rnd() - .5) * .18 : 0)); return [p[0] + (u.x * Math.cos(t) + v.x * Math.sin(t)) * k, p[1] + (u.y * Math.cos(t) + v.y * Math.sin(t)) * k, p[2] + (u.z * Math.cos(t) + v.z * Math.sin(t)) * k]; });
      const A = ring(a, r0), B = ring(b, r1);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; M.quad(A[i], A[j], B[j], B[i], col(i), null, [s0, s0, s1, s1]); }
      return { A, B, L };
    }
    function cap(M, ring, mid, col, s) { for (let i = 0; i < ring.length; i++) M.tri(ring[i], ring[(i + 1) % ring.length], mid, col, null, s, s, s); }
    // a leaf: a small card turned any way, its normal leaning out from the clump's middle (so a crown lights as one shape)
    function leaf(M, r, x, y, z, sz, col, mid, s, flat) {
      const a = r() * 6.283, t = flat ? (r() - .5) * .6 : (r() - .5) * 2.4, u = [Math.cos(a) * sz, 0, Math.sin(a) * sz], v = [-Math.sin(a) * Math.sin(t) * sz, Math.cos(t) * sz * (flat ? .35 : 1), Math.cos(a) * Math.sin(t) * sz];
      const nn = new THREE.Vector3(x - mid[0], (y - mid[1]) * 1.3, z - mid[2]).normalize().multiplyScalar(.65).add(new THREE.Vector3(0, .55, 0)).normalize(), n = [nn.x, nn.y, nn.z];
      const P = (i, j) => [x + u[0] * i + v[0] * j, y + u[1] * i + v[1] * j, z + u[2] * i + v[2] * j];
      M.tri(P(-.5, -.45), P(.5, -.45), P(.12, .55), col, n, s, s, s); M.tri(P(-.5, -.45), P(.12, .55), P(-.42, .4), col, n, s, s, s);
    }
    // a clump of leaves round a point: denser inside, ragged at the edge, lighter on top where the sun reaches
    function clump(M, r, mid, rad, n, sz, pal, s0, flatten = 1, autumn = 0) {
      for (let i = 0; i < n; i++) {
        const a = r() * 6.283, e = Math.acos(2 * r() - 1), k = .35 + .65 * Math.pow(r(), .45);
        const x = mid[0] + Math.sin(e) * Math.cos(a) * rad[0] * k, y = mid[1] + Math.cos(e) * rad[1] * k * flatten, z = mid[2] + Math.sin(e) * Math.sin(a) * rad[2] * k;
        const up = (y - mid[1]) / Math.max(1, rad[1]), hex = pal[Math.floor(r() * pal.length)];
        const col = C3(hex, .78 + .3 * (up * .5 + .5) + (r() - .5) * .12, r); if (autumn && r() < autumn) col.lerp(new THREE.Color(["#b0621e", "#c98a2a", "#9b3a1c", "#d0a03a"][Math.floor(r() * 4)]), .75);
        leaf(M, r, x, y, z, sz * (.7 + r() * .6), col, mid, s0 + (1 - s0) * (.4 + .6 * k));
      }
    }

    /* ---------- trees ---------- */
    const SPECIES = {
      oak: { name: "Oak", h: [78, 122], bark: ["#4f3a2a", "#5a4230", "#463424"], leaves: ["#3f5a2a", "#4d6a30", "#5d7a36", "#36502a", "#6a8540"], trunk: .062, crown: [.62, .46], clumps: [5, 8], leaf: 5.2, lean: .12 },
      maple: { name: "Maple", h: [82, 128], bark: ["#5a4a3c", "#635242", "#4e4034"], leaves: ["#4f7a2e", "#5f8a36", "#6f9a3e", "#43682a"], trunk: .056, crown: [.5, .52], clumps: [5, 7], leaf: 5.4, lean: .08, autumn: .5 },
      beech: { name: "Beech", h: [86, 130], bark: ["#7a776c", "#86837a", "#6d6a61"], leaves: ["#5a7a2c", "#6b8b34", "#4b6a28", "#7b9a3c"], trunk: .05, crown: [.52, .5], clumps: [4, 7], leaf: 5, lean: .06 },
      birch: { name: "Birch", h: [80, 120], bark: ["#d9d4c4", "#e6e1d2", "#cbc6b6"], leaves: ["#7a9a3a", "#8aab44", "#6b8a34", "#9ab24e"], trunk: .034, crown: [.34, .5], clumps: [4, 6], leaf: 4, lean: .14, sparse: .65, marks: true },
      pine: { name: "Pine", h: [96, 160], bark: ["#4a3628", "#553d2c", "#3f2e22"], leaves: ["#2f4a2c", "#365530", "#29412a", "#3e5e36"], trunk: .045, conifer: true },
      fir: { name: "Fir", h: [70, 120], bark: ["#3f3024", "#4a382a"], leaves: ["#26402a", "#2d4a30", "#22382a", "#335638"], trunk: .04, conifer: true, dense: 1.3 },
      dead: { name: "Dead tree", h: [64, 110], bark: ["#5a4c3e", "#4a3e32", "#6a5a4a", "#3e342a"], trunk: .052, dead: true, lean: .18 },
    };
    const TREE_KEYS = ["oak", "oak", "maple", "beech", "birch", "pine"];
    function tree(species, seed, scale = 1) {
      const r = rng("tree|" + seed), sp = SPECIES[species] || SPECIES[TREE_KEYS[Math.floor(r() * TREE_KEYS.length)]];
      const kind = Object.keys(SPECIES).find((k) => SPECIES[k] === sp), bark = new Mesher(), lv = new Mesher();
      const H = (sp.h[0] + r() * (sp.h[1] - sp.h[0])) * scale, R0 = H * sp.trunk * (.85 + r() * .3), barkCol = (i) => C3(sp.bark[(i + Math.floor(r() * 3)) % sp.bark.length], 1, r);
      const lean = (sp.lean || .05) * (r() - .3), la = r() * 6.283, lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
      // the trunk: two or three bent segments
      const segs = sp.conifer ? 1 : 3, pts = [[0, 0, 0]]; let topY = sp.conifer ? H * .96 : H * (.42 + r() * .12);
      for (let i = 1; i <= segs; i++) { const t = i / segs; pts.push([lx * H * t + (r() - .5) * H * .03 * (i > 1), topY * t, lz * H * t + (r() - .5) * H * .03 * (i > 1)]); }
      // the root flare
      tube(bark, [0, -2, 0], [0, H * .05, 0], R0 * 1.55, R0 * 1.05, 7, barkCol, 0, 0, r);
      for (let i = 0; i < segs; i++) { const ra = R0 * (1 - .22 * i / segs), rb = R0 * (1 - .22 * (i + 1) / segs) * (sp.conifer ? .2 : 1); tube(bark, pts[i], pts[i + 1], ra, rb, 7, barkCol, .02 * i, .05 * (i + 1), r); }
      if (sp.marks) for (let i = 0; i < 9; i++) { const y = H * .06 + r() * topY * .9, a = r() * 6.283, k = R0 * 1.03; const c = C3("#2a2622", 1); const x0 = Math.cos(a) * k, z0 = Math.sin(a) * k, x1 = Math.cos(a + .5) * k, z1 = Math.sin(a + .5) * k; bark.quad([x0, y, z0], [x1, y, z1], [x1, y + 2.2, z1], [x0, y + 2.2, z0], c, null, [.02, .02, .02, .02]); }
      const top = pts[pts.length - 1];
      let crownR = 0, crownY0 = H, crownY1 = H;
      if (sp.conifer) {
        // tiers of drooping needle sprays, wide at the bottom, to a spire
        const tiers = Math.round(7 + r() * 4), y0 = H * (.16 + r() * .1), wB = H * (.24 + r() * .06) * (sp.dense || 1);
        crownY0 = y0; crownR = wB;
        for (let t = 0; t < tiers; t++) {
          const f = t / (tiers - 1), y = y0 + (H - y0) * f * .96, w = wB * (1 - f * .92) * (.85 + r() * .3), arms = Math.max(5, Math.round(10 - f * 5 + r() * 3));
          for (let a = 0; a < arms; a++) { const ang = a / arms * 6.283 + r() * .5, ex = Math.cos(ang) * w, ez = Math.sin(ang) * w, ey = y - w * .32;
            const mid = [lx * H * (y / H), y, lz * H * (y / H)]; const sOut = .25 + .55 * f;
            for (let k = 0; k < 7 * (sp.dense || 1); k++) { const u = (k + 1) / 8, x = mid[0] + ex * u + (r() - .5) * 4, z = mid[2] + ez * u + (r() - .5) * 4, yy = y - w * .32 * u * u + (r() - .5) * 3;
              leaf(lv, r, x, yy, z, 5 + (1 - f) * 2.4, C3(sp.leaves[Math.floor(r() * sp.leaves.length)], .8 + .35 * f + (r() - .5) * .1, r), [mid[0], y - 12, mid[2]], sOut * (.5 + u * .5), true); } }
        }
      } else if (sp.dead) {
        // bare: forked limbs reaching up and out, a few snapped short
        const limbs = 4 + Math.floor(r() * 4);
        for (let i = 0; i < limbs; i++) { const y = topY * (.55 + r() * .45), a = r() * 6.283, L = H * (.22 + r() * .25), b = [Math.cos(a) * L * .7, y + L * (.45 + r() * .4), Math.sin(a) * L * .7], from = [lx * H * (y / H), y, lz * H * (y / H)];
          tube(bark, from, b, R0 * .45, R0 * .12, 5, barkCol, .05, .3, r);
          if (r() < .7) { const a2 = a + (r() - .5) * 1.4, c = [b[0] + Math.cos(a2) * L * .4, b[1] + L * .25, b[2] + Math.sin(a2) * L * .4]; tube(bark, b, c, R0 * .12, R0 * .05, 4, barkCol, .3, .5, r); } }
        crownY0 = topY * .5; crownY1 = H; crownR = H * .25;
      } else {
        // limbs from the top of the trunk out to each clump, and the clumps themselves: the crown, with gaps between
        const nC = sp.clumps[0] + Math.floor(r() * (sp.clumps[1] - sp.clumps[0] + 1)), CW = H * sp.crown[0], CH = H * sp.crown[1], cy = topY + CH * .45;
        crownR = CW * .9; crownY0 = topY - CH * .1; crownY1 = topY + CH * 1.1;
        const autumn = sp.autumn && r() < .35 ? .55 : sp.autumn && r() < .3 ? .2 : 0, sparse = sp.sparse || 1;
        const clumps = [];
        for (let i = 0; i < nC; i++) { const a = i / nC * 6.283 + r() * .9, d = (i === 0 ? .05 : .45 + r() * .55) * CW * .62, y = cy + (i === 0 ? CH * .3 : (r() - .45) * CH * .55);
          clumps.push([top[0] + Math.cos(a) * d, y, top[2] + Math.sin(a) * d, (.32 + r() * .2) * CW * (i === 0 ? 1.15 : 1)]); }
        for (const [x, y, z, rad] of clumps) {
          const from = [top[0] * .9, topY * (.82 + r() * .14), top[2] * .9];
          tube(bark, from, [x, y - rad * .25, z], R0 * .5, R0 * .16, 5, barkCol, .06, .35, r);
          const n = Math.round(rad * rad * .2 * sparse * (.85 + r() * .3) + 26);
          clump(lv, r, [x, y, z], [rad, rad * .72, rad], Math.min(140, n), sp.leaf * scale ** .5, sp.leaves, .35, 1, autumn);
        }
      }
      return { bark: bark.geo(), leaves: lv.empty ? null : lv.geo(), h: H, trunkR: R0, crownR, crownY0, crownY1, kind, name: sp.name };
    }

    /* ---------- bushes and small plants ---------- */
    const BUSHES = {
      leafy: { name: "Leafy bush", pal: ["#3f5a2a", "#4d6a30", "#5d7a36", "#36502a"], r: [9, 14], h: .7, n: 1 },
      round: { name: "Round shrub", pal: ["#456b2c", "#517a33", "#3a5c28", "#5f8a3a"], r: [7, 11], h: .9, n: 1.2 },
      berry: { name: "Berry bush", pal: ["#3a5628", "#466530", "#2f4a24"], r: [8, 12], h: .75, n: 1, dots: "#a82a2a" },
      flowering: { name: "Flowering shrub", pal: ["#4a6a2c", "#557636", "#3e5a26"], r: [8, 12], h: .75, n: 1, dots: "#e8c8d8" },
      dry: { name: "Dry brush", pal: ["#7a6a48", "#8a7650", "#6b5a3e", "#9a8a5a"], r: [8, 13], h: .6, n: .55, twigs: true },
      fern: { name: "Fern", pal: ["#4f7a2e", "#5f8a36", "#43682a", "#6f9a3e"], r: [7, 11], fern: true },
      nettle: { name: "Weeds", pal: ["#5a6a34", "#6b7a3c", "#4b5a2c"], r: [5, 8], h: 1.1, n: .7 },
    };
    function bush(variety, seed, scale = 1) {
      const r = rng("bush|" + seed), b = BUSHES[variety] || BUSHES[["leafy", "round", "leafy", "berry", "fern", "dry"][Math.floor(r() * 6)]], M = new Mesher(), tw = new Mesher();
      const R = (b.r[0] + r() * (b.r[1] - b.r[0])) * scale;
      if (b.fern) { // fronds arching out from the middle, each a run of little leaflets
        const fr = 7 + Math.floor(r() * 6);
        for (let i = 0; i < fr; i++) { const a = i / fr * 6.283 + r() * .4, L = R * (.8 + r() * .5), lift = .5 + r() * .4;
          for (let k = 1; k <= 9; k++) { const u = k / 9, d = L * u, y = Math.sin(u * Math.PI * .85) * L * lift * .6 + 1, x = Math.cos(a) * d, z = Math.sin(a) * d, w = (1 - u * .7) * 3.4, px = -Math.sin(a) * w, pz = Math.cos(a) * w, col = C3(b.pal[Math.floor(r() * b.pal.length)], .8 + u * .3, r), s = u * .9;
            M.tri([x, y, z], [x + px + Math.cos(a) * 2, y + .4, z + pz + Math.sin(a) * 2], [x + Math.cos(a) * 3, y - .3, z + Math.sin(a) * 3], col, [0, 1, 0], s, s, s);
            M.tri([x, y, z], [x - px + Math.cos(a) * 2, y + .4, z - pz + Math.sin(a) * 2], [x + Math.cos(a) * 3, y - .3, z + Math.sin(a) * 3], col, [0, 1, 0], s, s, s); } }
        return { leaves: M.geo(), bark: null, r: R, h: R * .7 };
      }
      const H = R * (b.h || .8), lobes = 2 + Math.floor(r() * 3);
      for (let i = 0; i < lobes; i++) { const a = r() * 6.283, d = i ? R * (.25 + r() * .35) : 0, rad = R * (i ? .55 + r() * .25 : .8), mid = [Math.cos(a) * d, H * (.45 + r() * .25), Math.sin(a) * d];
        clump(M, r, mid, [rad, rad * (b.h || .8), rad], Math.round(rad * rad * .55 * (b.n || 1) + 12), 3.1 * scale ** .4, b.pal, .25); }
      if (b.dots) for (let i = 0; i < 26; i++) { const a = r() * 6.283, e = r() * 1.3, x = Math.cos(a) * Math.sin(e) * R * .8, z = Math.sin(a) * Math.sin(e) * R * .8, y = H * .5 + Math.cos(e) * H * .5; leaf(M, r, x, y, z, 1.4, C3(b.dots, 1, r), [0, H * .4, 0], .6); }
      if (b.twigs) for (let i = 0; i < 9; i++) { const a = r() * 6.283, L = R * (.6 + r() * .6); tube(tw, [0, 0, 0], [Math.cos(a) * L * .6, L * .8, Math.sin(a) * L * .6], .55, .2, 3, () => C3("#5a4632", 1, r), 0, .6); }
      return { leaves: M.geo(), bark: tw.empty ? null : tw.geo(), r: R, h: H * 1.4 };
    }

    /* ---------- logs, stumps and rocks ---------- */
    function log(seed, scale = 1) {
      const r = rng("log|" + seed), M = new Mesher(), L = (34 + r() * 46) * scale, R0 = (3.4 + r() * 3.2) * scale, R1 = R0 * (.7 + r() * .2), bark = ["#5a4230", "#4f3a2a", "#634a34", "#463424"];
      const segs = 4, P = []; for (let i = 0; i <= segs; i++) P.push([-L / 2 + L * i / segs, R0 * (1 - .25 * i / segs) + (r() - .5) * .8, (r() - .5) * 2.4 * (i % segs ? 1 : 0)]);
      let last = null;
      for (let i = 0; i < segs; i++) { const t = tube(M, P[i], P[i + 1], R0 + (R1 - R0) * i / segs, R0 + (R1 - R0) * (i + 1) / segs, 8, (k) => C3(bark[(k + i) % bark.length], .85 + (k % 3) * .08, r), 0, 0, r); if (!i) cap(M, t.A, [P[0][0] - .4, P[0][1], P[0][2]], C3("#b08a5a", 1, r), 0); last = t; }
      cap(M, last.B, [P[segs][0] + .4, P[segs][1], P[segs][2]], C3("#a8825a", 1, r), 0);
      // broken branch stubs, and moss along the top
      for (let i = 0; i < 2 + Math.floor(r() * 3); i++) { const x = -L / 2 + L * (.15 + r() * .7), a = r() * Math.PI - Math.PI / 2, y = R0 * .9; tube(M, [x, y, 0], [x + (r() - .5) * 6, y + Math.cos(a) * 7, Math.sin(a) * 7], R0 * .3, R0 * .12, 4, () => C3("#4f3a2a", 1, r), 0, 0); }
      for (let i = 0; i < 30; i++) { const x = -L / 2 + r() * L, z = (r() - .5) * R0 * 1.1; leaf(M, r, x, R0 * 2 - Math.abs(z) * .5 + .2, z, 2.4, C3(["#55702e", "#65803a", "#4a6428"][i % 3], 1, r), [x, 0, 0], 0, true); }
      return { geo: M.geo(), len: L, r: R0, h: R0 * 2 };
    }
    function stump(seed, scale = 1) {
      const r = rng("stump|" + seed), M = new Mesher(), R0 = (5 + r() * 4) * scale, H = (4 + r() * 6) * scale;
      tube(M, [0, -1, 0], [0, H * .3, 0], R0 * 1.35, R0, 8, () => C3("#4f3a2a", 1, r), 0, 0, r);
      const t = tube(M, [0, H * .3, 0], [0, H, 0], R0, R0 * .95, 8, (k) => C3(k % 2 ? "#5a4230" : "#463424", 1, r), 0, 0, r);
      cap(M, t.B, [0, H - .6, 0], C3("#a8825a", 1, r), 0);
      return { geo: M.geo(), r: R0, h: H };
    }
    function rock(seed, size = 1, mossy = .3) {
      const r = rng("rock|" + seed), g = new THREE.IcosahedronGeometry(1, 1), P = g.attributes.position, sx = (.8 + r() * .6) * size, sy = (.45 + r() * .4) * size, sz = (.7 + r() * .6) * size;
      for (let i = 0; i < P.count; i++) { const v = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)), k = .78 + r() * .4; P.setXYZ(i, v.x * sx * k, Math.max(-.15, v.y) * sy * k + sy * .15, v.z * sz * k); }
      const ng = g.toNonIndexed(), N = ng.attributes.position.count, M = new Mesher(), Q = ng.attributes.position; const gray = ["#77746c", "#85827a", "#6a6760", "#8e8a80", "#706a60"];
      for (let i = 0; i < N; i += 3) { const a = [Q.getX(i), Q.getY(i), Q.getZ(i)], b = [Q.getX(i + 1), Q.getY(i + 1), Q.getZ(i + 1)], d = [Q.getX(i + 2), Q.getY(i + 2), Q.getZ(i + 2)];
        const top = (a[1] + b[1] + d[1]) / 3 > sy * .55, col = top && r() < mossy ? C3(["#55702e", "#4a6428", "#6a7a3a"][Math.floor(r() * 3)], 1, r) : C3(gray[Math.floor(r() * gray.length)], 1, r); M.tri(a, b, d, col); }
      return { geo: M.geo(), r: Math.max(sx, sz), h: sy * 1.6 };
    }

    /* ---------- ground cover: grass, wildflowers, reeds, sown over a patch of ground ----------
       cover(spots, kind) builds one mesh for many tufts: spots are [x, y, z, size, seed] in world units */
    const COVER = {
      meadow: { pal: ["#5f7a3e", "#6a8446", "#567038", "#7a8a4a", "#4f6a34"], h: [5, 11], n: 13, w: .9 },
      tall: { pal: ["#7f8a5b", "#9aa46e", "#6b7a48", "#8a9458", "#a8a070"], h: [13, 26], n: 15, w: 1 },
      dry: { pal: ["#9a8a5a", "#ad9677", "#8a7650", "#b8a070", "#7a6a48"], h: [9, 20], n: 14, w: 1 },
      lush: { pal: ["#4f7a2e", "#5f8a36", "#43682a", "#6f9a3e", "#3a5c28"], h: [8, 18], n: 16, w: 1 },
      reeds: { pal: ["#6b7a3c", "#7a8a44", "#5a6a34"], h: [20, 34], n: 7, w: .8, heads: "#5a3a22" },
      flowers: { pal: ["#5f7a3e", "#6a8446", "#567038"], h: [6, 12], n: 7, w: .8, bloom: ["#e8d04a", "#e8e0d0", "#c8506a", "#8a6ac8", "#e88a3a"] },
      litter: { pal: ["#6b5a3e", "#7a5a3a", "#8a6a3a", "#5a4a30"], h: [.2, .6], n: 6, w: 2.4, flat: true },
    };
    function cover(spots, kind) {
      const k = COVER[kind] || COVER.meadow, M = new Mesher();
      for (const [x, y, z, size, seed] of spots) {
        const r = rng(kind + "|" + seed), n = Math.max(3, Math.round(k.n * (.7 + r() * .6) * size)), bloom = k.bloom && r() < .55 ? k.bloom[Math.floor(r() * k.bloom.length)] : null;
        for (let i = 0; i < n; i++) {
          const pa = r() * 6.283, pr = 4.6 * size * Math.sqrt(r()), bx = x + Math.cos(pa) * pr, bz = z + Math.sin(pa) * pr, a = r() * 6.283, w = k.w * (.6 + r() * .6), h = (k.h[0] + r() * (k.h[1] - k.h[0])) * (.75 + size * .25);
          const col = C3(k.pal[Math.floor(r() * k.pal.length)], .85 + r() * .25, r), dx = Math.cos(a) * w, dz = Math.sin(a) * w;
          if (k.flat) { const e = r() * 6.283; M.tri([bx, y + h, bz], [bx + Math.cos(e) * w, y + h, bz + Math.sin(e) * w], [bx + Math.cos(e + 1.9) * w, y + h, bz + Math.sin(e + 1.9) * w], col, [0, 1, 0]); continue; }
          // a blade in two parts, bending over toward its tip
          const ba = r() * 6.283, bend = h * (.18 + r() * .25), mx = bx + Math.cos(ba) * bend * .35, mz = bz + Math.sin(ba) * bend * .35, tx = bx + Math.cos(ba) * bend, tz = bz + Math.sin(ba) * bend;
          M.tri([bx - dx, y, bz - dz], [bx + dx, y, bz + dz], [mx + dx * .6, y + h * .55, mz + dz * .6], col, [0, 1, 0], 0, 0, .45);
          M.tri([bx - dx, y, bz - dz], [mx + dx * .6, y + h * .55, mz + dz * .6], [mx - dx * .6, y + h * .55, mz - dz * .6], col, [0, 1, 0], 0, .45, .45);
          M.tri([mx - dx * .6, y + h * .55, mz - dz * .6], [mx + dx * .6, y + h * .55, mz + dz * .6], [tx, y + h, tz], col.clone().multiplyScalar(1.12), [0, 1, 0], .45, .45, 1);
          if (k.heads && r() < .4) { const c2 = C3(k.heads, 1, r); M.tri([tx - .9, y + h - 4, tz], [tx + .9, y + h - 4, tz], [tx, y + h + 1, tz], c2, [0, 1, 0], .9, .9, 1); }
          if (bloom && i % 2 === 0) { const c2 = C3(bloom, 1, r), s = 1.3 + r(); M.tri([tx - s, y + h, tz], [tx + s, y + h, tz + s * .3], [tx, y + h + s * 1.2, tz - s * .2], c2, [0, 1, 0], 1, 1, 1); M.tri([tx - s, y + h, tz], [tx, y + h - s * .8, tz + s], [tx + s, y + h, tz + s * .3], c2, [0, 1, 0], 1, 1, 1); }
        }
      }
      return M.empty ? null : M.geo();
    }

    return { WIND, patch: windPatch, sway, depth, leafSway, barkSway, tree, bush, log, stump, rock, cover, SPECIES, BUSHES, COVER, rng };
  };
})();
