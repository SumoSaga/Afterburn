/* ---------- generated buildings (12 Nov 2026) ----------
   Modern buildings made in code instead of loaded from a file: a corner shop, an apartment block, a warehouse
   and a suburban house, each in three states (Intact, Damaged, Ruined) that share one layout, so the same
   building can stand before the fall and after it.

   A building's model id is "gen:<type>:<seed>". The seed picks its size, storeys, materials and openings.
   It is shaped like a library building kept as floors (table/index.html bldOf): a ground floor per state
   ("timber" is the engine's name for the default one, shown as Intact), then one geometry per upper storey and
   the roof. Floor geometries sit at their own height, so they stack with no shift; hiding upper levels opens
   the building up to show its rooms.

   Units are the Table's: millimetres at 28 mm scale (one square is 25.4). Every face carries its own colour,
   a pattern id (brick, render, siding, corrugated metal, roofing, shingles, glass, planks, metal, rubble,
   tile) and its size, so the material (GEN.material) can draw courses, laps, ribs and a drybrushed edge on
   trim without any texture files. Only a game whose pack lists types in table/ground/genbuildings.json shows
   these in the Table; nothing here runs otherwise. */
(function () {
  window.RevelryGenBuild = function (THREE, mergeGeometries) {
    const SQ = 25.4;

    /* ---------- randomness ---------- */
    const hashStr = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    function rng(seed) {
      let a = typeof seed === "string" ? hashStr(seed) : seed >>> 0;
      const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      r.range = (x, y) => x + r() * (y - x);
      r.int = (x, y) => Math.floor(x + r() * (y - x + 1));
      r.pick = (arr) => arr[Math.floor(r() * arr.length)];
      r.chance = (p) => r() < p;
      return r;
    }
    function noise2(seed) {
      const h = (x, y) => { let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
      return (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
        return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
      };
    }

    /* ---------- colours (sRGB hex in, linear out, as vertex colours expect) ---------- */
    const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
    const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const jit = (c, r, a = .08) => mul(c, 1 + (r() - .5) * 2 * a);
    const PAL = {
      brick: ["#8a4a36", "#9a5640", "#7c4232", "#a0624a", "#874f3c", "#b08a62"].map(C),
      render: ["#cfc3a3", "#b9c4b4", "#d2b98e", "#c9a98c", "#a9b7bd", "#d8d0bc"].map(C),
      concrete: ["#a8a49a", "#9c988e", "#b3aea2", "#8f8c86"].map(C),
      siding: ["#c9c2ad", "#9fb0b0", "#c7b48a", "#8e9a86", "#b9a79a", "#a3a7b4", "#d4cfc0"].map(C),
      corr: ["#8c9196", "#7f8a78", "#9a8f7c", "#7d8794", "#a4a29b"].map(C),
      trim: ["#d9d1bd", "#e6e2d6", "#c9bea6"].map(C),
      frame: ["#e8e4da", "#3a3d40", "#5a4632", "#2e4a3e", "#e0d8c4"].map(C),
      door: ["#6b2e2a", "#2f4a3a", "#2c3e5a", "#4a4a4a", "#8a6a3a", "#5c3a4e"].map(C),
      sign: ["#2a5a7a", "#7a2a2a", "#c8a040", "#2e6a4a", "#3a3a3a", "#8a4a2a"].map(C),
      awning: [["#7a2a2a", "#e6e0d0"], ["#2e5a3e", "#e6e0d0"], ["#2a4a6a", "#e6e0d0"], ["#5a5a5a", "#c8a040"]].map((p) => p.map(C)),
      shingle: ["#4a4744", "#5a4a42", "#3e4650", "#5b5650"].map(C),
      plaster: ["#b9b09c", "#a7ae9c", "#b6a690", "#a2a5a3"].map(C),
      wood: C("#8a6a48"), woodD: C("#5e4630"), board: C("#9a8466"),
      metal: C("#5e6266"), metalD: C("#3c4044"), glass: C("#26313b"), tar: C("#3f3d3a"), concreteD: C("#7b7871"),
      tile: C("#9d988d"), floorWood: C("#7a5a3c"), floorCon: C("#8f8b83"), curtain: ["#c8b89a", "#8a9aa8", "#a87a6a", "#d8d4c8"].map(C),
      goods: ["#b84a3a", "#3a6ab0", "#d8b040", "#4a9a5a", "#e0e0d8", "#8a5ab0", "#d07a3a"].map(C),
      rust: C("#6a3a22"), soot: C("#1e1c1a"),
    };

    /* ---------- the geometry buffer ---------- */
    // every face: position, normal, colour, its own size and where on it each corner is (aFace: u, v, width, height)
    // and the pattern to draw (aMat)
    const M = { plain: 0, brick: 1, concrete: 2, siding: 3, corr: 4, tar: 5, shingle: 6, glass: 7, wood: 8, metal: 9, rubble: 10, tile: 11, screen: 12, curtain: 13, punched: 14 };
    const newBuf = () => ({ p: [], n: [], c: [], f: [], m: [] });
    const FACES = [
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], ax: 0, su: 2, sv: 1 },
      { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], ax: 0, su: 2, sv: 1 },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], ax: 1, su: 0, sv: 2 },
      { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], ax: 1, su: 0, sv: 2 },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], ax: 2, su: 0, sv: 1 },
      { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], ax: 2, su: 0, sv: 1 },
    ];
    const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _ax = new THREE.Vector3(), _e = new THREE.Euler();
    // a box centred at (cx, cy, cz) of size w × h × d. o.rot: a Matrix4 turning it about its centre; o.edge: false
    // draws no worn edge (big walls are cut into pieces, and the cuts are not real edges); o.skipBottom
    function box(B, cx, cy, cz, w, h, d, col, mat, o = {}) {
      if (w <= .01 || h <= .01 || d <= .01) return;
      const half = [w / 2, h / 2, d / 2], size = [w, h, d], rot = o.rot || null, edge = o.edge !== false;
      for (let fi = 0; fi < 6; fi++) {
        const F = FACES[fi];
        if (o.skipBottom && fi === 3) continue;
        if (o.skipTop && fi === 2) continue;
        const su = size[F.su], sv = size[F.sv];
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
          const p = [0, 1, 2].map((k) => F.n[k] * half[F.ax] + F.u[k] * a * su / 2 + F.v[k] * b * sv / 2);
          if (rot) { _v.set(p[0], p[1], p[2]).applyMatrix4(rot); return [_v.x + cx, _v.y + cy, _v.z + cz]; }
          return [p[0] + cx, p[1] + cy, p[2] + cz];
        });
        let nrm = F.n;
        if (rot) { _v.set(nrm[0], nrm[1], nrm[2]).transformDirection(rot); nrm = [_v.x, _v.y, _v.z]; }
        const cols = corners.map((p) => typeof col === "function" ? col(p[0], p[1], p[2], nrm) : col);
        const uv = [[0, 0], [su, 0], [su, sv], [0, sv]];
        const fw = edge ? su : 0, fh = edge ? sv : 0;
        for (const i of [0, 1, 2, 0, 2, 3]) {
          B.p.push(corners[i][0], corners[i][1], corners[i][2]); B.n.push(nrm[0], nrm[1], nrm[2]);
          B.c.push(cols[i][0], cols[i][1], cols[i][2]); B.f.push(uv[i][0], uv[i][1], fw, fh); B.m.push(mat);
        }
      }
    }
    const rotAxis = (ax, ang) => _m.clone().makeRotationAxis(_ax.set(ax[0], ax[1], ax[2]).normalize(), ang);
    const rotEuler = (x, y, z) => new THREE.Matrix4().makeRotationFromEuler(_e.set(x, y, z));
    // an upright cylinder (r0 at the foot, r1 at the top)
    function cyl(B, x, y, z, r0, r1, h, seg, col, mat) {
      const pts = (r, yy) => Array.from({ length: seg }, (_, i) => { const a = i / seg * Math.PI * 2; return [x + Math.cos(a) * r, yy, z + Math.sin(a) * r]; });
      const lo = pts(r0, y), hi = pts(r1, y + h), arc = 2 * Math.PI * Math.max(r0, r1) / seg;
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg, a = (i + .5) / seg * Math.PI * 2, nrm = [Math.cos(a), (r0 - r1) / h, Math.sin(a)];
        const q = [lo[i], hi[i], hi[j], lo[j]], uv = [[0, 0], [0, h], [arc, h], [arc, 0]];
        for (const k of [0, 1, 2, 0, 2, 3]) { B.p.push(...q[k]); B.n.push(...nrm); B.c.push(...col); B.f.push(uv[k][0], uv[k][1], 0, 0); B.m.push(mat); }
        const tri = [[x, y + h, z], hi[j], hi[i]];
        for (const p of tri) { B.p.push(...p); B.n.push(0, 1, 0); B.c.push(...mul(col, 1.05)); B.f.push(0, 0, 0, 0); B.m.push(mat); }
      }
    }
    // a flat shape drawn in a wall's plane and given thickness (gable ends): pts are [along, up] pairs
    function prism(B, S, pts, base, t0, t1, col, mat) {
      const P = (s, y, t) => [S.O[0] + S.A[0] * s + S.I[0] * t, base + y, S.O[1] + S.A[1] * s + S.I[1] * t];
      const nOut = [-S.I[0], 0, -S.I[1]], nIn = [S.I[0], 0, S.I[1]];
      const push = (a, b, c, nrm) => { for (const p of [a, b, c]) { B.p.push(...p); B.n.push(...nrm); B.c.push(...(typeof col === "function" ? col(p[0], p[1], p[2], nrm) : col)); B.f.push(0, 0, 0, 0); B.m.push(mat); } };
      const sideOut = (a, b, c) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]; return cr; };
      const fan = (t, nrm) => {
        for (let i = 1; i < pts.length - 1; i++) {
          const a = P(pts[0][0], pts[0][1], t), b = P(pts[i][0], pts[i][1], t), c = P(pts[i + 1][0], pts[i + 1][1], t), cr = sideOut(a, b, c);
          if (cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] >= 0) push(a, b, c, nrm); else push(a, c, b, nrm);
        }
      };
      fan(t0, nOut); fan(t1, nIn);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const a = P(p[0], p[1], t0), b = P(q[0], q[1], t0), c = P(q[0], q[1], t1), d = P(p[0], p[1], t1);
        const ex = q[0] - p[0], ey = q[1] - p[1], len = Math.hypot(ex, ey) || 1;
        // outward in the wall plane: the edge turned a quarter, pointing away from the shape's middle
        const mx = pts.reduce((s, v) => s + v[0], 0) / pts.length, my = pts.reduce((s, v) => s + v[1], 0) / pts.length;
        let nx = ey / len, ny = -ex / len; if ((p[0] - mx) * nx + (p[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
        const nrm = [S.A[0] * nx, ny, S.A[1] * nx];
        const cr = sideOut(a, b, c);
        if (cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] >= 0) { push(a, b, c, nrm); push(a, c, d, nrm); } else { push(a, c, b, nrm); push(a, d, c, nrm); }
      }
    }
    function toGeo(B) {
      if (!B.p.length) box(B, 0, .01, 0, .02, .02, .02, [0, 0, 0], 0); // an empty storey still gets a geometry
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(B.c, 3));
      g.setAttribute("aFace", new THREE.Float32BufferAttribute(B.f, 4));
      g.setAttribute("aMat", new THREE.Float32BufferAttribute(B.m, 1));
      g.computeBoundingBox(); g.computeBoundingSphere();
      return g;
    }

    /* ---------- walls ---------- */
    // a side of the footprint: O is where its outer face starts, A runs along it, I points into the building
    function sidesOf(W, D, T) {
      return {
        front: { name: "front", L: W, O: [-W / 2, D / 2], A: [1, 0], I: [0, -1] },
        back: { name: "back", L: W, O: [W / 2, -D / 2], A: [-1, 0], I: [0, 1] },
        left: { name: "left", L: D - 2 * T, O: [-W / 2, -D / 2 + T], A: [0, 1], I: [1, 0] },
        right: { name: "right", L: D - 2 * T, O: [W / 2, D / 2 - T], A: [0, -1], I: [-1, 0] },
      };
    }
    const at = (S, s, t) => [S.O[0] + S.A[0] * s + S.I[0] * t, S.O[1] + S.A[1] * s + S.I[1] * t];
    // a box given in a wall's own terms: s along it, y up, t into the building (negative stands proud of the face)
    function wb(B, S, s0, s1, y0, y1, t0, t1, col, mat, o = {}) {
      const a = at(S, s0, t0), b = at(S, s1, t1);
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
      let rot = o.rot || null;
      if (o.tip) rot = rotAxis([S.A[0], 0, S.A[1]], o.tip);         // turn about the wall's run: the outer edge drops
      if (o.spin) rot = rotAxis([S.I[0], 0, S.I[1]], o.spin);       // turn in the wall's plane
      // a box tipped about the wall's run keeps its length along the run, its depth across it
      box(B, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col, mat, { ...o, rot });
    }
    const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ---------- a building's state ---------- */
    // ctx: the building being drawn in one state. brk(x, z): the height the walls still reach there (ruins);
    // tint(x, y, z): how much soot darkens a wall there
    function storeyWalls(ctx, S, st, ops) {
      const { T, ruin } = ctx, base = st.base, H = st.H;
      const cuts = new Set([0, S.L]);
      ops.forEach((o) => { cuts.add(clampN(o.s0, 0, S.L)); cuts.add(clampN(o.s1, 0, S.L)); });
      let xs = [...cuts].sort((a, b) => a - b);
      if (ruin) { // cut into narrow pieces so a broken top can step down like knocked-out courses
        const out = [xs[0]];
        for (let i = 1; i < xs.length; i++) { let a = out[out.length - 1]; const b = xs[i]; while (b - a > 7) { a += ctx.sheets ? 9 : ctx.r.range(3.5, 6.5); if (b - a < 2) break; out.push(a); } out.push(b); }
        xs = out;
      }
      const bands = st.bands || [{ y0: 0, y1: H, col: ctx.wallCol, mat: ctx.wallMat }];
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i], b = xs[i + 1]; if (b - a < .05) continue;
        const m = (a + b) / 2, o = ops.find((q) => m > q.s0 && m < q.s1);
        let top = H;
        if (ctx.brk) {
          const w = at(S, m, T / 2); let h = ctx.brk(w[0], w[1]) - base;
          if (h < H) { h += ctx.r.range(-1, 1) * ctx.r.range(1, 5); if (ctx.wallMat === M.brick) h = Math.round(h / 1.35) * 1.35; }
          top = Math.min(H, h);
        }
        if (top <= .4) continue;
        const spans = o ? [[0, o.y0], [o.y1, H]] : [[0, H]];
        for (const [sy0, sy1raw] of spans) {
          const sy1 = Math.min(sy1raw, top); if (sy1 - sy0 < .3) continue;
          for (const bd of bands) {
            let y0 = Math.max(sy0, bd.y0), y1 = Math.min(sy1, bd.y1);
            if (ctx.sheets && bd.mat === M.corr) { y1 = Math.min(sy1raw, bd.y1); if (ctx.r.chance(ctx.sheets)) y1 = y0 + (y1 - y0) * ctx.r.range(0, .7); }
            else if (ctx.sheets) y1 = Math.min(sy1raw, bd.y1);
            if (y1 - y0 < .2) continue;
            const col = ctx.tintCol(bd.col);
            wb(ctx.B, S, a, b, base + y0, base + y1, 0, T - .7, col, bd.mat, { edge: false });
            if (bd.mat === M.corr) wb(ctx.B, S, a, b, base + y0, base + y1, T - .7, T, mul(bd.col, .62), M.corr, { edge: false });
            else wb(ctx.B, S, a, b, base + y0, base + y1, T - .7, T, ctx.plasterCol, M.plain, { edge: false });
          }
          // the band of stone at each floor line
          if (sy0 === 0 && base > 6 && ctx.course) wb(ctx.B, S, a, b, base - 1.6, base + .5, -.8, 0, ctx.trimCol, M.concrete);
        }
        // a broken top with the floor line of the storey above still stuck to it
        if (ruin && top < H && top > 1 && ctx.r.chance(.18)) {
          const w = at(S, m, -1); const n = ctx.r.int(1, 2);
          for (let k = 0; k < n; k++) box(ctx.B, w[0] + ctx.r.range(-2, 2), base + top + .4, w[1] + ctx.r.range(-2, 2), ctx.r.range(1.2, 3), ctx.r.range(.8, 1.4), ctx.r.range(1, 2.5), jit(ctx.wallCol, ctx.r, .15), ctx.wallMat, { rot: rotEuler(ctx.r.range(-.6, .6), ctx.r.range(0, 3), ctx.r.range(-.6, .6)) });
        }
      }
      // what fills the openings, where the wall around them still stands
      for (const o of ops) {
        const w = at(S, (o.s0 + o.s1) / 2, T / 2);
        const reach = ctx.brk ? ctx.brk(w[0], w[1]) - base : H;
        if (reach < o.y1 + 1) { if (reach > o.y0 + 4 && o.kind === "window" && ctx.r.chance(.4)) frameBits(ctx, S, base, o, reach); continue; }
        dress(ctx, S, base, o);
      }
    }
    function frameBits(ctx, S, base, o, reach) {
      // a window frame left hanging in a broken wall: one jamb up to where the wall stops
      const f = .9, top = Math.min(o.y1, reach) - .5;
      wb(ctx.B, S, o.s0, o.s0 + f, base + o.y0, base + top, .8, 1.8, ctx.frameCol, M.plain);
    }
    // an opening's frame, glass, sill and the rest
    function dress(ctx, S, base, o) {
      const B = ctx.B, r = ctx.r, T = ctx.T, f = o.kind === "shop" ? 1.3 : .9;
      const y0 = base + o.y0, y1 = base + o.y1, fc = o.frameCol || ctx.frameCol;
      const brokenGlass = o.broken, boarded = o.boarded;
      if (o.kind === "hole") return;
      if (o.kind === "window" || o.kind === "shop") {
        if (!o.noFrame) {
          wb(B, S, o.s0, o.s0 + f, y0, y1, .7, 1.8, fc, M.plain);
          wb(B, S, o.s1 - f, o.s1, y0, y1, .7, 1.8, fc, M.plain);
          wb(B, S, o.s0, o.s1, y1 - f, y1, .7, 1.8, fc, M.plain);
          wb(B, S, o.s0, o.s1, y0, y0 + f, .7, 1.8, fc, M.plain);
          if (o.kind === "window") {
            const mid = (o.s0 + o.s1) / 2, ty = y0 + (y1 - y0) * .62;
            if (o.s1 - o.s0 > 11) wb(B, S, mid - .35, mid + .35, y0, y1, .9, 1.6, fc, M.plain);
            wb(B, S, o.s0, o.s1, ty - .35, ty + .35, .9, 1.6, fc, M.plain);
          } else {
            const n = Math.max(1, Math.round((o.s1 - o.s0) / 15));
            for (let k = 1; k < n; k++) { const s = o.s0 + (o.s1 - o.s0) * k / n; wb(B, S, s - .6, s + .6, y0, y1, .8, 1.7, fc, M.plain); }
            const ty = y1 - (y1 - y0) * .22; wb(B, S, o.s0, o.s1, ty - .5, ty + .5, .8, 1.7, fc, M.plain);
          }
        }
        if (!brokenGlass) wb(B, S, o.s0 + f, o.s1 - f, y0 + f, y1 - f, 1.25, 1.45, PAL.glass, M.glass, { edge: false });
        else if (r.chance(.5)) { // a shard left in the corner
          const w = Math.min(4, (o.s1 - o.s0) / 3); wb(B, S, o.s0 + f, o.s0 + f + w, y0 + f, y0 + f + r.range(2, 5), 1.25, 1.45, PAL.glass, M.glass, { edge: false });
        }
        if (o.curtain && !brokenGlass) wb(B, S, o.s0 + f, o.s0 + f + (o.s1 - o.s0) * r.range(.3, .45), y0 + f, y1 - f, 1.9, 2.2, o.curtain, M.plain, { edge: false });
        if (o.kind === "window") {
          wb(B, S, o.s0 - 1, o.s1 + 1, y0 - 1.3, y0, -1.3, 1, ctx.sillCol, M.concrete);
          if (ctx.lintel) wb(B, S, o.s0 - 1.3, o.s1 + 1.3, y1, y1 + 2.4, -.35, T - .7, ctx.lintelCol, ctx.lintelMat);
          if (o.bars && !o.noFrame) for (let bs = o.s0 + 1.6; bs < o.s1 - .8; bs += 2.4) wb(B, S, bs - .25, bs + .25, y0, y1, -.6, -.1, PAL.metalD, M.metal);
          if (o.shutters) {
            const sw = (o.s1 - o.s0) * .48;
            wb(B, S, o.s0 - sw - .4, o.s0 - .4, y0, y1, -.7, -.1, o.shutters, M.siding);
            wb(B, S, o.s1 + .4, o.s1 + sw + .4, y0, y1, -.7, -.1, o.shutters, M.siding);
          }
        }
      } else if (o.kind === "door") {
        wb(B, S, o.s0, o.s0 + f, y0, y1, .5, 1.8, fc, M.plain);
        wb(B, S, o.s1 - f, o.s1, y0, y1, .5, 1.8, fc, M.plain);
        wb(B, S, o.s0, o.s1, y1 - f, y1, .5, 1.8, fc, M.plain);
        if (!o.open) {
          const dc = o.doorCol || ctx.doorCol;
          // a door's leaf carries its number in its pattern id (0.2 to 0.47: still drawn plain), so a table can tell which door it is and open it
          const dm = .2 + .01 * ((ctx.doorN = (ctx.doorN || 0) + 1) % 28);
          wb(B, S, o.s0 + f, o.s1 - f, y0, y1 - f, 1.4, 2.2, dc, dm);
          const pw = (o.s1 - o.s0 - 2 * f) * .32, mid = (o.s0 + o.s1) / 2;
          for (const yy of [.25, .62]) for (const sx of [-1, 1]) wb(B, S, mid + sx * (pw * .55) - pw / 2, mid + sx * (pw * .55) + pw / 2, y0 + (y1 - y0) * yy, y0 + (y1 - y0) * (yy + .26), 1.1, 1.4, mul(dc, .85), dm);
          wb(B, S, o.s1 - f - 2.6, o.s1 - f - 1.6, y0 + (y1 - y0) * .45, y0 + (y1 - y0) * .45 + 1, .7, 1.4, PAL.metal, M.metal + dm);
        }
        if (o.step) wb(B, S, o.s0 - 2.5, o.s1 + 2.5, base - (o.y0 > 0 ? 0 : 0), y0, -5, 0, ctx.sillCol, M.concrete);
        if (o.canopy) wb(B, S, o.s0 - 5, o.s1 + 5, y1 + 3, y1 + 5, -10, 0, ctx.trimCol, M.concrete);
      } else if (o.kind === "roller") {
        const lift = o.lift || 0;
        if (!o.open) wb(B, S, o.s0, o.s1, y0 + lift, y1, 1, 1.8, o.doorCol || PAL.metal, M.siding);
        wb(B, S, o.s0 - 1.6, o.s0, y0, y1, -1.1, .3, PAL.metalD, M.metal);
        wb(B, S, o.s1, o.s1 + 1.6, y0, y1, -1.1, .3, PAL.metalD, M.metal);
        wb(B, S, o.s0 - 2.2, o.s1 + 2.2, y1, y1 + 4.4, -2.6, 0, PAL.metal, M.metal);
      }
      if (boarded) {
        const n = o.kind === "door" ? 4 : Math.max(2, Math.round((o.y1 - o.y0) / 7));
        for (let k = 0; k < n; k++) {
          const yc = y0 + (y1 - y0) * (k + .5) / n + r.range(-1, 1);
          wb(B, S, o.s0 - 1.6, o.s1 + 1.6, yc - 1.5, yc + 1.5, -1, -.3, jit(PAL.board, r, .15), M.wood, { spin: r.range(-.18, .18) });
        }
      }
    }

    /* ---------- floors, stairs, rooms ---------- */
    // a floor slab over the inside of the footprint, its top at y, with a hole for the stairs (hole: [x0, z0, x1, z1])
    function slab(ctx, y, th, col, mat, hole, whole) {
      const { B, W, D, T, r } = ctx, x0 = whole ? -W / 2 : -W / 2 + T, x1 = whole ? W / 2 : W / 2 - T, z0 = whole ? -D / 2 : -D / 2 + T, z1 = whole ? D / 2 : D / 2 - T;
      if (!ctx.brk) {
        const rects = !hole ? [[x0, z0, x1, z1]] : [[x0, z0, hole[0], z1], [hole[2], z0, x1, z1], [hole[0], z0, hole[2], hole[1]], [hole[0], hole[3], hole[2], z1]];
        for (const [a, b, c, d] of rects) if (c - a > .1 && d - b > .1) box(B, (a + c) / 2, y - th / 2, (b + d) / 2, c - a, th, d - b, col, mat);
        return;
      }
      // broken: square pieces, kept where the walls round them still reach this high, some left hanging
      const step = 6.35;
      for (let x = x0; x < x1 - .1; x += step) for (let z = z0; z < z1 - .1; z += step) {
        const cx = Math.min(x + step, x1), cz = Math.min(z + step, z1), mx = (x + cx) / 2, mz = (z + cz) / 2;
        if (hole && mx > hole[0] && mx < hole[2] && mz > hole[1] && mz < hole[3]) continue;
        const reach = ctx.brk(mx, mz) - y, n = ctx.slabNoise(mx * .07, mz * .07);
        if (reach < 2 || (reach < 8 && n < .55) || n < .22) continue;
        const loose = reach < 10 && r.chance(.45);
        const rot = loose ? rotEuler(r.range(-.35, .35), 0, r.range(-.35, .35)) : null;
        box(B, mx, y - th / 2 - (loose ? r.range(.5, 3) : 0), mz, cx - x - (loose ? .4 : 0), th, cz - z - (loose ? .4 : 0), jit(col, r, .05), mat, { rot });
        if (loose && r.chance(.5)) { // bent rebar out of the broken edge
          for (let k = 0; k < 2; k++) box(B, mx + r.range(-3, 3), y - th / 2, mz + r.range(-3, 3), .35, .35, r.range(4, 8), PAL.rust, M.metal, { rot: rotEuler(r.range(-.8, .8), r.range(0, 3.14), r.range(-.5, .5)) });
        }
      }
    }
    // a straight flight from y to y + h along +z, starting at (x, z), w wide
    function stairs(ctx, x, z, w, y, h, dir = 1) {
      const n = Math.max(6, Math.round(h / 3.4)), rise = h / n, run = 3.2;
      for (let i = 0; i < n; i++) {
        const yy = y + rise * (i + 1);
        if (ctx.brk && ctx.brk(x + w / 2, z + dir * run * i) < yy - 2) continue;
        box(ctx.B, x + w / 2, y + (yy - y) / 2, z + dir * (run * i + run / 2), w, yy - y, run, i % 2 ? ctx.stairCol : mul(ctx.stairCol, .95), M.wood);
      }
      return n * run;
    }
    // an inside wall across the building at z, with a doorway
    function partition(ctx, y, H, z, gapAt) {
      const { W, T } = ctx, S = { L: W - 2 * T, O: [-W / 2 + T, z + .8], A: [1, 0], I: [0, -1] };
      const gw = 14, g0 = clampN(gapAt - gw / 2, 2, S.L - gw - 2);
      const ops = [{ s0: g0, s1: g0 + gw, y0: 0, y1: Math.min(H - 6, 34), kind: "hole" }];
      const save = { wallCol: ctx.wallCol, wallMat: ctx.wallMat, course: ctx.course, T: ctx.T };
      Object.assign(ctx, { wallCol: ctx.plasterCol, wallMat: M.plain, course: false, T: 1.6 });
      storeyWalls(ctx, S, { base: y, H: H - .2 }, ops);
      Object.assign(ctx, save);
    }
    function shelf(ctx, x, z, w, h, d, along) {
      const { B, r } = ctx, col = PAL.metal;
      const sx = along ? w : d, sz = along ? d : w;
      for (let k = 0; k < 4; k++) {
        const yy = ctx.y0 + 1 + k * (h - 1) / 3;
        box(B, x, yy, z, sx, .7, sz, col, M.metal);
        if (k < 3) for (let i = 0; i < 4; i++) {
          // what is on the shelf is part of the layout; how much of it is gone is the state's
          const L = ctx.lay("shelf" + x.toFixed(1) + z.toFixed(1) + yy.toFixed(1) + i);
          const empty = L.chance(.2), gw = L.range(1.6, 3), gh = L.range(2, 4.5), ox = L.range(-sx / 2 + 1.5, sx / 2 - 1.5), oz = L.range(-.8, .8), oz2 = L.range(-sz / 2 + 1.5, sz / 2 - 1.5), col = L.pick(PAL.goods);
          if (empty || (ctx.looted && r.chance(.55))) continue;
          box(B, x + (along ? ox : oz), yy + .35 + gh / 2, z + (along ? oz : oz2), gw, gh, gw * .8, col, M.plain);
        }
      }
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(B, x + dx * (sx / 2 - .3), ctx.y0 + h / 2, z + dz * (sz / 2 - .3), .6, h, .6, PAL.metalD, M.metal);
    }
    function crate(ctx, x, y, z, s, col) {
      const { B, r } = ctx;
      box(B, x, y + s / 2, z, s, s, s, col, M.wood, { rot: rotEuler(0, ctx.lay("crate" + x.toFixed(1) + z.toFixed(1)).range(-.3, .3), 0) });
    }
    function pallet(ctx, x, y, z, rotY) {
      const { B, r } = ctx, rot = rotEuler(0, rotY, 0);
      box(B, x, y + .9, z, 21, 1.8, 17, PAL.woodD, M.wood, { rot });
      const L = ctx.lay("pallet" + x.toFixed(1) + z.toFixed(1));
      const n = L.int(1, 3), s = L.range(7, 9);
      const goodsCol = L.chance(.5) ? C("#b89a6a") : jit(PAL.wood, L, .2);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < n; k++) {
        const gone = L.chance(.08), gc = jit(goodsCol, L, .1);
        if (gone || (ctx.looted && r.chance(.35))) continue;
        const v = new THREE.Vector3((i - .5) * (s + .3), 0, (j - .5) * (s + .3)).applyMatrix4(rot);
        box(B, x + v.x, y + 1.8 + s / 2 + k * s, z + v.z, s, s, s, gc, M.plain, { rot });
      }
    }
    function drum(ctx, x, y, z) { cyl(ctx.B, x, y, z, 3.1, 3.1, 8.6, 10, ctx.lay("drum" + x.toFixed(1) + z.toFixed(1)).pick([C("#2e5a8a"), C("#8a2a22"), C("#3a6a3a"), C("#6a6a6a")]), M.metal); }

    /* ---------- rubble ---------- */
    function rubble(ctx, cx, y, cz, R, Hp, n, cols, bounds) {
      const { B, r } = ctx;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = R * Math.sqrt(r()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (bounds && (x < bounds[0] || x > bounds[2] || z < bounds[1] || z > bounds[3])) continue;
        const k = 1 - Math.pow(d / R, 1.4), h = Hp * k * r.range(.35, 1), big = r.chance(.08);
        const sx = big ? r.range(5, 11) : r.range(.8, 3.6), sy = big ? r.range(1.2, 2.2) : r.range(.7, 2.4), sz = big ? r.range(4, 8) : r.range(.8, 3.2);
        const col = jit(r.pick(cols), r, .14);
        box(B, x, y + h - sy * .3, z, sx, sy, sz, col, big ? M.concrete : M.rubble, { rot: rotEuler(r.range(-.9, .9), r() * 6.28, r.range(-.9, .9)), skipBottom: true });
      }
      // a few broken joists sticking out of the heap
      const nj = Math.round(n / 60);
      for (let i = 0; i < nj; i++) {
        const a = r() * 6.28, d = R * r.range(.1, .6);
        box(B, cx + Math.cos(a) * d, y + Hp * r.range(.3, .7), cz + Math.sin(a) * d, r.range(18, 34), 2.2, 2.2, jit(PAL.woodD, r, .15), M.wood, { rot: rotEuler(r.range(-.5, .5), r() * 6.28, r.range(-.5, .5)) });
      }
    }

    /* ---------- a roof ---------- */
    function flatRoof(ctx, y, o = {}) {
      const { B, W, D, T } = ctx, r = ctx.lay("roof"), ph = o.parapet ?? 6;
      // the roof deck
      slab(ctx, y + 1.8, 1.8, PAL.tar, M.tar, null, true);
      if (ph > 0) {
        const S = sidesOf(W, D, 2.4);
        for (const k of ["front", "back", "left", "right"]) {
          const s = S[k], extra = k === "front" ? (o.frontRise || 0) : 0;
          storeyWalls({ ...ctx, T: 2.4, course: false }, s, { base: y + 1.8, H: ph + extra }, []);
          if (!ctx.brk) wb(B, s, -.6 - (k === "left" || k === "right" ? 2.4 : 0), s.L + .6 + (k === "left" || k === "right" ? 2.4 : 0), y + 1.8 + ph + extra, y + 1.8 + ph + extra + 1.1, -.6, 3, ctx.trimCol, M.concrete);
        }
      }
      if (ctx.brk) return;
      // what sits on a flat roof
      const spots = [];
      const free = (x, z, rr) => spots.every(([a, b, c]) => Math.hypot(a - x, b - z) > c + rr + 3) && Math.abs(x) < W / 2 - rr - 4 && Math.abs(z) < D / 2 - rr - 4;
      const place = (rr) => { for (let i = 0; i < 30; i++) { const x = r.range(-W / 2, W / 2), z = r.range(-D / 2, D / 2); if (free(x, z, rr)) { spots.push([x, z, rr]); return [x, z]; } } return null; };
      const top = y + 3.6;
      for (let i = 0; i < (o.ac ?? r.int(1, 2)); i++) {
        const p = place(8); if (!p) continue;
        box(B, p[0], top + 4, p[1], 11, 8, 8, C("#a7aaa8"), M.metal);
        cyl(B, p[0] + 2.5, top + 8, p[1], 3, 3, .5, 12, PAL.metalD, M.metal);
        box(B, p[0], top + .4, p[1], 12, .8, 9, PAL.metalD, M.metal);
      }
      for (let i = 0; i < r.int(1, 3); i++) { const p = place(2); if (p) cyl(B, p[0], top, p[1], 1.1, 1.1, r.range(4, 7), 8, PAL.metal, M.metal); }
      if (o.tank) {
        const p = place(11);
        if (p) {
          for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) box(B, p[0] + dx, top + 5, p[1] + dz, 1.2, 10, 1.2, PAL.metalD, M.metal);
          box(B, p[0], top + 10.3, p[1], 15, .8, 15, PAL.woodD, M.wood);
          cyl(B, p[0], top + 10.7, p[1], 8.5, 8.5, 15, 16, C("#7a6248"), M.wood);
          cyl(B, p[0], top + 25.7, p[1], 8.8, .6, 5.5, 16, PAL.tar, M.tar);
        }
      }
      if (o.mast) {
        const p = place(7);
        if (p) {
          const h = o.mast;
          for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) box(B, p[0] + dx * .6, top + h / 2, p[1] + dz * .6, .8, h, .8, PAL.metal, M.metal);
          for (let y = top + 6; y < top + h; y += 6) box(B, p[0], y, p[1], 3.6, .5, 3.6, PAL.metal, M.metal);
          box(B, p[0] + 2.6, top + h - 6, p[1], 1, 9, 3, C("#d8d8d0"), M.plain);
          box(B, p[0] - 2.6, top + h - 10, p[1], 1, 9, 3, C("#d8d8d0"), M.plain);
          box(B, p[0], top + h * .6, p[1] + 3.6, 7, 7, .8, C("#d8d8d0"), M.metal, { rot: rotEuler(-.4, .5, 0) });
          box(B, p[0], top + h + 2, p[1], .4, 4, .4, C("#c83a2a"), M.plain);
        }
      }
      if (o.bulkhead) {
        const p = place(10);
        if (p) {
          box(B, p[0], top + 9, p[1], 16, 18, 14, ctx.wallCol, ctx.wallMat);
          box(B, p[0], top + 18.6, p[1], 17.6, 1.2, 15.6, ctx.trimCol, M.concrete);
          box(B, p[0], top + 7, p[1] + 7.2, 8, 14, .8, ctx.doorCol, M.plain);
        }
      }
    }
    // a gable roof over the footprint, its ridge running along x. pitch: rise over half the depth
    function gableRoof(ctx, y, pitch, o = {}) {
      const { B, W, D, r } = ctx, ov = o.overhang ?? 4, half = D / 2 + ov, rise = (D / 2) * pitch;
      const ang = Math.atan2(rise, D / 2), len = half / Math.cos(ang), th = 1.6;
      const col = o.col || ctx.roofCol, mat = o.mat ?? M.shingle;
      const S = sidesOf(W, D, ctx.T);
      // the gable ends
      if (o.gables !== false) for (const k of ["left", "right"]) {
        const s = S[k], L = s.L + 2 * ctx.T, mid = L / 2 - ctx.T, sO = { ...s, O: k === "left" ? [-W / 2, -D / 2] : [W / 2, D / 2] };
        if (!ctx.brk) prism(B, sO, [[0, 0], [L, 0], [L / 2, rise]], y, 0, ctx.T, ctx.tintCol(o.gableCol || ctx.wallCol), o.gableMat ?? ctx.wallMat);
        else { // a broken gable: only the lower courses, if the walls stand that high
          const reach = ctx.brk(k === "left" ? -W / 2 : W / 2, 0) - y;
          if (reach > 3) prism(B, sO, [[L * .1, 0], [L * .9, 0], [L / 2 + r.range(-8, 8), Math.min(rise * .7, reach)]], y, 0, ctx.T, ctx.tintCol(ctx.wallCol), ctx.wallMat);
        }
        void mid;
      }
      // the two slopes, cut in strips so a ruin can lose some of them
      const strips = Math.max(1, Math.round((W + 2 * ov) / 9));
      for (const side of [1, -1]) {
        for (let i = 0; i < strips; i++) {
          const sw = (W + 2 * ov) / strips, x = -W / 2 - ov + sw * (i + .5);
          const cz = side * half / 2, cy = y + rise - (rise + ov * Math.tan(ang)) / 2 + th / 2;
          if (ctx.brk) {
            const reach = ctx.brk(x, side * D / 4);
            if (reach < y + (o.keepBelow != null ? -o.keepBelow : rise * .6) || r.chance(.35)) {
              // the rafter under a lost strip still spans, if the walls hold it up
              if (reach > y - 2 && i % 2 === 0) box(B, x, cy - 1.8, cz, 1.6, 2.2, len, PAL.woodD, M.wood, { rot: rotEuler(side * ang, 0, 0) });
              continue;
            }
          } else if (o.missing && r.chance(o.missing)) { box(B, x, cy - 1.8, cz, 1.6, 2.2, len, PAL.woodD, M.wood, { rot: rotEuler(side * ang, 0, 0) }); continue; }
          box(B, x, cy, cz, sw + .02, th, len, jit(col, ctx.lay("gs" + side + "," + i), .03), mat, { rot: rotEuler(side * ang, 0, 0) });
        }
      }
      if (!ctx.brk) box(B, 0, y + rise + th * .9, 0, W + 2 * ov, 1.4, 2.4, mul(col, .8), mat === M.corr ? M.metal : M.plain); // the ridge cap
      return rise;
    }

    /* ---------- openings on a facade ---------- */
    const bays = (L, bay, margin) => { const n = Math.max(1, Math.floor((L - 2 * margin) / bay)), sp = (L - 2 * margin) / n; return Array.from({ length: n }, (_, i) => margin + sp * (i + .5)); };
    const win = (c, w, y0, h, extra = {}) => ({ s0: c - w / 2, s1: c + w / 2, y0, y1: y0 + h, kind: "window", ...extra });
    // the layout picks what each opening is; the state decides whether its glass is gone or it is boarded up
    function weather(ctx, ops, storeyIx) {
      const { r, state } = ctx;
      for (const o of ops) {
        if (o.kind === "hole") continue;
        if (state === "i") { if (o.kind === "window" && r.chance(.3)) o.curtain = r.pick(PAL.curtain); continue; }
        if (state === "d") {
          if (o.kind === "window" || o.kind === "shop") { o.broken = r.chance(.4); o.boarded = r.chance(storeyIx === 0 ? .5 : .2); if (!o.broken && r.chance(.25)) o.curtain = r.pick(PAL.curtain); }
          if (o.kind === "door") { o.boarded = r.chance(.35); o.open = !o.boarded && r.chance(.3); }
          if (o.kind === "roller") o.lift = r.chance(.4) ? (o.y1 - o.y0) * r.range(.2, .6) : 0;
          if (o.broken && r.chance(.45)) ctx.soot.push([...at(o.S, (o.s0 + o.s1) / 2, 0), o.base + o.y1, 9]);
        } else {
          o.broken = true; o.boarded = r.chance(.12); o.open = true; o.noFrame = r.chance(.35);
          if (o.kind === "roller") o.open = r.chance(.6), o.lift = (o.y1 - o.y0) * r.range(.4, .8);
          if (r.chance(.5)) ctx.soot.push([...at(o.S, (o.s0 + o.s1) / 2, 0), o.base + o.y1, 12]);
        }
      }
    }
    // a blast hole: a ragged run of narrow openings
    function blast(ctx, S, st, c, w, y0, h) {
      const out = [], n = Math.max(2, Math.round(w / 3.2)), sw = w / n;
      for (let i = 0; i < n; i++) {
        const k = 1 - Math.abs((i + .5) / n - .5) * 2;
        const hh = h * (.35 + .65 * k) * ctx.r.range(.7, 1.1), yy = y0 + (h - hh) / 2 + ctx.r.range(-1.5, 1.5);
        out.push({ s0: c - w / 2 + i * sw, s1: c - w / 2 + (i + 1) * sw, y0: Math.max(.5, yy), y1: Math.min(st.H - 1, yy + hh), kind: "hole" });
      }
      ctx.soot.push([...at(S, c, 0), st.base + y0 + h * .6, w * .8]);
      ctx.holes.push([...at(S, c, -6), st.base, w]);
      return out;
    }
    // drop any opening that a blast hole now overlaps
    const punch = (ops, holes) => [...ops.filter((o) => !holes.some((h) => o.s1 > h.s0 && o.s0 < h.s1)), ...holes];


    /* ---------- more pieces for the later types ---------- */
    // an inside wall from a to b (axis-aligned), y up H, with a doorway at gapAt along it (or none)
    function innerWall(ctx, a, b, y, H, gapAt) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 4) return;
      const A = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], S = { L, O: a, A, I: [-A[1], A[0]] };
      const ops = gapAt == null ? [] : [{ s0: clampN(gapAt - 7, 2, L - 16), s1: clampN(gapAt - 7, 2, L - 16) + 14, y0: 0, y1: Math.min(H - 6, 34), kind: "hole" }];
      const save = { wallCol: ctx.wallCol, wallMat: ctx.wallMat, course: ctx.course, T: ctx.T };
      Object.assign(ctx, { wallCol: ctx.plasterCol, wallMat: M.plain, course: false, T: 1.6 });
      storeyWalls(ctx, S, { base: y, H: H - .2 }, ops);
      Object.assign(ctx, save);
    }
    // raised block letters on a sign face: n letters centred at c along the wall, between y0 and y0 + h
    function letters(ctx, S, c, y0, h, n, col, t) {
      const lw = h * .62, gap = h * .24, total = n * (lw + gap) - gap, s0 = c - total / 2;
      for (let i = 0; i < n; i++) {
        if (ctx.state !== "i" && ctx.r.chance(ctx.state === "r" ? .45 : .2)) continue;
        wb(ctx.B, S, s0 + i * (lw + gap), s0 + i * (lw + gap) + lw, y0, y0 + h, t - .6, t, col, M.plain, { spin: ctx.state === "i" ? 0 : ctx.r.range(-.3, .3) });
      }
    }
    function flagpole(ctx, x, z, h, col) {
      const { B, r } = ctx;
      if (ctx.state === "r" && r.chance(.6)) { box(B, x + h / 2 * .9, 1, z, h, 1.2, 1.2, PAL.metal, M.metal, { rot: rotEuler(0, r.range(-.6, .6), 0) }); return; }
      box(B, x, 1.2, z, 6, 2.4, 6, PAL.concreteD, M.concrete);
      cyl(B, x, 2.4, z, .7, .45, h, 8, C("#c8c8c0"), M.metal);
      if (ctx.state === "i" || r.chance(.5)) box(B, x + 7, 2.4 + h - 5, z, 13, 8, .3, ctx.state === "i" ? col : mul(col, .6), M.plain, { rot: rotEuler(0, r.range(-.2, .2), 0) });
    }
    // a fuel pump on its island
    function pump(ctx, x, z, brand) {
      const { B, r } = ctx, down = ctx.state === "r" && r.chance(.55);
      const rot = down ? rotEuler(r.pick([-1, 1]) * Math.PI / 2 * r.range(.8, 1), r.range(-.5, .5), 0) : rotEuler(0, ctx.state === "d" ? r.range(-.15, .15) : 0, 0);
      const y = down ? 4 : 2 + 7.5;
      box(B, x, y, z, 6.5, 15, 4.2, ctx.state === "i" ? C("#ecebe4") : C("#c9c6bb"), M.plain, { rot });
      const top = new THREE.Vector3(0, 8.4, 0).applyMatrix4(rot), scr = new THREE.Vector3(0, 3.5, 2.2).applyMatrix4(rot);
      box(B, x + top.x, y + top.y, z + top.z, 7, 2.2, 4.8, brand[0], M.plain, { rot });
      box(B, x + scr.x, y + scr.y, z + scr.z, 4, 3, .4, PAL.glass, M.glass, { rot });
      if (!down) box(B, x + 3.6, 6, z, .7, 7, .7, PAL.metalD, M.metal, { rot: rotEuler(0, 0, .2) });
    }


    /* ---------- furniture ----------
       Each piece is drawn in its own frame: x across it, z front-to-back (its front faces +z), standing on the floor at y.
       Where it stands and what it looks like is the layout's; whether it is still there, knocked askew or tipped is the
       state's. A piece under a broken wall's line (buried in a ruin) is left out. */
    const FAB = ["#6a5a7a", "#5a6e5a", "#7a4a3a", "#3e4a62", "#8a7a5a", "#6a3a3a", "#4a5a5a"].map(C);
    const WOOD = ["#6e4e34", "#8a6a48", "#5a3e2a", "#a07a54"].map(C);
    const WHITE = C("#e6e4dc"), DARK = C("#24272b");
    function piece(ctx, x, y, z, rot, draw, o = {}) {
      const { r, state } = ctx;
      if (ctx.brk && ctx.brk(x, z) < y + (o.h || 8)) return;
      const L = ctx.lay("f" + x.toFixed(1) + "," + y.toFixed(0) + "," + z.toFixed(1));
      if (state === "r" && r.chance(.3)) return;
      let R = rot, tilt = 0;
      if (state === "d" && !o.fixed) R += r.range(-.12, .12);
      if (state === "r" && !o.fixed) { R += r.range(-.5, .5); if (r.chance(.3)) tilt = r.range(.15, .45) * r.pick([-1, 1]); }
      const M4 = rotEuler(0, R, 0); if (tilt) M4.multiply(rotEuler(tilt, 0, 0));
      const put = (lx, ly, lz, w, h, d, col, mat, po = {}) => {
        const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(M4);
        box(ctx.B, x + v.x, y + v.y, z + v.z, w, h, d, col, mat, { ...po, rot: po.rot ? M4.clone().multiply(po.rot) : M4 });
      };
      draw(put, L);
    }
    const F = {
      table(ctx, x, y, z, rot, w = 16, d = 10, h = 13) { piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick(WOOD); put(0, h - .4, 0, w, .8, d, c, M.wood); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(a * (w / 2 - 1), (h - .8) / 2, b * (d / 2 - 1), .9, h - .8, .9, mul(c, .8), M.wood); }); },
      chair(ctx, x, y, z, rot, col) { piece(ctx, x, y, z, rot, (put, L) => { const c = col || L.pick(WOOD); put(0, 7, 0, 5, .8, 5, c, M.wood); put(0, 11, -2.2, 5, 7, .8, c, M.wood); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(a * 2.1, 3.3, b * 2.1, .6, 6.6, .6, mul(c, .8), M.wood); }); },
      sofa(ctx, x, y, z, rot, w = 24) { piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick(FAB); put(0, 3, 0, w, 6, 10, c, M.plain); put(0, 8, -4, w, 6, 2.4, c, M.plain); put(-w / 2 + 1.2, 6.5, 0, 2.4, 5, 10, mul(c, .9), M.plain); put(w / 2 - 1.2, 6.5, 0, 2.4, 5, 10, mul(c, .9), M.plain); for (let i = 0; i < Math.round(w / 9); i++) put(-w / 2 + 3 + (i + .5) * (w - 6) / Math.round(w / 9), 6.5, .8, (w - 6) / Math.round(w / 9) - .4, 1.2, 7, mul(c, 1.08), M.plain); }); },
      bed(ctx, x, y, z, rot, double = true) { const w = double ? 22 : 14; piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick(FAB), wd = L.pick(WOOD); put(0, 2.5, 0, w, 4, 36, wd, M.wood); put(0, 5.2, .5, w - 1, 2, 34, WHITE, M.plain); put(0, 6.6, 5, w - .4, .9, 24, c, M.plain); put(0, 6.8, -13, w - 6, 1.8, 5, WHITE, M.plain); put(0, 8, -17.6, w, 15, 1.2, wd, M.wood); }); },
      bunk(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { for (const h of [4, 20]) { put(0, h, 0, 14, 1.2, 34, PAL.metal, M.metal); put(0, h + 1.6, 0, 13, 2, 33, C("#8a8a7a"), M.plain); } for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(a * 6.6, 14, b * 16.6, .9, 28, .9, PAL.metalD, M.metal); }); },
      tv(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put, L) => { put(0, 4, 0, 18, 8, 6, L.pick(WOOD), M.wood); put(0, 13.5, 0, 16, 9, .8, DARK, M.glass); put(0, 8.6, 0, 4, 1.2, 3, DARK, M.metal); }); },
      rug(ctx, x, y, z, rot, w = 26, d = 18) { piece(ctx, x, y, z, rot, (put, L) => put(0, .2, 0, w, .4, d, L.pick([C("#8a3a2a"), C("#3a4a6a"), C("#6a5a3a"), C("#5a3a4a")]), M.plain, { edge: false }), { fixed: true, h: 2 }); },
      counter(ctx, x, y, z, rot, len = 30, top) { piece(ctx, x, y, z, rot, (put, L) => { const cab = L.pick([C("#d8d0bc"), C("#6e4e34"), C("#8a9aa0"), C("#e6e2d6")]); put(0, 7.5, 0, len, 15, 11, cab, M.plain); put(0, 15.5, 0, len + .5, 1, 12, top || L.pick([C("#3a3a3a"), C("#c8c0b0"), C("#5a4a3a")]), M.concrete); for (let i = 0; i < Math.floor(len / 8); i++) put(-len / 2 + 4 + i * 8, 8, 5.6, 7, 12, .3, mul(cab, .92), M.plain); }, { fixed: true }); },
      kitchen(ctx, x, y, z, rot, len = 40) {
        F.counter(ctx, x, y, z, rot, len);
        piece(ctx, x, y, z, rot, (put) => { put(len * .2, 16.3, 0, 8, .6, 6, PAL.metal, M.metal); put(-len * .22, 16.2, 0, 9, .5, 8, DARK, M.metal); for (const a of [-1, 1]) put(-len * .22 + a * 2.2, 16.6, 1.5, 2.6, .3, 2.6, C("#4a4a4a"), M.metal); put(0, 26, -3.5, len, 9, 5, mul(WHITE, .95), M.plain); }, { fixed: true });
      },
      fridge(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 16, 0, 11, 32, 11, WHITE, M.plain); put(4, 18, 5.6, .6, 9, .6, PAL.metal, M.metal); put(0, 22, 5.55, 10.6, .3, .2, C("#b8b6ae"), M.plain); }); },
      cooler(ctx, x, y, z, rot, len = 30) { piece(ctx, x, y, z, rot, (put, L) => { put(0, 17, 0, len, 34, 10, WHITE, M.plain); for (let s = 0; s < 4; s++) for (let i = 0; i < Math.floor(len / 3.4); i++) { if (L.chance(ctx.state === "i" ? .1 : .55)) continue; put(-len / 2 + 2 + i * 3.4, 6 + s * 7.5, 2, 2.4, 4.5, 2.4, L.pick(PAL.goods), M.plain); } put(0, 19, 5.1, len - 1.5, 28, .3, C("#9fb4c0"), M.glass, { edge: false }); for (let i = 1; i < Math.round(len / 10); i++) put(-len / 2 + i * len / Math.round(len / 10), 19, 5.3, .8, 28, .6, PAL.metal, M.metal); }, { fixed: true }); },
      desk(ctx, x, y, z, rot, screen = true) { piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick([C("#c8b89a"), C("#8a6a48"), C("#d8d4c8")]); put(0, 12.4, 0, 20, .8, 10, c, M.wood); put(-9.4, 6, 0, 1, 12, 9.6, mul(c, .85), M.wood); put(9.4, 6, 0, 1, 12, 9.6, mul(c, .85), M.wood); put(0, 7, -4.6, 18, 9, .6, mul(c, .8), M.wood); if (screen) { put(-2, 16.5, -2.5, 8, 5.6, .6, DARK, M.glass); put(-2, 13.6, -2.5, 1, 1.6, 1, DARK, M.metal); put(1, 13, 1.5, 6, .4, 2.5, C("#3a3a3a"), M.plain); } if (L.chance(.6)) put(6, 13.4, 1, 4, 1.2, 5, WHITE, M.plain); }); F.chair(ctx, x + Math.sin(rot) * 9, y, z + Math.cos(rot) * 9, rot + Math.PI, C("#2a2c30")); },
      cubicle(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { const c = C("#8a8e94"); put(0, 8, 0, 44, 16, 1, c, M.plain); put(0, 8, 0, 1, 16, 26, c, M.plain); for (const a of [-1, 1]) put(a * 21.5, 8, a > 0 ? -6 : 6, 1, 16, 14, c, M.plain); }, { fixed: true }); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.desk(ctx, x + a * 11 * Math.cos(rot) + b * 6.5 * Math.sin(rot), y, z - a * 11 * Math.sin(rot) + b * 6.5 * Math.cos(rot), rot + (b > 0 ? 0 : Math.PI)); },
      filing(ctx, x, y, z, rot, n = 2) { piece(ctx, x, y, z, rot, (put) => { for (let i = 0; i < n; i++) { put(-((n - 1) * 4) + i * 8, 11, 0, 7.6, 22, 9, C("#8a8e8a"), M.metal); for (let k = 0; k < 4; k++) put(-((n - 1) * 4) + i * 8, 3 + k * 5.4, 4.6, 3, .6, .4, PAL.metalD, M.metal); } }); },
      lockers(ctx, x, y, z, rot, n = 5) { piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick([C("#5a6e8a"), C("#7a8a6a"), C("#9a9a96"), C("#8a4a3a")]); for (let i = 0; i < n; i++) { const lx = -((n - 1) * 3.4) + i * 6.8; put(lx, 17, 0, 6.6, 34, 7, c, M.metal); put(lx, 30, 3.6, 4, 2, .3, mul(c, .7), M.metal); put(lx + 2, 17, 3.6, .5, 3, .4, PAL.metalD, M.metal); } }, { fixed: true }); },
      washer(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 8, 0, 10, 16, 10, WHITE, M.plain); put(0, 9, 5.1, 6, 6, .4, C("#5a6a78"), M.glass); put(0, 15, 4.6, 8, 1.6, 1, C("#b8b6ae"), M.plain); }, { fixed: true }); },
      booth(ctx, x, y, z, rot, col) { piece(ctx, x, y, z, rot, (put, L) => { const c = col || L.pick([C("#9a2a2a"), C("#2a6a7a"), C("#c8a040")]); for (const s of [-1, 1]) { put(0, 3.5, s * 8.5, 18, 7, 6, c, M.plain); put(0, 10, s * 11, 18, 11, 2, c, M.plain); } put(0, 12, 0, 16, .8, 9, C("#e8e4da"), M.plain); put(0, 6, 0, 1.6, 12, 1.6, PAL.metal, M.metal); }, { fixed: true }); },
      stool(ctx, x, y, z) { piece(ctx, x, y, z, 0, (put, L) => { put(0, 5, 0, 1, 10, 1, PAL.metal, M.metal); put(0, 10.4, 0, 4, 1, 4, L.pick([C("#9a2a2a"), C("#2a6a7a")]), M.plain); }); },
      pew(ctx, x, y, z, rot, len = 30) { piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick(WOOD); put(0, 7, 0, len, 1.2, 7, c, M.wood); put(0, 12, -3, len, 9, 1, c, M.wood); put(-len / 2, 7, 0, 1.2, 12, 8, mul(c, .85), M.wood); put(len / 2, 7, 0, 1.2, 12, 8, mul(c, .85), M.wood); }); },
      altar(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 4, 0, 40, 4, 22, C("#7a5a3c"), M.wood); put(0, 13, -4, 22, 14, 9, C("#ece8dc"), M.plain); put(0, 13, 0.6, 6, 13, .3, C("#7a2a2a"), M.plain); for (const a of [-1, 1]) { put(a * 8, 21, -4, 1, 3, 1, C("#e8d8a0"), M.plain); } put(0, 30, -8, 1.4, 16, 1.4, C("#b08a3e"), M.metal); put(0, 34, -8, 8, 1.4, 1.4, C("#b08a3e"), M.metal); }, { fixed: true }); },
      hospitalBed(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 7, 0, 14, 1.4, 34, PAL.metal, M.metal); put(0, 8.6, 0, 13, 2, 33, WHITE, M.plain); put(0, 9.7, 5, 13.4, .7, 20, C("#a8c0c8"), M.plain); put(0, 12, -17, 14, 10, 1, PAL.metal, M.metal); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(a * 6, 3.5, b * 16, .8, 7, .8, PAL.metalD, M.metal); put(-11, 30, 0, .4, .4, 38, PAL.metal, M.metal); put(-11, 17, 6, .3, 26, 22, C("#7aa8a0"), M.plain); put(9, 22, -14, 1, 30, 1, PAL.metal, M.metal); put(9, 32, -14, 4, 4, 1.4, DARK, M.glass); }); },
      truck(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { const red = C("#b8241e"); put(0, 13, -6, 26, 18, 56, red, M.plain); put(0, 15, 25, 26, 22, 14, red, M.plain); put(0, 21, 31.9, 22, 9, .4, C("#2a3a44"), M.glass); put(0, 6, 32.6, 26, 3, 1, C("#c8c8c0"), M.metal); for (const zz of [22, -12, -24]) for (const a of [-1, 1]) put(a * 12.6, 4, zz, 3, 8, 8, DARK, M.plain); put(0, 26.6, 25, 18, 1.6, 3, C("#d83a2a"), M.glass); for (const a of [-1, 1]) put(a * 6, 23.2, -8, 1, 1, 50, C("#c8c8c0"), M.metal); for (let i = -6; i < 7; i++) put(0, 23.2, -8 + i * 3.8, 12, .6, .6, C("#c8c8c0"), M.metal); put(0, 13, -6, 26.4, 1.4, 56.4, C("#e8e0c8"), M.plain); for (const a of [-1, 1]) for (let i = 0; i < 3; i++) put(a * 13.1, 12, -26 + i * 14, .4, 9, 11, mul(red, .85), M.plain); }, { h: 20 }); },
      forklift(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { const yel = C("#d8a02a"); put(0, 6, 0, 12, 8, 18, yel, M.plain); put(0, 13, -3, 10, 7, 8, mul(yel, .9), M.plain); put(0, 18, -3, 11, .8, 10, DARK, M.metal); for (const a of [-1, 1]) { put(a * 5, 15, -7, .8, 14, .8, DARK, M.metal); put(a * 5, 15, 1, .8, 14, .8, DARK, M.metal); } put(0, 14, 10, 10, 26, 1.2, DARK, M.metal); for (const a of [-1, 1]) put(a * 3, 1, 15, 1.4, 1, 10, C("#5a5a5a"), M.metal); for (const zz of [-6, 6]) for (const a of [-1, 1]) put(a * 6.4, 3, zz, 2, 6, 6, DARK, M.plain); }); },
      racking(ctx, x, y, z, rot, len = 60) { piece(ctx, x, y, z, rot, (put, L) => { const o = C("#d86a2a"), b = C("#2a4a8a"); for (let i = 0; i <= Math.round(len / 25); i++) put(-len / 2 + i * len / Math.round(len / 25), 25, 0, 1.4, 50, 12, b, M.metal); for (const hh of [1, 17, 33]) { put(0, hh + 1, 0, len, 1.6, 12, o, M.metal); for (let i = 0; i < Math.round(len / 25); i++) { if (L.chance(ctx.state === "i" ? .2 : .55)) continue; const cx = -len / 2 + (i + .5) * len / Math.round(len / 25); put(cx, hh + 2.6, 0, 21, 1.4, 11, PAL.woodD, M.wood); put(cx, hh + 8.3, 0, 19, 10, 10, L.chance(.5) ? C("#b89a6a") : jit(PAL.wood, L, .2), M.plain); } } }, { fixed: true }); },
      plant(ctx, x, y, z) { piece(ctx, x, y, z, 0, (put, L) => { put(0, 3, 0, 5, 6, 5, L.pick([C("#8a5a3a"), C("#d8d4c8")]), M.plain); const g = ctx.state === "i" ? C("#4a7a3a") : C("#6a6a3a"); for (let i = 0; i < 4; i++) put(L.range(-2, 2), 9 + L.range(0, 5), L.range(-2, 2), L.range(4, 7), L.range(4, 7), L.range(4, 7), jit(g, L, .15), M.plain, { rot: rotEuler(L.range(0, 1), L.range(0, 3), 0) }); }); },
      boxes(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put, L) => { const n = L.int(3, 6); for (let i = 0; i < n; i++) { const s = L.range(5, 9); put(L.range(-6, 6), s / 2 + (i > 2 ? 8 : 0), L.range(-6, 6), s, s, s * L.range(.8, 1.2), jit(C("#b89a6a"), L, .12), M.plain, { rot: rotEuler(0, L.range(-.5, .5), 0) }); } }); },
      wardrobe(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick(WOOD); put(0, 17, 0, 18, 34, 9, c, M.wood); put(0, 17, 4.6, .4, 32, .3, mul(c, .7), M.wood); }); },
      bookcase(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put, L) => { const c = L.pick(WOOD); put(0, 15, -2, 16, 30, 1, c, M.wood); for (const a of [-1, 1]) put(a * 7.6, 15, 0, .8, 30, 6, c, M.wood); for (let k = 0; k < 4; k++) { put(0, 1 + k * 7.5, 0, 15, .8, 6, c, M.wood); for (let i = 0; i < 5; i++) if (L.chance(.8)) put(-6 + i * 3, 4.5 + k * 7.5, .5, L.range(1.4, 2.6), L.range(4.5, 6), 4.5, L.pick(PAL.goods), M.plain); } }); },
      bench(ctx, x, y, z, rot, len = 24) { piece(ctx, x, y, z, rot, (put) => { put(0, 7, 0, len, 1, 6, C("#5a6a7a"), M.plain); put(0, 11, -2.6, len, 7, .8, C("#5a6a7a"), M.plain); for (const a of [-1, 1]) put(a * (len / 2 - 2), 3.5, 0, 1, 7, 5, PAL.metalD, M.metal); }); },
      toilet(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 4, 1, 5, 8, 7, WHITE, M.plain); put(0, 9, -2.5, 6, 6, 2.4, WHITE, M.plain); }); },
      oven(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 12, 0, 22, 24, 14, C("#8a8e92"), M.metal); put(0, 13, 7.1, 14, 6, .3, DARK, M.glass); put(0, 26, 0, 22, 4, 14, C("#6a6e72"), M.metal); }, { fixed: true }); },
      barberChair(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 2, 0, 6, 4, 6, C("#c8c8c0"), M.metal); put(0, 9, 0, 8, 2, 8, C("#9a2a2a"), M.plain); put(0, 15, -3.4, 8, 10, 1.6, C("#9a2a2a"), M.plain); put(0, 9, 5, 8, 1, 2, C("#c8c8c0"), M.metal); put(0, 22, -12, 18, 16, .6, C("#b8c8d0"), M.glass); }); },
      copier(ctx, x, y, z, rot) { piece(ctx, x, y, z, rot, (put) => { put(0, 8, 0, 12, 16, 10, C("#d8d6ce"), M.plain); put(0, 17, 0, 12, 2, 10, C("#9a9a96"), M.plain); }); },
      meeting(ctx, x, y, z, rot, n = 3) { F.table(ctx, x, y, z, rot, 12 + n * 8, 14, 13); for (let i = 0; i < n; i++) for (const s of [-1, 1]) { const lx = -(n - 1) * 4 + i * 8, lz = s * 10; F.chair(ctx, x + lx * Math.cos(rot) + lz * Math.sin(rot), y, z - lx * Math.sin(rot) + lz * Math.cos(rot), rot + (s > 0 ? Math.PI : 0), C("#2a2c30")); } },
      dining(ctx, x, y, z, rot) { F.table(ctx, x, y, z, rot, 18, 12, 13); for (const [lx, lz, a] of [[-5, -8, 0], [5, -8, 0], [-5, 8, Math.PI], [5, 8, Math.PI]]) F.chair(ctx, x + lx * Math.cos(rot) + lz * Math.sin(rot), y, z - lx * Math.sin(rot) + lz * Math.cos(rot), rot + a); },
    };
    // a living room: sofa facing a television over a rug, a low table, maybe a bookcase
    function livingRoom(ctx, cx, y, cz, rot) {
      const p = (lx, lz) => [cx + lx * Math.cos(rot) + lz * Math.sin(rot), cz - lx * Math.sin(rot) + lz * Math.cos(rot)];
      F.rug(ctx, cx, y, cz, rot);
      F.sofa(ctx, p(0, -10)[0], y, p(0, -10)[1], rot);
      F.tv(ctx, p(0, 12)[0], y, p(0, 12)[1], rot + Math.PI);
      F.table(ctx, cx, y, cz, rot, 12, 7, 6);
      if (ctx.lay("lr" + cx.toFixed(0)).chance(.6)) F.bookcase(ctx, p(18, -6)[0], y, p(18, -6)[1], rot - Math.PI / 2);
    }

    /* ---------- rooms that suit the building ----------
       Inside of the outer walls: x0..x1, z0..z1 (z1 is the front). Stairs climb the back-left corner (or p.stairX) to
       about z0 + 52; the cross wall (finishStorey) stands at zp = z0 + 55 when the building is wide enough. */
    function roomsOf(p) {
      const x0 = -p.W / 2 + p.T + 1, x1 = p.W / 2 - p.T - 1, z0 = -p.D / 2 + p.T + 1, z1 = p.D / 2 - p.T - 1;
      const zp = !p.noPartition && p.W > 70 ? -p.D / 2 + p.T + 58 : null;
      const sx = p.stairX ?? (-p.W / 2 + p.T);
      return { x0, x1, z0, z1, zp, sx, stairR: sx > 0 ? x1 - 13 : x0 + 13 };
    }
    /* ---------- floor plans (13 Nov 2026): rooms that flow ----------
       A storey is cut into a corridor (or hall) and the rooms off it, the way real buildings are drawn: the front door
       opens into a lobby or living room, the lobby opens onto the corridor, every room has a door onto the corridor,
       and the stairs sit in the same core on every floor, so you come up where you went up. Front is +z. */
    const stairRun = (p) => Math.max(...p.storeys.map((s, i) => { const h = s.H - (i === 0 ? 3 : 0), n = Math.max(6, Math.round(h / 3.4)); return n * 3.2; }));
    function floorPlan(p, lvl, scheme, ctx) {
      const key = "fp:" + lvl + scheme; if (p[key]) return p[key];
      const L = rng("plan:" + p.seed + ":" + lvl), T = p.T, x0 = -p.W / 2 + T + .8, x1 = p.W / 2 - T - .8, z0 = -p.D / 2 + T + .8, z1 = p.D / 2 - T - .8;
      const sx = p.stairX ?? (-p.W / 2 + T), multi = p.storeys.length > 1, coreW = 14, run = multi ? stairRun(p) + 3 : 0;
      const left = sx < 0, cx0 = left ? x0 : x1 - coreW, cx1 = left ? x0 + coreW : x1; // the stair core's span
      const doorXs = (ctx && ctx.doorXs && ctx.doorXs.length ? ctx.doorXs : [0]);
      const rooms = [], walls = [];
      const split = (a, b, min, max) => { const n = Math.max(1, Math.round((b - a) / L.range(min, max))); const out = []; let s = a; for (let i = 0; i < n; i++) { const e = i === n - 1 ? b : s + (b - a) / n * L.range(.85, 1.15); out.push([s, e]); s = e; } return out; };
      const cw = scheme === "house" ? 15 : 20, depth = z1 - z0;
      if (scheme === "open" || depth < 70 && !multi) { rooms.push({ x0, z0, x1, z1, use: "main", door: "z1" }); return (p[key] = { rooms, walls, hall: null }); }
      // the corridor runs side to side where the stairs come up; the back band holds the core and rooms behind it,
      // the front band the rooms along the street; a shallow building gets a front room and a back strip instead
      let zc0 = z0 + Math.max(run, scheme === "house" ? 34 : 40), zc1 = zc0 + cw;
      const front = z1 - zc1;
      if (front < 30 || scheme === "shallow") { // no room for a corridor, or a shop: front room and back strip: front room and a back strip with doors into it
        const zb = z0 + Math.max(run, 30);
        rooms.push({ x0, z0: zb, x1, z1, use: "front", door: "z1" });
        if (multi) rooms.push({ x0: cx0, z0, x1: cx1, z1: zb, use: "core", open: true });
        const parts = split(left ? cx1 : x0, left ? x1 : cx0, 34, 52);
        parts.forEach(([a, b], i) => { rooms.push({ x0: a, z0, x1: b, z1: zb, use: "back" + i, door: "z+" }); });
        const segs = []; let edges = [x0, ...(multi ? [cx0, cx1] : []), ...parts.map((q) => q[1]), x1].filter((v, i, A) => A.indexOf(v) === i).sort((a, b) => a - b);
        for (const [a, b] of parts) walls.push({ a: [a, zb], b: [b, zb], gap: (b - a) / 2 });
        for (const e of edges.slice(1, -1)) if (!(multi && (e === cx0 || e === cx1) && false)) walls.push({ a: [e, z0], b: [e, zb], gap: null });
        void segs; return (p[key] = { rooms, walls, hall: null, zb });
      }
      const hall = { x0, z0: zc0, x1, z1: zc1, use: "corridor" };
      if (multi) rooms.push({ x0: cx0, z0, x1: cx1, z1: zc0, use: "core", open: true });
      // the back band, past the core
      const bA = multi && left ? cx1 : x0, bB = multi && !left ? cx0 : x1;
      const back = split(bA, bB, scheme === "house" ? 40 : 44, scheme === "house" ? 60 : 70).map(([a, b], i) => ({ x0: a, z0, x1: b, z1: zc0, band: "back", door: "z+", i }));
      // the front band: on the ground floor the room the front door opens into is the lobby (open onto the corridor)
      const fr = split(x0, x1, scheme === "house" ? 40 : 46, scheme === "house" ? 64 : 76).map(([a, b], i) => ({ x0: a, z0: zc1, x1: b, z1, band: "front", door: "z-", i }));
      if (lvl === 0) { const dx = doorXs[0]; const lob = fr.find((q) => dx >= q.x0 - 1 && dx <= q.x1 + 1) || fr[Math.floor(fr.length / 2)]; lob.lobby = true; lob.open = true; }
      rooms.push(...back, ...fr);
      // walls: along both sides of the corridor (a door into each room, none into the lobby or core), and between rooms
      for (const q of back) walls.push({ a: [q.x0, zc0], b: [q.x1, zc0], gap: (q.x1 - q.x0) / 2 + L.range(-.2, .2) * (q.x1 - q.x0) });
      for (const q of fr) if (!q.open) walls.push({ a: [q.x0, zc1], b: [q.x1, zc1], gap: (q.x1 - q.x0) / 2 + L.range(-.2, .2) * (q.x1 - q.x0) });
      const bx = [...new Set([...(multi ? [left ? cx1 : cx0] : []), ...back.slice(0, -1).map((q) => q.x1)])];
      for (const x of bx) walls.push({ a: [x, z0], b: [x, zc0], gap: null });
      for (const q of fr.slice(0, -1)) walls.push({ a: [q.x1, zc1], b: [q.x1, z1], gap: null });
      return (p[key] = { rooms, walls, hall, zc0, zc1 });
    }
    // what each room is for, by building and floor
    const ROOM_USES = {
      office: { lobby: "reception", list: ["office", "office", "meeting", "office", "open", "restroom", "break", "storage", "office"] },
      apartment: { lobby: "mailroom", list: ["unit"], ground: ["unit", "laundry", "unit", "storage", "unit"] },
      clinic: { lobby: "waiting", list: ["exam", "exam", "restroom", "nurse", "exam", "storage", "exam"], upper: ["ward", "ward", "office", "ward", "storage", "ward"] },
      police: { lobby: "frontdesk", list: ["cells", "office", "interview", "lockers", "office", "evidence"], upper: ["office", "meeting", "office", "open", "break", "office"] },
      house: { lobby: "living", list: ["kitchen", "bath", "bedroom", "dining"], upper: ["bedroom", "bath", "bedroom", "bedroom", "office"] },
      shop: { front: "sales", list: ["stock", "restroom", "office", "stock"], upper: ["living", "kitchen", "bedroom", "bath", "bedroom"] },
      diner: { front: "diningroom", list: ["kitchenroom", "restroom", "stock", "office"] },
    };
    function usesFor(p, plan, kind, lvl) {
      const U = ROOM_USES[kind]; let i = 0;
      const list = lvl > 0 && U.upper ? U.upper : lvl === 0 && U.ground ? U.ground : U.list;
      for (const q of plan.rooms) {
        if (q.use === "core" || q.use === "main") continue;
        if (q.lobby) { q.use = U.lobby; continue; }
        if (q.use === "front") { q.use = U.front || U.lobby; continue; }
        q.use = list[(i++ + (p.seed || 0)) % list.length];
      }
      // a house's ground floor: the kitchen goes in the back band, the bedrooms go upstairs when there is one
      if (kind === "house" && lvl === 0) { const back = plan.rooms.filter((q) => q.band === "back"); back.forEach((q, k) => q.use = k === 0 ? "kitchen" : k === 1 && p.storeys.length === 1 ? "bath" : p.storeys.length === 1 ? "bedroom" : "dining"); plan.rooms.filter((q) => q.band === "front" && !q.lobby).forEach((q, k) => q.use = p.storeys.length === 1 ? (k % 2 ? "bedroom" : "bedroom") : k ? "office" : "dining"); }
    }
    // furnish one room: against the wall away from its door, facing in
    function furnishRoom(ctx, q, y, kind) {
      const w = q.x1 - q.x0, d = q.z1 - q.z0, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
      const doorPlus = q.door === "z+" || q.door === "z1", farZ = doorPlus ? q.z0 : q.z1, sgn = doorPlus ? 1 : -1, rot = doorPlus ? 0 : Math.PI;
      const at = (off) => farZ + sgn * off, nearZ = doorPlus ? q.z1 : q.z0, L = ctx.lay("room" + q.x0.toFixed(0) + q.z0.toFixed(0) + y.toFixed(0));
      ctx.y0 = y; ctx.looted = ctx.state !== "i";
      switch (q.use) {
        case "office": F.desk(ctx, cx, y, at(12), rot + Math.PI); F.chair(ctx, cx, y, at(20), rot + Math.PI); F.filing(ctx, q.x1 - 5, y, at(8), rot, 2); if (w > 40) F.bookcase(ctx, q.x0 + 8, y, at(4), rot); F.plant(ctx, q.x0 + 4, y, nearZ - sgn * 5); break;
        case "meeting": F.meeting(ctx, cx, y, cz, 0, Math.max(2, Math.min(4, Math.floor(w / 18)))); break;
        case "open": for (let x = q.x0 + 22; x < q.x1 - 18; x += 40) for (let z = q.z0 + 18; z < q.z1 - 14; z += 30) F.cubicle(ctx, x, y, z, 0); break;
        case "restroom": for (let x = q.x0 + 6; x < q.x1 - 4; x += 10) F.toilet(ctx, x, y, at(4), rot); F.counter(ctx, cx, y, nearZ - sgn * 6, rot + Math.PI, Math.min(24, w - 10), C("#d8d8d0")); for (let x = q.x0 + 11; x < q.x1 - 6; x += 10) box(ctx.B, x, y + 13, at(8), .6, 26, 14, C("#8a9a9a"), M.plain); break;
        case "break": F.kitchen(ctx, cx, y, at(5), rot, Math.min(36, w - 10)); F.fridge(ctx, q.x1 - 6, y, at(5), rot); F.table(ctx, cx, y, cz + sgn * 4, 0, 16, 10); F.chair(ctx, cx - 6, y, cz + sgn * 4 - 8, 0); F.chair(ctx, cx + 6, y, cz + sgn * 4 + 8, Math.PI); break;
        case "storage": case "stock": case "evidence": shelf(ctx, cx, at(5), Math.min(w - 8, 40), 22, 5, true); if (d > 34) shelf(ctx, cx, at(20), Math.min(w - 12, 34), 22, 5, true); F.boxes(ctx, q.x1 - 8, y, nearZ - sgn * 8, .3); break;
        case "reception": case "frontdesk": case "waiting": case "mailroom": {
          if (q.use === "mailroom") piece(ctx, q.x0 + 3, y, cz, Math.PI / 2, (put) => { for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) put(-7.5 + i * 5, 17 + k * 4.4, 0, 4.6, 4, 1.6, PAL.metal, M.metal); }, { fixed: true });
          else F.counter(ctx, cx, y, cz - 4, 0, Math.min(34, w - 20), C("#5a4a3a"));
          if (q.use !== "mailroom") F.chair(ctx, cx, y, cz - 10, Math.PI);
          F.bench(ctx, q.x0 + 14, y, q.z1 - 6, Math.PI, 20); if (w > 50) F.bench(ctx, q.x1 - 14, y, q.z1 - 6, Math.PI, 20); F.plant(ctx, q.x1 - 5, y, q.z1 - 18);
          break;
        }
        case "unit": { // one flat: a bedroom against the outside wall behind a wall with a doorway; living and kitchen by its door
          const zm = farZ + sgn * Math.min(42, d * .48);
          innerWall(ctx, [q.x0, zm], [q.x1, zm], y, Math.min(40, ctx.H || 40), w * .3);
          F.bed(ctx, cx + w * .12, y, at(20), rot); F.wardrobe(ctx, q.x0 + 6, y, at(4), rot);
          F.kitchen(ctx, q.x1 - 18, y, zm + sgn * 5, rot, Math.min(28, w * .45)); F.sofa(ctx, q.x0 + 16, y, (zm + nearZ) / 2, Math.PI / 2, 18); F.table(ctx, cx + 6, y, (zm + nearZ) / 2 + sgn * 3, 0, 12, 10); break;
        }
        case "laundry": for (let x = q.x0 + 6; x < q.x1 - 5; x += 11) F.washer(ctx, x, y, at(5), rot); F.bench(ctx, cx, y, nearZ - sgn * 8, rot, Math.min(24, w - 14)); break;
        case "exam": F.hospitalBed(ctx, cx, y, at(20), rot); F.counter(ctx, q.x1 - 6, y, cz, -Math.PI / 2, Math.min(20, d - 12), C("#c8ccc8")); F.chair(ctx, q.x0 + 6, y, nearZ - sgn * 8, rot + Math.PI); break;
        case "ward": for (let x = q.x0 + 13; x < q.x1 - 10; x += 22) F.hospitalBed(ctx, x, y, at(20), rot); break;
        case "nurse": F.counter(ctx, cx, y, cz, rot, Math.min(30, w - 12), C("#c8ccc8")); F.desk(ctx, cx, y, at(10), rot + Math.PI); F.filing(ctx, q.x0 + 5, y, at(5), rot, 2); break;
        case "cells": { const n = Math.max(1, Math.floor(w / 24)); for (let i = 0; i < n; i++) { const a = q.x0 + i * w / n, b = a + w / n; if (i) innerWall(ctx, [a, q.z0], [a, q.z1 - (doorPlus ? 4 : 0)], y, 32, null); F.bunk(ctx, (a + b) / 2 - 2, y, at(19), rot); F.toilet(ctx, b - 5, y, at(4), rot); }
          if (!ctx.brk || ctx.brk(cx, nearZ) > y + 30) for (let x = q.x0 + 2; x < q.x1 - 1; x += 2.6) box(ctx.B, x, y + 16, nearZ - sgn * 3, .6, 32, .6, PAL.metalD, M.metal); break; }
        case "interview": F.table(ctx, cx, y, cz, 0, 16, 10); F.chair(ctx, cx, y, cz - 8, 0); F.chair(ctx, cx, y, cz + 8, Math.PI); break;
        case "lockers": F.lockers(ctx, cx, y, at(3), rot, Math.max(2, Math.floor((w - 8) / 5.5))); F.bench(ctx, cx, y, cz, 0, Math.min(26, w - 12)); break;
        case "living": livingRoom(ctx, cx, y, cz + 4, Math.PI); break;
        case "kitchen": F.kitchen(ctx, cx, y, at(5), rot, Math.min(40, w - 10)); F.fridge(ctx, q.x1 - 6, y, at(5), rot); if (d > 46) F.dining(ctx, cx, y, nearZ - sgn * 16, 0); break;
        case "dining": F.dining(ctx, cx, y, cz, 0); F.bookcase(ctx, q.x0 + 8, y, at(3), rot); break;
        case "bedroom": F.bed(ctx, cx, y, at(20), rot, w > 40); F.wardrobe(ctx, q.x0 + 6, y, at(4), rot); if (w > 46) F.desk(ctx, q.x1 - 10, y, nearZ - sgn * 10, rot, false); break;
        case "bath": F.toilet(ctx, q.x0 + 5, y, at(4), rot); F.counter(ctx, q.x1 - 8, y, at(5), rot, 12, C("#d8d8d0")); box(ctx.B, cx, y + 2.5, nearZ - sgn * 10, Math.min(24, w - 6), 5, 12, WHITE, M.plain); break;
        case "sales": { const aw = w * .45; for (const t of [.35, .62]) shelf(ctx, cx + 4, q.z0 + d * t, aw, 20, 5, true); F.counter(ctx, q.x1 - 8, y, q.z1 - 16, -Math.PI / 2, 22, C("#3a3a3a")); F.cooler(ctx, q.x0 + 6, y, cz, Math.PI / 2, Math.min(40, d - 16)); break; }
        case "diningroom": for (let x = q.x0 + 14; x < q.x1 - 10; x += 22) F.booth(ctx, x, y, q.z1 - 9, 0); F.counter(ctx, cx, y, q.z0 + 12, Math.PI, Math.min(70, w - 30), C("#c8c8c0")); for (let x = cx - Math.min(30, w / 2 - 14); x < cx + Math.min(30, w / 2 - 14); x += 9) F.stool(ctx, x, y, q.z0 + 20); break;
        case "kitchenroom": F.oven(ctx, cx - 8, y, at(6), rot); F.fridge(ctx, q.x1 - 6, y, at(5), rot); F.kitchen(ctx, q.x0 + 16, y, at(5), rot, Math.min(24, w * .4)); F.counter(ctx, cx, y, cz + sgn * 4, rot, Math.min(30, w - 16), C("#b8bcbc")); break;
        case "front": case "main": default: break;
      }
    }
    // draw a planned storey: its inside walls, then each room's things
    function plannedInside(ctx, p, lvl, y, kind) {
      const st = p.storeys[lvl], H = st.H - (lvl === 0 ? 3 : 0), plan = floorPlan(p, lvl, kind === "house" || kind === "shop" && lvl > 0 ? "house" : kind === "shop" || kind === "diner" ? "shallow" : "corridor", ctx);
      usesFor(p, plan, kind, lvl); ctx.H = H;
      for (const w of plan.walls) innerWall(ctx, w.a, w.b, y, H, w.gap);
      for (const q of plan.rooms) furnishRoom(ctx, q, y, kind);
      // a corridor gets a runner of lighter floor and a plant at its end
      if (plan.hall && !ctx.brk) box(ctx.B, 0, y + .05, (plan.zc0 + plan.zc1) / 2, plan.hall.x1 - plan.hall.x0 - 2, .1, plan.zc1 - plan.zc0 - 2, mul(p.floorCol || PAL.floorWood, 1.12), M.plain, { edge: false });
      return plan;
    }
    /* ---------- the mall's insides ---------- */
    // an escalator from (x, z) at y0 running dir along x to y1: a sloped truss, the step band, glass sides, landings
    function ESCALATOR(ctx, x, z, run, y0, y1, dir) {
      const { B, state, r } = ctx, rise = y1 - y0, ang = Math.atan2(rise, run), len = Math.hypot(run, rise), mx = x + dir * run / 2, my = (y0 + y1) / 2;
      if (ctx.brk && ctx.brk(mx, z) < my) { box(B, mx, y0 + 4, z, run * .7, 6, 12, PAL.metalD, M.metal, { rot: rotEuler(r.range(-.2, .2), r.range(-.3, .3), dir * .15) }); return; }
      const R = rotEuler(0, 0, dir * ang);
      box(B, mx, my - 3, z, len, 6, 13, C("#8a8e92"), M.metal, { rot: R });
      box(B, mx, my + .2, z, len, .6, 10, C("#2e3034"), M.metal, { rot: R });
      for (const s of [-1, 1]) { box(B, mx, my + 5, z + s * 5.6, len, 9, .6, PAL.glass, M.glass, { rot: R }); box(B, mx, my + 9.8, z + s * 5.6, len, 1, 1.4, DARK, M.plain, { rot: R }); }
      for (const [lx, ly] of [[x - dir * 6, y0], [x + dir * (run + 6), y1]]) box(B, lx, ly + .3, z, 12, .6, 12, C("#9a9ea2"), M.metal);
      if (state === "d") box(B, mx, my + 1, z, 4, 2, 8, DARK, M.plain);
    }
    // a department store's floor: cosmetics and jewellery by the mall entrance, racks of clothes, a till, fitting rooms;
    // upstairs, home goods. s: which end (-1 west, 1 east); the store's floor runs xa..xb, zst (stockroom wall)..zfront
    function ANCHOR(ctx, p, lvl, y, s, xa, xb, zst, zfr) {
      const mallSide = s < 0 ? xb : xa, out = s < 0 ? xa : xb, w = xb - xa, mid = (xa + xb) / 2, L = ctx.lay("anchor" + s + lvl);
      ctx.y0 = y; ctx.looted = ctx.state !== "i";
      if (lvl === 0) {
        // glass counters in a square by the mall entrance
        const gx = mallSide - s * 40, gz = (p.zc0 + p.zc1) / 2;
        for (const [dx, dz, rr] of [[0, -22, 0], [0, 22, Math.PI], [-s * 22, 0, Math.PI / 2], [s * 22, 0, -Math.PI / 2]]) piece(ctx, gx + dx, y, gz + dz, rr, (put) => { put(0, 5, 0, 30, 10, 7, C("#e8e4dc"), M.plain); put(0, 11, 0, 30, 2, 7, PAL.glass, M.glass); put(0, 12.4, 0, 30.4, .6, 7.4, C("#c8b070"), M.metal); }, { fixed: true });
        // the till, by the front doors
        F.counter(ctx, mid + s * 30, y, zfr - 40, Math.PI, 30, C("#3a3a3a"));
      } else {
        // home goods upstairs: sofas, beds and tables set out as rooms
        for (let i = 0; i < 3; i++) { const z = zst + 40 + i * 60; F.sofa(ctx, mid - 30, y, z, 0, 24); F.rug(ctx, mid - 30, y, z + 10, 0, 26, 16); F.bed(ctx, mid + 30, y, z + 4, 0, true); }
      }
      // racks of clothes in rows across the rest of the floor
      const z0 = zst + 18, z1 = zfr - (lvl === 0 ? 60 : 20);
      for (let x = Math.min(mallSide, out) + 40; x < Math.max(mallSide, out) - 30; x += 36) for (let z = z0 + (lvl === 0 ? 0 : 160); z < z1; z += 32) {
        if (lvl === 0 && Math.abs(x - (mallSide - s * 40)) < 40 && Math.abs(z - (p.zc0 + p.zc1) / 2) < 40) continue;
        RACK(ctx, x, y, z, L.chance(.5) ? 0 : Math.PI / 2, L);
      }
      // fitting rooms against the outside wall
      for (let i = 0; i < 4; i++) { const z = zst + 20 + i * 16; innerWall(ctx, [out + s * 0, z], [out - s * 18, z], y, 26, null); }
      // the stockroom behind: shelving and boxes
      for (let i = 0; i < 3; i++) shelf(ctx, mid + (i - 1) * (w / 3.4), zst - 30, w / 4.2, 22, 6, true);
      F.boxes(ctx, mid + s * w * .3, y, zst - 14, .2);
    }
    // a clothes rack: a rail on two posts with garments hanging off it
    function RACK(ctx, x, y, z, rot, L) {
      if (ctx.looted && ctx.r.chance(.4)) { piece(ctx, x, y, z, rot, (put) => { for (const a of [-1, 1]) put(a * 8, 8, 0, .8, 16, .8, PAL.metal, M.metal); put(0, 16, 0, 17, .7, .7, PAL.metal, M.metal); }); return; }
      piece(ctx, x, y, z, rot, (put, R) => { for (const a of [-1, 1]) { put(a * 8, 8, 0, .8, 16, .8, PAL.metal, M.metal); put(a * 8, .4, 0, 1, .8, 6, PAL.metal, M.metal); } put(0, 16, 0, 17, .7, .7, PAL.metal, M.metal); const c = R.pick(PAL.goods); for (let i = -7; i <= 7; i += 1.6) put(i, 10.5, 0, .9, 10, 5, R.chance(.7) ? c : R.pick(PAL.goods), M.plain); });
    }
    // one in-line shop: what it sells, laid out the way such a shop is (stock along the walls, a counter by the door
    // for most, a stockroom behind a wall at the back of a deep one). storeAt: the storefront's z
    function SHOP(ctx, p, q, y, z0, z1, backRow) {
      const x0 = q.x0 + 2, x1 = q.x1 - 2, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, L = ctx.lay("shop" + q.x0.toFixed(0) + z0.toFixed(0) + y), front = backRow ? z1 : z0, sg = backRow ? -1 : 1, rot = backRow ? 0 : Math.PI;
      const into = (t) => front + sg * t, rear = backRow ? z0 : z1;
      ctx.y0 = y; ctx.looted = ctx.state !== "i";
      // a deep shop keeps a stockroom behind a wall with a door
      let far = rear; if (d > 110) { const zw = rear - sg * 34; innerWall(ctx, [x0 - 2, zw], [x1 + 2, zw], y, 40, w * .8); far = zw; shelf(ctx, cx, rear - sg * 14, w * .6, 20, 5, true); }
      const usable = Math.abs(far - front);
      const counter = () => F.counter(ctx, x1 - 8, y, into(Math.min(28, usable * .3)), -Math.PI / 2, 16, C("#3a3a3a"));
      switch (q.theme) {
        case "clothing": for (let t = 26; t < usable - 14; t += 22) RACK(ctx, cx - 4, y, into(t), 0, L); counter(); shelf(ctx, x0 + 4, into(usable * .55), Math.min(40, usable * .6), 22, 5, false); break;
        case "shoes": for (const xs of [x0 + 4, x1 - 4]) shelf(ctx, xs, into(usable * .55), Math.min(60, usable * .7), 22, 5, false); for (let t = 30; t < usable - 20; t += 26) F.bench(ctx, cx, y, into(t), 0, Math.min(20, w - 24)); counter(); break;
        case "electronics": case "phone": for (let t = 26; t < usable - 18; t += 26) piece(ctx, cx, y, into(t), 0, (put, R) => { put(0, 6, 0, Math.min(30, w - 22), 12, 10, C("#e8e8e4"), M.plain); for (let i = -2; i <= 2; i++) put(i * 5.5, 12.6, 0, 4, .4, 6, DARK, M.glass); }); shelf(ctx, cx, far - sg * 6, w * .7, 22, 5, true); counter(); break;
        case "books": for (let t = 24; t < usable - 14; t += 18) for (const xs of [cx - w / 4, cx + w / 4]) F.bookcase(ctx, xs, y, into(t), rot); F.chair(ctx, x0 + 8, y, into(usable * .5), Math.PI / 2); counter(); break;
        case "jewelry": for (const t of [24, 48]) if (t < usable - 10) piece(ctx, cx, y, into(t), 0, (put) => { put(0, 5, 0, Math.min(30, w - 20), 10, 7, C("#2e2a28"), M.wood); put(0, 11, 0, Math.min(30, w - 20), 2, 7, PAL.glass, M.glass); put(0, 12.4, 0, Math.min(30.4, w - 19.6), .6, 7.4, C("#c8b070"), M.metal); }, { fixed: true }); break;
        case "cafe": F.counter(ctx, cx, y, into(usable * .7), rot, Math.min(30, w - 16), C("#5a4030")); F.oven(ctx, cx - 6, y, far - sg * 5, rot + Math.PI); for (let t = 16; t < usable * .55; t += 18) { F.table(ctx, cx - w / 5, y, into(t), 0, 10, 10); F.chair(ctx, cx - w / 5 - 7, y, into(t), Math.PI / 2); F.table(ctx, cx + w / 5, y, into(t), 0, 10, 10); F.chair(ctx, cx + w / 5 + 7, y, into(t), -Math.PI / 2); } break;
        case "toys": case "gifts": case "sports": case "pharmacy": for (let t = 28; t < usable - 14; t += 24) shelf(ctx, cx, into(t), w * .6, q.theme === "sports" ? 24 : 18, 5, true); if (q.theme === "sports") RACK(ctx, x0 + 10, y, into(18), Math.PI / 2, L); counter(); break;
        case "vacant": default: F.boxes(ctx, cx, y, into(usable * .5), .3); if (L.chance(.5)) piece(ctx, cx + 10, y, into(usable * .3), .4, (put) => { for (const a of [-1, 1]) put(a * 3, 12, 0, .8, 24, .8, C("#c8a040"), M.metal); for (let k = 0; k < 6; k++) put(0, 2 + k * 4, 0, 6, .6, .6, C("#c8a040"), M.metal); }); break;
      }
    }
    const INSIDE = {
      shop(ctx, p, lvl, y) {
        const R = roomsOf(p), zf = R.zp ?? R.z0 + 20, mid = (R.x0 + R.x1) / 2;
        if (lvl === 0) {
          ctx.y0 = y; ctx.looted = ctx.state !== "i";
          const depth = R.z1 - zf, aw = (R.x1 - R.x0) * .45;
          for (const t of [.38, .7]) if (!ctx.brk || ctx.brk(mid + 4, zf + depth * t) > y + 20) shelf(ctx, mid + 4, zf + depth * t, aw, 20, 5, true);
          F.cooler(ctx, R.x0 + 6, y, (zf + R.z1) / 2 - 4, Math.PI / 2, Math.min(40, depth - 16));
          F.counter(ctx, R.x1 - 8, y, R.z1 - 16, -Math.PI / 2, 22, C("#3a3a3a"));
          piece(ctx, R.x1 - 8, y + 16, R.z1 - 12, -Math.PI / 2, (put) => { put(0, 2.5, 0, 6, 5, 5, DARK, M.metal); put(0, 6, -1, 5, 3, .6, C("#3a6a5a"), M.glass); });
          F.boxes(ctx, R.x1 - 12, y, R.z0 + 12, 0); F.boxes(ctx, mid + 6, y, R.z0 + 10, .4);
        } else flat(ctx, p, R, y, lvl);
      },
      apartment(ctx, p, lvl, y) {
        const R = roomsOf(p);
        if (lvl === 0) {
          piece(ctx, 14, y, R.z1 - .6, Math.PI, (put) => { for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) put(-5 + i * 5, 17 + k * 4.4, 0, 4.6, 4, 1.6, PAL.metal, M.metal); }, { fixed: true });
          F.bench(ctx, R.x1 - 16, y, R.z1 - 6, Math.PI, 20); F.plant(ctx, R.x0 + 6, y, R.z1 - 6);
          if (R.zp != null) { F.kitchen(ctx, R.x1 - 24, y, R.z0 + 6, 0, 36); F.dining(ctx, (R.x0 + R.x1) / 2 + 8, y, R.z0 + 30, 0); }
        } else flat(ctx, p, R, y, lvl);
      },
      office(ctx, p, lvl, y) {
        const R = roomsOf(p), mid = (R.x0 + R.x1) / 2;
        if (lvl === 0) {
          piece(ctx, mid, y, R.z1 - 26, 0, (put) => { put(0, 7, 0, 34, 14, 7, C("#5a4a3a"), M.wood); put(0, 14.5, .5, 35, 1, 8, C("#d8d4c8"), M.plain); put(-15, 7, -7, 6, 14, 14, C("#5a4a3a"), M.wood); }, { fixed: true });
          F.chair(ctx, mid, y, R.z1 - 34, 0, C("#2a2c30"));
          F.bench(ctx, R.x0 + 14, y, R.z1 - 8, Math.PI, 22); F.bench(ctx, R.x1 - 14, y, R.z1 - 8, Math.PI, 22);
          F.plant(ctx, R.x0 + 5, y, R.z1 - 18); F.plant(ctx, R.x1 - 5, y, R.z1 - 18);
          if (R.zp != null) { F.copier(ctx, R.x1 - 10, y, R.z0 + 8, 0); F.filing(ctx, R.x1 - 26, y, R.z0 + 6, 0, 3); }
          return;
        }
        const zf = R.zp ?? R.z0 + 14;
        for (let x = R.x0 + 26; x < R.x1 - 22; x += 50) for (let z = zf + 18; z < R.z1 - 14; z += 32) F.cubicle(ctx, x, y, z, 0);
        if (R.zp != null) { F.meeting(ctx, mid + 10, y, R.z0 + 26, 0, 3); F.filing(ctx, R.x1 - 8, y, R.z0 + 10, -Math.PI / 2, 2); F.plant(ctx, R.x1 - 6, y, R.zp - 6); }
      },
      police(ctx, p, lvl, y) {
        const R = roomsOf(p), mid = (R.x0 + R.x1) / 2, zp = R.zp ?? R.z0 + 40;
        if (lvl === 0) {
          // the front desk across the room, a gate at one end; benches by the door; lockers on the side
          piece(ctx, mid - 6, y, zp + 24, 0, (put) => { put(0, 9, 0, 46, 18, 7, C("#5a4a3a"), M.wood); put(0, 18.5, .5, 47, 1, 8, C("#c8c0b0"), M.concrete); put(0, 26, 3.2, 46, 12, .4, C("#b8d0d8"), M.glass, { edge: false }); }, { fixed: true });
          F.desk(ctx, mid - 14, y, zp + 12, Math.PI); F.desk(ctx, mid + 6, y, zp + 12, Math.PI);
          F.bench(ctx, R.x0 + 14, y, R.z1 - 6, Math.PI, 22); F.lockers(ctx, R.x1 - 4, y, zp + 20, -Math.PI / 2, 4);
          // the cells: bars along the cross wall's line, a bunk and a toilet in each
          if (!ctx.brk || ctx.brk(0, zp) > y + 30) for (let x = R.x0 + 16; x < R.x1 - 2; x += 2.6) box(ctx.B, x, y + 16, zp - 3, .6, 32, .6, PAL.metalD, M.metal);
          const cells = Math.max(2, Math.floor((R.x1 - R.x0 - 16) / 26));
          for (let i = 0; i < cells; i++) {
            const cx0 = R.x0 + 16 + i * (R.x1 - R.x0 - 16) / cells;
            if (i > 0 && (!ctx.brk || ctx.brk(cx0, (R.z0 + zp) / 2) > y + 30)) for (let z = R.z0; z < zp - 3; z += 2.6) box(ctx.B, cx0, y + 16, z, .6, 32, .6, PAL.metalD, M.metal);
            F.bunk(ctx, cx0 + 9, y, (R.z0 + zp) / 2 - 2, 0); F.toilet(ctx, cx0 + 20, y, R.z0 + 5, 0);
          }
          return;
        }
        F.meeting(ctx, mid, y, R.z1 - 22, 0, 3);
        F.desk(ctx, R.x1 - 18, y, (zp + R.z1) / 2 - 8, -Math.PI / 2); F.desk(ctx, R.x0 + 26, y, (zp + R.z1) / 2 - 8, Math.PI / 2);
        ctx.y0 = y; ctx.looted = ctx.state !== "i";
        if (R.zp != null) { shelf(ctx, mid + 10, R.z0 + 14, 34, 22, 6, true); shelf(ctx, mid + 10, R.z0 + 30, 34, 22, 6, true); F.filing(ctx, R.x1 - 8, y, R.z0 + 10, -Math.PI / 2, 3); }
      },
      gasstation(ctx, p, lvl, y) {
        const R = roomsOf(p), mid = (R.x0 + R.x1) / 2;
        ctx.y0 = y; ctx.looted = ctx.state !== "i";
        for (const z of [mid - 4, mid + 12].map((v, i) => R.z0 + 14 + i * 16)) shelf(ctx, mid + 4, z, (R.x1 - R.x0) * .45, 16, 5, true);
        F.cooler(ctx, mid + 6, y, R.z0 + 4, 0, Math.min(44, R.x1 - R.x0 - 30));
        F.counter(ctx, R.x0 + 12, y, R.z1 - 12, Math.PI / 2, 18, C("#3a3a3a"));
        piece(ctx, R.x1 - 6, y, R.z1 - 10, -Math.PI / 2, (put) => { put(0, 7, 0, 14, 14, 7, C("#5a3a2a"), M.wood); put(0, 16, 0, 5, 4, 4, DARK, M.metal); put(4, 16, 0, 3, 5, 3, C("#c8c8c0"), M.metal); }, { fixed: true });
      },
      stripmall(ctx, p, lvl, y, unit) {
        const { i, cx, uw } = unit, R = roomsOf(p), d = R.z1 - R.z0, kind = ctx.lay("theme" + i).pick(["grocery", "laundromat", "pharmacy", "pizza", "barber", "hardware", "vacant"]);
        ctx.y0 = y; ctx.looted = ctx.state !== "i";
        const x0 = cx - uw / 2 + 3, x1 = cx + uw / 2 - 3;
        if (kind === "grocery" || kind === "pharmacy" || kind === "hardware") {
          for (const t of [.3, .55]) shelf(ctx, cx + 3, R.z0 + d * t, uw * .55, kind === "hardware" ? 24 : 18, 5, true);
          if (kind === "grocery") F.cooler(ctx, cx, y, R.z0 + 4, 0, uw - 12); else F.counter(ctx, cx, y, R.z0 + 10, 0, uw - 20);
          F.counter(ctx, x1 - 6, y, R.z1 - 14, -Math.PI / 2, 14, C("#3a3a3a"));
        } else if (kind === "laundromat") {
          for (let x = x0 + 6; x < x1 - 5; x += 11) { F.washer(ctx, x, y, R.z0 + 6, 0); F.washer(ctx, x, y + 16, R.z0 + 6, 0); }
          for (let x = x0 + 6; x < x1 - 5; x += 11) F.washer(ctx, x, y, R.z0 + d * .5, Math.PI);
          F.bench(ctx, cx, y, R.z1 - 6, Math.PI, Math.min(30, uw - 14));
        } else if (kind === "pizza") {
          F.oven(ctx, cx, y, R.z0 + 8, 0); F.counter(ctx, cx, y, R.z0 + d * .42, Math.PI, uw - 16);
          for (let x = x0 + 9; x < x1 - 8; x += 20) { F.table(ctx, x, y, R.z1 - 16, 0, 12, 10, 13); F.chair(ctx, x - 4, y, R.z1 - 22, 0); F.chair(ctx, x + 4, y, R.z1 - 10, Math.PI); }
        } else if (kind === "barber") {
          for (let x = x0 + 7; x < x1 - 6; x += 15) F.barberChair(ctx, x, y, R.z0 + 14, 0);
          F.bench(ctx, cx, y, R.z1 - 6, Math.PI, Math.min(28, uw - 14)); F.plant(ctx, x1 - 4, y, R.z1 - 6);
        } else { F.boxes(ctx, cx - 8, y, R.z0 + 14, .3); F.boxes(ctx, cx + 10, y, R.z0 + d * .6, -.2); piece(ctx, cx, y, R.z1 - 18, .5, (put) => { for (const a of [-1, 1]) put(a * 3, 12, 0, .8, 24, .8, C("#c8a040"), M.metal); for (let k = 0; k < 5; k++) put(0, 3 + k * 4.5, 0, 6, .6, .6, C("#c8a040"), M.metal); }); }
      },
      warehouse(ctx, p, lvl, y) {
        const R = roomsOf(p);
        F.racking(ctx, (R.x0 + R.x1) / 2 - 18, y, R.z0 + 8, 0, Math.min(110, R.x1 - R.x0 - 60));
        F.racking(ctx, R.x0 + 8, y, (R.z0 + R.z1) / 2 + 6, Math.PI / 2, Math.min(70, R.z1 - R.z0 - 40));
        F.forklift(ctx, (R.x0 + R.x1) / 2 + 10, y, R.z1 - 30, ctx.lay("fork").range(-1, 1));
        F.desk(ctx, R.x1 - 22, y + 0, R.z0 + 14, Math.PI); F.filing(ctx, R.x1 - 6, y, R.z0 + 22, -Math.PI / 2, 2);
      },
      diner(ctx, p, lvl, y) {
        const R = roomsOf(p), mid = (R.x0 + R.x1) / 2;
        for (let x = R.x0 + 34; x < R.x1 - 10; x += 22) F.booth(ctx, x, y, R.z1 - 9, 0);
        F.counter(ctx, mid + 8, y, R.z0 + 26, Math.PI, Math.min(70, R.x1 - R.x0 - 40), C("#c8c8c0"));
        for (let x = mid - 22; x < mid + 40; x += 9) F.stool(ctx, x, y, R.z0 + 34);
        F.oven(ctx, mid - 10, y, R.z0 + 6, 0); F.fridge(ctx, mid + 14, y, R.z0 + 6, 0); F.kitchen(ctx, mid + 36, y, R.z0 + 6, 0, 22);
      },
      church(ctx, p, lvl, y) {
        const R = roomsOf(p);
        F.altar(ctx, R.x1 - 12, y, 0, -Math.PI / 2);
        for (let x = R.x0 + 14; x < R.x1 - 40; x += 11) for (const z of [-(R.z1 - R.z0) * .24, (R.z1 - R.z0) * .24]) F.pew(ctx, x, y, z, Math.PI / 2, (R.z1 - R.z0) * .34);
        F.rug(ctx, (R.x0 + R.x1) / 2, y, 0, Math.PI / 2, 12, R.x1 - R.x0 - 30);
      },
      clinic(ctx, p, lvl, y) {
        const R = roomsOf(p), mid = (R.x0 + R.x1) / 2, zp = R.zp ?? R.z0 + 50;
        if (lvl === 0) {
          F.counter(ctx, mid, y, zp + 14, Math.PI, 30, C("#c8ccc8"));
          for (const x of [R.x0 + 16, R.x1 - 16]) F.bench(ctx, x, y, R.z1 - 6, Math.PI, 22);
          F.plant(ctx, R.x0 + 5, y, R.z1 - 16);
          // exam bays behind the cross wall, split by thin walls
          const n = Math.max(2, Math.floor((R.x1 - R.x0 - 16) / 34));
          for (let i = 0; i < n; i++) { const bx = R.x0 + 14 + (i + .5) * (R.x1 - R.x0 - 14) / n; if (i > 0) innerWall(ctx, [bx - (R.x1 - R.x0 - 14) / n / 2, R.z0], [bx - (R.x1 - R.x0 - 14) / n / 2, zp - 4], y, 30, null); F.hospitalBed(ctx, bx + 3, y, (R.z0 + zp) / 2 - 4, 0); }
        } else {
          for (let x = R.x0 + 26; x < R.x1 - 10; x += 26) { F.hospitalBed(ctx, x, y, R.z1 - 22, Math.PI); if (R.zp != null) F.hospitalBed(ctx, x, y, R.z0 + 24, 0); }
          ctx.y0 = y; ctx.looted = ctx.state !== "i"; if (R.zp != null) shelf(ctx, R.x1 - 18, zp - 6, 26, 20, 5, true);
        }
      },
      firestation(ctx, p, lvl, y) {
        const R = roomsOf(p), L = p.W - 2 * p.T, bw = (L - 30) / 2;
        if (lvl === 0) {
          const xs = [-p.W / 2 + 6 + bw / 2, -p.W / 2 + 16 + bw * 1.5];
          for (let i = 0; i < p.trucks; i++) F.truck(ctx, xs[i], y, 4, 0);
          F.lockers(ctx, R.x0 + 4, y, R.z0 + 30, Math.PI / 2, 6);
          piece(ctx, R.x1 - 30, y, R.z0 + 6, 0, (put, L) => { for (let i = 0; i < 6; i++) { put(-12 + i * 5, 26, 0, 3, 3, 3, PAL.metal, M.metal); put(-12 + i * 5, 14, .6, 4, 20, 3.4, L.pick([C("#c8a040"), C("#3a3a30")]), M.plain); put(-12 + i * 5, 5, 0, 4, 4, 4, DARK, M.plain); } }, { fixed: true });
        } else {
          for (let x = R.x0 + 12; x < R.x1 - 24; x += 18) F.bunk(ctx, x, y, R.z1 - 22, Math.PI);
          F.kitchen(ctx, (R.x0 + R.x1) / 2 - 10, y, R.z0 + 6, 0, 40); F.dining(ctx, (R.x0 + R.x1) / 2 - 10, y, R.z0 + 34, 0);
          F.sofa(ctx, R.x0 + 22, y, R.z0 + 30, Math.PI / 2, 22); F.tv(ctx, R.x0 + 44, y, R.z0 + 30, -Math.PI / 2);
        }
      },
      rowhouse(ctx, p, lvl, y) {
        const R = roomsOf(p), mid = (R.x0 + R.x1) / 2 + 5;
        if (lvl === 0) { F.sofa(ctx, mid, y, R.z1 - 26, 0, 20); F.tv(ctx, mid, y, R.z1 - 6, Math.PI); F.rug(ctx, mid, y, R.z1 - 16, 0, 22, 16); F.kitchen(ctx, mid, y, R.z0 + 6, 0, 28); F.table(ctx, mid, y, R.z0 + 30, 0, 14, 10); }
        else if (lvl === 1) { F.bed(ctx, mid, y, R.z1 - 22, Math.PI, true); F.wardrobe(ctx, mid, y, R.z0 + 30, 0); }
        else { F.bed(ctx, mid, y, R.z1 - 22, Math.PI, false); F.bed(ctx, mid, y, R.z0 + 24, 0, false); }
      },
      house(ctx, p, lvl, y) {
        const R = roomsOf(p), two = p.storeys.length === 2, mid = (R.x0 + R.x1) / 2;
        if (lvl === 0) {
          livingRoom(ctx, R.x0 + 30, y, R.z1 - 24, Math.PI);
          F.kitchen(ctx, mid - 4, y, R.z0 + 6, 0, 40); F.fridge(ctx, mid + 22, y, R.z0 + 6, 0);
          F.dining(ctx, R.x1 - 22, y, R.z1 - 22, 0);
          if (!two) F.bed(ctx, R.x0 + 16, y, R.z0 + 22, 0, true);
        } else {
          F.bed(ctx, R.x0 + 18, y, R.z1 - 24, Math.PI, true); F.wardrobe(ctx, R.x0 + 34, y, R.z1 - 6, Math.PI);
          F.bed(ctx, mid + 4, y, R.z0 + 20, 0, false); F.rug(ctx, mid, y, (R.z0 + R.z1) / 2, 0, 20, 14);
        }
      },
    };
    // a flat over a shop or in a block: a living room at the front, a kitchen and a bedroom behind
    // these types now lay their storeys out as planned rooms (shop and diner: a front room and a back-of-house strip)
    const PLANNED = { office: 1, apartment: 1, clinic: 1, police: 1, house: 1, shop: 1, diner: 1 };
    for (const k of Object.keys(PLANNED)) { const old = INSIDE[k]; INSIDE[k] = (ctx, p, lvl, y) => { if (p.W < 60 && k !== "house" && k !== "shop") return old(ctx, p, lvl, y); plannedInside(ctx, p, lvl, y, k); }; }
    function flat(ctx, p, R, y, lvl) {
      const mid = (R.x0 + R.x1) / 2, back = R.zp ?? R.z0 + 30;
      livingRoom(ctx, mid + 6, y, (back + R.z1) / 2 + 2, Math.PI + (ctx.lay("lrr" + lvl).chance(.5) ? 0 : 0));
      F.kitchen(ctx, R.x1 - 22, y, back + 6, 0, 32); F.fridge(ctx, R.x1 - 44, y, back + 6, 0);
      if (R.zp != null) { F.bed(ctx, R.x1 - 20, y, R.z0 + 22, 0, true); F.wardrobe(ctx, mid, y, R.z0 + 5, 0); }
      else F.bed(ctx, R.x0 + 30, y, R.z1 - 22, Math.PI, true);
    }

    /* ---------- the building types ---------- */
    // plan(r): the layout, from the building's seed only. Returns sizes, storeys, materials and a draw(ctx, level)
    /* ---------- airport pieces (13 Nov 2026) ---------- */
    // a tube along z (an airliner's body, an engine): rings at z0 (radius r0) and z1 (radius r1), centred on (x, cy),
    // over the angles a0..a1 (0 is +x, PI/2 is up). o.inner draws the inside face too (an open half seen from above).
    function tube(B, x, cy, z0, z1, r0, r1, seg, col, mat, a0 = 0, a1 = Math.PI * 2, o = {}) {
      if (z1 < z0) { [z0, z1] = [z1, z0]; [r0, r1] = [r1, r0]; }
      const P = (a, z, r) => [x + Math.cos(a) * r, cy + Math.sin(a) * r, z];
      const dz = z1 - z0 || 1, slope = (r0 - r1) / dz, arcL = Math.abs(a1 - a0) * Math.max(r0, r1) / seg;
      const colAt = (p, n) => typeof col === "function" ? col(p[0], p[1], p[2], n) : col;
      for (const inside of o.inner ? [false, true] : [false]) {
        const k = inside ? -1 : 1, rr0 = inside ? r0 - (o.inner || .8) : r0, rr1 = inside ? r1 - (o.inner || .8) : r1;
        if (rr0 <= 0 && rr1 <= 0) continue;
        for (let i = 0; i < seg; i++) {
          const a = a0 + (a1 - a0) * i / seg, b = a0 + (a1 - a0) * (i + 1) / seg, m = (a + b) / 2;
          const q = [P(a, z0, Math.max(0, rr0)), P(b, z0, Math.max(0, rr0)), P(b, z1, Math.max(0, rr1)), P(a, z1, Math.max(0, rr1))];
          let nrm = [Math.cos(m), Math.sin(m), slope]; const l = Math.hypot(...nrm); nrm = nrm.map((v) => v / l * k);
          const forward = (a1 > a0) !== inside, order = forward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
          const uv = [[0, 0], [arcL, 0], [arcL, dz], [0, dz]], ic = inside ? (o.innerCol || null) : null;
          for (const j of order) { B.p.push(...q[j]); B.n.push(...nrm); B.c.push(...(ic || colAt(q[j], nrm))); B.f.push(uv[j][0], uv[j][1], 0, 0); B.m.push(inside ? M.plain : mat); }
        }
      }
    }
    // copy what was drawn into one buffer into another, moved by a matrix (a broken-off part of a wreck)
    function xform(src, dst, m4) {
      const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m4);
      for (let i = 0; i < src.p.length; i += 3) {
        v.set(src.p[i], src.p[i + 1], src.p[i + 2]).applyMatrix4(m4); n.set(src.n[i], src.n[i + 1], src.n[i + 2]).applyMatrix3(nm).normalize();
        dst.p.push(v.x, v.y, v.z); dst.n.push(n.x, n.y, n.z); dst.c.push(src.c[i], src.c[i + 1], src.c[i + 2]);
      }
      for (let i = 0; i < src.f.length; i++) dst.f.push(src.f[i]);
      for (let i = 0; i < src.m.length; i++) dst.m.push(src.m[i]);
    }
    // a flat wing or tail surface: a list of [z, x, chord] stations from root to tip, drawn as swept boxes
    function surface(B, stations, y, th, col, mat, mirror, dihedral = 0) {
      for (const s of mirror ? [1, -1] : [1]) for (let i = 0; i < stations.length - 1; i++) {
        const [za, xa, ca] = stations[i], [zb, xb, cb] = stations[i + 1], len = Math.hypot(xb - xa, zb - za), c = (ca + cb) / 2;
        const ang = Math.atan2(zb - za, xb - xa), mx = (xa + xb) / 2 * s, mz = (za + zb) / 2, my = y + Math.abs(mx) * dihedral;
        box(B, mx, my, mz, len + .5, th, c, col, mat, { rot: rotEuler(0, s > 0 ? -ang : ang - Math.PI, s * Math.atan(dihedral) * 0) });
      }
    }
    // the fin: an upright swept surface, root at the body's top
    function fin(B, z0, y0, h, root, tip, sweep, th, col, mat) {
      const n = 5;
      for (let i = 0; i < n; i++) { const t = (i + .5) / n, ch = root + (tip - root) * t; box(B, 0, y0 + h * t, z0 - sweep * t, th, h / n + .3, ch, col, mat); }
    }
    // runway designation digits, painted flat: seven-segment boxes, h tall along -z (read from the approach)
    const SEG7 = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcfgd" };
    function digits(B, str, x, y, z, h, col, rotY) {
      const w = h * .55, t = h * .14, gap = w * .45, total = str.length * (w + gap) - gap, M4 = rotEuler(0, rotY, 0);
      [...str].forEach((ch, i) => {
        const ox = -total / 2 + i * (w + gap) + w / 2, segs = SEG7[ch] || "";
        const S = { a: [0, -h / 2, w, t], g: [0, 0, w, t], d: [0, h / 2, w, t], f: [-w / 2, -h / 4, t, h / 2], b: [w / 2, -h / 4, t, h / 2], e: [-w / 2, h / 4, t, h / 2], c: [w / 2, h / 4, t, h / 2] };
        for (const sg of segs) { const [sx, sz, sw, sd] = S[sg], v = new THREE.Vector3(ox + sx, 0, sz).applyMatrix4(M4); box(B, x + v.x, y, z + v.z, sw, .06, sd, col, M.plain, { edge: false, rot: M4 }); }
      });
    }
    // a small propeller plane (in a hangar or on the apron), nose to +z
    function smallPlane(ctx, x, y, z, rot, col) {
      piece(ctx, x, y, z, rot, (put) => {
        put(0, 10, 0, 9, 9, 52, col, M.plain); put(0, 10, 28, 7, 7, 6, mul(col, .9), M.plain); put(0, 10, 31.5, 1, 18, 1.4, DARK, M.metal);
        put(0, 15.6, 10, 8.4, 3, 12, PAL.glass, M.glass);
        put(0, 15, 8, 70, 1.2, 12, col, M.plain); put(0, 12, -24, 24, 1, 8, col, M.plain); put(0, 19, -25, 1.2, 14, 8, col, M.plain);
        for (const [gx, gz] of [[-9, 6], [9, 6], [0, 24]]) { put(gx, 3, gz, 1, 6, 1, PAL.metalD, M.metal); put(gx, 2.2, gz, 1.6, 4.4, 4.4, DARK, M.plain); }
      }, { h: 20 });
    }
    function seatRow(ctx, x, y, z, rot, n = 5, col) {
      piece(ctx, x, y, z, rot, (put, L) => { const c = col || L.pick([C("#3a4a6a"), C("#5a5e64"), C("#2e5a5a"), C("#6a3a3a")]); put(0, 3, 0, n * 6.4, 1, 3, PAL.metal, M.metal); for (let i = 0; i < n; i++) { const sx = -n * 3.2 + 3.2 + i * 6.4; put(sx, 6.4, 0, 5.6, 1.2, 5.6, c, M.plain); put(sx, 10, -2.6, 5.6, 7, 1, c, M.plain); } for (const a of [-1, 1]) put(a * (n * 3.2 - 1), 3, 0, 1.2, 6, 4, PAL.metalD, M.metal); }, { h: 12 });
    }
    function checkin(ctx, x, y, z, rot, n = 4, brand) {
      piece(ctx, x, y, z, rot, (put) => {
        const len = n * 14;
        put(0, 6, 0, len, 12, 8, C("#d8d4c8"), M.plain); put(0, 12.4, 0, len + 1, .8, 9, C("#8a8e92"), M.metal);
        for (let i = 0; i < n; i++) { const sx = -len / 2 + 7 + i * 14; put(sx, 2.6, 7, 9, 3, 7, PAL.metalD, M.metal); put(sx, 22, -8, 10, 6, 1, DARK, M.plain); put(sx, 22, -7.4, 8, 1.4, .3, brand || C("#e0c040"), M.plain); put(sx, 14.4, -2, 1, 4, 1, PAL.metal, M.metal); }
        put(0, 30, -9, len, 1.4, 1.4, PAL.metal, M.metal);
      }, { fixed: true, h: 30 });
    }
    function carousel(ctx, x, y, z, rot, len = 60) {
      piece(ctx, x, y, z, rot, (put) => {
        put(0, 3.6, 0, len, 7.2, 16, C("#8a8e92"), M.metal); put(0, 7.6, 0, len + 2, .8, 18, C("#3a3c40"), M.plain); put(0, 8.6, 0, len - 8, 2, 6, PAL.metal, M.metal);
        for (let i = 0; i < 6; i++) put(-len / 2 + 8 + i * (len - 16) / 5, 9.6, (i % 2 ? 1 : -1) * 6.4, 7, 4, 5, ctx.lay("bag" + i + x.toFixed(0)).pick(PAL.goods), M.plain);
      }, { fixed: true, h: 10 });
    }
    function secLane(ctx, x, y, z, rot) {
      piece(ctx, x, y, z, rot, (put) => {
        put(0, 4, -12, 8, 8, 34, C("#5a5e64"), M.metal); put(0, 8.2, -12, 8.6, .6, 34.6, DARK, M.plain); put(0, 12, -10, 9, 8, 10, C("#9aa0a6"), M.metal);
        for (const a of [-1, 1]) put(10 + a * 6, 13, 6, 1.6, 26, 3, C("#c8c8c0"), M.metal); put(10, 26.4, 6, 14, 1.6, 3, C("#c8c8c0"), M.metal);
      }, { fixed: true, h: 26 });
    }
    function depBoard(ctx, x, y, z, rot) {
      piece(ctx, x, y, z, rot, (put, L) => { put(0, 0, 0, 30, 14, 1.4, DARK, M.plain); for (let i = 0; i < 5; i++) if (ctx.state === "i" || L.chance(.4)) put(-2, -5 + i * 2.6, .8, 24, .9, .2, L.pick([C("#f0d040"), C("#e8e4d8"), C("#e0a030")]), M.plain); put(0, 10, 0, 1, 7, 1, PAL.metal, M.metal); }, { fixed: true, h: 0 });
    }
    function kiosk(ctx, x, y, z, rot, col) {
      piece(ctx, x, y, z, rot, (put, L) => { const c = col || L.pick(PAL.sign); put(0, 6, 0, 24, 12, 10, C("#d8d4c8"), M.plain); put(0, 12.4, 0, 25, .8, 11, c, M.plain); put(0, 26, -4, 26, 4, 1, c, M.plain); for (const a of [-1, 1]) put(a * 12, 19, -4, 1, 14, 1, PAL.metal, M.metal); put(0, 18, -8, 20, 12, 3, C("#c8c0b0"), M.wood); for (let i = 0; i < 6; i++) put(-8 + i * 3.2, 15 + (i % 2) * 5, -6.2, 2.4, 3, 1.4, L.pick(PAL.goods), M.plain); }, { h: 26 });
    }

    // airport inside: a check-in hall and baggage claim below, gate lounges above
    const AIR_INSIDE = {
      terminal(ctx, p, lvl, y) {
        const x0 = -p.W / 2 + p.T + 2, x1 = p.W / 2 - p.T - 2, z0 = -p.D / 2 + p.T + 2, z1 = p.D / 2 - p.T - 2, Wd = x1 - x0, L = ctx.lay("tin" + lvl);
        if (lvl === 0) {
          // check-in islands across the hall, a queue line in front of each
          const nIsl = Math.max(2, Math.floor(Wd / 130));
          for (let i = 0; i < nIsl; i++) { const cx = x0 + Wd * (i + .5) / nIsl; checkin(ctx, cx, y, z0 + 60, Math.PI, 4, L.pick(PAL.sign)); for (let k = 0; k < 4; k++) piece(ctx, cx - 26 + k * 17, y, z0 + 82, 0, (put) => { put(0, 5, 0, 1, 10, 1, PAL.metal, M.metal); put(0, 2, 0, 4, .6, 4, PAL.metalD, M.metal); put(8.5, 9, 0, 17, .5, .3, C("#2a3a7a"), M.plain); }, { fixed: true, h: 10 }); }
          // baggage claim on one side, security on the other, departure boards on the columns
          carousel(ctx, x0 + Wd * .18, y, z1 - 50, 0, Math.min(90, Wd * .22)); carousel(ctx, x0 + Wd * .18, y, z1 - 92, 0, Math.min(90, Wd * .22));
          for (let i = 0; i < 4; i++) secLane(ctx, x1 - 40 - i * 22, y, z0 + 40, 0);
          for (let i = 0; i < 3; i++) depBoard(ctx, x0 + Wd * (.3 + i * .2), y + 34, z1 - 18, Math.PI);
          for (let i = 0; i < 4; i++) seatRow(ctx, x0 + Wd * (.42 + (i % 2) * .12), y, z1 - 30 - Math.floor(i / 2) * 14, Math.PI, 6);
          kiosk(ctx, x0 + Wd * .62, y, z1 - 36, Math.PI); F.plant(ctx, x0 + 10, y, z1 - 8, 0); F.plant(ctx, x1 - 10, y, z1 - 8, 0);
          if (ctx.state !== "i") for (let i = 0; i < 6; i++) piece(ctx, x0 + L.range(10, Wd - 10), y, L.range(z0 + 20, z1 - 20), L.range(0, 6), (put, LL) => put(0, 3, 0, 9, 6, 5, LL.pick(PAL.goods), M.plain), { h: 6 });
        } else {
          // gate lounges along the airside wall, a cafe and shops along the front glass
          const gates = p.gates.length;
          p.gates.forEach((gx, i) => {
            piece(ctx, gx, y, z0 + 16, Math.PI, (put) => { put(0, 6, 0, 22, 12, 8, C("#4a5058"), M.plain); put(0, 12.4, 0, 23, .8, 9, C("#c8c8c0"), M.metal); put(0, 26, -2, 18, 8, 1, DARK, M.plain); put(-4, 26, -1.4, 6, 4, .3, C("#f0d040"), M.plain); }, { fixed: true, h: 26 });
            for (let k = 0; k < 4; k++) seatRow(ctx, gx - 24 + (k % 2) * 48, y, z0 + 44 + Math.floor(k / 2) * 14, k % 2 ? Math.PI / 2 * 0 : 0, 5);
            void gates; void i;
          });
          for (let i = 0; i < 3; i++) kiosk(ctx, x0 + Wd * (.2 + i * .3), y, z1 - 12, Math.PI);
          // the concourse between: islands of seats, planters, a moving walkway, the restrooms in the middle
          for (let i = 0; i < Math.floor(Wd / 90); i++) { const cx = x0 + 45 + i * 90; if (Math.abs(cx) < 50) continue; for (let k = 0; k < 2; k++) seatRow(ctx, cx, y, (z0 + z1) / 2 + 8 + k * 12, k ? Math.PI : 0, 6); F.plant(ctx, cx - 26, y, (z0 + z1) / 2 + 14); F.plant(ctx, cx + 26, y, (z0 + z1) / 2 + 14); }
          piece(ctx, 0, y, (z0 + z1) / 2 + 6, 0, (put) => { put(0, 18, 0, 60, 36, 30, C("#c8c4b8"), M.plain); for (const a of [-1, 1]) { put(a * 14, 15, 15.2, 10, 30, .6, C("#5a6066"), M.plain); put(a * 14, 33, 15.3, 5, 4, .3, a < 0 ? C("#2a5aa8") : C("#b8241e"), M.plain); } }, { fixed: true, h: 36 });
          piece(ctx, 0, y, z0 + 70, Math.PI / 2, (put) => { put(0, 1.6, 0, 12, 3.2, Wd * .5, C("#5a5e64"), M.metal); put(0, 3.4, 0, 9, .4, Wd * .5 - 4, DARK, M.plain); for (const a of [-1, 1]) put(a * 5.6, 7, 0, 1, 7, Wd * .5, C("#9fb4c0"), M.glass); }, { fixed: true, h: 8 });
          for (let i = 0; i < 4; i++) { F.table(ctx, x0 + Wd * .35 + i * 20, y, z1 - 40, 0, 10, 10, 13); F.chair(ctx, x0 + Wd * .35 + i * 20 - 6, y, z1 - 40, Math.PI / 2); F.chair(ctx, x0 + Wd * .35 + i * 20 + 6, y, z1 - 40, -Math.PI / 2); }
          for (let i = 0; i < 4; i++) depBoard(ctx, x0 + Wd * (.15 + i * .23), y + 30, z1 - 4, Math.PI);
        }
      },
    };

    const AIR_TYPES = {
      terminal: {
        name: "Airport terminal", sub: "check-in, baggage, gates over the apron",
        plan(r) {
          const W = SQ * r.pick([20, 22, 24]), D = SQ * r.pick([9, 10]), ng = Math.max(3, Math.floor(W / (SQ * 6)));
          const gates = Array.from({ length: ng }, (_, i) => -W / 2 + W * (i + .5) / ng);
          return {
            W, D, T: 3, storeys: [{ base: 0, H: 62 }, { base: 62, H: 54 }], top: 116, wallCol: r.pick([C("#d8d6ce"), C("#c8ccd0"), C("#e2ded2")]), wallMat: M.concrete, course: true,
            frameCol: r.pick([C("#3a4048"), C("#8a8e92")]), doorCol: C("#3a4a56"), floorCol: C("#b8b4aa"), floorMat: M.tile, noPartition: true, stairX: -W / 2 + 3,
            gates, bridge: SQ * 4, brand: r.pick(PAL.sign), letters: 8, ruin: [.3, .45, .4, .8], seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Check-in and baggage", "Departures and gates", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B, r } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length;
          if (lvl === n) {
            flatRoof(ctx, p.top, { parapet: 6, ac: ctx.lay("ac").int(4, 6), bulkhead: true });
            if (!ctx.brk) for (let i = 0; i < 5; i++) { const x = -p.W / 2 + p.W * (i + .5) / 5; box(B, x, p.top + 6, 0, p.W / 7, 4, p.D * .3, PAL.glass, M.glass); }
            return;
          }
          const st = p.storeys[lvl], L = S.front.L, ops = {};
          const glass = (L0, y0, y1) => [{ s0: 4, s1: L0 - 4, y0, y1, kind: "shop", frameCol: p.frameCol }];
          if (lvl === 0) {
            const doors = [L * .25, L * .5, L * .75];
            ops.front = []; let s = 4;
            for (const c of doors) { ops.front.push({ s0: s, s1: c - 14, y0: 6, y1: 50, kind: "shop", frameCol: p.frameCol }); ops.front.push({ s0: c - 12, s1: c + 12, y0: 3, y1: 40, kind: "door", doorCol: C("#3a4a56") }); s = c + 14; }
            ops.front.push({ s0: s, s1: L - 4, y0: 6, y1: 50, kind: "shop", frameCol: p.frameCol });
            ops.back = bays(S.back.L, 70, 20).map((c, i) => i % 2 ? { s0: c - 18, s1: c + 18, y0: 0, y1: 40, kind: "roller", doorCol: C("#8a8e92") } : { s0: c - 8, s1: c + 8, y0: 3, y1: 37, kind: "door", step: true });
            ops.left = bays(S.left.L, 30, 10).map((c) => win(c, 18, 14, 30)); ops.right = bays(S.right.L, 30, 10).map((c) => win(c, 18, 14, 30));
          } else {
            ops.front = glass(L, 4, st.H - 6); ops.back = glass(S.back.L, 4, st.H - 6); ops.left = glass(S.left.L, 8, st.H - 8); ops.right = glass(S.right.L, 8, st.H - 8);
          }
          finishStorey(ctx, p, S, st, lvl, ops, [-p.W / 2 + p.T, -p.D / 2 + p.T, -p.W / 2 + p.T + 12, -p.D / 2 + p.T + 66]);
          const y = lvl === 0 ? 3 : st.base;
          AIR_INSIDE.terminal(ctx, p, lvl, y);
          if (lvl === 0) {
            // the drop-off canopy along the front, on columns, and the name across the top of the glass
            const cz = p.D / 2 + 22, keep = (x) => !ctx.brk || ctx.brk(x, cz) > 52;
            for (const x of bays(p.W - 20, 60, 0).map((c) => c - (p.W - 20) / 2)) if (keep(x)) { box(B, x, 26, cz + 14, 2.4, 52, 2.4, PAL.metal, M.metal); }
            for (let i = 0; i < 8; i++) { const x = -p.W / 2 + 10 + (p.W - 20) * (i + .5) / 8; if (keep(x) && !(ctx.state === "r" && r.chance(.4))) box(B, x, 53, cz, (p.W - 20) / 8 + .2, 2, 30, C("#e0e0d8"), M.metal, { rot: ctx.state === "d" && r.chance(.15) ? rotEuler(r.range(-.2, .2), 0, 0) : null }); }
          } else {
            letters(ctx, S.front, L / 2, st.base + st.H - 4, 9, p.letters, p.brand, -.8);
            // jet bridges out from the airside glass to where an airliner's door meets them
            for (const gx of p.gates) {
              const z0 = -p.D / 2, len = p.bridge, by = st.base + 4, ok = !ctx.brk || ctx.brk(gx, z0 - len / 2) > by + 20;
              if (!ok) { box(B, gx + r.range(-6, 6), 8, z0 - len * .6, 18, 16, len * .5, mul(p.wallCol, .7), M.corr, { rot: rotEuler(r.range(-.3, .3), r.range(-.4, .4), r.range(-.3, .3)) }); continue; }
              const sag = ctx.state === "d" && r.chance(.3) ? r.range(-.12, -.05) : 0;
              const M4 = rotEuler(sag, 0, 0), part = (lx, ly, lz, w, h, d, col, mat) => { const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(M4); box(B, gx + v.x, by + v.y, z0 + v.z, w, h, d, col, mat, { rot: M4 }); };
              part(0, 10, -len / 2, 16, 20, len, C("#b8bcc0"), M.corr); part(0, 0, -len / 2, 16.6, 1.6, len, PAL.metalD, M.metal);
              part(0, 6, -len + 4, 18, 22, 8, C("#4a5058"), M.plain);
              box(B, gx, (by - 6) / 2, z0 - len + 6, 3, by - 6, 3, PAL.metalD, M.metal); box(B, gx, 3, z0 - len + 6, 12, 4, 6, DARK, M.plain);
            }
          }
        },
      },
      tower: {
        name: "Control tower", sub: "shaft, glass cab, radar",
        plan(r) {
          const h = r.pick([170, 190, 210]);
          return { W: SQ * 4, D: SQ * 4, T: 3, storeys: [{ base: 0, H: 46 }, { base: 46, H: h - 46 }], top: h + 22, cab: h, wallCol: r.pick([C("#d8d6ce"), C("#b8b4aa"), C("#c8ccd0")]), wallMat: M.concrete, course: true, frameCol: C("#3a4048"), doorCol: C("#3a4a56"), floorCol: C("#8f8b83"), floorMat: M.plain, noPartition: true, ruin: [.12, .2, .1, .25], seed: r.int(0, 1e9) };
        },
        floors() { return ["Base", "Cab", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B, r } = ctx, S = sidesOf(p.W, p.D, p.T), st = p.storeys[0], ruined = ctx.state === "r";
          const shaftTop = ruined ? ctx.lay("shaftbreak").range(70, 120) : p.cab, R = 34;
          if (lvl === 0) {
            const L = S.front.L, ops = { front: [{ s0: L / 2 - 10, s1: L / 2 + 10, y0: 3, y1: 38, kind: "door", canopy: true }, win(L * .2, 14, 16, 20), win(L * .8, 14, 16, 20)], back: [win(S.back.L / 2, 20, 16, 20)], left: [win(S.left.L / 2, 20, 16, 20)], right: [win(S.right.L / 2, 20, 16, 20)] };
            finishStorey(ctx, p, S, st, 0, ops, null);
            F.desk(ctx, -20, 3, 10, Math.PI); F.desk(ctx, 20, 3, 10, Math.PI); F.filing(ctx, 30, 3, -30, 0); F.lockers(ctx, -26, 3, -32, 0, 4);
            slab(ctx, 46, 3, PAL.concreteD, M.concrete, null, true);
            return;
          }
          if (lvl === 1) {
            // the shaft, square with a stair core, and the cab: a sloped ring of glass under a deck
            box(B, 0, 46 + (shaftTop - 46) / 2, 0, 24, shaftTop - 46, 24, p.wallCol, M.concrete);
            for (let y = 70; y < shaftTop - 10; y += 30) box(B, 0, y, 12.3, 5, 10, .6, PAL.glass, M.glass);
            if (ruined) { // the cab came down: its deck and glass in a heap by the base
              const hx = ctx.lay("fall").range(-40, 40), hz = ctx.lay("fall2").pick([-1, 1]) * 70;
              rubble(ctx, hx, 0, hz, 30, 14, 40, [p.wallCol, PAL.metalD, PAL.glass, PAL.concreteD]);
              box(B, hx, 6, hz, 60, 4, 50, PAL.metalD, M.metal, { rot: rotEuler(r.range(-.4, .4), r.range(0, 3), r.range(-.4, .4)) });
              return;
            }
            const y0 = p.cab;
            box(B, 0, y0 + 1.5, 0, R * 2, 3, R * 2, PAL.concreteD, M.concrete); // cab floor
            const sides = 8, broken = ctx.state === "d" ? .35 : 0;
            for (let i = 0; i < sides; i++) {
              const a = (i + .5) / sides * Math.PI * 2, x = Math.cos(a) * (R - 2), z = Math.sin(a) * (R - 2), w = 2 * (R - 2) * Math.tan(Math.PI / sides);
              const M4 = rotEuler(0, -a + Math.PI / 2, 0).multiply(rotEuler(-.18, 0, 0));
              if (!(broken && r.chance(broken))) box(B, x, y0 + 12, z, w, 18, .6, PAL.glass, M.glass, { rot: M4, edge: false });
              box(B, Math.cos(i / sides * Math.PI * 2) * (R - 1), y0 + 12, Math.sin(i / sides * Math.PI * 2) * (R - 1), 1.2, 19, 1.2, p.frameCol, M.metal);
              box(B, x, y0 + 4, z, w, 3, 1, mul(p.wallCol, .9), M.concrete, { rot: rotEuler(0, -a + Math.PI / 2, 0) });
            }
            // consoles in a ring, chairs
            for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; piece(ctx, Math.cos(a) * 20, y0 + 3, Math.sin(a) * 20, -a - Math.PI / 2, (put, L) => { put(0, 5, 0, 16, 10, 6, C("#4a5058"), M.plain); put(0, 11, -1, 14, 3, 2, DARK, M.plain); put(-4, 11.5, .2, 5, 2, .3, L.pick([C("#40a060"), C("#e0b040")]), M.plain); }, { fixed: true, h: 12 }); F.chair(ctx, Math.cos(a) * 13, y0 + 3, Math.sin(a) * 13, -a + Math.PI / 2, C("#3a3a3a")); }
            box(B, 0, y0 + 10, 0, 10, 14, 10, p.wallCol, M.concrete); // the stair core comes up in the middle
            return;
          }
          if (ruined) return;
          // the cab roof: a deck with an overhang, a rail, the radar and antennas
          const y0 = p.cab + 21;
          box(B, 0, y0 + 1, 0, R * 2 + 8, 2, R * 2 + 8, mul(p.wallCol, .9), M.concrete);
          for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; box(B, Math.cos(a) * (R + 2), y0 + 5, Math.sin(a) * (R + 2), 1, 6, 1, PAL.metal, M.metal); }
          cyl(B, 0, y0 + 2, 0, 3, 3, 14, 8, PAL.metal, M.metal);
          box(B, 0, y0 + 17, 0, 34, 5, 3, ctx.state === "d" ? PAL.rust : C("#e8e4dc"), M.metal, { rot: rotEuler(0, ctx.lay("radar").range(0, 3), 0) });
          for (const [x, z, h] of [[18, 12, 30], [-16, -14, 22]]) cyl(B, x, y0 + 2, z, .6, .4, h, 6, PAL.metalD, M.metal);
        },
      },
      hangar: {
        name: "Hangar", sub: "arched roof, sliding doors, a plane inside",
        plan(r) {
          const W = SQ * r.pick([12, 14]), D = SQ * r.pick([10, 12]);
          return { W, D, T: 3, storeys: [{ base: 0, H: 64 }], top: 64 + W * .16, wall: 64, wallCol: r.pick(PAL.corr), wallMat: M.corr, frameCol: PAL.metalD, doorCol: C("#8a8e92"), floorCol: PAL.floorCon, floorMat: M.concrete, noPartition: true, open: r.range(.25, .6), plane: r.pick([C("#e8e4dc"), C("#c8302a"), C("#2a5aa8"), C("#e0c040")]), seed: r.int(0, 1e9) };
        },
        floors() { return ["Hangar floor", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B, r } = ctx, W = p.W, D = p.D, H = p.wall, rise = p.top - H, ruined = ctx.state === "r";
          const reach = (x, z) => ctx.brk ? ctx.brk(x, z) : 999;
          if (lvl === 1) {
            // the arched roof: ribbed sheets across, laid on curved trusses; sheets go missing as it falls apart
            const segs = 12, ribs = Math.round(D / 30);
            for (let i = 0; i < segs; i++) {
              const t0 = i / segs, t1 = (i + 1) / segs, xa = -W / 2 + W * t0, xb = -W / 2 + W * t1;
              const ya = H + rise * Math.sin(Math.PI * t0), yb = H + rise * Math.sin(Math.PI * t1), len = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa);
              for (let j = 0; j < ribs; j++) {
                const z = -D / 2 + D * (j + .5) / ribs;
                if (ctx.state === "d" && r.chance(.06)) continue;
                if (ruined && (r.chance(.45) || reach((xa + xb) / 2, z) < (ya + yb) / 2 - 20)) continue;
                box(B, (xa + xb) / 2, (ya + yb) / 2 + .8, z, len + .4, 1.4, D / ribs + .2, p.wallCol, M.corr, { rot: rotEuler(0, 0, ang) });
              }
            }
            for (let j = 0; j <= ribs; j++) { const z = -D / 2 + D * j / ribs; if (ruined && r.chance(.4)) continue; for (let i = 0; i < segs; i++) { const t0 = i / segs, t1 = (i + 1) / segs, xa = -W / 2 + W * t0, xb = -W / 2 + W * t1, ya = H + rise * Math.sin(Math.PI * t0), yb = H + rise * Math.sin(Math.PI * t1); box(B, (xa + xb) / 2, (ya + yb) / 2 - 1.6, z, Math.hypot(xb - xa, yb - ya) + .4, 2.4, 2.4, PAL.metalD, M.metal, { rot: rotEuler(0, 0, Math.atan2(yb - ya, xb - xa)) }); } }
            // the gable ends above the walls: front over the door opening, back closed
            for (const [z, k] of [[D / 2 - 1.5, 1], [-D / 2 + 1.5, -1]]) for (let i = 0; i < 16; i++) {
              const x = -W / 2 + W * (i + .5) / 16, hh = rise * Math.sin(Math.PI * (i + .5) / 16); if (ruined && r.chance(.5)) continue;
              box(B, x, H + hh / 2, z, W / 16 + .2, hh, 3, k > 0 ? mul(p.wallCol, .95) : p.wallCol, M.corr);
            }
            return;
          }
          slab(ctx, 2, 2, p.floorCol, p.floorMat, null, true);
          // walls: corrugated sheets on a plinth, each sheet stopping at the ruin line; the front is a pair of big doors
          const sheet = 12, put = (x, z, w, d, h) => { const top = Math.min(h, reach(x, z)); if (top < 3 || (ruined && r.chance(.2))) return; box(B, x, top / 2, z, w, top, d, ctx.state === "i" ? p.wallCol : jit(p.wallCol, r, .06), M.corr); };
          for (let x = -W / 2 + sheet / 2; x < W / 2; x += sheet) put(x, -D / 2 + 1.5, sheet + .2, 3, H);
          for (let z = -D / 2 + sheet / 2; z < D / 2; z += sheet) { put(-W / 2 + 1.5, z, 3, sheet + .2, H); put(W / 2 - 1.5, z, 3, sheet + .2, H); }
          for (const k of ["back", "left", "right"]) { const S = sidesOf(W, D, p.T)[k]; wb(B, S, 0, S.L, 0, 4, -.8, 3, PAL.concreteD, M.concrete, { edge: false }); }
          // the doors: four leaves on a track, slid open toward the sides by p.open; one hangs off its track when damaged
          const leaf = W / 4, gap = p.open * W / 2;
          for (let i = 0; i < 4; i++) {
            const side = i < 2 ? -1 : 1, home = -W / 2 + leaf * (i + .5), x = home + side * gap * (i === 0 || i === 3 ? .5 : 1) * .9, z = D / 2 - 3 - (i % 2) * 3.2;
            if (ruined && r.chance(.5)) { box(B, x, 3, z + 14, leaf, 2.4, H * .8, p.wallCol, M.corr, { rot: rotEuler(.08, r.range(-.3, .3), 0) }); continue; }
            const tilt = ctx.state === "d" && r.chance(.25) ? rotEuler(0, 0, r.range(-.1, .1)) : null;
            box(B, x, H / 2, z, leaf, H, 2, mul(p.wallCol, .92), M.corr, { rot: tilt });
          }
          box(B, 0, H + 1, D / 2 - 4, W + 4, 2, 8, PAL.metalD, M.metal);
          // inside: a light plane, a workbench, carts, drums, a fuel bowser
          smallPlane(ctx, 0, 2, 0, Math.PI, p.plane);
          F.toolcart && F.toolcart(ctx, -W / 2 + 30, 2, -D / 2 + 20, 0);
          piece(ctx, -W / 2 + 40, 2, -D / 2 + 10, 0, (put) => { put(0, 12, 0, 50, 1.6, 12, PAL.woodD, M.wood); for (const a of [-1, 1]) put(a * 23, 6, 0, 1.6, 12, 10, PAL.metalD, M.metal); put(-10, 15, -3, 8, 5, 5, C("#b8241e"), M.metal); }, { fixed: true, h: 16 });
          for (let i = 0; i < 5; i++) drum(ctx, W / 2 - 14 - (i % 3) * 7, 2, -D / 2 + 12 + Math.floor(i / 3) * 7);
          F.racking(ctx, W / 2 - 10, 2, 0, Math.PI / 2, D * .5);
          if (ctx.state === "i" || ctx.state === "d") piece(ctx, -W / 2 + 26, 2, D / 4, Math.PI / 2, (put) => { put(0, 9, 0, 40, 14, 18, C("#c8a030"), M.metal); put(22, 9, 0, 10, 16, 16, C("#c8a030"), M.metal); put(23, 13, 0, 3, 7, 14, PAL.glass, M.glass); for (const zz of [-14, 0, 22]) for (const a of [-1, 1]) put(zz, 3, a * 9, 6, 6, 3, DARK, M.plain); }, { h: 18 });
          if (ruined) { rubble(ctx, r.range(-W / 4, W / 4), 2, r.range(-D / 4, D / 4), 40, 8, 40, [p.wallCol, PAL.metalD, PAL.concreteD]); }
        },
      },
      airliner: {
        name: "Airliner", sub: "a narrow-body jet: cabin with seats, wings, engines", structure: true,
        plan(r) {
          const L = SQ * r.pick([14, 15, 16]), span = L * r.range(.84, .9), R = 26, gear = 16;
          return {
            W: span, D: L + 30, T: 2, storeys: [{ base: 0, H: gear + R }], top: gear + 2 * R + 64, L, R, gear, span,
            body: r.pick([C("#eceae4"), C("#e2e4e8"), C("#d8dadc")]), livery: r.pick([C("#b8241e"), C("#1e4a8a"), C("#2e7a4a"), C("#e07a20"), C("#5a2a7a"), C("#1e7a8a")]), belly: r.pick([C("#b8bcc0"), C("#8a8e92")]),
            wallCol: C("#eceae4"), wallMat: M.plain, seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Cabin", "Roof"]; },
        draw(ctx, p, lvl) {
          const { r } = ctx, st = ctx.state, R = p.R, cy = p.gear + R, zT = -p.L / 2, zN = p.L / 2, ruined = st === "r";
          const out = ctx.B, A = newBuf(), Bk = newBuf(); // A: the front part, Bk: the back part (a wreck breaks between them)
          const split = zT + p.L * ctx.lay("split").range(.38, .55);
          const into = (z) => (ruined && z < split ? Bk : A);
          const flr = cy - R * .35;
          // the body's colour: livery band at the windows, darker belly, soot when burnt
          const bodyCol = (x, y, z) => { let c = y > cy + R * .15 && y < cy + R * .3 ? p.livery : y < cy - R * .55 ? p.belly : p.body; if (st !== "i") c = mul(c, .82 + .18 * Math.sin(z * .05 + x * .1) * (st === "r" ? 1 : .4)); return c; };
          const segs = 14, half = lvl === 0 ? [Math.PI, Math.PI * 2] : [0, Math.PI];
          const zz = Array.from({ length: segs + 1 }, (_, i) => zT + 34 + (p.L - 74) * i / segs);
          if (lvl === 1 && st !== "i") {} // holes are drawn by skipping segments below
          for (let i = 0; i < segs; i++) {
            const z0 = zz[i], z1 = zz[i + 1];
            if (lvl === 1 && st === "d" && ctx.r.chance(.1)) continue;
            if (lvl === 1 && ruined && ctx.r.chance(.3)) continue;
            tube(into((z0 + z1) / 2), 0, cy, z0, z1, R, R, 16, bodyCol, M.plain, half[0], half[1], { inner: .8, innerCol: C("#d8d4c8") });
            // windows along each side, in the upper half
            if (lvl === 1) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const wz = z0 + (z1 - z0) * (k + .5) / 3; if (st !== "i" && ctx.r.chance(.2)) continue; box(into(wz), s * (R * Math.cos(.32) + .3), cy + R * Math.sin(.32), wz, .6, 3.4, 2.4, PAL.glass, M.glass, { edge: false }); }
          }
          // nose and tail cones (split into halves too)
          const cones = [[zN - 40, zN, R, 3, "nose"], [zT, zT + 34, 6, R, "tail"]];
          for (const [z0, z1, r0, r1, nm] of cones) {
            const n = 4; for (let i = 0; i < n; i++) {
              const a = z0 + (z1 - z0) * i / n, b = z0 + (z1 - z0) * (i + 1) / n;
              const ease = (t) => nm === "nose" ? Math.sqrt(1 - t * t) : Math.sin(t * Math.PI / 2);
              const ra = nm === "nose" ? R * ease(i / n) + r1 * (i / n) * .1 : r0 + (R - r0) * ease(i / n), rb = nm === "nose" ? R * ease((i + 1) / n) + r1 * .1 : r0 + (R - r0) * ease((i + 1) / n);
              const lift = nm === "tail" ? (1 - (i + .5) / n) * R * .45 : 0;
              tube(into((a + b) / 2), 0, cy + lift, a, b, Math.max(ra, .5), Math.max(rb, .5), 16, bodyCol, M.plain, half[0], half[1], { inner: .8, innerCol: C("#d8d4c8") });
            }
          }
          if (lvl === 1) {
            // cockpit windows, the fin with the livery, a beacon
            for (const s of [-1, 1]) box(A, s * 10, cy + R * .55, zN - 22, 8, 5, 6, PAL.glass, M.glass, { rot: rotEuler(-.5, s * .35, 0), edge: false });
            const finTarget = ruined ? Bk : A;
            fin(finTarget, zT + 30, cy + R * .7, 62, 44, 18, 30, 2.4, p.livery, M.plain);
            box(finTarget, 0, cy + R * .7 + 50, zT + 6, 2.6, 12, 14, p.body, M.plain);
          } else {
            // the cabin: floor, seat rows three each side of the aisle, galleys, the flight deck
            const fw = 2 * Math.sqrt(R * R - (flr - cy) ** 2) - 2;
            for (let i = 0; i < segs; i++) { const z0 = zz[i], z1 = zz[i + 1]; box(into((z0 + z1) / 2), 0, flr, (z0 + z1) / 2, fw, 1.6, z1 - z0 + .2, C("#5a5e66"), M.plain); }
            box(A, 0, flr, zN - 30, fw * .7, 1.6, 22, C("#5a5e66"), M.plain);
            const seatCol = ctx.lay("seat").pick([C("#2a3a6a"), C("#5a2a3a"), C("#2e4a4a"), C("#3a3a40")]);
            for (let z = zT + 46; z < zN - 56; z += 9) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
              if (st !== "i" && ctx.r.chance(st === "d" ? .1 : .35)) continue;
              const x = s * (6 + k * 6.2), Bx = into(z);
              box(Bx, x, flr + 4, z, 5.6, 1.6, 5, seatCol, M.plain); box(Bx, x, flr + 8, z - 2.4, 5.6, 7, 1.2, seatCol, M.plain);
            }
            for (const gz of [zN - 50, zT + 38]) box(into(gz), 0, flr + 9, gz, fw * .8, 18, 6, C("#c8c8c0"), M.metal);
            for (const s of [-1, 1]) { box(A, s * 5, flr + 4, zN - 30, 5, 2, 5, C("#3a3a3a"), M.plain); box(A, s * 5, flr + 8, zN - 33, 5, 7, 1.2, C("#3a3a3a"), M.plain); }
            box(A, 0, flr + 7, zN - 22, 18, 5, 4, DARK, M.plain);
            // wings: low, swept, a little dihedral; the engines under them; the tailplane
            const span = p.span / 2, rootC = p.L * .2, wz = -p.L * .02, wy = cy - R * .62;
            const stations = [[wz, 0, rootC], [wz - 14, span * .35, rootC * .62], [wz - 34, span, rootC * .25]];
            const brokeWing = ruined ? ctx.lay("wing").pick([-1, 1]) : 0;
            for (const s of [1, -1]) {
              const dst = s === brokeWing ? newBuf() : into(wz);
              for (let i = 0; i < 2; i++) { const [za, xa, ca] = stations[i], [zb, xb, cb] = stations[i + 1]; const len = Math.hypot(xb - xa, zb - za), ang = Math.atan2(zb - za, xb - xa); box(dst, s * (xa + xb) / 2, wy + (xa + xb) / 2 * .06, (za + zb) / 2, len + .6, 2.4, (ca + cb) / 2, p.body, M.plain, { rot: rotEuler(0, s > 0 ? -ang : ang + Math.PI, s * .06) }); }
              box(dst, s * span * .98, wy + span * .06 + 6, wz - 34, 2, 12, 8, p.livery, M.plain); // winglet
              // the engine: a nacelle on a pylon at a third of the span
              const ex = s * span * .36, ey = wy - 12, missing = st === "d" && ctx.lay("eng").chance(.3) && s > 0;
              if (!missing) { tube(dst, ex, ey, wz - 6, wz + 30, 10, 10.5, 14, C("#c8ccd0"), M.metal); tube(dst, ex, ey, wz + 30, wz + 31, 10.5, 1, 14, DARK, M.plain); box(dst, ex, ey + 9, wz + 8, 2, 8, 18, p.body, M.plain); }
              else box(out, ex + 30, 9, wz + 20, 22, 18, 30, C("#8a8e92"), M.metal, { rot: rotEuler(.4, .8, .3) });
              if (s === brokeWing) { // snapped near the root: the outer wing lies on the ground
                const m = new THREE.Matrix4().makeTranslation(s * 30, -wy + 4, -20).multiply(rotEuler(0, s * .4, -s * .1));
                xform(dst, out, m);
              }
            }
            const tsp = p.span * .16; surface(into(zT), [[zT + 22, 0, 30], [zT + 6, tsp, 14]], cy + R * .2, 2, p.body, M.plain, true);
            // landing gear (folded up under a wreck)
            if (!ruined) for (const [gx, gz] of [[0, zN - 50], [-14, wz - 10], [14, wz - 10]]) { const flat = st === "d" && ctx.r.chance(.3) ? 3 : 0; box(A, gx, p.gear / 2 + 3, gz, 2, p.gear - 2, 2, PAL.metal, M.metal); for (const t of gx ? [-3, 3] : [0]) box(A, gx + t, 5 - flat / 2, gz, 3, 10 - flat, 10, DARK, M.plain); }
            // doors: outlines on the front left and the back left
            for (const dz of [zN - 46, zT + 44]) box(A, -R - .1, cy + 2, dz, .4, 20, 9, mul(p.body, .8), M.plain, { edge: false });
          }
          // put the parts in place: whole, or broken in two and set down on its belly
          if (!ruined) { xform(A, out, new THREE.Matrix4()); return; }
          const sit = -p.gear + 2;
          xform(A, out, new THREE.Matrix4().makeTranslation(ctx.lay("off").range(-6, 6), sit, 10).multiply(rotEuler(.06, ctx.lay("yaw").range(-.12, .12), ctx.lay("roll").range(-.1, .1))));
          xform(Bk, out, new THREE.Matrix4().makeTranslation(ctx.lay("off2").range(-14, 14), sit + 2, -12).multiply(rotEuler(-.08, ctx.lay("yaw2").range(-.4, .4), ctx.lay("roll2").range(-.25, .25))));
          if (lvl === 0) rubble(ctx, 0, 0, split, 22, 6, 24, [p.body, PAL.metalD, C("#2a2622")]);
        },
      },
      fueltank: {
        name: "Fuel tank", sub: "a big round tank in a bund wall", structure: true,
        plan(r) { const R = SQ * r.pick([1.6, 2, 2.4]); return { W: R * 2 + 16, D: R * 2 + 16, T: 2, storeys: [{ base: 0, H: 70 }], top: 80, noRoof: true, R, H: r.pick([56, 66, 76]), wallCol: r.pick([C("#e2e0d8"), C("#c8ccd0"), C("#b8bca8")]), wallMat: M.metal, seed: r.int(0, 1e9) }; },
        floors() { return ["Tank"]; },
        draw(ctx, p) {
          const { B, r } = ctx, R = p.R, st = ctx.state, H = st === "r" ? p.H * ctx.lay("h").range(.35, .6) : p.H;
          const col = (x, y, z) => st === "i" ? p.wallCol : mul(p.wallCol, .75 + .25 * Math.sin(x * .2 + z * .13 + y * .05) * (st === "r" ? .6 : .2) + (st === "r" && y > H * .6 ? -.4 : 0));
          // the bund: a low wall round it
          const Wb = p.W / 2 - 2;
          for (const [x, z, w, d] of [[0, Wb, p.W - 2, 3], [0, -Wb, p.W - 2, 3], [Wb, 0, 3, p.W - 2], [-Wb, 0, 3, p.W - 2]]) box(B, x, 4, z, w, 8, d, PAL.concreteD, M.concrete);
          for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, a2 = (i + 1) / 24 * Math.PI * 2; const hh = st === "r" ? H * (.7 + .3 * Math.sin(i * 1.7)) : H; box(B, Math.cos((a + a2) / 2) * R, hh / 2, Math.sin((a + a2) / 2) * R, 2 * R * Math.sin(Math.PI / 24) + .3, hh, 1.6, (x, y, z) => col(x, y, z), M.corr, { rot: rotEuler(0, -(a + a2) / 2 + Math.PI / 2, 0), edge: false }); }
          if (st !== "r") { cyl(B, 0, H, 0, R + .5, R * .2, 10, 24, mul(p.wallCol, .9), M.metal); for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; box(B, Math.cos(a) * (R + 1.2), H + 3, Math.sin(a) * (R + 1.2), 1, 6, 1, PAL.metal, M.metal); } }
          else { box(B, 0, 6, 0, R * 1.4, 3, R * 1.2, C("#2a2622"), M.rubble, { rot: rotEuler(.2, r.range(0, 3), .1) }); ctx.soot.push([0, 0, H, R]); }
          // a stair winding up the side
          for (let i = 0; i < 18; i++) { const a = -Math.PI / 2 + i * .09, y = 4 + i * (H - 6) / 18; if (y > H - 2) break; box(B, Math.cos(a) * (R + 3), y, Math.sin(a) * (R + 3), 6, .8, 3, PAL.metalD, M.metal, { rot: rotEuler(0, -a, 0) }); }
          for (const a of [0, 2.1, 4.2]) box(B, Math.cos(a) * (R + 6), 4, Math.sin(a) * (R + 6), 4, 4, 14, PAL.metal, M.metal, { rot: rotEuler(0, -a, 0) });
        },
      },
    };

    /* ---------- vehicles (13 Nov 2026) ----------
       Cars, trucks, buses and emergency vehicles, nose to +z, in the same three states as the buildings: Intact,
       Damaged (dents, a flat tyre, a door hanging open, dulled paint) and Ruined (burnt out: no glass or tyres,
       sitting on its rims, sooted and rusted). Level 0 is the body below the window line with the seats and load
       inside; level 1 is the glass and roof, so hiding it opens the vehicle up.
       A vehicle is described by its side profile: "lower" (the body up to the window line) and "upper" (the
       glass and roof), polygons of [z, y] points, extruded across its width. The lower body is drawn as a shell
       (floor, side walls, and solid where the engine and boot are) so the seats show when the roof is off. */
    const PAINT = ["#c8c4bc", "#b0b2b4", "#2a2c30", "#1e2024", "#e8e6e0", "#dcdad4", "#8a1e1e", "#1e3a6a", "#2e4a3a", "#6a6e72", "#b8a070", "#5a6e82", "#4a2e22"].map(C); // the colours cars really come in: mostly silver, white, black and grey
    const TYRE = C("#1e1e20"), HUB = C("#9a9ea2"), RIM = C("#4a4642"), SOOT = C("#2a2622"), RUST = C("#6a4026"), GLASS = C("#2a3440"), SEAT = [C("#3a3a3e"), C("#5a4a3a"), C("#2e3a4e"), C("#4a3a3a")];
    const SIDE = { O: [0, 0], A: [0, 1], I: [1, 0] }; // prism's wall frame turned so profile [along, up] = [z, y] and t = x
    const ex = (B, pts, x0, x1, col, mat) => { if (pts.length >= 3 && x1 - x0 > .05) prism(B, SIDE, pts, 0, x0, x1, col, mat); };
    // cut a profile polygon to z0 <= z <= z1 or y0 <= y <= y1 (Sutherland-Hodgman against two lines)
    function clipP(pts, k, lo, hi) {
      const cut = (P, inside, at) => { const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(at(a, b)); } return out; };
      const lerpAt = (v) => (a, b) => { const t = (v - a[k]) / (b[k] - a[k]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      let P = pts;
      if (lo > -1e8) P = cut(P, (q) => q[k] >= lo, lerpAt(lo));
      if (hi < 1e8 && P.length) P = cut(P, (q) => q[k] <= hi, lerpAt(hi));
      return P;
    }
    const zr = (pts, z0, z1) => clipP(pts, 0, z0, z1), yr = (pts, y0, y1) => clipP(pts, 1, y0, y1);
    // a wheel: tyre and hub, its axle along x, on the side s (+1 right, -1 left); a burnt one is a bare rim
    function wheel(B, x, y, z, r, w, s, burnt, flat) {
      const T = newBuf(), rr = burnt ? r * .72 : r;
      cyl(T, 0, -w / 2, 0, rr, rr, w, 14, burnt ? RIM : TYRE, burnt ? M.metal : M.plain);
      if (!burnt) cyl(T, 0, w / 2 - .2, 0, r * .55, r * .5, .6, 10, HUB, M.metal);
      const m = new THREE.Matrix4().makeTranslation(x, y - (flat ? r * .25 : 0), z).multiply(rotEuler(0, 0, -s * Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 1, flat ? 1 : 1));
      if (flat) m.multiply(new THREE.Matrix4().makeScale(1.12, 1, .8));
      xform(T, B, m);
      // the far face of the tyre: the same disc turned the other way
      const T2 = newBuf(); cyl(T2, 0, -.05, 0, rr, rr, .1, 14, burnt ? RIM : TYRE, M.plain);
      xform(T2, B, new THREE.Matrix4().makeTranslation(x - s * w / 2, y - (flat ? r * .25 : 0), z).multiply(rotEuler(0, 0, s * Math.PI / 2)));
    }
    // a seat facing +z at (x, y, z): cushion and back
    const seat = (B, x, y, z, w, col) => { box(B, x, y + 2, z, w, 2.4, 6, col, M.plain); box(B, x, y + 6.5, z - 3, w, 8, 1.6, col, M.plain); };

    const VEH = {
      // [length, width, body colours] and the profile builders: each returns {lower, upper, solid: [[z0,z1],...], floor, wheels: [z...], r, extras(ctx, A, p, lvl, col)}
      sedan: { name: "Sedan", sub: "four doors, a boot", L: 78, W: 30, prof(L) { const h = L / 2; return { lower: [[-h, 4], [h, 4], [h, 11], [h - 3, 13.5], [12, 14.5], [-28, 14.5], [-h, 13]], upper: [[12, 14.5], [-25, 14.5], [-19, 23], [3, 23]], solid: [[12, h], [-h, -26]], floor: 6, wheels: [-25, 25], r: 6.2 }; } },
      suv: { name: "SUV", sub: "tall wagon, roof rails", L: 82, W: 32, prof(L) { const h = L / 2; return { lower: [[-h, 5], [h, 5], [h, 13], [h - 3, 16], [16, 17], [-h, 17]], upper: [[16, 17], [-h + 1, 17], [-h + 2, 29], [6, 29.5]], solid: [[16, h]], floor: 7.5, wheels: [-26, 26], r: 7.2, rails: true }; } },
      pickup: { name: "Pickup truck", sub: "a cab and an open bed", L: 90, W: 32, prof(L) { const h = L / 2; return { lower: [[-h, 5], [h, 5], [h, 14], [h - 3, 17], [18, 18], [-h, 18]], upper: [[18, 18], [-6, 18], [-5, 29], [8, 29]], solid: [[18, h]], floor: 7.5, bed: [-h, -7], wheels: [-28, 28], r: 7.4 }; } },
      van: { name: "Cargo van", sub: "sliding door, cargo inside", L: 88, W: 33, prof(L) { const h = L / 2; return { lower: [[-h, 5], [h, 5], [h, 13], [h - 4, 17], [h - 12, 19], [-h, 19]], upper: [[h - 12, 19], [-h, 19], [-h, 36], [h - 26, 36.5], [h - 18, 33]], solid: [[h - 12, h]], floor: 7, glassFrom: h - 30, wheels: [-29, 29], r: 7 }; } },
      police: { name: "Police car", sub: "a cruiser with a light bar", L: 80, W: 30, prof(L) { const h = L / 2; return { lower: [[-h, 4], [h, 4], [h, 11], [h - 3, 13.5], [12, 14.5], [-29, 14.5], [-h, 13]], upper: [[12, 14.5], [-26, 14.5], [-20, 23], [3, 23]], solid: [[12, h], [-h, -27]], floor: 6, wheels: [-26, 26], r: 6.2, lightbar: true }; } },
      ambulance: { name: "Ambulance", sub: "box body, stretcher and cabinets", L: 104, W: 36, prof(L) { const h = L / 2; return { lower: [[-h, 6], [h, 6], [h, 15], [h - 4, 19], [h - 14, 20], [-h, 20]], upper: [[h - 14, 20], [-h, 20], [-h, 44], [h - 24, 44], [h - 24, 33], [h - 20, 31]], solid: [[h - 8, h]], floor: 8, glassFrom: h - 24, wheels: [-32, 30], r: 7.6, lights: true }; } },
      firetruck: { name: "Fire engine", sub: "pump, hose reels, a ladder on top", L: 160, W: 40, prof(L) { const h = L / 2; return { lower: [[-h, 7], [h, 7], [h, 18], [h - 4, 22], [-h, 22]], upper: [[h - 4, 22], [-h, 22], [-h, 44], [h - 34, 44], [h - 34, 46], [h - 8, 46], [h - 4, 34]], solid: [[h - 10, h], [-h, -h + 6]], floor: 10, glassFrom: h - 34, wheels: [-52, -36, 46], r: 9, lights: true, ladder: true }; } },
      schoolbus: { name: "School bus", sub: "rows of bench seats", L: 190, W: 40, prof(L) { const h = L / 2; return { lower: [[-h, 7], [h, 7], [h, 17], [h - 4, 21], [h - 26, 22], [h - 30, 24], [-h, 24]], upper: [[h - 30, 24], [-h, 24], [-h + 1, 46], [h - 32, 47], [h - 30, 40]], solid: [[h - 26, h]], floor: 10, band: [27, 40], wheels: [-58, 54], r: 8.4, rows: 10 }; } },
      citybus: { name: "City bus", sub: "low floor, two doors, seats", L: 200, W: 42, prof(L) { const h = L / 2; return { lower: [[-h, 5], [h, 5], [h, 18], [-h, 18]], upper: [[h, 18], [-h, 18], [-h, 50], [h - 2, 50], [h, 46]], solid: [], floor: 7, band: [21, 44], wheels: [-60, 58], r: 8.4, rows: 9 }; } },
      boxtruck: { name: "Box truck", sub: "a cab and a roller-door box", L: 130, W: 38, prof(L) { const h = L / 2; return { lower: [[-h, 7], [h, 7], [h, 17], [h - 4, 22], [-h, 22]], upper: [[h - 4, 22], [-h, 22], [-h, 56], [h - 30, 56], [h - 30, 40], [h - 22, 38], [h - 6, 34]], solid: [[h - 10, h]], floor: 10, glassFrom: h - 30, wheels: [-40, 38], r: 8.6 }; } },
      semi: { name: "Semi truck", sub: "a tractor and a box trailer", L: 300, W: 40, prof(L) { const h = L / 2; return { lower: [[-h, 9], [h, 9], [h, 22], [h - 4, 26], [-h, 26]], upper: [[h - 4, 26], [h - 54, 26], [h - 54, 64], [h - 20, 64], [h - 12, 50], [h - 6, 38]], trailer: [[h - 58, 26], [-h, 26], [-h, 66], [h - 58, 66]], solid: [[h - 14, h], [-h, h - 58]], floor: 12, glassFrom: h - 30, wheels: [-h + 18, -h + 34, h - 74, h - 60, h - 20], r: 8.6 }; } },
      humvee: { name: "Humvee", sub: "wide, low, a gun ring", L: 82, W: 38, prof(L) { const h = L / 2; return { lower: [[-h, 6], [h, 6], [h, 16], [16, 18], [-h, 18]], upper: [[16, 18], [-h + 2, 18], [-h + 2, 30], [6, 30], [10, 26]], solid: [[16, h], [-h, -h + 12]], floor: 8, wheels: [-27, 27], r: 7.8, military: true, turret: true }; } },
      technical: { name: "Technical", sub: "a pickup with a gun and scrap armour", L: 90, W: 32, prof(L) { const h = L / 2; return { lower: [[-h, 5], [h, 5], [h, 14], [h - 3, 17], [18, 18], [-h, 18]], upper: [[18, 18], [-6, 18], [-5, 29], [8, 29]], solid: [[18, h]], floor: 7.5, bed: [-h, -7], wheels: [-28, 28], r: 7.4, gun: true, armour: true }; } },
      motorcycle: { name: "Motorcycle", sub: "a road bike", L: 40, W: 12, moto: true },
      taxi: { name: "Taxi", sub: "a yellow cab with its roof sign", L: 80, W: 30, prof(L) { const h = L / 2; return { lower: [[-h, 4], [h, 4], [h, 11], [h - 3, 13.5], [12, 14.5], [-29, 14.5], [-h, 13]], upper: [[12, 14.5], [-26, 14.5], [-20, 23], [3, 23]], solid: [[12, h], [-h, -27]], floor: 6, wheels: [-26, 26], r: 6.2, cabsign: true }; } },
      tractor: { name: "Tractor", sub: "big back wheels, a glass cab, an exhaust stack", L: 76, W: 30, prof(L) { const h = L / 2; return { lower: [[-h, 9], [h, 9], [h, 22], [h - 4, 25], [-4, 26], [-h, 26]], upper: [[-4, 26], [-h + 3, 26], [-h + 4, 52], [-6, 52]], solid: [[-4, h]], floor: 12, wheels: [-h + 14, h - 11], wr: [15, 8.5], r: 8.5, stack: true }; } },
    };

    /* ---------- the machines (13 Nov 2026; rebuilt the same day): what an AI's factories build when they no longer
       bother to make things look like people. Futuristic but built like real hardware: layered armour panels with
       seams and bolts over a dark core, mechanisms in plain sight (twin-beam legs, actuator clusters, shock absorbers,
       hoses), vents and heat sinks, weathered paint with grime low down and worn edges, a cluster of lenses round
       one big red eye. One family look so the players read them as one enemy on one network: every machine carries
       a cyan uplink that is lit while it is linked and goes dark when it dies. ---------- */
    const MC = { core: C("#1e2022"), frame: C("#2b2d2f"), joint: C("#18191a"), steel: C("#9da1a3"), rubber: C("#161616"), eye: C("#ff2a12"), lamp: C("#fff0d0"), net: C("#38d6ff"), sten: C("#ddd8cc"), glass: C("#0c0d0e"), dark: C("#141516") };
    // the paint: [panels, second panels, accent]
    const MSCHEME = [
      [C("#b2aea3"), C("#8f8c84"), C("#a4471c")], // worn white with burnt orange
      [C("#7b8084"), C("#5d6266"), C("#963022")], // steel grey with red
      [C("#a19478"), C("#82775f"), C("#a6511f")], // dust with orange
      [C("#5f6558"), C("#4b5046"), C("#b08528")], // drab with ochre
    ];
    const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d3 = new THREE.Vector3();
    const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const PI2 = Math.PI / 2;
    function rod(B, a, b, r, col, mat = M.metal) {
      _d3.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d3.length(); if (L < .05) return; _d3.divideScalar(L);
      box(B, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r * 2, L, r * 2, col, mat, { rot: new THREE.Matrix4().makeRotationFromQuaternion(_q.setFromUnitVectors(_up, _d3)), edge: false });
    }
    function mTube(B, a, b, r, col, mat = M.metal, seg = 8, r1) {
      _d3.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d3.length(); if (L < .05) return; _d3.divideScalar(L);
      const T = newBuf(); cyl(T, 0, 0, 0, r, r1 == null ? r : r1, L, seg, col, mat);
      xform(T, B, new THREE.Matrix4().makeTranslation(a[0], a[1], a[2]).multiply(new THREE.Matrix4().makeRotationFromQuaternion(_q.setFromUnitVectors(_up, _d3))));
    }
    // the frame of a segment a -> b: x across (level), y as near up as it can be, z along
    function basis(a, b) {
      _bz.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _bz.length(); if (L < .05) return 0; _bz.divideScalar(L);
      _bx.set(_bz.z, 0, -_bz.x); if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0); _bx.normalize(); _by.crossVectors(_bz, _bx); if (_by.y < 0) { _bx.negate(); _by.negate(); }
      return L;
    }
    // a box laid along a -> b, w across and h deep, moved o.up along its own y and o.side along its own x, worn edges
    function obox(B, a, b, w, h, col, mat = M.plain, o = {}) {
      const L = basis(a, b); if (!L) return; const u = o.up || 0, s = o.side || 0, f = o.along || 0;
      const c = [(a[0] + b[0]) / 2 + _by.x * u + _bx.x * s + _bz.x * f, (a[1] + b[1]) / 2 + _by.y * u + _bx.y * s + _bz.y * f, (a[2] + b[2]) / 2 + _by.z * u + _bx.z * s + _bz.z * f];
      box(B, c[0], c[1], c[2], w, h, L * (o.len || 1) + (o.pad || 0), col, mat, { rot: new THREE.Matrix4().makeBasis(_bx.clone(), _by.clone(), _bz.clone()), edge: o.edge !== false });
    }
    const lit = (k, col) => k.dead ? [MC.dark, M.metal] : [col, M.screen];
    const glowBox = (B, x, y, z, w, h, d, k, col, o = {}) => { const [c, m] = lit(k, col); box(B, x, y, z, w, h, d, c, m, { edge: false, ...o }); };
    const pcol = (k, two) => jit(two ? k.c2 : k.c1, k.r, .05);
    // armour over a dark core: panels on the top, the sides and the ends, each a little apart from the next, bolted
    // when they are big enough; o.gx/gy/gz: how many panels each way; o.acc: the chance a panel is in the accent colour
    function plated(B, cx, cy, cz, w, h, d, k, o = {}) {
      const T = newBuf(), r = k.r, t = o.t || Math.max(.4, Math.min(w, h, d) * .09), gap = o.gap || Math.max(.2, t * .5), cell = o.cell || 13;
      const gx = o.gx || Math.max(1, Math.round(w / cell)), gy = o.gy || Math.max(1, Math.round(h / cell)), gz = o.gz || Math.max(1, Math.round(d / cell));
      box(T, 0, 0, 0, w - t * 1.4, h - t * 1.4, d - t * 1.4, k.core, M.metal, { edge: false });
      const pc = (two) => o.col ? jit(o.col, r, .03) : r.chance(o.acc || 0) ? k.acc : pcol(k, two);
      const bolts = (x, y, z, pw, pd, nrm) => { if (pw < 5 || pd < 5 || !r.chance(.6)) return; const bs = Math.max(.25, t * .35); for (const a of [-1, 1]) for (const b of [-1, 1]) { const q = [x, y, z]; if (nrm === 1) { q[0] += a * (pw / 2 - bs * 1.5); q[2] += b * (pd / 2 - bs * 1.5); q[1] += t / 2; } else if (nrm === 0) { q[2] += a * (pw / 2 - bs * 1.5); q[1] += b * (pd / 2 - bs * 1.5); q[0] += Math.sign(x) * t / 2; } else { q[0] += a * (pw / 2 - bs * 1.5); q[1] += b * (pd / 2 - bs * 1.5); q[2] += Math.sign(z) * t / 2; } box(T, q[0], q[1], q[2], bs, bs, bs, k.frame, M.metal, { edge: false }); } };
      if (!o.noTop) for (let i = 0; i < gx; i++) for (let j = 0; j < gz; j++) { if (k.lose(.07)) continue; const x = -w / 2 + (i + .5) * w / gx, z = -d / 2 + (j + .5) * d / gz, pw = w / gx - gap, pd = d / gz - gap; box(T, x, h / 2 - t / 2, z, pw, t, pd, pc((i + j) % 2), M.plain); bolts(x, h / 2 - t / 2, z, pw, pd, 1); }
      for (const s of [-1, 1]) for (let j = 0; j < gz; j++) for (let m = 0; m < gy; m++) { if (k.lose(.07)) continue; const z = -d / 2 + (j + .5) * d / gz, y = -h / 2 + (m + .5) * h / gy, pw = d / gz - gap, ph = h / gy - gap; box(T, s * (w / 2 - t / 2), y, z, t, ph, pw, pc((j + m + 1) % 2), M.plain); bolts(s * (w / 2 - t / 2), y, z, pw, ph, 0); }
      if (!o.noEnds) for (const s of [-1, 1]) { if (s > 0 && o.noFront) continue; for (let i = 0; i < gx; i++) for (let m = 0; m < gy; m++) { if (k.lose(.07)) continue; const x = -w / 2 + (i + .5) * w / gx, y = -h / 2 + (m + .5) * h / gy, pw = w / gx - gap, ph = h / gy - gap; box(T, x, y, s * (d / 2 - t / 2), pw, ph, t, pc((i + m) % 2), M.plain); bolts(x, y, s * (d / 2 - t / 2), pw, ph, 2); } }
      const m4 = new THREE.Matrix4().makeTranslation(cx, cy, cz); if (o.rot) m4.multiply(o.rot); xform(T, B, m4);
    }
    // small machinery on a face looking up: vents, caps, boxes, pipe runs
    function greeble(B, x, y, z, w, d, n, k) {
      const r = k.r;
      for (let i = 0; i < n; i++) {
        const px = x + r.range(-w / 2, w / 2) * .85, pz = z + r.range(-d / 2, d / 2) * .85, s = Math.min(w, d) * r.range(.08, .2), kind = r.int(0, 4);
        if (kind === 0) { box(B, px, y + s * .3, pz, s * 1.6, s * .6, s, k.frame, M.metal); for (let j = 0; j < 4; j++) box(B, px - s * .6 + j * s * .4, y + s * .65, pz, s * .15, s * .2, s * .9, MC.dark, M.metal, { edge: false }); }
        else if (kind === 1) { cyl(B, px, y, pz, s * .55, s * .5, s * .6, 8, k.frame, M.metal); cyl(B, px, y + s * .6, pz, s * .3, s * .3, s * .2, 8, k.steel, M.metal); }
        else if (kind === 2) box(B, px, y + s * .35, pz, s, s * .7, s * 1.3, pcol(k, 1), M.plain);
        else if (kind === 3) mTube(B, [px - s * 1.2, y + s * .25, pz], [px + s * 1.2, y + s * .25, pz], s * .18, k.frame, M.metal, 6);
        else { box(B, px, y + s * .2, pz, s * 1.4, s * .4, s * 1.4, k.acc, M.plain); }
      }
    }
    // heat-sink fins standing on a face looking up
    function fins(B, x, y, z, w, d, n, k) { box(B, x, y - .3, z, w, .6, d, MC.dark, M.metal, { edge: false }); for (let i = 0; i < n; i++) box(B, x - w / 2 + (i + .5) * w / n, y + .7, z, w / n * .3, 1.6, d * .92, k.frame, M.metal); }
    // a linear actuator, and a shock absorber (a ram inside a coil)
    function ram(B, a, b, r, k) { mTube(B, a, lerp3(a, b, .58), r, k.frame, M.metal, 8); mTube(B, lerp3(a, b, .5), b, r * .5, k.steel, M.metal, 6); mTube(B, lerp3(a, b, -.06), lerp3(a, b, .06), r * 1.3, k.joint, M.metal, 8); mTube(B, lerp3(a, b, .94), lerp3(a, b, 1.04), r * .9, k.joint, M.metal, 8); }
    function shock(B, a, b, r, k) { ram(B, a, b, r * .6, k); for (let i = 0; i < 7; i++) { const t = .2 + i * .1; mTube(B, lerp3(a, b, t), lerp3(a, b, t + .035), r * 1.1, k.acc, M.metal, 8); } }
    function hose(B, a, b, r, k) { if (k.dead) return; const m = lerp3(a, b, .5); m[1] -= Math.hypot(b[0] - a[0], b[2] - a[2]) * .12 + r * 2.5; mTube(B, a, m, r, MC.rubber, M.plain, 5); mTube(B, m, b, r, MC.rubber, M.plain, 5); }
    // the sensor cluster: a housing, one big red eye and smaller lenses round it, a hood over them
    function eye(B, at, dir, r, k) {
      const o = (f) => [at[0] + dir[0] * f, at[1] + dir[1] * f, at[2] + dir[2] * f], [c, m] = lit(k, MC.eye);
      mTube(B, o(-r * 1.2), o(0), r * 1.5, k.frame, M.metal, 14); mTube(B, o(-r * .2), o(r * .12), r * 1.62, k.joint, M.metal, 14);
      mTube(B, o(0), o(r * .25), r * 1.1, MC.glass, M.glass, 14); mTube(B, o(r * .1), o(r * .36), r * .48, c, m, 12);
    }
    function eyes(B, at, dir, r, k, n = 3) {
      eye(B, at, dir, r, k); const ax = Math.abs(dir[2]) > .5 ? [1, 0, 0] : [0, 0, 1];
      for (let i = 0; i < n; i++) { const a = (i / Math.max(1, n - 1) - .5) * 2.2, p = [at[0] + ax[0] * Math.sin(a) * r * 2.2, at[1] - Math.cos(a) * r * 1.5, at[2] + ax[2] * Math.sin(a) * r * 2.2]; lens(B, p, dir, r * .32, k); }
    }
    function lens(B, at, dir, r, k, col = MC.eye) { const [c, m] = lit(k, col); mTube(B, add3(at, [-dir[0] * r, -dir[1] * r, -dir[2] * r]), at, r * 1.4, k.frame, M.metal, 8); mTube(B, at, add3(at, [dir[0] * r * .4, dir[1] * r * .4, dir[2] * r * .4]), r, c, m, 8); }
    const strip = (B, x, y, z, w, h, d, k, col = MC.eye, rot) => glowBox(B, x, y, z, w, h, d, k, col, rot ? { rot } : {});
    // the network: a cyan uplink with a blade aerial and a whip
    function uplink(B, x, y, z, s, k) {
      cyl(B, x, y, z, s * 1.3, s * 1.2, s * .5, 10, k.frame, M.metal); const [c, m] = lit(k, MC.net); cyl(B, x, y + s * .5, z, s * .9, s * .8, s * .35, 10, c, m);
      box(B, x + s * .3, y + s * 2, z - s * .3, s * .22, s * 3.2, s * 1.3, k.frame, M.metal, { rot: rotEuler(-.25, 0, 0) });
      mTube(B, [x - s * .7, y + s * .5, z + s * .5], [x - s * .9, y + s * 7, z + s * .2], s * .1, k.steel, M.metal, 4, s * .05);
    }
    function mark(B, x, y, z, s, k, kind, ry = 0) {
      const T = newBuf(), col = k.sten, o = { edge: false };
      if (kind === "chev") for (const dy of [0, s * .55]) for (const sd of [-1, 1]) box(T, sd * s * .3, dy, 0, s * .72, s * .18, .15, col, M.plain, { ...o, rot: rotEuler(0, 0, sd * .62) });
      else if (kind === "bars") for (let i = 0; i < 3; i++) box(T, (i - 1) * s * .42, 0, 0, s * .18, s, .15, col, M.plain, o);
      else if (kind === "haz") for (let i = 0; i < 5; i++) box(T, (i - 2) * s * .4, 0, 0, s * .2, s * .9, .15, i % 2 ? MC.dark : k.acc, M.plain, { ...o, rot: rotEuler(0, 0, .5) });
      else { for (const sd of [-1, 1]) { box(T, 0, sd * s * .45, 0, s, s * .1, .15, col, M.plain, o); box(T, sd * s * .45, 0, 0, s * .1, s, .15, col, M.plain, o); } box(T, 0, 0, 0, s * .26, s * .26, .15, col, M.plain, o); }
      xform(T, B, new THREE.Matrix4().makeTranslation(x, y, z).multiply(rotEuler(0, ry, 0)));
    }
    // a ring of plates round an axis (a rotor guard): centre c, radius rr, axis "y", "x" or "z"
    function duct(B, c, rr, depth, col, axis = "y", n = 16, th) {
      const w = rr * 2 * Math.PI / n * 1.06, t = th || rr * .12;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2;
        if (axis === "y") box(B, c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr, w, depth, t, col, M.plain, { rot: rotEuler(0, -a + PI2, 0) });
        else if (axis === "x") box(B, c[0], c[1] + Math.cos(a) * rr, c[2] + Math.sin(a) * rr, depth, w, t, col, M.plain, { rot: rotEuler(a, 0, 0) });
        else box(B, c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr, c[2], w, t, depth, col, M.plain, { rot: rotEuler(0, 0, a + PI2) }); }
    }
    function blades(B, c, len, n, k, axis = "y", wd = 1.6, tw = 0) {
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI + tw;
        if (axis === "y") box(B, c[0], c[1], c[2], len, .35, wd, MC.dark, M.metal, { rot: rotEuler(.12, a, 0), edge: false });
        else box(B, c[0], c[1], c[2], len, wd, .35, MC.dark, M.metal, { rot: rotEuler(0, .12, a), edge: false }); }
      if (axis === "y") cyl(B, c[0], c[1] - .3, c[2], wd * .7, wd * .4, wd * .7, 8, k.frame, M.metal); else mTube(B, [c[0], c[1], c[2] - .4], [c[0], c[1], c[2] + wd * .8], wd * .7, k.frame, M.metal, 8, wd * .2);
    }
    // a guarded fan: the duct, struts across it, a motor pod under it, blades
    function mFan(B, c, rr, k, axis = "y", tw = 0) {
      duct(B, c, rr, rr * .32, pcol(k), axis, Math.max(12, Math.round(rr * 1.6)), rr * .1);
      const bl = (Q) => (axis === "y" ? blades(Q, [c[0], c[1] + rr * .05, c[2]], rr * 1.8, 3, k, "y", rr * .16, tw) : blades(Q, c, rr * 1.8, 3, k, axis, rr * .16, tw));
      if (axis === "y") { for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + tw; rod(B, c, [c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr], rr * .035, k.frame); } cyl(B, c[0], c[1] - rr * .45, c[2], rr * .18, rr * .14, rr * .5, 10, k.frame, M.metal); }
      if (k.part && B === k.A) k.part("rotor", c, bl, { axis: axis === "y" ? [0, 1, 0] : axis === "x" ? [1, 0, 0] : [0, 0, 1], spin: 14 }); else bl(B);
    }
    // fliers used to stand on a clear flight stand like a mini's; Hayden had them taken off (14 Nov): they hang in the air
    function flightStand() { }
    // a walking leg built like hardware: a hip drum with a capped end, a twin-beam thigh under an armour plate with
    // its actuator between the beams, a knee drum and cap, a plated shin with a shock absorber, an ankle and a clawed
    // foot. bend [x, z]: the way the knee points; lift raises the knee
    function wLeg(B, hip, foot, r, k, bend = [0, 1], amt = .14, lift = 0, toes = 3) {
      const dx = foot[0] - hip[0], dz = foot[2] - hip[2], dy = hip[1] - foot[1], L = Math.hypot(dx, dy, dz);
      const bl = Math.hypot(bend[0], bend[1]) || 1, bx = bend[0] / bl, bz = bend[1] / bl, ax = -bz, az = bx;
      const knee = [hip[0] + dx * .5 + bx * L * amt, foot[1] + dy * .56 + lift, hip[2] + dz * .5 + bz * L * amt], ank = [foot[0] - bx * r * .3, foot[1] + r * 2.4, foot[2] - bz * r * .3];
      const off = (p, f, up = 0, sd = 0) => [p[0] + bx * f + ax * sd, p[1] + up, p[2] + bz * f + az * sd];
      const across = (B, c, w, rr, col) => mTube(B, [c[0] - ax * w, c[1], c[2] - az * w], [c[0] + ax * w, c[1], c[2] + az * w], rr, col, M.metal, 12);
      const thigh = (B) => {
        // the hip
        across(B, hip, r * 1.7, r * 1.6, k.joint); for (const s of [-1, 1]) { const e = off(hip, 0, 0, s * r * 1.75); mTube(B, e, off(hip, 0, 0, s * r * 2.05), r * 1.1, pcol(k, 1), M.plain, 6); }
        // the thigh: two beams, a plate over them, the actuator between, a hose
        for (const s of [-1, 1]) obox(B, off(hip, 0, 0, s * r * .8), off(knee, 0, 0, s * r * .7), r * .55, r * 1.3, k.frame, M.metal);
        if (!k.lose(.1)) { obox(B, hip, knee, r * 2.5, r * .45, pcol(k), M.plain, { up: r * 1, len: .8 }); obox(B, hip, knee, r * 1.6, r * .35, k.acc, M.plain, { up: r * 1.35, len: .28, along: -L * .08 }); }
        ram(B, off(hip, -r * .4, -r * .9), off(knee, -r * .3, -r * .7), r * .45, k);
        hose(B, off(hip, -r * .8, r * .9, r * 1.2), off(knee, -r * .8, r * .2, r * .9), r * .17, k);
      };
      const shin = (B) => {
        // the knee
        across(B, knee, r * 1.4, r * 1.25, k.joint); obox(B, off(knee, r * .9, r * .2), off(knee, r * 1.6, -r * 1.6), r * 2.4, r * .5, pcol(k, 1), M.plain);
        // the shin: a plated box, a shock absorber behind it
        obox(B, knee, ank, r * 1.4, r * 1.6, k.frame, M.metal, { len: .9 });
        if (!k.lose(.1)) { obox(B, knee, ank, r * 1.9, r * .5, pcol(k), M.plain, { side: 0, up: 0, len: .62, along: -L * .06 }); for (const s of [-1, 1]) obox(B, knee, ank, r * .35, r * 1.7, pcol(k, 1), M.plain, { side: s * r * .9, len: .55, along: -L * .08 }); }
        shock(B, off(lerp3(knee, ank, .2), -r * 1.3), off(ank, -r * 1.1, r * .4), r * .5, k);
      };
      const paw = (B) => {
        // the ankle and the foot
        across(B, ank, r * .9, r * .8, k.joint);
        for (let i = 0; i < toes; i++) { const t = toes === 1 ? 0 : -.75 + 1.5 * i / (toes - 1), c = Math.cos(t), s = Math.sin(t), ex = bx * c - ax * s, ez = bz * c - az * s, mid = [ank[0] + ex * r * 1.6, foot[1] + r * 1.1, ank[2] + ez * r * 1.6], tip = [foot[0] + ex * r * 3, foot[1] + r * .15, foot[2] + ez * r * 3];
          obox(B, ank, mid, r * .8, r * .8, k.frame, M.metal); obox(B, mid, tip, r * .65, r * .55, MC.dark, M.metal); }
        obox(B, ank, [foot[0] - bx * r * 2, foot[1] + r * .3, foot[2] - bz * r * 2], r * .6, r * .6, k.frame, M.metal);
        cyl(B, foot[0], foot[1], foot[2], r * 1.3, r * 1.1, r * .5, 8, MC.rubber, M.plain);
      };
      if (k.part && B === k.A) {
        const t = k.part("leg", hip, thigh, { foot: foot.slice(), knee: knee.slice(), ank: ank.slice(), axis: [ax, 0, az], r });
        const sh = k.part("shin", knee, shin, { parentIx: t });
        k.part("paw", ank, paw, { parentIx: sh });
        return;
      }
      thigh(B); shin(B); paw(B);
    }
    // the kit for one machine in one state
    function mKit(ctx, p) {
      const st = ctx.state, r = ctx.r, dead = st === "r", dmg = st === "d", sch = MSCHEME[p.scheme || 0];
      return { dead, dmg, r, c1: sch[0], c2: sch[1], acc: sch[2], core: MC.core, frame: MC.frame, joint: MC.joint, steel: MC.steel, sten: MC.sten,
        lose: (q) => (dmg && r.chance(q)) || (dead && r.chance(q * 2.2)) };
    }
    // weather what was drawn: grime low down and in streaks, scorch on a damaged machine, rust and soot on a wreck
    function mWeather(A, top, state, seed) {
      const sd = (seed % 997) / 97, n = A.p.length / 3;
      for (let i = 0; i < n; i++) {
        const m = A.m[i]; if (m === M.screen || m === M.glass) continue;
        const x = A.p[i * 3], y = A.p[i * 3 + 1], z = A.p[i * 3 + 2], h = Math.max(0, Math.min(1, y / Math.max(10, top * .7)));
        let f = .72 + .28 * Math.pow(h, .6); f *= .9 + .1 * Math.sin(x * .37 + sd) * Math.cos(z * .29 - sd) + .05 * Math.sin(y * 1.7 + x * .2);
        let c = [A.c[i * 3] * f, A.c[i * 3 + 1] * f, A.c[i * 3 + 2] * f];
        if (state === "d" && Math.sin(x * .21 + z * .17 + sd) * Math.cos(y * .23 - x * .05) > .45) c = mix3(c, SOOT, .65);
        if (state === "r") c = mix3(mul(c, .4), mix3(mul(RUST, .85), SOOT, .5 + .45 * Math.sin(x * .21 + z * .17 + y * .3)), .6);
        A.c[i * 3] = c[0]; A.c[i * 3 + 1] = c[1]; A.c[i * 3 + 2] = c[2];
      }
    }
    // draw the machine into its own buffer, weather it, then set it down: upright, or (dead) slumped and tipped
    // k.part(kind, pivot, fn, o): draw a moving part (fn draws it in the machine's own frame). When the Table asks for
    // a rig (GEN.rig) the part is kept apart with its pivot, so table/machines.js can turn and move it; otherwise it is
    // simply part of the model. Legs (wLeg) and fan blades (mFan) drawn straight into the machine become parts by themselves.
    function mSet(ctx, p, draw) {
      const A = newBuf(), k = mKit(ctx, p), rig = ctx.rig && ctx.state !== "r" ? ctx.rig : null;
      k.A = A;
      const open = [];
      k.part = (kind, pivot, fn, o = {}) => {
        const P = newBuf(), kids = []; open.push(kids); fn(P); open.pop();
        if (!rig) { xform(P, A, new THREE.Matrix4()); return -1; }
        const ix = rig.push({ kind, pivot: pivot.slice(), buf: P, o }) - 1;
        kids.forEach((j) => { if (rig[j].o.parentIx == null) rig[j].o = { ...rig[j].o, parentIx: ix }; });
        if (open.length) open[open.length - 1].push(ix);
        return ix;
      };
      draw(A, k); mWeather(A, p.top, ctx.state, p.seed || 0);
      if (rig) { rig.forEach((q) => mWeather(q.buf, p.top, ctx.state, p.seed || 0)); ctx.machBody = A; return; }
      if (!k.dead) { xform(A, ctx.B, new THREE.Matrix4()); return; }
      const L = ctx.lay("wreck"), drop = p.drop || 10;
      xform(A, ctx.B, new THREE.Matrix4().makeTranslation(0, -drop, 0).multiply(rotEuler(L.range(-.25, .25), L.range(-.4, .4), L.range(-.3, .3))));
      for (let i = 0; i < 9; i++) { const a = L.range(0, 6.28), d = L.range(p.W * .25, p.W * .6), sz = Math.max(1, p.W / 120); box(ctx.B, Math.cos(a) * d, .8, Math.sin(a) * d, L.range(3, 8) * sz, L.range(.6, 1.6) * sz, L.range(3, 9) * sz, mix3(RUST, SOOT, L.range(.3, .8)), M.metal, { rot: rotEuler(L.range(-.3, .3), L.range(0, 3), L.range(-.3, .3)) }); }
      ctx.soot.push([0, 0, p.top * .5, p.W * .4]);
    }
    const scheme = (r) => r.pick([0, 0, 0, 1, 1, 2, 3]);
    // a dart: a plated body, a warhead nose, wings, an X tail and a guarded pusher, facing +z, s its scale
    function dartBody(B, x, y, z, s, k) {
      plated(B, x, y, z - 1.5 * s, 4 * s, 3.4 * s, 14 * s, k, { gx: 1, gy: 1, gz: 3, t: .35 * s });
      mTube(B, [x, y, z + 5.5 * s], [x, y, z + 10.5 * s], 1.9 * s, k.acc, M.plain, 10, .5 * s); mTube(B, [x, y, z + 5.3 * s], [x, y, z + 6 * s], 2.05 * s, MC.dark, M.metal, 10);
      lens(B, [x, y - 1.4 * s, z + 5.4 * s], [0, -.4, .9], .45 * s, k);
      for (const sd of [-1, 1]) obox(B, [x + sd * 1.8 * s, y + .9 * s, z + 1 * s], [x + sd * 9 * s, y + 1.2 * s, z - 2.4 * s], 3.4 * s, .4 * s, pcol(k), M.plain);
      for (const a of [.78, 2.36, 3.93, 5.5]) obox(B, [x, y, z - 6.4 * s], [x + Math.cos(a) * 3.8 * s, y + Math.sin(a) * 3.8 * s, z - 8.6 * s], 2.2 * s, .3 * s, pcol(k, 1), M.plain);
      duct(B, [x, y, z - 10 * s], 3 * s, 1.4 * s, pcol(k), "z", 12, .3 * s); blades(B, [x, y, z - 10 * s], 5.4 * s, 2, k, "z", .7 * s, .4);
    }
    function miteBody(B, x, y, z, s, k, ry = 0) {
      const T = newBuf(); plated(T, 0, 2 * s, 0, 8 * s, 3 * s, 10 * s, k, { gx: 2, gy: 1, gz: 2 }); eye(T, [0, 2.2 * s, 5.4 * s], [0, 0, 1], .7 * s, k);
      for (const sx of [-1, 1]) for (const zz of [-3, 3]) obox(T, [sx * 3.8 * s, 2 * s, zz * s], [sx * 7 * s, -.6 * s, zz * 1.4 * s], .7 * s, .7 * s, k.frame, M.metal);
      xform(T, B, new THREE.Matrix4().makeTranslation(x, y, z).multiply(rotEuler(0, ry, 0)));
    }
    const MACH = {
      tick: {
        name: "Mite (crawler)", sub: "a four-legged crawler that climbs walls and ceilings, then cuts through or blows what it reaches", structure: true, machine: true,
        plan(r) { return { W: 26, D: 28, T: 1, storeys: [{ base: 0, H: 8 }], top: 14, noRoof: true, drop: 3, pod: r.pick(["charge", "cutter", "charge"]), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 5.4;
            plated(B, 0, y, -.6, 9, 3.8, 11, k, { gx: 2, gy: 1, gz: 2, t: .45 });
            plated(B, 0, y + .2, 5.6, 6.4, 3.2, 3, k, { gx: 1, gy: 1, gz: 1, t: .4 }); eyes(B, [0, y + .6, 7.4], [0, 0, 1], .85, k, 2);
            greeble(B, 0, y + 1.9, -3.2, 7, 3.4, 3, k);
            if (p.pod === "charge") { mTube(B, [-3.2, y + 3.8, -.4], [3.2, y + 3.8, -.4], 1.9, k.acc, M.plain, 10); for (const x of [-2, 2]) mTube(B, [x - .3, y + 3.8, -.4], [x + .3, y + 3.8, -.4], 2.02, MC.dark, M.metal, 10); lens(B, [0, y + 5.8, -.4], [0, 1, 0], .45, k); }
            else { obox(B, [0, y + 2, 3.4], [0, y + 4.4, 6.6], 1.1, 1.1, k.frame, M.metal); ram(B, [0, y + 2.4, .6], [0, y + 4.2, 5.6], .32, k); obox(B, [0, y + 4.4, 6.6], [0, y + 1.8, 10.4], .8, .8, k.steel, M.metal); lens(B, [0, y + 1.6, 10.5], [0, -.6, .8], .35, k, MC.lamp); for (const x of [-1.5, 1.5]) cyl(B, x, y + 1.9, -2.6, 1, .9, 3.6, 8, x < 0 ? C("#3e4a3a") : C("#6a2a22"), M.metal); }
            uplink(B, 2.6, y + 1.9, -4.4, .7, k);
            for (const s of [-1, 1]) for (const zs of [-1, 1]) wLeg(B, [s * 4.6, y - .6, zs * 3.8], [s * 10.6, 0, zs * 8.6], .62, k, [s, zs * .35], .13, 3, 2);
          });
        },
      },
      hound: {
        name: "Hound (ground drone)", sub: "a tracked ground drone with a remote weapon station: a gun or a rocket box; built by the thousand", structure: true, machine: true,
        plan(r) { return { W: 40, D: 48, T: 1, storeys: [{ base: 0, H: 16 }], top: 32, noRoof: true, drop: 2, arm: r.pick(["gun", "rockets", "gun"]), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            // tracks: links round road wheels, a drive sprocket and an idler, skirts over the top run
            for (const s of [-1, 1]) {
              box(B, s * 13, 5, 0, 6.4, 8, 40, MC.rubber, M.plain, { edge: false });
              for (let i = 0; i < 20; i++) { const z = -19 + i * 2; box(B, s * 13, 9.15, z, 6.8, .5, 1.1, MC.dark, M.metal, { edge: false }); box(B, s * 13, .25, z, 6.8, .5, 1.1, MC.dark, M.metal, { edge: false }); }
              for (let i = 0; i < 5; i++) { mTube(B, [s * 16.2, 3.6, -14 + i * 7], [s * 16.5, 3.6, -14 + i * 7], 3, k.frame, M.metal, 10); mTube(B, [s * 16.5, 3.6, -14 + i * 7], [s * 16.8, 3.6, -14 + i * 7], 1.2, k.steel, M.metal, 8); }
              mTube(B, [s * 16.2, 6, 19.5], [s * 16.6, 6, 19.5], 3.6, k.frame, M.metal, 12); mTube(B, [s * 16.2, 6, -19.5], [s * 16.6, 6, -19.5], 3.2, k.frame, M.metal, 12);
              if (!k.lose(.25)) { plated(B, s * 17.4, 8.4, 0, 1.2, 4.4, 34, k, { gx: 1, gy: 1, gz: 4, noTop: false, t: .5 }); mark(B, s * 18.1, 8.6, 8, 2.8, k, "chev", s * PI2); }
            }
            // the hull: plated, a sloped glacis with the sensor cluster, a battery bay behind, the engine deck
            plated(B, 0, 10.5, -2, 21, 8, 36, k, { gx: 2, gy: 1, gz: 3 });
            plated(B, 0, 9.4, 18.4, 19, 6, 6, k, { gx: 2, gy: 1, gz: 1, rot: rotEuler(-.35, 0, 0) });
            eyes(B, [0, 9.6, 21.6], [0, 0, 1], 1.4, k, 2); mark(B, 6, 7.2, 21.3, 2.4, k, "haz");
            plated(B, 0, 15.6, -13, 15, 3, 11, k, { gx: 1, gy: 1, gz: 1, col: k.acc }); fins(B, 0, 17.2, -13, 12, 9, 8, k);
            greeble(B, -6, 14.6, 4, 7, 10, 4, k);
            k.part("turret", [3, 14.5, 4], (B) => {
            // the weapon station on a mast: a sensor head with its own eye, the gun or the rocket box beside it, a feed
            cyl(B, 3, 14.5, 4, 4.4, 4, 2, 12, k.frame, M.metal); obox(B, [3, 16, 4], [3, 21, 4], 2.4, 2.4, k.frame, M.metal);
            k.part("gun", [3, 22, 4], (B) => {
            plated(B, 3, 23, 4.4, 6.4, 4.2, 8, k, { gx: 1, gy: 1, gz: 2, t: .4 }); eye(B, [3, 23.2, 8.6], [0, 0, 1], 1, k);
            if (p.arm === "gun") { plated(B, 8, 22.4, 5, 3, 3.6, 10, k, { col: k.frame, gx: 1, gy: 1, gz: 2, t: .3 }); mTube(B, [8, 22.6, 10], [8, 22.6, 23], .6, MC.dark); mTube(B, [8, 22.6, 11], [8, 22.6, 17], 1.05, k.frame, M.metal, 10); mTube(B, [8, 22.6, 21], [8, 22.6, 23.6], .95, k.joint, M.metal, 8); box(B, 8, 19.6, 2.4, 2.6, 2.4, 4, k.acc, M.plain); hose(B, [8, 19.6, 0], [3, 18, 2], .3, k); }
            else { plated(B, 9.4, 23, 3.4, 6, 6, 9, k, { gx: 1, gy: 1, gz: 2 }); for (let i = 0; i < 4; i++) cyl(B, 9.4 + (i % 2 ? 1.4 : -1.4), 23 + (i < 2 ? 1.4 : -1.4), 7.9, .85, .85, .12, 8, MC.dark, M.metal); }
            }, { pitch: 1 });
            }, { muzzle: p.arm === "gun" ? [8, 22.6, 23.6] : [9.4, 23, 8], shot: p.arm === "gun" ? "gun" : "rocket" });
            uplink(B, -7, 14.6, -5, 1.1, k);
          });
        },
      },
      mantis: {
        name: "Mantis (assault walker)", sub: "a four-legged assault walker: a heavy plated body, a sensor head on a neck, an autocannon with its ammo drum, a rocket box on its back", structure: true, machine: true,
        plan(r) { return { W: 84, D: 92, T: 2, storeys: [{ base: 0, H: 30 }], top: 62, noRoof: true, drop: 24, gun: r.pick(["auto", "auto", "flame"]), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 34;
            // the body: a heavy plated hull on a dark spine, hip housings at its corners, a battery and heat-sink pack behind
            obox(B, [0, y - 4, -20], [0, y - 4, 20], 8, 6, k.frame, M.metal);
            plated(B, 0, y, -1, 24, 13, 32, k, { gx: 2, gy: 2, gz: 3 });
            plated(B, 0, y + 7.6, 2, 18, 3, 20, k, { gx: 2, gy: 1, gz: 2, acc: .25 });
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) plated(B, sd * 12.4, y - 2, zs * 12, 7, 9, 9, k, { gx: 1, gy: 1, gz: 1 });
            for (const sd of [-1, 1]) { mark(B, sd * 12.1, y + 2, 0, 3.4, k, "chev", sd * PI2); if (!k.dead) hose(B, [sd * 11, y + 5, -10], [sd * 11, y + 4, 10], .4, k); }
            plated(B, 0, y + 1, -20, 18, 10, 8, k, { gx: 2, gy: 1, gz: 1 }); fins(B, 0, y + 6.4, -20, 15, 7, 10, k);
            greeble(B, -5, y + 9.2, 8, 8, 8, 4, k);
            k.part("head", [0, y + 2, 14], (B) => {
            // the neck and the head: a plated sensor head with its cluster, a hood, lamps
            obox(B, [0, y + 2, 14], [0, y + 4, 21], 4, 4, k.frame, M.metal); ram(B, [0, y - 3, 11], [0, y + .4, 20], .8, k); hose(B, [-2, y + 5, 12], [-2, y + 5, 20], .3, k);
            plated(B, 0, y + 4.6, 24.4, 13, 9, 10, k, { gx: 2, gy: 1, gz: 2 });
            plated(B, 0, y + 9.6, 23.4, 14, 1.6, 11, k, { gx: 1, gy: 1, gz: 1, col: k.acc });
            eyes(B, [0, y + 4.8, 29.6], [0, 0, 1], 2.3, k, 3);
            lens(B, [-5.4, y + 7.6, 29], [0, 0, 1], .55, k, MC.lamp); lens(B, [5.4, y + 7.6, 29], [0, 0, 1], .55, k, MC.lamp);
            }, { yaw: .5 });
            k.part("turret", [0, y - 8.2, 12], (B) => {
            // the gun under the body, its drum and feed; or a flamer with its tanks
            cyl(B, 0, y - 8.2, 12, 3.2, 3, 2, 10, k.frame, M.metal); k.part("gun", [0, y - 10, 12], (B) => { plated(B, 0, y - 10, 15, 6, 4.6, 10, k, { col: k.frame, gx: 1, gy: 1, gz: 2, t: .4 });
            if (p.gun === "auto") { mTube(B, [0, y - 10, 20], [0, y - 10, 36], .95, MC.dark); mTube(B, [0, y - 10, 20], [0, y - 10, 27], 1.6, k.frame, M.metal, 10); mTube(B, [0, y - 10, 33], [0, y - 10, 37], 1.45, k.joint, M.metal, 8); mTube(B, [-6.6, y - 10, 13], [-3.4, y - 10, 13], 3.2, pcol(k, 1), M.plain, 12); hose(B, [-5, y - 8, 15], [-1, y - 8, 15], .5, k); }
            else { mTube(B, [0, y - 10, 20], [0, y - 10, 30], 1.4, k.steel, M.metal, 10, 1); for (const sd of [-1, 1]) mTube(B, [sd * 4.6, y - 9, 6], [sd * 4.6, y - 9, 16], 1.7, k.acc, M.plain, 10); }
            }, { pitch: 1 });
            }, { muzzle: p.gun === "auto" ? [0, y - 10, 38] : [0, y - 10, 31], shot: p.gun === "auto" ? "gun" : "flame", yaw: 1 });
            k.part("launcher", [0, y + 9.2, -8], (B) => {
            // the rocket box on a turntable on its back
            cyl(B, 0, y + 9.2, -8, 4.4, 4.4, 1.4, 12, k.frame, M.metal); k.part("gun", [0, y + 11, -8], (B) => { plated(B, 0, y + 14, -7, 12, 7.4, 11, k, { gx: 2, gy: 1, gz: 2 });
            for (let i = 0; i < 6; i++) cyl(B, -3 + (i % 3) * 3, y + 12.4 + (i < 3 ? 3 : 0), -1.4, 1, 1, .1, 8, MC.dark, M.metal);
            }, { pitch: 1 });
            }, { muzzle: [0, y + 14, -1], shot: "rocket" });
            uplink(B, -6, y + 9, -14, 1.2, k);
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) wLeg(B, [sd * 15, y - 2, zs * 12], [sd * 27, 0, zs * 26], 3.3, k, [sd * .4, zs], .14, 3, 3);
          });
        },
      },
      lattice: {
        name: "Lattice (relay node)", sub: "a three-legged walker that plants itself and raises a telescoping mast; it holds the network over an area, and the machines near it lose their link when it falls", structure: true, machine: true,
        plan(r) { return { W: 86, D: 86, T: 1, storeys: [{ base: 0, H: 30 }], top: 140, noRoof: true, drop: 34, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 38;
            // the body: a plated generator block, its sensor cluster, fins, a fuel cell either side
            plated(B, 0, y, 0, 22, 14, 22, k, { gx: 2, gy: 1, gz: 2 });
            plated(B, 0, y + 8.6, 0, 16, 3, 16, k, { gx: 1, gy: 1, gz: 1, col: k.acc });
            eyes(B, [0, y + 1, 11.6], [0, 0, 1], 2, k, 2); fins(B, -4, y + 10.2, -3, 7, 8, 7, k); greeble(B, 5, y + 10.2, 2, 5, 8, 3, k);
            for (const sd of [-1, 1]) { mTube(B, [sd * 12.5, y - 3, -6], [sd * 12.5, y - 3, 6], 2.6, pcol(k, 1), M.plain, 10); mark(B, sd * 11.2, y + 3, 0, 3.4, k, sd > 0 ? "box" : "bars", sd * PI2); }
            for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + .5, c = Math.cos(a), s = Math.sin(a); wLeg(B, [c * 9, y - 4, s * 9], [c * 32, 0, s * 32], 2.6, k, [c, s], .1, 10, 3); }
            // the mast: telescoping sections with collars, a cable run, a panel array, a dish, the uplink, a beacon
            let h = y + 10, r0 = 4.2; const secs = [28, 24, 20, 16], drops = [0]; for (let i = 1; i < 4; i++) drops.push(drops[i - 1] + secs[i - 1] - 3);
            secs.forEach((L, i) => { const hb = h, rr = r0; k.part("mast", [0, hb, 0], (B) => { obox(B, [0, hb, 0], [0, hb + L, 0], rr * 2, rr * 2, pcol(k, 1), M.plain); mTube(B, [0, hb + L - 1.2, 0], [0, hb + L + .5, 0], rr * 1.2, k.frame, M.metal, 10);
              if (i === 1) for (const a of [.3, 2.4, 4.5]) { if (k.lose(.3)) continue; const T = newBuf(); plated(T, 0, 0, 0, 7, 15, 1.4, k, { gx: 1, gy: 2, gz: 1, t: .3 }); strip(T, 0, 6.6, .8, 5, .4, .2, k, MC.net); xform(T, B, new THREE.Matrix4().makeTranslation(Math.cos(a) * 6.4, y + 52, Math.sin(a) * 6.4).multiply(rotEuler(0, -a + PI2, 0))); }
              if (i === 2 && !k.lose(.3)) { const T = newBuf(); cyl(T, 0, -1, 0, 7, 9, 2, 16, pcol(k), M.plain); cyl(T, 0, 1, 0, .8, .8, 4, 6, k.frame, M.metal); xform(T, B, new THREE.Matrix4().makeTranslation(5, y + 72, 2).multiply(rotEuler(0, -.6, 0)).multiply(rotEuler(0, 0, -1.2))); }
              if (i === 3) { uplink(B, 0, hb + L + .4, 0, 2.4, k); lens(B, [0, hb + L + 9, -.6], [0, 1, 0], .7, k); }
            }, { seg: i, drop: drops[i] }); h += L; r0 *= .78; });
            if (!k.dead) mTube(B, [5, y + 10, 1], [2, y + 38, .6], .4, MC.rubber, M.plain, 5);
          });
        },
      },
      serpent: {
        name: "Serpent (tunneller)", sub: "a segmented boring machine on tracks that drills through rubble and comes up under you", structure: true, machine: true,
        plan(r) { return { W: 84, D: 186, T: 1, storeys: [{ base: 0, H: 20 }], top: 46, noRoof: true, drop: 4, phase: r.range(0, 6.28), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const n = 8, pts = [];
            for (let i = 0; i < n; i++) { const t = i / (n - 1); pts.push([Math.sin(t * 4.2 + p.phase) * 20 * (1 - t * .3), 10 + (i >= n - 2 ? (i - (n - 3)) * 8 : 0) * (k.dead ? 0 : 1), -82 + t * 150]); }
            for (let i = 0; i < n; i++) {
              const [x, y, z] = pts[i], nx = pts[Math.min(n - 1, i + 1)], pv = pts[Math.max(0, i - 1)], ang = Math.atan2(nx[0] - pv[0], nx[2] - pv[2]), pitch = -Math.atan2(nx[1] - pv[1], Math.hypot(nx[0] - pv[0], nx[2] - pv[2]));
              const s = 1 - i / n * .15, T = newBuf();
              plated(T, 0, 1, 0, 16 * s, 13 * s, 14, k, { gx: 2, gy: 2, gz: 2, acc: .12 });
              if (i < n - 1) { mTube(T, [0, 1, 7], [0, 1, 10.5], 5.6 * s, MC.rubber, M.plain, 10); for (const sd of [-1, 1]) ram(T, [sd * 6 * s, 1, 5], [sd * 6 * s, 1, 12], .6, k); }
              for (const sx of [-1, 1]) { box(T, sx * 6 * s, -7.6 * s, 0, 4, 3.4, 13, MC.rubber, M.plain, { edge: false }); for (let j = 0; j < 6; j++) box(T, sx * 6 * s, -9.3 * s, -5.4 + j * 2.2, 4.4, .5, .9, MC.dark, M.metal, { edge: false }); }
              if (i % 2) strip(T, 8.3 * s, 3, 4, .2, .5, 3, k);
              if (i % 3 === 1) mark(T, 8.4 * s, -1, -3, 3.4, k, "bars", PI2);
              if (i === 0) fins(T, 0, 7.6 * s + 1, -2, 10, 9, 8, k); else greeble(T, 0, 7.6 * s + 1, 0, 10, 10, 2, k);
              if (i === 2) uplink(T, 3, 7.6 * s + 1, -3, 1.3, k);
              xform(T, B, new THREE.Matrix4().makeTranslation(x, y, z).multiply(rotEuler(0, ang, 0)).multiply(rotEuler(pitch, 0, 0)));
            }
            const [hx, hy, hz] = pts[n - 1], H = newBuf();
            cyl(H, 0, -2, 0, 9.6, 9.4, 6, 12, pcol(k), M.plain); cyl(H, 0, 4, 0, 9.4, 8, 2, 12, k.frame, M.metal);
            for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .78; eye(H, [Math.cos(a) * 7.4, 5.2, Math.sin(a) * 7.4], [0, 1, 0], .9, k); }
            for (let j = 0; j < 4; j++) { cyl(H, 0, 6 + j * 4.2, 0, 7.4 - j * 1.7, 6.4 - j * 1.7, 4.2, 12, mul(k.steel, .9 - j * .08), M.metal); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + j * .4, rr = 7.2 - j * 1.7; box(H, Math.cos(a) * rr, 7.4 + j * 4.2, Math.sin(a) * rr, 1.1, 1.4, 1.1, MC.dark, M.metal, { rot: rotEuler(0, -a, 0) }); } }
            cyl(H, 0, 22.8, 0, 1.6, .3, 3, 8, k.steel, M.metal);
            { const HM = new THREE.Matrix4().makeTranslation(hx, hy, hz + 7).multiply(rotEuler(PI2 - (k.dead ? 0 : .45), 0, 0)), ax = new THREE.Vector3(0, 1, 0).transformDirection(HM); k.part("drill", [hx, hy, hz + 7], (B) => xform(H, B, HM), { axis: [ax.x, ax.y, ax.z], spin: 6 }); }
          });
        },
      },
      arachnid: {
        name: "Arachnid (siege walker)", sub: "a six-legged siege walker: a wide plated carapace, a rail cannon on a turret, missile boxes and a tail of power cells; it steps over cars", structure: true, machine: true,
        plan(r) { return { W: 200, D: 210, T: 3, storeys: [{ base: 0, H: 60 }], top: 118, noRoof: true, drop: 56, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 72;
            // the body: a dark spine and belly, a wide plated carapace in layers, hip housings, cable runs
            obox(B, [0, y - 8, -30], [0, y - 8, 36], 26, 10, k.frame, M.metal);
            plated(B, 0, y, 4, 58, 16, 64, k, { gx: 4, gy: 1, gz: 4 });
            plated(B, 0, y + 10, 2, 44, 4, 50, k, { gx: 3, gy: 1, gz: 3, acc: .2 });
            for (const sd of [-1, 1]) for (const hz of [30, 6, -20]) plated(B, sd * 31, y - 3, hz, 9, 12, 12, k, { gx: 1, gy: 1, gz: 1 });
            for (const sd of [-1, 1]) { mark(B, sd * 29.1, y + 2, 20, 7, k, "bars", sd * PI2); mark(B, sd * 29.1, y + 2, -10, 6, k, "chev", sd * PI2); if (!k.dead) { hose(B, [sd * 27, y + 9, -24], [sd * 27, y + 9, 30], .7, k); hose(B, [sd * 24, y + 9, -24], [sd * 24, y + 9, 30], .5, k); } }
            greeble(B, -14, y + 12.2, -14, 12, 14, 6, k); greeble(B, 14, y + 12.2, -14, 12, 14, 6, k);
            // the head: a plated sensor block forward and low, a big cluster, lamps, a hood
            plated(B, 0, y - 1, 40, 30, 13, 12, k, { gx: 2, gy: 1, gz: 1 }); plated(B, 0, y + 6.4, 39, 32, 2, 13, k, { gx: 2, gy: 1, gz: 1, col: k.acc });
            eyes(B, [0, y - 1, 46.4], [0, 0, 1], 3.6, k, 4); for (const sd of [-1, 1]) { eye(B, [sd * 10, y - 2, 46.2], [0, 0, 1], 1.4, k); lens(B, [sd * 13, y + 3, 46.2], [0, 0, 1], .9, k, MC.lamp); }
            k.part("turret", [0, y + 12, 4], (B) => {
            // the rail cannon on a turret: a plated breech, twin rails with coil collars, capacitor boxes, cables
            cyl(B, 0, y + 12, 4, 13, 13, 3, 16, k.frame, M.metal);
            k.part("gun", [0, y + 18, 4], (B) => {
            plated(B, 0, y + 20, 2, 22, 11, 26, k, { gx: 2, gy: 1, gz: 2 });
            for (const sd of [-1, 1]) { obox(B, [sd * 2.6, y + 20, 14], [sd * 2.6, y + 20, 92], 2, 4.6, k.frame, M.metal); plated(B, sd * 13.6, y + 19, -4, 5, 8, 14, k, { gx: 1, gy: 1, gz: 2, col: k.c2 }); hose(B, [sd * 13, y + 23, 2], [sd * 3, y + 23, 18], .6, k); }
            for (let i = 0; i < 6; i++) { const z = 22 + i * 11.5; plated(B, 0, y + 20, z, 10, 8, 2.6, k, { gx: 1, gy: 1, gz: 1, col: i === 5 ? k.acc : k.c1, t: .5 }); }
            strip(B, 0, y + 20, 54, .5, 1.4, 74, k, MC.net);
            }, { pitch: 1 });
            }, { muzzle: [0, y + 20, 92], shot: "rail" });
            // missile boxes on the shoulders
            for (const sd of [-1, 1]) { if (k.lose(.25)) continue; plated(B, sd * 21, y + 16, -16, 10, 9, 14, k, { gx: 1, gy: 1, gz: 2 }); for (let i = 0; i < 6; i++) cyl(B, sd * 21 + (i % 3 - 1) * 2.8, y + 14.4 + (i < 3 ? 3.2 : 0), -8.8, 1, 1, .12, 8, MC.dark, M.metal); }
            // the tail: power cells in plated cases, fins, lit seams
            let tz = -30; for (let i = 0; i < 4; i++) { const s = 1 - i * .14, ty = y + 2 + i * 2.6; plated(B, 0, ty, tz - 6 * s, 28 * s, 12 * s, 11 * s, k, { gx: 2, gy: 1, gz: 1 }); fins(B, 0, ty + 6.2 * s, tz - 6 * s, 18 * s, 7 * s, 7, k); strip(B, 0, ty, tz - 11.8 * s, 22 * s, .5, .4, k, MC.net); tz -= 12.4 * s; }
            uplink(B, -12, y + 12.2, -22, 1.8, k); uplink(B, 12, y + 12.2, -22, 1.8, k);
            for (const sd of [-1, 1]) for (const hz of [30, 6, -20]) { if (k.dead && k.r.chance(.2)) continue; wLeg(B, [sd * 34, y - 3, hz], [sd * 78, 0, hz * 1.7], 5.6, k, [sd, hz * .006], .1, 16, 3); }
          });
        },
      },
      hive: {
        name: "Hive (fabricator)", sub: "a walking factory in three jointed hulls: it builds Mites and Hounds in its lit bays as it goes and sends them down its ramp", structure: true, machine: true,
        plan(r) { return { W: 260, D: 290, T: 3, storeys: [{ base: 0, H: 80 }], top: 210, noRoof: true, drop: 80, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 98;
            // a hull segment: plated over the works, bays cut into its sides, a catwalk along the top
            const hull = (z0, z1, top) => {
              const zc = (z0 + z1) / 2, L = z1 - z0;
              box(B, 0, y, zc, 88, 40, L, k.core, M.metal, { edge: false });
              plated(B, 0, y + 22, zc, 96, 5, L + 2, k, { gx: 6, gy: 1, gz: Math.round(L / 14), acc: top ? .3 : .06 });
              for (const sd of [-1, 1]) { plated(B, sd * 46.5, y + 13, zc, 4, 12, L - 4, k, { gx: 1, gy: 1, gz: Math.round(L / 12) }); plated(B, sd * 46.5, y - 16, zc, 4, 10, L - 4, k, { gx: 1, gy: 1, gz: Math.round(L / 12) }); strip(B, sd * 48.6, y + 6.4, zc, .25, .5, L - 8, k); }
              plated(B, 0, y - 24, zc, 66, 6, L - 6, k, { col: k.c2, gx: 4, gy: 1, gz: 3 });
              for (const sd of [-1, 1]) { for (let z = z0 + 3; z <= z1 - 3; z += 10) rod(B, [sd * 47, y + 24.6, z], [sd * 47, y + 30, z], .3, k.acc, M.plain); rod(B, [sd * 47, y + 30, z0 + 3], [sd * 47, y + 30, z1 - 3], .3, k.acc, M.plain); }
              greeble(B, -20, y + 24.7, zc, 30, L * .6, Math.round(L / 6), k);
            };
            const bay = (sd, z) => {
              const [gc, gm] = lit(k, C("#ffb070")); box(B, sd * 43, y - 3, z, .6, 14, 20, gc, gm, { edge: false });
              box(B, sd * 46, y - 10.6, z, 6, 1.2, 24, MC.dark, M.metal); for (let j = 0; j < 6; j++) mTube(B, [sd * 43, y - 10, z - 10 + j * 4], [sd * 49, y - 10, z - 10 + j * 4], .55, k.steel, M.metal, 6);
              obox(B, [sd * 47, y + 4, z - 12], [sd * 47, y + 4, z + 12], 3, 3, k.frame, M.metal);
              if (!k.dead) miteBody(B, sd * 46, y - 10, z + 3, 1, k, sd * PI2);
            };
            const joint = (z) => { mTube(B, [0, y, z - 4], [0, y, z + 4], 24, MC.rubber, M.plain, 14); for (const zz of [z - 4.5, z + 3]) mTube(B, [0, y, zz], [0, y, zz + 1.5], 27, k.frame, M.metal, 14); for (const sd of [-1, 1]) ram(B, [sd * 30, y + 8, z - 10], [sd * 30, y + 8, z + 10], 1.6, k); };
            hull(44, 84, false); hull(-22, 38, true); hull(-84, -28, false); joint(41); joint(-25);
            for (const sd of [-1, 1]) { for (const z of [-8, 22, -70, -42]) bay(sd, z); mark(B, sd * 48.6, y - 16, 64, 7, k, "chev", sd * PI2); mark(B, sd * 48.6, y - 16, -56, 7, k, "bars", sd * PI2); }
            // the bow: a plated face, one great eye in a cluster, a light bar, warning bands
            plated(B, 0, y + 1, 87, 80, 36, 7, k, { gx: 4, gy: 3, gz: 1 });
            eyes(B, [0, y + 4, 91], [0, 0, 1], 5.4, k, 5); for (const x of [-28, 28]) eye(B, [x, y + 4, 91], [0, 0, 1], 2, k);
            strip(B, 0, y + 15, 90.8, 54, .7, .6, k); mark(B, -24, y - 11, 90.8, 6, k, "haz"); mark(B, 24, y - 11, 90.8, 6, k, "haz");
            // the stern ramp
            const RA = newBuf(); plated(RA, 0, 0, 0, 40, 2.4, 64, k, { gx: 2, gy: 1, gz: 4, t: .6 }); for (let i = 0; i < 10; i++) box(RA, 0, 1.4, -28 + i * 6.2, 34, .8, 1, k.frame, M.metal, { edge: false }); strip(RA, -19, 1.4, 0, .5, .4, 60, k); strip(RA, 19, 1.4, 0, .5, .4, 60, k);
            xform(RA, B, new THREE.Matrix4().makeTranslation(0, y / 2 - 6, -108).multiply(rotEuler(k.dead ? -.2 : -1.0, 0, 0)));
            // heat exchangers on the stern hull
            for (const [x, z] of [[-24, -44], [-24, -68], [24, -44], [24, -68]]) { plated(B, x, y + 30, z, 18, 10, 16, k, { gx: 2, gy: 1, gz: 2 }); fins(B, x, y + 35.4, z, 14, 12, 8, k); }
            // a gantry over the middle hull, a part on its hook
            for (const sd of [-1, 1]) for (const dz of [-4, 4]) obox(B, [sd * 38, y + 25, 8 + dz], [sd * 32, y + 62, 8], 2.4, 2.4, k.acc, M.plain);
            obox(B, [-36, y + 63, 8], [36, y + 63, 8], 4, 5, k.acc, M.plain); plated(B, 6, y + 59.4, 8, 8, 3.4, 7, k, { col: k.frame, gx: 1, gy: 1, gz: 1 });
            if (!k.dead) { mTube(B, [6, y + 40, 8], [6, y + 57.6, 8], .25, k.steel, M.metal, 4); plated(B, 6, y + 34, 8, 14, 10, 12, k, { gx: 1, gy: 1, gz: 1 }); }
            // the relay mast on the bow hull
            let h = y + 25, r0 = 5; for (const L of [26, 22, 18]) { obox(B, [0, h, 62], [0, h + L, 62], r0 * 2, r0 * 2, pcol(k, 1), M.plain); mTube(B, [0, h + L - 1.2, 62], [0, h + L + .5, 62], r0 * 1.2, k.frame, M.metal, 10); h += L; r0 *= .78; }
            uplink(B, 0, h + .4, 62, 3.2, k); lens(B, [0, h + 11, 61.4], [0, 1, 0], .9, k);
            for (const sd of [-1, 1]) for (const hz of [64, 8, -56]) wLeg(B, [sd * 46, y - 18, hz], [sd * 108, 0, hz * 1.45], 8.4, k, [sd, hz * .004], .1, 20, 3);
          });
        },
      },
      overseer: {
        name: "Overseer (drone)", sub: "a guarded quadcopter with a big gimballed sensor cluster that spots for everything else; shown on a flight stand", structure: true, machine: true,
        plan(r) { return { W: 40, D: 40, T: 1, storeys: [{ base: 0, H: 6 }], top: 58, noRoof: true, drop: 40, hover: r.range(42, 52), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          const y = p.hover; flightStand(ctx, y - 4, 9);
          mSet(ctx, p, (B, k) => {
            plated(B, 0, y, 0, 10, 5.4, 14, k, { gx: 2, gy: 1, gz: 2, t: .45 }); plated(B, 0, y + 3, -1.5, 7, 1.2, 9, k, { col: k.acc, gx: 1, gy: 1, gz: 1, t: .3 });
            greeble(B, 0, y + 2.7, 3.6, 6, 4, 2, k);
            cyl(B, 0, y - 3.4, 3.4, 2, 2, 1, 10, k.frame, M.metal); mTube(B, [-2.6, y - 5.6, 4], [2.6, y - 5.6, 4], 2.4, k.frame, M.metal, 12); eyes(B, [0, y - 5.6, 6.2], [0, -.15, .99], 1.5, k, 2);
            uplink(B, 0, y + 3.6, -5, .8, k);
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              const ax = sx * 13.5, az = sz * 13.5; obox(B, [sx * 4, y + .6, sz * 5], [ax, y + 1.4, az], 2, 1.6, pcol(k, 1), M.plain); hose(B, [sx * 4, y - 1, sz * 5], [ax, y - .4, az], .2, k);
              if (k.lose(.15)) continue; mFan(B, [ax, y + 2.4, az], 7.2, k, "y", sx * sz * .5);
              lens(B, [ax + sx * 5, y + 1.6, az + sz * 5], [0, -1, 0], .4, k, sx * sz > 0 ? MC.eye : MC.net);
            }
          });
        },
      },
      wasp: {
        name: "Dart (loitering munition)", sub: "a small one-way attack drone: it circles until it finds a target, then dives; shown on a flight stand", structure: true, machine: true,
        plan(r) { return { W: 22, D: 26, T: 1, storeys: [{ base: 0, H: 4 }], top: 42, noRoof: true, drop: 30, hover: r.range(30, 38), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) { const y = p.hover; flightStand(ctx, y - 2, 6); mSet(ctx, p, (B, k) => { dartBody(B, 0, y, 0, 1, k); strip(B, 0, y + 1.75, -2, .35, .1, 6, k, MC.net); }); },
      },
      gyre: {
        name: "Gyre (gunship)", sub: "a twin-fan tilt gunship: plated body, a chin gun, rocket pods; it hunts in pairs over the rooftops; shown on a flight stand", structure: true, machine: true,
        plan(r) { return { W: 70, D: 66, T: 1, storeys: [{ base: 0, H: 6 }], top: 70, noRoof: true, drop: 44, hover: r.range(50, 58), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          const y = p.hover; flightStand(ctx, y - 5, 10);
          mSet(ctx, p, (B, k) => {
            plated(B, 0, y, 0, 11, 9, 26, k, { gx: 2, gy: 1, gz: 3 });
            plated(B, 0, y - .4, 15.4, 9, 7, 6, k, { gx: 1, gy: 1, gz: 1, rot: rotEuler(.25, 0, 0) });
            plated(B, 0, y + 5.4, -2, 8, 2, 16, k, { col: k.acc, gx: 1, gy: 1, gz: 2, t: .4 }); greeble(B, 0, y + 6.4, -4, 6, 10, 3, k);
            eyes(B, [0, y, 18.8], [0, -.1, .99], 1.3, k, 3);
            cyl(B, 0, y - 6, 10, 2.6, 2.2, 1.6, 10, k.frame, M.metal); plated(B, 0, y - 6.8, 12.4, 3, 2.6, 5, k, { col: k.frame, gx: 1, gy: 1, gz: 1, t: .3 }); mTube(B, [0, y - 6.8, 14.8], [0, y - 6.8, 25], .55, MC.dark); mTube(B, [0, y - 6.8, 15], [0, y - 6.8, 19], .9, k.frame, M.metal, 8);
            plated(B, 0, y + 1.6, -2, 38, 1.8, 8, k, { gx: 4, gy: 1, gz: 1, t: .35 });
            for (const sd of [-1, 1]) {
              const FM = new THREE.Matrix4().makeTranslation(sd * 24, y + 2, -2).multiply(rotEuler(.35, 0, 0)), fa = new THREE.Vector3(0, 1, 0).transformDirection(FM);
              const T = newBuf(); duct(T, [0, 0, 0], 8.4, 8.4 * .32, pcol(k), "y", 13, .84); for (let j = 0; j < 3; j++) { const b = j / 3 * Math.PI * 2 + sd * .3; rod(T, [0, 0, 0], [Math.cos(b) * 8.4, 0, Math.sin(b) * 8.4], 8.4 * .035, k.frame); } cyl(T, 0, -3.8, 0, 1.5, 1.2, 4.2, 10, k.frame, M.metal); lens(T, [sd * 9, -.4, 0], [sd, 0, 0], .5, k, sd > 0 ? MC.net : MC.eye);
              xform(T, B, FM);
              k.part("rotor", [sd * 24, y + 2, -2], (B) => { const Q = newBuf(); blades(Q, [0, .4, 0], 15, 3, k, "y", 1.3, sd * .3); xform(Q, B, FM); }, { axis: [fa.x, fa.y, fa.z], spin: 16 });
              if (!k.lose(.25)) { plated(B, sd * 12, y - 1.8, 0, 3.6, 3.6, 10, k, { gx: 1, gy: 1, gz: 2, t: .3 }); for (let i = 0; i < 4; i++) cyl(B, sd * 12 + (i % 2 ? .9 : -.9), y - 1.8 + (i < 2 ? .9 : -.9), 4.96, .55, .55, .12, 6, MC.dark, M.metal); }
            }
            obox(B, [0, y + 1, -13], [0, y + 2.6, -30], 3.4, 3, pcol(k, 1), M.plain);
            for (const sd of [-1, 1]) obox(B, [0, y + 2.6, -28], [sd * 6, y + 8, -31], 3.4, .5, pcol(k), M.plain);
            mark(B, 5.8, y, -4, 2.8, k, "chev", PI2); mark(B, -5.8, y, -4, 2.8, k, "chev", -PI2);
            uplink(B, 3, y + 6.4, -10, .9, k);
          });
        },
      },
      carrier: {
        name: "Brood (drone carrier)", sub: "a heavy four-fan lifter that carries a rack of Darts under its belly and drops them over a fight; shown on a flight stand", structure: true, machine: true,
        plan(r) { return { W: 100, D: 100, T: 2, storeys: [{ base: 0, H: 6 }], top: 92, noRoof: true, drop: 56, hover: r.range(64, 72), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          const y = p.hover; flightStand(ctx, y - 12, 14);
          mSet(ctx, p, (B, k) => {
            plated(B, 0, y, 0, 24, 11, 34, k, { gx: 2, gy: 1, gz: 3 });
            plated(B, 0, y + 6.6, -3, 16, 2, 22, k, { col: k.acc, gx: 1, gy: 1, gz: 2 }); fins(B, 0, y + 7.8, -6, 11, 10, 8, k); greeble(B, 0, y + 6, 11, 18, 8, 4, k);
            eyes(B, [0, y + .4, 17.6], [0, -.1, .99], 2, k, 3);
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              const fx = sx * 33, fz = sz * 33; obox(B, [sx * 10, y + 1, sz * 13], [fx, y + 2, fz], 4.4, 3, pcol(k, 1), M.plain); ram(B, [sx * 10, y - 3, sz * 11], [fx - sx * 10, y + .4, fz - sz * 10], .7, k);
              if (k.lose(.15)) continue; mFan(B, [fx, y + 3.6, fz], 11.6, k, "y", sx * sz * .4);
            }
            for (const x of [-7, 7]) obox(B, [x, y - 6.4, -13], [x, y - 6.4, 13], 1.4, 1.4, k.frame, M.metal);
            for (const x of [-7, 7]) for (const z of [-9, 1, 11]) { if (k.dead && k.r.chance(.6)) continue; rod(B, [x, y - 6.4, z - 2], [x, y - 8.2, z - 2], .3, k.frame); dartBody(B, x, y - 9.4, z, .55, k); }
            uplink(B, -6, y + 5.6, 10, 1.2, k); mark(B, 12.3, y, 0, 4, k, "bars", PI2); mark(B, -12.3, y, 0, 4, k, "bars", -PI2);
          });
        },
      },
      skyship: {
        name: "Herald (relay aircraft)", sub: "a big flying-wing relay: lift fans in its wings, a radar dome on its back; it carries the network over a whole region and spots for the guns below; shown on a flight stand", structure: true, machine: true,
        plan(r) { return { W: 150, D: 96, T: 3, storeys: [{ base: 0, H: 10 }], top: 128, noRoof: true, drop: 92, hover: r.range(98, 106), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          const y = p.hover; flightStand(ctx, y - 8, 16);
          mSet(ctx, p, (B, k) => {
            plated(B, 0, y, 4, 20, 10, 56, k, { gx: 2, gy: 1, gz: 5 });
            for (const sd of [-1, 1]) {
              const T = newBuf(); plated(T, 0, 0, 0, 60, 4, 22, k, { gx: 5, gy: 1, gz: 2, t: .5, acc: .08 }); xform(T, B, new THREE.Matrix4().makeTranslation(sd * 40, y + 1.5, -6).multiply(rotEuler(0, sd * .38, 0)));
              mFan(B, [sd * 34, y + 2.4, -5], 9, k, "y", sd * .4);
              plated(B, sd * 70, y + 6, -18, 2, 10, 9, k, { col: k.acc, gx: 1, gy: 1, gz: 1, t: .3 }); lens(B, [sd * 71.4, y + 2, -18], [sd, 0, 0], .6, k, sd > 0 ? MC.net : MC.eye);
              mark(B, sd * 48, y + 3.6, -6, 6, k, "chev", 0);
            }
            obox(B, [0, y + 5, -4], [0, y + 12, -4], 4.4, 4.4, k.frame, M.metal);
            const D = newBuf(); cyl(D, 0, 0, 0, 16, 17, 2.4, 20, pcol(k), M.plain); cyl(D, 0, 2.4, 0, 17, 14, 1.8, 20, pcol(k), M.plain); strip(D, 0, 1.2, 0, 34.4, .5, 2, k, MC.net); strip(D, 0, 1.2, 0, 2, .5, 34.4, k, MC.net);
            k.part("rotor", [0, y + 12, -4], (B) => xform(D, B, new THREE.Matrix4().makeTranslation(0, y + 12, -4)), { axis: [0, 1, 0], spin: 1.2 });
            plated(B, 0, y - .6, 33, 14, 7, 6, k, { gx: 1, gy: 1, gz: 1, rot: rotEuler(.3, 0, 0) }); eyes(B, [0, y - 1.4, 36.4], [0, -.2, .98], 2.2, k, 3);
            cyl(B, 0, y - 8.6, 18, 3.6, 3.6, 3.6, 12, k.frame, M.metal); eye(B, [0, y - 8.6, 21.4], [0, -.3, .95], 1.6, k);
            for (const sd of [-1, 1]) { mTube(B, [sd * 7, y, -24], [sd * 7, y, -30], 3, k.frame, M.metal, 10, 1.6); k.part("rotor", [sd * 7, y, -30.4], (B) => blades(B, [sd * 7, y, -30.4], 14, 3, k, "z", 1.4, sd * .3), { axis: [0, 0, 1], spin: 18 }); }
            greeble(B, 0, y + 5.2, 14, 14, 14, 6, k); uplink(B, 0, y + 5.4, 24, 2, k);
          });
        },
      },
      warden: {
        name: "Warden (sentry turret)", sub: "a sentry that walks to a choke point, drives its three legs into the ground and holds it with twin guns behind a shield", structure: true, machine: true,
        plan(r) { return { W: 44, D: 44, T: 1, storeys: [{ base: 0, H: 14 }], top: 36, noRoof: true, drop: 6, gun: r.pick(["twin", "twin", "rocket"]), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 13;
            // the base: a plated drum on three short braced legs with spikes driven into the ground
            plated(B, 0, y - 3, 0, 12, 6, 12, k, { gx: 1, gy: 1, gz: 1 });
            for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + .5, c = Math.cos(a), s = Math.sin(a); wLeg(B, [c * 5, y - 4, s * 5], [c * 17, 0, s * 17], 1.5, k, [c, s], .08, 2, 2); k.part("spike", [c * 17, 1.4, s * 17], (B) => obox(B, [c * 17, 1.4, s * 17], [c * 17.6, -2.4, s * 17.6], .9, .9, MC.dark, M.metal)); }
            k.part("turret", [0, y, 0], (B) => {
            // the neck: a turntable on actuators, cables
            cyl(B, 0, y, 0, 5.2, 5, 2, 14, k.frame, M.metal); for (const a of [0, 2.1, 4.2]) ram(B, [Math.cos(a) * 4, y - 3, Math.sin(a) * 4], [Math.cos(a) * 3, y + 3, Math.sin(a) * 3], .45, k);
            // the head: plated, a sloped shield in front, the guns, ammo boxes either side, the sensor cluster above the guns
            k.part("gun", [0, y + 6, 0], (B) => {
            plated(B, 0, y + 7, -1, 12, 8, 12, k, { gx: 2, gy: 1, gz: 2 });
            plated(B, 0, y + 6.4, 6.6, 16, 9, 1.6, k, { gx: 2, gy: 2, gz: 1, acc: .25, rot: rotEuler(-.25, 0, 0) });
            eyes(B, [0, y + 11.6, 6.4], [0, 0, 1], 1.3, k, 2);
            if (p.gun === "twin") for (const sd of [-1, 1]) { mTube(B, [sd * 3, y + 5.4, 6], [sd * 3, y + 5.4, 20], .55, MC.dark); mTube(B, [sd * 3, y + 5.4, 7], [sd * 3, y + 5.4, 12], 1, k.frame, M.metal, 10); plated(B, sd * 8, y + 6, -1, 3.4, 5, 7, k, { col: k.c2, gx: 1, gy: 1, gz: 1, t: .35 }); hose(B, [sd * 8, y + 4, 2], [sd * 3, y + 4.6, 6], .3, k); }
            else { plated(B, 0, y + 5, 9, 10, 5, 4, k, { gx: 1, gy: 1, gz: 1 }); for (let i = 0; i < 6; i++) cyl(B, -3 + (i % 3) * 3, y + 3.8 + (i < 3 ? 2.4 : 0), 11.05, .9, .9, .12, 8, MC.dark, M.metal); }
            fins(B, 0, y + 11.2, -4, 8, 5, 6, k); uplink(B, -4, y + 11.2, -5, .9, k);
            }, { pitch: 1 });
            }, { muzzle: p.gun === "twin" ? [3, y + 5.4, 20] : [0, y + 5, 11.2], muzzle2: p.gun === "twin" ? [-3, y + 5.4, 20] : null, shot: p.gun === "twin" ? "gun" : "rocket" }); mark(B, 6.1, y + 7, -2, 2.6, k, "chev", PI2);
          });
        },
      },
      breacher: {
        name: "Breacher (ram vehicle)", sub: "a six-wheeled armoured ram that drives through barricades, gates and walls to open a holdout for the walkers behind it", structure: true, machine: true,
        plan(r) { return { W: 52, D: 84, T: 1, storeys: [{ base: 0, H: 20 }], top: 34, noRoof: true, drop: 4, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            // six wheels on swing arms with shock absorbers
            for (const sd of [-1, 1]) for (const z of [-24, -6, 18]) {
              k.part("wheel", [sd * 20.9, 6.4, z], (B) => { mTube(B, [sd * 18.2, 6.4, z], [sd * 23.6, 6.4, z], 6.2, MC.rubber, M.plain, 16); mTube(B, [sd * 23.4, 6.4, z], [sd * 23.9, 6.4, z], 3.2, k.frame, M.metal, 10);
              for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(B, sd * 20.9, 6.4 + Math.sin(a) * 6.1, z + Math.cos(a) * 6.1, 5.2, 1, 1, MC.dark, M.metal, { rot: rotEuler(-a, 0, 0), edge: false }); } }, { axis: [1, 0, 0], r: 6.2 });
              obox(B, [sd * 11, 9, z + 4], [sd * 18.4, 6.4, z], 1.6, 2.2, k.frame, M.metal); shock(B, [sd * 12, 15, z - 2], [sd * 18, 8, z], .8, k);
            }
            // the hull: a low plated wedge, skirts over the wheels, the battery deck behind
            plated(B, 0, 13, -4, 26, 12, 56, k, { gx: 2, gy: 1, gz: 4 });
            for (const sd of [-1, 1]) if (!k.lose(.2)) { plated(B, sd * 19.4, 14.2, -3, 1.4, 4, 60, k, { gx: 1, gy: 1, gz: 4, t: .5 }); mark(B, sd * 20.2, 14.4, 8, 3, k, "chev", sd * PI2); }
            plated(B, 0, 13.4, 27.4, 26, 10, 6, k, { gx: 2, gy: 1, gz: 1, rot: rotEuler(-.4, 0, 0) });
            plated(B, 0, 20.4, -18, 20, 3, 18, k, { col: k.acc, gx: 2, gy: 1, gz: 2 }); fins(B, 0, 22, -18, 16, 14, 10, k); greeble(B, 0, 19.2, 8, 18, 14, 4, k);
            // the ram: a plated blade on the nose, a battering head on twin rams, warning bands
            plated(B, 0, 9, 36, 34, 13, 3, k, { gx: 3, gy: 1, gz: 1, rot: rotEuler(.2, 0, 0) }); mark(B, -10, 4.6, 37.6, 4, k, "haz"); mark(B, 10, 4.6, 37.6, 4, k, "haz");
            for (const sd of [-1, 1]) ram(B, [sd * 6, 14, 24], [sd * 6, 14, 40], 1.5, k);
            k.part("ram", [0, 14, 41.6], (B) => { plated(B, 0, 14, 41.6, 16, 7, 4, k, { col: k.frame, gx: 1, gy: 1, gz: 1 }); for (let i = 0; i < 5; i++) obox(B, [-6 + i * 3, 14, 43.6], [-6 + i * 3, 14, 46.6], 1.6, 6, MC.dark, M.metal); }, { push: 9 });
            // the cab slit and the sensor cluster under its hood
            plated(B, 0, 21.6, 16, 14, 5, 9, k, { gx: 1, gy: 1, gz: 1 }); eyes(B, [0, 21.4, 20.8], [0, 0, 1], 1.4, k, 2); lens(B, [-6, 18.8, 30], [0, 0, 1], .7, k, MC.lamp); lens(B, [6, 18.8, 30], [0, 0, 1], .7, k, MC.lamp);
            uplink(B, 8, 21.9, -8, 1.2, k);
          });
        },
      },
      stilt: {
        name: "Stilt (sniper)", sub: "a tall two-legged sniper on reverse knees: it looks over walls and rooftops and fires a rail rifle from a long way off", structure: true, machine: true,
        plan(r) { return { W: 50, D: 70, T: 1, storeys: [{ base: 0, H: 40 }], top: 76, noRoof: true, drop: 40, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 58;
            // the body: a compact plated pod, a battery counterweight behind it, a sensor head forward
            plated(B, 0, y, 0, 13, 10, 16, k, { gx: 1, gy: 1, gz: 2 });
            plated(B, 0, y + 1, -12, 10, 8, 8, k, { gx: 1, gy: 1, gz: 1, col: k.c2 }); fins(B, 0, y + 5.2, -12, 8, 6, 6, k);
            plated(B, 0, y + 3, 11, 9, 6.4, 7, k, { gx: 1, gy: 1, gz: 1 }); plated(B, 0, y + 6.6, 11, 10, 1.4, 8, k, { col: k.acc, gx: 1, gy: 1, gz: 1 });
            eyes(B, [0, y + 3, 15], [0, 0, 1], 1.6, k, 3); lens(B, [3.6, y + 5.4, 14.6], [0, 0, 1], .5, k, MC.lamp);
            k.part("turret", [0, y - 6.6, 2], (B) => {
            // the rail rifle under the body: twin rails, coil collars, a muzzle, its feed and cables
            cyl(B, 0, y - 6.6, 2, 3, 3, 1.6, 10, k.frame, M.metal);
            k.part("gun", [0, y - 8, 2], (B) => {
            for (const sd of [-1, 1]) obox(B, [sd * 1.4, y - 8, -4], [sd * 1.4, y - 8, 42], 1.1, 2.6, k.frame, M.metal);
            for (let i = 0; i < 5; i++) plated(B, 0, y - 8, 6 + i * 7, 5.4, 4.6, 1.6, k, { gx: 1, gy: 1, gz: 1, col: i === 4 ? k.acc : k.c1, t: .3 });
            mTube(B, [0, y - 8, 42], [0, y - 8, 45], 1.7, k.joint, M.metal, 10); strip(B, 0, y - 8, 20, .3, .8, 40, k, MC.net);
            }, { pitch: 1 });
            hose(B, [-4, y - 4, -8], [-1, y - 6, 6], .35, k);
            }, { muzzle: [0, y - 8, 45], shot: "rail", yaw: .8 });
            uplink(B, 3, y + 5, -4, 1, k); mark(B, 6.6, y, 2, 2.8, k, "bars", PI2); mark(B, -6.6, y, 2, 2.8, k, "bars", -PI2);
            // two long legs bending backward like a bird's
            for (const sd of [-1, 1]) wLeg(B, [sd * 7.5, y - 3, -2], [sd * 13, 0, 4], 2.3, k, [sd * .15, -1], .2, 0, 3);
          });
        },
      },
      tremor: {
        name: "Tremor (mortar walker)", sub: "a four-legged mortar carrier: it braces on stabilizer legs and drops shells on a holdout from streets away while spotters call the fall", structure: true, machine: true,
        plan(r) { return { W: 90, D: 90, T: 2, storeys: [{ base: 0, H: 30 }], top: 64, noRoof: true, drop: 22, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 30;
            // the body: a wide low plated hull, magazines along its flanks, a sensor mast
            plated(B, 0, y, 0, 28, 11, 30, k, { gx: 2, gy: 1, gz: 2 });
            for (const sd of [-1, 1]) { plated(B, sd * 16.6, y - 1, 0, 5, 9, 24, k, { gx: 1, gy: 1, gz: 3, col: k.c2 }); for (let i = 0; i < 4; i++) cyl(B, sd * 16.6, y + 3.6, -8 + i * 5.4, 1.2, 1.2, .5, 8, k.acc, M.plain); }
            plated(B, 0, y - 1, 17, 18, 8, 5, k, { gx: 2, gy: 1, gz: 1 }); eyes(B, [0, y - 1, 19.8], [0, 0, 1], 1.6, k, 2);
            obox(B, [-9, y + 5.5, -12], [-9, y + 22, -12], 1.4, 1.4, k.frame, M.metal); plated(B, -9, y + 24, -12, 5, 4, 5, k, { gx: 1, gy: 1, gz: 1 }); eye(B, [-9, y + 24, -9.2], [0, 0, 1], 1.1, k);
            k.part("mortar", [3, y + 5.5, -2], (B) => {
            // the mortar battery: six tubes in a cradle on a turntable, raised by rams
            cyl(B, 3, y + 5.5, -2, 9, 9, 1.8, 16, k.frame, M.metal);
            const T = newBuf(); plated(T, 0, 0, 0, 14, 4, 12, k, { gx: 2, gy: 1, gz: 1 });
            for (let i = 0; i < 6; i++) { const x = -4.6 + (i % 3) * 4.6, z = i < 3 ? -2.8 : 2.8; mTube(T, [x, 1, z], [x, 18, z], 1.8, k.frame, M.metal, 10); mTube(T, [x, 16, z], [x, 18.2, z], 2.1, k.joint, M.metal, 10); mTube(T, [x, 6, z], [x, 9, z], 2.05, pcol(k, 1), M.plain, 10); }
            k.part("gun", [3, y + 9, -4], (B) => xform(T, B, new THREE.Matrix4().makeTranslation(3, y + 9, -4).multiply(rotEuler(.5, 0, 0))), { pitch: 1 });
            for (const sd of [-1, 1]) ram(B, [3 + sd * 7, y + 6, -10], [3 + sd * 7, y + 12, -4], .9, k);
            }, { muzzle: [3, y + 26, 6], shot: "mortar" });
            // stabilizers: two arms folded down to pads either side
            // (its fold-down stabilizer struts were taken off, 14 Nov: they read as stands)
            greeble(B, 3, y + 5.7, 10, 18, 6, 3, k); uplink(B, 9, y + 5.6, -12, 1.2, k); mark(B, 14.2, y, 12, 3, k, "chev", PI2);
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) wLeg(B, [sd * 13, y - 3, zs * 11], [sd * 27, 0, zs * 25], 3.1, k, [sd * .5, zs], .12, 3, 3);
          });
        },
      },
      gleaner: {
        name: "Gleaner (salvager)", sub: "a six-legged salvage machine in two hulls: grabber arms feed wrecks and scrap into a shredder, and the hopper behind carries it back to the factories", structure: true, machine: true,
        plan(r) { return { W: 130, D: 150, T: 2, storeys: [{ base: 0, H: 40 }], top: 70, noRoof: true, drop: 30, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 40;
            // the fore hull: the shredder mouth, the sensor block, two grabber arms on shoulder drums
            plated(B, 0, y, 18, 32, 16, 30, k, { gx: 2, gy: 1, gz: 2 });
            box(B, 0, y - 5, 33.4, 24, 8, 2, MC.dark, M.metal, { edge: false });
            for (const xx of [-6, 6]) k.part("wheel", [xx, y - 5, 33], (B) => { mTube(B, [xx - 5.5, y - 5, 33], [xx + 5.5, y - 5, 33], 3.6, k.steel, M.metal, 10); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(B, xx, y - 5 + Math.sin(a) * 3.6, 33 + Math.cos(a) * 3.6, 10, .8, .8, MC.dark, M.metal, { edge: false }); } }, { axis: [1, 0, 0], r: 3.6, idle: xx > 0 ? 3 : -3 });
            plated(B, 0, y + 10, 26, 14, 6, 9, k, { gx: 1, gy: 1, gz: 1 }); eyes(B, [0, y + 10, 31], [0, 0, 1], 1.8, k, 3);
            for (const sd of [-1, 1]) k.part("arm", [sd * 17, y + 4, 26], (B) => {
              const sh = [sd * 17, y + 4, 26], el = [sd * 24, y + 14, 44], wr = [sd * 14, y - 4, 56];
              mTube(B, [sd * 15, y + 4, 26], [sd * 19.5, y + 4, 26], 4, k.joint, M.metal, 12);
              obox(B, sh, el, 3.6, 4.4, pcol(k), M.plain); obox(B, sh, el, 1.4, 1.6, k.acc, M.plain, { up: 2.6, len: .4 }); ram(B, [sd * 16, y - 2, 22], [el[0] - sd * 1, el[1] - 3, el[2] - 3], 1, k);
              mTube(B, [el[0] - sd * 2.4, el[1], el[2]], [el[0] + sd * 2.4, el[1], el[2]], 2.6, k.joint, M.metal, 10);
              obox(B, el, wr, 2.8, 3.2, pcol(k, 1), M.plain); ram(B, lerp3(sh, el, .6), lerp3(el, wr, .5), .7, k);
              for (const t of [-.6, .6]) { const tip = [wr[0] + sd * t * 4, wr[1] - 6, wr[2] + 5]; obox(B, wr, [wr[0] + sd * t * 3, wr[1] - 2, wr[2] + 3], 1.4, 1.4, k.frame, M.metal); obox(B, [wr[0] + sd * t * 3, wr[1] - 2, wr[2] + 3], tip, 1.2, 1.2, MC.dark, M.metal); }
              hose(B, [sd * 14, y + 8, 18], [el[0], el[1] + 1, el[2] - 2], .4, k);
            }, { side: sd });
            // the joint, then the aft hull: a conveyor up into an open hopper heaped with scrap
            mTube(B, [0, y, 1], [0, y, 4], 10, MC.rubber, M.plain, 12); for (const sd of [-1, 1]) ram(B, [sd * 9, y + 4, -2], [sd * 9, y + 4, 7], .9, k);
            plated(B, 0, y - 3, -22, 34, 12, 40, k, { gx: 2, gy: 1, gz: 3 });
            for (const sd of [-1, 1]) plated(B, sd * 16, y + 8, -22, 2, 10, 38, k, { gx: 1, gy: 1, gz: 3 }); plated(B, 0, y + 8, -41, 30, 10, 2, k, { gx: 2, gy: 1, gz: 1 }); plated(B, 0, y + 6, -3, 30, 6, 2, k, { gx: 2, gy: 1, gz: 1, col: k.acc });
            if (!k.dead) { const L = ctx.lay("scrap"); for (let i = 0; i < 18; i++) box(B, L.range(-12, 12), y + 5 + L.range(0, 6), L.range(-38, -6), L.range(2, 7), L.range(1, 4), L.range(2, 8), mix3(RUST, L.pick([C("#6a6e72"), C("#8a2a22"), C("#2e4a6a"), C("#c8c4b8")]), L.range(.2, .7)), M.metal, { rot: rotEuler(L.range(-.5, .5), L.range(0, 3), L.range(-.5, .5)) }); }
            obox(B, [0, y - 2, 8], [0, y + 8, -6], 8, 1.2, k.frame, M.metal); for (let i = 0; i < 5; i++) { const q = lerp3([0, y - 1.2, 7], [0, y + 8.6, -5], i / 4); mTube(B, [q[0] - 4, q[1], q[2]], [q[0] + 4, q[1], q[2]], .5, k.steel, M.metal, 6); }
            fins(B, 0, y + 3.2, -44, 20, 4, 8, k); uplink(B, -10, y + 3.2, -45, 1.4, k); mark(B, 17.2, y - 3, -24, 5, k, "bars", PI2); mark(B, -17.2, y - 3, -24, 5, k, "haz", -PI2);
            for (const sd of [-1, 1]) for (const hz of [22, -10, -34]) wLeg(B, [sd * 17, y - 6, hz], [sd * 48, 0, hz * 1.4], 3.6, k, [sd, hz * .01], .1, 10, 3);
          });
        },
      },
      mule: {
        name: "Mule (supply walker)", sub: "a four-legged carrier that brings power cells and ammunition up to the line and rearms the other machines; kill it and they run dry", structure: true, machine: true,
        plan(r) { return { W: 70, D: 84, T: 1, storeys: [{ base: 0, H: 30 }], top: 50, noRoof: true, drop: 22, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 28;
            // a low plated chassis, a small sensor head, a cargo frame of rails
            plated(B, 0, y, 0, 22, 8, 36, k, { gx: 2, gy: 1, gz: 3 });
            plated(B, 0, y + 1, 21, 10, 6, 6, k, { gx: 1, gy: 1, gz: 1 }); eyes(B, [0, y + 1.4, 24.4], [0, 0, 1], 1.2, k, 2); lens(B, [-3.6, y + 3, 24.2], [0, 0, 1], .45, k, MC.lamp);
            for (const sd of [-1, 1]) { obox(B, [sd * 12, y + 4, -17], [sd * 12, y + 4, 17], 1.2, 1.2, k.frame, M.metal); obox(B, [sd * 12, y + 4, -17], [sd * 12, y + 20, -17], 1.2, 1.2, k.frame, M.metal); obox(B, [sd * 12, y + 4, 15], [sd * 12, y + 18, 15], 1.2, 1.2, k.frame, M.metal); obox(B, [sd * 12, y + 20, -17], [sd * 12, y + 18, 15], 1.2, 1.2, k.frame, M.metal); }
            // the load: power cells with lit bands, ammunition crates, a strap over them
            for (let i = 0; i < 6; i++) { const x = i % 2 ? 4.6 : -4.6, z = -12 + Math.floor(i / 2) * 9; if (k.dead && k.r.chance(.5)) continue; plated(B, x, y + 9, z, 7.6, 9, 7.6, k, { gx: 1, gy: 1, gz: 1, col: k.c2, t: .35 }); strip(B, x, y + 9, z + 3.9, 6, .5, .15, k, MC.net); strip(B, x, y + 11, z + 3.9, 6, .5, .15, k, MC.net); }
            for (let i = 0; i < 4; i++) { if (k.dead && k.r.chance(.5)) continue; box(B, (i % 2 ? 4 : -4), y + 16.6, -9 + Math.floor(i / 2) * 12, 7, 4, 9, i % 2 ? pcol(k) : k.acc, M.plain); }
            for (const z of [-6, 8]) obox(B, [-12, y + 19, z], [12, y + 19, z], 1.4, .4, MC.rubber, M.plain);
            // a small crane arm to pass cells across
            cyl(B, -8, y + 4, 20, 2, 2, 1.4, 10, k.frame, M.metal); obox(B, [-8, y + 5.4, 20], [-8, y + 16, 12], 1.6, 1.6, k.acc, M.plain); obox(B, [-8, y + 16, 12], [-8, y + 12, 6], 1.2, 1.2, k.frame, M.metal); ram(B, [-8, y + 5, 16], [-8, y + 12, 15], .5, k);
            uplink(B, 8, y + 4, 20, 1.1, k); mark(B, 11.1, y, 2, 3, k, "box", PI2); mark(B, -11.1, y, 2, 3, k, "chev", -PI2);
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) wLeg(B, [sd * 11, y - 3, zs * 13], [sd * 21, 0, zs * 25], 2.6, k, [sd * .35, zs], .14, 3, 3);
          });
        },
      },
      moth: {
        name: "Moth (jammer drone)", sub: "a wide two-fan drone with an antenna array that drowns out radios and drone links in an area; shown on a flight stand", structure: true, machine: true,
        plan(r) { return { W: 64, D: 52, T: 1, storeys: [{ base: 0, H: 6 }], top: 78, noRoof: true, drop: 44, hover: r.range(52, 60), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          const y = p.hover; flightStand(ctx, y - 5, 10);
          mSet(ctx, p, (B, k) => {
            plated(B, 0, y, 0, 18, 6, 22, k, { gx: 2, gy: 1, gz: 2 });
            plated(B, 0, y + 1, 0, 44, 2.4, 12, k, { gx: 4, gy: 1, gz: 1, acc: .15 });
            for (const sd of [-1, 1]) mFan(B, [sd * 22, y + 1.8, 0], 9.6, k, "y", sd * .4);
            // the array: blade aerials in a ring round a dome, lit seams, a dish
            cyl(B, 0, y + 3, 0, 6, 4, 3, 14, pcol(k, 1), M.plain);
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(B, Math.cos(a) * 7.6, y + 7, Math.sin(a) * 7.6, .4, 8, 2.2, k.frame, M.metal, { rot: rotEuler(0, -a, 0) }); if (i % 2) lens(B, [Math.cos(a) * 7.6, y + 11.4, Math.sin(a) * 7.6], [0, 1, 0], .4, k, MC.net); }
            const [rc, rm] = lit(k, MC.net); cyl(B, 0, y + 6, 0, 4.2, 4.2, .4, 14, rc, rm);
            obox(B, [0, y + 6, 0], [0, y + 14, 0], 1, 1, k.frame, M.metal); const D = newBuf(); cyl(D, 0, -.6, 0, 3.6, 4.4, 1.2, 12, pcol(k), M.plain); xform(D, B, new THREE.Matrix4().makeTranslation(0, y + 14, 0).multiply(rotEuler(-.6, 0, 0)));
            // the pod underneath with its eye
            cyl(B, 0, y - 5.4, 4, 3, 3, 2.4, 10, k.frame, M.metal); eyes(B, [0, y - 4.8, 7.2], [0, -.2, .98], 1.2, k, 2);
            uplink(B, 6, y + 3, -8, 1, k); mark(B, 9.1, y, -4, 2.6, k, "chev", PI2); mark(B, -9.1, y, -4, 2.6, k, "chev", -PI2);
          });
        },
      },
      citadel: {
        name: "Citadel (walking fortress)", sub: "a walking fortress on four great legs: a gun deck you can stand on, a keep with its own roof deck, ladders between them, a hangar in its belly that lets out Mites", structure: true, machine: true,
        plan(r) { return { W: 290, D: 320, T: 3, storeys: [{ base: 0, H: 150 }], top: 262, noRoof: true, drop: 110, scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 150, d1 = y + 26, d2 = y + 72;
            // the lower hull: a dark spine, plated sides in tiers, a great sensor face, a belly hangar
            box(B, 0, y - 22, 0, 100, 16, 150, k.core, M.metal, { edge: false });
            plated(B, 0, y, 0, 130, 50, 170, k, { gx: 6, gy: 2, gz: 7, noTop: true });
            for (const sd of [-1, 1]) { plated(B, sd * 67, y - 6, 0, 6, 26, 150, k, { gx: 1, gy: 1, gz: 6, col: k.c2 }); strip(B, sd * 70.2, y + 10, 0, .3, .8, 140, k); mark(B, sd * 70.3, y - 6, 40, 14, k, "bars", sd * PI2); mark(B, sd * 70.3, y - 6, -40, 14, k, "chev", sd * PI2); }
            plated(B, 0, y + 2, 88, 100, 40, 8, k, { gx: 4, gy: 2, gz: 1 }); eyes(B, [0, y + 4, 92.4], [0, 0, 1], 8, k, 5); for (const x of [-36, 36]) eye(B, [x, y + 4, 92.2], [0, 0, 1], 3, k);
            strip(B, 0, y + 19, 92.2, 80, .9, .6, k); mark(B, -34, y - 12, 92.2, 9, k, "haz"); mark(B, 34, y - 12, 92.2, 9, k, "haz");
            const [gc, gm] = lit(k, C("#ffb070")); box(B, 0, y - 30.6, -10, 40, .6, 60, gc, gm, { edge: false });
            for (const sd of [-1, 1]) obox(B, [sd * 22, y - 30, -40], [sd * 22, y - 30, 20], 3, 3, k.frame, M.metal);
            if (!k.dead) { mTube(B, [0, y - 30, -10], [0, 10, -10], .6, k.steel, M.metal, 4); miteBody(B, 0, 8, -10, 1.4, k, 0); }
            // the gun deck: flat plating you can stand on, railings round it, a hatch, turrets at its corners and the main gun forward
            plated(B, 0, d1 - 1.5, 0, 130, 3, 170, k, { gx: 7, gy: 1, gz: 9, t: .7 });
            const rail = (a, b) => { const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(L / 10)); for (let i = 0; i <= n; i++) { const q = lerp3(a, b, i / n); rod(B, q, [q[0], q[1] + 9, q[2]], .4, k.frame); } rod(B, [a[0], a[1] + 9, a[2]], [b[0], b[1] + 9, b[2]], .45, k.acc, M.plain); rod(B, [a[0], a[1] + 4.6, a[2]], [b[0], b[1] + 4.6, b[2]], .3, k.frame); };
            for (const sd of [-1, 1]) rail([sd * 63, d1, -83], [sd * 63, d1, 83]); rail([-63, d1, -83], [63, d1, -83]);
            box(B, 30, d1 + .3, -50, 12, .6, 12, k.frame, M.metal); box(B, 30, d1 + .6, -50, 10, .4, 10, pcol(k, 1), M.plain);
            for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
              const x = sx * 50, z = sz * 68; k.part("turret", [x, d1, z], (B) => { cyl(B, x, d1, z, 7, 7, 2, 12, k.frame, M.metal); k.part("gun", [x, d1 + 5.4, z], (B) => { plated(B, x, d1 + 6, z, 10, 7, 10, k, { gx: 1, gy: 1, gz: 1 });
              for (const q of [-1.6, 1.6]) mTube(B, [x + q, d1 + 5.4, z + sz * 5], [x + q, d1 + 5.4, z + sz * 16], .6, MC.dark); lens(B, [x, d1 + 8, z + sz * 5.2], [0, 0, sz], .6, k); }, { pitch: 1 }); }, { muzzle: [x + 1.6, d1 + 5.4, z + sz * 16], muzzle2: [x - 1.6, d1 + 5.4, z + sz * 16], shot: "gun", small: true });
            }
            k.part("turret", [0, d1, 52], (B) => { cyl(B, 0, d1, 52, 20, 20, 3, 18, k.frame, M.metal); k.part("gun", [0, d1 + 11, 56], (B) => { plated(B, 0, d1 + 11, 50, 34, 14, 30, k, { gx: 2, gy: 1, gz: 2 }); plated(B, 0, d1 + 11, 66.6, 24, 11, 3, k, { gx: 2, gy: 1, gz: 1, col: k.c2 });
            for (const sd of [-1, 1]) { mTube(B, [sd * 6, d1 + 11, 68], [sd * 6, d1 + 11, 140], 3, MC.dark, M.metal, 12); mTube(B, [sd * 6, d1 + 11, 92], [sd * 6, d1 + 11, 100], 4, k.frame, M.metal, 12); mTube(B, [sd * 6, d1 + 11, 136], [sd * 6, d1 + 11, 143], 4.4, k.joint, M.metal, 12); } }, { pitch: 1 }); }, { muzzle: [6, d1 + 11, 143], muzzle2: [-6, d1 + 11, 143], shot: "cannon" });
            // the keep: a plated block with lit slits, a roof deck with railings, ladders up to it, the mast and uplink
            plated(B, 0, y + 49, -20, 70, 44, 80, k, { gx: 4, gy: 2, gz: 4, noTop: true });
            for (const sd of [-1, 1]) strip(B, sd * 35.4, y + 58, -20, .3, 1.2, 66, k); strip(B, 0, y + 58, 20.4, 56, 1.2, .3, k); eyes(B, [0, y + 48, 20.6], [0, 0, 1], 3, k, 3);
            plated(B, 0, d2 - 1.5, -20, 70, 3, 80, k, { gx: 4, gy: 1, gz: 4, t: .7 });
            for (const sd of [-1, 1]) rail([sd * 34, d2, -59], [sd * 34, d2, 19]); rail([-34, d2, 19], [34, d2, 19]); rail([-34, d2, -59], [34, d2, -59]);
            const ladder = (x, z, ya, yb, ax) => { for (const o of [-2.6, 2.6]) rod(B, [x + (ax ? 0 : o), ya, z + (ax ? o : 0)], [x + (ax ? 0 : o), yb, z + (ax ? o : 0)], .4, k.frame); for (let yy = ya + 3; yy < yb; yy += 4) rod(B, [x - (ax ? 0 : 2.6), yy, z - (ax ? 2.6 : 0)], [x + (ax ? 0 : 2.6), yy, z + (ax ? 2.6 : 0)], .3, k.steel); };
            ladder(36.4, -40, d1, d2 + 1, true); ladder(-36.4, 0, d1, d2 + 1, true); ladder(66, -70, y - 24, d1 + 1, true);
            fins(B, -14, d2, -40, 24, 20, 12, k);
            for (const [sh, h0] of [[0, 32], [0, 26]]) void sh, h0;
            let h = d2, r0 = 6; for (const L of [28, 22, 18]) { obox(B, [16, h, -34], [16, h + L, -34], r0 * 2, r0 * 2, pcol(k, 1), M.plain); mTube(B, [16, h + L - 1.2, -34], [16, h + L + .5, -34], r0 * 1.2, k.frame, M.metal, 10); h += L; r0 *= .78; }
            uplink(B, 16, h + .4, -34, 3.6, k); lens(B, [16, h + 13, -34.6], [0, 1, 0], 1, k);
            // the heat exchangers on the flanks, the cable runs
            for (const sd of [-1, 1]) for (const z of [-56, -24, 8]) { plated(B, sd * 72, y + 16, z, 10, 14, 22, k, { gx: 1, gy: 1, gz: 2 }); fins(B, sd * 72, y + 23.4, z, 8, 18, 6, k); }
            if (!k.dead) for (const sd of [-1, 1]) hose(B, [sd * 40, d1 + 1, -60], [sd * 40, d1 + 1, 30], 1.1, k);
            // four great legs, with rungs up the back of each shin
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) {
              const hip = [sd * 62, y - 22, zs * 66], foot = [sd * 112, 0, zs * 124];
              wLeg(B, hip, foot, 12, k, [sd * .35, zs], .12, 4, 3);
              for (let i = 0; i < 9; i++) { const q = lerp3([sd * 104, 22, zs * 112], [sd * 92, 80, zs * 100], i / 8); rod(B, [q[0] - 3, q[1], q[2] - zs * 9], [q[0] + 3, q[1], q[2] - zs * 9], .35, k.steel); }
            }
          });
        },
      },
      caravan: {
        name: "Caravan (walking train)", sub: "a walking convoy of five jointed cars on ten legs: a lead car with the sensors and a plough, a gun car, two cargo flats you can climb across, and a power car; walkways bridge the joints", structure: true, machine: true,
        plan(r) { return { W: 130, D: 380, T: 2, storeys: [{ base: 0, H: 50 }], top: 96, noRoof: true, drop: 34, bend: r.range(-.06, .06), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 44, cars = 5, L = 62, gap = 10, z0 = -(cars * L + (cars - 1) * gap) / 2 + L / 2;
            const rail = (T, a, b) => { const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(len / 9)); for (let i = 0; i <= n; i++) { const q = lerp3(a, b, i / n); rod(T, q, [q[0], q[1] + 7, q[2]], .3, k.frame); } rod(T, [a[0], a[1] + 7, a[2]], [b[0], b[1] + 7, b[2]], .35, k.acc, M.plain); };
            const ladder = (T, x, z, ya, yb) => { for (const o of [-2.2, 2.2]) rod(T, [x, ya, z + o], [x, yb, z + o], .32, k.frame); for (let yy = ya + 3; yy < yb; yy += 4) rod(T, [x, yy, z - 2.2], [x, yy, z + 2.2], .25, k.steel); };
            for (let i = 0; i < cars; i++) {
              const zc = z0 + i * (L + gap), T = newBuf(), kind = ["lead", "gun", "flat", "flat", "power"][i];
              // the car: a plated body, a flat deck on top, railings, a ladder down one side, a pair of legs
              plated(T, 0, 0, 0, 44, 18, L, k, { gx: 3, gy: 1, gz: 4, noTop: true });
              plated(T, 0, 9.6, 0, 46, 2, L + 2, k, { gx: 3, gy: 1, gz: 4, t: .5, acc: .05 });
              for (const sd of [-1, 1]) { strip(T, sd * 22.3, 3, 0, .3, .6, L - 8, k); if (kind !== "flat") rail(T, [sd * 22, 10.6, -L / 2 + 2], [sd * 22, 10.6, L / 2 - 2]); }
              ladder(T, 23.4, -L / 2 + 8, -8, 11);
              mark(T, -22.4, 0, 0, 7, k, i % 2 ? "bars" : "chev", -PI2);
              const ang = p.bend * (i - 2), CM = new THREE.Matrix4().makeTranslation(Math.sin(ang * 2) * 30, y, zc).multiply(rotEuler(0, ang, 0));
              for (const sd of [-1, 1]) { const hw = new THREE.Vector3(sd * 20, -6, 0).applyMatrix4(CM), fw = new THREE.Vector3(sd * 44, -y, 4).applyMatrix4(CM); k.part("leg", [hw.x, hw.y, hw.z], (B) => { const Lg = newBuf(); wLeg(Lg, [sd * 20, -6, 0], [sd * 44, -y, 4], 4.6, k, [sd, .2], .12, 6, 3); xform(Lg, B, CM); }, { foot: [fw.x, fw.y, fw.z], r: 4.6 }); }
              if (kind === "lead") {
                plated(T, 0, 2, L / 2 + 5, 38, 16, 10, k, { gx: 2, gy: 1, gz: 1, rot: rotEuler(-.3, 0, 0) }); eyes(T, [0, 4, L / 2 + 10.6], [0, 0, 1], 3.4, k, 4);
                for (const x of [-14, 14]) eye(T, [x, 2, L / 2 + 10], [0, 0, 1], 1.5, k);
                plated(T, 0, -12, L / 2 + 10, 46, 8, 3, k, { gx: 3, gy: 1, gz: 1, rot: rotEuler(.4, 0, 0) }); mark(T, -12, -12, L / 2 + 12, 5, k, "haz"); mark(T, 12, -12, L / 2 + 12, 5, k, "haz");
                plated(T, 0, 18, 8, 22, 14, 22, k, { gx: 2, gy: 1, gz: 2 }); strip(T, 0, 20, 19.2, 18, .7, .3, k); rail(T, [-11, 25, -3], [11, 25, -3]);
              }
              if (kind === "gun") {
                { const tp = new THREE.Vector3(0, 10.6, 4).applyMatrix4(CM), m1 = new THREE.Vector3(4, 18, 52).applyMatrix4(CM), m2 = new THREE.Vector3(-4, 18, 52).applyMatrix4(CM);
                k.part("turret", [tp.x, tp.y, tp.z], (B) => { const Q = newBuf(); cyl(Q, 0, 10.6, 4, 12, 12, 2, 16, k.frame, M.metal); plated(Q, 0, 18, 4, 20, 10, 20, k, { gx: 2, gy: 1, gz: 2 });
                for (const sd of [-1, 1]) { mTube(Q, [sd * 4, 18, 14], [sd * 4, 18, 52], 1.8, MC.dark, M.metal, 10); mTube(Q, [sd * 4, 18, 14], [sd * 4, 18, 26], 2.8, k.frame, M.metal, 10); }
                lens(Q, [8, 21, 14.2], [0, 0, 1], .8, k); xform(Q, B, CM); }, { muzzle: [m1.x, m1.y, m1.z], muzzle2: [m2.x, m2.y, m2.z], shot: "cannon" }); } for (const sd of [-1, 1]) { plated(T, sd * 14, 14, -20, 8, 7, 12, k, { gx: 1, gy: 1, gz: 1 }); for (let j = 0; j < 4; j++) cyl(T, sd * 14 + (j % 2 ? 1.6 : -1.6), 14 + (j < 2 ? 1.6 : -1.6), -13.9, .9, .9, .12, 8, MC.dark, M.metal); }
              }
              if (kind === "flat") {
                const L2 = ctx.lay("cargo" + i);
                for (let j = 0; j < 2; j++) { const cz = -14 + j * 28, ch = L2.pick([14, 16]); plated(T, L2.range(-4, 4), 10.6 + ch / 2, cz, 22, ch, 24, k, { gx: 2, gy: 1, gz: 2, col: L2.pick([k.c2, k.acc, C("#3e4a52"), C("#5a3a2a")]), t: .5 }); }
                for (const sd of [-1, 1]) rod(T, [sd * 22, 10.6, -L / 2 + 2], [sd * 22, 10.6, L / 2 - 2], .5, k.frame);
                ladder(T, -23.4, L / 2 - 8, 10.6, 28);
              }
              if (kind === "power") {
                for (const sd of [-1, 1]) { plated(T, sd * 10, 16, 6, 16, 10, 30, k, { gx: 1, gy: 1, gz: 2, col: k.c2 }); fins(T, sd * 10, 21.2, 6, 14, 26, 10, k); }
                let h = 10.6, r0 = 3.4; for (const Lm of [18, 14, 10]) { obox(T, [0, h, -18], [0, h + Lm, -18], r0 * 2, r0 * 2, pcol(k, 1), M.plain); h += Lm; r0 *= .78; } uplink(T, 0, h, -18, 2.6, k);
                plated(T, 0, 2, -L / 2 - 4, 36, 12, 6, k, { gx: 2, gy: 1, gz: 1 }); eye(T, [0, 3, -L / 2 - 7.2], [0, 0, -1], 1.6, k);
              }
              xform(T, B, CM);
              // the joint to the next car: bellows, actuators, and a walkway plate across the gap
              if (i < cars - 1) { const zj = zc + L / 2 + gap / 2, xj = (Math.sin(ang * 2) * 30 + Math.sin(p.bend * (i - 1) * 2) * 30) / 2; mTube(B, [xj, y, zj - gap / 2 - 1], [xj, y, zj + gap / 2 + 1], 9, MC.rubber, M.plain, 12); for (const sd of [-1, 1]) ram(B, [xj + sd * 13, y + 3, zj - 7], [xj + sd * 13, y + 3, zj + 7], 1.2, k); plated(B, xj, y + 9.6, zj, 18, 1.6, gap + 6, k, { gx: 1, gy: 1, gz: 1, col: k.frame, t: .4 }); }
            }
          });
        },
      },
      maw: {
        name: "Maw (strip miner)", sub: "a tracked strip-mining machine the size of a city block: a bucket wheel on a long boom chews through buildings, conveyors carry the rubble back, and gantries and decks run all over it", structure: true, machine: true,
        plan(r) { return { W: 270, D: 420, T: 3, storeys: [{ base: 0, H: 90 }], top: 230, noRoof: true, drop: 20, slew: r.range(-.25, .25), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const rail = (a, b, h = 8) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(2, Math.round(L / 10)); for (let i = 0; i <= n; i++) { const q = lerp3(a, b, i / n); rod(B, q, [q[0], q[1] + h, q[2]], .4, k.frame); } rod(B, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], .45, k.acc, M.plain); };
            const ladder = (x, z, ya, yb) => { for (const o of [-2.6, 2.6]) rod(B, [x, ya, z + o], [x, yb, z + o], .4, k.frame); for (let yy = ya + 3; yy < yb; yy += 4) rod(B, [x, yy, z - 2.6], [x, yy, z + 2.6], .3, k.steel); };
            // two great track units under a plated undercarriage
            for (const sd of [-1, 1]) {
              box(B, sd * 72, 18, -40, 50, 34, 190, MC.rubber, M.plain, { edge: false });
              for (let i = 0; i < 46; i++) { const z = -134 + i * 4.1; box(B, sd * 72, 35.4, z, 52, 1.2, 2.4, MC.dark, M.metal, { edge: false }); box(B, sd * 72, .6, z, 52, 1.2, 2.4, MC.dark, M.metal, { edge: false }); }
              for (let i = 0; i < 7; i++) mTube(B, [sd * 97.4, 15, -120 + i * 27], [sd * 98.4, 15, -120 + i * 27], 11, k.frame, M.metal, 14);
              plated(B, sd * 99, 28, -40, 3, 14, 170, k, { gx: 1, gy: 1, gz: 8 }); mark(B, sd * 100.6, 28, -40, 12, k, "bars", sd * PI2);
              ladder(sd * 101, 30, 2, 66);
            }
            plated(B, 0, 46, -40, 110, 20, 160, k, { gx: 5, gy: 1, gz: 6 });
            // the house on its turntable: engine block, a walkable roof, railings, the operator's sensor face
            const T = newBuf(), hy = 58;
            cyl(T, 0, 0, 0, 56, 56, 6, 24, k.frame, M.metal);
            plated(T, 0, hy - 30, -30, 120, 50, 110, k, { gx: 5, gy: 2, gz: 5, noTop: true });
            plated(T, 0, hy - 4, -30, 122, 3, 112, k, { gx: 6, gy: 1, gz: 6, t: .7 });
            plated(T, 0, hy + 14, 10, 40, 30, 30, k, { gx: 2, gy: 2, gz: 2 }); eyes(T, [0, hy + 16, 25.6], [0, 0, 1], 4, k, 4); strip(T, 0, hy + 26, 25.4, 30, .8, .4, k);
            for (const sd of [-1, 1]) { plated(T, sd * 40, hy + 8, -58, 26, 20, 40, k, { gx: 2, gy: 1, gz: 2, col: k.c2 }); fins(T, sd * 40, hy + 18.6, -58, 22, 34, 12, k); }
            const R = (a, b2, h) => { const L = Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]), n = Math.max(2, Math.round(L / 10)); for (let i = 0; i <= n; i++) { const q = lerp3(a, b2, i / n); rod(T, q, [q[0], q[1] + (h || 8), q[2]], .4, k.frame); } rod(T, [a[0], a[1] + (h || 8), a[2]], [b2[0], b2[1] + (h || 8), b2[2]], .45, k.acc, M.plain); };
            R([-60, hy - 2.5, -84], [60, hy - 2.5, -84]); R([-60, hy - 2.5, -84], [-60, hy - 2.5, 24]); R([60, hy - 2.5, -84], [60, hy - 2.5, 24]);
            // the boom: a plated girder out and up, a conveyor along it, a gantry walkway with railings
            const b0 = [0, hy + 4, 22], b1 = [0, hy + 64, 200];
            obox(T, b0, b1, 26, 14, k.frame, M.metal); obox(T, b0, b1, 30, 3, pcol(k), M.plain, { up: 8, len: .96 });
            obox(T, b0, b1, 14, 1.2, MC.rubber, M.plain, { up: 10.2, len: .9 }); for (let i = 1; i < 18; i++) { const q = lerp3(b0, b1, i / 18); mTube(T, [q[0] - 7, q[1] + 9.6, q[2]], [q[0] + 7, q[1] + 9.6, q[2]], .6, k.steel, M.metal, 6); }
            for (const sd of [-1, 1]) { const off = [sd * 17, 0, 0]; obox(T, add3(b0, off), add3(b1, off), 6, 1.4, k.frame, M.metal, { up: 9, len: .92 }); R(add3(add3(b0, off), [sd * 2.4, 9.6, 6]), add3(add3(b1, off), [sd * 2.4, 9.6, -10]), 7); }
            for (let i = 0; i < 6; i++) { const q = lerp3(b0, b1, .1 + i * .16); obox(T, [q[0], q[1] - 7, q[2]], [q[0], q[1] - 7, q[2] + 10], 22, 2, k.frame, M.metal); }
            for (const sd of [-1, 1]) { mTube(T, [sd * 10, hy + 40, -20], add3(lerp3(b0, b1, .55), [sd * 10, 8, 0]), .5, k.steel, M.metal, 4); }
            obox(T, [0, hy + 28, -6], [0, hy + 46, -20], 6, 6, k.frame, M.metal);
            // the bucket wheel: a rim, buckets with teeth, the drive housing, lamps
            const W = newBuf(), wr = 44;
            mTube(W, [-8, 0, 0], [8, 0, 0], wr * .82, k.frame, M.metal, 24); mTube(W, [-9, 0, 0], [9, 0, 0], 8, k.joint, M.metal, 12);
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); const Bk = newBuf(); plated(Bk, 0, 0, 0, 18, 10, 12, k, { gx: 1, gy: 1, gz: 1, col: i % 3 ? k.c2 : k.acc, t: .6 }); for (let t = 0; t < 4; t++) box(Bk, -6 + t * 4, 6.4, 5, 1.6, 3, 1.6, MC.dark, M.metal); xform(Bk, W, new THREE.Matrix4().makeTranslation(0, s * wr, c * wr).multiply(rotEuler(-a, 0, 0))); }
            for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; obox(W, [0, 0, 0], [0, Math.sin(a) * wr * .8, Math.cos(a) * wr * .8], 4, 2.4, k.frame, M.metal); }
            const WM = new THREE.Matrix4().makeTranslation(b1[0] + 20, b1[1] - 4, b1[2] + 6);
            plated(T, b1[0] + 6, b1[1] - 4, b1[2] - 2, 14, 18, 22, k, { gx: 1, gy: 1, gz: 2 }); eyes(T, [b1[0] + 6, b1[1] + 6, b1[2] + 9.4], [0, 0, 1], 1.8, k, 2);
            for (const x of [-12, 12]) lens(T, [x, b1[1] + 10, b1[2] - 8], [0, -.3, .95], 1.2, k, MC.lamp);
            // the counterweight boom behind, the discharge conveyor, the mast and uplink on the roof
            obox(T, [0, hy + 4, -80], [0, hy + 30, -150], 18, 10, k.frame, M.metal); plated(T, 0, hy + 30, -156, 50, 30, 30, k, { gx: 2, gy: 2, gz: 1, col: k.c2 }); mark(T, -14, hy + 30, -171.4, 9, k, "haz", Math.PI); mark(T, 14, hy + 30, -171.4, 9, k, "haz", Math.PI);
            obox(T, [-48, hy - 10, -60], [-110, hy - 30, -110], 8, 4, k.frame, M.metal); obox(T, [-48, hy - 10, -60], [-110, hy - 30, -110], 6, 1, MC.rubber, M.plain, { up: 2.4 });
            let h = hy - 2.5, r0 = 5; for (const L of [26, 20, 16]) { obox(T, [-36, h, -14], [-36, h + L, -14], r0 * 2, r0 * 2, pcol(k, 1), M.plain); h += L; r0 *= .78; } uplink(T, -36, h, -14, 3, k);
            box(T, 30, hy - 2.2, -60, 14, .6, 14, k.frame, M.metal);
            for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const q = [sd * 61, hy - 34 + i * 7.6, 10]; rod(T, [q[0], q[1], q[2] - 2.6], [q[0], q[1], q[2] + 2.6], .3, k.steel); }
            const HM = new THREE.Matrix4().makeTranslation(0, 56, -40).multiply(rotEuler(0, p.slew, 0)), wc = new THREE.Vector3(b1[0] + 20, b1[1] - 4, b1[2] + 6).applyMatrix4(HM), wx = new THREE.Vector3(1, 0, 0).transformDirection(HM);
            k.part("house", [0, 56, -40], (B) => xform(T, B, HM), { name: "house" });
            k.part("wheel", [wc.x, wc.y, wc.z], (B) => xform(W, B, HM.clone().multiply(WM)), { parent: "house", axis: [wx.x, wx.y, wx.z], r: 44, spin: 0 });
          });
        },
      },
      aerie: {
        name: "Aerie (sky carrier)", sub: "a flying carrier held up by six great fans: a flight deck you can stand on where Gyres and Broods land, a command island with the network's loudest voice, turrets and a drop bay underneath; shown on a flight stand", structure: true, machine: true,
        plan(r) { return { W: 300, D: 300, T: 3, storeys: [{ base: 0, H: 20 }], top: 230, noRoof: true, drop: 132, hover: r.range(138, 146), scheme: scheme(r), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          const y = p.hover;
          mSet(ctx, p, (B, k) => {
            const fd = y + 16, rail = (a, b) => { const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(L / 10)); for (let i = 0; i <= n; i++) { const q = lerp3(a, b, i / n); rod(B, q, [q[0], q[1] + 7, q[2]], .35, k.frame); } rod(B, [a[0], a[1] + 7, a[2]], [b[0], b[1] + 7, b[2]], .4, k.acc, M.plain); };
            // the hull: plated, a flight deck on top with landing circles and hazard edges, railings along the sides
            plated(B, 0, y, 0, 110, 30, 170, k, { gx: 5, gy: 2, gz: 7, noTop: true });
            plated(B, 0, fd - 1.5, 0, 112, 3, 172, k, { gx: 6, gy: 1, gz: 8, t: .6 });
            for (const [x, z] of [[-24, 50], [-24, -10], [-24, -64]]) { for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; box(B, x + Math.cos(a) * 15, fd + .1, z + Math.sin(a) * 15, 4, .25, 1.2, k.sten, M.plain, { rot: rotEuler(0, -a + PI2, 0), edge: false }); } mark(B, x, fd + .2, z, 9, k, "box", 0); }
            for (let i = 0; i < 12; i++) box(B, -54 + i * 9.8, fd + .1, 85.4, 4.4, .25, 1.4, i % 2 ? MC.dark : k.acc, M.plain, { edge: false });
            for (const sd of [-1, 1]) rail([sd * 55, fd, -84], [sd * 55, fd, 84]);
            // a parked Overseer and a Dart on the pads
            const parked = (x, z) => { const P = newBuf(); plated(P, 0, 3, 0, 9, 5, 12, k, { gx: 1, gy: 1, gz: 2, t: .4 }); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { obox(P, [sx * 3, 3, sz * 4], [sx * 11, 3.6, sz * 11], 1.4, 1, pcol(k, 1), M.plain); duct(P, [sx * 11, 4.4, sz * 11], 5.2, 1.4, pcol(k), "y", 12, .5); } eye(P, [0, 2.4, 6.4], [0, 0, 1], .9, k); for (const sx of [-1, 1]) obox(P, [sx * 3, .6, -5], [sx * 3, .6, 5], 1, 1.2, k.frame, M.metal); xform(P, B, new THREE.Matrix4().makeTranslation(x, fd, z)); };
            parked(-24, -10); dartBody(B, -24, fd + 3.4, 50, 1, k);
            // the command island: plated, lit slits, a great eye, the mast with the loudest uplink in the network
            plated(B, 34, fd + 22, -20, 30, 44, 60, k, { gx: 2, gy: 3, gz: 3 }); strip(B, 19.6, fd + 34, -20, .3, 1.2, 50, k); strip(B, 34, fd + 34, 10.4, 24, 1.2, .3, k);
            eyes(B, [34, fd + 30, 10.6], [0, 0, 1], 3.4, k, 3); plated(B, 34, fd + 45, -20, 32, 3, 62, k, { gx: 2, gy: 1, gz: 3, t: .6 }); rail([20, fd + 46.5, -50], [20, fd + 46.5, 10]);
            for (const o of [-2.6, 2.6]) rod(B, [19, fd, -40 + o], [19, fd + 47, -40 + o], .4, k.frame); for (let yy = fd + 3; yy < fd + 47; yy += 4) rod(B, [19, yy, -42.6], [19, yy, -37.4], .3, k.steel);
            let h = fd + 46.5, r0 = 6; for (const L of [24, 20, 16]) { obox(B, [40, h, -30], [40, h + L, -30], r0 * 2, r0 * 2, pcol(k, 1), M.plain); mTube(B, [40, h + L - 1.2, -30], [40, h + L + .5, -30], r0 * 1.2, k.frame, M.metal, 10); h += L; r0 *= .78; }
            uplink(B, 40, h + .4, -30, 4.2, k); lens(B, [40, h + 15, -30.6], [0, 1, 0], 1.2, k);
            const D = newBuf(); cyl(D, 0, 0, 0, 14, 15, 2.2, 20, pcol(k), M.plain); cyl(D, 0, 2.2, 0, 15, 12, 1.6, 20, pcol(k), M.plain); strip(D, 0, 1, 0, 30.4, .5, 2, k, MC.net); xform(D, B, new THREE.Matrix4().makeTranslation(30, fd + 49, -2));
            // six great fans on plated arms round the hull
            for (let i = 0; i < 6; i++) {
              const a = i / 6 * Math.PI * 2 + Math.PI / 6, fx = Math.cos(a) * 118, fz = Math.sin(a) * 112, ax = Math.cos(a) * 52, az = Math.sin(a) * Math.min(80, Math.abs(Math.sin(a)) * 90);
              obox(B, [ax * .9, y + 4, az * .9], [fx, y + 6, fz], 12, 8, pcol(k, 1), M.plain); ram(B, [ax * .9, y - 8, az * .9], [fx * .8, y + 2, fz * .8], 1.6, k);
              if (k.lose(.15)) continue;
              const F = newBuf(); duct(F, [0, 0, 0], 26, 8, pcol(k), "y", 30, 2.4); for (let j = 0; j < 4; j++) { const b = j / 4 * Math.PI * 2; rod(F, [0, 0, 0], [Math.cos(b) * 26, 0, Math.sin(b) * 26], .9, k.frame); } cyl(F, 0, -7, 0, 5, 4, 8, 12, k.frame, M.metal);
              strip(F, 26 * .7, 0, 26 * .7, 1.6, 1.6, 1.6, k, i % 2 ? MC.net : MC.eye);
              xform(F, B, new THREE.Matrix4().makeTranslation(fx, y + 6, fz));
              k.part("rotor", [fx, y + 7, fz], (B) => blades(B, [fx, y + 7, fz], 48, 3, k, "y", 5, a), { axis: [0, 1, 0], spin: 10 });
            }
            // underneath: two turrets, the drop bay glowing, sensor pods
            for (const z of [50, -50]) k.part("turret", [0, y - 16.4, z], (B) => { cyl(B, 0, y - 16.4, z, 8, 7, 3, 12, k.frame, M.metal); k.part("gun", [0, y - 20, z], (B) => { plated(B, 0, y - 21, z, 12, 6, 12, k, { gx: 1, gy: 1, gz: 1 }); for (const sd of [-1, 1]) mTube(B, [sd * 2.4, y - 21, z + (z > 0 ? 6 : -6)], [sd * 2.4, y - 21, z + (z > 0 ? 22 : -22)], .8, MC.dark); }, { pitch: 1 }); }, { muzzle: [2.4, y - 21, z + (z > 0 ? 22 : -22)], muzzle2: [-2.4, y - 21, z + (z > 0 ? 22 : -22)], shot: "gun", hang: true });
            const [gc, gm] = lit(k, C("#ffb070")); box(B, 0, y - 15.4, 0, 30, .6, 40, gc, gm, { edge: false }); for (const sd of [-1, 1]) obox(B, [sd * 17, y - 15, -22], [sd * 17, y - 15, 22], 3, 3, k.frame, M.metal);
            eyes(B, [0, y - 2, 86.2], [0, 0, 1], 4.4, k, 4); for (const sd of [-1, 1]) mark(B, sd * 55.4, y, 30, 14, k, "chev", sd * PI2);
            for (const sd of [-1, 1]) { mTube(B, [sd * 30, y, -86], [sd * 30, y, -100], 9, k.frame, M.metal, 14, 6); const [ec, em] = lit(k, C("#ffb070")); mTube(B, [sd * 30, y, -100], [sd * 30, y, -100.4], 5.4, ec, em, 14); }
          });
        },
      },
    };
    function vehiclePlan(type, r) {
      const V = VEH[type], military = type === "humvee", lay = r;
      const body = type === "taxi" ? lay.pick([C("#e8b818"), C("#f0c020"), C("#e0a810")]) : type === "tractor" ? lay.pick([C("#2e6a2e"), C("#b8261e"), C("#2a5a2a"), C("#c8a020"), C("#a8261e")]) : type === "police" ? C("#1e2228") : type === "ambulance" ? C("#ecebe6") : type === "firetruck" ? C("#a81e1a") : type === "schoolbus" ? C("#e0a820") : type === "citybus" ? lay.pick([C("#e6e4dc"), C("#2a5a8a"), C("#c8362a")]) : military ? lay.pick([C("#5a5e3e"), C("#8a7a58")]) : type === "technical" ? lay.pick([C("#b8a070"), C("#6a6e72"), C("#e8e6e0"), C("#5a5e3e")]) : lay.pick(PAINT);
      const accent = type === "police" ? C("#ecebe6") : type === "ambulance" ? C("#c8241e") : type === "citybus" ? lay.pick([C("#c8a040"), C("#e6e4dc")]) : type === "firetruck" ? C("#e8e6e0") : type === "schoolbus" ? C("#1e1e20") : null;
      const L = V.moto ? V.L : V.L * (type === "semi" || type === "citybus" ? 1 : lay.range(.96, 1.04)), W = V.W;
      const prof = V.moto ? null : V.prof(L), H = prof ? Math.max(...[...prof.upper, ...(prof.trailer || [])].map((q) => q[1])) : 22;
      return { W, D: L, T: 2, storeys: [{ base: 0, H: prof ? prof.lower.reduce((m, q) => Math.max(m, q[1]), 0) : 12 }], top: H + (prof && (prof.lightbar || prof.ladder || prof.cabsign) ? 4 : 0), vtype: type, L, prof, body, accent, seatCol: lay.pick(SEAT), wallCol: body, wallMat: M.plain, seed: lay.int(0, 1e9), cargo: lay.int(0, 3), noRoof: !!V.moto };
    }

    function drawVehicle(ctx, p, lvl) {
      const { r } = ctx, st = ctx.state, burnt = st === "r", dmg = st === "d", L = p.L, W = p.W, half = L / 2;
      const A = newBuf(), lay = ctx.lay("veh");
      const paint = burnt ? (x, y, z) => mix3(mul(RUST, .8), SOOT, .62 + .38 * Math.sin(x * .3 + z * .21 + y * .4) * Math.cos(z * .07)) : dmg ? (x, y, z) => mul(p.body, .82 + .1 * Math.sin(z * .15 + x)) : p.body;
      const metal = burnt ? SOOT : PAL.metalD, trim = burnt ? SOOT : C("#2a2a2c"), chrome = burnt ? RUST : C("#b8bcc0");
      if (VEH[p.vtype].moto) {
        if (lvl === 1) return;
        const lean = burnt ? 1.35 : dmg ? 1.2 : .1, M4 = new THREE.Matrix4().makeTranslation(0, burnt || dmg ? 3 : 0, 0).multiply(rotEuler(0, 0, lean));
        wheel(A, 0, 7, 14, 7, 3, 1, burnt, false); wheel(A, 0, 7, -14, 7, 3.4, 1, burnt, false);
        box(A, 0, 13, 0, 5, 6, 18, paint, M.plain); box(A, 0, 16.5, -6, 5.6, 2, 12, burnt ? SOOT : C("#2a2a2c"), M.plain); box(A, 0, 10, 2, 6, 6, 10, metal, M.metal);
        box(A, 0, 15, 12, 1.4, 12, 1.4, chrome, M.metal, { rot: rotEuler(-.4, 0, 0) }); box(A, 0, 20.5, 14.5, 16, 1, 1, chrome, M.metal); box(A, 0, 9, -10, 2, 2, 12, chrome, M.metal);
        xform(A, ctx.B, M4); return;
      }
      const P = p.prof, tw = 1.4, x1 = W / 2;
      // tilt: a burnt-out wreck sits on its rims and leans; a damaged one drops a corner on its flat tyre
      const sink = burnt ? P.r * .28 : 0, flatSide = dmg && lay.chance(.5) ? lay.pick([-1, 1]) : 0;
      const M4 = new THREE.Matrix4().makeTranslation(0, -sink, 0).multiply(rotEuler(burnt ? lay.range(-.03, .03) : 0, burnt ? lay.range(-.06, .06) : 0, burnt ? lay.range(-.05, .05) : flatSide * .03));
      if (lvl === 0) {
        // the lower body as a shell: floor pan, solid nose and tail, side walls, end walls
        ex(A, yr(P.lower, -1e9, P.floor), -x1, x1, paint, M.plain);
        for (const [z0, z1] of P.solid) ex(A, zr(P.lower, z0, z1), -x1, x1, paint, M.plain);
        for (const s of [-1, 1]) ex(A, P.lower, s > 0 ? x1 - tw : -x1, s > 0 ? x1 : -x1 + tw, paint, M.plain);
        for (const z of [half - tw, -half]) ex(A, zr(P.lower, z, z + tw), -x1, x1, paint, M.plain);
        if (P.bed) ex(A, zr(P.lower, P.bed[1], P.bed[1] + 1.6), -x1, x1, paint, M.plain); // the cab's back wall at the bed
        // wheels, bumpers, lights, grille, a stripe down the side
        P.wheels.forEach((z, i) => { const wr = P.wr ? P.wr[i] : P.r, ww = P.wr ? (i ? 5 : 8) : 4.4; for (const s of [-1, 1]) wheel(A, s * (x1 - 1.6 + (P.wr ? ww / 2 : 0)), wr, z, wr, ww, s, burnt, s === flatSide && i === 0); });
        if (P.stack && !burnt) { cyl(A, x1 - 6, 24, 18, 1.4, 1.4, 22, 8, PAL.metalD, M.metal); for (const s of [-1, 1]) box(A, s * (x1 + 2), P.wr[0] * 2 + 1, P.wheels[0], 9, 1.4, P.wr[0] * 2 + 4, paint, M.plain); }
        box(A, 0, P.r * .9, half + .6, W - 2, 3, 2.4, trim, M.plain); box(A, 0, P.r * .9, -half - .6, W - 2, 3, 2.4, trim, M.plain);
        const fy = P.lower.find((q) => q[0] === half) ? P.lower.filter((q) => q[0] >= half - .1).reduce((m, q) => Math.max(m, q[1]), 0) - 2.4 : 10;
        if (!burnt) for (const s of [-1, 1]) { box(A, s * (x1 - 4), fy, half + .3, 5, 2.4, .6, C("#e8e4c8"), M.glass); box(A, s * (x1 - 3.5), fy, -half - .3, 4, 2.4, .6, C("#a01e1a"), M.glass); }
        box(A, 0, fy - 1.5, half + .3, W * .4, 3, .6, trim, M.metal);
        if (p.accent && !burnt) for (const s of [-1, 1]) box(A, s * (x1 + .05), (P.floor + P.lower[2][1]) / 2 + 2, 0, .3, 2.6, L - 8, p.accent, M.plain, { edge: false });
        // damage: dents and scrapes, a door hanging open
        if (dmg) { for (let i = 0; i < 4; i++) box(A, r.pick([-1, 1]) * (x1 + .05), r.range(P.floor, P.lower[2][1]), r.range(-half + 6, half - 6), .4, r.range(2, 4), r.range(3, 8), mul(p.body, .55), M.metal, { edge: false }); if (lay.chance(.5)) { const dz = r.range(-6, 10), s = lay.pick([-1, 1]); box(A, s * (x1 + 6.5), P.floor + 5, dz + 10.3, 1.2, 9, 15, paint, M.plain, { rot: rotEuler(0, -s * .9, 0) }); } }
        // inside: seats and load by kind
        const fl = P.floor, sc = burnt ? C("#3a2e26") : p.seatCol, inner = W - 2 * tw - 1;
        const kind = p.vtype;
        if (["sedan", "suv", "police", "pickup", "technical", "humvee"].includes(kind)) {
          const cab = P.upper.map((q) => q[0]), cz0 = Math.min(...cab), cz1 = Math.max(...cab);
          for (const s of [-1, 1]) seat(A, s * inner / 4, fl, cz1 - 10, inner / 2 - 2, sc);
          if (cz1 - cz0 > 28) seat(A, 0, fl, cz0 + 7, inner - 2, sc);
          box(A, 0, fl + 7, cz1 - 3, inner, 4, 3, C("#2a2a2c"), M.plain); cyl(A, -inner / 4, fl + 8, cz1 - 6, 2.4, 2.4, .6, 10, C("#1e1e20"), M.plain);
          if (kind === "police") box(A, 0, fl + 9, cz0 + 13, inner, 7, .4, C("#9aa4ae"), M.metal);
        }
        if (P.bed) { // the bed: a few things thrown in, or the technical's gun on its post
          box(A, 0, fl, (P.bed[0] + P.bed[1]) / 2, inner, .6, P.bed[1] - P.bed[0] - 2, C("#3a3a3c"), M.metal);
          if (P.gun && !burnt) { cyl(A, 0, fl, P.bed[0] + 18, 1.2, 1.2, 14, 8, PAL.metalD, M.metal); box(A, 0, fl + 16, P.bed[0] + 22, 3, 3, 14, C("#2a2a2c"), M.metal); box(A, 0, fl + 16.5, P.bed[0] + 34, 1, 1, 12, C("#1a1a1c"), M.metal); box(A, 0, fl + 19, P.bed[0] + 20, 7, 4, 1, PAL.metalD, M.metal); }
          else for (let i = 0; i < p.cargo; i++) box(A, lay.range(-inner / 3, inner / 3), fl + 3, lay.range(P.bed[0] + 6, P.bed[1] - 6), 7, 6, 7, lay.pick([C("#6a5a3e"), C("#3a5a3a"), C("#2a4a6a")]), M.wood);
        }
        if (P.armour && !burnt) { for (const s of [-1, 1]) box(A, s * (x1 + .8), P.floor + 6, 4, 1.2, 9, 30, RUST, M.metal, { rot: rotEuler(0, 0, s * .08) }); box(A, 0, P.lower[2][1] + 2, half + 2.5, W + 2, 6, 1.6, PAL.metalD, M.metal); for (let i = 0; i < 5; i++) box(A, -W / 2 + 4 + i * (W - 8) / 4, P.lower[2][1] + 6, half + 3.5, 1.2, 4, 1.2, chrome, M.metal); }
        if (kind === "van" || kind === "boxtruck" || kind === "semi") for (let i = 0; i < 4 + p.cargo * 2; i++) { const z = lay.range(-half + 12, (P.glassFrom ?? half) - 16); box(A, lay.range(-inner / 3, inner / 3), fl + 4, z, lay.range(7, 11), lay.range(6, 9), lay.range(7, 11), lay.pick([C("#8a6a48"), C("#a08060"), C("#6a5a3e")]), M.wood); }
        if (P.glassFrom != null && kind !== "semi") { for (const s of [-1, 1]) seat(A, s * inner / 4, fl, P.glassFrom + 8, inner / 2 - 2, sc); box(A, 0, fl + 7, P.glassFrom + 14, inner, 4, 3, C("#2a2a2c"), M.plain); }
        if (kind === "semi") { for (const s of [-1, 1]) seat(A, s * inner / 4, fl, half - 24, inner / 2 - 2, sc); for (const zz of [P.trailer[0][0] - 1]) box(A, 0, P.floor + 18, zz, W, 36, 1.4, paint, M.plain); }
        if (kind === "ambulance") { box(A, -inner / 4, fl + 5, -half + 26, 10, 3, 30, C("#e0e0d8"), M.plain); box(A, -inner / 4, fl + 2, -half + 26, 8, 4, 26, PAL.metal, M.metal); box(A, inner / 2 - 4, fl + 10, -half + 30, 7, 20, 40, C("#d8d4c8"), M.plain); seat(A, inner / 2 - 6, fl, -half + 10, 6, C("#2e3a4e")); }
        if (kind === "firetruck") { for (const s of [-1, 1]) for (let i = 0; i < 4; i++) box(A, s * (x1 + .2), P.floor + 10, -half + 20 + i * 22, .6, 12, 18, C("#c8c8c0"), M.metal, { edge: false }); cyl(A, 0, fl, -half + 22, 8, 8, 10, 12, C("#c8c8c0"), M.metal); for (const s of [-1, 1]) seat(A, s * inner / 4, fl, half - 20, inner / 2 - 2, sc); }
        if (P.rows) { // bus seats: pairs either side of the aisle, a driver's seat by the door
          const z0 = -half + 12, z1 = half - 34, n = P.rows;
          for (let i = 0; i < n; i++) for (const s of [-1, 1]) { if (burnt && r.chance(.3)) continue; seat(A, s * (inner / 2 - 6), fl, z0 + (z1 - z0) * i / (n - 1), 11, burnt ? sc : kind === "schoolbus" ? C("#3a4a6a") : sc); }
          seat(A, -inner / 4, fl, half - 18, 9, sc); box(A, -inner / 4, fl + 9, half - 10, 10, 3, 3, C("#2a2a2c"), M.plain);
          if (kind === "citybus") for (const dz of [half - 14, -10]) box(A, x1 + .05, P.floor + 8, dz, .4, 16, 12, C("#3a4048"), M.glass, { edge: false });
        }
        if (P.turret && !burnt) { cyl(A, 0, P.lower[2][1], -4, 9, 9, 3, 12, p.body, M.plain); }
      } else {
        // the glass and roof, with pillars; a burnt one keeps its pillars and a sagging roof
        const top = Math.max(...P.upper.map((q) => q[1])), x2 = x1 - .5, gl = burnt ? null : GLASS;
        const parts = [];
        if (P.band) { // a bus: the window band between pillars, solid panel above and below
          const [b0, b1] = P.band, under = yr(P.upper, -1e9, b0), over = yr(P.upper, b1, 1e9), mid = yr(P.upper, b0, b1);
          ex(A, under, -x1, x1, paint, M.plain); ex(A, over, -x1, x1, paint, M.plain);
          if (gl) ex(A, mid, -x2, x2, gl, M.glass);
          for (let z = -L / 2 + 2; z < L / 2 - 2; z += 18) for (const s of [-1, 1]) box(A, s * (x1 - .6), (b0 + b1) / 2, z, 1.4, b1 - b0, 2, paint, M.plain);
          if (p.accent && !burnt) for (const s of [-1, 1]) box(A, s * (x1 + .05), b0 - 1.5, 0, .3, 2, L - 6, p.accent, M.plain, { edge: false });
        } else if (P.glassFrom != null) { // a van or truck: glass at the cab, panel behind
          ex(A, zr(P.upper, -1e9, P.glassFrom), -x1, x1, paint, M.plain);
          const cab = zr(P.upper, P.glassFrom, 1e9);
          if (gl) ex(A, yr(cab, -1e9, top - 1.6), -x2, x2, gl, M.glass); else { ex(A, yr(cab, top - 2, 1e9), -x1, x1, paint, M.plain); }
          ex(A, yr(cab, top - 1.6, 1e9), -x1, x1, paint, M.plain);
          if (p.vtype === "ambulance" && !burnt) for (const s of [-1, 1]) { box(A, s * (x1 + .05), 30, -10, .3, 5, 50, p.accent, M.plain, { edge: false }); box(A, s * (x1 + .05), 34, -10, .3, 12, 3, p.accent, M.plain, { edge: false }); box(A, s * (x1 + .05), 34, -10, .3, 3, 12, p.accent, M.plain, { edge: false }); }
        } else {
          if (gl) ex(A, yr(P.upper, -1e9, top - 1.4), -x2, x2, gl, M.glass);
          ex(A, yr(P.upper, top - 1.4, 1e9), -x1 + .3, x1 - .3, burnt ? SOOT : paint, M.plain);
          // pillars at the windscreen and the back
          const zs = P.upper.map((q) => q[0]), zf = Math.max(...zs), zb = Math.min(...zs);
          for (const s of [-1, 1]) for (const [za, zb2] of [[zf - 9, zf], [zb, zb + 6]]) ex(A, zr(P.upper, za, zb2), s > 0 ? x1 - 1.4 : -x1, s > 0 ? x1 : -x1 + 1.4, paint, M.plain);
          if (P.rails && !burnt) for (const s of [-1, 1]) box(A, s * (x1 - 3), top + .8, (zf + zb) / 2 - 4, 1, 1, zf - zb - 10, chrome, M.metal);
        }
        if (P.trailer) { ex(A, P.trailer, -x1, x1, burnt ? paint : C("#d8d6d0"), M.plain); if (!burnt) box(A, x1 + .05, 46, -L / 2 + 110, .3, 14, 90, lay.pick([C("#1e3a6a"), C("#8a1e1e"), C("#2e6a3e")]), M.plain, { edge: false }); }
        if (P.cabsign && !burnt) { box(A, 0, top + 2.2, -4, W * .45, 4, 4, C("#f0f0e8"), M.screen); box(A, 0, top + .4, -4, W * .5, .8, 5, DARK, M.plain); }
        if (P.lightbar && !burnt) { box(A, 0, top + 1.2, -2, W * .6, 2.2, 4, C("#2a2a2c"), M.plain); box(A, -W * .15, top + 2.6, -2, W * .28, 1.2, 3.6, C("#c8241e"), M.glass); box(A, W * .15, top + 2.6, -2, W * .28, 1.2, 3.6, C("#2a4ac8"), M.glass); }
        if (P.lights && !burnt) for (const s of [-1, 1]) box(A, s * (x1 - 3), top + 1, (P.glassFrom ?? half - 10) - 2, 4, 2, 3, s < 0 ? C("#c8241e") : C("#e8a020"), M.glass);
        if (P.ladder) { const ly = top + 3; for (const s of [-1, 1]) box(A, s * 8, ly, -6, 1.4, 1.4, L * .8, burnt ? SOOT : C("#c8c8c0"), M.metal); for (let z = -L * .4; z < L * .4; z += 6) box(A, 0, ly, z - 6, 16, 1, 1, burnt ? SOOT : C("#c8c8c0"), M.metal); }
        if (P.turret && !burnt) { cyl(A, 0, top, -4, 7, 7, 4, 12, p.body, M.plain); box(A, 0, top + 6, 4, 2, 2, 16, C("#1e1e20"), M.metal); box(A, 0, top + 8, -2, 10, 6, 1, p.body, M.plain); }
      }
      xform(A, ctx.B, M4);
      if (burnt && lvl === 0) ctx.soot.push([0, 0, 10, 30]);
    }
    const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const VEH_TYPES = Object.fromEntries(Object.entries(VEH).map(([k, V]) => [k, {
      name: V.name, sub: V.sub, structure: true, vehicle: true, fixed: true,
      plan(r) { return vehiclePlan(k, r); },
      floors() { return V.moto ? ["Bike"] : ["Cabin", "Roof"]; },
      draw(ctx, p, lvl) { drawVehicle(ctx, p, lvl); },
    }]));

    const TYPES = {
      shop: {
        name: "Corner shop", sub: "shopfront, flats over",
        plan(r) {
          const W = SQ * r.pick([3, 3.5, 4, 4]), D = SQ * r.pick([4, 4.5, 5]), ups = r.pick([1, 2, 2]), brick = r.chance(.7);
          const storeys = [{ base: 0, H: 58 }]; for (let i = 0; i < ups; i++) storeys.push({ base: 58 + 48 * i, H: 48 });
          const p = {
            W, D, T: 3, storeys, top: 58 + 48 * ups, brick, corner: r.chance(.45), awning: r.chance(.6),
            wallCol: brick ? r.pick(PAL.brick) : r.pick(PAL.render), wallMat: brick ? M.brick : M.plain, sign: r.pick(PAL.sign), aw: r.pick(PAL.awning),
            frameCol: r.pick(PAL.frame), doorCol: r.pick(PAL.door), shopFrame: r.pick([C("#2a2c2e"), C("#5a2a22"), C("#2e4a3e"), C("#d9d1bd")]),
            doorAt: r.pick(["left", "mid", "right"]), letters: r.int(4, 8), frontRise: r.pick([0, 0, 6, 10]), seed: r.int(0, 1e9),
          };
          return p;
        },
        floors(p) { return ["Ground floor", ...p.storeys.slice(1).map((_, i) => ["First floor", "Second floor"][i]), "Roof"]; },
        draw(ctx, p, lvl) {
          const { r } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length;
          if (lvl === n) { flatRoof(ctx, p.top, { parapet: 6, frontRise: p.frontRise, ac: ctx.lay("ac").int(1, 2) }); return; }
          const st = p.storeys[lvl], ops = {};
          const hole = [-p.W / 2 + p.T, -p.D / 2 + p.T, -p.W / 2 + p.T + 11, -p.D / 2 + p.T + 50];
          if (lvl === 0) {
            // the shopfront: glass across the front, the door to one side
            const L = S.front.L, dw = 17, ds = p.doorAt === "left" ? 5 : p.doorAt === "right" ? L - 5 - dw : L / 2 - dw / 2;
            const front = [{ s0: ds, s1: ds + dw, y0: 3, y1: 40, kind: "door", step: true, doorCol: p.shopFrame }];
            const segs = p.doorAt === "mid" ? [[4, ds - 3], [ds + dw + 3, L - 4]] : p.doorAt === "left" ? [[ds + dw + 3, L - 4]] : [[4, ds - 3]];
            segs.forEach(([a, b]) => b - a > 8 && front.push({ s0: a, s1: b, y0: 9, y1: 42, kind: "shop", frameCol: p.shopFrame }));
            ops.front = front;
            ops.left = p.corner ? [{ s0: 10, s1: S.left.L * .55, y0: 9, y1: 42, kind: "shop", frameCol: p.shopFrame }] : bays(S.left.L, 30, 12).slice(0, 1).map((c) => win(c, 13, 16, 24));
            ops.right = [];
            ops.back = [{ s0: S.back.L - 26, s1: S.back.L - 10, y0: 3, y1: 38, kind: "door", step: true }, ...bays(S.back.L - 30, 26, 10).slice(0, 1).map((c) => win(c, 12, 18, 20))];
          } else {
            ops.front = bays(S.front.L, 25, 9).map((c) => win(c, 13, 13, 25));
            ops.back = bays(S.back.L, 32, 12).map((c) => win(c, 12, 15, 22));
            ops.left = bays(S.left.L, 34, 14).map((c) => win(c, 12, 15, 22));
            ops.right = p.corner ? [] : bays(S.right.L, 40, 18).slice(0, 1).map((c) => win(c, 11, 15, 22));
          }
          this.finishStorey(ctx, p, S, st, lvl, ops, hole);
          if (lvl === 0) {
            const L = S.front.L, Hs = st.H;
            if (!ctx.brk || ctx.brk(0, p.D / 2) > Hs) {
              // the sign over the shop, with raised letters
              wb(ctx.B, S.front, 1.5, L - 1.5, Hs - 13, Hs - 3.5, -1.8, 0, ctx.tintCol(p.sign), M.plain);
              const lw = 3.4, gap = 1.3, total = p.letters * (lw + gap) - gap, s0 = L / 2 - total / 2;
              for (let i = 0; i < p.letters; i++) if (ctx.state === "i" || r.chance(.75)) wb(ctx.B, S.front, s0 + i * (lw + gap), s0 + i * (lw + gap) + lw, Hs - 11, Hs - 5.5, -2.4, -1.8, C("#e8e2d0"), M.plain, { spin: ctx.state === "i" ? 0 : r.range(-.25, .25) });
              if (p.awning && ctx.state !== "r") {
                const strips = Math.max(3, Math.round((L - 6) / 4.2)), sw = (L - 6) / strips;
                for (let i = 0; i < strips; i++) {
                  if (ctx.state === "d" && r.chance(.15)) continue;
                  wb(ctx.B, S.front, 3 + i * sw, 3 + (i + 1) * sw, Hs - 16, Hs - 15.4, -16, 0, p.aw[i % 2], M.plain, { tip: ctx.state === "d" ? r.range(.3, .55) : .38 });
                }
              }
            }
          }
          INSIDE.shop(ctx, p, lvl, lvl === 0 ? 3 : st.base);
        },
        finishStorey(ctx, p, S, st, lvl, ops, hole) { finishStorey(ctx, p, S, st, lvl, ops, hole); },
      },
      apartment: {
        name: "Apartment block", sub: "flats, stairs, roof tank",
        plan(r) {
          const W = SQ * r.pick([4, 5, 5, 6]), D = SQ * r.pick([4, 4.5, 5]), n = r.int(3, 5), brick = r.chance(.6);
          const storeys = [{ base: 0, H: 50 }]; for (let i = 1; i < n; i++) storeys.push({ base: 50 + 46 * (i - 1), H: 46 });
          return {
            W, D, T: 3, storeys, top: 50 + 46 * (n - 1), brick, wallCol: brick ? r.pick(PAL.brick) : r.pick(PAL.concrete), wallMat: brick ? M.brick : M.concrete,
            frameCol: r.pick(PAL.frame), doorCol: r.pick(PAL.door), escape: brick, balconies: !brick, tank: r.chance(.6), seed: r.int(0, 1e9),
          };
        },
        floors(p) { return ["Ground floor", ...p.storeys.slice(1).map((_, i) => ["First floor", "Second floor", "Third floor", "Fourth floor"][i]), "Roof"]; },
        draw(ctx, p, lvl) {
          const { r } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length;
          if (lvl === n) { flatRoof(ctx, p.top, { parapet: 7, tank: p.tank, bulkhead: !p.tank, ac: ctx.lay("ac").int(0, 2) }); return; }
          const st = p.storeys[lvl], ops = {};
          const hole = [-p.W / 2 + p.T, -p.D / 2 + p.T, -p.W / 2 + p.T + 11, -p.D / 2 + p.T + 50];
          const fb = bays(S.front.L, 24, 8);
          ops.front = fb.map((c, i) => {
            if (lvl === 0 && i === Math.floor(fb.length / 2)) return { s0: c - 9, s1: c + 9, y0: 3, y1: 40, kind: "door", step: true, canopy: true };
            if (lvl > 0 && p.balconies && i % 2 === 1) return { s0: c - 7, s1: c + 7, y0: 1, y1: 36, kind: "door", frameCol: p.frameCol, doorCol: C("#2a3036") };
            return win(c, 12, lvl === 0 ? 16 : 12, 24);
          });
          ops.back = bays(S.back.L, 26, 10).map((c) => win(c, 12, 13, 22));
          ops.left = bays(S.left.L, 30, 12).map((c) => win(c, 11, 13, 22));
          ops.right = bays(S.right.L, 30, 12).map((c) => win(c, 11, 13, 22));
          finishStorey(ctx, p, S, st, lvl, ops, hole);
          const B = ctx.B;
          if (lvl > 0 && p.balconies) fb.forEach((c, i) => {
            if (i % 2 !== 1) return;
            const w = at(S.front, c, -6); if (ctx.brk && ctx.brk(w[0], w[1]) < st.base + 4) return;
            const drop = ctx.state === "r" ? r.range(.1, .4) : 0;
            wb(B, S.front, c - 11, c + 11, st.base - 1.8, st.base, -12, 0, ctx.trimCol, M.concrete, { tip: drop });
            if (ctx.state !== "r" || r.chance(.4)) {
              wb(B, S.front, c - 11, c + 11, st.base + 9, st.base + 9.8, -12, -11.2, PAL.metalD, M.metal, { tip: drop });
              for (let s = c - 10.5; s <= c + 10.6; s += 3) wb(B, S.front, s - .25, s + .25, st.base, st.base + 9, -11.9, -11.4, PAL.metalD, M.metal, { tip: drop });
              for (const e of [c - 11, c + 10.4]) wb(B, S.front, e, e + .6, st.base + 9, st.base + 9.8, -12, 0, PAL.metalD, M.metal);
            }
          });
          // a fire escape down the right side
          if (p.escape && lvl > 0) {
            const Sr = S.right, c = Sr.L / 2, y = st.base;
            const w = at(Sr, c, -6);
            if (!ctx.brk || ctx.brk(w[0], w[1]) > y + 6) {
              wb(B, Sr, c - 17, c + 17, y - 1.2, y - .4, -13, 0, PAL.metalD, M.metal);
              wb(B, Sr, c - 17, c + 17, y + 9, y + 9.6, -13, -12.4, PAL.metalD, M.metal);
              for (let s = c - 16.7; s <= c + 16.8; s += 3.4) wb(B, Sr, s - .2, s + .2, y - .4, y + 9, -12.9, -12.5, PAL.metalD, M.metal);
              for (const e of [c - 17, c + 16.4]) wb(B, Sr, e, e + .6, y - .4, y + 9.6, -13, 0, PAL.metalD, M.metal);
              // the flight down to the landing below
              const h = lvl === 1 ? y - 2 : 46, len = 30, ang = Math.atan2(h, len);
              const sc = c - 2, mid = y - h / 2;
              if (ctx.state !== "r" || r.chance(.6)) wb(B, Sr, sc - len / 2, sc + len / 2, mid - .5, mid + .5, -11, -4, PAL.metalD, M.siding, { spin: lvl % 2 ? ang : -ang, edge: true });
            }
          }
          INSIDE.apartment(ctx, p, lvl, lvl === 0 ? 3 : st.base);
        },
      },
      warehouse: {
        name: "Warehouse", sub: "roller doors, open floor",
        plan(r) {
          const W = SQ * r.pick([6, 7, 8]), D = SQ * r.pick([5, 6]);
          return {
            W, D, T: 3, storeys: [{ base: 0, H: 70, bands: true }], top: 70, wallCol: r.pick(PAL.corr), plinth: r.pick(PAL.concrete), wallMat: M.corr,
            frameCol: C("#3a3d40"), doorCol: r.pick(PAL.door), doors: r.int(1, 2), roofCol: r.pick([C("#8a8f94"), C("#7a6a5a"), C("#6e7a6a")]), pitch: r.range(.18, .28), seed: r.int(0, 1e9), ruin: [.75, .95, .35, .6], sheets: .45,
          };
        },
        floors() { return ["Floor", "Roof"]; },
        draw(ctx, p, lvl) {
          const { r, B } = ctx, S = sidesOf(p.W, p.D, p.T), st = p.storeys[0];
          if (lvl === 1) {
            // trusses under the roof, then the corrugated roof itself
            const rise = (p.D / 2) * p.pitch, n = Math.round(p.W / 30);
            for (let i = 1; i < n; i++) {
              const x = -p.W / 2 + p.W * i / n; if (ctx.brk && ctx.brk(x, 0) < p.top - 4) continue;
              box(B, x, p.top + .8, 0, 1.6, 1.6, p.D - 6, PAL.metalD, M.metal);
              for (const sd of [1, -1]) box(B, x, p.top + rise / 2, sd * p.D / 4, 1.6, 1.6, Math.hypot(p.D / 2, rise), PAL.metalD, M.metal, { rot: rotEuler(sd * Math.atan2(rise, p.D / 2), 0, 0) });
              box(B, x, p.top + rise / 2, 0, 1.2, rise, 1.2, PAL.metalD, M.metal);
            }
            gableRoof({ ...ctx, roofCol: p.roofCol }, p.top, p.pitch, { overhang: 2.5, mat: M.corr, col: p.roofCol, gableCol: p.wallCol, gableMat: M.corr, missing: ctx.state === "d" ? .12 : 0, keepBelow: 14 });
            if (ctx.state === "i" || ctx.state === "d") for (let i = 0; i < 2; i++) { const x = ctx.lay("sky" + i).range(-p.W / 3, p.W / 3); box(B, x, p.top + (p.D / 2) * p.pitch * .5 + 1.5, -p.D / 4, 14, 1.5, 18, C("#9fb4c0"), M.glass, { rot: rotEuler(-Math.atan2((p.D / 2) * p.pitch, p.D / 2), 0, 0) }); }
            return;
          }
          st.bands = [{ y0: 0, y1: 14, col: p.plinth, mat: M.concrete }, { y0: 14, y1: st.H, col: p.wallCol, mat: M.corr }];
          const ops = {}, L = S.front.L;
          const rw = 40, spots = p.doors === 1 ? [L * .35] : [L * .25, L * .62];
          ops.front = [...spots.map((c) => ({ s0: c - rw / 2, s1: c + rw / 2, y0: 0, y1: 50, kind: "roller", doorCol: p.wallCol })),
            { s0: L - 22, s1: L - 6, y0: 2, y1: 38, kind: "door", step: true, doorCol: p.doorCol }];
          const hi = (Ln) => bays(Ln, 30, 12).map((c) => win(c, 18, 54, 9));
          ops.left = hi(S.left.L); ops.right = hi(S.right.L);
          ops.back = [...hi(S.back.L).slice(1), { s0: 8, s1: 24, y0: 2, y1: 38, kind: "door", step: true, doorCol: p.doorCol }];
          finishStorey(ctx, { ...p, course: false, noPartition: true, floorCol: PAL.floorCon, floorMat: M.concrete }, S, st, 0, ops, null);
          // the steel frame inside the sheeting
          const nb = Math.round(p.W / 30);
          for (let i = 1; i < nb; i++) { const x = -p.W / 2 + p.W * i / nb; for (const sd of [1, -1]) if (!ctx.brk || ctx.brk(x, sd * p.D / 2) > st.H * .5 || r.chance(.5)) box(ctx.B, x, st.H / 2, sd * (p.D / 2 - p.T - 1.3), 2.4, st.H, 2.4, PAL.metalD, M.metal); }
          // inside: pallets of goods, drums, a small office in the corner
          ctx.looted = ctx.state !== "i";
          const cells = []; for (let x = -p.W / 2 + 22; x < p.W / 2 - 22; x += 26) for (let z = -p.D / 2 + 20; z < p.D / 2 - 30; z += 22) cells.push([x, z]);
          cells.forEach(([x, z]) => { const L = ctx.lay("cell" + x.toFixed(0) + z.toFixed(0)), has = L.chance(.45), turn = L.pick([0, Math.PI / 2]) + L.range(-.08, .08); if (has && (!ctx.brk || ctx.brk(x, z) > 20)) pallet(ctx, x, 1.5, z, turn); });
          { const L = ctx.lay("drums"); for (let i = 0, n = L.int(2, 5); i < n; i++) { const x = L.range(-p.W / 2 + 8, p.W / 2 - 8), z = -p.D / 2 + 7 + L.range(0, 4); drum(ctx, x, 1.5, z); } }
          const ow = 40, od = 30, ox = p.W / 2 - p.T - ow / 2, oz = -p.D / 2 + p.T + od / 2;
          const Sx = { L: ow, O: [ox - ow / 2, oz + od / 2], A: [1, 0], I: [0, -1] };
          const save = { wallCol: ctx.wallCol, wallMat: ctx.wallMat, course: ctx.course, T: ctx.T };
          Object.assign(ctx, { wallCol: ctx.plasterCol, wallMat: M.plain, course: false, T: 1.4 });
          storeyWalls(ctx, Sx, { base: 1.5, H: 32 }, [{ s0: 4, s1: 18, y0: 0, y1: 28, kind: "door", doorCol: p.doorCol }, { s0: 24, s1: 36, y0: 12, y1: 26, kind: "window" }]);
          const Sy = { L: od - 1.4, O: [ox - ow / 2, oz - od / 2], A: [0, 1], I: [1, 0] };
          storeyWalls(ctx, Sy, { base: 1.5, H: 32 }, [{ s0: 8, s1: 20, y0: 12, y1: 26, kind: "window" }]);
          Object.assign(ctx, save);
          if (!ctx.brk || ctx.brk(ox, oz) > 36) box(ctx.B, ox, 34.3, oz, ow, 1.2, od, PAL.concreteD, M.concrete);
          INSIDE.warehouse(ctx, p, 0, 1.5);
        },
      },
      gasstation: {
        name: "Gas station", sub: "kiosk, pumps, canopy",
        plan(r) {
          const W = SQ * r.pick([3, 3.5]), D = SQ * r.pick([2.5, 3]), brick = r.chance(.4);
          const brand = r.pick([["#c8302a", "#f0e8d8"], ["#2a5aa8", "#f0d040"], ["#2e7a3e", "#f0e8d8"], ["#e07a20", "#2a2a2a"], ["#5a2a7a", "#f0e8d8"]]).map(C);
          return {
            W, D, T: 3, storeys: [{ base: 0, H: 44 }], top: 44, brick, wallCol: brick ? r.pick(PAL.brick) : r.pick(PAL.render), wallMat: brick ? M.brick : M.plain,
            frameCol: C("#2a2c2e"), doorCol: C("#2a2c2e"), brand, cw: SQ * r.pick([5, 5.5, 6]), cd: SQ * r.pick([2.5, 3]), cx: r.range(-10, 10), noPartition: true, seed: r.int(0, 1e9),
            floorCol: PAL.tile, floorMat: M.tile,
          };
        },
        floors() { return ["Shop and pumps", "Roof and canopy"]; },
        draw(ctx, p, lvl) {
          const { r, B } = ctx, S = sidesOf(p.W, p.D, p.T), st = p.storeys[0];
          const cz0 = p.D / 2 + 12, cz1 = cz0 + p.cd, czm = (cz0 + cz1) / 2;
          if (lvl === 1) {
            flatRoof(ctx, p.top, { parapet: 4, ac: 1 });
            // the canopy over the pumps
            const H = 56, cols = [[-p.cw / 2 + 7, cz0 + 6], [p.cw / 2 - 7, cz0 + 6], [-p.cw / 2 + 7, cz1 - 6], [p.cw / 2 - 7, cz1 - 6]];
            const fall = ctx.state === "r" ? r.pick([-1, 1]) : 0, tilt = fall;
            cols.forEach(([x, z]) => {
              const broken = fall && Math.sign(z - czm) === fall;
              const h = broken ? r.range(8, 22) : H;
              box(B, p.cx + x, h / 2, z, 4, h, 4, C("#e8e6de"), M.plain);
            });
            // a fallen canopy hinges on its standing columns and drops its far edge onto the broken ones
            const low = 14, ang = fall ? Math.asin(Math.min(.9, (H - low) / p.cd)) : 0;
            const rot = fall ? rotEuler(fall * ang, 0, r.range(-.06, .06)) : null;
            const zStand = fall ? (fall > 0 ? cz0 : cz1) : czm;
            const cy = fall ? (H + 2 + low) / 2 : H + 2, czc = fall ? zStand + fall * p.cd * Math.cos(ang) / 2 : czm;
            box(B, p.cx, cy, czc, p.cw, 3.2, p.cd, C("#dedcd4"), M.plain, { rot });
            const fy = cy + 1.6, edges = [[0, p.cd / 2, p.cw + 1, 1.2], [0, -p.cd / 2, p.cw + 1, 1.2], [p.cw / 2, 0, 1.2, p.cd], [-p.cw / 2, 0, 1.2, p.cd]];
            edges.forEach(([dx, dz, w, d], i) => {
              if (ctx.state === "d" && r.chance(.25)) return;
              const v = new THREE.Vector3(dx, 0, dz); if (rot) v.applyMatrix4(rot);
              box(B, p.cx + v.x, fy + v.y, czc + v.z, w, 6, d, p.brand[0], M.plain, { rot });
              const v2 = new THREE.Vector3(dx * 1.02, -2, dz * 1.02); if (rot) v2.applyMatrix4(rot);
              if (i < 2) box(B, p.cx + v2.x, fy + v2.y, czc + v2.z, w * .98, 1.4, d + .3, p.brand[1], M.plain, { rot });
            });
            if (!tilt) for (let i = 0; i < 4; i++) box(B, p.cx - p.cw / 3 + i * p.cw / 4.5, H + .3, czm, 6, .4, 3, C("#f4f0e0"), M.plain);
            return;
          }
          // the forecourt and the pump islands
          box(B, p.cx, .4, (p.D / 2 + cz1 + 8) / 2, p.cw + 16, .8, cz1 + 8 - p.D / 2, PAL.concreteD, M.concrete);
          for (const ix of [-p.cw / 4, p.cw / 4]) {
            box(B, p.cx + ix, 1.4, czm, 28, 2, 8, C("#c9c4b8"), M.concrete);
            box(B, p.cx + ix - 15, 6, czm, 2.4, 10, 2.4, C("#e0c040"), M.plain); box(B, p.cx + ix + 15, 6, czm, 2.4, 10, 2.4, C("#e0c040"), M.plain);
            pump(ctx, p.cx + ix - 7, czm, p.brand); pump(ctx, p.cx + ix + 7, czm, p.brand);
          }
          // the sign on its pole
          const sx = p.cx + p.cw / 2 + 12, sz = cz1 + 2;
          if (ctx.state === "r" && r.chance(.5)) box(B, sx + 30, 3, sz, 64, 2, 2, PAL.metal, M.metal, { rot: rotEuler(0, r.range(-.5, .5), 0) });
          else {
            cyl(B, sx, 0, sz, 1.4, 1.4, 64, 8, PAL.metal, M.metal);
            const lean = ctx.state === "d" ? rotEuler(0, 0, r.range(-.1, .1)) : null;
            box(B, sx, 72, sz, 22, 16, 2.2, p.brand[0], M.plain, { rot: lean });
            box(B, sx, 66, sz, 22.4, 4, 2.6, p.brand[1], M.plain, { rot: lean });
            for (let i = 0; i < 3; i++) if (ctx.state === "i" || r.chance(.5)) box(B, sx - 7 + i * 7, 74, sz + 1.3, 4.5, 6, .4, C("#f4f0e0"), M.plain, { rot: lean });
          }
          const ops = {}, L = S.front.L;
          ops.front = [{ s0: 5, s1: 22, y0: 3, y1: 38, kind: "door", step: false, doorCol: p.frameCol }, { s0: 26, s1: L - 5, y0: 9, y1: 36, kind: "shop", frameCol: p.frameCol }];
          ops.left = [win(S.left.L / 2, 12, 16, 18)]; ops.right = [];
          ops.back = [{ s0: S.back.L - 22, s1: S.back.L - 8, y0: 3, y1: 37, kind: "door", step: true }];
          finishStorey(ctx, p, S, st, 0, ops, null);
          if (!ctx.brk || ctx.brk(0, p.D / 2) > st.H) wb(B, S.front, 1.5, L - 1.5, 38, 43, -1.6, 0, p.brand[0], M.plain);
          INSIDE.gasstation(ctx, p, 0, 3);
          if (ctx.state !== "r") { box(B, p.W / 2 - 8, 6, p.D / 2 + 4, 14, 12, 7, C("#e8e8e4"), M.plain); box(B, p.W / 2 - 8, 9, p.D / 2 + 7.6, 12, 3, .4, C("#3a7ab0"), M.plain); }
        },
      },
      stripmall: {
        name: "Strip mall", sub: "a row of shop units",
        plan(r) {
          const W = SQ * r.pick([7, 8, 9]), D = SQ * r.pick([3.5, 4]), n = W > SQ * 8.5 ? 4 : r.pick([3, 4]), brick = r.chance(.5);
          return {
            W, D, T: 3, storeys: [{ base: 0, H: 50 }], top: 50, brick, wallCol: brick ? r.pick(PAL.brick) : r.pick(PAL.render), wallMat: brick ? M.brick : M.plain, n,
            frameCol: C("#2a2c2e"), doorCol: C("#2a2c2e"), signs: Array.from({ length: n }, () => r.pick(PAL.sign)), letters: Array.from({ length: n }, () => r.int(3, 7)),
            walk: r.chance(.7), noPartition: true, floorCol: PAL.tile, floorMat: M.tile, seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Shops", "Roof"]; },
        draw(ctx, p, lvl) {
          const { r, B } = ctx, S = sidesOf(p.W, p.D, p.T), st = p.storeys[0], uw = p.W / p.n;
          if (lvl === 1) { flatRoof(ctx, p.top, { parapet: 5, frontRise: 9, ac: ctx.lay("ac").int(2, 3) }); return; }
          const ops = { front: [], back: [], left: [win(S.left.L / 2, 12, 16, 20)], right: [] };
          for (let i = 0; i < p.n; i++) {
            const a = i * uw, dl = i % 2 ? uw - 21 : 4;
            ops.front.push({ s0: a + dl, s1: a + dl + 17, y0: 3, y1: 38, kind: "door", doorCol: p.frameCol });
            const ws = i % 2 ? [a + 4, a + uw - 25] : [a + 25, a + uw - 4];
            ops.front.push({ s0: ws[0], s1: ws[1], y0: 9, y1: 36, kind: "shop", frameCol: p.frameCol });
            ops.back.push({ s0: p.W - (a + uw / 2) - 7, s1: p.W - (a + uw / 2) + 7, y0: 3, y1: 36, kind: "door", step: true });
          }
          finishStorey(ctx, p, S, st, 0, ops, null);
          ctx.y0 = 3; ctx.looted = ctx.state !== "i";
          for (let i = 0; i < p.n; i++) {
            const a = -p.W / 2 + i * uw;
            if (i > 0) innerWall(ctx, [a, -p.D / 2 + p.T], [a, p.D / 2 - p.T], 3, st.H - 3, null);
            const cx = a + uw / 2;
            INSIDE.stripmall(ctx, p, 0, 3, { i, cx, uw });
            // each unit's sign
            if (!ctx.brk || ctx.brk(cx, p.D / 2) > st.H) {
              wb(B, S.front, i * uw + 2, (i + 1) * uw - 2, 40, 48.5, -1.8, 0, ctx.tintCol(p.signs[i]), M.plain);
              letters(ctx, S.front, i * uw + uw / 2, 41.8, 5, p.letters[i], C("#ece6d4"), -1.8);
            }
          }
          // the covered walk along the front
          if (p.walk) {
            const fall = ctx.state === "r";
            for (let i = 0; i <= p.n; i++) {
              const sx = clampN(i * uw, 1.5, p.W - 1.5); if (fall && r.chance(.5)) continue;
              wb(B, S.front, sx - 1.2, sx + 1.2, 0, 38, -17, -14.6, C("#d8d4c8"), M.plain);
            }
            const strips = Math.round(p.W / 12);
            for (let i = 0; i < strips; i++) {
              if (fall && r.chance(.55)) continue; if (ctx.state === "d" && r.chance(.12)) continue;
              const s0 = i * p.W / strips, s1 = (i + 1) * p.W / strips;
              wb(B, S.front, s0, s1, 38, 39.6, -18, 0, C("#cfc9bb"), M.plain, { tip: fall ? r.range(.2, .7) : .04 });
            }
          }
          box(B, 0, .3, p.D / 2 + 22, p.W + 6, .6, 10, PAL.concrete[1], M.concrete);
        },
      },
      office: {
        name: "Office block", sub: "concrete and glass, roof mast",
        plan(r) {
          const W = SQ * r.pick([5, 5, 6]), D = SQ * r.pick([4, 4.5, 5]), n = r.int(3, 6), glass = r.chance(.45);
          const storeys = [{ base: 0, H: 50 }]; for (let i = 1; i < n; i++) storeys.push({ base: 50 + 44 * (i - 1), H: 44 });
          return {
            W, D, T: 3, storeys, top: 50 + 44 * (n - 1), glass, wallCol: r.pick(PAL.concrete), wallMat: M.concrete, course: true,
            frameCol: r.pick([C("#2a2c2e"), C("#8a8e92"), C("#c8c4b8")]), doorCol: C("#2a2c2e"), floorCol: C("#7a7e86"), floorMat: M.plain, seed: r.int(0, 1e9),
          };
        },
        floors(p) { return ["Lobby", ...p.storeys.slice(1).map((_, i) => "Floor " + (i + 2)), "Roof"]; },
        draw(ctx, p, lvl) {
          const { r, B } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length;
          if (lvl === n) { flatRoof(ctx, p.top, { parapet: 5, ac: ctx.lay("ac").int(2, 3), bulkhead: true, mast: ctx.lay("mast").chance(.7) ? ctx.lay("masth").int(34, 50) : 0 }); return; }
          const st = p.storeys[lvl], H = st.H;
          const band = (L, y0, y1) => p.glass ? [{ s0: 2.5, s1: L - 2.5, y0: lvl === 0 ? 3 : 2.5, y1: H - 3.5, kind: "shop", frameCol: p.frameCol }] : [{ s0: 6, s1: L - 6, y0, y1, kind: "shop", frameCol: p.frameCol }];
          const ops = {};
          if (lvl === 0) {
            const L = S.front.L, c = L / 2;
            ops.front = [{ s0: 4, s1: c - 13, y0: 6, y1: 40, kind: "shop", frameCol: p.frameCol }, { s0: c - 11, s1: c + 11, y0: 3, y1: 38, kind: "door", step: true, canopy: true, doorCol: C("#3a4a56") }, { s0: c + 13, s1: L - 4, y0: 6, y1: 40, kind: "shop", frameCol: p.frameCol }];
          } else ops.front = band(S.front.L, 12, 36);
          ops.back = lvl === 0 ? [{ s0: 8, s1: 24, y0: 3, y1: 37, kind: "door", step: true }, ...band(S.back.L, 14, 36).map((o) => ({ ...o, s0: 30 }))] : band(S.back.L, 12, 36);
          ops.left = band(S.left.L, 12, 36); ops.right = band(S.right.L, 12, 36);
          const hole = [-p.W / 2 + p.T, -p.D / 2 + p.T, -p.W / 2 + p.T + 11, -p.D / 2 + p.T + 50];
          finishStorey(ctx, p, S, st, lvl, ops, hole);
          INSIDE.office(ctx, p, lvl, lvl === 0 ? 3 : st.base);
        },
      },
      police: {
        name: "Police station", sub: "brick, sally port, flagpole",
        plan(r) {
          const W = SQ * r.pick([5, 6]), D = SQ * r.pick([4, 4.5]);
          return {
            W, D, T: 3, storeys: [{ base: 0, H: 52 }, { base: 52, H: 46 }], top: 98, brick: true, wallCol: r.pick(PAL.brick.slice(0, 5)), wallMat: M.brick,
            frameCol: r.pick([C("#e8e4da"), C("#2a2c2e")]), doorCol: C("#2a3a5a"), flag: r.pick([C("#2a4a8a"), C("#7a2a2a"), C("#2e5a3e")]), seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Front desk and cells", "Offices", "Roof"]; },
        draw(ctx, p, lvl) {
          const { r, B } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length;
          if (lvl === n) { flatRoof(ctx, p.top, { parapet: 7, ac: 2, mast: ctx.lay("masth").int(28, 40), frontRise: 6 }); return; }
          const st = p.storeys[lvl], L = S.front.L, c = L / 2, ops = {};
          const sym = bays(L, 24, 8).filter((x) => Math.abs(x - c) > 16);
          if (lvl === 0) {
            ops.front = [{ s0: c - 12, s1: c + 12, y0: 6, y1: 42, kind: "door", canopy: true, doorCol: p.doorCol }, ...sym.map((x) => win(x, 12, 18, 22, { bars: true }))];
            ops.right = [{ s0: S.right.L / 2 - 22, s1: S.right.L / 2 + 22, y0: 0, y1: 44, kind: "roller", doorCol: C("#8a8e92") }];
            ops.left = bays(S.left.L, 26, 12).map((x) => win(x, 8, 26, 12, { bars: true }));
            ops.back = [{ s0: 8, s1: 22, y0: 3, y1: 37, kind: "door", step: true }, ...bays(S.back.L - 30, 26, 8).map((x) => win(x + 30, 8, 26, 12, { bars: true }))];
          } else {
            ops.front = [win(c, 22, 14, 24), ...sym.map((x) => win(x, 12, 14, 24))];
            ops.back = bays(S.back.L, 26, 10).map((x) => win(x, 12, 14, 22));
            ops.left = bays(S.left.L, 28, 12).map((x) => win(x, 12, 14, 22)); ops.right = bays(S.right.L, 28, 12).map((x) => win(x, 12, 14, 22));
          }
          const hole = [p.W / 2 - p.T - 11, -p.D / 2 + p.T, p.W / 2 - p.T, -p.D / 2 + p.T + 50];
          finishStorey(ctx, { ...p, stairX: -p.W / 2 + p.T }, S, st, lvl, ops, hole);
          INSIDE.police(ctx, p, lvl, lvl === 0 ? 3 : st.base);
          if (lvl !== 0) return;
          // the entrance: steps, a stone surround, the name over the door, blue lamps
          if (!ctx.brk || ctx.brk(0, p.D / 2) > 50) {
            wb(B, S.front, c - 20, c + 20, 0, 6, -12, 0, C("#c9c2b2"), M.concrete); wb(B, S.front, c - 16, c + 16, 6, 6.01, -8, 0, C("#c9c2b2"), M.concrete);
            wb(B, S.front, c - 16, c + 16, 0, 3, -16, -12, C("#c9c2b2"), M.concrete);
            wb(B, S.front, c - 15, c - 12.4, 6, 46, -1.2, .4, ctx.trimCol, M.concrete); wb(B, S.front, c + 12.4, c + 15, 6, 46, -1.2, .4, ctx.trimCol, M.concrete);
            wb(B, S.front, c - 22, c + 22, 46, 51, -1.6, .2, ctx.trimCol, M.concrete);
            const nl = 6; letters(ctx, S.front, c, 47, 3.2, nl, C("#2a2c2e"), -1.6);
            for (const dx of [-17.5, 17.5]) if (ctx.state === "i" || r.chance(.5)) { wb(B, S.front, c + dx - 1.4, c + dx + 1.4, 34, 40, -3, -.2, C("#3a6ad0"), M.glass); wb(B, S.front, c + dx - 1.8, c + dx + 1.8, 40, 41, -3.4, 0, PAL.metalD, M.metal); }
          }
          flagpole(ctx, -p.W / 2 + 10, p.D / 2 + 16, 90, p.flag);
          // the yard wall round the sally port
          if (ctx.state !== "r" || r.chance(.6)) for (const z of [-p.D / 2 + 6, p.D / 2 - 6]) box(B, p.W / 2 + 16, 14, z, 32, 28, 3, ctx.tintCol(p.wallCol), M.brick, { edge: false });
        },
      },
      diner: {
        name: "Diner", sub: "booths, counter and stools, rooftop sign",
        plan(r) {
          const W = SQ * r.pick([4.5, 5]), D = SQ * r.pick([3, 3.5]);
          return {
            W, D, T: 3, storeys: [{ base: 0, H: 46 }], top: 46, wallCol: r.pick([C("#ece6d6"), C("#e8d8b8"), C("#d8e4e0")]), wallMat: M.plain, stripe: r.pick([C("#b8241e"), C("#2a6a7a"), C("#c8a040"), C("#2e6a4a")]),
            frameCol: C("#c8c8c0"), doorCol: C("#c8c8c0"), noPartition: true, floorCol: C("#d8d4c8"), floorMat: M.tile, letters: 5, seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Dining room", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B } = ctx, S = sidesOf(p.W, p.D, p.T), st = p.storeys[0], L = S.front.L;
          if (lvl === 1) {
            flatRoof(ctx, p.top, { parapet: 3, ac: 1 });
            if (!ctx.brk || ctx.brk(0, 0) > p.top) {
              const y = p.top + 3, sw = Math.min(70, p.W * .6);
              for (const a of [-1, 1]) box(B, a * sw * .35, y + 8, -4, 1.6, 16, 1.6, PAL.metal, M.metal);
              box(B, 0, y + 22, -4, sw, 14, 2, p.stripe, M.plain);
              box(B, 0, y + 22, -4, sw + 1.6, 15.6, 1.2, C("#c8c8c0"), M.metal);
              letters(ctx, { L: sw, O: [-sw / 2, -2.9], A: [1, 0], I: [0, -1] }, sw / 2, y + 17, 9, p.letters, C("#f4ecd0"), -.6);
            }
            return;
          }
          const ops = {
            front: [{ s0: 6, s1: 22, y0: 3, y1: 38, kind: "door", doorCol: p.doorCol }, ...bays(L - 30, 20, 4).map((c) => ({ s0: 26 + c - 8.5, s1: 26 + c + 8.5, y0: 14, y1: 36, kind: "window" }))],
            left: bays(S.left.L, 20, 6).map((c) => win(c, 15, 14, 22)), right: bays(S.right.L, 20, 6).map((c) => win(c, 15, 14, 22)),
            back: [{ s0: L - 22, s1: L - 8, y0: 3, y1: 37, kind: "door", step: true }, win(L * .4, 14, 20, 14)],
          };
          finishStorey(ctx, { ...p, noPipes: true }, S, st, 0, ops, null);
          // the enamel stripes round the outside
          for (const k of ["front", "left", "right", "back"]) for (const [y0, y1] of [[8, 11], [39, 42]]) {
            const Sd = S[k], ext = k === "left" || k === "right" ? p.T : 0;
            if (ctx.brk && ctx.brk(...at(Sd, Sd.L / 2, 0)) < y1) continue;
            wb(B, Sd, -ext, Sd.L + ext, y0, y1, -.6, 0, k === "back" ? mul(p.stripe, .8) : p.stripe, M.plain);
          }
          INSIDE.diner(ctx, p, 0, 3);
        },
      },
      church: {
        name: "Church", sub: "steeple, nave and pews",
        plan(r) {
          const W = SQ * r.pick([5.5, 6, 6.5]), D = SQ * r.pick([3, 3.5]), stone = r.chance(.5);
          return {
            W, D, T: 3.6, storeys: [{ base: 0, H: 62 }], top: 62, brick: !stone, wallCol: stone ? r.pick([C("#a8a294"), C("#b8ae98"), C("#8e8a82")]) : r.pick(PAL.brick), wallMat: stone ? M.concrete : M.brick,
            frameCol: C("#3a3226"), doorCol: r.pick([C("#6b2e2a"), C("#5a3e2a"), C("#2e3e5a")]), roofCol: r.pick([C("#4a4e56"), C("#5a4a42"), C("#3e4650")]), noPartition: true, stairX: 999,
            floorCol: C("#8a7a64"), floorMat: M.wood, spire: r.pick([30, 40, 50]), seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Nave", "Roof and steeple"]; },
        draw(ctx, p, lvl) {
          const { B, r } = ctx, S = sidesOf(p.W, p.D, p.T), st = p.storeys[0], L = S.front.L, tw = 26, tx = -p.W / 2 - tw / 2 + 4;
          if (lvl === 1) {
            gableRoof({ ...ctx, roofCol: p.roofCol }, p.top, 1.15, { overhang: 3, col: p.roofCol, mat: M.shingle, missing: ctx.state === "d" ? .15 : 0 });
            // the steeple's upper stage, belfry and spire
            const th = p.top + 34, reach = ctx.brk ? ctx.brk(tx, 0) : 999;
            if (reach > th - 20) {
              const Tw = { L: tw, O: [tx - tw / 2, tw / 2], A: [1, 0], I: [0, -1] };
              for (const [k, S2] of [["f", { L: tw, O: [tx - tw / 2, tw / 2], A: [1, 0], I: [0, -1] }], ["b", { L: tw, O: [tx + tw / 2, -tw / 2], A: [-1, 0], I: [0, 1] }], ["l", { L: tw - 6, O: [tx - tw / 2, -tw / 2 + 3], A: [0, 1], I: [1, 0] }], ["r", { L: tw - 6, O: [tx + tw / 2, tw / 2 - 3], A: [0, -1], I: [-1, 0] }]])
                storeyWalls({ ...ctx, T: 3, course: false }, S2, { base: p.top, H: 34 }, [{ s0: S2.L / 2 - 4, s1: S2.L / 2 + 4, y0: 14, y1: 28, kind: "hole" }]);
              void Tw;
              box(B, tx, th + .8, 0, tw + 2, 1.6, tw + 2, ctx.trimCol, M.concrete);
              if (reach > th + 10 && (ctx.state !== "r" || r.chance(.3))) { cyl(B, tx, th + 1.6, 0, tw * .62, .4, p.spire, 4, p.roofCol, M.shingle); box(B, tx, th + p.spire + 5, 0, .8, 9, .8, C("#b08a3e"), M.metal); box(B, tx, th + p.spire + 6.5, 0, 5, .8, .8, C("#b08a3e"), M.metal); }
            }
            return;
          }
          const lancet = (c, y0, h) => win(c, 9, y0, h);
          const ops = {
            front: [{ s0: L / 2 - 9, s1: L / 2 + 9, y0: 3, y1: 40, kind: "door", step: true, doorCol: p.doorCol }, ...bays(L, 26, 14).filter((c) => Math.abs(c - L / 2) > 18).map((c) => lancet(c, 18, 34))],
            back: bays(L, 26, 14).map((c) => lancet(c, 18, 34)), left: [], right: [win(S.right.L / 2, 14, 20, 30)],
          };
          finishStorey(ctx, { ...p, noPipes: true }, S, st, 0, ops, null);
          // the steeple's lower stage against the left end, with its own door
          const Tf = { L: tw, O: [tx - tw / 2, tw / 2], A: [1, 0], I: [0, -1] }, Tb = { L: tw, O: [tx + tw / 2, -tw / 2], A: [-1, 0], I: [0, 1] }, Tl = { L: tw - 6, O: [tx - tw / 2, -tw / 2 + 3], A: [0, 1], I: [1, 0] };
          const tctx = { ...ctx, T: 3, course: false };
          storeyWalls(tctx, Tf, { base: 0, H: p.top }, [win(tw / 2, 7, 30, 18)]);
          storeyWalls(tctx, Tb, { base: 0, H: p.top }, [win(tw / 2, 7, 30, 18)]);
          storeyWalls(tctx, Tl, { base: 0, H: p.top }, [{ s0: Tl.L / 2 - 6, s1: Tl.L / 2 + 6, y0: 3, y1: 34, kind: "door", doorCol: p.doorCol, step: true }]);
          // a gabled porch over the front door
          if (!ctx.brk || ctx.brk(0, p.D / 2) > 46) { wb(B, S.front, L / 2 - 13, L / 2 - 10, 0, 44, -10, 0, ctx.tintCol(p.wallCol), p.wallMat, { edge: false }); wb(B, S.front, L / 2 + 10, L / 2 + 13, 0, 44, -10, 0, ctx.tintCol(p.wallCol), p.wallMat, { edge: false }); wb(B, S.front, L / 2 - 14, L / 2 + 14, 44, 46, -11, 0, ctx.trimCol, M.concrete); }
          INSIDE.church(ctx, p, 0, 3);
        },
      },
      clinic: {
        name: "Clinic", sub: "waiting room, exam bays",
        plan(r) {
          const W = SQ * r.pick([5, 6]), D = SQ * r.pick([4, 4.5]), two = r.chance(.4);
          const storeys = [{ base: 0, H: 48 }]; if (two) storeys.push({ base: 48, H: 44 });
          return {
            W, D, T: 3, storeys, top: two ? 92 : 48, wallCol: r.pick([C("#e8e6de"), C("#d8dcd8"), C("#e4dccc")]), wallMat: M.plain, course: true,
            frameCol: C("#8a8e92"), doorCol: C("#8a8e92"), floorCol: C("#c8ccc8"), floorMat: M.tile, cross: r.pick([C("#c8302a"), C("#2a7a5a"), C("#2a5aa8")]), seed: r.int(0, 1e9),
          };
        },
        floors(p) { return p.storeys.length === 2 ? ["Waiting room and exam bays", "Wards", "Roof"] : ["Waiting room and exam bays", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length, L = S.front.L;
          if (lvl === n) { flatRoof(ctx, p.top, { parapet: 4, ac: ctx.lay("ac").int(2, 3) }); return; }
          const st = p.storeys[lvl], ops = {};
          ops.front = lvl === 0 ? [{ s0: L / 2 - 12, s1: L / 2 + 12, y0: 3, y1: 38, kind: "door", step: true, canopy: true, doorCol: C("#3a4a56") }, ...bays(L, 26, 8).filter((c) => Math.abs(c - L / 2) > 20).map((c) => win(c, 16, 14, 20))] : bays(L, 24, 8).map((c) => win(c, 14, 12, 22));
          ops.back = bays(S.back.L, 26, 10).map((c) => win(c, 12, 14, 20)); ops.left = bays(S.left.L, 26, 10).map((c) => win(c, 12, 14, 20)); ops.right = bays(S.right.L, 26, 10).map((c) => win(c, 12, 14, 20));
          const hole = n === 2 ? [-p.W / 2 + p.T, -p.D / 2 + p.T, -p.W / 2 + p.T + 11, -p.D / 2 + p.T + 50] : null;
          finishStorey(ctx, p, S, st, lvl, ops, hole);
          if (lvl === 0 && (!ctx.brk || ctx.brk(0, p.D / 2) > 46)) {
            // the cross over the door
            const c = L / 2; wb(B, S.front, c - 7, c + 7, 40.5, 44.5, -1.6, 0, ctx.state === "i" ? p.cross : mul(p.cross, .7), M.plain); wb(B, S.front, c - 2, c + 2, 36, 49, -1.6, 0, ctx.state === "i" ? p.cross : mul(p.cross, .7), M.plain);
          }
          INSIDE.clinic(ctx, p, lvl, lvl === 0 ? 3 : st.base);
        },
      },
      firestation: {
        name: "Fire station", sub: "engine bays, bunks, drill tower",
        plan(r) {
          const W = SQ * r.pick([5.5, 6]), D = SQ * r.pick([4.5, 5]);
          return {
            W, D, T: 3, storeys: [{ base: 0, H: 56 }, { base: 56, H: 44 }], top: 100, brick: true, wallCol: r.pick(PAL.brick.slice(0, 5)), wallMat: M.brick,
            frameCol: C("#e8e4da"), doorCol: C("#b8241e"), trucks: r.int(1, 2), seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Engine bays", "Quarters", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length, L = S.front.L;
          if (lvl === n) {
            flatRoof(ctx, p.top, { parapet: 6, ac: 1, mast: 24 });
            // the drill tower at the back corner
            const tx = p.W / 2 - 14, tz = -p.D / 2 + 14;
            if (!ctx.brk || ctx.brk(tx, tz) > p.top + 10) {
              for (const [O, A, I, Ln] of [[[tx - 12, tz + 12], [1, 0], [0, -1], 24], [[tx + 12, tz - 12], [-1, 0], [0, 1], 24], [[tx - 12, tz - 9], [0, 1], [1, 0], 18], [[tx + 12, tz + 9], [0, -1], [-1, 0], 18]])
                storeyWalls({ ...ctx, T: 3, course: false }, { L: Ln, O, A, I }, { base: p.top, H: 40 }, [win(Ln / 2, 8, 14, 16)]);
              box(B, tx, p.top + 41, tz, 26, 2, 26, ctx.trimCol, M.concrete);
            }
            return;
          }
          const st = p.storeys[lvl], ops = {};
          if (lvl === 0) {
            const bw = (L - 30) / 2;
            ops.front = [{ s0: 6, s1: 6 + bw, y0: 0, y1: 46, kind: "roller", doorCol: p.doorCol }, { s0: 16 + bw, s1: 16 + 2 * bw, y0: 0, y1: 46, kind: "roller", doorCol: p.doorCol }, { s0: L - 20, s1: L - 6, y0: 3, y1: 38, kind: "door", step: true }];
            ops.left = bays(S.left.L, 28, 12).map((c) => win(c, 10, 22, 18)); ops.right = []; ops.back = [{ s0: 10, s1: 24, y0: 3, y1: 38, kind: "door", step: true }];
          } else {
            ops.front = bays(L, 22, 8).map((c) => win(c, 12, 12, 22)); ops.back = bays(S.back.L, 26, 10).map((c) => win(c, 12, 12, 22));
            ops.left = bays(S.left.L, 28, 12).map((c) => win(c, 12, 12, 22)); ops.right = bays(S.right.L, 28, 12).map((c) => win(c, 12, 12, 22));
          }
          const hole = [p.W / 2 - p.T - 11, -p.D / 2 + p.T, p.W / 2 - p.T, -p.D / 2 + p.T + 50];
          finishStorey(ctx, { ...p, stairX: p.W / 2 - p.T - 11, noPartition: lvl === 0 }, S, st, lvl, ops, hole);
          if (lvl === 0 && (!ctx.brk || ctx.brk(0, p.D / 2) > 54)) { wb(B, S.front, 4, L - 4, 47, 54, -1.4, .2, ctx.trimCol, M.concrete); letters(ctx, S.front, L / 2, 48.4, 4.2, 7, C("#b8241e"), -1.4); }
          INSIDE.firestation(ctx, p, lvl, lvl === 0 ? 3 : st.base);
        },
      },
      rowhouse: {
        name: "Row house", sub: "narrow, stoop, sits wall to wall",
        plan(r) {
          const W = SQ * r.pick([2, 2.5]), D = SQ * r.pick([4, 4.5]), n = r.int(2, 3), brick = r.chance(.75);
          const storeys = [{ base: 0, H: 50 }]; for (let i = 1; i < n; i++) storeys.push({ base: 50 + 44 * (i - 1), H: 44 });
          return {
            W, D, T: 3, storeys, top: 50 + 44 * (n - 1), brick, wallCol: brick ? r.pick(PAL.brick) : r.pick(PAL.render), wallMat: brick ? M.brick : M.plain,
            frameCol: r.pick(PAL.frame), doorCol: r.pick(PAL.door), doorLeft: r.chance(.5), stairX: -W / 2 + 3, seed: r.int(0, 1e9),
          };
        },
        floors(p) { return ["Parlour and kitchen", ...p.storeys.slice(1).map((_, i) => ["Bedrooms", "Top floor"][i]), "Roof"]; },
        draw(ctx, p, lvl) {
          const { B } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length, L = S.front.L;
          if (lvl === n) { flatRoof(ctx, p.top, { parapet: 4, ac: 0 }); if (!ctx.brk) wb(B, S.front, -1.5, L + 1.5, p.top - 4, p.top, -2.2, 0, ctx.trimCol, M.concrete); return; }
          const st = p.storeys[lvl], ops = {}, dc = p.doorLeft ? 12 : L - 12;
          ops.front = lvl === 0 ? [{ s0: dc - 7, s1: dc + 7, y0: 8, y1: 42, kind: "door", doorCol: p.doorCol }, win(p.doorLeft ? L - 15 : 15, 14, 16, 24)] : bays(L, 22, 6).map((c) => win(c, 12, 12, 24));
          ops.back = [win(L / 2, 12, 14, 22)]; ops.left = []; ops.right = [];
          finishStorey(ctx, { ...p, noPipes: true }, S, st, lvl, ops, n > 1 ? [p.stairX, -p.D / 2 + p.T, p.stairX + 11, -p.D / 2 + p.T + 50] : null);
          if (lvl === 0) {
            // the stoop: steps up to the door with a rail
            for (let i = 0; i < 3; i++) wb(B, S.front, dc - 8, dc + 8, 0, 8 - i * 2.6, -4 - i * 4, 0, PAL.concrete[0], M.concrete);
            for (const s of [dc - 8.5, dc + 7.8]) wb(B, S.front, s, s + .7, 8, 18, -12, -.5, PAL.metalD, M.metal, { tip: -.3 });
          }
          INSIDE.rowhouse(ctx, p, lvl, lvl === 0 ? 3 : st.base);
        },
      },
      watertower: {
        name: "Water tower", sub: "legs, tank, ladder", structure: true,
        plan(r) { return { W: SQ * 3, D: SQ * 3, T: 3, storeys: [{ base: 0, H: 120 }], top: 120, noRoof: true, wallCol: r.pick([C("#9aa4a8"), C("#b8b0a0"), C("#8a9a8a")]), wallMat: M.metal, word: r.int(4, 7), seed: r.int(0, 1e9) }; },
        floors() { return ["Tower"]; },
        draw(ctx, p) {
          const { B, r } = ctx, fell = ctx.state === "r", lean = ctx.state === "d" ? .04 : 0, legH = 82, R0 = 30, R1 = 20;
          for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4, bx = Math.cos(a) * R0, bz = Math.sin(a) * R0, tx = Math.cos(a) * R1, tz = Math.sin(a) * R1;
            const h = fell && i < 2 ? r.range(20, 40) : legH, len = Math.hypot(bx - tx, bz - tz, h);
            const mx = bx + (tx - bx) * h / legH / 2, mz = bz + (tz - bz) * h / legH / 2;
            box(B, mx, h / 2, mz, 2.4, len, 2.4, PAL.metalD, M.metal, { rot: new THREE.Matrix4().lookAt(new THREE.Vector3(bx, 0, bz), new THREE.Vector3(tx, legH, tz), new THREE.Vector3(0, 1, 0)).multiply(rotEuler(Math.PI / 2, 0, 0)) });
            box(B, bx, 1.5, bz, 6, 3, 6, PAL.concreteD, M.concrete);
          }
          for (const hh of [28, 56]) for (let i = 0; i < 4; i++) { if (fell && r.chance(.5)) continue; const a = i * Math.PI / 2 + Math.PI / 4, b = a + Math.PI / 2, rr = R0 + (R1 - R0) * hh / legH; const ax = Math.cos(a) * rr, az = Math.sin(a) * rr, bx2 = Math.cos(b) * rr, bz2 = Math.sin(b) * rr; box(B, (ax + bx2) / 2, hh, (az + bz2) / 2, Math.hypot(bx2 - ax, bz2 - az), 1.2, 1.2, PAL.metalD, M.metal, { rot: rotEuler(0, -Math.atan2(bz2 - az, bx2 - ax), 0) }); }
          if (fell) { // the tank down on its side beside the legs, crumpled
            const fx = r.range(-10, 10);
            for (let i = 0; i < 9; i++) box(B, fx + i * 5.5 - 22, 18 + r.range(-3, 3), 34, 5.6, 34 + r.range(-6, 0), 36, jit(p.wallCol, r, .1), M.corr, { rot: rotEuler(r.range(-.15, .15), 0, r.range(-.2, .2)) });
            return;
          }
          const ty = legH;
          box(B, 0, ty + .8, 0, 46, 1.6, 46, PAL.metalD, M.metal);
          cyl(B, 0, ty + 1.6, 0, 22, 22, 30, 20, p.wallCol, M.corr);
          cyl(B, 0, ty + 31.6, 0, 22.6, 2, 9, 20, mul(p.wallCol, .85), M.metal);
          for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(B, Math.cos(a) * 23, ty + 6, Math.sin(a) * 23, 1, 10, 1, PAL.metalD, M.metal); }
          box(B, 0, ty + 10, 23.4, 2.6, 1, .6, PAL.metalD, M.metal);
          // a ladder up one leg
          for (const dx of [-1.6, 1.6]) box(B, R0 * .5 + dx, legH / 2 + 10, R0 * .5, .5, legH + 20, .5, PAL.metal, M.metal);
          for (let y = 4; y < legH + 18; y += 3) box(B, R0 * .5, y, R0 * .5, 3.2, .4, .4, PAL.metal, M.metal);
          if (ctx.state === "d") for (let i = 0; i < 4; i++) box(B, r.range(-14, 14), ty + r.range(4, 26), 22.5, r.range(2, 5), r.range(2, 5), .6, PAL.rust, M.metal);
          void lean;
        },
      },
      billboard: {
        name: "Billboard", sub: "posts, catwalk, faded ad", structure: true,
        plan(r) { return { W: SQ * 3, D: SQ * 1, T: 2, storeys: [{ base: 0, H: 80 }], top: 80, noRoof: true, wallCol: PAL.metalD, wallMat: M.metal, ad: [r.pick(PAL.sign), r.pick(PAL.goods), r.pick([C("#e8e2d0"), C("#f0d040")])], seed: r.int(0, 1e9) }; },
        floors() { return ["Billboard"]; },
        draw(ctx, p) {
          const { B, r } = ctx, st = ctx.state, bw = 74, bh = 28, by = 44;
          const fall = st === "r" ? rotEuler(r.range(-.9, -.6), 0, r.range(-.15, .15)) : null;
          for (const a of [-1, 1]) { const h = st === "r" && a > 0 ? r.range(18, 30) : by; box(B, a * bw * .3, h / 2, -2, 2.6, h, 2.6, PAL.metalD, M.metal); box(B, a * bw * .3, 1, -2, 7, 2, 7, PAL.concreteD, M.concrete); }
          const put = (x, y, z, w, h, d, col, mat) => { if (!fall) { box(B, x, y, z, w, h, d, col, mat); return; } const v = new THREE.Vector3(x, y - by, z).applyMatrix4(fall); box(B, v.x, v.y + by - (st === "r" ? 8 : 0), v.z, w, h, d, col, mat, { rot: fall }); };
          put(0, by + bh / 2, 0, bw + 2, bh + 2, 1.6, PAL.metalD, M.metal);
          // the ad: a field of colour, a block of "text", a picture; peeled strips once damaged
          const strips = 8;
          for (let i = 0; i < strips; i++) {
            if (st !== "i" && r.chance(st === "d" ? .25 : .45)) continue;
            const x = -bw / 2 + (i + .5) * bw / strips;
            put(x, by + bh / 2, .9, bw / strips - .1, bh, .3, i < 5 ? p.ad[0] : p.ad[1], M.plain);
          }
          if (st === "i" || r.chance(.5)) { put(-bw * .2, by + bh * .7, 1.1, bw * .45, 4, .3, p.ad[2], M.plain); put(-bw * .25, by + bh * .4, 1.1, bw * .35, 2.6, .3, p.ad[2], M.plain); put(bw * .3, by + bh * .5, 1.1, bw * .22, bh * .7, .3, mul(p.ad[1], 1.15), M.plain); }
          put(0, by - 1.5, 6, bw, .8, 8, PAL.metalD, M.metal); put(0, by + 4, 9.6, bw, .6, .6, PAL.metalD, M.metal);
          for (let i = 0; i < 4; i++) put(-bw * .36 + i * bw * .24, by + 4 + 4, 6, .5, 1, .5, PAL.metalD, M.metal);
        },
      },
      busstop: {
        name: "Bus shelter", sub: "glass panels, bench, sign", structure: true,
        plan(r) { return { W: SQ * 2.5, D: SQ * 1.2, T: 1, storeys: [{ base: 0, H: 46 }], top: 46, noRoof: true, wallCol: PAL.metalD, wallMat: M.metal, col: r.pick([C("#2a5aa8"), C("#2e6a4a"), C("#5a5a5a")]), seed: r.int(0, 1e9) }; },
        floors() { return ["Shelter"]; },
        draw(ctx, p) {
          const { B, r } = ctx, st = ctx.state, w = 56, d = 22;
          box(B, 0, .4, 0, w + 6, .8, d + 6, PAL.concrete[1], M.concrete);
          for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) if (!(st === "r" && z > 0 && r.chance(.6))) box(B, x, 21, z, 1.6, 42, 1.6, p.col, M.metal);
          if (st !== "r" || r.chance(.4)) box(B, 0, 42.5, 0, w + 6, 1.6, d + 4, p.col, M.metal, st === "r" ? { rot: rotEuler(r.range(.1, .3), 0, r.range(-.1, .1)) } : {});
          const glass = (x, z, gw, gd) => { if (st === "r" || (st === "d" && r.chance(.5))) { if (r.chance(.5)) box(B, x, 6, z, gw * .4, 8, gd + .3, C("#9fb4c0"), M.glass); return; } box(B, x, 22, z, gw, 36, gd, C("#9fb4c0"), M.glass); };
          for (let i = 0; i < 3; i++) glass(-w / 3 + i * w / 3, -d / 2, w / 3 - 2, .5);
          glass(-w / 2, 0, .5, d - 2); glass(w / 2, 0, .5, d - 2);
          box(B, 0, 8, -d / 2 + 5, w * .7, 1, 6, C("#8a6a48"), M.wood); for (const a of [-1, 1]) box(B, a * w * .3, 4, -d / 2 + 5, 1, 8, 5, PAL.metalD, M.metal);
          // the stop's sign on its pole
          if (st !== "r" || r.chance(.5)) { box(B, w / 2 + 8, 24, d / 2, 1.2, 48, 1.2, PAL.metal, M.metal); box(B, w / 2 + 8, 44, d / 2, 9, 9, .6, p.col, M.plain); box(B, w / 2 + 8, 44, d / 2 + .4, 5, 5, .3, C("#f0ece0"), M.plain); }
        },
      },
      celltower: {
        name: "Cell tower", sub: "lattice mast, antennas, fenced yard", structure: true,
        plan(r) { return { W: SQ * 3, D: SQ * 3, T: 1, storeys: [{ base: 0, H: 170 }], top: 170, noRoof: true, wallCol: PAL.metal, wallMat: M.metal, h: r.int(140, 180), seed: r.int(0, 1e9) }; },
        floors() { return ["Tower and yard"]; },
        draw(ctx, p) {
          const { B, r } = ctx, st = ctx.state, H = st === "r" ? p.h * r.range(.35, .55) : p.h, w0 = 16, w1 = 5;
          box(B, 0, .6, 0, 70, 1.2, 70, C("#8a8a84"), M.concrete);
          const wAt = (y) => w0 + (w1 - w0) * y / p.h;
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const a = new THREE.Vector3(sx * w0 / 2, 0, sz * w0 / 2), b = new THREE.Vector3(sx * wAt(H) / 2, H, sz * wAt(H) / 2), m = a.clone().add(b).multiplyScalar(.5), len = a.distanceTo(b);
            box(B, m.x, m.y, m.z, 1.2, len, 1.2, PAL.metal, M.metal, { rot: new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 0, 1)).multiply(rotEuler(Math.PI / 2, 0, 0)) });
          }
          for (let y = 10; y < H; y += 10) { const w = wAt(y); for (const [x, z, lw, ld] of [[0, -w / 2, w, .6], [0, w / 2, w, .6], [-w / 2, 0, .6, w], [w / 2, 0, .6, w]]) box(B, x, y, z, lw, .6, ld, PAL.metal, M.metal); }
          if (st === "r") { for (let i = 0; i < 6; i++) box(B, r.range(10, 50), 2 + r.range(0, 4), r.range(-20, 20), r.range(20, 50), 1.2, 1.2, PAL.metal, M.metal, { rot: rotEuler(r.range(-.2, .2), r.range(0, 3), r.range(-.2, .2)) }); }
          else for (let k = 0; k < 3; k++) { const y = H - 6 - k * 14; if (st === "d" && k === 0) continue; for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + k * .4, rr = wAt(y) / 2 + 4; box(B, Math.cos(a) * rr, y, Math.sin(a) * rr, 3, 10, 1.4, C("#e0ded6"), M.plain, { rot: rotEuler(0, -a + Math.PI / 2, 0) }); } }
          if (st !== "r") box(B, wAt(H * .6) / 2 + 3, H * .6, 0, 1, 8, 8, C("#e0ded6"), M.metal, { rot: rotEuler(0, 0, .3) });
          // the equipment cabinets and the chain-link fence round the yard
          for (let i = 0; i < 3; i++) box(B, -22 + i * 9, 8, -24, 7, 16, 9, C("#c8c8c0"), M.metal);
          const fl = 32;
          for (const [O, A] of [[[-fl, -fl], [1, 0]], [[fl, -fl], [0, 1]], [[fl, fl], [-1, 0]], [[-fl, fl], [0, -1]]]) {
            for (let s = 0; s <= 2 * fl; s += 8) { if (st === "r" && r.chance(.3)) continue; box(B, O[0] + A[0] * s, 11, O[1] + A[1] * s, .8, 22, .8, PAL.metal, M.metal); }
            for (const y of [21.5, 15, 8, 1.5]) if (st !== "r" || r.chance(.5)) box(B, O[0] + A[0] * fl, y, O[1] + A[1] * fl, A[0] ? 2 * fl : .4, .4, A[1] ? 2 * fl : .4, PAL.metal, M.metal);
            for (const y of [23.2, 24.4]) if (st === "i") box(B, O[0] + A[0] * fl, y, O[1] + A[1] * fl, A[0] ? 2 * fl : .25, .25, A[1] ? 2 * fl : .25, PAL.metalD, M.metal);
          }
        },
      },
      street: {
        name: "Street", sub: "road, sidewalks and markings", structure: true, fixed: true,
        plan(r, seed) {
          const parts = String(seed || "straight-6").split("-"), kind = ["straight", "cross", "tee", "corner", "lot", "runway", "taxi", "apron", "highway"].includes(parts[0]) ? parts[0] : "straight";
          let W = 5 * SQ, D = 5 * SQ, n = 6, lw = 6, ld = 4;
          if (kind === "straight") { n = Math.max(1, Math.min(40, +parts[1] || 6)); W = n * SQ; }
          // airfield pieces: a runway (8 squares wide, ends "w"/"e" get a threshold and its number), a taxiway (3 wide), an apron
          if (kind === "runway" || kind === "taxi") { n = Math.max(2, Math.min(40, +parts[1] || 20)); W = n * SQ; D = (kind === "runway" ? 8 : 3) * SQ; }
          // a divided highway: two carriageways of two lanes, shoulders, a concrete barrier down the median (8 squares deep)
          if (kind === "highway") { n = Math.max(1, Math.min(40, +parts[1] || 12)); W = n * SQ; D = 8 * SQ; }
          if (kind === "apron") { const m = /^(\d+)x(\d+)$/.exec(parts[1] || ""); lw = m ? Math.max(3, Math.min(40, +m[1])) : 12; ld = m ? Math.max(3, Math.min(30, +m[2])) : 8; W = lw * SQ; D = ld * SQ; }
          if (kind === "lot") { const m = /^(\d+)x(\d+)$/.exec(parts[1] || ""); lw = m ? Math.max(3, Math.min(30, +m[1])) : 6; ld = m ? Math.max(3, Math.min(20, +m[2])) : 4; W = lw * SQ; D = ld * SQ; }
          return { W, D, T: 1, storeys: [{ base: 0, H: 2 }], top: 2, noRoof: true, kind, n, lw, ld, ends: kind === "runway" ? String(parts[2] || "") : "", num: kind === "runway" ? Math.max(1, Math.min(36, +parts[3] || 9)) : 0, wallCol: PAL.concrete[0], wallMat: M.concrete, seed: r.int(0, 1e9) };
        },
        floors(p) { return [{ straight: "Street", cross: "Crossroads", tee: "T-junction", corner: "Corner", lot: "Parking lot", runway: "Runway", taxi: "Taxiway", apron: "Apron", highway: "Highway" }[p.kind]]; },
        draw(ctx, p) {
          const { B, r, state } = ctx, asphalt = C("#3e4042"), walk = C("#a9a69e"), joint = C("#6e6c66"), yel = C("#d8b030"), wht = C("#e6e4dc"), RH = .6, WH = 1.7;
          const road = (x0, z0, x1, z1) => box(B, (x0 + x1) / 2, RH / 2, (z0 + z1) / 2, x1 - x0, RH, z1 - z0, asphalt, M.tar, { edge: false });
          const side = (x0, z0, x1, z1) => {
            const w = x1 - x0, d = z1 - z0;
            // slabs a square each, so broken ones can lift and crack in a ruin
            for (let x = x0; x < x1 - .1; x += SQ) for (let z = z0; z < z1 - .1; z += SQ) {
              const sx = Math.min(SQ, x1 - x), sz = Math.min(SQ, z1 - z), cx = x + sx / 2, cz = z + sz / 2;
              const lift = state === "r" && r.chance(.25) ? rotEuler(r.range(-.12, .12), 0, r.range(-.12, .12)) : state === "d" && r.chance(.08) ? rotEuler(r.range(-.05, .05), 0, r.range(-.05, .05)) : null;
              if (state === "r" && r.chance(.06)) continue;
              box(B, cx, WH / 2 + (lift ? .3 : 0), cz, sx - .35, WH, sz - .35, jit(walk, r, .04), M.concrete, { rot: lift });
            }
            box(B, (x0 + x1) / 2, .5, (z0 + z1) / 2, w, 1, d, joint, M.concrete, { edge: false });
          };
          const line = (x0, z0, x1, z1, col, dash) => {
            const along = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = along ? x1 - x0 : z1 - z0;
            const segs = dash ? Math.floor(Math.abs(L) / 12) : 1;
            for (let i = 0; i < segs; i++) {
              if (state !== "i" && r.chance(state === "d" ? .25 : .5)) continue;
              const t0 = dash ? (i * 12 + 2) / Math.abs(L) : 0, t1 = dash ? (i * 12 + 8) / Math.abs(L) : 1;
              const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
              box(B, (ax + bx) / 2, RH + .03, (az + bz) / 2, Math.max(.5, Math.abs(bx - ax)), .06, Math.max(.5, Math.abs(bz - az)), col, M.plain, { edge: false });
            }
          };
          const zebra = (cx, cz, alongX) => { for (let i = -3; i <= 3; i++) { if (state !== "i" && r.chance(state === "d" ? .2 : .45)) continue; const o = i * 10; box(B, cx + (alongX ? o : 0), RH + .03, cz + (alongX ? 0 : o), alongX ? 5 : 14, .06, alongX ? 14 : 5, wht, M.plain, { edge: false }); } };
          const h = SQ * 2.5, rw = SQ * 1.5; // half the piece, half the roadway
          if (p.kind === "highway") {
            const W = p.W, D = p.D, med = SQ * .5;
            road(-W / 2, -D / 2, W / 2, D / 2);
            for (const s of [-1, 1]) {
              // each carriageway: an edge line by the shoulder, one by the median, a dashed line between its two lanes
              line(-W / 2, s * (D / 2 - SQ * .5), W / 2, s * (D / 2 - SQ * .5), wht, false);
              line(-W / 2, s * (med + 2), W / 2, s * (med + 2), yel, false);
              line(-W / 2, s * (med + 2 + SQ * 1.6), W / 2, s * (med + 2 + SQ * 1.6), wht, true);
              box(B, 0, .25, s * (D / 2 - SQ * .25), W, .5, SQ * .5, C("#5a5a58"), M.concrete, { edge: false }); // the gravel shoulder's edge
            }
            // the median barrier, in sections; a ruin has some knocked askew or gone
            for (let x = -W / 2 + 2; x < W / 2 - 1; x += 12) {
              if (state === "r" && r.chance(.25)) continue;
              const rot = state === "r" && r.chance(.4) ? rotEuler(0, r.range(-.5, .5), 0) : state === "d" && r.chance(.15) ? rotEuler(0, r.range(-.2, .2), 0) : null;
              box(B, x + 5.5, 3, 0, 11.4, 6, 3.4, jit(C("#b8b4aa"), r, .04), M.concrete, { rot }); box(B, x + 5.5, .8, 0, 11.4, 1.6, 6, C("#a8a49a"), M.concrete, { rot });
            }
            if (state !== "i") for (let i = 0; i < (state === "r" ? 10 : 4); i++) box(B, r.range(-W / 2 + 8, W / 2 - 8), RH + .02, r.range(-D / 2 + 8, D / 2 - 8), r.range(6, 16), .05, r.range(4, 10), C("#2a2a2c"), M.tar, { edge: false });
            return;
          }
          if (p.kind === "runway" || p.kind === "taxi" || p.kind === "apron") {
            const W = p.W, D = p.D, run = p.kind === "runway";
            if (p.kind === "apron") {
              // concrete in big slabs with sealed joints
              const sl = SQ * 2;
              for (let x = -W / 2; x < W / 2 - .1; x += sl) for (let z = -D / 2; z < D / 2 - .1; z += sl) {
                const w = Math.min(sl, W / 2 - x), d = Math.min(sl, D / 2 - z); if (state === "r" && r.chance(.05)) continue;
                const lift = state === "r" && r.chance(.15) ? rotEuler(r.range(-.05, .05), 0, r.range(-.05, .05)) : null;
                box(B, x + w / 2, RH / 2, z + d / 2, w - .5, RH, d - .5, jit(C("#a8a49a"), r, .05), M.concrete, { edge: false, rot: lift });
              }
              box(B, 0, .2, 0, W, .4, D, C("#4a4844"), M.concrete, { edge: false });
            } else {
              road(-W / 2, -D / 2, W / 2, D / 2);
              if (run) {
                // edge lines, the centre line in long dashes, a threshold of piano keys and the runway number at a marked end
                line(-W / 2, -D / 2 + 3, W / 2, -D / 2 + 3, wht, false); line(-W / 2, D / 2 - 3, W / 2, D / 2 - 3, wht, false);
                for (let x = -W / 2 + 10; x < W / 2 - 30; x += 50) { if ((p.ends.includes("w") && x < -W / 2 + 120) || (p.ends.includes("e") && x > W / 2 - 150)) continue; if (state !== "i" && r.chance(state === "d" ? .25 : .5)) continue; box(B, x + 15, RH + .03, 0, 30, .06, 2, wht, M.plain, { edge: false }); }
                for (const end of p.ends) {
                  const sx = end === "w" ? -1 : 1, ex = sx * W / 2, inward = -sx;
                  for (let i = 0; i < 12; i++) { if (state !== "i" && r.chance(state === "d" ? .15 : .4)) continue; const z = -D / 2 + 14 + i * (D - 28) / 11; if (Math.abs(z) < 12) continue; box(B, ex + inward * 22, RH + .03, z, 36, .06, 5, wht, M.plain, { edge: false }); }
                  const num = String(end === "w" ? p.num : ((p.num + 17) % 36) + 1).padStart(2, "0");
                  digits(B, num, ex + inward * 78, RH + .04, 0, 50, wht, sx < 0 ? -Math.PI / 2 : Math.PI / 2);
                }
              } else {
                line(-W / 2, 0, W / 2, 0, yel, false);
                for (const sd of [-1, 1]) for (let x = -W / 2 + 12; x < W / 2; x += 50) { if (state === "r" && r.chance(.5)) continue; box(B, x, 2, sd * (D / 2 - 2), 1.6, 3, 1.6, C("#2a5aa8"), M.plain); }
              }
            }
          } else if (p.kind === "lot") {
            const W = p.W, D = p.D;
            road(-W / 2, -D / 2, W / 2, D / 2);
            side(-W / 2, -D / 2, W / 2, -D / 2 + SQ * .5); side(-W / 2, -D / 2 + SQ * .5, -W / 2 + SQ * .5, D / 2); side(W / 2 - SQ * .5, -D / 2 + SQ * .5, W / 2, D / 2);
            // bays 1.6 squares wide and 3.4 deep (a car is about 3.2 long), a row along each long edge of a deep lot
            const bay = SQ * 1.6, rows = p.ld >= 9 ? 2 : 1;
            for (let row = 0; row < rows; row++) {
              const z0 = row ? D / 2 - SQ * 3.9 : -D / 2 + SQ * .5, z1 = z0 + SQ * 3.4, n = Math.floor((W - SQ) / bay);
              for (let i = 0; i <= n; i++) { const x = -W / 2 + SQ * .5 + i * bay; line(x, z0, x, z1, wht, false); }
              for (let i = 0; i < n; i++) { if (state === "r" && r.chance(.4)) continue; const x = -W / 2 + SQ * .5 + (i + .5) * bay, zz = row ? z1 - 3 : z0 + 3; box(B, x, .9, zz, 16, 1.2, 2.2, C("#c8c4b8"), M.concrete); }
            }
          } else if (p.kind === "straight") {
            const W = p.W;
            road(-W / 2, -rw, W / 2, rw); side(-W / 2, -h, W / 2, -rw); side(-W / 2, rw, W / 2, h);
            line(-W / 2, -.7, W / 2, -.7, yel, false); line(-W / 2, .7, W / 2, .7, yel, false);
            line(-W / 2, -rw + 2, W / 2, -rw + 2, wht, false); line(-W / 2, rw - 2, W / 2, rw - 2, wht, false);
          } else {
            road(-rw, -rw, rw, rw);
            const arms = { cross: ["w", "e", "n", "s"], tee: ["w", "e", "s"], corner: ["w", "s"] }[p.kind];
            const has = (k) => arms.includes(k);
            // each side of the box is either road going on or sidewalk closing it off
            for (const k of ["w", "e", "n", "s"]) {
              const [x0, z0, x1, z1] = { w: [-h, -rw, -rw, rw], e: [rw, -rw, h, rw], n: [-rw, -h, rw, -rw], s: [-rw, rw, rw, h] }[k];
              if (has(k)) { road(x0, z0, x1, z1); if (k === "w" || k === "e") zebra((x0 + x1) / 2, 0, false); else zebra(0, (z0 + z1) / 2, true); }
              else side(x0, z0, x1, z1);
            }
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) side(sx < 0 ? -h : rw, sz < 0 ? -h : rw, sx < 0 ? -rw : h, sz < 0 ? -rw : h);
          }
          // wear: cracks and potholes, craters and rubble in a ruin
          if (state !== "i") {
            const n = state === "d" ? 6 : 14, W = p.W, D = p.D;
            for (let i = 0; i < n; i++) {
              const x = r.range(-W / 2 + 4, W / 2 - 4), z = r.range(-D / 2 + 4, D / 2 - 4);
              box(B, x, RH + .02, z, r.range(6, 22), .05, r.range(.4, .9), C("#1e1f20"), M.plain, { edge: false, rot: rotEuler(0, r.range(0, 3.14), 0) });
              if (r.chance(state === "d" ? .3 : .5)) box(B, x + r.range(-6, 6), RH + .02, z + r.range(-6, 6), r.range(4, 9), .05, r.range(3, 7), C("#242322"), M.rubble, { edge: false, rot: rotEuler(0, r.range(0, 3), 0) });
            }
            if (state === "r") for (let i = 0; i < 2; i++) rubble(ctx, r.range(-W / 3, W / 3), 0, r.range(-D / 4, D / 4), r.range(6, 12), r.range(2, 4), 26, [C("#4a4a48"), walk, C("#2a2a2a")]);
          }
        },
      },
      house: {
        name: "Suburban house", sub: "siding, porch, gable roof",
        plan(r) {
          const W = SQ * r.pick([4, 4.5, 5]), D = SQ * r.pick([3.5, 4]), n = r.pick([1, 2, 2]);
          const storeys = [{ base: 0, H: 46 }]; if (n === 2) storeys.push({ base: 46, H: 42 });
          return {
            W, D, T: 2.8, storeys, top: 46 + (n === 2 ? 42 : 0), wallCol: r.pick(PAL.siding), wallMat: M.siding, trim: C("#ece8de"),
            frameCol: C("#ece8de"), doorCol: r.pick(PAL.door), roofCol: r.pick(PAL.shingle), shutters: r.chance(.5) ? r.pick([C("#2e3e4e"), C("#3a4a32"), C("#6a2a26"), C("#2a2a2a")]) : null,
            pitch: r.range(.65, .9), porch: r.chance(.75), chimney: r.chance(.6), doorAt: r.range(.3, .45), seed: r.int(0, 1e9),
          };
        },
        floors(p) { return p.storeys.length === 2 ? ["Ground floor", "Upstairs", "Roof"] : ["Ground floor", "Roof"]; },
        draw(ctx, p, lvl) {
          const { r, B } = ctx, S = sidesOf(p.W, p.D, p.T), n = p.storeys.length;
          if (lvl === n) {
            gableRoof({ ...ctx, roofCol: p.roofCol }, p.top, p.pitch, { overhang: 4.5, col: p.roofCol, mat: M.shingle, missing: ctx.state === "d" ? .15 : 0 });
            if (p.chimney) {
              const x = -p.W / 2 + 10, rise = (p.D / 2) * p.pitch;
              if (!ctx.brk || ctx.brk(x, 0) > p.top + rise * .5) { box(B, x, p.top + rise * .6, -p.D * .12, 9, rise * 1.2 + 16, 7, ctx.tintCol(p.stoneChim ? C("#8a847a") : C("#8a4a36")), p.stoneChim ? M.concrete : M.brick, { edge: false }); box(B, x, p.top + rise * 1.2 + 8.5, -p.D * .12, 10, 1.2, 8, C("#b0aaa0"), M.concrete); }
            }
            return;
          }
          const st = p.storeys[lvl], ops = {}, L = S.front.L;
          if (lvl === 0) st.bands = [{ y0: 0, y1: 5, col: p.log ? C("#7a7468") : C("#8a7a6a"), mat: M.concrete }, { y0: 5, y1: st.H, col: p.wallCol, mat: p.wallMat ?? M.siding }];
          const sh = p.shutters;
          if (lvl === 0) {
            const dc = L * p.doorAt;
            ops.front = [{ s0: dc - 8, s1: dc + 8, y0: 5, y1: 38, kind: "door", doorCol: p.doorCol }, win((dc + 8 + L) / 2, 16, 15, 22, { shutters: sh })];
            if (dc - 8 > 22) ops.front.push(win((dc - 8) / 2, 12, 15, 22, { shutters: sh }));
          } else ops.front = bays(L, 26, 10).map((c) => win(c, 13, 11, 21, { shutters: sh }));
          ops.back = bays(S.back.L, 30, 12).map((c) => win(c, 13, 14, 20));
          ops.left = bays(S.left.L, 36, 14).map((c) => win(c, 12, 14, 20));
          ops.right = bays(S.right.L, 36, 14).map((c) => win(c, 12, 14, 20));
          if (lvl === 0) ops.back.push({ s0: S.back.L - 24, s1: S.back.L - 10, y0: 5, y1: 37, kind: "door", doorCol: p.doorCol });
          const hole = n === 2 ? [p.W / 2 - p.T - 11, -p.D / 2 + p.T, p.W / 2 - p.T, -p.D / 2 + p.T + 46] : null;
          finishStorey(ctx, { ...p, course: false, floorCol: PAL.floorWood, floorMat: M.wood, stairX: p.W / 2 - p.T - 11 }, S, st, lvl, ops, hole);
          if (lvl === 0 && p.porch) {
            const dc = L * p.doorAt, pw = 44, s0 = clampN(dc - pw / 2, -2, L - pw + 2), pd = 18;
            const reach = ctx.brk ? ctx.brk(...at(S.front, dc, -pd / 2)) : 999;
            wb(B, S.front, s0, s0 + pw, 0, 5, -pd, 0, C("#8a7a6a"), M.concrete, { edge: false });
            wb(B, S.front, s0, s0 + pw, 5, 5.8, -pd, 0, PAL.floorWood, M.wood);
            wb(B, S.front, dc - 7, dc + 7, 0, 2.6, -pd - 4, -pd, C("#8a7a6a"), M.concrete);
            if (reach > 30) {
              for (const s of [s0 + 1, s0 + pw - 2.6]) wb(B, S.front, s, s + 1.6, 5.8, 38, -pd + 1, -pd + 2.6, p.trim, M.plain);
              const tip = ctx.state === "d" && r.chance(.4) ? r.range(.4, .7) : .22;
              if (ctx.state !== "r" || r.chance(.3)) wb(B, S.front, s0 - 2, s0 + pw + 2, 39, 40.4, -pd - 3, 0, p.roofCol, M.shingle, { tip });
              for (let s = s0 + 4; s < s0 + pw - 3; s += 3) if (Math.abs(s - dc) > 8) wb(B, S.front, s - .3, s + .3, 5.8, 13, -pd + 1.2, -pd + 1.8, p.trim, M.plain);
            }
          }
          INSIDE.house(ctx, p, lvl, lvl === 0 ? 3 : st.base);
        },
      },      /* ---------- the country (13 Nov 2026): barns, silos, cabins, and what crosses water and roads ---------- */
      /* ---------- the mall (13 Nov 2026, the flagship): a two-level enclosed mall on the dumbbell plan real regional
         malls use: a department store anchoring each end, a two-level concourse of in-line shops between them, a
         centre court open through both floors with escalators and a skylight, a food court upstairs, a service corridor
         behind the back shops, and an open-air courtyard at the main entrance. Front (+z) faces the parking. ---------- */
      mall: {
        name: "Shopping mall", sub: "two anchors, a two-level concourse, centre court, food court, courtyard entrance", structure: true,
        plan(r) {
          const W = SQ * r.pick([42, 44, 46]), D = SQ * 22, A = SQ * r.pick([9, 10]), cy = SQ * r.pick([4.5, 5]);
          const nameN = r.int(6, 9), wallCol = r.pick([C("#d8cfbe"), C("#c9bba4"), C("#d6d2c8"), C("#bfb3a0")]);
          // the shops along each band of the wing, from west to east, each with what it sells
          const THEMES = ["clothing", "clothing", "shoes", "electronics", "books", "jewelry", "cafe", "toys", "sports", "phone", "clothing", "pharmacy", "vacant", "gifts"];
          const wing = W - 2 * A, fill = (x0, x1, out) => { let x = x0; while (x < x1 - 1) { let w = SQ * r.pick([3, 3.5, 4, 4, 5]); if (x1 - x - w < SQ * 2.5) w = x1 - x; const b = Math.min(x1, x + w); out.push({ x0: x, x1: b, theme: r.pick(THEMES), sign: r.pick(PAL.sign) }); x = b; } return out; }, mk = (x0, x1, skip) => { const out = []; if (skip) { fill(x0, skip[0], out); fill(skip[1], x1, out); } else fill(x0, x1, out); return out; };
          const cx = SQ * r.pick([4, 4.5]), fx = SQ * r.pick([5, 6]);
          return {
            W, D, T: 3, A, wing, cy, cx, fx, storeys: [{ base: 0, H: 58 }, { base: 58, H: 52 }], top: 110, noRoof: false,
            wallCol, wallMat: M.concrete, anchorCols: [r.pick([C("#b8a890"), C("#9a8e80"), C("#c8c0b0")]), r.pick([C("#8a7e70"), C("#b0a898"), C("#a89880")])], course: true,
            frameCol: r.pick([C("#3a4048"), C("#6a6e72"), C("#2e3236")]), doorCol: C("#3a4a56"), floorCol: C("#d0ccc2"), floorMat: M.tile, trim: C("#e6e2d6"),
            // the concourse: its back and front edges (z), the service corridor's depth, the courtyard notch
            zs: -D / 2 + 3 + SQ * 1.5, zc0: -SQ * 1, zc1: SQ * 4, back: mk(-wing / 2, wing / 2, [-fx, fx]), backL: mk(-wing / 2, wing / 2, [-SQ * 2.6, SQ * 2.6]), front: mk(-wing / 2, wing / 2, [-cy, cy]),
            brand: r.pick(PAL.sign), anchorBrand: [r.pick(PAL.sign), r.pick(PAL.sign)], letters: nameN, ruin: [.25, .45, .35, .7], seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Lower level", "Upper level", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B, r, state } = ctx, W = p.W, D = p.D, T = p.T, A = p.A, hw = p.wing / 2, ruined = state === "r";
          const zf = D / 2, zb = -D / 2, zs = p.zs, zc0 = p.zc0, zc1 = p.zc1, cy = p.cy, cx = p.cx;
          const st = lvl < 2 ? p.storeys[lvl] : null, y = lvl === 0 ? 3 : 58, H = st ? st.H - (lvl === 0 ? 3 : 0) : 0;
          const ok = (x, z, h) => !ctx.brk || ctx.brk(x, z) > h;
          // a wall from a to b (plan points) in this storey, with openings ops along it; o: colour, material, thickness
          const line = (a, b, ops = [], o = {}) => {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) return;
            const Ad = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], S = { L, O: a, A: Ad, I: o.flip ? [-Ad[1], Ad[0]] : [Ad[1], -Ad[0]] };
            const save = { wallCol: ctx.wallCol, wallMat: ctx.wallMat, course: ctx.course, T: ctx.T };
            Object.assign(ctx, { wallCol: o.col || ctx.plasterCol, wallMat: o.mat || M.plain, course: !!o.course, T: o.T || 1.8 });
            ops.forEach((q) => { q.S = S; q.base = st.base + (lvl === 0 ? 3 : 0); });
            weather(ctx, ops, lvl);
            storeyWalls(ctx, S, { base: st.base + (lvl === 0 ? 3 : 0), H: H - .2, bands: o.bands }, ops);
            Object.assign(ctx, save);
            return S;
          };
          // a floor (or roof) deck from (x0, z0) to (x1, z1) with its top at yy; broken into tiles in a ruin
          const deck = (x0, z0, x1, z1, yy, th, col, mat) => {
            if (x1 - x0 < .5 || z1 - z0 < .5) return;
            if (!ctx.brk) { box(B, (x0 + x1) / 2, yy - th / 2, (z0 + z1) / 2, x1 - x0, th, z1 - z0, col, mat, { edge: false }); return; }
            const s = 12.7;
            for (let x = x0; x < x1 - .1; x += s) for (let z = z0; z < z1 - .1; z += s) { const a = Math.min(x + s, x1), c = Math.min(z + s, z1), mx = (x + a) / 2, mz = (z + c) / 2; if (ctx.brk(mx, mz) < yy + 2) continue; box(B, mx, yy - th / 2, mz, a - x - .2, th, c - z - .2, jit(col, r, .04), mat, { edge: false }); }
          };
          // the open voids in the upper floor: the centre court and two light wells along the concourse
          const voids = [[-cx, zc0 + 26, cx, zc1 - 26], [-hw + SQ * 3, zc0 + 30, -cx - SQ * 3, zc1 - 30], [cx + SQ * 3, zc0 + 30, hw - SQ * 3, zc1 - 30]];
          if (lvl === 2) { // the roof: decks over everything but the courtyard and the voids' skylights
            const top = p.top, rf = PAL.tar;
            for (const s of [-1, 1]) { deck(s < 0 ? -W / 2 : W / 2 - A, zb, s < 0 ? -W / 2 + A : W / 2, zf, top + 14, 2, rf, M.tar); }
            deck(-hw, zb, hw, zc0, top + 2, 2, rf, M.tar); deck(-hw, zc1, -cy, zf, top + 2, 2, rf, M.tar); deck(cy, zc1, hw, zf, top + 2, 2, rf, M.tar);
            deck(-hw, zc0, -cx, zc1, top + 2, 2, rf, M.tar); deck(cx, zc0, hw, zc1, top + 2, 2, rf, M.tar);
            // the anchors stand taller: their extra wall above the wing's roof, and parapets all round
            for (const s of [-1, 1]) { const x0 = s < 0 ? -W / 2 : W / 2 - A, x1 = x0 + A, col = p.anchorCols[s < 0 ? 0 : 1];
              for (const [a, b] of [[[x0, zf], [x1, zf]], [[x1, zb], [x0, zb]], [[x0, zb], [x0, zf]], [[x1, zf], [x1, zb]]]) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), Ad = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; storeyWalls({ ...ctx, T: 3, wallCol: col, wallMat: M.concrete, course: false }, { L, O: a, A: Ad, I: [-Ad[1], Ad[0]] }, { base: top, H: 22 }, []); } }
            for (const [a, b] of [[[-hw, zb], [hw, zb]], [[-hw, zf], [-cy, zf]], [[cy, zf], [hw, zf]], [[-cy, zc1], [-cy, zf]], [[cy, zf], [cy, zc1]], [[-cy, zc1], [cy, zc1]]]) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), Ad = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; storeyWalls({ ...ctx, T: 2.4, course: false }, { L, O: a, A: Ad, I: [-Ad[1], Ad[0]] }, { base: top, H: 8 }, []); }
            if (ctx.brk) return;
            // skylights: a glass ridge down the concourse, a glass pyramid over the centre court
            for (const [x0, , x1] of voids.slice(1)) { const L = x1 - x0, mx = (x0 + x1) / 2, mz = (zc0 + zc1) / 2; for (const s of [-1, 1]) box(B, mx, top + 8, mz + s * 11, L, .8, 24, PAL.glass, M.glass, { rot: rotEuler(s * .55, 0, 0) }); box(B, mx, top + 3, mz, L + 2, 4, 48, PAL.metalD, M.metal); }
            deck(-hw, zc0, -cx, zc0 + 0, top + 2, 2, rf, M.tar);
            const pz = (zc0 + zc1) / 2, pw = cx * 2, pd = zc1 - zc0;
            for (let k = 0; k < 4; k++) { const h = 30 * (1 - k / 4); box(B, 0, top + 4 + k * 6, pz, pw * (1 - k / 4.2), 6, pd * (1 - k / 4.2), k % 2 ? PAL.glass : mul(PAL.glass, .9), M.glass); void h; }
            // rooftop units
            for (let i = 0; i < 10; i++) { const x = r.range(-hw + 20, hw - 20), z = r.range(zb + 20, zc0 - 20); box(B, x, top + 7, z, 14, 10, 10, C("#a7aaa8"), M.metal); }
            for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box(B, s * (W / 2 - A / 2) + r.range(-40, 40), top + 20, r.range(zb + 40, zf - 40), 16, 10, 12, C("#a7aaa8"), M.metal);
            return;
          }
          /* ---- a storey ---- */
          const fc = p.floorCol;
          // floors: lower level is one slab; the upper level leaves the courtyard open and the voids cut
          if (lvl === 0) { deck(-W / 2 + T, zb + T, W / 2 - T, zf - T, 3, 3, fc, M.tile); }
          else {
            const cut = (x0, z0, x1, z1) => { // the upper deck over the wing, as pieces around the voids
              const xs = [x0, x1], zsx = [z0, z1]; for (const v of voids) { xs.push(v[0], v[2]); zsx.push(v[1], v[3]); }
              const X = [...new Set(xs)].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b), Z = [...new Set(zsx)].filter((v) => v >= z0 && v <= z1).sort((a, b) => a - b);
              for (let i = 0; i + 1 < X.length; i++) for (let j = 0; j + 1 < Z.length; j++) { const mx = (X[i] + X[i + 1]) / 2, mz = (Z[j] + Z[j + 1]) / 2; if (voids.some((v) => mx > v[0] && mx < v[2] && mz > v[1] && mz < v[3])) continue; deck(X[i], Z[j], X[i + 1], Z[j + 1], 58, 4, fc, M.tile); }
            };
            cut(-hw, zb + T, hw, zc1); deck(-hw, zc1, -cy, zf - T, 58, 4, fc, M.tile); deck(cy, zc1, hw, zf - T, 58, 4, fc, M.tile);
            for (const s of [-1, 1]) { const x0 = s < 0 ? -W / 2 + T : W / 2 - A, x1 = s < 0 ? -W / 2 + A : W / 2 - T, h0 = s < 0 ? x0 + 3 : x1 - 17, h1 = h0 + 14, zh = zb + T + 58; deck(x0, zh, x1, zf - T, 58, 4, mul(fc, .96), M.tile); deck(x0, zb + T, h0, zh, 58, 4, mul(fc, .96), M.tile); deck(h1, zb + T, x1, zh, 58, 4, mul(fc, .96), M.tile); }
            // glass railings round the voids
            if (!ruined) for (const v of voids) { const [x0, z0, x1, z1] = v; for (const [a, b, c, d] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) { const len = Math.hypot(c - a, d - b); box(B, (a + c) / 2, 58 + 5, (b + d) / 2, Math.max(.8, c - a), 10, Math.max(.8, d - b), PAL.glass, M.glass); box(B, (a + c) / 2, 58 + 10.3, (b + d) / 2, Math.max(1.4, c - a), .9, Math.max(1.4, d - b), PAL.metalD, M.metal); void len; } }
          }
          // ---- outside walls ----
          const ext = { col: p.wallCol, mat: M.concrete, T, course: true };
          const shopGlass = (s0, s1) => ({ s0, s1, y0: 4, y1: Math.min(40, H - 10), kind: "shop", frameCol: p.frameCol });
          const doorOp = (c, w = 22) => ({ s0: c - w / 2, s1: c + w / 2, y0: 0, y1: 38, kind: "door", doorCol: p.doorCol });
          // the anchors: blank walls with a grand entrance on the front, a side door, the brand across the top
          for (const s of [-1, 1]) {
            const x0 = s < 0 ? -W / 2 : W / 2 - A, x1 = x0 + A, col = p.anchorCols[s < 0 ? 0 : 1], ao = { ...ext, col };
            const Sf = line([x0, zf], [x1, zf], lvl === 0 ? [shopGlass(A / 2 - 40, A / 2 - 13), doorOp(A / 2, 24), shopGlass(A / 2 + 13, A / 2 + 40)] : [], ao);
            line([x1, zb], [x0, zb], lvl === 0 ? [{ s0: A * .3, s1: A * .3 + 40, y0: 0, y1: 42, kind: "roller", doorCol: C("#8a8e92") }] : [], ao);
            line(s < 0 ? [x0, zb + T] : [x1, zf - T], s < 0 ? [x0, zf - T] : [x1, zb + T], lvl === 0 ? [doorOp((D - 2 * T) * .7, 18)] : [], ao);
            if (lvl === 0 && Sf) { // the entrance canopy and the store's name
              const cz = zf + 14, xc = (x0 + x1) / 2;
              if (ok(xc, zf, 50)) { box(B, xc, 46, cz, 80, 2.4, 28, mul(col, .8), M.concrete); for (const k of [-1, 1]) box(B, xc + k * 36, 23, cz + 10, 3, 46, 3, PAL.metalD, M.metal); }
            }
            if (lvl === 1 && Sf) letters(ctx, Sf, A / 2, 58 + 26, 14, 5, p.anchorBrand[s < 0 ? 0 : 1], -.8);
          }
          // the wing's front, either side of the courtyard: display windows and an entrance into the concourse's ends
          const wingOps = (L0) => lvl === 0 ? [shopGlass(10, L0 * .35), shopGlass(L0 * .45, L0 - 12)] : [];
          line([-hw, zf], [-cy, zf], wingOps(hw - cy), ext); line([cy, zf], [hw, zf], wingOps(hw - cy), ext);
          line([-cy, zf], [-cy, zc1], [], ext); line([cy, zc1], [cy, zf], [], ext);
          // the main entrance: a glass wall from the courtyard into the centre court, double doors in it
          const Se = line([-cy, zc1], [cy, zc1], lvl === 0 ? [shopGlass(4, cy - 26), doorOp(cy - 12, 20), doorOp(cy + 12, 20), shopGlass(cy + 26, 2 * cy - 4)] : [shopGlass(4, 2 * cy - 4)], ext);
          if (lvl === 1 && Se) letters(ctx, Se, cy, 58 + 34, 12, p.letters, p.brand, -.8);
          // the back: service doors and a loading bay
          line([hw, zb], [-hw, zb], lvl === 0 ? [doorOp(hw * .5, 14), { s0: hw - 30, s1: hw + 10, y0: 0, y1: 40, kind: "roller", doorCol: C("#8a8e92") }, doorOp(hw * 1.5, 14)] : [], ext);
          // ---- inside walls ----
          // the anchors open onto the concourse; a stockroom wall across the back of each
          for (const s of [-1, 1]) {
            const xw = s * hw;
            line([xw, zb + T], [xw, zc0], [{ s0: 8, s1: 26, y0: 0, y1: 32, kind: "hole" }], { col: p.wallCol, mat: M.concrete, T: 2.4 }); line([xw, zc1], [xw, zf - T], [], { col: p.wallCol, mat: M.concrete, T: 2.4 });
            // a stockroom across the back, and its door; the stairs up in it
            const xa = s < 0 ? -W / 2 + T : W / 2 - A, xb = s < 0 ? -W / 2 + A : W / 2 - T, zst = zb + T + 56;
            line([xa, zst], [xb, zst], [{ s0: A * .5 - 8, s1: A * .5 + 8, y0: 0, y1: 34, kind: "hole" }], {});
            if (lvl === 0) { const sx = s < 0 ? xa + 4 : xb - 16; stairs(ctx, sx, zb + T + 2, 12, 3, 55); }
            ANCHOR(ctx, p, lvl, y, s, xa, xb, zst, zf - T);
          }
          // the service corridor behind the back shops, with doors from each shop and out to the anchors' stockrooms
          const backShops = lvl === 0 ? p.backL : p.back.filter((q) => q.x1 <= -p.fx || q.x0 >= p.fx);
          line([-hw, zs], [hw, zs], backShops.map((q) => ({ s0: q.x1 - hw - 12, s1: q.x1 - hw - 3, y0: 0, y1: 32, kind: "hole" })).concat(lvl === 0 ? [{ s0: hw - 9, s1: hw + 9, y0: 0, y1: 34, kind: "hole" }] : [{ s0: hw - p.fx + 10, s1: hw - p.fx + 28, y0: 0, y1: 34, kind: "hole" }]), {});
          // the shops: a storefront onto the concourse, walls between them
          const shopRow = (list, zA, zB, faceZ) => {
            for (const q of list) {
              const w = q.x1 - q.x0, sf = faceZ === zc0;
              const ops = q.theme === "vacant" && state !== "i" ? [{ s0: 3, s1: w - 3, y0: 0, y1: 36, kind: "roller", doorCol: C("#8a8e92") }] : [{ s0: 3, s1: w * .5 - 8, y0: 4, y1: 34, kind: "shop", frameCol: p.frameCol }, { s0: w * .5 - 8, s1: w * .5 + 8, y0: 0, y1: 34, kind: "hole" }, { s0: w * .5 + 8, s1: w - 3, y0: 4, y1: 34, kind: "shop", frameCol: p.frameCol }];
              const S = line(sf ? [q.x0, faceZ] : [q.x1, faceZ], sf ? [q.x1, faceZ] : [q.x0, faceZ], ops, { col: p.wallCol, mat: M.concrete, T: 2 });
              line([q.x1, zA], [q.x1, zB], [], {});
              // the sign band over the storefront, the shop's name in its colour
              if (S && ok((q.x0 + q.x1) / 2, faceZ, y + 40)) { wb(B, S, 2, w - 2, st.base + 38 + (lvl === 0 ? 3 : 0), st.base + 46 + (lvl === 0 ? 3 : 0), -1.2, 0, DARK, M.plain); letters(ctx, S, w / 2, st.base + 39.5 + (lvl === 0 ? 3 : 0), 5, Math.max(3, Math.min(8, Math.round(w / 12))), q.sign, -1.4); }
              SHOP(ctx, p, q, y, Math.min(zA, zB), Math.max(zA, zB), sf);
            }
          };
          shopRow(lvl === 0 ? p.backL : p.back.filter((q) => q.x1 <= -p.fx || q.x0 >= p.fx), zs, zc0, zc0);
          shopRow(p.front, zf - T, zc1, zc1);
          // the lower level behind the centre court: a corridor through to the service corridor, restrooms either side
          if (lvl === 0) {
            const a = -SQ * 2.6, b = SQ * 2.6;
            line([a, zs], [a, zc0], [], {}); line([b, zc0], [b, zs], [], {});
            line([-SQ * .7, zs], [-SQ * .7, zc0 - 4], [{ s0: 20, s1: 34, y0: 0, y1: 32, kind: "hole" }], {}); line([SQ * .7, zc0 - 4], [SQ * .7, zs], [{ s0: 20, s1: 34, y0: 0, y1: 32, kind: "hole" }], {});
            for (const s of [-1, 1]) { for (let k = 0; k < 4; k++) F.toilet(ctx, s * (SQ * .7 + 8 + k * 10), y, zs + 5, 0); F.counter(ctx, s * (SQ * 1.7), y, zc0 - 16, Math.PI, 26, C("#d8d8d0")); }
            line([-SQ * 2.6, zc0], [-SQ * .7, zc0], [], {}); line([SQ * .7, zc0], [SQ * 2.6, zc0], [], {});
          } else {
            // the food court: counters along the back wall under menu boards, tables out into the court
            const fx = p.fx, kinds = ["pizza", "burger", "noodles", "tacos", "pretzel", "coffee"];
            const n = Math.max(3, Math.round(fx * 2 / 50));
            for (let i = 0; i < n; i++) {
              const x0 = -fx + i * 2 * fx / n, x1 = x0 + 2 * fx / n, mx = (x0 + x1) / 2, col = PAL.sign[(i + p.seed) % PAL.sign.length];
              if (i) line([x0, zs], [x0, zs + 30], [], {});
              F.counter(ctx, mx, y, zs + 24, Math.PI, x1 - x0 - 8, mul(col, .8)); F.oven(ctx, mx - 6, y, zs + 6, 0); F.fridge(ctx, mx + 8, y, zs + 6, 0);
              if (ok(mx, zs + 30, y + 40)) { box(B, mx, y + 40, zs + 30.5, x1 - x0 - 6, 8, 1, col, M.plain); box(B, mx, y + 36, zs + 31, x1 - x0 - 10, 1.2, .4, WHITE, M.plain); }
              void kinds;
            }
            for (let x = -fx + 18; x < fx - 12; x += 32) for (let z = zs + 52; z < zc0 + 10; z += 30) { F.table(ctx, x, y, z, 0, 12, 12); F.chair(ctx, x - 8, y, z, Math.PI / 2); F.chair(ctx, x + 8, y, z, -Math.PI / 2); }
            for (const s of [-1, 1]) line([s * fx, zs], [s * fx, zc0], [], {});
          }
          // ---- the concourse ----
          const mz = (zc0 + zc1) / 2;
          if (lvl === 0) {
            // the centre court: escalators up to the upper level, a fountain, benches and planters; kiosks down the concourse
            ESCALATOR(ctx, -46, mz - 9, 92, 3, 58, 1); ESCALATOR(ctx, 46, mz + 9, 92, 3, 58, -1);
            for (const [x, z] of [[-cx + 16, zc0 + 14], [cx - 16, zc1 - 14]]) F.plant(ctx, x, y, z);
            for (const x of [-hw + 50, -cx - 60, cx + 60, hw - 50]) { piece(ctx, x, y, mz, 0, (put, L) => { const c = L.pick(PAL.sign); put(0, 9, 0, 22, 18, 12, mul(c, .7), M.plain); put(0, 18.5, 0, 24, 1, 14, C("#e8e4dc"), M.plain); put(0, 26, 0, 24, 1.2, 14, c, M.plain); for (const a of [-1, 1]) put(a * 11, 22, 0, 1, 8, 1, PAL.metal, M.metal); }); F.bench(ctx, x, y, mz + 26, Math.PI, 20); F.bench(ctx, x, y, mz - 26, 0, 20); }
            for (const x of [-hw + 90, hw - 90]) { F.plant(ctx, x, y, mz - 10); F.plant(ctx, x, y, mz + 10); }
          } else {
            for (const x of [-hw + 60, hw - 60]) { F.bench(ctx, x, y, zc0 + 10, 0, 20); F.plant(ctx, x + 18, y, zc0 + 8); }
          }
          // the elevator: a glass shaft at the centre court's edge
          if (ok(cx + 10, zc1 - 12, y + 30)) { box(B, cx + 12, (lvl === 0 ? 3 : 58) + H / 2, zc1 - 14, 16, H, 16, PAL.glass, M.glass); box(B, cx + 12, (lvl === 0 ? 3 : 58) + 1, zc1 - 14, 16.6, 2, 16.6, PAL.metalD, M.metal); }
          // ---- the courtyard (lower level only): paving, a fountain, planters with trees, benches, the arch over its mouth ----
          if (lvl === 0) {
            box(B, 0, .3, (zc1 + zf) / 2 + 10, cy * 2 - 2, .6, zf - zc1 + 20, C("#b8b0a2"), M.concrete, { edge: false });
            const fz = (zc1 + zf) / 2;
            if (ok(0, fz, 10)) { cyl(B, 0, .6, fz, 24, 24, 5, 24, C("#a8a29a"), M.concrete); cyl(B, 0, 5.4, fz, 22, 22, .2, 24, PAL.glass, M.glass); cyl(B, 0, 5, fz, 5, 3, 12, 12, C("#a8a29a"), M.concrete); cyl(B, 0, 17, fz, 7, 7, 1.2, 12, C("#a8a29a"), M.concrete); }
            for (const s of [-1, 1]) for (const z of [zc1 + 24, zf - 18]) { box(B, s * (cy - 18), 3, z, 18, 6, 18, C("#8a8278"), M.concrete); box(B, s * (cy - 18), 6.2, z, 16, .6, 16, C("#4a3a2a"), M.plain); cyl(B, s * (cy - 18), 6, z, 1.2, .9, 20, 6, C("#5a4030"), M.wood); for (let k = 0; k < 3; k++) box(B, s * (cy - 18) + r.range(-3, 3), 26 + k * 3, z + r.range(-3, 3), 14 - k * 3, 6, 14 - k * 3, C("#4a7a3a"), M.plain); }
            for (const s of [-1, 1]) F.bench(ctx, s * (cy - 18), y - 3, fz, s * Math.PI / 2, 22);
            if (ok(0, zf, 60)) { for (const s of [-1, 1]) box(B, s * (cy - 4), 34, zf + 2, 8, 68, 8, mul(p.wallCol, .9), M.concrete); const Sa = { L: cy * 2, O: [-cy, zf + 6.5], A: [1, 0], I: [0, -1] }; wb(B, Sa, -4, cy * 2 + 4, 60, 72, 0, 9, mul(p.wallCol, .95), M.concrete); letters(ctx, Sa, cy, 61.5, 9, p.letters, p.brand, -.6); }
          }
        },
      },
      /* ---------- the city (13 Nov 2026): towers, screens, the red steps ---------- */
      skyscraper: {
        name: "Skyscraper", sub: "a tower: glass curtain wall, stone with punched windows, or a Times Square podium hung with screens",
        plan(r, seed) {
          const parts = String(seed || "").split("-"), want = ["glass", "stone", "deco", "times", "resi"].includes(parts[0]) ? parts[0] : r.pick(["glass", "glass", "stone", "deco", "times", "resi"]);
          const W = SQ * r.pick([6, 7, 8]), D = SQ * r.pick([6, 7, 8]), nf = want === "times" ? r.int(16, 30) : r.int(12, 28), FH = 44;
          const tall = 106 + (nf - 2) * FH, sb = want === "deco" || want === "stone" ? [Math.round(nf * r.range(.45, .6)), Math.round(nf * r.range(.75, .85))] : want === "glass" && r.chance(.4) ? [Math.round(nf * .7)] : [];
          const glassCol = r.pick([C("#4a6a7a"), C("#3a5266"), C("#5a7a74"), C("#2e3a48"), C("#6a7e8a"), C("#7a6a52")]);
          const stoneCol = r.pick([C("#b8ae9c"), C("#a89c88"), C("#c8c0b0"), C("#8a6a5a"), C("#9a8676"), C("#d0c8b8")]);
          return {
            W, D, T: 3, nf, FH, tall, setbacks: sb, style: want, glassCol, stoneCol, storeys: [{ base: 0, H: 60 }, { base: 60, H: 46 }], top: tall,
            wallCol: want === "glass" ? mul(glassCol, .7) : stoneCol, wallMat: want === "glass" ? M.concrete : M.concrete, course: true, noPartition: true, noPipes: true,
            frameCol: r.pick([C("#2a2e32"), C("#6a6e72"), C("#b8a070")]), doorCol: C("#2a3036"), floorCol: r.pick([C("#c8c4bc"), C("#d8d2c6"), C("#9a9690")]), floorMat: M.tile, stairX: -W / 2 + 3,
            crown: r.pick(["flat", "tank", "spire", "crown", "flat"]), screens: want === "times" ? r.int(4, 8) : want === "glass" && r.chance(.2) ? 1 : 0, brand: r.pick(PAL.sign), ruin: [.12, .35, .3, .7], seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Lobby", "Second floor", "Tower"]; },
        draw(ctx, p, lvl) {
          const { B, r, state } = ctx, S = sidesOf(p.W, p.D, p.T), W = p.W, D = p.D, glassy = p.style === "glass", facM = glassy ? M.curtain : M.punched, facC = glassy ? p.glassCol : p.stoneCol;
          if (lvl < 2) {
            const st = p.storeys[lvl], L = S.front.L, y = lvl === 0 ? 3 : 60;
            const ops = {};
            if (lvl === 0) {
              ops.front = [{ s0: 4, s1: L / 2 - 14, y0: 5, y1: 44, kind: "shop", frameCol: p.frameCol }, { s0: L / 2 - 12, s1: L / 2 + 12, y0: 3, y1: 42, kind: "door", doorCol: p.doorCol, canopy: true }, { s0: L / 2 + 14, s1: L - 4, y0: 5, y1: 44, kind: "shop", frameCol: p.frameCol }];
              ops.left = [{ s0: 6, s1: S.left.L - 6, y0: 6, y1: 42, kind: "shop", frameCol: p.frameCol }];
              ops.right = [{ s0: 6, s1: S.right.L / 2 - 4, y0: 6, y1: 42, kind: "shop", frameCol: p.frameCol }];
              ops.back = [{ s0: S.back.L / 2 - 8, s1: S.back.L / 2 + 8, y0: 3, y1: 36, kind: "door", doorCol: C("#5a5e62") }];
            } else for (const k of ["front", "back", "left", "right"]) ops[k] = bays(S[k].L, 13, 6).map((c) => win(c, 9, 10, 30));
            finishStorey(ctx, p, S, st, lvl, ops, [-W / 2 + 3, -D / 2 + 3, -W / 2 + 15, -D / 2 + 60]);
            // the core: lifts and a stair in the middle back, the same on both floors
            const cw = Math.min(46, W * .35), cz = -D * .12;
            if (!ctx.brk || ctx.brk(0, cz) > y + 30) { box(B, 0, y + st.H / 2 - 1.5, cz, cw, st.H - 3, 22, C("#b8b4aa"), M.concrete); for (const k of [-1, 0, 1]) box(B, k * cw / 3.2, y + 15, cz + 11.2, 8, 30, .6, C("#8a8e92"), M.metal); }
            ctx.y0 = y; ctx.looted = state !== "i";
            if (lvl === 0) {
              F.counter(ctx, 0, y, cz + 28, Math.PI, Math.min(36, W * .3), C("#2e2a28"));
              for (const k of [-1, 1]) { piece(ctx, k * 14, y, cz + 46, 0, (put) => { for (let i = 0; i < 3; i++) { put(i * 4 - 4, 5, 0, 1.2, 10, 8, C("#8a8e92"), M.metal); put(i * 4 - 4, 10.5, 0, 1.6, .6, 8, PAL.glass, M.glass); } }, { fixed: true }); F.plant(ctx, k * (W / 2 - 12), y, D / 2 - 14); F.bench(ctx, k * (W / 2 - 18), y, cz + 60, Math.PI / 2 * k, 20); }
            } else {
              for (let x = -W / 2 + 22; x < W / 2 - 16; x += 40) for (let z = -D / 2 + 20; z < D / 2 - 14; z += 30) { if (Math.abs(x) < cw / 2 + 14 && Math.abs(z - cz) < 26) continue; F.cubicle(ctx, x, y, z, 0); }
            }
            return;
          }
          // ---- the tower: the shaft above the second floor, set back as it climbs, its facade drawn by the material ----
          const y0 = 106, top = p.tall, steps = [y0, ...p.setbacks.map((f) => 106 + (f - 2) * p.FH), top], inset = [0, SQ, SQ * 2];
          slab(ctx, y0, 4, PAL.concreteD, M.concrete, null, true);
          for (let i = 0; i + 1 < steps.length; i++) {
            const a = steps[i], b = steps[i + 1], e = inset[Math.min(i, 2)], w = W - 2 * e, d = D - 2 * e;
            // in vertical strips a bay wide, so a ruin breaks off unevenly and a damaged one loses panels
            const bay = 12.7;
            for (const [fx, fz, len, axis] of [[0, d / 2, w, "x"], [0, -d / 2, w, "x"], [w / 2, 0, d, "z"], [-w / 2, 0, d, "z"]]) {
              const n = Math.max(1, Math.round(len / bay)), bw = len / n;
              for (let k = 0; k < n; k++) {
                const o = -len / 2 + (k + .5) * bw, x = axis === "x" ? o : fx, z = axis === "x" ? fz : o;
                let h = b; if (ctx.brk) h = Math.min(b, ctx.brk(x, z)); if (h <= a + 2) continue;
                const hole = state === "d" && r.chance(.06), gap = hole ? r.range(20, 80) : 0, hm = hole ? r.range(a, h - gap) : 0;
                const put = (yy0, yy1) => { if (yy1 - yy0 < 1) return; box(B, x - (axis === "z" ? Math.sign(fx) * 1.4 : 0), (yy0 + yy1) / 2, z - (axis === "x" ? Math.sign(fz) * 1.4 : 0), axis === "x" ? bw + .02 : 2.8, yy1 - yy0, axis === "z" ? bw + .02 : 2.8, facC, facM, { edge: false }); };
                if (hole) { put(a, hm); put(hm + gap, h); } else put(a, h);
              }
            }
            // the floor plates showing as the shell's lid at each setback, a parapet round it
            const lidY = ctx.brk ? null : b;
            if (lidY != null) { box(B, 0, b + 1, 0, w, 2, d, PAL.tar, M.tar); for (const [dx, dz, ww, dd] of [[0, d / 2 - .8, w, 1.6], [0, -d / 2 + .8, w, 1.6], [w / 2 - .8, 0, 1.6, d], [-w / 2 + .8, 0, 1.6, d]]) box(B, dx, b + 4, dz, ww, 6, dd, mul(facC, .8), M.concrete); }
          }
          if (ctx.brk) { ctx.soot.push([0, 0, Math.min(top, ctx.brk(0, 0)), W / 2]); return; }
          // the crown: a water tank on legs, a spire, a stepped stone crown, or plant on a flat roof
          const e = inset[Math.min(steps.length - 2, 2)], w = W - 2 * e;
          if (p.crown === "tank") { for (const a of [-1, 1]) for (const b of [-1, 1]) box(B, a * 6, top + 6, b * 6, 1.4, 12, 1.4, PAL.woodD, M.wood); cyl(B, 0, top + 12, 0, 9, 9, 16, 14, PAL.wood, M.wood); cyl(B, 0, top + 28, 0, 9.6, 1, 6, 14, C("#4a4a48"), M.metal); }
          else if (p.crown === "spire") { box(B, 0, top + 10, 0, w * .4, 20, w * .4, mul(facC, .9), M.concrete); cyl(B, 0, top + 20, 0, 2.5, .3, 90, 8, C("#c8ccd0"), M.metal); }
          else if (p.crown === "crown") { for (let k = 0; k < 3; k++) box(B, 0, top + 6 + k * 10, 0, w * (.8 - k * .22), 10, w * (.8 - k * .22), k % 2 ? mul(facC, .85) : facC, M.punched); }
          else for (let i = 0; i < 4; i++) box(B, r.range(-w / 3, w / 3), top + 6, r.range(-w / 3, w / 3), 14, 8, 10, C("#a7aaa8"), M.metal);
          // screens: on a Times Square podium, wrapped round the lower floors, lit; a glass tower may carry one high up
          if (p.screens) {
            const fronts = [[0, D / 2, W, "x", 1], [W / 2, 0, D, "z", 1], [-W / 2, 0, D, "z", -1]];
            const L2 = ctx.lay("screens");
            for (let i = 0; i < p.screens; i++) {
              const [fx, fz, len, axis] = fronts[i % fronts.length], sw = Math.min(len - 6, L2.range(len * .5, len * .95)), sh = L2.range(40, 110), sy = 70 + L2.range(0, Math.min(260, top - 200)), off = L2.range(-(len - sw) / 2, (len - sw) / 2);
              const x = axis === "x" ? off : fx + Math.sign(fx) * 2.4, z = axis === "x" ? fz + 2.4 : off, col = L2.pick([C("#e83a2a"), C("#2a8ae8"), C("#f8c818"), C("#18c88a"), C("#e82a9a"), C("#f87818"), C("#8a4ae8"), C("#f0f0f0")]);
              box(B, x, sy, z, axis === "x" ? sw : 1.6, sh, axis === "x" ? 1.6 : sw, col, M.screen, { edge: false });
              box(B, x - (axis === "z" ? Math.sign(fx) * 1 : 0), sy, z - (axis === "x" ? 1 : 0), axis === "x" ? sw + 2 : 1, sh + 2, axis === "x" ? 1 : sw + 2, DARK, M.metal, { edge: false });
            }
            // the news ticker: a band of light round the tower above the podium
            if (p.style === "times") { const ty = 64 + L2.range(20, 40); box(B, 0, ty, 0, W + 5, 7, D + 5, C("#f8a818"), M.screen, { edge: false }); }
          }
        },
      },
      bleachers: {
        name: "Red steps", sub: "tiered red glass steps over a ticket booth, a square's grandstand", structure: true,
        plan(r) { return { W: SQ * 6, D: SQ * 5, T: 1, storeys: [{ base: 0, H: 4 }], top: 46, noRoof: true, n: 9, seed: r.int(0, 1e9) }; },
        floors() { return ["Steps"]; },
        draw(ctx, p) {
          const { B, state, r } = ctx, W = p.W, D = p.D, n = p.n, rise = 4.6, run = D / n;
          for (let i = 0; i < n; i++) {
            if (state === "r" && r.chance(.35)) continue;
            const z = D / 2 - run * (i + .5), y = rise * (i + 1);
            box(B, 0, y - .6, z, W, 1.2, run, state === "i" ? C("#c8241e") : mul(C("#a8241e"), .8), M.screen, { edge: false });
            box(B, 0, y - rise / 2, z + run / 2 - .3, W, rise - 1.2, .6, PAL.glass, M.glass, { edge: false });
          }
          for (const s of [-1, 1]) box(B, s * (W / 2 - .6), rise * n / 2 + 4, 0, 1.2, rise * n + 8, D, PAL.glass, M.glass);
          // the ticket booth under the top
          box(B, 0, 10, -D / 2 + 12, W * .5, 20, 20, C("#3a3e42"), M.metal); box(B, 0, 12, -D / 2 + 22.4, W * .4, 8, .6, PAL.glass, M.glass);
        },
      },
      barn: {
        name: "Barn", sub: "plank walls, big sliding doors, a hayloft",
        plan(r) {
          const W = SQ * r.pick([4, 4.5, 5]), D = SQ * r.pick([5, 6, 7]), red = r.chance(.7);
          return {
            W, D, T: 2.4, storeys: [{ base: 0, H: 50 }], top: 50, wallCol: red ? r.pick([C("#8a2a22"), C("#7a2620"), C("#94342a")]) : r.pick([C("#8a7a64"), C("#6e6a62"), C("#9a8e78")]), wallMat: M.siding,
            trim: C("#e6e2d6"), frameCol: C("#e6e2d6"), roofCol: r.pick([C("#5e6266"), C("#4a4744"), C("#6a5a4a"), C("#7a3a2e")]), roofMat: r.chance(.6) ? M.corr : M.shingle, pitch: r.range(1.05, 1.3),
            doorCol: red ? C("#7a2620") : C("#7a6a52"), cupola: r.chance(.5), seed: r.int(0, 1e9), bales: r.int(3, 8), open: r.chance(.5),
          };
        },
        floors() { return ["Barn floor", "Roof"]; },
        draw(ctx, p, lvl) {
          const { B, r } = ctx, S = sidesOf(p.W, p.D, p.T), st = p.storeys[0];
          // the gable end faces the yard: its doors are on the front (the short side)
          if (lvl === 1) {
            // turned so the ridge runs front to back: draw the roof with W and D swapped, then rotate it
            const R = newBuf(), c2 = { ...ctx, B: R, W: p.D, D: p.W, roofCol: p.roofCol };
            gableRoof(c2, p.top, p.pitch, { overhang: 4, col: p.roofCol, mat: p.roofMat, missing: ctx.state === "d" ? .2 : 0 });
            xform(R, B, rotEuler(0, Math.PI / 2, 0));
            if (p.cupola && !ctx.brk) { const y = p.top + (p.W / 2) * p.pitch; box(B, 0, y + 4, 0, 10, 10, 10, p.wallCol, M.siding); cyl(B, 0, y + 9, 0, 8, .5, 7, 4, p.roofCol, M.metal); }
            return;
          }
          const L = S.front.L, dw = Math.min(L - 16, 34), dc = L / 2;
          const ops = { front: [{ s0: dc - dw / 2, s1: dc + dw / 2, y0: 0, y1: 40, kind: "hole" }, win(dc, 10, 43, 7)], back: [{ s0: dc - dw / 2 + 4, s1: dc + dw / 2 - 4, y0: 0, y1: 36, kind: "hole" }], left: bays(S.left.L, 26, 12).map((c) => win(c, 8, 26, 8)), right: bays(S.right.L, 26, 12).map((c) => win(c, 8, 26, 8)) };
          finishStorey(ctx, { ...p, course: false, noPartition: true, noPipes: true, floorCol: C("#6a5a44"), floorMat: M.wood }, S, st, 0, ops, null);
          // the sliding doors, pushed open on their rail, white braces across them
          if (ctx.state !== "r") for (const s of [-1, 1]) {
            const slide = p.open ? dw / 2 + 2 : 0, c = dc + s * (dw / 4 + slide), y = 20;
            if (ctx.brk && ctx.brk(...at(S.front, c, -2)) < 30) continue;
            wb(B, S.front, c - dw / 4, c + dw / 4, 0, 40, -2.2, -.8, p.doorCol, M.siding);
            const [bx, bz] = at(S.front, c, -2.4), ang = Math.atan2(40, dw / 2);
            for (const k of [-1, 1]) box(B, bx, y, bz, Math.hypot(dw / 2, 40) - 4, 1.8, .6, p.trim, M.plain, { rot: rotEuler(0, 0, k * ang) });
            wb(B, S.front, c - dw / 4, c + dw / 4, 0, 1.8, -2.6, -2.2, p.trim, M.plain); wb(B, S.front, c - dw / 4, c + dw / 4, 38.2, 40, -2.6, -2.2, p.trim, M.plain);
          }
          if (!ctx.brk) wb(B, S.front, dc - dw, dc + dw, 41, 42.5, -3, -.5, PAL.metalD, M.metal);
          // inside: stalls down one side, bales stacked, a loft floor over the back half
          const lay = ctx.lay("barn"), x0 = -p.W / 2 + p.T, z0 = -p.D / 2 + p.T;
          for (let z = z0 + 6; z < p.D / 2 - 30; z += 22) { box(B, x0 + 14, 9, z, 1.4, 16, 20, PAL.wood, M.wood); box(B, x0 + 7, 15, z + 10, 14, 1.4, 1.4, PAL.wood, M.wood); }
          for (let i = 0; i < p.bales; i++) { const x = lay.range(4, p.W / 2 - p.T - 8), z = lay.range(z0 + 8, p.D / 2 - 30), h = lay.int(0, 1); box(B, x, 3 + 4 + h * 8, z, 14, 8, 8, C("#c8a85a"), M.wood, { rot: rotEuler(0, lay.range(-.2, .2), 0) }); }
          if (!ctx.brk || ctx.brk(0, -p.D / 4) > 34) box(B, 0, 32, -p.D / 4, p.W - 2 * p.T, 1.6, p.D / 2 - p.T, PAL.floorWood, M.wood);
        },
      },
      silo: {
        name: "Silo", sub: "a tall round grain silo with a domed cap", structure: true,
        plan(r) { const R = SQ * r.pick([.8, 1, 1.2]), H = r.pick([110, 130, 150]); const stave = r.chance(.5); return { W: R * 2 + 6, D: R * 2 + 6, T: 2, storeys: [{ base: 0, H }], top: H + R * .6, noRoof: true, R, H, stave, wallCol: stave ? r.pick([C("#b8b0a0"), C("#a8a498"), C("#8a4a36")]) : r.pick([C("#c8ccd0"), C("#b0b4b8")]), wallMat: stave ? M.concrete : M.corr, cap: r.pick([C("#9aa0a4"), C("#5a6e7a"), C("#8a2a22"), C("#c8ccd0")]), seed: r.int(0, 1e9) }; },
        floors() { return ["Silo"]; },
        draw(ctx, p) {
          const { B, r } = ctx, R = p.R, st = ctx.state, n = 20, H = st === "r" ? p.H * ctx.lay("h").range(.3, .55) : p.H;
          const col = (x, y, z) => st === "i" ? p.wallCol : mul(p.wallCol, .78 + .22 * Math.sin(x * .2 + z * .13 + y * .07) * (st === "r" ? .7 : .25) + (st === "r" && y > H * .7 ? -.35 : 0));
          box(B, 0, 1.5, 0, R * 2 + 6, 3, R * 2 + 6, PAL.concreteD, M.concrete);
          for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2, hh = st === "r" ? H * (.55 + .45 * Math.abs(Math.sin(i * 1.3 + 1))) : st === "d" && i % 7 === 3 ? H * .8 : H; box(B, Math.cos((a + a2) / 2) * R, hh / 2 + 3, Math.sin((a + a2) / 2) * R, 2 * R * Math.sin(Math.PI / n) + .3, hh, 1.8, col, p.wallMat, { rot: rotEuler(0, -(a + a2) / 2 + Math.PI / 2, 0), edge: false }); }
          // hoops round a stave silo, a domed cap and a chute down the side
          if (p.stave) for (let y = 12; y < H - 4; y += 12) cyl(B, 0, y, 0, R + 1.1, R + 1.1, 1, n, PAL.metalD, M.metal);
          if (st !== "r") { cyl(B, 0, H + 3, 0, R + 1, R * .55, R * .4, n, p.cap, M.metal); cyl(B, 0, H + 3 + R * .4, 0, R * .55, 2, R * .25, n, p.cap, M.metal); }
          else ctx.soot.push([0, 0, H, R]);
          for (let y = 6; y < H - 2; y += 4) box(B, R + 2.6, y, 0, .8, .8, 6, PAL.metal, M.metal);
          for (const s of [-1, 1]) box(B, R + 2.6, H / 2 + 3, s * 3, .8, H, .8, PAL.metal, M.metal);
          if (st !== "r") box(B, -R - 3, H * .45, 0, 5, H * .9, 5, mul(p.wallCol, .85), M.metal);
        },
      },
      cabin: {
        name: "Log cabin", sub: "log walls, a stone chimney, a porch",
        plan(r) {
          const W = SQ * r.pick([3.5, 4, 4.5]), D = SQ * r.pick([3, 3.5]);
          return {
            W, D, T: 3.4, storeys: [{ base: 0, H: 42 }], top: 42, wallCol: r.pick([C("#7a5a3a"), C("#6a4a30"), C("#8a6a48"), C("#5e4630")]), wallMat: M.wood, trim: C("#5e4630"),
            frameCol: C("#4a3826"), doorCol: r.pick([C("#4a3826"), C("#6b2e2a"), C("#2f4a3a")]), roofCol: r.pick([C("#4a4744"), C("#3a4a3a"), C("#5a4a42"), C("#6a6e66")]), shutters: null,
            pitch: r.range(.7, .9), porch: r.chance(.8), chimney: true, stoneChim: true, doorAt: r.range(.35, .5), log: true, seed: r.int(0, 1e9),
          };
        },
        floors() { return ["Cabin", "Roof"]; },
        draw(ctx, p, lvl) { TYPES.house.draw(ctx, p, lvl); },
      },
      bridge: {
        name: "Road bridge", sub: "a road deck on piers over a river or a gully", structure: true, fixed: true,
        plan(r, seed) {
          const parts = String(seed || "8").split("-"), n = Math.max(3, Math.min(30, +parts[0] || 8)), stone = parts[1] === "stone" || (parts[1] !== "steel" && r.chance(.4));
          return { W: n * SQ, D: 5 * SQ, T: 1, storeys: [{ base: 0, H: 4 }], top: 14, noRoof: true, n, stone, wallCol: stone ? r.pick([C("#9a948a"), C("#8a8478"), C("#a8a090")]) : PAL.concrete[0], wallMat: M.concrete, rail: stone ? null : r.pick([C("#4a5a6a"), C("#3a4a3a"), C("#5e6266")]), seed: r.int(0, 1e9) };
        },
        floors() { return ["Bridge"]; },
        draw(ctx, p) {
          const { B, r, state } = ctx, W = p.W, D = p.D, asphalt = C("#3e4042"), walk = C("#a9a69e"), yel = C("#d8b030"), drop = 22;
          const lay = ctx.lay("br"), gone = state === "r" ? [lay.range(.3, .6), lay.range(.08, .2)] : null; // a ruined bridge has a span fallen in
          const span = (x0, x1) => {
            const w = x1 - x0, cx = (x0 + x1) / 2;
            box(B, cx, -2.5, 0, w, 5, D - 4, p.wallCol, M.concrete); // the deck
            box(B, cx, .3, 0, w, .6, SQ * 3, asphalt, M.tar, { edge: false });
            for (const s of [-1, 1]) box(B, cx, .9, s * (SQ * 1.5 + SQ / 2 - 2), w, 1.8, SQ - 4, walk, M.concrete);
            if (state !== "r") for (let x = x0 + 4; x < x1 - 8; x += 14) box(B, x + 4, .65, 0, 8, .1, 1, yel, M.plain, { edge: false });
            for (const s of [-1, 1]) {
              if (p.stone) box(B, cx, 5, s * (D / 2 - 3), w, 10, 4, p.wallCol, M.concrete);
              else { box(B, cx, 9, s * (D / 2 - 3), w, 1.6, 1.6, p.rail, M.metal); box(B, cx, 5, s * (D / 2 - 3), w, 1.2, 1.2, p.rail, M.metal); for (let x = x0 + 2; x < x1; x += 8) box(B, x, 5, s * (D / 2 - 3), 1.2, 9, 1.2, p.rail, M.metal); }
            }
          };
          if (!gone) span(-W / 2, W / 2);
          else { const a = -W / 2 + W * gone[0], b = a + W * gone[1]; span(-W / 2, a); span(b, W / 2); box(B, (a + b) / 2, -drop + 3, 0, b - a, 4, D - 6, mul(p.wallCol, .7), M.rubble, { rot: rotEuler(.15, 0, .2) }); }
          // abutments at each end, piers between, down into the water; a stone bridge stands on arches
          for (const s of [-1, 1]) box(B, s * (W / 2 - 4), -drop / 2 - 2, 0, 8, drop, D - 2, mul(p.wallCol, .9), M.concrete);
          const piers = Math.max(0, Math.floor(p.n / 5));
          for (let i = 1; i <= piers; i++) { const x = -W / 2 + W * i / (piers + 1); box(B, x, -drop / 2 - 3, 0, p.stone ? 8 : 5, drop, D - 10, mul(p.wallCol, .85), M.concrete); if (!p.stone) box(B, x, -drop / 2 - 3, 0, 7, drop * .8, D - 14, mul(p.wallCol, .8), M.concrete); }
          if (p.stone) { const k = piers + 1, sw = W / k; for (let i = 0; i < k; i++) { const c = -W / 2 + sw * (i + .5); for (let j = 0; j < 9; j++) { const a = Math.PI * (j + .5) / 9, y = -5 - Math.sin(a) * 9, x = c - Math.cos(a) * sw * .45; box(B, x, y - 3, 0, sw / 9 + 1, 6, D - 8, p.wallCol, M.concrete, { rot: rotEuler(0, 0, Math.cos(a) * .6) }); } } }
          void r;
        },
      },
      dock: {
        name: "Dock", sub: "a plank jetty on posts, out into the water", structure: true, fixed: true,
        plan(r, seed) { const n = Math.max(2, Math.min(16, +String(seed || "4").split("-")[0] || 4)); return { W: SQ * 1.6, D: n * SQ, T: 1, storeys: [{ base: 0, H: 4 }], top: 12, noRoof: true, n, wallCol: PAL.wood, wallMat: M.wood, boat: r.chance(.6), seed: r.int(0, 1e9) }; },
        floors() { return ["Dock"]; },
        draw(ctx, p) {
          const { B, state } = ctx, lay = ctx.lay("dock"), W = p.W, D = p.D, y = 3.5;
          // planks across, some missing once it rotted; posts down into the bed
          for (let z = -D / 2 + 1; z < D / 2 - .5; z += 3.2) { if (state !== "i" && lay.chance(state === "r" ? .3 : .1)) continue; box(B, 0, y, z, W, 1, 2.8, jit(PAL.board, lay, .1), M.wood, { rot: state === "r" ? rotEuler(lay.range(-.08, .08), 0, lay.range(-.06, .06)) : null }); }
          for (const s of [-1, 1]) box(B, s * (W / 2 - 1.5), y - 1.6, 0, 2, 2.2, D, PAL.woodD, M.wood);
          for (let z = -D / 2 + 3; z <= D / 2 - 2; z += SQ) for (const s of [-1, 1]) box(B, s * (W / 2 - 1.5), y - 8, z, 2.6, 18, 2.6, PAL.woodD, M.wood);
          for (const s of [-1, 1]) cyl(B, s * (W / 2 - 1.5), y + .5, D / 2 - 3, 1.4, 1.4, 4, 8, PAL.woodD, M.wood);
          if (p.boat && state !== "r") { // a rowboat tied alongside
            const bx = W / 2 + 9, bz = D / 2 - 22, hull = C(lay.pick(["#e6e2d6", "#3a5a6a", "#8a2a22", "#4a6a4a"]));
            box(B, bx, -.5, bz, 12, 4, 30, hull, M.wood); box(B, bx, 1.6, bz, 10, .5, 26, PAL.wood, M.wood); box(B, bx, -.5, bz + 16, 7, 4, 4, hull, M.wood, { rot: rotEuler(0, Math.PI / 4, 0) });
            for (const dz of [-6, 6]) box(B, bx, 2.2, bz + dz, 10, 1, 3, PAL.board, M.wood);
          }
        },
      },
      overpass: {
        name: "Overpass", sub: "a road deck on columns over a highway", structure: true, fixed: true,
        plan(r, seed) { const parts = String(seed || "14").split("-"), n = Math.max(6, Math.min(30, +parts[0] || 14)), clear = Math.max(40, Math.min(110, +parts[1] || 70)); return { W: 5 * SQ, D: n * SQ, T: 1, storeys: [{ base: 0, H: clear }], top: clear + 16, noRoof: true, n, clear, wallCol: PAL.concrete[0], wallMat: M.concrete, seed: r.int(0, 1e9) }; },
        floors() { return ["Overpass"]; },
        draw(ctx, p) {
          const { B, state } = ctx, W = p.W, D = p.D, y = p.clear, asphalt = C("#3e4042"), walk = C("#a9a69e"), yel = C("#d8b030"), lay = ctx.lay("ov");
          const gone = state === "r" ? [lay.range(.35, .55), lay.range(.12, .22)] : null;
          const deck = (z0, z1) => {
            const d = z1 - z0, cz = (z0 + z1) / 2;
            box(B, 0, y + 3, cz, W - 2, 6, d, p.wallCol, M.concrete);
            box(B, 0, y + 6.3, cz, SQ * 3, .6, d, asphalt, M.tar, { edge: false });
            for (const s of [-1, 1]) { box(B, s * (SQ * 2 - 2), y + 6.9, cz, SQ - 4, 1.8, d, walk, M.concrete); box(B, s * (W / 2 - 2), y + 11, cz, 3, 10, d, mul(p.wallCol, .95), M.concrete); }
            if (state !== "r") for (let z = z0 + 4; z < z1 - 8; z += 14) box(B, 0, y + 6.65, z + 4, 1, .1, 8, yel, M.plain, { edge: false });
            for (const s of [-1, 1]) box(B, s * (SQ * .9), y - 2, cz, 6, 4, d, mul(p.wallCol, .85), M.concrete); // girders under it
          };
          if (!gone) deck(-D / 2, D / 2);
          else { const a = -D / 2 + D * gone[0], b = a + D * gone[1]; deck(-D / 2, a); deck(b, D / 2); box(B, 0, 4, (a + b) / 2, W - 4, 6, b - a, mul(p.wallCol, .7), M.rubble, { rot: rotEuler(.25, .1, .05) }); }
          // a bent of columns with a cap beam at each side of the road beneath, and one in the median
          for (const z of [-D / 2 + SQ * 1.2, 0, D / 2 - SQ * 1.2]) {
            if (gone && Math.abs(z - (-D / 2 + D * (gone[0] + gone[1] / 2))) < SQ) continue;
            box(B, 0, y - 6, z, W - 4, 4, 9, mul(p.wallCol, .9), M.concrete);
            for (const s of [-1, 1]) cyl(B, s * W * .28, 0, z, 4.5, 4.5, y - 8, 12, mul(p.wallCol, .92), M.concrete);
          }
        },
      },
    };

    // one storey's walls, floor, inside wall, stairs; and the ruin's rubble on the ground floor
    function finishStorey(ctx, p, S, st, lvl, ops, hole) {
      const { r } = ctx, n = p.storeys.length;
      Object.assign(ctx, { course: p.course ?? !!p.brick });
      for (const k of Object.keys(ops)) ops[k].forEach((o) => { o.S = S[k]; o.base = st.base; });
      // the state's damage: weathered openings, then blast holes in a damaged wall
      for (const k of Object.keys(ops)) {
        weather(ctx, ops[k], lvl);
        if (ctx.state === "d" && r.chance(lvl === 0 ? .2 : .28)) {
          const Sd = S[k], w = r.range(10, 18), c = r.range(w, Sd.L - w);
          ops[k] = punch(ops[k], blast(ctx, Sd, st, c, w, r.range(4, st.H * .45), r.range(12, 22)));
        }
      }
      // the floor of this storey (the ground floor sits on a raised slab inside a base course)
      if (lvl === 0) {
        slab(ctx, 3, 3, p.floorCol || (p.brick ? PAL.tile : PAL.floorWood), p.floorMat ?? (p.brick ? M.tile : M.wood), null, false);
        if (p.course !== false) for (const k of ["front", "back", "left", "right"]) wb(ctx.B, S[k], k === "left" || k === "right" ? -p.T : 0, S[k].L + (k === "left" || k === "right" ? p.T : 0), 0, 3, -.8, .4, PAL.concreteD, M.concrete, { edge: false });
      } else slab(ctx, st.base, 3, p.floorCol || PAL.floorWood, p.floorMat ?? M.wood, ctx.stairHole, false);
      ctx.doorXs = (ops.front || []).filter((o) => o.kind === "door" || o.kind === "hole").map((o) => -p.W / 2 + (o.s0 + o.s1) / 2);
      for (const k of ["front", "back", "left", "right"]) storeyWalls(ctx, S[k], st, ops[k] || []);
      // the inside: a wall across, stairs up in the back corner
      if (hole && lvl < n - 1) {
        const sx = p.stairX ?? (-p.W / 2 + p.T);
        const run = stairs(ctx, sx, -p.D / 2 + p.T + 1, 11, lvl === 0 ? 3 : st.base, st.H - (lvl === 0 ? 3 : 0) + 0);
        ctx.stairHole = [sx - .5, -p.D / 2 + p.T, sx + 11.5, -p.D / 2 + p.T + run + 2];
      } else ctx.stairHole = null;
      if (p.storeys.length && !p.noPartition && p.W > 70 && !(PLANNED[p.type] && !(p.W < 60 && p.type !== "house" && p.type !== "shop"))) partition(ctx, lvl === 0 ? 3 : st.base, st.H - (lvl === 0 ? 3 : 0), -p.D / 2 + p.T + 58, p.W * .55);
      // a downpipe at the front corners
      if (!ctx.brk && !p.noPipes) for (const s of [1.2, S.front.L - 2.4]) wb(ctx.B, S.front, s, s + 1.2, st.base, st.base + st.H, -1.6, -.4, PAL.metalD, M.metal, { edge: false });
      if (lvl === 0) ruinGround(ctx, p);
    }
    function ruinGround(ctx, p) {
      const { r } = ctx, cols = [ctx.wallCol, ctx.wallCol, PAL.concrete[0], ctx.plasterCol, PAL.concreteD];
      if (ctx.state === "r") {
        const inner = [-p.W / 2 + p.T + 1, -p.D / 2 + p.T + 1, p.W / 2 - p.T - 1, p.D / 2 - p.T - 1];
        const piles = r.int(2, 3);
        for (let i = 0; i < piles; i++) rubble(ctx, r.range(-p.W / 3, p.W / 3), 3, r.range(-p.D / 3, p.D / 3), r.range(22, 36), r.range(10, 22) * Math.min(1.4, p.top / 100 + .5), 150, cols, inner);
        // outside, where the walls came down
        let made = 0;
        for (let i = 0; i < 12 && made < 4; i++) {
          const a = r() * 6.28, x = Math.cos(a) * (p.W / 2 + 6), z = Math.sin(a) * (p.D / 2 + 6);
          const cx = clampN(x, -p.W / 2 - 8, p.W / 2 + 8), cz = clampN(z, -p.D / 2 - 8, p.D / 2 + 8);
          if (ctx.brk(clampN(cx, -p.W / 2, p.W / 2), clampN(cz, -p.D / 2, p.D / 2)) > p.top * .6) continue;
          rubble(ctx, cx, 0, cz, r.range(14, 24), r.range(6, 12), 70, cols); made++;
        }
      } else if (ctx.state === "d") {
        for (const h of ctx.holes) rubble(ctx, h[0], 0, h[1], h[3] * .9, 5, 30, cols);
        for (let i = 0; i < 2; i++) rubble(ctx, r.range(-p.W / 3, p.W / 3), 3, r.range(-p.D / 3, p.D / 3), 8, 3, 18, cols);
      }
    }

    /* ---------- making a building ---------- */
    const planCache = new Map(), geoCache = new Map(), entryCache = new Map();
    const parse = (model) => { const m = /^gen:([a-z]+):?([^|#]*)/.exec(model || ""); return m && TYPES[m[1]] ? { type: m[1], seed: m[2] || "0" } : null; };
    function planOf(model) {
      if (!planCache.has(model)) { const q = parse(model); const t = TYPES[q.type]; planCache.set(model, { ...t.plan(rng(q.type + ":" + q.seed), q.seed), type: q.type }); }
      return planCache.get(model);
    }
    const STATES = { timber: "i", damaged: "d", ruined: "r" };
    // every level of one building in one state, made together so they share the state's randomness
    /* ---------- the heavy machines (15 Nov 2026), from Hayden's concept sheets: the Lancer AP-04 assault frame, the VERA
       defense platform, the Jackal gun walker (sheet "02") and the T-85 main battle walker. Bigger and meaner than the
       troopers: military hardware with numbers on it, reactive armour, real gun mounts. Same kit and rig as the others. */
    const reactive = (B, cx, cy, cz, nx, ny, s, k, ry = 0) => { const T = newBuf();
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) plated(T, (i - (nx - 1) / 2) * s * 1.06, (j - (ny - 1) / 2) * s * 1.06, 0, s, s, s * .45, k, { gx: 1, gy: 1, gz: 1, t: s * .08, col: k.c2 });
      xform(T, B, new THREE.Matrix4().makeTranslation(cx, cy, cz).multiply(rotEuler(0, ry, 0))); };
    const pod = (B, cx, cy, cz, n, rr, k) => { plated(B, cx, cy, cz - rr * 1.2, n * rr * 2.3 + rr, 2 * rr * 2.3 + rr, rr * 4, k, { gx: 1, gy: 1, gz: 1, col: k.frame });
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const x = cx + (i - (n - 1) / 2) * rr * 2.3, y = cy + (j - .5) * rr * 2.3; mTube(B, [x, y, cz - rr * 2], [x, y, cz + rr * .9], rr, MC.dark, M.metal, 8); mTube(B, [x, y, cz + rr * .5], [x, y, cz + rr * .95], rr * .55, k.acc, M.plain, 8); } };
    const num = (B, x, y, z, s, k, ry) => { mark(B, x, y, z, s, k, "bars", ry); };
    /* ---------- leg designs for the heavy walkers (15 Nov 2026, from Hayden's sketches) ----------
       hLeg draws a leg as the same three moving parts as wLeg (thigh, shin, paw), so the Table's knee IK walks it, but
       in one of four builds, each with a spiked end that the Table drives into the ground on every step (o.spike: how deep):
         "blade"  the Jackal's arched leg: a long upper limb out to a high knee with dual-stage hydraulics, then a curved
                  blade of armour down to a steel spike that stabs the ground (sketch 02)
         "digi"   the Lancer's hydraulic leg: forward knee, a backward hock (reverse-bending ankle), twin pistons on the
                  thigh, shock absorbers behind the shin, a broad two-toed foot with spiked toes
         "claw"   VERA's: the same reverse-bending leg with reactive blocks on the shin, a spur on the hock and three
                  talons that sink in
         "pillar" the T-85's: a heavy beam out and up to the knee, a near-vertical lower leg under stacked slab armour,
                  a foot on twin pistons with anchor spikes beneath it */
    function hLeg(B, hip, foot, r, k, style, o = {}) {
      const H = hip[1], ox = foot[0] - hip[0], oz = foot[2] - hip[2], D = Math.hypot(ox, oz);
      const bd = o.bend || [ox, oz], bl = Math.hypot(bd[0], bd[1]) || 1, bx = bd[0] / bl, bz = bd[1] / bl, ax = -bz, az = bx;
      const at = (p, f = 0, up = 0, sd = 0) => [p[0] + bx * f + ax * sd, p[1] + up, p[2] + bz * f + az * sd];
      const across = (B, c, w, rr, col) => mTube(B, at(c, 0, 0, -w), at(c, 0, 0, w), rr, col, M.metal, 12);
      const caps = (B, c, w, rr, col) => { for (const s of [-1, 1]) mTube(B, at(c, 0, 0, s * w), at(c, 0, 0, s * (w + rr * .35)), rr, col, M.plain, 8); };
      const spikeTo = (B, a, b, rr) => { mTube(B, a, b, rr, k.steel, M.metal, 6, rr * .1); mTube(B, a, lerp3(a, b, .22), rr * 1.25, k.frame, M.metal, 6); };
      let knee, ank, thigh, shin, paw, depth;
      if (style === "blade") {
        depth = r * .9; knee = at(hip, D * .55, H * .22); ank = at(foot, -r * .25, r * 1.9 + depth); const tip = [foot[0], foot[1], foot[2]];
        thigh = (B) => {
          across(B, hip, r * 1.5, r * 1.45, k.joint); caps(B, hip, r * 1.5, r * 1.05, pcol(k, 1));
          for (const s of [-1, 1]) obox(B, at(hip, 0, 0, s * r * .7), at(knee, 0, 0, s * r * .6), r * .5, r * 1.25, k.frame, M.metal);
          if (!k.lose(.1)) { obox(B, at(hip, 0, r * 1.15), at(knee, 0, r * 1.05), r * 2.2, r * .5, pcol(k), M.plain, { len: .86 }); obox(B, at(hip, 0, r * 1.45), at(knee, 0, r * 1.35), r * 1.2, r * .3, k.acc, M.plain, { len: .3, along: -D * .05 }); }
          // dual-stage hydraulics under the limb
          ram(B, at(hip, -r * .5, -r * 1.7), at(lerp3(hip, knee, .55), 0, -r * 1), r * .5, k); ram(B, at(lerp3(hip, knee, .45), 0, -r * 1.3), at(knee, -r * .5, -r * 1.2), r * .42, k);
          hose(B, at(hip, 0, r * .6, r * 1.3), at(knee, -r * .4, r * .3, r * 1.1), r * .16, k);
        };
        shin = (B) => {
          across(B, knee, r * 1.3, r * 1.3, k.joint); caps(B, knee, r * 1.3, r * .8, k.acc);
          obox(B, knee, ank, r * 1.1, r * 1.2, k.frame, M.metal, { len: .95 }); ram(B, at(knee, -r * .9, -r * .7), at(ank, -r * .8, r * 1.4), r * .42, k);
          // the blade: a curved plate from above the knee, bulging out and down to the point
          if (!k.lose(.08)) { const s0 = at(knee, -r * .7, r * 3.4), c1 = at(knee, r * 2.8, -r * 1.2), e = at(ank, r * .25, -r * .2), n = 7, bz3 = (t) => [0, 1, 2].map((i) => (1 - t) * (1 - t) * s0[i] + 2 * (1 - t) * t * c1[i] + t * t * e[i]);
            for (let i = 0; i < n; i++) { const a = bz3(i / n), b = bz3((i + 1) / n), w = r * (2.9 - 2.1 * i / n); obox(B, a, b, r * .45, w, pcol(k, i % 3 === 2), M.plain, { pad: r * .25 }); obox(B, a, b, r * .52, r * .3, k.steel, M.metal, { up: w * .5, pad: r * .25 }); } }
        };
        paw = (B) => { across(B, ank, r * .7, r * .75, k.joint); spikeTo(B, ank, tip, r * .62); };
      } else if (style === "digi" || style === "claw") {
        const claw = style === "claw", fw = (p, f, y) => [p[0] + bx * f, y, p[2] + bz * f];
        depth = 0;
        knee = fw(lerp3(hip, foot, .3), H * .3, H * .6); const hock = fw(lerp3(hip, foot, .85), -H * .24, H * .27); ank = fw(foot, H * .02, r * 1.3);
        thigh = (B) => {
          across(B, hip, r * 1.6, r * 1.7, k.joint); caps(B, hip, r * 1.6, r * 1.25, pcol(k, 1)); for (const s of [-1, 1]) mTube(B, at(hip, 0, 0, s * r * 2.05), at(hip, 0, 0, s * r * 2.15), r * .9, k.acc, M.plain, 10);
          obox(B, hip, knee, r * 1.6, r * 1.6, k.frame, M.metal);
          if (!k.lose(.1)) { obox(B, fw(hip, r * 1.25, hip[1] - r * .4), fw(knee, r * 1.2, knee[1] + r * .6), r * 3.1, r * .6, pcol(k), M.plain, { len: .9 }); obox(B, fw(hip, r * 1.55, hip[1] - r * .4), fw(knee, r * 1.5, knee[1] + r * .6), r * 1.6, r * .3, k.acc, M.plain, { len: .25, along: r }); }
          for (const s of [-1, 1]) ram(B, at(fw(hip, -r * .9, hip[1] - r * 1.2), 0, 0, s * r * 1.05), at(fw(knee, -r * 1, knee[1] + r * .5), 0, 0, s * r * .95), r * .45, k);
          hose(B, fw(hip, -r * 1.2, hip[1] + r * .6), fw(knee, -r * 1.4, knee[1]), r * .16, k);
        };
        shin = (B) => {
          across(B, knee, r * 1.35, r * 1.4, k.joint); caps(B, knee, r * 1.35, r * .95, pcol(k, 1));
          obox(B, fw(knee, r * 1.2, knee[1] + r * .8), fw(knee, r * 1.6, knee[1] - r * 1.2), r * 2.4, r * .55, pcol(k), M.plain);
          obox(B, knee, hock, r * 1.3, r * 1.3, k.frame, M.metal);
          if (!k.lose(.1)) { obox(B, fw(knee, r * 1, knee[1] - r * .6), fw(hock, r * .9, hock[1] + r * .6), r * 2.5, r * .55, pcol(k), M.plain, { len: .9 }); obox(B, fw(knee, r * 1.3, knee[1] - r * .6), fw(hock, r * 1.2, hock[1] + r * .6), r * 1.3, r * .3, k.acc, M.plain, { len: .2, along: -r }); }
          shock(B, fw(knee, -r * 1.2, knee[1] - r * .8), fw(hock, -r * 1.1, hock[1] + r * .9), r * .5, k);
          across(B, hock, r * 1.05, r * 1.1, k.joint); caps(B, hock, r * 1.05, r * .75, k.acc);
          obox(B, hock, ank, r * 1, r * 1, k.frame, M.metal); ram(B, fw(hock, r * .6, hock[1] + r * 1.2), fw(ank, r * .5, ank[1] + r * .4), r * .35, k);
          if (claw) { if (!k.lose(.15)) for (let i = 0; i < 2; i++) { const m = lerp3(knee, hock, .3 + i * .32), T = newBuf(); plated(T, 0, 0, 0, r * 1.9, r * 1.6, r * .9, k, { gx: 1, gy: 1, gz: 1, col: k.c2, t: r * .12 }); xform(T, B, new THREE.Matrix4().makeTranslation(m[0] + bx * r * 1.5, m[1], m[2] + bz * r * 1.5).multiply(rotEuler(0, Math.atan2(bx, bz), 0))); }
            spikeTo(B, fw(hock, -r * .5, hock[1]), fw(hock, -r * 2.6, hock[1] - r * 1.2), r * .5); }
        };
        // a three-pronged foot of flat armoured plates: two splayed forward, one back
        paw = (B) => {
          across(B, ank, r * .95, r * .85, k.joint); cyl(B, ank[0], r * .45, ank[2], r * 1.15, r * 1.3, r * .9, 10, k.frame, M.metal);
          for (const t of [-.5, .5, Math.PI]) { const back = t === Math.PI, ex = bx * Math.cos(t) - ax * Math.sin(t), ez = bz * Math.cos(t) - az * Math.sin(t), L = back ? r * 2.3 : r * 3.3;
            const root = [ank[0] + ex * r * .5, r * .9, ank[2] + ez * r * .5], end = [ank[0] + ex * L, r * .36, ank[2] + ez * L];
            obox(B, root, end, r * (back ? 1.2 : 1.45), r * .72, k.frame, M.metal, { pad: r * .3 });
            if (!k.lose(.1)) obox(B, [root[0], root[1] + r * .45, root[2]], [end[0], end[1] + r * .4, end[2]], r * (back ? 1.35 : 1.65), r * .34, pcol(k), M.plain, { len: .82 });
            obox(B, end, [end[0] + ex * r * .5, r * .3, end[2] + ez * r * .5], r * (back ? 1.3 : 1.55), r * .55, claw ? k.acc : MC.dark, M.metal); }
        };
      } else { // pillar
        depth = r * .6; knee = at(hip, D * .78, H * .45); ank = at(foot, 0, r * 2.3 + depth);
        thigh = (B) => {
          across(B, hip, r * 1.8, r * 1.8, k.joint); caps(B, hip, r * 1.8, r * 1.3, pcol(k, 1));
          obox(B, hip, knee, r * 2.6, r * 2.4, k.frame, M.metal);
          if (!k.lose(.1)) obox(B, at(hip, r * .4, r * 1.6), at(knee, -r * .4, r * 1.6), r * 3.4, r * .7, pcol(k), M.plain, { len: .9 });
          for (const s of [-1, 1]) ram(B, at(hip, r * .5, -r * 2, s * r * .9), at(knee, -r * 1, -r * 1.5, s * r * .9), r * .55, k);
        };
        shin = (B) => {
          across(B, knee, r * 1.6, r * 1.7, k.joint); caps(B, knee, r * 1.6, r * 1.2, k.acc);
          obox(B, knee, ank, r * 2.1, r * 2.1, k.frame, M.metal);
          // stacked slab armour on the outside, each plate overlapping the one under it
          for (let i = 0; i < 3; i++) { if (k.lose(.1)) continue; const a = lerp3(knee, ank, .05 + i * .3), b = lerp3(knee, ank, .05 + i * .3 + .3); obox(B, at(a, r * 1.5), at(b, r * 1.75), r * 3.6, r * .7, pcol(k, i % 2), M.plain); obox(B, at(a, r * 1.9), at(b, r * 2.15), r * 1, r * .3, i === 1 ? k.acc : k.frame, M.plain, { len: .4 }); }
          ram(B, at(knee, -r * 1.4, -r * 1), at(ank, -r * 1.3, r * 1.4), r * .6, k); hose(B, at(knee, -r * 1.6, r * .5), at(ank, -r * 1.6, r * 2.5), r * .2, k);
        };
        // three heavy claws on pistons, splayed round the ankle, their talons sinking in
        paw = (B) => {
          across(B, ank, r * 1.1, r * 1.1, k.joint); cyl(B, ank[0], ank[1] - r * 1.1, ank[2], r * 1.5, r * 1.8, r * 1.4, 10, k.frame, M.metal); cyl(B, ank[0], ank[1] - r * .3, ank[2], r * 1.3, r * 1.3, r * .3, 10, k.acc, M.plain);
          for (const t of [0, 2.1, -2.1]) { const ex = bx * Math.cos(t) - ax * Math.sin(t), ez = bz * Math.cos(t) - az * Math.sin(t);
            const base = [ank[0] + ex * r * 1.1, ank[1] - r * 1.2, ank[2] + ez * r * 1.1], kn = [ank[0] + ex * r * 2.9, ank[1] - r * .7, ank[2] + ez * r * 2.9], tip = [ank[0] + ex * r * 4.6, 0, ank[2] + ez * r * 4.6];
            obox(B, base, kn, r * 1.2, r * 1.1, k.frame, M.metal, { pad: r * .4 });
            if (!k.lose(.1)) obox(B, [base[0], base[1] + r * .6, base[2]], [kn[0], kn[1] + r * .55, kn[2]], r * 1.45, r * .4, pcol(k), M.plain, { pad: r * .3 });
            mTube(B, [kn[0] - ez * r * .7, kn[1], kn[2] + ex * r * .7], [kn[0] + ez * r * .7, kn[1], kn[2] - ex * r * .7], r * .6, k.joint, M.metal, 10);
            spikeTo(B, kn, tip, r * .7); ram(B, [ank[0] + ex * r * .6, ank[1] + r * .6, ank[2] + ez * r * .6], [kn[0] - ex * r * .3, kn[1] + r * .5, kn[2] - ez * r * .3], r * .32, k); }
        };
      }
      if (k.part && B === k.A) {
        const t = k.part("leg", hip, thigh, { foot: foot.slice(), knee: knee.slice(), ank: ank.slice(), axis: [ax, 0, az], r, spike: +depth.toFixed(2), gait: o.gait || null });
        const sh = k.part("shin", knee, shin, { parentIx: t });
        k.part("paw", ank, paw, { parentIx: sh });
        return;
      }
      thigh(B); shin(B); paw(B);
    }
    const MACH2 = {
      lancer: {
        name: "Lancer AP-04 (assault frame)", sub: "a heavy two-legged assault frame twice a man's height: a shoulder cannon on one arm, a rifle on the other, a rocket rack and power pack on its back", structure: true, machine: true,
        plan(r) { return { W: 56, D: 46, T: 1, storeys: [{ base: 0, H: 40 }], top: 66, noRoof: true, drop: 26, scheme: r.pick([0, 1, 3, 3]), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 34;
            // pelvis and a hunched, heavily plated chest; the sensor face sits low between the shoulders
            plated(B, 0, y, 0, 18, 7, 12, k, { gx: 2, gy: 1, gz: 1 });
            obox(B, [0, y + 3, -1], [0, y + 9, -1], 8, 7, k.frame, M.metal);
            plated(B, 0, y + 15, 1, 26, 14, 16, k, { gx: 2, gy: 2, gz: 2 });
            plated(B, 0, y + 13, 9.6, 16, 9, 4, k, { gx: 2, gy: 1, gz: 1, rot: rotEuler(-.25, 0, 0) });
            eyes(B, [0, y + 15.4, 11.4], [0, 0, 1], 1.5, k, 3); lens(B, [-4.5, y + 13, 11.2], [0, 0, 1], .5, k, MC.lamp); lens(B, [4.5, y + 13, 11.2], [0, 0, 1], .5, k, MC.lamp);
            mark(B, 0, y + 20.5, 9, 3.2, k, "chev");
            for (const sd of [-1, 1]) plated(B, sd * 14.6, y + 18, 0, 9, 9, 13, k, { gx: 1, gy: 1, gz: 2, col: sd > 0 ? k.c1 : k.c2 });
            // the back: a power pack and a rocket rack on a turntable, a whip antenna
            plated(B, 0, y + 15, -11, 18, 13, 7, k, { gx: 2, gy: 2, gz: 1, col: k.c2 }); fins(B, 0, y + 22, -11, 14, 6, 9, k);
            uplink(B, 6, y + 22, -6, 1.2, k); greeble(B, -6, y + 23, -2, 7, 6, 4, k);
            k.part("launcher", [-8, y + 23, -6], (B) => { cyl(B, -8, y + 23, -6, 3.2, 3.2, 1.2, 10, k.frame, M.metal);
              k.part("gun", [-8, y + 25, -6], (B) => { pod(B, -8, y + 27, -4, 3, 1, k); }, { pitch: 1 });
            }, { muzzle: [-8, y + 27, -2], shot: "rocket" });
            // the right arm: a long cannon slung from the shoulder, its barrel banded in the accent colour
            k.part("turret", [16, y + 18, 0], (B) => {
              k.part("gun", [16, y + 18, 0], (B) => {
                obox(B, [16, y + 18, 0], [17, y + 9, 3], 5, 5, k.frame, M.metal); plated(B, 17.4, y + 8, 6, 7, 7, 14, k, { gx: 1, gy: 1, gz: 2 });
                mTube(B, [17.4, y + 8, 13], [17.4, y + 8, 40], 1.5, MC.dark, M.metal, 10); mTube(B, [17.4, y + 8, 13], [17.4, y + 8, 22], 2.4, k.frame, M.metal, 10);
                for (const z of [26, 33]) mTube(B, [17.4, y + 8, z], [17.4, y + 8, z + 2], 1.9, k.acc, M.plain, 10); mTube(B, [17.4, y + 8, 38], [17.4, y + 8, 41.5], 2.2, k.joint, M.metal, 10);
                hose(B, [14, y + 14, -3], [16, y + 10, 4], .45, k);
              }, { pitch: 1 });
            }, { muzzle: [17.4, y + 8, 41.5], shot: "cannon", yaw: .5 });
            // the left arm: a rifle built into the forearm, a gripping hand under it
            k.part("turret", [-16, y + 18, 0], (B) => {
              k.part("gun", [-16, y + 18, 0], (B) => {
                obox(B, [-16, y + 18, 0], [-17, y + 8, 2], 4.4, 4.4, k.frame, M.metal); plated(B, -17, y + 7, 7, 5.4, 5.4, 12, k, { gx: 1, gy: 1, gz: 2 });
                mTube(B, [-17, y + 8, 13], [-17, y + 8, 25], .8, MC.dark, M.metal, 8); box(B, -17, y + 4, 10, 3, 3, 3.4, k.frame, M.metal); box(B, -17, y + 2.4, 11.6, 2.6, 1.4, 1.6, MC.dark, M.metal);
              }, { pitch: 1 });
            }, { muzzle: [-17, y + 8, 25], shot: "gun", yaw: .5 });
            num(B, 9.6, y + 3, 6.2, 2.4, k, 0);
            // two thick legs with forward knees and broad feet
            for (const sd of [-1, 1]) hLeg(B, [sd * 8, y - 2, 0], [sd * 10, 0, 3], 3.6, k, "digi", { bend: [0, 1], gait: { crouch: .13, reach: .9, swing: 1.8, lift: .85 } });
          });
        },
      },
      vera: {
        name: "VERA (defense platform)", sub: "a squat five-metre walker on reverse knees: rocket pods on both shoulders, a rotary cannon on top, reactive armour on its hips; it holds a crossroads alone", structure: true, machine: true,
        plan(r) { return { W: 84, D: 70, T: 2, storeys: [{ base: 0, H: 50 }], top: 92, noRoof: true, drop: 34, scheme: r.pick([3, 3, 0, 1]), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 58;
            // the hull: a wide plated box with sloped cheeks, the sensor block in the middle with twin clusters either side
            plated(B, 0, y, 0, 36, 18, 26, k, { gx: 3, gy: 2, gz: 2 });
            for (const sd of [-1, 1]) plated(B, sd * 11, y + 4, 12.6, 13, 9, 4, k, { gx: 1, gy: 1, gz: 1, rot: rotEuler(-.2, sd * .25, 0) });
            plated(B, 0, y - 1, 14.4, 9, 9, 5, k, { gx: 1, gy: 1, gz: 1, col: k.frame }); eye(B, [0, y - 1, 17.4], [0, 0, 1], 2.2, k);
            for (const sd of [-1, 1]) eyes(B, [sd * 5.6, y - 3.4, 16.4], [0, 0, 1], .9, k, 2);
            plated(B, 0, y - 13, 2, 14, 10, 14, k, { gx: 1, gy: 1, gz: 1, col: k.c2 }); obox(B, [0, y - 18, 2], [0, y - 8, 2], 10, 10, k.frame, M.metal);
            mark(B, -12, y + 3, 13.3, 3, k, "haz"); num(B, 12, y - 5, 13.3, 3, k, 0);
            plated(B, 0, y + 10.5, -3, 22, 3, 16, k, { gx: 2, gy: 1, gz: 2, col: k.acc });
            fins(B, 0, y + 2, -14, 26, 6, 12, k); greeble(B, 9, y + 12, -7, 6, 6, 3, k);
            for (const x of [-6, -3]) { const T = newBuf(); cyl(T, 0, 0, 0, .25, .2, 26, 4, MC.dark, M.metal); xform(T, B, new THREE.Matrix4().makeTranslation(x, y + 23, -8)); }
            // hip armour: blocks of reactive armour hung over the leg mounts
            for (const sd of [-1, 1]) { plated(B, sd * 20, y - 10, 0, 6, 14, 14, k, { gx: 1, gy: 2, gz: 2, col: k.frame }); reactive(B, sd * 23.5, y - 10, 0, 2, 3, 4.6, k, sd * PI2); }
            // shoulder rocket pods: each on its own mount, aiming with the hull
            for (const sd of [-1, 1]) k.part("launcher", [sd * 22, y + 6, 0], (B) => {
              obox(B, [sd * 18, y + 6, 0], [sd * 23, y + 6, 0], 5, 5, k.frame, M.metal);
              k.part("gun", [sd * 23, y + 6, 0], (B) => { pod(B, sd * 27, y + 7, 2, 2, 1.7, k); lens(B, [sd * 31.4, y + 3.4, 5.8], [0, 0, 1], .6, k, MC.lamp); }, { pitch: 1 });
            }, { muzzle: [sd * 27, y + 7, 6], shot: "rocket", yaw: .5 });
            // the rotary cannon on top: a turret ring, a cradle, six barrels in a ring, an ammo drum and belt
            k.part("turret", [0, y + 12, 4], (B) => {
              cyl(B, 0, y + 12, 4, 5, 5, 1.6, 12, k.frame, M.metal); plated(B, 0, y + 15, 3, 9, 5, 10, k, { gx: 1, gy: 1, gz: 1 });
              k.part("gun", [0, y + 17, 4], (B) => {
                plated(B, 0, y + 18, 7, 6, 4.6, 10, k, { gx: 1, gy: 1, gz: 2, col: k.frame });
                for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mTube(B, [Math.cos(a) * 1.1, y + 18 + Math.sin(a) * 1.1, 12], [Math.cos(a) * 1.1, y + 18 + Math.sin(a) * 1.1, 31], .38, MC.dark, M.metal, 6); }
                for (const z of [14, 29]) mTube(B, [0, y + 18, z], [0, y + 18, z + 1.4], 2, k.frame, M.metal, 10);
                mTube(B, [5, y + 18, 2], [9, y + 18, 2], 3.2, pcol(k, 1), M.plain, 12); hose(B, [6, y + 20, 4], [2, y + 20, 8], .5, k);
              }, { pitch: 1 });
            }, { muzzle: [0, y + 18, 31.5], shot: "gun", yaw: 1 });
            // reverse-knee legs: long plated thighs, clawed feet spread wide
            for (const sd of [-1, 1]) hLeg(B, [sd * 13, y - 10, -2], [sd * 19, 0, 6], 4.6, k, "claw", { bend: [0, 1], gait: { crouch: .13, reach: .9, swing: 1.9, lift: .8 } });
          });
        },
      },
      jackal: {
        name: "Jackal (gun walker)", sub: "a four-legged gun walker on blade-armoured legs, a twin-linked autocannon turret turning freely on its back; the workhorse of the machines' armour", structure: true, machine: true,
        plan(r) { return { W: 96, D: 104, T: 2, storeys: [{ base: 0, H: 36 }], top: 70, noRoof: true, drop: 22, scheme: r.pick([0, 1, 3, 2]), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 36;
            // the hull: long and low, a sloped glacis, side sponsons with the sensor slit, a caution plate and numbers
            obox(B, [0, y - 5, -22], [0, y - 5, 22], 10, 8, k.frame, M.metal);
            plated(B, 0, y, -2, 28, 15, 38, k, { gx: 3, gy: 2, gz: 3 });
            plated(B, 0, y + 1, 19, 24, 11, 8, k, { gx: 2, gy: 1, gz: 1, rot: rotEuler(-.4, 0, 0) }); eyes(B, [0, y - 1.5, 22.8], [0, 0, 1], 1.6, k, 3);
            for (const sd of [-1, 1]) { plated(B, sd * 16.5, y + 2, 4, 5, 9, 26, k, { gx: 1, gy: 1, gz: 2 }); num(B, sd * 19.1, y + 2, 4, 3.4, k, sd * PI2); }
            mark(B, 0, y + 4, -21.2, 3.4, k, "haz", Math.PI); fins(B, 0, y + 7.9, -15, 18, 9, 10, k); hose(B, [-9, y + 5, -10], [-9, y + 4, 10], .45, k);
            uplink(B, -8, y + 6.4, -6, 1.1, k); { const T = newBuf(); cyl(T, 0, 0, 0, .22, .18, 24, 4, MC.dark, M.metal); xform(T, B, new THREE.Matrix4().makeTranslation(-9, y + 18, -10)); }
            // the twin-linked autocannon turret, free to turn all the way round
            k.part("turret", [0, y + 7.9, 0], (B) => {
              cyl(B, 0, y + 7.9, 0, 8, 8, 1.6, 14, k.frame, M.metal); plated(B, 0, y + 10.5, -1, 14, 6.4, 16, k, { gx: 2, gy: 1, gz: 2 });
              plated(B, 0, y + 14, -2, 9, 1.6, 10, k, { gx: 1, gy: 1, gz: 1, col: k.acc }); lens(B, [5.6, y + 12, 7.2], [0, 0, 1], .7, k, MC.lamp);
              k.part("gun", [0, y + 10, 6], (B) => {
                plated(B, 0, y + 10, 8.4, 9, 5, 5, k, { gx: 1, gy: 1, gz: 1, col: k.frame });
                for (const sd of [-1, 1]) { mTube(B, [sd * 2.2, y + 10, 10], [sd * 2.2, y + 10, 34], .8, MC.dark, M.metal, 8); mTube(B, [sd * 2.2, y + 10, 10], [sd * 2.2, y + 10, 18], 1.3, k.frame, M.metal, 10); mTube(B, [sd * 2.2, y + 10, 30], [sd * 2.2, y + 10, 34.5], 1.1, k.joint, M.metal, 8); }
              }, { pitch: 1 });
            }, { muzzle: [0, y + 10, 34.5], shot: "gun", yaw: 1 });
            // four legs under blade-shaped armour, knees high and wide
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) hLeg(B, [sd * 14, y - 3, zs * 13], [sd * 31, 0, zs * 30], 3.8, k, "blade", { gait: { crouch: .1, reach: .85, swing: 1.7, lift: 1.1, out: .2 } });
          });
        },
      },
      tankwalker: {
        name: "T-85 (main battle walker)", sub: "a main battle tank's hull and turret on four armoured legs, nearly six metres tall: a heavy rail cannon, a sensor mast, smoke and rocket pods; the machines' answer to a strongpoint", structure: true, machine: true,
        plan(r) { return { W: 176, D: 172, T: 3, storeys: [{ base: 0, H: 44 }], top: 96, noRoof: true, drop: 26, scheme: r.pick([0, 1, 3, 2]), seed: r.int(0, 1e9) }; },
        floors() { return ["Machine"]; },
        draw(ctx, p) {
          mSet(ctx, p, (B, k) => {
            const y = 40;
            // the hull: a wide faceted tank hull with a sloped glacis and skirts, the hips at its four corners
            obox(B, [0, y - 7, -30], [0, y - 7, 30], 14, 8, k.frame, M.metal);
            plated(B, 0, y, 0, 50, 15, 56, k, { gx: 4, gy: 2, gz: 4 });
            plated(B, 0, y - 1, 31, 44, 11, 9, k, { gx: 3, gy: 1, gz: 1, rot: rotEuler(-.5, 0, 0) }); eyes(B, [0, y - 2.4, 35.4], [0, 0, 1], 1.8, k, 3);
            plated(B, 0, y - 1, -31, 42, 11, 7, k, { gx: 3, gy: 1, gz: 1, rot: rotEuler(.4, 0, 0) }); fins(B, 0, y + 8.2, -20, 34, 12, 14, k);
            for (const sd of [-1, 1]) { plated(B, sd * 26.5, y - 4, 0, 3, 9, 46, k, { gx: 1, gy: 1, gz: 5, col: k.c2 }); num(B, sd * 28.2, y - 3, -12, 4, k, sd * PI2); mark(B, sd * 28.2, y - 3, 14, 4, k, "chev", sd * PI2); }
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) plated(B, sd * 23, y - 4, zs * 22, 12, 13, 13, k, { gx: 1, gy: 1, gz: 1, col: k.frame });
            greeble(B, 14, y + 8.4, -6, 10, 10, 4, k); hose(B, [-18, y + 8, -16], [-18, y + 8, 14], .7, k);
            // the turret: faceted, a mantlet and the long rail cannon, an optics box on a mast, smoke pods at its cheeks
            k.part("turret", [0, y + 8.6, -2], (B) => {
              cyl(B, 0, y + 8.6, -2, 17, 17, 2, 18, k.frame, M.metal);
              plated(B, 0, y + 15, -4, 34, 10, 34, k, { gx: 3, gy: 1, gz: 3 });
              plated(B, 0, y + 14, 15, 26, 8, 8, k, { gx: 2, gy: 1, gz: 1, rot: rotEuler(-.35, 0, 0) });
              plated(B, 0, y + 20.6, -6, 24, 2, 22, k, { gx: 2, gy: 1, gz: 2, col: k.acc });
              obox(B, [-9, y + 21, -10], [-9, y + 26, -10], 3, 3, k.frame, M.metal); plated(B, -9, y + 28, -9, 9, 4.6, 7, k, { gx: 1, gy: 1, gz: 1, col: k.frame }); eyes(B, [-9, y + 28, -5.2], [0, 0, 1], 1, k, 2);
              uplink(B, 10, y + 20.6, -14, 1.5, k); { const T = newBuf(); cyl(T, 0, 0, 0, .3, .24, 34, 4, MC.dark, M.metal); xform(T, B, new THREE.Matrix4().makeTranslation(14, y + 37, -18)); }
              mark(B, 17.2, y + 15, -4, 4, k, "box", PI2);
              k.part("gun", [0, y + 14, 16], (B) => {
                plated(B, 0, y + 14, 19, 11, 8, 6, k, { gx: 1, gy: 1, gz: 1, col: k.frame });
                for (const sd of [-1, 1]) obox(B, [sd * 1.6, y + 14, 20], [sd * 1.6, y + 14, 70], 1.6, 3.4, k.frame, M.metal);
                mTube(B, [0, y + 14, 20], [0, y + 14, 66], 2.2, MC.dark, M.metal, 12);
                for (let i = 0; i < 5; i++) mTube(B, [0, y + 14, 26 + i * 8], [0, y + 14, 28 + i * 8], 3.2, i === 4 ? k.acc : k.c1, M.plain, 12);
                mTube(B, [0, y + 14, 66], [0, y + 14, 73], 3, k.joint, M.metal, 12); for (const sd of [-1, 1]) box(B, sd * 2.8, y + 14, 71, 1.4, 2.4, 3, MC.dark, M.metal);
              }, { pitch: 1 });
            }, { muzzle: [0, y + 14, 73], shot: "cannon" });
            // smoke and rocket pods on the rear deck, behind the turret
            for (const sd of [-1, 1]) k.part("launcher", [sd * 20, y + 8.6, -27], (B) => { cyl(B, sd * 20, y + 8.6, -27, 3, 3, 1.2, 10, k.frame, M.metal);
              k.part("gun", [sd * 20, y + 10, -27], (B) => { pod(B, sd * 20, y + 12.4, -25, 3, 1.3, k); }, { pitch: 1 });
            }, { muzzle: [sd * 20, y + 12.4, -21], shot: "rocket" });
            // four heavy legs under slab armour, feet with twin pistons
            for (const sd of [-1, 1]) for (const zs of [-1, 1]) hLeg(B, [sd * 25, y - 5, zs * 22], [sd * 62, 0, zs * 58], 6, k, "pillar", { gait: { crouch: .08, reach: .85, swing: 1.9, lift: 1.05, out: .16 } });
          });
        },
      },
    };
    Object.assign(TYPES, AIR_TYPES, VEH_TYPES, MACH, MACH2);
    function make(model, state, rigMode) {
      const key = model + "|" + state + (rigMode ? "|rig" : "");
      if (geoCache.has(key)) return geoCache.get(key);
      const p = planOf(model), T = TYPES[p.type], levels = p.storeys.length + (p.noRoof ? 0 : 1), out = [];
      const r = rng(model + "|" + state + "|" + p.seed), nb = noise2(hashStr(model + "brk"));
      const sn = noise2(hashStr(model + "slab" + state));
      let brk = null;
      if (state === "r") {
        const rz = p.ruin || [.28, .5, .5, .9], ang = r() * 6.28, base = r.range(rz[0], rz[1]), tilt = r.range(rz[2], rz[3]), maxD = Math.max(p.W, p.D);
        brk = (x, z) => {
          const u = (x * Math.cos(ang) + z * Math.sin(ang)) / maxD;
          const h = p.top * (base + tilt * u + (nb(x * .035, z * .035) - .5) * .7) + (nb(x * .2 + 9, z * .2) - .5) * 10;
          return Math.max(3 + nb(x * .3, z * .3) * 6, h);
        };
      }
      const soot = [], holes = [], LP = rng(model + "|lay|palette");
      const ctx = {
        state, r, W: p.W, D: p.D, T: p.T, brk, ruin: state === "r", soot, holes, slabNoise: sn, sheets: state === "r" ? p.sheets || 0 : 0,
        wallCol: p.wallCol, wallMat: p.wallMat, plasterCol: LP.pick(PAL.plaster), trimCol: p.trim || LP.pick(PAL.trim),
        sillCol: p.trim || (p.brick ? LP.pick(PAL.trim) : PAL.concrete[1]), lintel: !!p.brick, lintelCol: p.brick ? LP.pick(PAL.trim) : null, lintelMat: M.concrete,
        // the layout's own randomness: the same in every state, so Intact, Damaged and Ruined are one building
        lay: (tag) => rng(model + "|lay|" + tag),
        frameCol: p.frameCol, doorCol: p.doorCol, stairCol: PAL.floorWood, roofCol: p.roofCol,
      };
      // soot darkens a wall above a burnt opening; the old paint fades a little in a damaged or ruined building
      ctx.rig = rigMode ? [] : null;
      const fade = state === "i" ? 1 : state === "d" ? .9 : .82;
      ctx.tintCol = (col) => (x, y, z) => {
        let k = fade;
        for (const [sx, sz, sy, rr] of soot) {
          const dx = x - sx, dz = z - sz, dy = y - sy;
          if (dy < -3) continue;
          k *= 1 - .7 * Math.exp(-(dx * dx + dz * dz) / (rr * rr * .6) - (dy * dy) / (rr * rr * 4));
        }
        return mul(col, k);
      };
      if (rigMode) {
        ctx.B = newBuf(); ctx.y0 = 0; ctx.machBody = null;
        T.draw.call(T, ctx, p, 0);
        const names = {}, parts = ctx.rig.map((q, i) => {
          const Q = newBuf(); xform(q.buf, Q, new THREE.Matrix4().makeTranslation(-q.pivot[0], -q.pivot[1], -q.pivot[2]));
          if (q.o.name) names[q.o.name] = i;
          return { kind: q.kind, pivot: q.pivot, geo: toGeo(Q), ...q.o };
        });
        parts.forEach((q) => { if (q.parent != null && names[q.parent] != null) q.parentIx = names[q.parent]; });
        const res = { type: p.type, hover: p.hover || 0, top: p.top, W: p.W, D: p.D, plan: p, base: toGeo(ctx.B), body: ctx.machBody ? toGeo(ctx.machBody) : null, parts };
        geoCache.set(key, res);
        return res;
      }
      for (let lvl = 0; lvl < levels; lvl++) {
        ctx.B = newBuf(); ctx.y0 = 0;
        T.draw.call(T, ctx, p, lvl);
        const g = toGeo(ctx.B);
        try { g.computeBoundsTree && g.computeBoundsTree(); } catch {}
        out.push(g);
      }
      geoCache.set(key, out);
      return out;
    }
    // the geometry for "gen:<type>:<seed>|<state>|<level>"
    function geo(key) {
      const [model, st, lv] = key.split("|");
      return make(model, STATES[st] ? STATES[st] : st || "i")[+lv || 0];
    }
    function entry(model) {
      const q = parse(model); if (!q) return null;
      if (entryCache.has(model)) return entryCache.get(model);
      const p = planOf(model), T = TYPES[q.type], names = T.floors(p), ups = p.storeys.length - (p.noRoof ? 1 : 0); // upper storeys plus the roof
      const e = {
        name: T.name, gen: true, tint: "painted", tags: ["generated", "modern", T.vehicle ? "vehicle" : T.structure ? "structure" : "building"],
        variants: { timber: model + "|timber|0", damaged: model + "|damaged|0", ruined: model + "|ruined|0" },
        vlabels: { timber: "Intact", damaged: "Damaged", ruined: "Ruined" },
        floors: Array.from({ length: ups }, (_, i) => model + "|timber|" + (i + 1)), levels: names,
        stack: Array.from({ length: ups }, () => 0), shift: Array.from({ length: ups }, () => [0, 0]),
        dims: [p.W, p.top, p.D], fixed: !!T.fixed,
      };
      entryCache.set(model, e);
      return e;
    }
    // what a building covers on the ground, in its own frame (front +z): [x0, z0, x1, z1] in mm, canopies and steps included
    const footCache = new Map();
    function foot(model) {
      if (footCache.has(model)) return footCache.get(model);
      const e = entry(model); if (!e) return null;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      // measured off the intact model; if it was only built to be measured, let it go again
      const had = geoCache.has(model + "|i"), gs = [].concat(make(model, "i") || []);
      for (const g of gs) {
        if (!g || !g.attributes || !g.attributes.position) continue;
        g.computeBoundingBox(); const b = g.boundingBox;
        x0 = Math.min(x0, b.min.x); z0 = Math.min(z0, b.min.z); x1 = Math.max(x1, b.max.x); z1 = Math.max(z1, b.max.z);
      }
      if (!had) { geoCache.delete(model + "|i"); gs.forEach((g) => g && g.dispose && g.dispose()); }
      const f = Number.isFinite(x0) ? [x0, z0, x1, z1].map((v) => Math.round(v * 10) / 10) : [-e.dims[0] / 2, -e.dims[2] / 2, e.dims[0] / 2, e.dims[2] / 2];
      footCache.set(model, f); return f;
    }
    // the upper floors of a building in the state its ground floor shows
    const floorKey = (model, variant, i) => model + "|" + (variant || "timber") + "|" + (i + 1);
    const fresh = (model) => { const q = parse(model); return q ? "gen:" + q.type + ":" + Math.random().toString(36).slice(2, 8) : model; };

    /* ---------- the material ---------- */
    const GLSL = `
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }
      float gfbm(vec2 p){ return gn(p) * .55 + gn(p * 2.3 + 7.1) * .3 + gn(p * 5.1 + 3.3) * .15; }
      // screens give their own light; a tower's windows are lit here and there behind the glass
      void genGlow(inout vec3 e, vec3 c){
        int Mi = int(gMat + .5); if (Mi < 12) return;
        if (Mi == 12) { e += c * 1.5; return; }
        vec3 N = normalize(gObjN); if (abs(N.y) > .5) return;
        float s = abs(N.x) > abs(N.z) ? gObj.z : gObj.x, t = gObj.y, mx = mod(s, 12.7), my = mod(t, 44.0);
        float lit = step(.88, gh(floor(vec2(s, t) / vec2(12.7, 44.0)) + 17.0));
        float pane = Mi == 13 ? (1.0 - step(my, 9.0)) * step(.8, mx) * step(mx, 11.9) : step(3.0, mx) * step(mx, 9.7) * step(12.0, my) * step(my, 37.0);
        e += vec3(1.0, .78, .5) * lit * pane * .16;
      }
      void genPattern(inout vec3 c){
        int Mi = int(gMat + .5);
        vec3 N = normalize(gObjN);
        bool vert = abs(N.y) < .5;
        float s = abs(N.x) > abs(N.z) ? gObj.z : gObj.x, t = gObj.y;
        vec2 st = vert ? vec2(s, t) : gObj.xz;
        float n1 = gfbm(st * .16), n2 = gn(st * 1.7);
        if (Mi == 1) { // brick
          if (vert) {
            float ch = 1.35, row = floor(t / ch), off = mod(row, 2.0) * 2.05, cell = floor((s + off) / 4.1);
            vec2 f = vec2(fract((s + off) / 4.1) * 4.1, fract(t / ch) * ch);
            float e = min(min(f.x, 4.1 - f.x), min(f.y, ch - f.y)), mort = 1.0 - smoothstep(.09, .22, e);
            c *= .8 + .34 * gh(vec2(cell, row)) * (.85 + .3 * n2);
            c *= .86 + .28 * n1;
            c = mix(c, vec3(.3, .29, .26) * (.8 + .4 * n1), mort * .85);
          } else c *= .88 + .2 * n1;
        } else if (Mi == 2) { // concrete and stone
          c *= .84 + .22 * n1 + .08 * n2;
          if (vert) { float jx = mod(s, 50.8); float ln = 1.0 - smoothstep(.12, .3, min(jx, 50.8 - jx)); c *= 1.0 - .22 * ln;
            c *= 1.0 - .2 * smoothstep(.55, .85, gn(vec2(s * .45, t * .025))); }
        } else if (Mi == 3) { // lapped boards
          if (vert) { float f = fract(t / 1.7); c *= .72 + .32 * smoothstep(0.0, .3, f); c *= .92 + .12 * n1; } else c *= .9 + .15 * n1;
        } else if (Mi == 4) { // corrugated metal
          float q = vert ? s : gFace.x; float rib = .5 + .5 * sin(q * 3.5);
          c *= .76 + .32 * rib;
          float rs = smoothstep(.56, .82, gfbm(st * .09 + 3.0)) + (vert ? .35 * smoothstep(.6, .95, gn(vec2(s * .4, t * .03))) : 0.0);
          c = mix(c, vec3(.2, .07, .025), clamp(rs, 0.0, 1.0) * .75);
          gRough = .5 + .4 * rs; gMetal = .35 * (1.0 - rs);
        } else if (Mi == 5) { // roofing felt and gravel
          c *= .8 + .25 * n1 + .14 * gh(floor(st * 2.5)); gRough = .95;
        } else if (Mi == 6) { // shingles
          if (N.y > .2) { float row = floor(gFace.y / 2.3), u = gFace.x + mod(row, 2.0) * 1.6, tab = floor(u / 3.2), fy = fract(gFace.y / 2.3);
            float gap = 1.0 - smoothstep(.06, .18, min(fract(u / 3.2), 1.0 - fract(u / 3.2)) * 3.2);
            c *= .72 + .34 * gh(vec2(tab, row)); c *= .66 + .34 * smoothstep(0.0, .3, 1.0 - fy); c *= 1.0 - .35 * gap; c *= .88 + .2 * n1; }
          else c *= .7;
        } else if (Mi == 7) { // glass
          c *= .75 + .4 * gn(st * .25); gRough = .1; gMetal = .3;
        } else if (Mi == 8) { // planks
          float q = vert ? t : gObj.x, along = vert ? s : gObj.z, pk = floor(q / 2.4), f = fract(q / 2.4);
          c *= .8 + .3 * gh(vec2(pk, 3.0)); c *= .88 + .18 * gn(vec2(pk * 7.0, along * .5)); c *= .75 + .25 * smoothstep(0.0, .12, min(f, 1.0 - f));
        } else if (Mi == 9) { c *= .88 + .18 * n1; gRough = .42; gMetal = .55;
        } else if (Mi == 10) { c *= .65 + .55 * gn(gObj.xz * .9 + gObj.y);
        } else if (Mi == 11) { // floor tiles
          if (!vert) { vec2 f = fract(gObj.xz / 5.0); float g = 1.0 - smoothstep(.02, .06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
            c *= .9 + .14 * gh(floor(gObj.xz / 5.0)); c *= 1.0 - .35 * g; }
        } else if (Mi == 12) { // a lit screen: blocks of picture, a fine grid of pixels
          vec2 q = st * .8; float px = smoothstep(.15, .4, fract(q.x)) * smoothstep(.15, .4, fract(q.y));
          c *= .5 + .75 * gh(floor(st / vec2(16.0, 9.0))) * (.7 + .3 * gn(st * .12)); c *= .8 + .2 * px; gRough = .35;
        } else if (Mi == 13) { // a glass curtain wall: mullions a bay apart, a spandrel band at each floor
          if (vert) { float mx = mod(s, 12.7), my = mod(t, 44.0); float mull = 1.0 - smoothstep(.25, .6, min(mx, 12.7 - mx)), span = 1.0 - smoothstep(8.0, 9.0, my);
            c = mix(c * (.72 + .45 * gn(st * .04 + gh(floor(st / vec2(12.7, 44.0))) * 3.0)), c * .35 + vec3(.06), max(mull * .9, span * .8)); gRough = mix(.06, .55, max(mull, span)); gMetal = .45; }
          else c *= .9;
        } else if (Mi == 14) { // stone with punched windows, a grid a bay wide and a floor high
          c *= .84 + .22 * n1 + .06 * n2;
          if (vert) { float mx = mod(s, 12.7), my = mod(t, 44.0); float win = step(3.0, mx) * step(mx, 9.7) * step(12.0, my) * step(my, 37.0);
            float sill = step(10.8, my) * step(my, 12.0) * step(2.4, mx) * step(mx, 10.3);
            c = mix(c, vec3(.09, .11, .13) * (.8 + .5 * gn(st * .3)), win); c *= 1.0 + .25 * sill; gRough = mix(.85, .12, win); gMetal = .25 * win; }
        } else { c *= .9 + .14 * n1 + .05 * n2; }
        // worn, drybrushed edges on trim and furniture (big walls draw none: their pieces' cuts are not edges)
        if (gFace.z > .5 && gFace.w > .5) {
          float d = min(min(gFace.x, gFace.z - gFace.x), min(gFace.y, gFace.w - gFace.y));
          float e = 1.0 - smoothstep(.1, .45, d);
          c = mix(c, min(c * 1.5 + .035, vec3(1.0)), e * .55);
        }
        if (N.y > .6) c = mix(c, c * 1.12 + .015, .5); // dust on what faces up
      }`;
    const mats = {};
    function material(hidden) {
      const k = hidden ? "h" : "s";
      if (mats[k]) return mats[k];
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .86, metalness: 0 });
      if (hidden) { m.transparent = true; m.opacity = .35; }
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "attribute vec4 aFace; attribute float aMat; varying vec4 gFace; varying float gMat; varying vec3 gObj; varying vec3 gObjN;\n#include <common>")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tgFace = aFace; gMat = aMat; gObj = position; gObjN = normal;");
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "varying vec4 gFace; varying float gMat; varying vec3 gObj; varying vec3 gObjN; float gRough = -1.0; float gMetal = -1.0;\n" + GLSL + "\n#include <common>")
          .replace("#include <color_fragment>", "#include <color_fragment>\n\tgenPattern(diffuseColor.rgb);")
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n\tif (gRough >= 0.0) roughnessFactor = gRough;")
          .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n\tif (gMetal >= 0.0) metalnessFactor = gMetal;")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\tgenGlow(totalEmissiveRadiance, diffuseColor.rgb);");
      };
      m.customProgramCacheKey = () => "rvGenBuild2" + k;
      m.userData.gen = true;
      return (mats[k] = m);
    }

    return {
      TYPES, isGen: (model) => !!parse(model), entry, foot, geo, floorKey, fresh, material, planOf,
      MSCHEME, // the machines' paint schemes: [panels, second panels, accent] (table/machines.js finds the paint by them)
      // a machine's moving parts (table/machines.js): { base, body, parts: [{ kind, pivot, geo, ... }] }, or null
      isMachine: (model) => { const q = parse(model); return !!(q && TYPES[q.type] && TYPES[q.type].machine); },
      rig: (model, variant) => { const q = parse(model); if (!q || !TYPES[q.type] || !TYPES[q.type].machine) return null; const st = STATES[variant] || variant || "i"; if (st === "r") return null; return make(model, st, true); },
      // the add menu's list: a type per entry, or for the street kit one entry per piece
      catalog: (ids) => (ids || Object.keys(TYPES)).filter((k) => TYPES[k]).flatMap((k) => k === "street"
        ? [["straight-6", "Street (6 squares)"], ["straight-12", "Street (12 squares)"], ["cross", "Crossroads"], ["tee", "T-junction"], ["corner", "Street corner"], ["lot-6x4", "Parking lot"], ["lot-8x7", "Parking lot (two rows)"], ["runway-24-w-9", "Runway end"], ["taxi-12", "Taxiway"], ["apron-12x8", "Apron"]].map(([s, n]) => ({ type: k, model: "gen:street:" + s, name: n, sub: "street kit" }))
        : [{ type: k, model: "gen:" + k + ":0", name: TYPES[k].name, sub: TYPES[k].sub }]),
    };
  };
})();
