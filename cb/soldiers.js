/* Soldiers for the pixel look (13 Nov 2026)
   window.RevelrySoldiers(THREE, kit) -> { make(opts), update(dt) }
   A soldier is a skeleton of joints carrying rounded, tapered body parts and gear (helmet, plate carrier, pouches,
   pack, knee pads, gloves, boots, a rifle), coloured from a camo set. It is animated procedurally, the way game
   characters are: the feet are planted on the ground and stepped by a gait (two-bone IK bends the knees), the pelvis
   rides over them, the torso twists toward what it aims at, both hands stay on the rifle (arm IK), and recoil,
   reloads, hits and deaths are layered on top. Everything moves through springs and eased curves, so it flows.
   Units: 1 unit is about 6 cm; a soldier stands about 30 tall and faces +z. Their left is +x. */
(() => {
  "use strict";
  window.RevelrySoldiers = function (THREE, kit) {
    const { mergeGeometries, RoundedBoxGeometry, material, scene, fx } = kit;
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const ease = (t) => t * t * (3 - 2 * t);
    const angD = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
    const UP = V(0, 1, 0);

    /* ---------- colour: camo sets and a smooth noise that the palette breaks into blotches ---------- */
    const CAMO = {
      multicam: ["#7a6a48", "#917b5f", "#5f5a3c", "#4f5a3c", "#ad9677"],
      ranger: ["#4f5a3c", "#5c6240", "#3b4430", "#66704a", "#454c34"],
      urban: ["#5f676d", "#7d858a", "#454c52", "#a1a7a8", "#332a21"],
      desert: ["#ad9677", "#c9b392", "#917b5f", "#76634c", "#c9b392"],
    };
    const GEAR = { coyote: "#8f7d5a", ranger: "#4f5a3c", black: "#2a2724", tan: "#a39070" };
    function hash(x, y, z) { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
    function noise(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = ease(xf), v = ease(yf), w = ease(zf);
      const c = (a, b, d) => hash(xi + a, yi + b, zi + d);
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
    }
    const col = new THREE.Color();
    function paint(g, fill, seed = 0) {
      g = g.index ? g.toNonIndexed() : g; g.deleteAttribute("uv");
      const p = g.attributes.position, a = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (Array.isArray(fill)) { const n = noise(x * .55 + seed, y * .55 + seed * 2, z * .55); col.set(fill[clamp(Math.floor(n * fill.length * 1.15 - .08 * fill.length), 0, fill.length - 1)]); }
        else if (typeof fill === "function") col.set(fill(x, y, z));
        else col.set(fill);
        a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g;
    }
    // shapes
    const tube = (len, r0, r1, seg = 8, hs = 2) => new THREE.CylinderGeometry(r0, r1, len, seg, hs).translate(0, -len / 2, 0);
    const rbox = (w, h, d, r = .25) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - .01, h / 2 - .01, d / 2 - .01));
    const ball = (r, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs);
    const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
    const mesh = (parts) => { const m = new THREE.Mesh(mergeGeometries(parts), material); m.castShadow = true; m.receiveShadow = true; return m; };
    const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

    // body measurements
    const L = { thigh: 7.3, shin: 7.0, ankle: .8, upper: 5.1, fore: 4.5, hipX: 1.75, shX: 3.0, shY: 3.5 };
    const STAND = L.ankle + (L.thigh + L.shin) * .992 + .4;

    /* ---------- anatomy: limbs turned from a radius profile, with muscle bellies pushed out where they sit ---------- */
    // prof: [[t, r]] with t from 0 (the joint) to 1 (the far end); bumps: [{ t, w, a, dir, p }] dir is the angle round
    // the limb (0 = front/+z, PI/2 = +x), p how tightly the bulge wraps; sx/sz squash the section (e.g. a flatter shin)
    function limb(len, prof, bumps = [], o = {}) {
      const seg = o.seg || 12, rings = o.rings || 10, pos = [], idx = [];
      const rAt = (t) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const [t0, r0] = prof[i - 1], [t1, r1] = prof[i]; const k = (t - t0) / (t1 - t0); return r0 + (r1 - r0) * ease(k); } return prof[prof.length - 1][1]; };
      for (let j = 0; j <= rings; j++) {
        const t = j / rings, base = rAt(t);
        for (let i = 0; i <= seg; i++) {
          const a = i / seg * Math.PI * 2; let rr = base;
          for (const b of bumps) { const g = Math.exp(-(((t - b.t) / b.w) ** 2)); const c = Math.max(0, Math.cos(a - b.dir)); rr += b.a * g * c ** (b.p || 2); }
          pos.push(Math.sin(a) * rr * (o.sx || 1), -t * len, Math.cos(a) * rr * (o.sz || 1) + (o.dz || 0) * t);
        }
      }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      if (o.cap !== false) { const top = new THREE.SphereGeometry(rAt(0) * .98, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(o.sx || 1, .55, o.sz || 1); const bot = new THREE.SphereGeometry(rAt(1) * .98, seg, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(o.sx || 1, .55, o.sz || 1).translate(0, -len, (o.dz || 0)); return mergeGeometries([g.toNonIndexed(), top.toNonIndexed(), bot.toNonIndexed()].map((x) => { x.deleteAttribute("uv"); return x; })); }
      return g;
    }
    // a trunk lofted through sections { y, w (half width), d (half depth), z (shift), n (squareness) }
    function loft(secs, seg = 16) {
      const pos = [], idx = [];
      secs.forEach((q) => { for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), n = 2 / (q.n || 2.6);
        pos.push(Math.sign(s) * Math.abs(s) ** n * q.w, q.y, Math.sign(c) * Math.abs(c) ** n * q.d * (c < 0 ? (q.back || 1) : 1) + (q.z || 0)); } });
      for (let j = 0; j < secs.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      // caps, so the section is closed at both ends
      for (const j of [0, secs.length - 1]) { const c = pos.length / 3, q = secs[j]; pos.push(0, q.y, q.z || 0); for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i; j ? idx.push(c, a, a + 1) : idx.push(c, a + 1, a); } }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }

    /* ---------- the rifle (+z forward; the origin is the butt plate) ---------- */
    function makeRifle(kind, tint) {
      const dark = "#231d17", mid = "#332a21", furn = tint || "#2a2724";
      const P = [];
      if (kind === "lmg") {
        P.push(paint(at(rbox(1.5, 2.0, 4, .3), 0, -.3, 2), furn), paint(at(rbox(1.5, 2.4, 5.4, .2), 0, .1, 6.6), dark), paint(at(tube(8, .38, .38, 6), 0, .3, 9, Math.PI / 2), mid),
          paint(at(rbox(1.4, 1.3, 4, .3), 0, .3, 11), furn), paint(at(rbox(2.4, 2.6, 2.4, .4), -.2, -1.9, 7), "#5c5236"), paint(at(rbox(.6, 1.9, .8, .2), 0, -1.6, 5.2, -.3), dark),
          paint(at(tube(2.6, .12, .12, 4), .5, -.8, 13.6, .5), dark), paint(at(tube(2.6, .12, .12, 4), -.5, -.8, 13.6, .5), dark), paint(at(rbox(1, 1, 2.2, .2), 0, 1.6, 6), dark));
        return { geo: mergeGeometries(P), grip: V(0, -1.3, 5.0), support: V(0, -.2, 10.4), muzzle: V(0, .3, 17.2), magwell: V(-.2, -1.6, 7), len: 17, mag: paint(at(rbox(2.2, 2.4, 2.2, .4), 0, 0, 0), "#5c5236") };
      }
      const long = kind === "dmr";
      P.push(paint(at(rbox(1.2, 1.9, 3.4, .3), 0, -.4, 1.7), furn), paint(at(tube(1.4, .3, .3, 6), 0, .1, 3.8, Math.PI / 2), dark),
        paint(at(rbox(1.25, 1.9, 4.2, .15), 0, .1, 6.2), dark), paint(at(tube(long ? 5.6 : 4.2, .62, .62, 8), 0, .2, (long ? 10.9 : 10.2), Math.PI / 2), furn),
        paint(at(tube(long ? 3.4 : 2.4, .2, .2, 6), 0, .2, long ? 15.4 : 13.5, Math.PI / 2), dark), paint(at(rbox(.6, 1.8, .9, .2), 0, -1.2, 5.0, -.35), furn),
        paint(at(rbox(.9, .9, long ? 3.2 : 1.8, .3), 0, 1.4, 6.6), dark), paint(at(tube(.4, .42, .42, 8), 0, 1.4, long ? 8.4 : 7.6, Math.PI / 2), "#2d4c5a"));
      return { geo: mergeGeometries(P), grip: V(0, -1.4, 5.0), support: V(0, -.25, 9.8), muzzle: V(0, .2, long ? 17.2 : 14.8), magwell: V(0, -1.4, 7.0), len: long ? 17 : 15, mag: paint(at(rbox(.8, 2.6, 1.3, .2), 0, -1.2, 0, .18), dark) };
    }

    // every weapon: where the hands go, how it fires, how it is reloaded
    function makeWeapon(kind, tint) {
      const dark = "#231d17", furn = tint || "#2a2724";
      // empty hands, a blade for one hand, an axe or a bat for two: the handle runs along +z from the pommel at 0
      const hand = { magwell: V(), charge: V(), chargeBack: V(), eject: V(), mag: paint(rbox(.2, .2, .2, .05), dark), noMag: true, cap: 1, rate: .5, kick: 0, reload: "none" };
      if (kind === "none") return { kind, none: true, geo: paint(rbox(.2, .2, .2, .05), dark), grip: V(), support: V(), muzzle: V(0, 0, 1), len: 0, ...hand };
      if (kind === "machete") return { kind, melee: 1, reach: 11, geo: mergeGeometries([paint(at(rbox(.62, .85, 2.3, .2), 0, 0, 1.15), "#3a2c20"), paint(at(rbox(.9, 1.1, .3, .1), 0, 0, 2.4), dark), paint(at(rbox(.16, 1.35, 6.4, .06), 0, .12, 5.7), "#9aa0a3"), paint(at(rbox(.16, .9, 1.4, .06), 0, .3, 9.2, -.25), "#9aa0a3")]),
        grip: V(0, 0, 1.15), support: V(0, 0, 1.15), muzzle: V(0, 0, 9.5), len: 10, ...hand };
      if (kind === "axe" || kind === "bat") { const axe = kind === "axe";
        return { kind, melee: 2, reach: 13, geo: mergeGeometries(axe ? [paint(at(tube(13, .3, .34, 6), 0, 0, 13, Math.PI / 2), "#6b4a2e"), paint(at(rbox(.5, 3.3, 2.1, .12), 0, 1.25, 11.7), "#8a9094"), paint(at(rbox(.7, 1.1, 1.5, .15), 0, -.5, 11.7), "#3a3d40")]
          : [paint(at(tube(5, .26, .3, 6), 0, 0, 5, Math.PI / 2), "#3a2c20"), paint(at(tube(8, .5, .3, 8), 0, 0, 13, Math.PI / 2), "#a8875a")]),
          grip: V(0, 0, 1.6), support: V(0, 0, axe ? 6.4 : 4.4), muzzle: V(0, 0, 12), len: 13, ...hand }; }
      if (kind === "pistol") {
        const g = mergeGeometries([paint(at(rbox(.75, .95, 3.3, .15), 0, .3, 1.65), dark), paint(at(rbox(.7, 2.1, 1.0, .2), 0, -.9, .7, .2), furn), paint(at(rbox(.3, .5, .9, .1), 0, -.35, 1.6), dark)]);
        return { kind, geo: g, pistol: true, grip: V(0, -.8, .75), support: V(.15, -1.0, .95), muzzle: V(0, .3, 3.4), magwell: V(0, -1.9, .55), charge: V(0, .9, 1.5), chargeBack: V(0, .9, .1), eject: V(-.5, .6, 1.8),
          mag: paint(at(rbox(.5, 1.7, .7, .12), 0, -.2, 0, .2), dark), cap: 15, rate: .22, kick: 16, reload: "pistol" };
      }
      if (kind === "shotgun") {
        const g = mergeGeometries([paint(at(rbox(1.2, 1.9, 3.6, .3), 0, -.45, 1.8), "#5c4030"), paint(at(rbox(1.2, 1.8, 3.6, .15), 0, .1, 5.4), dark), paint(at(tube(9.6, .36, .36, 8), 0, .45, 12, Math.PI / 2), dark),
          paint(at(tube(7.4, .34, .34, 8), 0, -.3, 10.8, Math.PI / 2), dark), paint(at(tube(3, .62, .62, 8), 0, -.3, 10.4, Math.PI / 2), "#5c4030"), paint(at(rbox(.6, 1.6, .9, .2), 0, -1.3, 4.6, -.35), "#5c4030")]);
        return { kind, geo: g, grip: V(0, -1.4, 4.6), support: V(0, -.5, 10), muzzle: V(0, .45, 16.8), magwell: V(0, -.9, 6.6), charge: V(0, -.5, 10), chargeBack: V(0, -.5, 7.8), eject: V(-.7, .3, 5.6),
          mag: paint(at(tube(1.1, .3, .3, 6), 0, .55, 0, Math.PI / 2), "#b0312a"), noMag: true, cap: 6, rate: .9, kick: 40, pellets: 5, pump: true, reload: "shells" };
      }
      const R = makeRifle(kind, tint); R.kind = kind; R.eject = V(-.8, .4, 6.2);
      if (kind === "lmg") Object.assign(R, { charge: V(-.9, .3, 7.4), chargeBack: V(-.9, .3, 5.4), cap: 100, rate: .075, kick: 14, reload: "belt" });
      else Object.assign(R, { charge: V(0, 1.2, 4.4), chargeBack: V(0, 1.3, 2.6), cap: kind === "dmr" ? 20 : 30, rate: kind === "dmr" ? .5 : .1, kick: kind === "dmr" ? 34 : 20, reload: "mag" });
      return R;
    }
    // body shapes: h scales the whole figure, bulk the limbs, tw and td the trunk's width and depth
    const BUILDS = {
      average: { h: 1, bulk: 1, tw: 1, td: 1 }, slim: { h: 1.01, bulk: .86, tw: .9, td: .86 }, stocky: { h: .94, bulk: 1.15, tw: 1.1, td: 1.12 },
      heavy: { h: 1, bulk: 1.2, tw: 1.14, td: 1.36 }, tall: { h: 1.09, bulk: .97, tw: 1, td: .97 }, small: { h: .89, bulk: .9, tw: .9, td: .92 },
    };

    /* ---------- building one soldier ---------- */
    const ALL = [];
    let seedN = 1;
    function make(o = {}) {
      const rnd = (() => { let s = (o.seed || seedN++) * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const role = o.role || pick(["rifleman", "rifleman", "rifleman", "gunner", "medic", "radio", "marksman"]);
      const camo = CAMO[o.camo || "multicam"], cs = rnd() * 50;
      const gear = GEAR[o.gear || (o.camo === "urban" ? "black" : o.camo === "ranger" ? "ranger" : "coyote")];
      const skin = o.skin || pick(["#e0b892", "#c9a07a", "#a4785a", "#7c5a42", "#5c4030"]);
      const glove = pick(["#2a2724", "#5c4c3a", "#463a2d"]), boot = pick(["#5c4c3a", "#463a2d", "#2a2724"]);
      // a survivor wears plain clothes and no armour; a soldier wears camouflage, a helmet and a plate carrier
      const civ = o.outfit === "survivor"; if (civ && o.helmet === undefined) o.helmet = false;
      const tc = pick(["#5f676d", "#7c3a1e", "#2d4c5a", "#463a2d", "#66704a", "#917b5f"]), lc = pick(["#454c52", "#3b4430", "#5c4c3a", "#332a21"]);
      const topC = civ ? [tc, tc, tc, tc, lc] : camo, legC = civ ? [lc, lc, lc] : camo, hatC = civ ? pick(["#332a21", "#7c3a1e", "#454c52"]) : camo[2];
      const B = BUILDS[o.build] || BUILDS.average;
      const root = new THREE.Group(); root.position.set(o.x || 0, 0, o.z || 0); scene.add(root);

      // skeleton
      const pelvis = joint(root, 0, STAND, 0);
      const spine = joint(pelvis, 0, 1.4, 0), chest = joint(spine, 0, 2.8, 0), neck = joint(chest, 0, 4.55, -.2), head = joint(neck, 0, 1.15, .15);
      const leg = (s) => { const th = joint(pelvis, s * L.hipX, -.4, 0), sh = joint(th, 0, -L.thigh, 0), ft = joint(sh, 0, -L.shin, 0); return { th, sh, ft, s }; };
      const arm = (s) => { const up = joint(chest, s * L.shX, L.shY, -.2), fo = joint(up, 0, -L.upper, 0), hd = joint(fo, 0, -L.fore, 0); return { up, fo, hd, s }; };
      const LL = leg(1), LR = leg(-1), AL = arm(1), AR = arm(-1);

      // the trunk: hips and seat, waist, ribcage, chest, shoulder line and trapezius, in three overlapping pieces
      const FRONT = 0, BACK = Math.PI;
      pelvis.add(mesh([paint(loft([{ y: -2.3, w: 2.22, d: 1.61, z: .05 }, { y: -1.4, w: 2.5, d: 1.7, back: 1.1 }, { y: -.3, w: 2.6, d: 1.75, back: 1.1 }, { y: .8, w: 2.63, d: 1.80, z: .05 }, { y: 1.9, w: 2.28, d: 1.61, z: .08 }]), legC, cs),
        paint(at(rbox(5.7, .8, 4.1, .3), 0, 1.05, .05), gear), paint(at(rbox(1.3, 1.5, 1.0, .25), 2.0, .55, -1.75), gear), paint(at(rbox(1.3, 1.5, 1.0, .25), -1.8, .55, -1.85), gear), paint(at(rbox(1.7, 1.3, 1.1, .25), 0, .5, -2.1), gear)]));
      spine.add(mesh([paint(loft([{ y: -.2, w: 2.28, d: 1.61, z: .08 }, { y: 1.2, w: 2.34, d: 1.67, z: .12 }, { y: 2.6, w: 2.63, d: 1.86, z: .12 }, { y: 3.4, w: 2.81, d: 1.98, z: .12 }]), topC, cs + 3)]));
      const torso = [paint(loft([{ y: -.2, w: 2.69, d: 1.92, z: .12 }, { y: 1.3, w: 2.98, d: 2.17, z: .18 }, { y: 2.6, w: 3.22, d: 2.17, z: .12 }, { y: 3.45, w: 3.39, d: 1.92, z: -.05, n: 3 }, { y: 4.05, w: 2.75, d: 1.55, z: -.15 }, { y: 4.55, w: 1.40, d: 1.18, z: -.2 }, { y: 4.9, w: 0.99, d: 0.99, z: -.2 }]), topC, cs + 5)];
      // the plate carrier, pouches, the radio or medic kit, the pack
      if (!civ) {
      torso.push(paint(at(rbox(5.7, 4.8, 1.1, .35), 0, 2.2, 2.1, -.06), gear), paint(at(rbox(5.7, 4.6, 1.1, .35), 0, 2.3, -2.05, .05), gear),
        paint(at(rbox(.9, 2.7, 4.1, .25), 2.95, 1.4, 0), gear), paint(at(rbox(.9, 2.7, 4.1, .25), -2.95, 1.4, 0), gear),
        paint(at(rbox(1.1, 1.1, 4.6, .25), 1.6, 4.4, -.05, .1), gear), paint(at(rbox(1.1, 1.1, 4.6, .25), -1.6, 4.4, -.05, .1), gear));
      for (const x of [-1.4, 0, 1.4]) torso.push(paint(at(rbox(1.3, 1.7, 1.0, .2), x * 1.1, .95, 2.9), gear), paint(at(rbox(1.0, .32, .6, .1), x * 1.1, 1.85, 2.9), "#2a2724"));
      torso.push(paint(at(rbox(1.8, 1.0, .7, .2), 1.1, 3.4, 2.75), gear));
      if (role === "medic") torso.push(paint(at(rbox(2.8, 2.7, 1.7, .5), 0, 2.4, -3.25), gear), paint(at(rbox(1.2, .4, .2, .05), 0, 2.6, -4.12), "#b0312a"), paint(at(rbox(.4, 1.2, .2, .05), 0, 2.6, -4.12), "#b0312a"));
      else if (role === "radio") torso.push(paint(at(rbox(2.6, 3.3, 1.7, .4), 0, 2.4, -3.25), gear), paint(at(tube(6, .09, .09, 4), -.8, 9.6, -3.35), "#14110e"), paint(at(rbox(.9, .5, .6, .1), .6, 4.2, -3.35), "#2a2724"));
      else if (role !== "marksman" && rnd() < .55) torso.push(paint(at(rbox(3.8, 3.8, 1.9, .6), 0, 2.4, -3.35), gear), paint(at(rbox(3.4, .9, .6, .2), 0, 4.0, -3.15), "#2a2724"));
      } else if (rnd() < .6) torso.push(paint(at(rbox(3.4, 3.8, 1.7, .6), 0, 2.4, -2.9), pick(["#5c4c3a", "#454c52", "#7c3a1e"])));
      chest.add(mesh(torso));
      // deltoids cap the shoulder joint
      chest.add(mesh([paint(at(ball(1.45, 12, 8), 2.95, 3.45, -.2, 0, 0, 0, 1, 1.0, 1.1), topC, cs + 9), paint(at(ball(1.45, 12, 8), -2.95, 3.45, -.2, 0, 0, 0, 1, 1.0, 1.1), topC, cs + 11)]));
      // the neck: thick at the base, the muscles running up behind the jaw
      neck.add(mesh([paint(limb(1.6, [[0, 1.25], [.5, 1.05], [1, .98]], [{ t: .3, w: .4, a: .12, dir: BACK }], { seg: 10, rings: 4, cap: false }).translate(0, 1.35, 0), skin)]));
      // the head: cranium, brow, cheekbones, jaw and chin, nose, ears, eyes
      const hp = [paint(at(ball(1, 14, 10), 0, 1.8, 0, 0, 0, 0, 1.38, 1.62, 1.6), skin), paint(at(rbox(2.3, 1.25, 2.1, .55), 0, .75, .5), skin),
        paint(at(rbox(1.45, .7, 1.0, .3), 0, .3, 1.05), skin), paint(at(rbox(2.5, .35, .5, .15), 0, 2.15, 1.35), skin),
        paint(at(rbox(.42, .85, .55, .15), 0, 1.45, 1.62, .25), skin), paint(at(rbox(.25, .7, .5, .1), 1.4, 1.5, 0), skin), paint(at(rbox(.25, .7, .5, .1), -1.4, 1.5, 0), skin),
        paint(at(rbox(.42, .2, .12, .05), .55, 1.85, 1.52), "#14110e"), paint(at(rbox(.42, .2, .12, .05), -.55, 1.85, 1.52), "#14110e")];
      if (rnd() < .45) hp.push(paint(at(rbox(2.4, .5, .22, .1), 0, 1.85, 1.58), "#14110e")); // eye protection
      if (rnd() < .3) hp.push(paint(at(rbox(2.4, 1.0, 1.8, .45), 0, .65, .65), pick(["#463a2d", "#332a21", "#76634c"]))); // beard
      if (o.helmet !== false) {
        hp.push(paint(at(new THREE.SphereGeometry(2.05, 14, 7, 0, Math.PI * 2, 0, Math.PI * .5), 0, 2.0, -.05, 0, 0, 0, 1.0, .9, 1.08), (x, y, z) => (noise(x + cs, y * 1.3, z) > .5 ? camo[0] : camo[1])),
          paint(at(new THREE.CylinderGeometry(2.05, 2.1, .4, 14, 1, true), 0, 2.0, -.05, 0, 0, 0, 1, 1, 1.08), gear),
          paint(at(rbox(.75, .6, .3, .1), 0, 3.0, 2.0, -.35), "#2a2724"), paint(at(rbox(.3, .5, 2.1, .1), 2.05, 2.4, 0), "#2a2724"), paint(at(rbox(.3, .5, 2.1, .1), -2.05, 2.4, 0), "#2a2724"),
          paint(at(new THREE.CylinderGeometry(.68, .68, .5, 10), 1.55, 1.5, 0, 0, 0, Math.PI / 2), "#2a2724"), paint(at(new THREE.CylinderGeometry(.68, .68, .5, 10), -1.55, 1.5, 0, 0, 0, Math.PI / 2), "#2a2724"),
          paint(at(rbox(1.1, .5, .3, .1), 0, 3.15, -1.75), "#2a2724"));
      } else hp.push(paint(at(new THREE.SphereGeometry(1.7, 12, 6, 0, Math.PI * 2, 0, Math.PI * .45), 0, 2.0, .05, 0, 0, 0, 1, .9, 1.05), hatC), paint(at(new THREE.CylinderGeometry(1.8, 1.8, .25, 12), 0, 2.45, .55, .2, 0, 0, 1, 1, 1.2), hatC));
      head.add(mesh(hp));
      // legs: the thigh full at the top with the quadriceps in front and hamstrings behind, the inner knee; the calf
      // swelling behind the upper shin, narrowing to the ankle; loose trouser cloth over it; knee pads; boots
      for (const g of [LL, LR]) {
        const inner = g.s > 0 ? -Math.PI / 2 : Math.PI / 2, outer = -inner;
        const thigh = limb(L.thigh + .7, [[0, 1.62], [.18, 1.66], [.5, 1.46], [.85, 1.14], [1, 1.06]], [{ t: .38, w: .28, a: .2, dir: FRONT }, { t: .3, w: .3, a: .18, dir: BACK }, { t: .8, w: .14, a: .12, dir: inner }, { t: .25, w: .3, a: .1, dir: outer }], { sz: 1.05 });
        g.th.add(mesh([paint(thigh, legC, cs + g.s * 7), paint(at(rbox(.6, 1.7, 1.6, .25), g.s * 1.6, -3.7, -.1), legC, cs + 13)].concat(g.s < 0 && role !== "medic" ? [paint(at(rbox(.8, 2.0, 1.5, .25), -1.7, -2.0, .2), gear), paint(at(rbox(.5, 1.3, .9, .15), -1.9, -1.4, .2), "#2a2724")] : [])));
        const shin = limb(L.shin - .1, [[0, 1.1], [.12, 1.06], [.32, 1.08], [.62, .86], [.88, .7], [1, .68]], [{ t: .3, w: .17, a: .28, dir: BACK }, { t: .3, w: .17, a: .1, dir: inner }], { sz: .95 });
        g.sh.add(mesh([paint(shin, legC, cs + g.s * 17), paint(at(rbox(1.85, 2.1, .95, .4), 0, -.55, .95, .15), "#2a2724"), paint(at(tube(1.9, 1.0, 1.02, 10), 0, -L.shin + 2.3, 0), boot)]));
        g.ft.add(mesh([paint(at(rbox(2.0, 1.35, 2.5, .45), 0, -.1, .25), boot), paint(at(rbox(1.85, 1.0, 1.8, .45), 0, -.3, 1.8), boot), paint(at(rbox(2.1, .35, 4.1, .12), 0, -.72, .8), "#14110e")]));
      }
      // arms: deltoid into the upper arm, biceps in front and triceps behind, the forearm thick below the elbow and
      // slimming to the wrist, sleeves rolled to the elbow pads; gloves with the fingers closed round a grip
      for (const g of [AL, AR]) {
        const out = g.s > 0 ? Math.PI / 2 : -Math.PI / 2;
        const upper = limb(L.upper + .3, [[0, 1.3], [.15, 1.22], [.45, 1.12], [.8, .92], [1, .86]], [{ t: .5, w: .25, a: .22, dir: FRONT }, { t: .35, w: .3, a: .24, dir: BACK }, { t: .12, w: .2, a: .16, dir: out }]);
        g.up.add(mesh([paint(upper, topC, cs + g.s * 23), paint(at(rbox(1.5, 1.3, 1.5, .45), 0, -L.upper, -.25), "#2a2724")]));
        const fore = limb(L.fore, [[0, .95], [.22, 1.0], [.6, .78], [1, .62]], [{ t: .22, w: .25, a: .16, dir: out }, { t: .25, w: .25, a: .1, dir: BACK }]);
        g.fo.add(mesh([paint(fore, topC, cs + g.s * 31), paint(at(tube(1.0, .7, .72, 10), 0, -L.fore + .45, 0), glove)]));
        g.hd.add(mesh([paint(at(rbox(1.15, 1.15, 1.4, .38), 0, -.55, 0), glove), paint(at(rbox(1.05, 1.0, 1.25, .32), 0, -1.45, .28, -.4), glove), paint(at(rbox(.5, 1.0, .55, .2), g.s * .6, -.65, .65, .3), glove)]));
      }
      // the build: thicker or thinner limbs and trunk, wider or narrower shoulders and hips
      for (const j of [pelvis, spine, chest]) j.children.forEach((c) => { if (c.isMesh) c.scale.set(B.tw, 1, B.td); });
      for (const g of [LL, LR]) { g.th.position.x *= (B.tw + 1) / 2; for (const j of [g.th, g.sh]) j.children.forEach((c) => { if (c.isMesh) c.scale.set(B.bulk, 1, B.bulk); }); }
      for (const g of [AL, AR]) { g.up.position.x *= B.tw; for (const j of [g.up, g.fo]) j.children.forEach((c) => { if (c.isMesh) c.scale.set(B.bulk, 1, B.bulk); }); }
      // weapons: a primary (carbine, long rifle, machine gun or shotgun) and a pistol in the thigh holster
      const kindR = o.weapon || (role === "gunner" ? "lmg" : role === "marksman" ? "dmr" : role === "breacher" ? "shotgun" : "rifle");
      const armW = (kind) => {
        const R = makeWeapon(kind, o.camo === "desert" ? "#76634c" : null), obj = new THREE.Mesh(R.geo, material); obj.castShadow = true; root.add(obj);
        const magIn = new THREE.Mesh(R.mag, material); magIn.position.copy(R.magwell); magIn.visible = !R.noMag; obj.add(magIn);
        const magHand = new THREE.Mesh(R.mag, material); magHand.visible = false; AL.hd.add(magHand); magHand.position.set(0, -1.4, .4);
        return { R, obj, magIn, magHand, ammo: R.cap };
      };
      const W = { primary: armW(kindR), sidearm: armW("pistol") };
      const handsOnly = !!(W.primary.R.melee || W.primary.R.none); // no pistol for these: what they carry is all they have
      if (handsOnly) W.sidearm.obj.visible = false; if (W.primary.R.none) W.primary.obj.visible = false;
      const rifle = W.primary.obj, R = W.primary.R, magIn = W.primary.magIn, magHand = W.primary.magHand;
      const nade = new THREE.Mesh(paint(ball(.75, 8, 6), "#3b4430"), material); nade.visible = false; nade.position.set(0, -1.1, .3); AR.hd.add(nade);

      const s = {
        role, root, pelvis, spine, chest, neck, head, LL, LR, AL, AR, rifle, R, magIn, magHand, W, nade, handsOnly, way: [], apprW: 0, cs: null, coverStyle: "auto", blocked: 0, sidle: null, noCover: false, weapon: "primary", swap: -1, swapFrom: "primary", build: B,
        stance: "stand", proneW: 0, dive: null, landP: 0, landV: 0, hitTw: 0, hitTwV: 0, rag: null, peekP: 0, peekV: 0, autoCover: true, coverRef: null, pendCover: null, deadOpt: null, cover: false, coverYaw: 0, coverW: 0, peek: null, act: null, pump: 0, rl: null, tacW: 0,
        pos: root.position.clone(), vel: V(), yaw: o.yaw || 0, baseY: o.y || 0, trav: null, plan: null, okPos: null, goal: null, run: false, speedMax: 0,
        aim: null, aimW: 0, crouch: false, crouchW: 0, runW: 0, gait: "walk", through: false,
        feet: [LL, LR].map((g) => { const p = V(g.s * 1.9, 0, 0).applyAxisAngle(UP, o.yaw || 0).add(root.position); return { g, plant: p, yaw: o.yaw || 0, swing: null, lift: 0, pitch: 0 }; }),
        phase: 0, t: rnd() * 10, kick: 0, kickV: 0, hitP: 0, hitV: 0, hitDir: V(), 
        burst: 0, nextShot: 0, reload: -1, dead: -1, deadDir: V(), rifleFall: null, step: 0, stepAcc: 0, cool: 0, onShot: null, ready: 1,
        sway: V(), chestYaw: o.yaw || 0, headQ: new THREE.Quaternion(),
      };
      Object.defineProperty(s, "run", { get: () => s.gait === "run", set: (v) => { s.gait = v ? "run" : s.gait === "run" ? "walk" : s.gait; } });
      ALL.push(s); return api(s);
    }

    /* ---------- gaits. Speeds and strides are in units (1 unit is about 6 cm) per second and per full stride.
       duty: the share of the stride a foot spends on the ground (over .5 there is always a foot down; under, a flight).
       lift/kick: how high the foot clears and how far the heel comes up behind. strike/toe: the foot's roll, heel
       strike to toe-off. bob/sway/twist: the pelvis. lean: forward from the hips. crouch: how far the hips sit down. ---------- */
    const GAITS = {
      walk:    { speed: 22, stride: 21, duty: .62, lift: 1.3, kick: .5, bob: .5, sway: .42, twist: .11, lean: .03, crouch: .55, width: 1.5, strike: .3, toe: .7 },
      run:     { speed: 58, stride: 41, duty: .37, lift: 2.2, kick: 3.4, bob: .5, sway: .15, twist: .2, lean: .15, crouch: 1.5, width: 1.0, strike: .1, toe: .95 },
      tacwalk: { speed: 13, stride: 15, duty: .66, lift: 1.0, kick: .15, bob: .05, sway: .22, twist: .04, lean: .18, crouch: 1.7, width: 1.9, strike: .26, toe: .45 },
      crouch:  { speed: 11, stride: 13, duty: .66, lift: .9, kick: .1, bob: .04, sway: .2, twist: .04, lean: .3, crouch: 3.8, width: 2.0, strike: .2, toe: .4 },
      crawl:   { speed: 6.5, stride: 9, duty: .7, lift: .25, kick: 0, bob: 0, sway: .3, twist: .1, lean: 0, crouch: 0, width: 2.3, strike: 0, toe: .1 },
      tacrun:  { speed: 36, stride: 28, duty: .52, lift: 1.6, kick: 1.1, bob: .16, sway: .14, twist: .08, lean: .22, crouch: 1.7, width: 1.6, strike: .18, toe: .7 },
    };

    /* ---------- commands ---------- */
    function api(s) {
      Object.defineProperties(s, { moving: { get: () => !!(s.trav || s.plan) }, busy: { get: () => s.reload >= 0 || s.swap >= 0 || !!s.act }, held: { get: () => s.W[s.weapon] }, ammo: { get: () => s.W[s.weapon].ammo } });
      return Object.assign(s, {
        // mode: "walk", "run", "tacwalk" (slow, crouched, rifle up) or "tacrun" (the combat glide); through: don't slow at this point
        moveTo(p, mode, through = false) { const up = (s.baseY || 0) >= STAND_MIN; s.plan = null; s.goal = p ? (collide && !up ? pushOut(V(p.x, 0, p.z), 2.9 * s.build.h) : V(p.x, 0, p.z)) : null; s.through = !!(p && through); s.pendCover = null; s.way = []; s.crossing = false;
          if (s.goal) { // a move that ends against cover goes straight to the place behind it, in one motion
            if (!through && !up && s.autoCover && !s.cover && s.stance !== "prone") { const hit = coverNear(s.goal, s.threat); if (hit) { const told = s.goal, spot = coverPlan(s, hit.c, undefined, told).spot; s.pendCover = hit.c;
                // the move still goes to the square that was asked for; the cover is taken from there, in the same motion
                if (spot.distanceTo(told) > 4) { s.way = collide ? route(s.pos, told) : [told.clone()]; s.goal = spot; return; } s.goal = spot; } }
            s.way = collide && !up ? route(s.pos, s.goal).slice(0, -1) : []; } if (mode === true) s.gait = "run"; else if (typeof mode === "string") s.gait = mode; else if (mode === false && s.gait === "run") s.gait = "walk"; },
        setGait(g) { s.gait = g; },
        // a move along a given way (square by square), over anything on it that can be vaulted or climbed
        movePath(pts, mode) { const last = pts[pts.length - 1]; s.moveTo(last, mode); const tail = s.pendCover && s.way.length ? [s.way[s.way.length - 1]] : []; s.way = pts.slice(0, -1).map((q) => V(q.x, 0, q.z)).concat(tail); s.crossing = true; },
        // a move that changes height. steps: [{ x, z, y, how }] from where the figure stands, each the next place to be and
        // how to get there: "walk" (level), "over" (a vault on the way, as movePath), "step" (up or down less than a step),
        // "climb" (up: a mantle onto something low, a climb up something higher), "hop" (off a drop), "jump" (off a high
        // drop, landing in a roll), "down" (climbing down), "slide" (across a hood and off its far side), "leap" (a gap)
        movePlan(steps, mode) { if (s.dead >= 0 || !steps || !steps.length) return; if (s.cover) s.leaveCover(); s.pendCover = null; s.sidle = null; s.peek = null; s.goal = null; s.way = []; s.crossing = false; s.through = false;
          if (typeof mode === "string") s.gait = mode; s.plan = { steps: steps.map((q) => ({ ...q })), i: 0, gait: s.gait }; if (!s.trav) planNext(s); },
        // put the figure somewhere at once (a height included)
        place(x, z, y = 0) { s.plan = null; s.trav = null; s.goal = null; s.way = []; s.pos.set(x, 0, z); s.baseY = y; s.okPos = null; s.vel.set(0, 0, 0); s.root.position.set(x, y, z); s.feet.forEach((f) => f.plant.set(x, 0, z)); },
        aimAt(p) { s.aim = p ? V(p.x, p.y ?? 14, p.z) : null; },
        // stances: "stand", "crouch" (a knee down when still, a low walk when moving), "prone" (crawls when moving)
        setStance(st) { if (s.dead >= 0) return; if (st === "prone" && s.stance !== "prone" && s.vel.length() > 20) s.dive = { t: 0 }; if (st !== "prone") s.dive = null; s.stance = st; s.keepStance = st; s.crouch = st === "crouch"; if (st !== "stand" && s.gait === "run") s.gait = "tacrun"; },
        setCrouch(on) { s.setStance(on ? "crouch" : "stand"); },
        fire(n = 3) { if (s.dead >= 0) return; if (s.handsOnly) return s.melee(); s.burst = Math.max(s.burst, n); s.blocked = 0; },
        doReload() { if (!s.handsOnly && s.reload < 0 && s.swap < 0 && !s.act && s.dead < 0) { s.reload = 0; s.burst = 0; s.rl = { shells: 0 }; } },
        // primary <-> pistol
        swapWeapon(to) { if (s.handsOnly || s.busy || s.dead >= 0) return; to = to || (s.weapon === "primary" ? "sidearm" : "primary"); if (to === s.weapon) return; s.swapFrom = s.weapon; s.weapon = to; s.swap = 0; s.burst = 0; },
        // hand signals with the support hand: "point" (at a place), "halt" (raised fist), "advance" (chopping forward)
        signal(kind = "point", at) { if (s.busy || s.dead >= 0) return; s.act = { name: "signal", kind, at: at ? V(at.x, at.y ?? 10, at.z) : null, t: 0, dur: kind === "point" ? 1.15 : 1.05 }; },
        // throw with the right hand: kind "frag", "smoke" or anything else for a plain object
        throwAt(at, kind = "frag") { if (s.busy || s.dead >= 0) return; s.act = { name: "throw", kind, at: V(at.x, at.y ?? 0, at.z), t: 0, dur: 1.15 }; s.burst = 0; },
        // a butt stroke with a gun, a swing with a blade or an axe, a punch with nothing
        melee() { if (s.busy || s.dead >= 0) return; const R = s.W[s.weapon].R; s.act = { name: "melee", t: 0, dur: R.melee === 2 ? .85 : R.melee ? .68 : R.none ? .45 : .6 }; },
        interact() { if (s.busy || s.dead >= 0) return; s.act = { name: "interact", t: 0, dur: 1.5 }; },
        // cover: get down behind something, facing yaw; peekFire rises over it ("over") or leans round it ("left"/"right")
        // style: "kneel" (down behind it, facing it), "shoulder" (side-on, a shoulder against it), "back" (back against it),
        // or "auto" (a shoulder to a wall too tall to see over, kneeling behind a low one)
        takeCover(yaw, ref, style) { if (s.dead >= 0) return; const c = ref || null, pl = coverPlan(s, c, style);
          s.cover = true; s.coverYaw = yaw ?? s.yaw; s.coverRef = c; s.goal = null; s.cs = pl.cs; s.stance = pl.cs.stand ? "stand" : "crouch"; s.crouch = !pl.cs.stand; },
        setCoverStyle(style) { s.coverStyle = style; const c = s.coverRef; if (!s.cover || !c || s.peek) return; const pl = coverPlan(s, c); if (pl.spot.distanceTo(s.pos) < 1.5) s.takeCover(c.yaw, c); else { s.goal = pl.spot; s.through = false; s.pendCover = c; } },
        leaveCover() { s.cover = false; s.coverRef = null; s.pendCover = null; s.peek = null; s.sidle = null; s.cs = null; s.stance = s.keepStance === "crouch" ? "crouch" : "stand"; s.crouch = s.stance === "crouch"; },
        // style: "over", "left", "right", "side" (the nearer edge) or "auto". Whatever is asked for, the line from the weapon to
        // the target is checked against the cover first: over the top if it can be seen over, else round the nearer edge that
        // gives a clear shot, shuffling along to the edge first if it is too far to lean
        peekFire(at, n = 3, style = "auto") { if (!s.cover || s.peek || s.dead >= 0 || s.busy) return; if (s.handsOnly) return;
          const c = s.coverRef, H = s.build.h, tgt = V(at.x, at.y ?? 14, at.z); let shift = 4.6 * H, full = !!(s.cs && s.cs.name !== "kneel");
          if (c) { const cl = leftOf(c.yaw), lat = s.pos.clone().sub(c.p).dot(cl), near = lat >= 0 ? 1 : -1;
            const sh = (dir) => Math.max(3, (dir > 0 ? c.w - lat : c.w + lat) + 4.4 * H);
            const overOK = (f) => !(s.cs && s.cs.stand) && !segBlocked(s.pos.clone().setY((s.baseY || 0) + (f ? RIFLE_UP : RIFLE_HALF) * H), tgt);
            const sideOK = (dir) => !segBlocked(s.pos.clone().addScaledVector(cl, dir * sh(dir) - 1.85 * H).setY((s.baseY || 0) + (s.cs && s.cs.stand ? RIFLE_UP : RIFLE_KNEEL) * H), tgt);
            const want = style === "auto" || style === "over" ? ["over", near, -near] : style === "side" ? [near, -near, "over"] : style === "left" ? [1, -1, "over"] : [-1, 1, "over"];
            let got = null; for (const k of want) { if (k === "over") { if (overOK(full)) { got = "over"; break; } if (!full && overOK(true)) { got = "over"; full = true; break; } } else if (sideOK(k)) { got = k; break; } }
            if (got == null) { if (!s.forceFire) return false; got = want[0] === "over" && !(s.cs && s.cs.stand) ? "over" : near; if (got === "over") full = true; }
            if (got === "over") style = "over"; else { style = got > 0 ? "left" : "right"; shift = sh(got);
              if (shift > 7.6 * H) { s.goal = c.p.clone().addScaledVector(fwdOf(c.yaw), -(c.d + (s.cs ? s.cs.off : 11.5) * H)).addScaledVector(cl, got * (c.w - 1.8 * H)); s.through = false; s.sidle = { at: tgt, n, style }; return true; } } }
          else if (style === "auto") style = "over"; else if (style === "side") style = "right";
          s.peek = { ph: "up", n, style, hold: 0, prev: s.aim, shift: Math.max(3, shift), full }; s.aim = tgt; return true; },
        // a hit shoves the body the way the shot was going: the torso snaps back and twists, the knees give, a step is taken to catch it
        hit(from, force = 1) { if (s.dead >= 0) return; const d = s.pos.clone().sub(from).setY(0); if (d.lengthSq() < 1e-6) d.set(0, 0, -1); d.normalize(); s.hitDir.copy(d); s.hitV += 11 * force; s.landV -= 9 * force; { const still = !!window.CB_FLINCH; /* a page can ask for a flinch in place: no shove back, barely a twist */ s.hitTwV += (d.dot(leftOf(s.yaw)) > 0 ? -1 : 1) * (5 + Math.random() * 5) * force * (still ? .2 : 1); if (!still) s.vel.addScaledVector(d, 30 * force); } fx.blood && fx.blood(s.chest.getWorldPosition(V()).add(V(0, 2, 0)), d); },
        // o.zone: "chest", "head", "legs" or "blast"; o.force scales the blow. The body goes limp and falls as a ragdoll from there.
        die(from, o) { if (s.dead >= 0) return; s.deadOpt = o || {}; s.rag = null; s.dive = null; s.trav = null; s.plan = null; s.dead = 0; s.deadDir.copy(from ? s.pos.clone().sub(from).setY(0).normalize() : V(0, 0, -1).applyAxisAngle(UP, s.yaw)); s.goal = null; s.burst = 0; s.reload = -1; s.swap = -1; s.act = null; s.peek = null; s.cover = false; s.nade.visible = false; for (const k in s.W) s.W[k].magHand.visible = false; fx.blood && fx.blood(s.chest.getWorldPosition(V()).add(V(0, 2, 0)), s.deadDir); },
        revive() { if (s.rag) { const m = s.rag.pts.hL.p.clone().add(s.rag.pts.hR.p).multiplyScalar(.5); s.pos.set(m.x, 0, m.z); const lv = levelsAt(s.pos), hy = Math.max(gh(s.pos), m.y - 3), fl = lv.filter((v) => v <= hy + 6).pop(); if (fl != null) s.baseY = fl; else { pushOut(s.pos, 3.4); s.baseY = gh(s.pos); } s.okPos = null; s.root.position.copy(s.pos); s.feet.forEach((f) => f.plant.copy(s.pos)); for (const k in s.W) s.root.attach(s.W[k].obj); } s.rag = null; s.landP = s.landV = s.hitP = s.hitV = 0; s.dead = -1; s.rifleFall = null; s.vel.set(0, 0, 0); s.stance = "stand"; s.crouch = false; s.proneW = 0; for (const k in s.W) { s.W[k].ammo = s.W[k].R.cap; s.W[k].magIn.visible = !s.W[k].R.noMag; } },
        remove() { scene.remove(s.root); ALL.splice(ALL.indexOf(s), 1); },
      });
    }

    /* ---------- IK helpers ---------- */
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _x = V(), _y = V(), _z = V();
    // turn a joint so its -Y axis runs from `from` to `to`, with its +Z toward `hint` (the way the knee or elbow points)
    function aimBone(o, from, to, hint) {
      _y.subVectors(from, to).normalize(); _z.copy(hint).addScaledVector(_y, -hint.dot(_y)); if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1); _z.normalize(); _x.crossVectors(_y, _z);
      _m.makeBasis(_x, _y, _z); _q.setFromRotationMatrix(_m); setWorldQ(o, _q);
    }
    function setWorldQ(o, q) { o.parent.getWorldQuaternion(_pq); o.quaternion.copy(_pq.invert().multiply(q)); o.updateMatrixWorld(true); }
    // two bones from A, lengths l1 and l2, reaching for T, bending toward pole direction P
    function twoBone(A, T, l1, l2, P) {
      const d0 = T.clone().sub(A); let d = d0.length(); const dir = d0.normalize(); d = clamp(d, Math.abs(l1 - l2) + .01, l1 + l2 - .02);
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const p = P.clone().addScaledVector(dir, -P.dot(dir)); if (p.lengthSq() < 1e-6) p.set(0, 1, 0); p.normalize();
      return { K: A.clone().addScaledVector(dir, a).addScaledVector(p, h), E: A.clone().addScaledVector(dir, d) };
    }
    const fwdOf = (y) => V(Math.sin(y), 0, Math.cos(y)), leftOf = (y) => V(Math.cos(y), 0, -Math.sin(y));

    /* ---------- cover the figures know about: boxes they can get down behind, and that bodies fall against ---------- */
    const COVERS = [], SOLIDS = [], collide = kit.collide !== false;
    /* Finding what is at a spot must not get slower as the table fills up: solids are kept in a grid of 48-unit squares,
       each listed in every square it could matter to (its own reach plus 64). The grid is rebuilt when a solid is added or taken away. */
    const GRID = { m: new Map(), n: -1, ver: 0, built: -1, none: [] }, GC = 48;
    function NS(x, z) { if (GRID.n !== SOLIDS.length || GRID.built !== GRID.ver) { GRID.m.clear(); GRID.n = SOLIDS.length; GRID.built = GRID.ver;
        for (const c of SOLIDS) { const r = Math.sqrt(c.rad2) + 64, i0 = Math.floor((c.p.x - r) / GC), i1 = Math.floor((c.p.x + r) / GC), j0 = Math.floor((c.p.z - r) / GC), j1 = Math.floor((c.p.z + r) / GC);
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const key = (i + 4096) * 8192 + (j + 4096); let l = GRID.m.get(key); if (!l) GRID.m.set(key, l = []); l.push(c); } } }
      return GRID.m.get((Math.floor(x / GC) + 4096) * 8192 + (Math.floor(z / GC) + 4096)) || GRID.none; }
    const CLIMB_H = 51; // ten feet: what a figure can get over in a move (a low thing is vaulted, a higher one climbed)
    // x, z: its middle; yaw: the way a figure behind it faces (toward the threat); w, d: half its width and depth; h: its height
    /* the ground's own height (hills, banks, a riverbed): GH(x, z), 0 where the table is flat. A solid stands on the
       ground at its own base (by), and everything it holds (its cubes, its floors, its roof) is measured up from there. */
    let GH = () => 0; const gh = (p) => GH(p.x, p.z);
    // too steep to stand on: a bank, a cut, the side of an embankment (about 50 degrees and up)
    const steep = (p) => { const x = p.x, z = p.z, a = GH(x + 3, z) - GH(x - 3, z), b = GH(x, z + 3) - GH(x, z - 3); return Math.max(Math.abs(a), Math.abs(b)) > 7.5; };
    function addCover(c) { const q = { by: c.by || 0, p: V(c.x, 0, c.z), yaw: c.yaw || 0, w: c.w, d: c.d, h: c.h, hf: c.hf || null, vox: c.vox || null, open: c.open || null }; q.rad2 = (Math.hypot(c.w, c.d) + 8) ** 2; COVERS.push(q); SOLIDS.push(q); GRID.ver++; return q; }
    // anything else that is solid (a building, a car, a barrel): nobody walks, falls or fires through it
    function addSolid(c) { const q = { by: c.by || 0, p: V(c.x, 0, c.z), yaw: c.yaw || 0, w: c.w, d: c.d, h: c.h, hf: c.hf || null, vox: c.vox || null, open: c.open || null, soft: c.soft || 0, y0: c.y0 ?? -1, rough: c.rough || 0 }; q.rad2 = (Math.hypot(c.w, c.d) + 8) ** 2; q.big = !!q.vox && (Math.max(c.w, c.d) > 62 || (c.h > 50 && Math.min(c.w, c.d) > 30)); SOLIDS.push(q); return q; }
    const inBox = (c, p) => { const r = p.clone().sub(c.p); return [r.dot(leftOf(c.yaw)), r.dot(fwdOf(c.yaw))]; };
    const boxDist = (c, p) => { const [lx, lz] = inBox(c, p); return Math.hypot(Math.max(0, Math.abs(lx) - c.w), Math.max(0, Math.abs(lz) - c.d)); };
    // is this spot inside something (grown by pad)?
    function blockedAt(p, pad = 0) { for (const c of NS(p.x, p.z)) { if ((c.vox && c.big) || c.soft) continue; const [lx, lz] = inBox(c, p); if (Math.abs(lx) < c.w + pad && Math.abs(lz) < c.d + pad) return c; } return null; }
    /* ---------- height. A solid may carry a height field (hf: in its own frame, a grid of how high anything stands and
       how high the highest face that can be stood on is); one without is a plain box, flat on top if it is wide enough.
       A figure has a height of its own (s.baseY, where its feet are): 0 on the ground, or the top of what it stands on. ---------- */
    const STEP_H = 15.5, STAND_MIN = 6; // a step (about 3 ft) is taken in stride; nothing lower than this counts as a place to stand on
    function surfOf(c, lx, lz) { const F = c.hf;
      if (!F) return Math.abs(lx) <= c.w && Math.abs(lz) <= c.d ? { top: c.h + c.by, up: Math.min(c.w, c.d) >= 4 ? c.h + c.by : -1 } : null;
      const i = Math.floor((lx - F.x0) / F.g), j = Math.floor((lz - F.z0) / F.g); if (i < 0 || j < 0 || i >= F.nx || j >= F.nz) return null; const k = j * F.nx + i; return { top: F.top[k] + c.by, up: F.up[k] < 0 ? -1 : F.up[k] + c.by }; }
    // the highest thing at a spot: how high it stands, how high its standable face is, and which solid it is
    function surfAt(p) { const g0 = gh(p); let top = g0, up = g0, c0 = null; for (const c of NS(p.x, p.z)) { const [lx, lz] = inBox(c, p), q = surfOf(c, lx, lz); if (q && q.top > top) { top = q.top; up = q.up; c0 = c; } } return { top, up, c: c0 }; }
    // where a figure can stand at this spot: { y } (0 is the ground), or null if something is in the way
    const RING = [[1, 0], [.7, .7], [0, 1], [-.7, .7], [-1, 0], [-.7, -.7], [0, -1], [.7, -.7]];
    function floorAt(p) { const s0 = surfAt(p), g0 = gh(p);
      if (s0.top < g0 + STAND_MIN) return blockedAt(p, 3.2) || steep(p) ? null : { y: g0, c: null };
      if (s0.up < g0 + STAND_MIN || s0.top > s0.up + 3) return null;
      let ok = 0; const q = V(); for (const [a, b] of RING) { q.set(p.x + a * 4.5, 0, p.z + b * 4.5); const r = surfAt(q); if (Math.abs(r.up - s0.up) <= 5 && r.top <= s0.up + 5) ok++; }
      return ok >= 7 ? { y: s0.up, c: s0.c } : null; }
    /* ---------- the inside of things. A generated piece carries its shape in small cubes (vox: 1 solid, 2 glass, 4 a
       door's leaf), so it can be walked into, seen through at its windows and open doors, and stood in on every storey.
       SIGHT is stopped by what is solid and by a shut door; a body (MOVE) by what is solid and by glass, and it opens doors. ---------- */
    const SIGHT = 5, MOVE = 7, HEAD = 9; // HEAD: clear rows of cubes a standing figure needs (about 5 ft 8)
    function voxBits(c, lx, y, lz) { const X = c.vox, i = Math.floor((lx - X.x0) / X.g), j = Math.floor((lz - X.z0) / X.g), k = Math.floor(y / X.g); if (i < 0 || j < 0 || k < 0 || i >= X.nx || j >= X.nz || k >= X.ny) return 0;
      const q = (k * X.nz + j) * X.nx + i; let b = X.D[q]; if (b & 4) b = c.open && c.open.has(X.doors.get(q)) ? 0 : 4; return b; } // where a door is, it is the door that counts (a frame or a wall's end in the same cube does not)
    // is this point inside something? (mode: SIGHT or MOVE)
    function solidAt(p, mode = MOVE) { for (const c of NS(p.x, p.z)) { if (c.soft) continue; const dx = p.x - c.p.x, dz = p.z - c.p.z; if (dx * dx + dz * dz > c.rad2) continue; const [lx, lz] = inBox(c, p);
        if (c.vox) { if (voxBits(c, lx, p.y - c.by, lz) & mode) return c; } else if (Math.abs(lx) <= c.w && Math.abs(lz) <= c.d && p.y - c.by < c.h && p.y - c.by > -1) return c; } return null; }
    // where a line first meets something: { t, c } or null. Plain boxes are met at their faces; pieces with cubes, where the cubes are
    function segHit(a, b, mode = SIGHT, skip) { let best = null; const len = a.distanceTo(b);
      for (const c of SOLIDS) { if ((skip && skip.has(c)) || (c.thru && mode === SIGHT)) continue; const f = fwdOf(c.yaw), l = leftOf(c.yaw), ra = a.clone().sub(c.p), rb = b.clone().sub(c.p), A = [ra.dot(l), a.y - c.by, ra.dot(f)], B = [rb.dot(l), b.y - c.by, rb.dot(f)];
        const X = c.vox, hx = X ? -X.x0 : c.w, hz = X ? -X.z0 : c.d, lo = [-hx, c.y0 ?? -1, -hz], hi = [hx, c.h + (X ? 1 : 0), hz]; let t0 = 0, t1 = 1, out = false;
        for (let k = 0; k < 3 && !out; k++) { const dd = B[k] - A[k]; if (Math.abs(dd) < 1e-9) { if (A[k] < lo[k] || A[k] > hi[k]) out = true; } else { let u0 = (lo[k] - A[k]) / dd, u1 = (hi[k] - A[k]) / dd; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) out = true; } }
        if (out || (best && t0 >= best.t)) continue;
        if (!X) { best = { t: t0, c }; continue; }
        const n = Math.max(1, Math.ceil((t1 - t0) * len / 1.5)); for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; if (best && t >= best.t) break; if (voxBits(c, A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t) & mode) { best = { t, c }; break; } } }
      return best; }
    // every height a figure could stand at on this spot, lowest first: the ground, a floor of each storey, a roof, a hood
    const SLIM = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]; // the room a body needs, turned to get through a doorway
    function levelsAt(p) { const out = []; let ground = true;
      for (const c of NS(p.x, p.z)) { const dx = p.x - c.p.x, dz = p.z - c.p.z; if (dx * dx + dz * dz > c.rad2) continue; const [lx, lz] = inBox(c, p), X = c.vox;
        if (!X && c.soft) continue;
        if (!X) { if (Math.abs(lx) < c.w + 2.6 && Math.abs(lz) < c.d + 2.6) { ground = false; if (Math.abs(lx) <= c.w - 2 && Math.abs(lz) <= c.d - 2 && Math.min(c.w, c.d) >= 4 && c.h >= STAND_MIN) out.push(c.h + c.by); } continue; }
        if (Math.abs(lx) > 4 - X.x0 || Math.abs(lz) > 4 - X.z0) continue;
        let free = HEAD; for (let k = X.ny - 1; k >= 0; k--) { const y = (k + .5) * X.g; let ok = true; for (const [a, b] of SLIM) if (voxBits(c, lx + a, y, lz + b) & MOVE) { ok = false; break; }
          if (ok) free++; else { if (free >= HEAD && (voxBits(c, lx, y, lz) & MOVE)) out.push(Math.max(0, (k + 1) * X.g - 1.2) + c.by); free = 0; } }
        if (free < HEAD) ground = false; }
      if (ground && !steep(p)) out.push(gh(p)); const g1 = gh(p); return out.filter((v) => v >= g1 - 3).sort((a, b) => a - b); } // nothing under the land counts
    // the level nearest a height here, if it is within a step of it
    function floorNear(p, y) { let best = null; for (const v of levelsAt(p)) if (Math.abs(v - y) <= STEP_H && (best == null || Math.abs(v - y) < Math.abs(best - y))) best = v; return best; }
    // what would hold a body up here, looked for from a height downward
    function supAt(p, from) { let top = gh(p); for (const c of NS(p.x, p.z)) { const dx = p.x - c.p.x, dz = p.z - c.p.z; if (dx * dx + dz * dz > c.rad2) continue; const [lx, lz] = inBox(c, p), X = c.vox;
        if (!X) { if (Math.abs(lx) <= c.w && Math.abs(lz) <= c.d && c.h + c.by <= from + 1) top = Math.max(top, c.h + c.by); continue; }
        for (let k = Math.min(X.ny - 1, Math.floor((from - c.by) / X.g)); k >= 0; k--) if (voxBits(c, lx, (k + .5) * X.g, lz) & MOVE) { top = Math.max(top, (k + 1) * X.g - 1.2 + c.by); break; } }
      return top; }
    // can a body go straight from a to b at this height? The doors on the way are given, to be opened
    function passable(a, b, y) { const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 2)), q = V(), doors = [];
      for (let k = 0; k <= n; k++) { const t = k / n; for (const h of [7, 15, 23]) { q.set(a.x + (b.x - a.x) * t, y + h, a.z + (b.z - a.z) * t);
          for (const c of NS(q.x, q.z)) { if (!c.vox) continue; const dx = q.x - c.p.x, dz = q.z - c.p.z; if (dx * dx + dz * dz > c.rad2) continue; const [lx, lz] = inBox(c, q), X = c.vox, bits = voxBits(c, lx, q.y - c.by, lz); if (bits & MOVE) return null;
            if (bits & 4) { const id = X.doors.get((Math.floor((q.y - c.by) / X.g) * X.nz + Math.floor((lz - X.z0) / X.g)) * X.nx + Math.floor((lx - X.x0) / X.g)); if (!doors.some((o) => o.c === c && o.id === id)) doors.push({ c, id }); } } } }
      return { doors }; }
    // can a body stand here at about this height (within 2 ft of it)? The height it would stand at, or null. doors: any shut door it would be standing in is added
    function standAt(p, y0, doors, tol = STEP_H) { let best = null, inAny = false; const g0 = gh(p);
      for (const c of NS(p.x, p.z)) { if (c.soft) continue; const dx = p.x - c.p.x, dz = p.z - c.p.z; if (dx * dx + dz * dz > c.rad2) continue; const [lx, lz] = inBox(c, p), X = c.vox;
        const y = y0 - c.by;
        if (!X && c.h <= 6.5) { if (Math.abs(lx) <= c.w && Math.abs(lz) <= c.d && Math.abs(c.h - y) <= tol) best = Math.max(best ?? -1e9, c.h + c.by); continue; }
        if (!X) { if (Math.abs(lx) < c.w + 2.6 && Math.abs(lz) < c.d + 2.6 && y < c.h - 1) return null; continue; }
        if (Math.abs(lx) > 4 - X.x0 || Math.abs(lz) > 4 - X.z0) continue; inAny = true;
        let kT = -2; for (let k = Math.min(X.ny - 1, Math.floor((y + tol) / X.g)); k >= Math.max(0, Math.floor((y - tol) / X.g)); k--) if (voxBits(c, lx, (k + .5) * X.g, lz) & MOVE) { kT = k; break; }
        if (kT === -2) { if (y >= tol) continue; kT = -1; }
        for (let k = kT + 1; k <= Math.min(X.ny - 1, kT + HEAD); k++) for (const [a, b] of SLIM) { if ((a || b) && k < kT + 6) continue; const bits = voxBits(c, lx + a, (k + .5) * X.g, lz + b); if (bits & MOVE) return null; if ((bits & 4) && doors) { const id = X.doors.get((k * X.nz + Math.floor((lz + b - X.z0) / X.g)) * X.nx + Math.floor((lx + a - X.x0) / X.g)); if (!doors.some((o) => o.c === c && o.id === id)) doors.push({ c, id }); } }
        best = Math.max(best ?? -1e9, (kT < 0 ? 0 : (kT + 1) * X.g - 1.2) + c.by); }
      // a floor that lies under the land here (the end of a bridge running into its bank) is not stood on: the land is, if it can be reached
      if (best != null && best < g0 - 3) best = null;
      return best != null ? best : Math.abs(y0 - g0) < tol && !steep(p) ? g0 : null; }
    // a way on foot between two near spots when the straight line is shut: round the furniture, through the doorway. { via: the turns, doors }
    function microPath(a, ya, b, yb) { const g = 3.175, ti = Math.round((b.x - a.x) / g), tj = Math.round((b.z - a.z) / g), i0 = Math.min(0, ti) - 4, i1 = Math.max(0, ti) + 4, j0 = Math.min(0, tj) - 4, j1 = Math.max(0, tj) + 4, W = i1 - i0 + 1;
      const seen = new Map(), key = (i, j) => (j - j0) * W + (i - i0), q = [[0, 0, ya, null]], P = V(); seen.set(key(0, 0), q[0]); let end = null;
      const at = (i, j, y) => { if (i < i0 || i > i1 || j < j0 || j > j1) return null; P.set(a.x + i * g, 0, a.z + j * g); return standAt(P, y); };
      for (let h = 0; h < q.length && !end; h++) { const n = q[h];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const i = n[0] + di, j = n[1] + dj, k = key(i, j); if (i < i0 || i > i1 || j < j0 || j > j1 || seen.has(k)) continue;
          if (di && dj && (at(n[0] + di, n[1], n[2]) == null || at(n[0], n[1] + dj, n[2]) == null)) continue; const y = at(i, j, n[2]); if (y == null) continue;
          const m = [i, j, y, n]; seen.set(k, m); q.push(m); if (i === ti && j === tj && Math.abs(y - yb) < 9) { end = m; break; } } }
      if (!end) return null; const pts = [], doors = []; for (let n = end.length ? end : null; n; n = n[3]) pts.unshift(n);
      for (const n of pts) { P.set(a.x + n[0] * g, 0, a.z + n[1] * g); standAt(P, n[2], doors); }
      const via = []; for (let k = 1; k < pts.length - 1; k++) { const p0 = pts[k - 1], p1 = pts[k], p2 = pts[k + 1]; if (p1[0] - p0[0] !== p2[0] - p1[0] || p1[1] - p0[1] !== p2[1] - p1[1]) via.push([+(a.x + p1[0] * g).toFixed(1), +(a.z + p1[1] * g).toFixed(1)]); }
      return { via, doors }; }
    // is this spot hard going (brush, tall grass)? Every foot of it costs two
    function roughAt(x, z) { for (const c of NS(x, z)) { if (!c.rough) continue; const dx = x - c.p.x, dz = z - c.p.z; if (dx * dx + dz * dz <= c.w * c.w) return true; } return false; }
    // is this spot in or beside a piece with a shape of its own?
    function nearVox(p) { for (const c of NS(p.x, p.z)) { if (!c.vox) continue; const [lx, lz] = inBox(c, p); if (Math.abs(lx) < 14 - c.vox.x0 && Math.abs(lz) < 14 - c.vox.z0) return true; } return false; }
    // is the air over this spot clear between two heights (for a climb up a face, or a drop)?
    function airClear(p, y0, y1) { const q = V(p.x, 0, p.z); for (let y = y0; y <= y1; y += 3) { q.y = y; if (solidAt(q, MOVE)) return false; } return true; }
    // move a point out of whatever it is in, to pad clear of it
    function pushOut(p, pad) { for (let n = 0; n < 3; n++) { const c = blockedAt(p, pad); if (!c) break; if (c.vox) break; const [lx, lz] = inBox(c, p), ex = c.w + pad - Math.abs(lx), ez = c.d + pad - Math.abs(lz);
        if (ex < ez) p.addScaledVector(leftOf(c.yaw), (lx >= 0 ? 1 : -1) * (ex + .01)); else p.addScaledVector(fwdOf(c.yaw), (lz >= 0 ? 1 : -1) * (ez + .01)); } return p; }
    // the way on foot from a to b round whatever is solid: the corners to pass, then b
    function route(a, b, depth = 0) {
      const PAD = 3.6, A = a.clone().setY(2), B = b.clone().setY(2); let hit = null, ht = 9;
      for (const c of SOLIDS) { if (c.soft) continue; const pad = Math.max(0, Math.min(PAD, boxDist(c, A) - .15, boxDist(c, B) - .15)), t = segBox(c, A, B, pad); if (t != null && t < ht) { ht = t; hit = c; } }
      if (!hit || depth > 5) return [b.clone()];
      const m = PAD + 1.6, l = leftOf(hit.yaw), f = fwdOf(hit.yaw), cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => hit.p.clone().addScaledVector(l, i * (hit.w + m)).addScaledVector(f, j * (hit.d + m)));
      let best = null, bl = 1e9; for (const c of cs) { if (blockedAt(c, PAD - .2) || segBox(hit, A, c.clone().setY(2), PAD - .3) != null) continue; const len = a.distanceTo(c) + c.distanceTo(b); if (len < bl) { bl = len; best = c; } }
      if (!best) return [b.clone()];
      return route(a, best, depth + 1).concat(route(best, b, depth + 1));
    }
    // a solid seen from one of its four sides: the same box, facing the way someone on that side would face it
    const FACES = new WeakMap();
    function faceOf(c, k) { let m = FACES.get(c); if (!m) FACES.set(c, m = [c]); if (!m[k]) m[k] = k === 1 ? { p: c.p, yaw: c.yaw + Math.PI, w: c.w, d: c.d, h: c.h } : { p: c.p, yaw: c.yaw + (k === 2 ? -1 : 1) * Math.PI / 2, w: c.d, d: c.w, h: c.h }; return m[k]; }
    // looking for cover: the nearest solid thing within a square (five feet) of this spot, and the side of it you are on
    const COVER_REACH = 26.5;
    // with a threat known (where the enemy is), the side of a thing that puts it between the figure and the threat is preferred
    function coverNear(pos, threat, by = 0) { let best = null, bd = COVER_REACH, bs = 1e9; const tv = threat ? threat.clone().sub(pos).setY(0).normalize() : null, q = V();
      // a piece with a shape of its own (a building, inside or out; a vehicle): out from the spot along its four ways until
      // something solid from the shin to the chest is met; how far it runs to either side is the cover's width
      for (const c of NS(pos.x, pos.z)) { if (!c.vox) continue; const dx = pos.x - c.p.x, dz = pos.z - c.p.z; if (dx * dx + dz * dz > c.rad2 + 3600) continue;
        const solid = (p, h) => { const [lx, lz] = inBox(c, p); return voxBits(c, lx, by + h, lz) & 1; };
        for (let k = 0; k < 4; k++) { const yaw = c.yaw + k * Math.PI / 2, d = fwdOf(yaw), e = leftOf(yaw); let t = -1;
          for (let u = 2.5; u < COVER_REACH; u += 1.5) { q.copy(pos).addScaledVector(d, u); if (solid(q, 6) && solid(q, 13)) { t = u; break; } if (solid(q, 20)) break; }
          if (t < 0) continue; const hit = pos.clone().addScaledVector(d, t + .8), ext = [0, 0];
          for (const sg of [0, 1]) for (let u = 1.5; u <= 15; u += 1.5) { q.copy(hit).addScaledVector(e, (sg ? -1 : 1) * u); if (!solid(q, 13)) break; ext[sg] = u; }
          if (ext[0] + ext[1] < 4.5) continue; const sc = t - (tv ? 24 * d.dot(tv) : 0); if (sc >= bs) continue; bs = sc;
          best = { p: hit.clone().addScaledVector(e, (ext[0] - ext[1]) / 2).addScaledVector(d, .4).setY(0), yaw, w: (ext[0] + ext[1]) / 2, d: 1.2, h: solid(hit, 24) ? 44 : 17 }; } }
      for (const c of SOLIDS) { if (c.h < 7 || c.vox || c.soft || c.thru || by >= STAND_MIN) continue; const [lx, lz] = inBox(c, pos), ox = Math.abs(lx) - c.w, oz = Math.abs(lz) - c.d; if (ox <= 0 && oz <= 0) continue;
        const dist = Math.hypot(Math.max(ox, 0), Math.max(oz, 0)); if (dist >= bd) continue; const k = oz > ox ? (lz < 0 ? 0 : 1) : (lx > 0 ? 2 : 3); if ((k < 2 ? c.w : c.d) < 2.5) continue; const f = faceOf(c, k), sc = dist - (tv ? 24 * fwdOf(f.yaw).dot(tv) : 0); if (sc >= bs) continue; bs = sc; best = f; }
      return best ? { c: best, lat: pos.clone().sub(best.p).dot(leftOf(best.yaw)) } : null; }
    // where along a to b the segment enters this box (grown sideways by pad), or null
    function segBox(c, a, b, pad = 0) {
      const f = fwdOf(c.yaw), l = leftOf(c.yaw), ra = a.clone().sub(c.p), rb = b.clone().sub(c.p);
      const A = [ra.dot(l), a.y, ra.dot(f)], B = [rb.dot(l), b.y, rb.dot(f)], lo = [-c.w - pad, -1, -c.d - pad], hi = [c.w + pad, c.h, c.d + pad]; let t0 = 0, t1 = 1;
      if (c.vox && !pad) { const h = segHit(a, b, SIGHT); return h && h.c === c ? h.t : null; } // a piece with a shape of its own: its windows and doorways let a shot through
      for (let k = 0; k < 3; k++) { const dd = B[k] - A[k]; if (Math.abs(dd) < 1e-9) { if (A[k] < lo[k] || A[k] > hi[k]) return null; } else { let u0 = (lo[k] - A[k]) / dd, u1 = (hi[k] - A[k]) / dd; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) return null; } }
      return t0;
    }
    // does anything solid stand between two points?
    function segBlocked(a, b) { for (const c of SOLIDS) if (!c.soft && !c.thru && segBox(c, a, b) != null) return c; return null; }
    // the height of the weapon standing, half risen from a kneel, and kneeling (for a figure of average build)
    const RIFLE_UP = 22.6, RIFLE_HALF = 19.4, RIFLE_KNEEL = 14.5;
    // the ways of using cover: which way the body faces against the cover's own facing, how far back from it the hips sit, how far it hunches
    const CSTY = { kneel: { yaw: 0, off: 9.5, lean: .9 }, shoulder: { yaw: 1.32, off: 4.3, lean: .28 }, back: { yaw: Math.PI, off: 5.0, lean: .1 } };
    // how this figure would use this cover: the style, and the spot to be in
    function coverPlan(s, c, style, from) {
      const H = s.build.h; style = style || s.coverStyle || "auto"; const tall = !!c && c.h >= 26 * H; if (style === "auto" || !CSTY[style]) style = tall ? "shoulder" : "kneel";
      const lat = c ? (from || s.pos).clone().sub(c.p).dot(leftOf(c.yaw)) : 0, near = lat >= 0 ? 1 : -1, b = CSTY[style];
      const cs = { name: style, yaw: style === "shoulder" ? near * b.yaw : b.yaw, off: b.off, lean: b.lean, stand: tall };
      // behind a wall too tall to fire over, stay by the nearer end, where a lean brings the weapon round it
      const spot = c ? c.p.clone().addScaledVector(fwdOf(c.yaw), -(c.d + b.off * H)).addScaledVector(leftOf(c.yaw), clamp(lat, -Math.max(0, c.w - 1.8 * H), Math.max(0, c.w - 1.8 * H))) : s.pos.clone();
      return { cs, spot };
    }
    // something is in the line of fire: step sideways to the nearest place with a clear shot
    // how to get there. Far (near the edge of this turn's movement) or across open ground: fast. Short, or with cover most
    // of the way: a careful tactical walk. frac is how much of the turn's movement the move uses (0 to 1).
    function gaitFor(s, goal, frac = .5) { if (s.stance === "prone") return undefined; const pts = [s.pos.clone()].concat(collide ? route(s.pos, goal) : [goal.clone()]); let n = 0, cov = 0;
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], steps = Math.max(1, Math.round(a.distanceTo(b) / 12)); for (let k = 1; k <= steps; k++) { const q = a.clone().lerp(b, k / steps); n++; if (SOLIDS.some((c) => c.h >= 8 && boxDist(c, q) < 27)) cov++; } }
      const cover = n ? cov / n : 0;
      return frac >= .8 || (cover < .35 && frac > .3) ? (cover < .35 ? "run" : "tacrun") : frac > .55 ? "tacrun" : "tacwalk"; }
    function sidestep(s, y) { const to = s.aim.clone().sub(s.pos).setY(0).normalize(), l = V(to.z, 0, -to.x);
      for (const k of [7, -7, 13, -13, 20, -20, 28, -28]) { const p = s.pos.clone().addScaledVector(l, k); if (!segBlocked(p.clone().setY(y), s.aim) && !segBlocked(s.pos.clone().setY(3), p.clone().setY(3))) { s.goal = p; s.through = false; s.noCover = true; if (s.gait === "run" || s.gait === "walk") s.gait = "tacwalk"; s.blocked = 0; return true; } }
      return false; }
    // a move has ended: if it ended up against cover, settle in behind it
    function arrive(s) {
      s.crossing = false;
      if (s.pendCover) { const c = s.pendCover; s.pendCover = null; s.takeCover(c.yaw, c); return; }
      if (s.noCover) { s.noCover = false; return; }
      if (!s.autoCover || s.cover || s.stance === "prone") return;
      const hit = coverNear(s.pos, s.threat, s.baseY || 0); if (!hit) return; const { c } = hit, { spot } = coverPlan(s, c);
      if (spot.distanceTo(s.pos) < 1.5) s.takeCover(c.yaw, c); else { s.goal = spot; s.through = false; s.pendCover = c; if (s.gait === "run" || s.gait === "walk") s.gait = "tacrun"; }
    }

    /* ---------- getting up, down and over. A plan is a list of places to be and how to get to each; level stretches are
       walked as usual, and each change of height is a traverse: a short scripted motion (the body's place and height,
       and offsets laid over the usual pose: hips, feet, hands on a ledge, the weapon slung) that ends on its feet. ---------- */
    const lerp = (a, b, t) => a + (b - a) * t, G_FALL = 430;
    function planNext(s) { const P = s.plan; if (!P) return; const n = P.steps.length;
      if (P.i >= n) { s.plan = null; s.through = false; arrive(s); s.onPlanEnd && s.onPlanEnd(s); return; }
      const st = P.steps[P.i], level = (q) => q.how === "walk" || q.how === "over";
      if (level(st)) { let j = P.i; while (j < n && level(P.steps[j])) j++; const run = P.steps.slice(P.i, j), last = run[run.length - 1], up = (s.baseY || 0) >= STAND_MIN, pts = []; for (const q of run) { for (const v of q.via || []) pts.push(V(v[0], 0, v[1])); pts.push(V(q.x, 0, q.z)); } P.i = j;
        s.gait = P.gait; s.goal = pts[pts.length - 1]; s.way = pts.slice(0, -1); s.through = false; s.pendCover = null; s.crossing = run.some((q) => q.how === "over"); return; }
      P.i++; startTrav(s, st, P.gait, P.steps[P.i]); }
    function startTrav(s, st, gait, next) {
      const A = s.pos.clone().setY(0), B = V(st.x, 0, st.z), ya = s.baseY || 0, yb = st.y || 0, dist = Math.max(.01, A.distanceTo(B)), dir = B.clone().sub(A).multiplyScalar(1 / dist), yawD = Math.atan2(dir.x, dir.z), left = leftOf(yawD);
      const at = (d) => A.clone().addScaledVector(dir, d), N = Math.ceil(dist), hs = []; for (let d = 0; d <= N; d++) hs.push(supAt(at(Math.min(d, dist)), Math.max(ya, yb) + 26));
      const first = (f, from = 0) => { for (let d = from; d <= N; d++) if (f(hs[d])) return d; return -1; }, lastD = (f) => { for (let d = N; d >= 0; d--) if (f(hs[d])) return d; return -1; };
      const gname = s.stance === "crouch" ? "crouch" : gait || s.gait, wsp = Math.max(14, (GAITS[gname] || GAITS.walk).speed);
      const T = { kind: st.how, st, ph: "appr", t: 0, a: A, b: B, ya, yb, dir, yawD, sp: wsp, p0: A.clone(), gait0: gait || s.gait }; s.trav = T; s.goal = null; s.way = []; s.pendCover = null; s.crossing = false;
      const hands = (TR, pt, y, w) => { TR.hL = pt.clone().addScaledVector(leftOf(TR.yaw ?? yawD), 2.7).setY(y); TR.hR = pt.clone().addScaledVector(leftOf(TR.yaw ?? yawD), -2.7).setY(y); TR.hw = w; };
      const dust = (p, y) => fx.dust && fx.dust(V(p.x, y, p.z));
      if (st.how === "step") { // a step up or down taken in stride
        const dc = Math.max(0, first((h) => Math.abs(h - ya) > 3)); T.ph = "main"; T.dur = dist / wsp;
        T.fn = (m) => { const d = m * dist; s.pos.copy(at(d)); s.baseY = lerp(ya, yb, ease(clamp((d - dc + 5) / 10, 0, 1))); s.vel.copy(dir).multiplyScalar(wsp); }; T.keepVel = true; return; }
      if (st.how === "climb" || st.how === "down") { // up a face and onto its top, or the same in reverse
        const up = st.how === "climb", yl = up ? ya : yb, yh = up ? yb : ya, wd = up ? dir : dir.clone().negate(), o = up ? A : B, od = (d) => o.clone().addScaledVector(wd, d);
        const hh = up ? hs : hs.slice().reverse(); let face = -1; for (let d = 0; d < hh.length; d++) if (hh[d] >= yl + 9) { face = d; break; } if (face < 0) face = dist / 2; if (!up) face += dist - N;
        let lipY = yh; for (let d = Math.max(0, Math.floor(face)); d <= Math.min(hh.length - 1, Math.floor(face) + 6); d++) lipY = Math.max(lipY, Math.min(hh[d], yh + 12));
        const low = od(Math.max(0, face - 4.8)), hi = od(Math.min(dist, face + 5.6)), lipP = od(face + 1.1), faceP = od(face - .5), yawW = Math.atan2(wd.x, wd.z);
        const tR = .2, tP = Math.max(0, lipY - 21 - yl) / 78, tM = .44, tS = .16, dur = tR + tP + tM + tS, y0 = Math.max(yl, lipY - 21);
        T.p0 = up ? low : hi; T.sp = Math.min(wsp, 40); T.dur = dur; T.end = up ? hi : low;
        T.fn = (m, TR) => { const k = (up ? m : 1 - m) * dur; TR.yaw = yawW; TR.stow = 1; let by, p = low, hy = 0;
          const hy0 = (b) => Math.min(lipY + .4, b + 36.5), onLip = (b) => b + 36.5 >= lipY;
          if (k < tR) { const r = k / tR; by = yl; TR.py = -2.4 * Math.sin(Math.PI * r); TR.stow = ease(r); hy = lerp(by + 17, hy0(by), ease(r)); hands(TR, onLip(by) ? lipP : faceP, hy, ease(r)); }
          else if (k < tR + tP) { const q = (k - tR) / tP; by = lerp(yl, y0, q); TR.py = -.8; TR.pitch = .1; for (const i of [0, 1]) { TR.lift[i] = 2.6 + 2.4 * Math.sin(k * 11 + i * Math.PI); TR.off[i].copy(wd).multiplyScalar(1.5); }
            hands(TR, onLip(by) ? lipP : faceP, hy0(by), 1); if (!onLip(by)) { TR.hL.y += 2.2 * Math.sin(k * 11); TR.hR.y -= 2.2 * Math.sin(k * 11); } }
          else if (k < tR + tP + tM) { const q = (k - tR - tP) / tM, xp = ease(clamp((q - .4) / .6, 0, 1)); by = lerp(y0, lipY, ease(clamp(q / .7, 0, 1))); p = low.clone().lerp(hi, xp); const gap = lipY - by;
            TR.lift[0] = gap + 1.4 * Math.sin(Math.PI * q); TR.off[0].copy(wd).multiplyScalar(5.6 * ease(clamp(q / .4, 0, 1)) * (1 - xp)); TR.lift[1] = gap * ease(clamp((q - .3) / .35, 0, 1)) + 2 * Math.sin(Math.PI * q);
            TR.pitch = .5 * Math.sin(Math.PI * q); TR.py = -4.6 * Math.sin(Math.PI * clamp(q * 1.1, 0, 1)); hands(TR, lipP, lipY + .4, 1 - ease(clamp((q - .72) / .28, 0, 1))); }
          else { const q = (k - tR - tP - tM) / tS; p = hi; by = lerp(lipY, yh, ease(q)); TR.stow = 1 - ease(q); TR.py = -1.5 * (1 - q); }
          s.pos.copy(p); s.baseY = by; };
        return; }
      if (st.how === "slide") { // across a hood (or anything that low) and off its far side
        const face = Math.max(0, first((h) => h >= ya + 9)), far = Math.max(face, lastD((h) => h >= Math.max(ya, yb) + 9)); let hT = ya + 12; for (let d = face; d <= far; d++) hT = Math.max(hT, hs[d]);
        const P0 = at(Math.max(0, face - 5.4)), P2 = at(Math.min(dist, far + 5.6)), len = P0.distanceTo(P2); T.p0 = P0; T.sp = Math.max(wsp, 52); T.dur = len / 60; T.end = P2; if (s.stance === "stand") s.gait = "run";
        T.fn = (m, TR) => { const env = ease(clamp(m / .24, 0, 1)) * ease(clamp((1 - m) / .24, 0, 1)), by = lerp(ya, yb, ease(m)); s.pos.copy(P0).lerp(P2, m); s.baseY = by;
          TR.pyW = env; TR.pyTo = hT - by + 2.8; TR.pitch = -.55 * env; TR.roll = .2 * env; TR.yaw = yawD + .4 * env;
          for (const i of [0, 1]) { TR.lift[i] = env * (hT - by + 1.3); TR.off[i].copy(dir).multiplyScalar((7.5 + i * 1.6) * env); }
          TR.hL = s.pos.clone().addScaledVector(left, 4.4).addScaledVector(dir, -2.6).setY(hT + .4); TR.hw = env; };
        T.land = () => { s.landV -= 7; dust(P2, yb); s.gait = T.gait0; }; return; }
      if (st.how === "leap") { // a gap, from one edge to the next
        const e = Math.max(0, first((h) => h < ya - 9) - 1), P0 = at(Math.max(0, e - 1.2)), Tair = .46 + P0.distanceTo(B) / 420; T.p0 = P0; T.sp = Math.max(wsp, 52); T.dur = Tair; T.end = B; if (s.stance === "stand") s.gait = "run";
        T.fn = (m, TR) => { const a = Math.sin(Math.PI * m); s.pos.copy(P0).lerp(B, m); s.baseY = lerp(ya, yb, m) + 10 * a; TR.yaw = yawD; TR.pitch = .25 * a;
          TR.lift[0] = 4 * a; TR.off[0].copy(dir).multiplyScalar(8 * a); TR.lift[1] = 3.5 * a; TR.off[1].copy(dir).multiplyScalar(-7 * a); };
        T.land = () => { s.landV -= 14; dust(B, yb); s.gait = T.gait0; }; return; }
      // off an edge: a hop down, a jump from a height (landing in a roll when there is room), or the ground gone from under
      { const jump = st.how === "jump", drop = Math.max(0, ya - yb), e = st.how === "fall" ? 0 : Math.max(0, first((h) => h < ya - 9) - 1);
        const P0 = at(Math.max(0, Math.min(dist, e - 1.2))), L = st.how === "fall" ? B : jump ? at(Math.min(dist, e + 4.8)) : dist - e <= 14 ? B : at(e + 7);
        const vy0 = jump ? 30 : drop > 4 ? 16 : 0, Tair = (vy0 + Math.sqrt(vy0 * vy0 + 2 * G_FALL * drop)) / G_FALL + .02;
        let R = L; if (jump && !st.dies) { const want = clamp(dist - (e + 4.8), 6, 14), q = at(Math.min(dist, e + 4.8) + want), f = floorNear(q, yb); if (f != null && Math.abs(f - yb) < 3 && dist - (e + 4.8) >= 5) R = dist - (e + 4.8) <= 14 ? B : q; }
        const roll = R !== L, Troll = .62; T.p0 = P0; T.dur = Tair + (roll ? Troll : .08); T.end = R; T.sp = jump ? Math.max(wsp, 36) : wsp;
        const KEY = [6.2, 5.6, 10.6, 3.6, 6.2];
        T.fn = (m, TR) => { const t = m * T.dur; TR.yaw = yawD;
          if (t < Tair) { const a = t / Tair; s.pos.copy(P0).lerp(L, a); s.baseY = Math.max(yb, ya + vy0 * t - .5 * G_FALL * t * t); const k = Math.sin(Math.PI * Math.min(1, a * 1.25)); TR.lift[0] = 3.4 * k; TR.lift[1] = 2.6 * k; TR.pitch = .14 * k; TR.py = -1.2 * k; return; }
          if (!T.hit) { T.hit = true; s.baseY = yb; s.landV -= Math.min(30, 7 + drop * (roll ? .12 : .32)); dust(L, yb); if (drop > 30) { dust(L.clone().addScaledVector(left, 4), yb); dust(L.clone().addScaledVector(left, -4), yb); } s.onLand && s.onLand(s, st); if (s.dead >= 0) return; }
          s.baseY = yb;
          if (roll) { const r = clamp((t - Tair) / Troll, 0, 1), ph = r * 4, i = Math.min(3, Math.floor(ph)), w = Math.sin(Math.PI * r) ** .5; s.pos.copy(L).lerp(R, ease(r));
            TR.pitch = Math.PI * 2 * r; TR.pyW = Math.min(1, w * 1.6); TR.pyTo = lerp(KEY[i], KEY[i + 1], ease(ph - i)); TR.tuck = Math.min(1, w * 1.5); TR.curl = w; TR.stow = Math.min(1, w * 2); TR.hc = true; TR.hw = Math.min(1, w * 2); }
          else { s.pos.copy(L); TR.py = -2.5 * (1 - clamp((t - Tair) / .08, 0, 1)); } };
        return; }
    }
    // one frame of a traverse: moves the figure and returns what to lay over its pose
    function travStep(s, dt) { const T = s.trav, TR = { py: 0, pyW: 0, pyTo: 0, pitch: 0, roll: 0, yaw: null, lift: [0, 0], off: [V(), V()], hL: null, hR: null, hw: 0, hc: false, stow: 0, tuck: 0, curl: 0 };
      const walkTo = (P, sp) => { const d = V(P.x - s.pos.x, 0, P.z - s.pos.z), dist = d.length(); if (dist < .8) return true; const v = Math.min(sp, Math.sqrt(2 * 150 * dist) + 4, s.vel.length() + 170 * dt); s.vel.copy(d).multiplyScalar(v / dist); s.pos.addScaledVector(s.vel, Math.min(dt, dist / v)); return false; };
      if (T.ph === "appr") { if (walkTo(T.p0, T.sp)) { T.ph = "main"; T.t = 0; if (!T.keepVel) s.vel.set(0, 0, 0); } else return TR; }
      if (T.ph === "main") { T.t += dt; const m = clamp(T.t / T.dur, 0, 1); T.fn(m, TR); if (s.dead >= 0) return TR; if (m < 1) return TR; if (!T.keepVel) s.vel.set(0, 0, 0); T.land && T.land(); T.ph = "settle"; s.baseY = T.yb; return TR; }
      if (!walkTo(T.b, T.sp)) return TR;
      s.trav = null; s.baseY = T.yb; (s.okPos || (s.okPos = V())).copy(s.pos); if (!T.keepVel) s.vel.multiplyScalar(.4); s.onTrav && s.onTrav(s, T.st); planNext(s); return TR; }

    /* ---------- ragdoll: a dead body is thirteen points joined by its bones, falling under gravity, hitting the ground
       and the cover; the skeleton is laid over the points each frame. What killed it sets how it starts moving. ---------- */
    const RG = { g: 175, h: 1 / 120 };
    function ragStart(s) {
      s.root.scale.setScalar(1); s.root.updateMatrixWorld(true);
      const wp = (j) => j.getWorldPosition(V()), o = s.deadOpt || {}, F = o.force || 1, zone = o.zone || "chest", dir = s.deadDir.clone();
      const at = { hL: wp(s.LL.th), hR: wp(s.LR.th), sL: wp(s.AL.up), sR: wp(s.AR.up), hd: wp(s.head).add(V(0, 1.8, 0).applyQuaternion(s.head.getWorldQuaternion(new THREE.Quaternion()))),
        kL: wp(s.LL.sh), kR: wp(s.LR.sh), aL: wp(s.LL.ft), aR: wp(s.LR.ft), eL: wp(s.AL.fo), eR: wp(s.AR.fo), wL: wp(s.AL.hd), wR: wp(s.AR.hd) };
      const rad = { hd: 1.9, hL: 1.9, hR: 1.9, sL: 1.7, sR: 1.7, kL: 1.1, kR: 1.1, aL: .9, aR: .9, eL: .9, eR: .9, wL: .8, wR: .8 };
      s.root.position.y = 0; s.baseY = 0; // from here the body is where its points are
      const pts = {}; const up = V(0, 1, 0);
      for (const k in at) {
        const v = s.vel.clone(); const upper = "sL sR hd eL eR wL wR".includes(k), legs = "kL kR aL aR".includes(k);
        if (zone === "blast") v.addScaledVector(dir, (50 + Math.random() * 25) * F).addScaledVector(up, (38 + Math.random() * 30) * F);
        else if (zone === "head") v.addScaledVector(dir, (k === "hd" ? 75 : upper ? 24 : 4) * F);
        else if (zone === "legs") v.addScaledVector(dir, (legs ? 48 : upper ? -10 : 8) * F);
        else v.addScaledVector(dir, (upper ? 40 : legs ? 2 : 16) * F).addScaledVector(up, upper ? 5 * F : 0);
        if (k[0] === "k") v.addScaledVector(fwdOf(s.yaw), 14); // the knees give forward
        v.add(V((Math.random() - .5) * 8, (Math.random() - .5) * 4, (Math.random() - .5) * 8));
        pts[k] = { p: at[k].clone(), q: at[k].clone().addScaledVector(v, -RG.h), r: rad[k] };
      }
      const cons = [], D = (a, b) => at[a].distanceTo(at[b]), eq = (a, b, len) => cons.push([pts[a], pts[b], len ?? D(a, b), 0]), mn = (a, b, len) => cons.push([pts[a], pts[b], len, 1]);
      eq("hL", "hR"); eq("sL", "sR"); eq("hL", "sL"); eq("hR", "sR"); eq("hL", "sR"); eq("hR", "sL"); eq("hd", "sL"); eq("hd", "sR"); mn("hd", "hL", 9); mn("hd", "hR", 9);
      eq("hL", "kL", L.thigh); eq("kL", "aL", L.shin); eq("hR", "kR", L.thigh); eq("kR", "aR", L.shin); eq("sL", "eL", L.upper); eq("eL", "wL", L.fore); eq("sR", "eR", L.upper); eq("eR", "wR", L.fore);
      mn("hL", "aL", 5); mn("hR", "aR", 5); mn("sL", "wL", 3.5); mn("sR", "wR", 3.5); mn("kL", "kR", 2.4); mn("aL", "aR", 2.2); mn("kL", "sL", 5); mn("kR", "sR", 5); mn("aL", "hR", 4); mn("aR", "hL", 4); mn("wL", "hd", 2.5); mn("wR", "hd", 2.5);
      s.rag = { pts, cons, acc: 0, still: 0, sleep: false };
    }
    function ragStep(s, dt) {
      const R = s.rag; if (R.sleep) return; R.acc = Math.min(R.acc + dt, .05); const h = RG.h, list = Object.values(R.pts); let moved = 0;
      while (R.acc >= h) { R.acc -= h;
        for (const P of list) { const vx = (P.p.x - P.q.x) * .995, vy = (P.p.y - P.q.y) * .995, vz = (P.p.z - P.q.z) * .995; P.q.copy(P.p); P.p.x += vx; P.p.y += vy - RG.g * h * h; P.p.z += vz; moved += Math.abs(vx) + Math.abs(vy) + Math.abs(vz); }
        for (let it = 0; it < 6; it++) {
          for (const [A, B, len, kind] of R.cons) { const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y, dz = B.p.z - A.p.z, dist = Math.hypot(dx, dy, dz) || 1e-6; if (kind === 1 && dist >= len) continue; const k = (dist - len) / dist * .5; A.p.x += dx * k; A.p.y += dy * k; A.p.z += dz * k; B.p.x -= dx * k; B.p.y -= dy * k; B.p.z -= dz * k; }
          for (const P of list) {
            const gy = GH(P.p.x, P.p.z); if (P.p.y < gy + P.r) { P.p.y = gy + P.r; const vy = P.p.y - P.q.y; if (vy < 0) P.q.y = P.p.y + vy * .22; P.q.x += (P.p.x - P.q.x) * .12; P.q.z += (P.p.z - P.q.z) * .12; } // the ground: a small bounce, and friction
            for (const c of NS(P.p.x, P.p.z)) { const rx = P.p.x - c.p.x, rz = P.p.z - c.p.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), lx = rx * cs - rz * sn, lz = rx * sn + rz * cs, ex = c.w + P.r, ez = c.d + P.r;
              const ch = c.soft ? 0 : c.hf ? (surfOf(c, lx, lz) || { top: c.by }).top - c.by : c.h; if (ch <= 0) continue;
              if (Math.abs(lx) < ex && Math.abs(lz) < ez && P.p.y < ch + c.by + P.r) { const px = ex - Math.abs(lx), pz = ez - Math.abs(lz), py = ch + c.by + P.r - P.p.y; let nx = 0, nz = 0;
                if ((py < px && py < pz) || (c.hf && py < 9)) { P.p.y += py; P.q.x += (P.p.x - P.q.x) * .1; P.q.z += (P.p.z - P.q.z) * .1; continue; }
                if (px < pz) nx = Math.sign(lx) * px; else nz = Math.sign(lz) * pz;
                P.p.x += nx * cs + nz * sn; P.p.z += -nx * sn + nz * cs; P.q.y += (P.p.y - P.q.y) * .08; } }
          }
        }
      }
      R.still = moved < .02 ? R.still + dt : 0; if (R.still > 1.2) R.sleep = true;
    }
    function ragPose(s) {
      const P = s.rag.pts, mid = (a, b) => a.p.clone().add(b.p).multiplyScalar(.5), hip = mid(P.hL, P.hR), sh = mid(P.sL, P.sR);
      const basis = (left, up) => { const y = up.clone().normalize(), z = left.clone().cross(y).normalize(), x = y.clone().cross(z).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
      const up = sh.clone().sub(hip), qP = basis(P.hL.p.clone().sub(P.hR.p), up), fwd = V(0, 0, 1).applyQuaternion(qP);
      s.pelvis.position.copy(hip).addScaledVector(up.clone().normalize(), .4).sub(s.pos); s.pelvis.quaternion.copy(qP); s.spine.rotation.set(0, 0, 0); s.root.updateMatrixWorld(true);
      const qC = basis(P.sL.p.clone().sub(P.sR.p), up); setWorldQ(s.chest, qC); s.neck.rotation.set(0, 0, 0);
      const fC = V(0, 0, 1).applyQuaternion(qC); setWorldQ(s.head, basis(P.sL.p.clone().sub(P.sR.p), P.hd.p.clone().sub(sh).addScaledVector(up.clone().normalize(), 2)));
      for (const [g, k, a2] of [[s.LL, P.kL, P.aL], [s.LR, P.kR, P.aR]]) { const A = g.th.getWorldPosition(V()); aimBone(g.th, A, k.p, fwd); aimBone(g.sh, g.sh.getWorldPosition(V()), a2.p, fwd); g.ft.rotation.set(.5, 0, 0); }
      for (const [g, e, w2] of [[s.AL, P.eL, P.wL], [s.AR, P.eR, P.wR]]) { const A = g.up.getWorldPosition(V()), back = fC.clone().multiplyScalar(-1); aimBone(g.up, A, e.p, back); aimBone(g.fo, g.fo.getWorldPosition(V()), w2.p, back); g.hd.rotation.set(0, 0, 0); }
    }
    function tickDead(s, dt) {
      const first = !s.rag; if (first) { ragStart(s); for (const k in s.W) if (k !== s.weapon) s.chest.attach(s.W[k].obj); for (const k in s.W) s.W[k].magHand.visible = false; s.nade.visible = false;
        s.rifleFall = { v: s.vel.clone().addScaledVector(s.deadDir, 12).add(V((Math.random() - .5) * 14, 16, (Math.random() - .5) * 14)), w: V(Math.random() * 6, Math.random() * 3, Math.random() * 6) }; }
      s.root.scale.setScalar(1); s.root.position.y = 0; ragStep(s, dt); ragPose(s);
      const rf = s.rifleFall, ob = s.W[s.weapon].obj; rf.v.y -= 180 * dt; const wpos = ob.getWorldPosition(V()).addScaledVector(rf.v, dt);
      const gy = surfAt(wpos).top + .8; if (wpos.y < gy) { wpos.y = gy; rf.v.multiplyScalar(.3); rf.v.y = Math.abs(rf.v.y) * .3; rf.w.multiplyScalar(.5); }
      ob.position.copy(wpos).sub(s.pos); if (wpos.y > gy + .01) { ob.rotation.x += rf.w.x * dt; ob.rotation.z += rf.w.z * dt; } else { ob.rotation.x = damp(ob.rotation.x, 0, 4, dt); ob.rotation.z = damp(ob.rotation.z, Math.PI / 2, 4, dt); }
      // scaled for its build about the surface it lies on, not about the ground far below
      { let lowY = 1e9; for (const k in s.rag.pts) { const P = s.rag.pts[k]; lowY = Math.min(lowY, P.p.y - P.r); } s.root.scale.setScalar(s.build.h); s.root.position.y = Math.max(0, lowY) * (1 - s.build.h); }
    }

    /* ---------- every frame ---------- */
    let stepRate = 0; // 0 = smooth; otherwise poses are held and updated this many times a second (the hand-drawn feel)
    function update(dt) { for (const s of ALL.slice()) { if (!stepRate) { tick(s, dt); continue; } s.stepAcc += dt; const st = 1 / stepRate; if (s.stepAcc >= st) { tick(s, s.stepAcc); s.stepAcc = 0; } } tickMisc(dt); }

    const MISC = [];
    function tickMisc(dt) { for (let i = MISC.length - 1; i >= 0; i--) { const m = MISC[i]; m.t += dt; if (m.fuse != null && m.t > m.fuse) { m.fuse = null; m.end && m.end(m.o.position.clone()); } m.v.y -= 180 * dt; m.o.position.addScaledVector(m.v, dt); m.o.rotation.x += m.w.x * dt; m.o.rotation.z += m.w.z * dt; if (m.o.position.y < m.r) { m.o.position.y = m.r; m.v.multiplyScalar(.35); m.v.y = Math.abs(m.v.y) * .5; m.w.multiplyScalar(.4); } if (m.t > m.life) { scene.remove(m.o); MISC.splice(i, 1); } } }
    function drop(geo, from, q, v, life = 12, r = .6) { const o = new THREE.Mesh(geo, material); o.castShadow = true; o.position.copy(from); o.quaternion.copy(q); scene.add(o); const m = { o, v, w: V((Math.random() - .5) * 8, 0, (Math.random() - .5) * 8), t: 0, life, r }; MISC.push(m); return m; }

    function tick(s, dt) {
      dt = Math.min(dt, .1); if (!(dt > 0)) return; s.t += dt;
      const H = s.build.h; s.root.scale.setScalar(1); // solved at full size; the figure is scaled for its build at the end
      const dead = s.dead >= 0; if (dead) { s.dead += dt; tickDead(s, dt); return; }
      /* --- the gait in use: its numbers ease from one gait to the next --- */
      // going prone: eased down through a kneel with a hand to the ground; or, at a run, a dive: the body pitches forward
      // and falls under its own weight, lands, and slides to a stop
      let diveU = -1;
      if (s.dive) { s.dive.t += dt; diveU = clamp(s.dive.t / .46, 0, 1); s.proneW = diveU;
        if (diveU >= 1 && !s.dive.hit) { s.dive.hit = true; s.landV -= 16; s.vel.multiplyScalar(.8); if (fx.dust) for (let i = 0; i < 5; i++) fx.dust(s.pos.clone().addScaledVector(fwdOf(s.yaw), 2 + i * 2.5).add(V((Math.random() - .5) * 5, 0, (Math.random() - .5) * 5))); }
        if (s.dive.hit && s.vel.length() > 6 && fx.dust && Math.random() < .5) fx.dust(s.pos.clone().addScaledVector(fwdOf(s.yaw), 6));
        if (s.dive.t > 1.6) s.dive = null; }
      else s.proneW = clamp(s.proneW + (s.stance === "prone" ? dt / .55 : -dt / .75), 0, 1);
      const pr = diveU >= 0 ? diveU ** 2.6 : ease(s.proneW), prP = diveU >= 0 ? ease(clamp(diveU * 1.7, 0, 1)) : pr; // how far down, how far tipped over
      const rising = s.stance !== "prone" && s.proneW > .12;
      const gname = s.stance === "prone" ? "crawl" : s.stance === "crouch" || s.cover ? "crouch" : s.gait;
      const GT = GAITS[gname] || GAITS.walk; if (!s.G) s.G = { ...GT };
      const G = s.G; for (const k in GT) G[k] = damp(G[k], GT[k], 8, dt);
      const tactical = gname === "tacwalk" || gname === "tacrun" || gname === "crouch", canAim = gname !== "run";
      /* --- moving: accelerate toward the goal; slow on arrival unless passing through a waypoint --- */
      let want = V(), TR = null;
      if (s.trav) TR = travStep(s, dt); if (s.dead >= 0) return;
      const BY = s.baseY || 0, upOn = BY >= STAND_MIN;
      if (s.dive && !s.dive.hit) want = s.vel.clone();
      const acc = s.dive ? 95 : Math.max(GT.speed * 3, 90); let appr = 0;
      if (!s.goal) s.way.length = 0;
      if (!TR) {
      if (s.goal && !dead) { const mid = s.way.length > 0, tg = mid ? s.way[0] : s.goal, d = tg.clone().sub(s.pos).setY(0), dist = d.length(), thr = mid || s.through;
        if (dist < (mid ? (s.plan ? 2.2 : 3.5) : s.through ? 7 : .6) || (mid && s.plan && dist < 10 && d.dot(s.vel) < 0)) { if (mid) { s.way.shift(); want = s.vel.clone(); } else { s.goal = null; if (s.plan) planNext(s); else if (!s.through) arrive(s); } }
        // slow at the rate the legs can actually brake, so the stop lands on the spot and never runs past it
        else if (mid && s.plan) { const nx = s.way.length > 1 ? s.way[1] : s.goal, n2 = nx.clone().sub(tg).setY(0), dn = d.clone().normalize(), cs = n2.lengthSq() > .01 ? dn.dot(n2.normalize()) : 1, vT = GT.speed * clamp((cs + .15) / 1.15, .22, 1); want = dn.multiplyScalar(Math.min(GT.speed, Math.sqrt(vT * vT + 1.2 * acc * dist))); }
        else want = d.normalize().multiplyScalar(thr ? GT.speed : Math.min(GT.speed, Math.sqrt(1.5 * acc * dist) + .6));
        if (s.pendCover && !mid) appr = clamp(1 - dist / 26, 0, 1); }
      if (!s.goal && s.through && !dead) want = s.vel.clone(); // keep rolling for the frame until the next waypoint is given
      s.apprW = damp(s.apprW, appr, 9, dt); // coming in to cover: already ducking and turning to it
      const dv = want.clone().sub(s.vel); const dl = dv.length(); if (dl > acc * dt && dl > 1e-6) dv.multiplyScalar(acc * dt / dl); s.vel.add(dv);
      if (dead) s.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
      if (!s.trav) s.pos.addScaledVector(s.vel, dt);
      }
      const moved = s.vel.length() * dt;
      // nothing solid is walked through: slide along it; and two people do not stand in the same place
      if (collide && !s.trav && !TR) { const r = 2.6 * H;
        // a figure keeps to a level: the ground, a floor, a roof. Walls, edges and drops stop it (a climb or a drop is a move of its own)
        { const fl = standAt(s.pos, BY);
          if (fl != null) { s.baseY = Math.abs(fl - BY) < .05 ? fl : damp(BY, fl, 20, dt); (s.okPos || (s.okPos = V())).copy(s.pos); s.railT = 0; }
          else if (s.okPos && !s.crossing) { s.pos.copy(s.okPos); s.vel.multiplyScalar(.2); s.railT = (s.railT || 0) + dt; if (s.railT > .6 && s.plan && s.goal) { const tg = s.way.length ? s.way[0] : s.goal; s.pos.set(tg.x, 0, tg.z); s.okPos.copy(s.pos); s.railT = 0; } // a walker wedged on a corner is put on to its next turn
            if (s.railT > .3 && !s.plan) { s.goal = null; s.way.length = 0; s.pendCover = null; s.sidle = null; }
            if (standAt(s.pos, BY) == null) { const lower = levelsAt(s.pos).filter((v) => v < BY - STEP_H).pop(); if (lower != null) startTrav(s, { how: "fall", x: s.pos.x, z: s.pos.z, y: lower }, s.gait); } } // what it stood on is gone
          else if (!s.okPos) s.okPos = s.pos.clone(); }
        for (const c of NS(s.pos.x, s.pos.z)) { if (c.vox || c.soft || c.h <= 6.5 || BY >= c.h - 1) continue; if (s.crossing && c.h <= CLIMB_H) continue; const [lx, lz] = inBox(c, s.pos), ex = c.w + r - Math.abs(lx), ez = c.d + r - Math.abs(lz); if (ex <= 0 || ez <= 0) continue;
          const n = ex < ez ? leftOf(c.yaw).multiplyScalar(lx >= 0 ? 1 : -1) : fwdOf(c.yaw).multiplyScalar(lz >= 0 ? 1 : -1); s.pos.addScaledVector(n, Math.min(ex, ez)); const vn = s.vel.dot(n); if (vn < 0) s.vel.addScaledVector(n, -vn); }
        for (const o of ALL) { if (o === s || o.dead >= 0 || Math.abs((o.baseY || 0) - (s.baseY || 0)) > 18) continue; const dx = s.pos.x - o.pos.x, dz = s.pos.z - o.pos.z, dd = Math.hypot(dx, dz), min = 2.3 * (H + o.build.h); if (dd < min && dd > 1e-4) { const k = (min - dd) * .5 / dd; s.pos.x += dx * k; s.pos.z += dz * k; } } }
      s.root.position.copy(s.pos);
      // on a move that goes over something: up and over it (a vault over a low thing, a climb over a higher one), knees taking the landing
      { let vh = 0; if (s.crossing && !TR) for (const c of NS(s.pos.x, s.pos.z)) if (c.h <= CLIMB_H && boxDist(c, s.pos) < 3.6 * H) vh = Math.max(vh, c.h);
        const on = vh > 0; if (on) s.vaultH = vh; else if (s.vaultOn && s.vaultH > 12) { s.landV -= 5 + s.vaultH * .3; fx.dust && fx.dust(Wp(s.pos.clone())); }
        s.vaultOn = on; s.vaultW = damp(s.vaultW || 0, on ? 1 : 0, on ? 10 : 13, dt); if (on && vh > 16) s.vel.multiplyScalar(Math.max(.4, 1 - dt * 2.2)); }
      const speed = s.vel.length();
      /* --- facing: toward travel, or toward the target while aiming --- */
      s.tacW = damp(s.tacW || 0, tactical && !dead ? 1 : 0, 5, dt);
      // peeking out of cover: snap up (or out) on a spring, fire the burst, drop back fast
      let peekOver = 0, peekSide = 0, peekE0 = 0, peekFull = 0;
      if (s.peek) { const P = s.peek, tg = P.ph === "down" ? 0 : 1;
        s.peekV += ((tg - s.peekP) * (tg ? 300 : 420) - s.peekV * (tg ? 24 : 34)) * dt; s.peekP += s.peekV * dt;
        if (P.ph === "up") { if (s.peekP > .9 && s.aimW > .82) { P.ph = "fire"; s.burst = P.n; P.hold = .1; } }
        else if (P.ph === "fire") { if (s.burst <= 0 && s.reload < 0) { P.hold -= dt; if (P.hold <= 0) P.ph = "down"; } }
        else if (s.peekP < .04) { s.aim = P.prev; s.peek = null; s.peekP = s.peekV = 0; }
        const e = clamp(s.peekP, -.08, 1.12); peekE0 = e; if (P.style === "over") { peekOver = e; if (P.full) peekFull = clamp(e, 0, 1); } else peekSide = e * (P.style === "left" ? 1 : -1) * (P.shift || 4.6) / 4.6;
      }
      // after shuffling along to the end of the cover, lean out as asked
      if (s.sidle && s.cover && !s.goal && !s.peek) { const q = s.sidle; s.sidle = null; s.peekFire(q.at, q.n, q.style); }
      // the weapon stays tucked in until the body is most of the way out or up, so it never sweeps through the cover
      s.coverW = s.peek ? (1 - ease(clamp((peekE0 - .45) / .5, 0, 1))) * (s.cover ? 1 : 0) : damp(s.coverW, s.cover ? 1 : 0, 12, dt);
      const CS = s.cover && s.cs ? s.cs : CSTY.kneel, cLean = s.coverW * CS.lean, cfC = fwdOf(s.coverYaw), clC = leftOf(s.coverYaw);
      // one-off actions shape the torso here; their hands come later
      let actTwist = 0, actLean = 0, lowOne = 0, headAt = null, melee = 0; const ACT = dead ? null : s.act;
      if (ACT) { ACT.t += dt; const u = ACT.t / ACT.dur, env = ease(clamp(u / .15, 0, 1)) * ease(clamp((1 - u) / .15, 0, 1)); ACT.u = u; ACT.env = env;
        if (u >= 1) { s.act = null; s.nade.visible = false; }
        else if (ACT.name === "signal") { lowOne = env; headAt = ACT.at; }
        else if (ACT.name === "throw") { lowOne = env; headAt = ACT.at; actTwist = u < .45 ? -.55 * ease(u / .45) : u < .6 ? -.55 + 1.0 * ease((u - .45) / .15) : .45 * (1 - ease((u - .6) / .4)); actLean = u > .4 && u < .85 ? .22 * Math.sin((u - .4) / .45 * Math.PI) - .1 * (u < .45 ? 1 : 0) : -.1 * ease(u / .4); }
        else if (ACT.name === "melee") { if (u > .38 && !ACT.lunged) { ACT.lunged = true; if (s.stance !== "prone" && !s.cover) s.vel.addScaledVector(fwdOf(s.yaw), s.handsOnly ? 24 : 12); } // a step into the blow
          melee = u < .4 ? -ease(u / .4) * .6 : u < .58 ? -.6 + 1.6 * ease((u - .4) / .18) : 1 - ease((u - .58) / .42); actTwist = melee * .45; actLean = Math.max(0, melee) * .22; }
        else if (ACT.name === "interact") { lowOne = env; }
      }
      const aimT = dead || TR ? 0 : s.cover ? (s.peek && s.peek.ph !== "down" ? 1 : 0) : s.reload >= 0 ? .55 : s.swap >= 0 ? .3 : (s.aim && canAim) || s.stance === "prone" ? 1 : tactical ? .92 : s.handsOnly ? (s.W.primary.R.none ? .62 : .86) : 0;
      s.aimW = damp(s.aimW, aimT, s.peek ? 18 : 12.5, dt);
      // springs: landing and buckling knees, the twist of a hit
      s.landV += (-s.landP * 240 - s.landV * 17) * dt; s.landP += s.landV * dt; s.hitTwV += (-s.hitTw * 70 - s.hitTwV * 8) * dt; s.hitTw += s.hitTwV * dt;
      lowOne = Math.max(lowOne, clamp(Math.abs(s.hitP) * .7, 0, .9));
      s.crouchW = damp(s.crouchW, (s.crouch || (s.cover && !CS.stand) || (ACT && ACT.name === "interact" && ACT.u > .05 && ACT.u < .8) || rising) && canAim && !TR ? 1 : 0, s.cover ? 14 : 10, dt);
      s.runW = damp(s.runW, s.gait === "run" && speed > 25 ? 1 : 0, 5, dt);
      const aimYaw = s.aim && canAim ? Math.atan2(s.aim.x - s.pos.x, s.aim.z - s.pos.z) : null;
      const yaw0 = s.yaw;
      if (!dead) {
        let target = s.yaw; if (s.holdYaw != null && (!s.cover || speed > 3)) s.holdYaw = null; // holdYaw: the way they last attacked, kept while they stay in that cover
        if (TR && TR.yaw != null) target = TR.yaw;
        else if (aimYaw != null && (!s.cover || s.peek)) target = aimYaw - .5 * s.aimW * (1 - pr); // bladed: support side forward
        else if (s.cover) target = s.holdYaw != null ? s.holdYaw : s.coverYaw + (speed > 3 ? 0 : CS.yaw);
        else if (speed > 4) { target = Math.atan2(s.vel.x, s.vel.z); if (s.pendCover && s.apprW > .5) target += angD(target, s.pendCover.yaw) * (s.apprW - .5) * 1.6; }
        else if (s.face != null) target = s.face;
        const tr = TR && TR.yaw != null ? 15 : s.peek ? 10 : s.cover ? 7.5 : speed > 4 ? 6 : 5.5; s.yaw += clamp(angD(s.yaw, target), -dt * tr, dt * tr);
      }
      const yawRate = Math.abs(angD(yaw0, s.yaw)) / dt;
      const fw = fwdOf(s.yaw), lf = leftOf(s.yaw);

      /* --- the gait cycle. One phase (0..1) is a full stride: left heel strike at 0, right at .5. It advances with
         the distance covered, so a foot on the ground stays exactly where it was put (stance moves back under the
         body at the body's own speed) and a foot in the air follows one smooth curve from toe-off to heel strike. --- */
      const sp = speed / Math.max(1, G.speed), w = dead ? 0 : ease(clamp(speed / (G.speed * .3), 0, 1));
      const mdir = speed > .5 ? s.vel.clone().setY(0).normalize() : fw.clone();
      const along = mdir.dot(fw);
      const stride = G.stride * clamp(.45 + .55 * sp, .45, 1.15) * (.65 + .35 * Math.max(0, along));
      const turnW = clamp(yawRate / 1.5, 0, 1) * (1 - w);
      if (!dead) s.phase = (s.phase + moved / (stride * H) + yawRate * dt * .3 * (1 - w) * (1 - pr)) % 1;
      const kneel = s.crouchW * (1 - w) * (1 - pr) * (1 - peekFull);
      const hBob = s.handsOnly ? Math.sin(s.t * 3.1) * s.aimW * (1 - w) * (1 - pr) * (1 - s.coverW) : 0; // on guard with a blade or bare hands: never quite still
      const d = G.duty, a = d * stride / 2, wl = Math.max(w, turnW * .7), bladed = s.aimW * (1 - s.runW) * (1 - w * .75);
      const cyc = (ph) => {
        let x, lift = 0, pitch;
        if (ph < d) { // on the ground: heel strike, flat, heel-off
          const u = ph / d; x = a - 2 * a * u;
          pitch = u < .14 ? -G.strike * (1 - u / .14) : u > .58 ? G.toe * .75 * ((u - .58) / .42) ** 1.6 : 0;
        } else { // in the air: the foot trails, the heel kicks up, the knee folds through, the leg reaches, the toe lifts
          const u = (ph - d) / (1 - d), m = -stride * (1 - d), u2 = u * u, u3 = u2 * u;
          x = (2 * u3 - 3 * u2 + 1) * -a + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * a + (u3 - u2) * m;
          lift = G.lift * Math.sin(Math.PI * u) ** .9 + G.kick * Math.exp(-(((u - .32) / .2) ** 2)) * Math.sin(Math.PI * u);
          pitch = u < .15 ? G.toe * (.75 + .25 * u / .15) : u < .6 ? G.toe * (1 - ease((u - .15) / .45)) : -G.strike * ease((u - .6) / .4);
        }
        return { x, lift, pitch };
      };
      const armed = s.aimW * (1 - s.runW) * (1 - s.coverW);
      s.feet.forEach((f, i) => {
        const side = f.g.s, ph = (s.phase + i * .5) % 1;
        let { x, lift, pitch } = cyc(ph);
        pitch *= wl; lift = lift * wl + (pitch > 0 ? Math.sin(pitch) * 2.3 : Math.sin(-pitch) * .9); // the ankle rides up over the toes or the heel
        const width = G.width * w + (2.05 + s.crouchW * .3 + 1.45 * armed) * (1 - w); // feet apart with a weapon up
        // kneeling: the left foot forward and flat, the right knee down with the toes tucked under
        f.plant.copy(s.pos).addScaledVector(lf, side * width).addScaledVector(fw, side * 2.5 * bladed * (1 - kneel) + (side > 0 ? 5.6 : -5.4) * kneel).addScaledVector(mdir, x * w).setY(0);
        if (side < 0) { pitch += 1.15 * kneel; lift += 1.5 * kneel; }
        // prone: the legs laid out behind, toes back; crawling draws them up in turn
        // prone: the legs spread behind, the insides of the feet on the ground, toes out; crawling draws each knee up and out in turn
        if (prP > 0) { const pp = s.pos.clone().addScaledVector(fw, -16.6 + x * w * .7).addScaledVector(lf, side * (6.3 + Math.max(0, x) * w * .25)).setY(0); f.plant.lerp(pp, prP); const air = diveU >= 0 ? Math.sin(Math.PI * diveU) : 0; pitch += ((air * 2.2) - pitch) * prP; lift += (.3 - lift) * prP + 6 * air; }
        f.lift = lift + (s.vaultW || 0) * ((s.vaultH || 0) + 2.4); f.pitch = pitch; f.yaw = s.yaw + side * (.12 * (1 - w * .5) + 1.2 * prP); f.roll = side * 1.25 * prP; f.swing = null;
        if (TR) { f.lift += TR.lift[i] / H; f.plant.addScaledVector(TR.off[i], 1 / H); }
      });

      /* --- pelvis: rides over the legs. Walking it is lowest with both feet down and highest over the standing leg;
         running it is lowest mid-stance and highest in flight. It shifts over the standing leg and turns with the
         stepping one; the chest stays level and steady over it. --- */
      const reach = L.thigh + L.shin, TAU = Math.PI * 2;
      const runny = clamp((.56 - d) / .16, 0, 1), po = d / 2 * runny;
      let py = STAND - kneel * (7.2 - 4.4 * peekOver) - cLean * 2.0 - 4.2 * s.apprW * w - .55 * armed * (1 - w) * (1 - kneel) + s.landP * (1 - pr * .8) - G.crouch * (.25 + .75 * Math.max(w, s.tacW, s.crouchW)) * (1 - kneel) - G.bob * Math.cos(2 * TAU * (s.phase - po)) * w + Math.sin(s.t * 1.7) * .08 * (1 - w) + hBob * .3;
      const hipW = (side) => s.pos.clone().addScaledVector(lf, side * L.hipX);
      // a standing leg can only reach so far: the hips ease down for it (smoothly, so there is no jolt); a leg in the air just bends
      const smin = (p, q, k = 2.5) => -Math.log(Math.exp(-k * p) + Math.exp(-k * q)) / k;
      if (w < 1) { let q = py; s.feet.forEach((f) => { const h = hipW(f.g.s).sub(f.plant).setY(0).length(); const top = L.ankle + f.lift + Math.sqrt(Math.max(1, (reach * .998) ** 2 - h * h)); q = smin(q, top + .9); }); py += (q - py) * (1 - w); }
      py = Math.max(py, 5.4) * (1 - pr) + (2.75 + Math.min(0, s.landP) * .25) * pr + (diveU >= 0 ? 1.8 * Math.sin(Math.PI * Math.min(1, diveU * 1.6)) : 0);
      py += (s.vaultW || 0) * ((s.vaultH || 0) + 1.2);
      if (TR) py = py * (1 - TR.pyW) + TR.pyTo / H * TR.pyW + TR.py;
      const sway = G.sway * Math.cos(TAU * (s.phase - d / 2)) * w + Math.sin(s.t * .55) * .22 * (1 - w);
      const twist = -G.twist * Math.cos(TAU * s.phase) * w;
      // springs: recoil and hit reactions
      s.kickV += (-s.kick * 380 - s.kickV * 26) * dt; s.kick += s.kickV * dt;
      s.hitV += (-s.hitP * 120 - s.hitV * 11) * dt; s.hitP += s.hitV * dt;
      const lean = (G.lean * (tactical ? Math.max(w, s.tacW) : w) * (along < -.3 ? -.3 : 1) + s.crouchW * .12 * (1 - w) + .2 * s.apprW * w + .3 * (s.vaultW || 0)) * (1 - pr);
      let pPos = s.pos.clone().addScaledVector(lf, sway * (1 - s.crouchW) * (1 - pr)).addScaledVector(clC, peekSide * 4.6).addScaledVector(fw, -4 * prP).addScaledVector(cfC, (CS.name === "kneel" ? 1.2 : 0) * Math.max(peekOver, Math.abs(peekSide))).setY(py);
      let pYaw = s.yaw + twist * (1 - pr), pPitch = lean * .45 * (1 - prP) + 1.44 * prP, pRoll = -sway * .04 * (1 - pr) - peekSide * .2 + Math.sin(s.phase * Math.PI * 2) * .16 * pr * w;
      if (TR) { pPitch += TR.pitch; pRoll += TR.roll; }
      if (dead) {
        const k = clamp(s.dead / .75, 0, 1), g = k * k;
        const back = s.deadDir.dot(fw) < 0; // falling backward or forward
        pPos.addScaledVector(s.deadDir, 7 * ease(k)).setY(py + (2.6 - py) * g);
        pPitch = (back ? -1 : 1) * 1.45 * g + lean * .5 * (1 - g); pRoll = Math.sin(s.dead * 3) * .1 * (1 - k);
      }
      s.pelvis.position.copy(pPos).sub(s.pos);
      s.pelvis.quaternion.setFromEuler(new THREE.Euler(pPitch, pYaw, pRoll, "YXZ"));
      /* --- torso: twist toward the aim, breathe, flinch --- */
      const chestYawW = aimYaw != null && !dead ? aimYaw - .38 * s.aimW * (1 - pr) : s.yaw - .38 * s.aimW * s.tacW;
      s.chestYaw = s.chestYaw + angD(s.chestYaw, chestYawW) * (1 - Math.exp(-14 * dt));
      const tw = clamp(angD(pYaw, s.chestYaw), -1.2, 1.2) * (dead ? 0 : 1);
      const aimPitch = s.aim ? Math.atan2(s.aim.y - BY - (py + 9), Math.hypot(s.aim.x - s.pos.x, s.aim.z - s.pos.z)) : 0;
      const breathe = Math.sin(s.t * 1.6) * .025;
      const flinch = s.hitP * .24 * Math.sign(s.hitDir.dot(fw) || -1), kickBack = s.kick * .05, peekE = Math.max(peekOver, Math.abs(peekSide));
      const hitSide = s.hitDir.dot(lf);
      s.spine.rotation.set(lean * .4 + flinch * .5 + cLean * .42 - .1 * prP + actLean * .5 + .1 * peekE - s.landP * .03, tw * .4 + s.hitTw * .05, -hitSide * s.hitP * .09, "YXZ");
      s.chest.rotation.set(-aimPitch * .35 * s.aimW * (1 - pr) + breathe + flinch + kickBack + (dead ? .2 : 0) + cLean * .34 - .22 * prP + actLean * .5 + .08 * peekE, tw * .6 + actTwist + s.hitTw * .09, sway * .03 * w - peekSide * .1 - hitSide * s.hitP * .06, "YXZ");
      if (TR && TR.curl) { s.spine.rotation.x += .55 * TR.curl; s.chest.rotation.x += .5 * TR.curl; }
      s.root.updateMatrixWorld(true);

      /* --- legs: two-bone IK to the planted feet, knees forward --- */
      for (const f of s.feet) {
        const g = f.g, A = g.th.getWorldPosition(V()), T = f.plant.clone().setY(L.ankle + f.lift); if (TR && TR.tuck) T.lerp(s.pelvis.localToWorld(V(g.s * 1.9, -5.6, 6.4)), TR.tuck);
        // lying down the knees point out to the sides and at the ground, never up
        const kneeDir = fwdOf(f.yaw).add(fwdOf(s.yaw)).normalize().add(V(0, .05, 0)).lerp(lf.clone().multiplyScalar(g.s).add(V(0, -.45, 0)).addScaledVector(fw, .35), prP).normalize();
        const { K, E } = twoBone(A, T, L.thigh, L.shin, kneeDir);
        aimBone(g.th, A, K, kneeDir); aimBone(g.sh, K, E, kneeDir);
        _q.setFromEuler(new THREE.Euler(f.pitch, f.yaw, f.roll || 0, "YXZ")); setWorldQ(g.ft, _q);
      }

      /* --- weapons: the one in the hands is shouldered at the aim, carried low, across the chest at a run, tucked in
         behind cover; the other hangs on its sling or sits in its holster. Swapping moves each between the two. --- */
      const look = (dir) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), dir.clone().negate(), UP));
      const cfw = fwdOf(s.chestYaw), clf = leftOf(s.chestYaw), down = V(0, -1, 0);
      const pocket = s.chest.localToWorld(V(-1.85, 3.95, 1.25));
      lowOne = Math.max(lowOne, pr * w * .55, (diveU >= 0 ? .8 : .75) * Math.sin(Math.PI * clamp(diveU >= 0 ? diveU : (s.proneW - .1) / .85, 0, 1)));
      // the free arm swings against the opposite leg
      const armSwing = (side) => cyc((s.phase + (side > 0 ? .5 : 0)) % 1).x / Math.max(.5, a) * w;
      // a blade or an axe: carried, raised on guard, drawn back and swung through; laid on the ground when prone
      const meleePose = (wp) => {
        const R = wp.R, cq = s.chest.getWorldQuaternion(new THREE.Quaternion()), C = (x, y, z) => s.chest.localToWorld(V(x, y, z)), D = (x, y, z) => look(V(x, y, z).normalize().applyQuaternion(cq));
        if (R.none) return { o: C(-3, 0, 2), q: D(0, 0, 1) };
        const two = R.melee === 2, gw = s.aimW * (1 - lowOne * .9) * (1 - s.runW), sw = armSwing(-1), kn = s.coverW * s.crouchW, br = Math.sin(s.t * 1.3) * .22, bb = hBob * .45; let o, q;
        if (two) { o = C(-3.0, -2.6 + br, 3.0); q = D(.62, .72 + br * .1, .3); o.lerp(C(-2.5, -1.1 + bb, 3.8), gw); q.slerp(D(.44 + hBob * .05, .86, .24), gw); // at the port: butt by the right hip, head up in front of the left shoulder, each hand on its own side o.lerp(C(-3.0, -2.2 + Math.sin(s.phase * TAU * 2) * .5, 3.2), s.runW);
          o.lerp(C(-1.9, -3.2, 2.5), s.coverW); q.slerp(D(.22, .96, .12), s.coverW); } // behind cover: upright and close in
        else { o = C(-3.9, -5.6 + br * .5, .6 + sw * 2.4); q = D(0, -.35, .94); o.lerp(C(-3.5, -.3 + bb, 3.7), gw); q.slerp(D(.2, .58, .79 + hBob * .06), gw); o.lerp(C(-3.7, -2.4, 2.4 + sw * 4), s.runW); q.slerp(D(0, .45, .9), s.runW);
          o.lerp(C(-3.7, -3.4, 1.6), s.coverW); q.slerp(D(.05, -.55, .83), s.coverW); // behind cover: down by the leg
          if (ACT && s.act && ACT.name === "throw") { o.lerp(C(2.9, -.6, 2.2), ACT.env); q.slerp(D(0, -.2, 1), ACT.env); } } // into the other hand while the right one throws
        // prone: the blade lies along the ground under the right hand; an axe lies across in front under both
        if (pr > 0) { const sR = s.AR.up.getWorldPosition(V()), sL = s.AL.up.getWorldPosition(V());
          if (two) { o.lerp(sR.clone().lerp(sL, .5).addScaledVector(fw, 4.6).addScaledVector(lf, -4.3).setY(1.0), pr); q.slerp(look(lf.clone().addScaledVector(fw, .12).normalize()), pr); }
          else { o.lerp(sR.clone().addScaledVector(fw, 3.6).addScaledVector(lf, -.9).setY(.7), pr); q.slerp(look(fw.clone().addScaledVector(lf, .12).normalize()), pr); } }
        if (melee) { const k = melee < 0 ? -melee / .6 : melee, [po, qd] = melee < 0 ? (two ? [C(-1.6, 3.2, 1.6), D(-.3, .75, -.6)] : [C(-3.4, 7.0, -.4), D(-.2, .75, -.65)]) : (two ? [C(0, 1.5, 2.2), D(.15, -.45, .88)] : [C(1.4, 2.0, 8.4), D(.72, -.3, .62)]); o.lerp(po, k); q.slerp(qd, k); }
        return { o, q };
      };
      const heldPose = (wp) => {
        if (wp.R.melee || wp.R.none) return meleePose(wp);
        const pis = !!wp.R.pistol, pk = pis ? s.chest.localToWorld(V(-.5, 3.85, 6.8)) : pocket;
        const aimDir = s.aim && canAim ? s.aim.clone().sub(pk).add(V(0, -BY, 0)).normalize() : fwdOf(s.chestYaw + (pis ? 0 : .38) * s.aimW).setY(-.16 * (1 - pr)).normalize();
        const qAim = look(aimDir);
        const qLow = look(fwdOf(s.chestYaw + (pis ? 0 : .35)).multiplyScalar(Math.cos(pis ? .9 : .6)).setY(-Math.sin(pis ? .9 : .6)));
        const oLow = pis ? s.chest.localToWorld(V(-.7, .9, 4.4)) : pocket.clone().addScaledVector(cfw, .4).addScaledVector(clf, .8).add(V(0, -.6, 0));
        const qPort = pis ? qLow : look(fwdOf(s.chestYaw + 1.15).multiplyScalar(Math.cos(.55)).setY(Math.sin(.55))).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -.5));
        const oPort = pis ? oLow : s.chest.localToWorld(V(-2.4, .6, 2.2));
        const qTuck = look(fwdOf(s.chestYaw + 1.0).multiplyScalar(Math.cos(.35)).setY(-Math.sin(.35))), oTuck = s.chest.localToWorld(pis ? V(-.8, 1.6, 3.0) : V(-2.2, 1.4, 1.6)); // behind cover: held close, muzzle down and across, nothing showing over the top
        const aw = s.aimW * (1 - lowOne * .9);
        const q = qLow.clone().slerp(qAim, aw).slerp(qPort, s.runW).slerp(qTuck, s.coverW), o = oLow.clone().lerp(pk, aw).lerp(oPort, s.runW).lerp(oTuck, s.coverW);
        return { o, q };
      };
      const stowPose = (wp) => wp.R.pistol
        ? { o: s.LR.th.localToWorld(V(-1.95 * s.build.bulk, -.9, .1)), q: look(V(0, -1, .12).applyQuaternion(s.LR.th.getWorldQuaternion(new THREE.Quaternion())).normalize()) }
        : { o: s.chest.localToWorld(V(1.9, 2.9, 2.3 * s.build.td + .4)), q: look(V(-.5, -.82, .2).applyQuaternion(s.chest.getWorldQuaternion(new THREE.Quaternion())).normalize()) };
      const cur = s.W[s.weapon], oth = s.W[s.weapon === "primary" ? "sidearm" : "primary"];
      let swapU = -1; if (s.swap >= 0 && !dead) { s.swap += dt; swapU = s.swap / .7; if (swapU >= 1) { s.swap = -1; swapU = -1; s.kickV += 7; } } // the new weapon comes up with a snap
      const mix = (A, Bp, k) => ({ o: A.o.clone().lerp(Bp.o, k), q: A.q.clone().slerp(Bp.q, k) });
      let poseCur = heldPose(cur), poseOth = stowPose(oth);
      if (TR && TR.stow > 0 && !cur.R.none) poseCur = mix(poseCur, stowPose(cur), TR.stow);
      if (swapU >= 0) { poseCur = mix(stowPose(cur), poseCur, ease(clamp((swapU - .5) / .4, 0, 1))); poseOth = mix(heldPose(oth), poseOth, ease(clamp((swapU - .08) / .42, 0, 1))); }
      // sway with the gait and breathing; recoil pushes back and lifts the muzzle; a butt stroke swings the weapon through
      { const q = poseCur.q, o = poseCur.o;
        s.sway.set(Math.sin(s.t * .9) * .015, Math.sin(s.t * 1.3) * .012, 0).multiplyScalar(1 + (1 - s.aimW) * 2);
        if (speed > 2) s.sway.y += Math.sin(s.phase * Math.PI * 4) * .012 * (1 - s.tacW * .7);
        q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-s.kick * .16 + s.sway.y, s.sway.x, 0)));
        o.addScaledVector(V(0, 0, 1).applyQuaternion(q), -s.kick * 1.4);
        if (melee && !s.handsOnly) { q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.3 * Math.abs(melee), -1.2 * melee, .5 * melee))); o.addScaledVector(cfw, 3.5 * Math.max(0, melee)).add(V(0, 1.2 * Math.abs(melee), 0)); }
        if (melee > .9 && ACT && !ACT.hit) { ACT.hit = true; const at = Wp((cur.R.none ? s.chest.localToWorld(V(-2, 2.5, 0)) : o.clone()).addScaledVector(cfw, cur.R.reach || (cur.R.none ? 9 : 6))); fx.melee && fx.melee(at); s.onStrike && s.onStrike(s, at); }
      }
      /* --- reloads, one for each kind of weapon. Each is a path for the support hand between named places, with the
         moments the old magazine drops, the new one shows in the hand, and it is seated. --- */
      function Wp(p) { return V(s.pos.x + (p.x - s.pos.x) * H, p.y * H + (s.baseY || 0), s.pos.z + (p.z - s.pos.z) * H); }
      let lOv = null, rOv = null;
      if (s.reload >= 0 && !dead) {
        s.reload += dt * 1.6; const t = s.reload, R = cur.R, kind = R.reload, rl = s.rl || (s.rl = { shells: 0 });
        let keys, D, tiltV, dropAt = -1, showFrom = -1, seatAt = -1;
        if (kind === "mag") { D = 2.3; tiltV = [.25, .25, .55]; dropAt = .4; showFrom = 1.0; seatAt = 1.52;
          keys = [[0, "sup"], [.32, "well"], [.48, "well"], [.85, "pouch"], [1.05, "pouch"], [1.42, "well"], [1.6, "wellUp"], [1.72, "charge"], [1.86, "chargeBack"], [2.1, "sup"]]; }
        else if (kind === "pistol") { D = 1.75; tiltV = [-.5, .1, .5]; dropAt = .28; showFrom = .75; seatAt = 1.14;
          keys = [[0, "sup"], [.2, "well"], [.34, "well"], [.6, "belt"], [.78, "belt"], [1.06, "well"], [1.18, "wellUp"], [1.3, "charge"], [1.42, "chargeBack"], [1.62, "sup"]]; }
        else if (kind === "belt") { D = 4.5; tiltV = [.1, .35, .25]; dropAt = 1.2; showFrom = 1.95; seatAt = 2.85; // open the cover, lift out the box, a new box and belt, close the cover, charge
          keys = [[0, "sup"], [.35, "cover"], [.6, "coverUp"], [.95, "well"], [1.15, "well"], [1.3, "wellDown"], [1.7, "belt"], [2.0, "belt"], [2.6, "wellDown"], [2.85, "well"], [3.15, "coverUp"], [3.4, "cover"], [3.55, "cover"], [3.8, "charge"], [3.95, "chargeBack"], [4.25, "sup"]]; }
        else { const n = Math.max(1, Math.min(4, R.cap - cur.ammo || 4)); D = .35 + n * .6 + .5; tiltV = [.1, .1, -.95]; keys = [[0, "sup"], [.25, "well"]]; // shells go in one at a time, then the pump is worked
          for (let i = 0; i < n; i++) { const t0 = .3 + i * .6; keys.push([t0 + .18, "belt"], [t0 + .28, "belt"], [t0 + .5, "wellUp"], [t0 + .58, "well"]); if (t > t0 + .58 && rl.shells <= i) { rl.shells = i + 1; cur.ammo = Math.min(R.cap, cur.ammo + 1); } cur.magHand.visible = cur.magHand.visible || (t > t0 + .26 && t < t0 + .56); }
          const tp = .35 + n * .6; keys.push([tp + .12, "charge"], [tp + .26, "chargeBack"], [tp + .4, "sup"]); }
        if (kind === "shells") { let vis = false; const n = Math.round((D - .85) / .6); for (let i = 0; i < n; i++) { const t0 = .3 + i * .6; if (t > t0 + .26 && t < t0 + .56) vis = true; } cur.magHand.visible = vis; }
        const tilt = ease(clamp(t / .3, 0, 1)) * (1 - ease(clamp((t - (D - .35)) / .35, 0, 1)));
        poseCur.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltV[0] * tilt, tiltV[1] * tilt, tiltV[2] * tilt)));
        poseCur.o.addScaledVector(cfw, -.8 * tilt).add(V(0, .5 * tilt, 0)).addScaledVector(clf, .9 * tilt);
        if (dropAt >= 0) {
          if (t > dropAt && !rl.dropped) { rl.dropped = true; cur.magIn.visible = false; cur.obj.position.copy(poseCur.o).sub(s.pos); cur.obj.quaternion.copy(poseCur.q); cur.obj.updateMatrixWorld(true);
            const m = drop(R.mag, Wp(cur.magIn.getWorldPosition(V())), cur.obj.getWorldQuaternion(new THREE.Quaternion()), V(0, -12, 0).addScaledVector(clf, -4)); m.o.scale.setScalar(H); }
          cur.magHand.visible = t > showFrom && t < seatAt;
          if (t > seatAt && !rl.seated) { rl.seated = true; cur.magIn.visible = true; cur.ammo = R.cap; s.kickV += 6; } // the magazine goes home with a slap
        }
        lOv = { keys, t };
        if (t >= D) { s.reload = -1; s.rl = null; cur.magHand.visible = false; }
      }
      /* --- put the weapons where they go; a dead hand lets go --- */
      if (dead) {
        if (!s.rifleFall) { s.rifleFall = { v: s.deadDir.clone().multiplyScalar(-10).add(V((Math.random() - .5) * 10, 14, (Math.random() - .5) * 10)), w: V(Math.random() * 6, Math.random() * 3, Math.random() * 6) }; }
        const rf = s.rifleFall, ob = cur.obj; rf.v.y -= 180 * dt; const wp = ob.getWorldPosition(V()).addScaledVector(rf.v, dt);
        if (wp.y < .8) { wp.y = .8; rf.v.multiplyScalar(.3); rf.v.y = Math.abs(rf.v.y) * .3; rf.w.multiplyScalar(.5); }
        ob.position.copy(wp).sub(s.pos); if (wp.y > .81) { ob.rotation.x += rf.w.x * dt; ob.rotation.z += rf.w.z * dt; } else { ob.rotation.x = damp(ob.rotation.x, 0, 4, dt); ob.rotation.z = damp(ob.rotation.z, Math.PI / 2, 4, dt); }
      } else { cur.obj.position.copy(poseCur.o).sub(s.pos); cur.obj.quaternion.copy(poseCur.q); }
      oth.obj.position.copy(poseOth.o).sub(s.pos); oth.obj.quaternion.copy(poseOth.q);
      cur.obj.updateMatrixWorld(true); oth.obj.updateMatrixWorld(true);

      /* --- arms: the right hand on the grip, the left on the handguard (or the pistol), unless an action takes one --- */
      const handArm = (g, target, pole, handQ) => {
        if (handQ) target = target.clone().addScaledVector(V(0, -1, 0).applyQuaternion(handQ), -.8); // the palm sits on the target
        const A = g.up.getWorldPosition(V()); const { K, E } = twoBone(A, target, L.upper, L.fore, pole);
        aimBone(g.up, A, K, pole); aimBone(g.fo, K, E, pole); if (handQ) setWorldQ(g.hd, handQ); else g.hd.rotation.set(-.2, 0, 0);
      };
      if (dead) {
        const k = ease(clamp(s.dead / .6, 0, 1));
        for (const g of [s.AL, s.AR]) { g.up.rotation.set((g.s > 0 ? -.9 : .3) * k, 0, g.s * (.25 + .55 * k)); g.fo.rotation.set(-.7 * k, 0, 0); g.hd.rotation.set(0, 0, 0); }
      } else {
        const P = s.W.primary, S = s.W.sidearm, wq = (wp) => wp.obj.getWorldQuaternion(new THREE.Quaternion()), E3 = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
        // right hand: on the weapon in use; during a swap it crosses from one grip to the other
        let rT = cur.obj.localToWorld(cur.R.grip.clone()), rQ = wq(cur).multiply(E3(-.35, 0, 0));
        if (swapU >= 0) { const k = ease(clamp((swapU - .28) / .27, 0, 1)); rT = oth.obj.localToWorld(oth.R.grip.clone()).lerp(rT, k); rQ = wq(oth).multiply(E3(-.35, 0, 0)).slerp(rQ, k); }
        // left hand: on the long gun's handguard, or wrapped round the pistol once it is up
        const lw = s.weapon === "sidearm" ? (swapU >= 0 ? ease(clamp((swapU - .68) / .27, 0, 1)) : 1) : (swapU >= 0 ? 1 - ease(clamp(swapU / .2, 0, 1)) : 0);
        let lT = P.obj.localToWorld(P.R.support.clone().add(V(0, -.3 * pr, P.R.melee ? 0 : -3.2 * pr))).lerp(S.obj.localToWorld(S.R.support.clone()), lw), lQ = wq(P).multiply(E3(0, 0, -1.3)).slerp(wq(S).multiply(E3(-.35, 0, -.7)), lw);
        const shL = s.AL.up.getWorldPosition(V()), shR = s.AR.up.getWorldPosition(V());
        let lPole = down.clone().addScaledVector(clf, .5).addScaledVector(cfw, -.2), rPole = clf.clone().multiplyScalar(-1).add(down).addScaledVector(cfw, -.3);
        // prone: the elbows go down and out onto the ground, so the forearms prop the weapon up
        if (pr > 0) { lPole.lerp(down.clone().addScaledVector(clf, .75).addScaledVector(cfw, -.35), pr); rPole.lerp(down.clone().addScaledVector(clf, -.85).addScaledVector(cfw, -.35), pr); }
        const freeL = !!(cur.R.none || cur.R.melee === 1), freeR = !!cur.R.none;
        // a fist closed round a handle: the knuckles in line with the forearm, the handle leaving the hand on the thumb's side
        const gripQ = (wp, pt, sh) => { const z = V(0, 0, 1).applyQuaternion(wq(wp)), f = wp.obj.localToWorld(pt.clone()).sub(sh).add(V(0, 3, 0)); f.addScaledVector(z, -f.dot(z)); if (f.lengthSq() < 1e-4) f.set(0, -1, 0); f.normalize();
          const y = f.negate(), x = new THREE.Vector3().crossVectors(y, z).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
        if (cur.R.melee && swapU < 0) { rQ = gripQ(cur, cur.R.grip, shR); if (cur.R.melee === 2) lQ = gripQ(cur, cur.R.support, shL); }
        if (lOv) { // the reload: the hand follows its path
          const R = cur.R, ob = cur.obj, L2 = (v) => ob.localToWorld(v.clone());
          const pts = { sup: lT, well: L2(R.magwell.clone().add(V(0, -1.6, 0))), wellUp: L2(R.magwell.clone().add(V(0, -.9, 0))), wellDown: L2(R.magwell.clone().add(V(0, -3.2, 0))), pouch: s.chest.localToWorld(V(.6, 1.1, 2.9 * s.build.td)),
            belt: s.pelvis.localToWorld(V(2.5 * s.build.tw, .9, 1.5)), charge: L2(R.charge), chargeBack: L2(R.chargeBack), cover: L2(V(0, 1.6, 6.6)), coverUp: L2(V(.4, 3.4, 5.4)) };
          const { keys, t } = lOv; let k = keys.length - 1; for (let i = 0; i < keys.length - 1; i++) if (t < keys[i + 1][0]) { k = i; break; }
          if (k >= keys.length - 1) lT = pts[keys[keys.length - 1][1]]; else { const a0 = keys[k], b0 = keys[k + 1]; lT = pts[a0[1]].clone().lerp(pts[b0[1]], 1 - (1 - clamp((t - a0[0]) / (b0[0] - a0[0]), 0, 1)) ** 3); } // the hand darts to each place and stops dead
          if (t > keys[1][0] * .8 && t < keys[keys.length - 1][0] - .05) lQ = null;
        } else if (s.pump > 0) { s.pump -= dt; const k = Math.sin(Math.PI * clamp(1 - s.pump / .42, 0, 1)); lT = lT.clone().lerp(cur.obj.localToWorld(cur.R.chargeBack.clone()), k); }
        // on the ground: crawling, the free hand reaches ahead and pulls in step with the legs; getting down or up, it is
        // planted under the shoulder and takes the weight
        const crawlW = pr * w, pushW = diveU >= 0 ? Math.sin(Math.PI * clamp(diveU * 1.2 - .1, 0, 1)) : Math.sin(Math.PI * clamp((s.proneW - .1) / .85, 0, 1));
        // a hand with nothing in it: hangs and swings with the walk, pumps at a run, comes up on guard, rests on the knee
        // behind cover, and goes flat on the ground when prone, ready to crawl or push up
        const freeHand = (side) => { const sh = side > 0 ? shL : shR, n = armSwing(side), gw = Math.max(s.aimW * (1 - s.runW), ACT && s.act && ACT.name === "melee" ? ACT.env : 0), gk = Math.max(pr, pushW);
          const T = sh.clone().add(V(0, -(9.2 - 3.4 * s.runW - .4 * w) + Math.sin(s.t * 1.3 + side) * .12, 0)).addScaledVector(cfw, .9 + n * (2.4 + 2.2 * s.runW) + 3.4 * s.runW).addScaledVector(clf, side * (1.2 - .5 * s.runW));
          const pole = cfw.clone().multiplyScalar(-1).addScaledVector(clf, side * .35);
          T.lerp(s.chest.localToWorld(cur.R.none ? V(side * 1.7, 4.1 + (side > 0 ? .5 : 0) + hBob * (side > 0 ? .4 : -.3), 3.5 + (side > 0 ? 1.5 : 0)) : V(side * 2.0, 2.9 + (side > 0 ? .7 : 0) + hBob * (side > 0 ? .4 : -.3), 5.0 + (side > 0 ? .8 : 0))), gw * (1 - s.coverW)); pole.lerp(down.clone().addScaledVector(clf, side * .7), gw * (1 - s.coverW));
          // kneeling behind cover: the left hand rests on the raised knee, the right hangs by the leg
          if (side > 0) T.lerp(s.LL.sh.getWorldPosition(V()).add(V(0, 1.1, 0)).addScaledVector(cfw, .6), s.coverW * s.crouchW);
          if (gk > .02) { const hc = cyc((s.phase + (side > 0 ? .25 : .75)) % 1);
            // lying down: propped on the forearms, elbows under the shoulders; crawling, each hand reaches and pulls in turn
            const rest = V(sh.x, .75 + hc.lift * 2.5 * crawlW, sh.z).addScaledVector(fw, 4.3 + hc.x * w * .9).addScaledVector(lf, side * .5);
            // getting down or up: hands flat beside the chest, elbows back along the ribs
            const push = V(sh.x, .75, sh.z).addScaledVector(fw, .8).addScaledVector(lf, side * 1.5);
            T.lerp(rest.lerp(push, pushW * (1 - crawlW)), clamp(gk * 1.3, 0, 1)); pole.lerp(down.clone().addScaledVector(fw, -.5 - .9 * pushW).addScaledVector(lf, side * .22), clamp(gk * 1.3, 0, 1)); }
          return { T, pole }; };
        if (freeL) { const h = freeHand(1); lT = h.T; lPole = h.pole; lQ = null; if (ACT && s.act && ACT.name === "throw" && cur.R.melee) lT = lT.clone().lerp(cur.obj.localToWorld(cur.R.grip.clone()), ACT.env); }
        if (freeR) { const h = freeHand(-1); rT = h.T; rPole = h.pole; rQ = null;
          if (melee) { const k = melee < 0 ? -melee / .6 : melee; rT = rT.clone().lerp(melee < 0 ? s.chest.localToWorld(V(-3.4, 2.4, .6)) : shR.clone().addScaledVector(cfw, 9.2).add(V(0, .6, 0)), k); } }
        if (!freeL && !lOv && Math.max(crawlW, pushW) > .04) { const hc = cyc((s.phase + .25) % 1), k = clamp(Math.max(crawlW, pushW) * 1.3, 0, 1);
          const tp = crawlW > pushW ? s.pos.clone().addScaledVector(fw, 8.5).addScaledVector(mdir, hc.x * w * .9).addScaledVector(lf, 4.8).setY(.8 + hc.lift * 3) : V(shL.x, .8, shL.z).addScaledVector(lf, 1.8).addScaledVector(fw, 1.5 + 2.5 * (1 - s.proneW));
          lT = lT.clone().lerp(tp, k); if (k > .5) lQ = null; lPole = lf.clone().add(V(0, .7, 0)).addScaledVector(fw, -.3); }
        if (ACT && s.act) { const u = ACT.u, env = ACT.env;
          if (ACT.name === "signal") { let tp;
            if (ACT.kind === "point") { const dir = ACT.at ? ACT.at.clone().sub(shL).normalize() : cfw.clone().setY(-.1).normalize(); tp = shL.clone().addScaledVector(dir, 9.3); }
            else if (ACT.kind === "halt") { tp = shL.clone().addScaledVector(cfw, 2.6).addScaledVector(clf, 1.6).add(V(0, 6.3, 0)); lPole = clf.clone().add(down); }
            else { const k = .5 - .5 * Math.cos(u * Math.PI * 4); tp = shL.clone().addScaledVector(cfw, 1 + 7.5 * k).addScaledVector(clf, 1.2).add(V(0, 6.5 - 5.5 * k, 0)); lPole = clf.clone().add(down); }
            lT = lT.clone().lerp(tp, env); if (env > .5) lQ = null; }
          if (ACT.name === "interact") { const tp = s.pos.clone().addScaledVector(fw, 7.5).addScaledVector(lf, 1.5).setY(3.2 + Math.sin(u * 20) * .3); lT = lT.clone().lerp(tp, env); if (env > .5) lQ = null; }
          if (ACT.name === "throw") { // take it from the vest, wind up behind the shoulder, throw over the top, follow through
            const dirT = ACT.at.clone().sub(shR).setY(0).normalize(), right = V(dirT.z, 0, -dirT.x).multiplyScalar(-1);
            const K = [[0, null], [.2, s.chest.localToWorld(V(-1.3, 1.2, 3.0 * s.build.td))], [.3, s.chest.localToWorld(V(-1.3, 1.2, 3.0 * s.build.td))], [.46, shR.clone().addScaledVector(dirT, -5.5).addScaledVector(right, 1.5).add(V(0, 3.5, 0))], [.57, shR.clone().addScaledVector(dirT, 7).add(V(0, 5.5, 0))], [.72, shR.clone().addScaledVector(dirT, 7.5).add(V(0, -2.5, 0))], [1, null]];
            let k = 0; while (k < K.length - 2 && u > K[k + 1][0]) k++; const p0 = K[k][1] || rT, p1 = K[k + 1][1] || rT, tp = p0.clone().lerp(p1, ease(clamp((u - K[k][0]) / (K[k + 1][0] - K[k][0]), 0, 1)));
            rT = tp; rQ = u > .08 && u < .92 ? null : rQ; rPole = right.clone().add(down).addScaledVector(dirT, -.6);
            s.nade.visible = u > .25 && u < .55;
            if (u > .55 && !ACT.done) { ACT.done = true; s.AR.hd.updateMatrixWorld(true); const from = Wp(s.AR.hd.getWorldPosition(V())), T = clamp(from.distanceTo(ACT.at) / 110, .55, 1.3), v = ACT.at.clone().sub(from).multiplyScalar(1 / T); v.y = (ACT.at.y + .7 - from.y + 90 * T * T) / T;
              const m = drop(s.nade.geometry, from, new THREE.Quaternion(), v, T + 1.4, .75); m.fuse = T + .9; const kind = ACT.kind; m.end = (pt) => { m.o.visible = false; fx.grenade && fx.grenade(pt, kind); }; }
          }
        }
        if (TR && TR.hw > 0) { // hands on a ledge, a wall or a hood (given in the world), or drawn in to the chest for a roll
          const sv = (p) => V(s.pos.x + (p.x - s.pos.x) / H, (p.y - BY) / H, s.pos.z + (p.z - s.pos.z) / H), pl = (sd) => down.clone().addScaledVector(clf, sd * .7).addScaledVector(cfw, -.25);
          const L2 = TR.hc ? s.chest.localToWorld(V(2.2, 1.2, 3.6)) : TR.hL ? sv(TR.hL) : null, R2 = TR.hc ? s.chest.localToWorld(V(-2.2, 1.2, 3.6)) : TR.hR ? sv(TR.hR) : null;
          if (L2) { lT = lT.clone().lerp(L2, TR.hw); if (TR.hw > .4) lQ = null; lPole = pl(1); } if (R2) { rT = rT.clone().lerp(R2, TR.hw); if (TR.hw > .4) rQ = null; rPole = pl(-1); } }
        handArm(s.AR, rT, rPole, rQ); handArm(s.AL, lT, lPole, lQ);
      }
      /* --- head: looks at the target, at what it points to, or around; a fallen head lolls --- */
      if (!dead) {
        const tgt = headAt || (s.aim && canAim && s.coverW < .5 ? s.aim : null);
        const lk = tgt ? tgt.clone().add(V(0, -BY, 0)) : s.head.getWorldPosition(V()).addScaledVector(fwdOf(s.yaw + Math.sin(s.t * .37) * .5 * (1 - s.coverW)), 50).add(V(0, -6 - 34 * s.coverW, 0));
        const hp = s.head.getWorldPosition(V()); const dv2 = lk.sub(hp); const hy = Math.atan2(dv2.x, dv2.z), hpch = Math.atan2(dv2.y, Math.hypot(dv2.x, dv2.z));
        const rel = clamp(angD(s.chestYaw, hy), -1.1, 1.1);
        const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(-hpch * .8 + s.aimW * .12, s.chestYaw + rel, s.aimW * -.12, "YXZ"));
        s.headQ.slerp(want, 1 - Math.exp(-12 * dt)); setWorldQ(s.head, s.headQ);
      } else s.head.rotation.set(-.3, .5, 0);

      /* --- shooting --- */
      // asked to fire from behind cover: come up over it or lean out round it, whichever gives a clear line
      if (!dead && s.burst > 0 && s.cover && !s.peek && !s.sidle && !s.goal && !s.busy && s.aim && !s.handsOnly) { const n = s.burst; s.burst = 0; if (s.peekFire(s.aim, n, "auto") === false) s.blocked = 9; }
      if (!dead && s.reload < 0 && s.swap < 0 && !s.act && s.burst > 0 && s.aimW > .8 && s.aim && !s.handsOnly) {
        s.nextShot -= dt;
        if (s.nextShot <= 0) {
          const mz0 = Wp(cur.obj.localToWorld(cur.R.muzzle.clone())), blk = segBlocked(mz0, s.aim);
          if (cur.ammo <= 0) { s.doReload(); }
          // no shot goes through cover: lean further or stand taller, or step sideways until the line is clear
          else if (blk && !s.forceFire) { s.nextShot = .08; s.blocked += .08;
            if (s.peek) { if (s.peek.style === "over") s.peek.full = true; else s.peek.shift = Math.min(s.peek.shift + 1.4, 16); }
            else if (!s.cover && !s.goal && s.blocked > .15) sidestep(s, mz0.y);
            if (s.blocked > 1.8) s.burst = 0; }
          else { const R = cur.R; s.blocked = 0;
            cur.ammo--; s.burst--; s.nextShot = R.rate; s.kickV += R.kick; if (R.pump) s.pump = .42;
            const mz = mz0, dir = V(0, 0, 1).applyQuaternion(cur.obj.getWorldQuaternion(new THREE.Quaternion()));
            fx.muzzle && fx.muzzle(mz, dir); fx.casing && fx.casing(Wp(cur.obj.localToWorld(R.eject.clone())), clf.clone().multiplyScalar(-1));
            for (let i = 0; i < (R.pellets || 1); i++) { const sp2 = R.pellets ? 9 : 3, tg = s.aim.clone().add(V((Math.random() - .5) * sp2, (Math.random() - .5) * sp2, (Math.random() - .5) * sp2)); if (blk && !s.forceFire) { const tb = segBox(blk, mz, tg); if (tb != null) tg.copy(mz.clone().lerp(tg, Math.max(.03, tb))); } fx.tracer && fx.tracer(mz, tg); if (blk && !s.forceFire && fx.impact) fx.impact(tg, mz); if (!i) s.onShot && s.onShot(s, mz, tg); }
          }
        }
      } else if (s.burst <= 0) s.nextShot = Math.min(s.nextShot, .05);
      s.root.scale.setScalar(H); s.root.position.y = s.baseY || 0;
    }

    return { make, update, all: ALL, GAITS, BUILDS, gaitFor, coverNear, removeSolid: (q) => { GRID.ver++; for (const L of [SOLIDS, COVERS]) { const i = L.indexOf(q); if (i >= 0) L.splice(i, 1); } }, solidsMoved: () => { GRID.ver++; }, addCover, addSolid, covers: COVERS, solids: SOLIDS, segBlocked, blockedAt, route, floorAt, surfAt, STEP_H, STAND_MIN, levelsAt, floorNear, roughAt, inBox, nearVox, standAt, microPath, passable, airClear, segHit, solidAt, SIGHT, MOVE, setStepRate: (r) => { stepRate = r; }, setGround: (fn) => { GH = fn || (() => 0); GRID.ver++; }, groundAt: (x, z) => GH(x, z) };
  };
})();
