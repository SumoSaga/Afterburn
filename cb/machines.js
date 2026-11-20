/* Machines that move (13 Nov 2026)
   Circuit Breaker's machines (table/genbuild.js, the "machine" types) are drawn in the engine, so they can be taken
   apart: GEN.rig(model, state) gives each one's body and its moving parts (legs, turrets, rotors, wheels, the mast,
   spikes, arms...), each with the point it turns on. This file builds that rig over the piece, hides the still model
   (it stays where it is, unseen, so minis still stand on the decks and the piece is still picked by clicking it) and
   moves the parts every frame:
     - walking: legs step and the body sways whenever the piece moves (dragged, settled, or walked with "Walk to");
       wheels roll, rotors spin, flyers hover and lean;
     - firing: the turrets turn to the target and fire what they carry (gun, rockets, rail, cannon, mortars, flamer);
     - scanning, taking a hit, being wrecked (it blows apart, then goes to its Ruined state);
     - specials: the Warden drives its spikes into the ground, the Lattice lowers and raises its mast, the Tremor braces,
       the Serpent burrows, the Maw digs, the Breacher rams, the Gleaner grabs, the Mite detonates, the Dart dives,
       the Moth jams, the Mule rearms, the Hive sends out its brood, the Brood drops Darts.
   Every action goes out as an "fx" message ({ kind: "mach", ... }) so every screen plays it; lasting states (planted,
   mast down, braced, burrowed, digging, jamming) are kept on the token as d.mstate. The Table calls sync() from apply(),
   tick() every frame, fx() for "mach" messages and panel() when a building is selected. */
(() => {
  "use strict";
  window.RevelryMachines = function (THREE, GEN, T) {
    const V3 = (a, b, c) => (Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3(a || 0, b || 0, c || 0));
    const rigs = new Map(), fx = [], hider = new THREE.MeshBasicMaterial({ visible: false });
    const sfx = (n) => { try { T.sfx(n); } catch {} };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const angTo = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    const approach = (v, t, rate) => { const d = t - v; return Math.abs(d) <= rate ? t : v + Math.sign(d) * rate; };
    let clock = 0;

    /* ---------- sounds, made from noise and tones ---------- */
    const A = window.GK && GK.audio;
    function noise(c, len) { const b = c.createBuffer(1, Math.max(1, c.sampleRate * len | 0), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; }
    function env(c, t, peak, a, len) { const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + len); return g; }
    if (A && A.register) {
      A.register("m-gun", (c, out, o) => { const t = o.t, s = noise(c, .12), f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900 + Math.random() * 500; f.Q.value = .7; s.connect(f).connect(env(c, t, .7, .004, .11)).connect(out); s.start(t); return .12; });
      A.register("m-boom", (c, out, o) => { const t = o.t, s = noise(c, 1.6), f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.2); s.connect(f).connect(env(c, t, 1.4, .01, 1.5)).connect(out); s.start(t);
        const o1 = c.createOscillator(); o1.frequency.setValueAtTime(70, t); o1.frequency.exponentialRampToValueAtTime(30, t + .6); o1.connect(env(c, t, .9, .005, .7)).connect(out); o1.start(t); o1.stop(t + .8); return 1.6; });
      A.register("m-rail", (c, out, o) => { const t = o.t, o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.setValueAtTime(2400, t); o1.frequency.exponentialRampToValueAtTime(90, t + .45); const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3000; o1.connect(f).connect(env(c, t, .35, .005, .5)).connect(out); o1.start(t); o1.stop(t + .55);
        const s = noise(c, .3); s.connect(env(c, t, .5, .002, .25)).connect(out); s.start(t); return .55; });
      A.register("m-charge", (c, out, o) => { const t = o.t, o1 = c.createOscillator(); o1.frequency.setValueAtTime(200, t); o1.frequency.exponentialRampToValueAtTime(1600, t + .5); o1.connect(env(c, t, .12, .3, .55)).connect(out); o1.start(t); o1.stop(t + .6); return .6; });
      A.register("m-servo", (c, out, o) => { const t = o.t, o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.setValueAtTime(90, t); o1.frequency.linearRampToValueAtTime(150, t + .35); o1.frequency.linearRampToValueAtTime(110, t + .5); const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700; o1.connect(f).connect(env(c, t, .16, .05, .55)).connect(out); o1.start(t); o1.stop(t + .6); return .6; });
      A.register("m-thud", (c, out, o) => { const t = o.t, o1 = c.createOscillator(); o1.frequency.setValueAtTime(110, t); o1.frequency.exponentialRampToValueAtTime(38, t + .25); o1.connect(env(c, t, 1, .004, .35)).connect(out); o1.start(t); o1.stop(t + .4); const s = noise(c, .2), f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500; s.connect(f).connect(env(c, t, .6, .003, .18)).connect(out); s.start(t); return .4; });
      A.register("m-whoosh", (c, out, o) => { const t = o.t, s = noise(c, .8), f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + .6); s.connect(f).connect(env(c, t, .4, .08, .75)).connect(out); s.start(t); return .8; });
      A.register("m-scan", (c, out, o) => { const t = o.t; for (let i = 0; i < 3; i++) { const o1 = c.createOscillator(); o1.type = "triangle"; o1.frequency.value = 1300 + i * 260; o1.connect(env(c, t + i * .16, .12, .01, .14)).connect(out); o1.start(t + i * .16); o1.stop(t + i * .16 + .16); } return .6; });
      A.register("m-grind", (c, out, o) => { const t = o.t, s = noise(c, 1.2), f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 240; f.Q.value = 3; s.connect(f).connect(env(c, t, .7, .1, 1.15)).connect(out); s.start(t); return 1.2; });
    }

    /* ---------- what each machine can do beyond its rig ---------- */
    const KIND = (d) => { const m = String(d.model || "").split(":"); return m[1] || ""; };
    const SHOT_NAME = { gun: "Fire guns", rocket: "Fire rockets", rail: "Fire rail", cannon: "Fire cannon", mortar: "Fire mortars", flame: "Fire flamer", drop: "Drop Darts" };
    const EXTRA_SHOTS = { gyre: ["gun", "rocket"], carrier: ["drop"], tick: [], hive: [] };
    const SPECIALS = {
      warden: [{ key: "planted", on: "Plant spikes", off: "Pull up" }],
      lattice: [{ key: "lowered", on: "Lower mast", off: "Raise mast" }],
      serpent: [{ key: "under", on: "Burrow", off: "Surface" }],
      maw: [{ key: "dig", on: "Dig", off: "Stop digging" }],
      moth: [{ key: "jam", on: "Jam", off: "Stop jamming" }],
      breacher: [{ act: "ram", label: "Ram" }],
      gleaner: [{ act: "grab", label: "Grab" }],
      tick: [{ act: "detonate", label: "Detonate" }],
      wasp: [{ act: "dive", label: "Dive", aim: true }],
      mule: [{ act: "rearm", label: "Rearm" }],
      hive: [{ act: "brood", label: "Build a Mite" }],
      carrier: [],
    };
    // more that some can do: walkers with knees can stomp; spotters mark a target; relays link the network; the Gyre makes
    // a strafing run; the fabricators make real machines (the Table sets them down through T.spawn, when it has one)
    const STOMP = new Set(["mantis", "arachnid", "stilt", "tremor", "mule", "gleaner", "citadel", "lancer", "vera", "jackal", "tankwalker"]);
    const MORE = {
      overseer: [{ act: "mark", label: "Mark a target", aim: true }],
      skyship: [{ act: "mark", label: "Mark a target", aim: true }, { act: "relay", label: "Relay" }],
      lattice: [{ act: "relay", label: "Relay" }],
      aerie: [{ act: "relay", label: "Relay" }, { act: "launch", label: "Launch an Overseer" }],
      gyre: [{ act: "strafe", label: "Strafing run", aim: true }],
      citadel: [{ act: "hangar", label: "Drop a Mite" }],
    };

    /* camo: which faces wear the machine's paint (its panels and accents), so a Table can repaint them for the season.
       aCamo = (which paint: 1 panels, 2 second panels, 3 accent, 0 not paint; how weathered: the paint's brightness) */
    function camoTag(geo, sch) {
      if (!geo || geo.getAttribute("aCamo")) return; const c = geo.getAttribute("color"); if (!c) return;
      const n = c.count, out = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const r = c.getX(i), g = c.getY(i), b = c.getZ(i);
        for (let j = 0; j < 3; j++) {
          const s = sch[j], x = r / s[0], y = g / s[1], z = b / s[2], m = (x + y + z) / 3, tol = .012 * m;
          if (m > .45 && m < 1.16 && Math.abs(x - m) < tol && Math.abs(y - m) < tol && Math.abs(z - m) < tol) { out[i * 2] = j + 1; out[i * 2 + 1] = m; break; }
        }
      }
      geo.setAttribute("aCamo", new THREE.BufferAttribute(out, 2));
    }

    /* ---------- building the rig over a piece ---------- */
    function build(p, rig, key) {
      const root = new THREE.Group(), body = new THREE.Group(); root.name = "machine-rig"; root.add(body);
      const meshes = [], mk = (geo, parent) => { const m = new THREE.Mesh(geo, hider); m.castShadow = m.receiveShadow = true; parent.add(m); meshes.push(m); return m; };
      mk(rig.base, root); if (rig.body) mk(rig.body, body);
      const box = new THREE.Box3(); if (rig.body) { rig.body.computeBoundingBox(); box.union(rig.body.boundingBox); }
      const nodes = rig.parts.map((q) => {
        const n = new THREE.Group(); n.position.fromArray(q.pivot); mk(q.geo, n);
        q.geo.computeBoundingBox(); const bb = q.geo.boundingBox.clone().translate(V3(q.pivot)); box.union(bb);
        const N = { q, n, rest: n.position.clone(), off: V3(), offT: V3(), rx: 0, rxT: 0, rz: 0, rzT: 0, yaw: 0, yawT: 0, ang: 0, kick: 0, rate: 3, delay: 0, axis: q.axis ? V3(q.axis).normalize() : null };
        if (q.muzzle) N.restYaw = Math.atan2(q.muzzle[0] - q.pivot[0], q.muzzle[2] - q.pivot[2]);
        if (q.kind === "leg" && q.foot) { const f = V3(q.foot), h = V3(q.pivot); N.len = f.distanceTo(h); const c = rig.parts.filter((x) => x.kind === "leg"), i = c.indexOf(q); N.legIx = i; N.legN = c.length; N.foot = f; }
        return N;
      });
      nodes.forEach((N) => {
        const q = N.q; let par = ["leg", "spike", "wheel", "stab"].includes(q.kind) && q.parent == null ? root : body;
        if (q.parentIx != null) { const P = nodes[q.parentIx]; par = P.n; N.n.position.fromArray(q.pivot).sub(V3(P.q.pivot)); N.rest.copy(N.n.position); }
        par.add(N.n);
      });
      // a leg drawn as thigh, shin and paw bends at the knee: two-bone IK keeps the paw flat where the gait puts it
      nodes.forEach((N, i) => {
        if (N.q.kind !== "leg" || !N.q.knee) return;
        const S = nodes.find((x) => x.q.kind === "shin" && x.q.parentIx === i), F = S && nodes.find((x) => x.q.kind === "paw" && x.q.parentIx === nodes.indexOf(S));
        if (!S || !F) return;
        const H = V3(N.q.pivot), K = V3(N.q.knee), A0 = V3(N.q.ank), t = K.clone().sub(H), w = A0.clone().sub(K), ha = A0.clone().sub(H);
        N.S = S; N.F = F; S.ik = F.ik = true; N.A0 = A0; N.L1 = t.length(); N.L2 = w.length();
        N.u0 = ha.clone().normalize(); N.d0 = ha.length();
        N.nrm = t.clone().cross(ha); if (N.nrm.lengthSq() < 1e-6) N.nrm = V3(N.q.axis || [1, 0, 0]); N.nrm.normalize();
        N.al0 = t.angleTo(ha); N.be0 = Math.acos(clamp((N.L1 * N.L1 + N.L2 * N.L2 - N.d0 * N.d0) / (2 * N.L1 * N.L2), -1, 1));
      });
      // gait phases: diagonal pairs for four legs, alternating sides for more, thirds for three
      const legs = nodes.filter((N) => N.q.kind === "leg");
      legs.forEach((N) => {
        const f = N.foot;
        const side = legs.filter((o) => (o.foot.x > 0) === (f.x > 0)).sort((a, b) => a.foot.z - b.foot.z), rank = side.indexOf(N);
        N.phase = legs.length === 3 ? N.legIx * Math.PI * 2 / 3 : legs.length === 2 ? (f.x > 0 ? 0 : Math.PI) : (((f.x > 0 ? 1 : 0) + rank) % 2) * Math.PI;
      });
      const sch = GEN.MSCHEME && rig.plan ? GEN.MSCHEME[rig.plan.scheme || 0] : null;
      if (sch) meshes.forEach((m) => { try { camoTag(m.geometry, sch); } catch (e) { } });
      const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1);
      const legLen = legs.length ? legs.reduce((s, N) => s + N.len, 0) / legs.length : 0;
      p.group.add(root);
      return { key, p, root, body, meshes, nodes, legs, box, size, legLen, hover: rig.hover || 0, flyer: !!rig.hover && !legs.length, type: rig.type,
        gait: 0, move: 0, lastPos: null, lastRot: 0, bodyOff: V3(), bodyOffT: V3(), rootOff: V3(), rootOffT: V3(), shake: 0, later: [], st: {}, walk: null, smokeT: 0, loop: 0, scanT: 0, atk: { y: 0, z: 0, p: 0, r: 0, x: 0 }, atkT: { y: 0, z: 0, p: 0, r: 0, x: 0 }, atkV: { y: 0, z: 0, p: 0, r: 0, x: 0 }, thudT: 0, idleT: 2 + Math.random() * 3, vS: 0, accS: 0, yawS: 0 };
    }
    function drop(id) { const R = rigs.get(id); if (!R) return; R.root.parent && R.root.parent.remove(R.root); if (R.real && R.real.material === hider && R.mat) R.real.material = R.mat; rigs.delete(id); }

    function sync(p, data) {
      const id = p.group.userData.id;
      if (!GEN || !GEN.isMachine || data.kind !== "building" || !GEN.isMachine(data.model)) { drop(id); return; }
      const v = data.variant || "timber", key = data.model + "|" + v, real = p.parts.grounds && p.parts.grounds[v];
      let R = rigs.get(id);
      if (R && R.key !== key) { drop(id); R = null; }
      if (v === "ruined" || !real) { drop(id); return; }
      if (!R) { let rig = null; try { rig = GEN.rig(data.model, v); } catch (e) { console.error("Machine rig failed", e); } if (!rig || !rig.parts) return; R = build(p, rig, key); R.fresh = true; rigs.set(id, R); }
      R.p = p; R.data = data; R.real = real;
      take(R);
      R.root.visible = real.visible;
      states(R, data.mstate || {}, R.fresh); R.fresh = false;
    }
    // the still model keeps its place for standing and picking but is drawn by the rig: the rig wears its material
    function take(R) {
      if (R.real.material !== hider) { R.mat = R.real.material; R.real.material = hider; }
      R.meshes.forEach((m) => { if (m.material !== R.mat) m.material = R.mat; });
    }

    /* ---------- lasting states: planted, mast down, braced, burrowed, digging, jamming ---------- */
    function states(R, ms, snap) {
      const t = R.type, was = R.st; R.st = { ...ms };
      const N = (k) => R.nodes.filter((x) => x.q.kind === k);
      if (t === "warden") {
        const on = !!ms.planted; R.bodyOffT.y = on ? -1.4 : 0;
        N("spike").forEach((x, i) => { x.offT.y = on ? -3.4 : 0; x.delay = snap ? 0 : on ? .35 + i * .16 : 0; x.rate = on ? 14 : 4; });
        N("leg").forEach((x) => { x.rxT = 0; });
      }
      if (t === "lattice") {
        const on = !!ms.lowered, segs = N("mast");
        segs.forEach((x) => { x.offT.y = on ? -(x.q.drop || 0) : 0; x.rate = 22; x.delay = snap ? 0 : on ? (segs.length - 1 - x.q.seg) * .35 : x.q.seg * .35; });
      }
      if (t === "tremor") {
        const on = !!ms.stowed; N("stab").forEach((x) => { x.rzT = on ? (x.q.side || 1) * 1.05 : 0; x.rate = 1.6; });
        R.bodyOffT.y = on ? 1.2 : 0;
      }
      if (t === "serpent") { R.rootOffT.y = ms.under ? -(R.box.max.y + 3) : 0; }
      if (snap) {
        R.nodes.forEach((x) => { x.off.copy(x.offT); x.rx = x.rxT; x.rz = x.rzT; x.delay = 0; });
        R.bodyOff.copy(R.bodyOffT); R.rootOff.copy(R.rootOffT);
      }
      return was;
    }

    /* ---------- where things are in the world ---------- */
    const tmp = new THREE.Vector3();
    function worldOf(R, N, pt) {
      R.root.updateMatrixWorld(true);
      if (!N) return R.body.localToWorld(V3(pt));
      return N.n.localToWorld(V3(pt).sub(V3(N.q.pivot)));
    }
    function boxPoint(R, top) {
      const b = R.box, p = V3(b.min.x + Math.random() * (b.max.x - b.min.x), top ? b.max.y : b.min.y + (.3 + Math.random() * .7) * (b.max.y - b.min.y), b.min.z + Math.random() * (b.max.z - b.min.z));
      R.root.updateMatrixWorld(true); return R.body.localToWorld(p);
    }
    function center(R) { const b = R.box; R.root.updateMatrixWorld(true); return R.body.localToWorld(V3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2)); }
    // weapons: the parts that carry one, or a gun mount on the body for the machines whose guns are part of the hull
    function weapons(R, kind) {
      const list = R.nodes.filter((N) => N.q.shot && (!kind || N.q.shot === kind)).map((N) => ({ N, G: R.nodes.find((x) => x.q.pitch && R.nodes[x.q.parentIx] === N) || null, shot: N.q.shot, m: [N.q.muzzle, N.q.muzzle2].filter(Boolean) }));
      const b = R.box;
      for (const s of EXTRA_SHOTS[R.type] || []) if (!kind || s === kind) {
        const front = [(b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * .25, b.max.z - 1], belly = [(b.min.x + b.max.x) / 2, b.min.y + 1, (b.min.z + b.max.z) / 2];
        if (s === "drop") list.push({ N: null, shot: s, m: [belly] });
        else if (s === "rocket") list.push({ N: null, shot: s, m: [[b.min.x + 2, front[1], front[2] - 4], [b.max.x - 2, front[1], front[2] - 4]] });
        else list.push({ N: null, shot: s, m: [front] });
      }
      return list;
    }
    function shotKinds(R) { return [...new Set(weapons(R).map((w) => w.shot))]; }

    /* ---------- effects (each screen draws its own) ---------- */
    const add = (o) => { o.t = -(o.delay || 0); fx.push(o); return o; };
    const glowMat = (c, op = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
    const tracerGeo = new THREE.BoxGeometry(.5, .5, 1).translate(0, 0, -.5), shellGeo = new THREE.CylinderGeometry(.5, .7, 3, 6).rotateX(Math.PI / 2), beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, .5, 0).rotateX(Math.PI / 2);
    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -.5, 0).rotateX(-Math.PI / 2);
    function flash(at, size = 1, color = "#ffd27a") { T.puff(at, { n: 10, color, size: 4 * size, life: .12, vel: () => V3((Math.random() - .5) * 40 * size, (Math.random() - .5) * 40 * size, (Math.random() - .5) * 40 * size) }); }
    function sparks(at, n = 12, s = 1) { T.puff(at, { n, color: "#ffc860", size: 2 * s, life: .45, grav: -160, vel: () => V3((Math.random() - .5) * 120 * s, Math.random() * 90 * s, (Math.random() - .5) * 120 * s) }); }
    function smoke(at, s = 1, n = 6) { T.puff(at, { n, color: "#3c3a38", dark: true, opacity: .55, size: 10 * s, life: 1.8, grow: 2, drag: 1.5, vel: () => V3((Math.random() - .5) * 14 * s, 14 + Math.random() * 20 * s, (Math.random() - .5) * 14 * s) }); }
    function dust(at, s = 1, n = 14) { T.puff(at, { n, color: "#8a7d6b", dark: true, opacity: .6, size: 9 * s, life: 1.2, grow: 1.6, drag: 2.2, vel: () => { const a = Math.random() * 6.28; return V3(Math.cos(a) * 60 * s, 6 + Math.random() * 18 * s, Math.sin(a) * 60 * s); } }); }
    function ground(at) { const h = T.heightAt(at.x, at.z); return V3(at.x, Number.isFinite(h) ? h : at.y, at.z); }
    function boom(at, s = 1, quiet) {
      try { T.flareFx(at, "#ff9a40", 6 * s, .7, true); } catch {}
      T.puff(at, { n: 26, color: "#ffb060", size: 7 * s, life: .45, drag: 3, vel: () => V3((Math.random() - .5) * 140 * s, Math.random() * 110 * s, (Math.random() - .5) * 140 * s) });
      T.puff(at, { n: 18, color: "#2e2b29", dark: true, opacity: .7, size: 14 * s, life: 2.2, grow: 2.4, drag: 2, vel: () => V3((Math.random() - .5) * 50 * s, 20 + Math.random() * 40 * s, (Math.random() - .5) * 50 * s) });
      try { T.ringFx(ground(at).add(V3(0, .6, 0)), "#ffcf90", 22 * s, .5); } catch {}
      if (s >= 1.2) try { T.chunksFx(at, "#5e5a54", Math.round(3 * s), 40 * s); } catch {}
      if (!quiet) sfx("m-boom");
      shakeNear(at, s); quake(at, s * .45);
    }
    function shakeNear(at, s) { rigs.forEach((R) => { const d = center(R).distanceTo(at); if (d < 60 * s + R.size / 2) R.shake = Math.max(R.shake, .35 * s); }); }
    function tracer(a, b, color = "#ffd27a", speed = 1100) {
      const m = new THREE.Mesh(tracerGeo, glowMat(color)); m.scale.set(1, 1, 22); m.position.copy(a); m.lookAt(b); m.renderOrder = 10; T.scene.add(m);
      add({ mesh: m, a: a.clone(), b: b.clone(), life: a.distanceTo(b) / speed, kind: "tracer" });
    }
    function rocket(a, b, o = {}) {
      const m = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: "#4a4d50", metalness: .5, roughness: .5 })), g = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), glowMat("#ffb35a"));
      m.add(g); g.position.z = -2; m.position.copy(a); T.scene.add(m);
      const d = a.distanceTo(b);
      add({ mesh: m, a: a.clone(), b: b.clone(), life: o.life || clamp(d / 420, .45, 1.6), arc: o.arc ?? d * .18, kind: "rocket", trail: 0, size: o.size || 1, delay: o.delay || 0, onHit: o.onHit, mortar: o.mortar });
    }
    function beam(a, b, color = "#8fe8ff", r = 1.4) {
      const m = new THREE.Mesh(beamGeo, glowMat(color)); m.position.copy(a); m.lookAt(b); m.scale.set(r, r, a.distanceTo(b)); m.renderOrder = 10; T.scene.add(m);
      const c = new THREE.Mesh(beamGeo, glowMat("#ffffff")); c.scale.set(.35, .35, 1); m.add(c);
      add({ mesh: m, life: .45, kind: "beam", r });
    }
    function tickFxList(dt) {
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt; if (f.t < 0) { if (f.mesh) f.mesh.visible = false; continue; } if (f.mesh) f.mesh.visible = true;
        const k = Math.min(1, f.t / f.life);
        if (f.kind === "tracer") { f.mesh.position.lerpVectors(f.a, f.b, k); }
        else if (f.kind === "rocket") {
          const p = f.a.clone().lerp(f.b, k); p.y += Math.sin(k * Math.PI) * f.arc; const q = f.a.clone().lerp(f.b, Math.min(1, k + .02)); q.y += Math.sin(Math.min(1, k + .02) * Math.PI) * f.arc;
          f.mesh.position.copy(p); f.mesh.lookAt(q);
          f.trail -= dt; if (f.trail <= 0 && k < 1) { f.trail = .03; T.puff(p, { n: 2, color: f.mortar ? "#77736c" : "#a9a49c", dark: true, opacity: .45, size: 6 * f.size, life: .9, grow: 1.6, drag: 2, vel: () => V3((Math.random() - .5) * 6, Math.random() * 6, (Math.random() - .5) * 6) }); }
        } else if (f.kind === "beam") { const s = f.r * (1 - k); f.mesh.scale.x = f.mesh.scale.y = Math.max(.01, s); f.mesh.material.opacity = 1 - k; }
        else if (f.kind === "cone") { f.mesh.material.opacity = f.op * Math.sin(Math.PI * k); if (f.sweep) f.sweep(f, k); }
        else if (f.kind === "laser") { const a = f.from(); f.mesh.position.copy(a); f.mesh.lookAt(f.b); f.mesh.scale.set(.5, .5, Math.max(.1, a.distanceTo(f.b))); f.mesh.material.opacity = (.55 + .35 * Math.sin(f.t * 40)) * Math.min(1, (f.life - f.t) * 4); }
        else if (f.kind === "line") { f.mesh.material.opacity = .9 * (1 - k); }
        else if (f.kind === "ring") { const s = f.r0 + (f.r1 - f.r0) * k; f.mesh.scale.set(s, 1, s); f.mesh.material.opacity = f.op * (1 - k); }
        if (f.t >= f.life) { if (f.onHit) f.onHit(f.b); if (f.mesh) { f.mesh.parent && f.mesh.parent.remove(f.mesh); f.mesh.material.dispose && f.mesh.material.dispose(); } if (f.geo) f.geo.dispose(); fx.splice(i, 1); }
      }
    }
    const ringGeo = new THREE.RingGeometry(.9, 1, 64).rotateX(-Math.PI / 2);
    function pulse(at, color, r, life = 1.1, delay = 0) { const m = new THREE.Mesh(ringGeo, glowMat(color, .9)); m.material.side = THREE.DoubleSide; m.position.copy(at); m.renderOrder = 9; T.scene.add(m); add({ mesh: m, kind: "ring", r0: 2, r1: r, op: .9, life, delay }); }

    /* ---------- shots ---------- */
    /* the body acts each attack out: it braces or crouches for it, rocks back with every shot, then settles.
       pose(): where the body goes (down, back, nose down); jolt(): a push that springs back */
    function pose(R, y, z, p, hold) { R.atkT = { y, z, p, r: 0, x: 0 }; if (hold != null) later(R, hold, () => { R.atkT = { y: 0, z: 0, p: 0, r: 0, x: 0 }; }); }
    // a shove to the body's spring (a footfall, a recoil): it swings past and settles, the way a heavy thing does
    function shove(R, c, v) { R.atkV[c] += v; }
    function quake(at, amt) { if (T.quake) try { T.quake(at, amt); } catch {} }
    // steam and heat let out of its vents
    function vent(R, n = 8) { const top = worldOf(R, null, [(R.box.min.x + R.box.max.x) / 2 + (Math.random() - .5) * (R.box.max.x - R.box.min.x) * .5, R.box.max.y - 1, (R.box.min.z + R.box.max.z) / 2 + (Math.random() - .5) * (R.box.max.z - R.box.min.z) * .4]), s = clamp(R.size / 90, .4, 2.2);
      T.puff(top, { n, color: "#d8d4cc", dark: true, opacity: .45, size: 5 * s, life: 1.3, grow: 2.2, drag: 1.6, vel: () => V3((Math.random() - .5) * 10 * s, 18 + Math.random() * 22 * s, (Math.random() - .5) * 10 * s) }); }
    // where it looks from: the head, or the front of the body
    function eyeOf(R) { const h = R.nodes.find((N) => N.q.kind === "head") || R.nodes.find((N) => N.q.kind === "turret"); return h ? worldOf(R, h, [h.q.pivot[0], h.q.pivot[1] + 1, h.q.pivot[2] + 3]) : worldOf(R, null, [(R.box.min.x + R.box.max.x) / 2, R.box.min.y + (R.box.max.y - R.box.min.y) * .6, R.box.max.z]); }
    /* when it is not doing anything it is still alive: it turns its head to whoever is nearest, shifts its weight from
       foot to foot, vents steam, and its eye flares */
    function idle(R) {
      const turrets = R.nodes.filter((N) => N.restYaw != null || N.q.kind === "head"), c = center(R), r = Math.random();
      if (r < .6 && turrets.length) { // a slow look: at whoever is nearest, or out over the ground it watches
        let tgt = null, bd = R.size * 6 + 260; try { for (const t of (T.threats ? T.threats() : [])) { const d = t.distanceTo(c); if (d < bd) { bd = d; tgt = t; } } } catch {}
        const seen = !!tgt; if (!tgt) { const a = R.p.group.rotation.y + (Math.random() - .5) * 2; tgt = c.clone().add(V3(Math.sin(a) * 120, -c.y + 6, Math.cos(a) * 120)); }
        const hold = 3 + Math.random() * 3; turrets.forEach((N) => { N.look = tgt.clone(); }); later(R, hold, () => turrets.forEach((N) => { N.look = null; }));
        if (seen) later(R, 1.6, () => { const e = eyeOf(R); T.puff(e, { n: 5, color: "#ff3a2a", size: 3.2, life: .6, vel: () => V3() }); }); // it has seen you
      } else if (r < .85) vent(R, 8);
      else { const e = eyeOf(R); T.puff(e, { n: 6, color: "#ff3a2a", size: 3.4, life: .8, vel: () => V3() }); }
    }
    function jolt(R, y, z, p) { R.atk.y += y; R.atk.z += z; R.atk.p += p; }
    // how far it must turn to bring its weapons onto the target: hull guns, and turrets that cannot swing that far, need the whole machine turned
    function needsFace(R, target, ws) {
      const g = R.p.group; g.updateMatrixWorld(true); const loc = g.worldToLocal(target.clone()), ang = Math.atan2(loc.x, loc.z);
      if (!ws) return Math.abs(ang) > .35 ? ang : 0;
      for (const w of ws) { if (!w.N) return Math.abs(ang) > .3 ? ang : 0; const lim = w.N.q.yaw; if (lim && Math.abs(angTo(w.N.restYaw || 0, ang)) > lim * .9) return ang; }
      return 0;
    }
    // turn on the spot (the legs step round); whoever sent it keeps the new facing. Returns how long the turn takes
    function face(R, ang, mine) {
      if (!ang || R.walk || R.st.planted || R.st.under) return 0;
      const g = R.p.group, from = g.position.clone(), r0 = g.rotation.y, turnDur = Math.abs(ang) / (R.size > 150 ? .45 : 1.4);
      R.walk = { t: 0, from, to: from.clone(), r0, r1: r0 + ang, turnDur, dur: .001, mine, id: g.userData.id, riders: riders(R), faceOnly: true };
      sfx("m-servo"); return turnDur + .1;
    }
    const WIND = { gun: .1, rocket: .35, rail: .3, cannon: .25, mortar: .4, flame: .2, drop: .1 };
    const LAST = { gun: 1.2, rocket: 1.1, rail: 1.5, cannon: 1.3, mortar: 1.8, flame: 1.5, drop: 1.2 };
    function windup(R, shot) {
      const u = R.size, f = R.flyer ? .4 : 1;
      if (shot === "gun") pose(R, -u * .012 * f, -u * .004, -.015);
      else if (shot === "rocket") pose(R, -u * .03 * f, -u * .01, -.07);
      else if (shot === "rail") pose(R, -u * .05 * f, 0, .03);
      else if (shot === "cannon") pose(R, -u * .025 * f, u * .006, .02);
      else if (shot === "mortar") pose(R, -u * .04 * f, 0, -.02);
      else if (shot === "flame") pose(R, -u * .015 * f, u * .015, .05);
      else if (shot === "drop") pose(R, u * .02, 0, 0);
    }
    function fire(R, at, kind, mine) {
      const ws = weapons(R, kind); if (!ws.length) return;
      const target = V3(at), shot = ws[0].shot, t0 = face(R, needsFace(R, target, ws), mine);
      later(R, t0, () => { ws.forEach((w) => { if (w.N) w.N.aim = target.clone(); }); sfx("m-servo"); windup(R, shot); });
      let turn = 0; if (!t0) ws.forEach((w) => { if (!w.N || w.N.restYaw == null || w.N.q.yaw) return; R.root.updateMatrixWorld(true); const loc = w.N.n.parent.worldToLocal(target.clone()), want = Math.atan2(loc.x - w.N.rest.x, loc.z - w.N.rest.z) - (w.N.restYaw || 0); turn = Math.max(turn, Math.abs(angTo(w.N.yaw, want)) / (R.size > 150 ? 1.1 : 3)); }); // a free turret swings onto the target first
      const wait = t0 + turn + (ws.some((w) => w.N) ? .55 : .15) + (WIND[shot] || 0);
      ws.forEach((w, wi) => later(R, wait + wi * .12, () => shoot(R, w, target)));
      later(R, wait + (LAST[shot] || 1.2) + (ws.length - 1) * .12, () => pose(R, 0, 0, 0));
      later(R, wait + 3, () => ws.forEach((w) => { if (w.N) w.N.aim = null; }));
    }
    function muzzleOf(R, w, i) { const m = w.m[i % w.m.length]; return worldOf(R, w.G || w.N, m); }
    function shoot(R, w, at) {
      const s = R.size > 150 ? 1.8 : R.size > 70 ? 1.3 : 1, small = w.N && w.N.q.small;
      const jit = (r) => at.clone().add(V3((Math.random() - .5) * r, 0, (Math.random() - .5) * r));
      if (w.shot === "gun") {
        const n = small ? 6 : 9;
        for (let i = 0; i < n; i++) later(R, i * .075, () => {
          const a = muzzleOf(R, w, i), b = jit(10); tracer(a, b); flash(a, small ? .6 : .9); kick(w, .6); jolt(R, 0, -R.size * .003, -.006); shove(R, "r", (w.m[0] && w.m[0][0] > 0 ? 1 : -1) * .12); shove(R, "z", -R.size * .04); sfx("m-gun");
          later(R, a.distanceTo(b) / 1100, () => { sparks(b, 8); if (i % 3 === 0) dust(ground(b), .4, 5); });
        });
      } else if (w.shot === "rocket") {
        const n = 4;
        for (let i = 0; i < n; i++) later(R, i * .16, () => { const a = muzzleOf(R, w, i); flash(a, 1, "#ffb060"); smoke(a, .6, 4); kick(w, .4); jolt(R, 0, -R.size * .006, -.025); shove(R, "p", -.35); shove(R, "y", -R.size * .08); sfx("m-whoosh"); if (i === n - 1) later(R, .4, () => vent(R, 8)); rocket(a, jit(26), { onHit: (b) => boom(b, 1, i > 1) }); });
      } else if (w.shot === "rail") {
        const a = muzzleOf(R, w, 0);
        T.puff(a, { n: 30, color: "#8fe8ff", size: 3, life: .5, swirl: 9, vel: () => V3((Math.random() - .5) * 30, (Math.random() - .5) * 30, (Math.random() - .5) * 30) }); sfx("m-charge");
        for (let j = 0; j < 5; j++) later(R, j * .1, () => { R.shake = Math.max(R.shake, .3); }); // it strains as the charge builds
        later(R, .55, () => { const a2 = muzzleOf(R, w, 0); beam(a2, at, "#8fe8ff", 1.6 * s); flash(a2, 1.4, "#c8f6ff"); kick(w, 2.2); jolt(R, -R.size * .01, -R.size * .05, -.09); shove(R, "z", -R.size * .5); shove(R, "p", -.6); quake(at, .8); later(R, .5, () => vent(R, 14)); dust(ground(center(R)), clamp(R.size / 90, .3, 2), 10); sfx("m-rail"); sparks(at, 24, 1.4); try { T.flareFx(at, "#8fe8ff", 6, .6); } catch {} try { T.ringFx(ground(at).add(V3(0, .6, 0)), "#8fe8ff", 30, .5); } catch {} dust(ground(at), 1, 18); R.shake = Math.max(R.shake, .25); });
      } else if (w.shot === "cannon") {
        for (let i = 0; i < w.m.length; i++) later(R, i * .35, () => {
          const a = muzzleOf(R, w, i); flash(a, 3, "#ffc070"); smoke(a, 2.2, 14); kick(w, 4); R.shake = Math.max(R.shake, .5); jolt(R, -R.size * .015, -R.size * .04, -.05); shove(R, "z", -R.size * .6); shove(R, "p", -.5); shove(R, "y", -R.size * .2); quake(a, 1.2); if (i === w.m.length - 1) later(R, .6, () => vent(R, 16)); dust(ground(center(R)), clamp(R.size / 80, .4, 2.5), 12); sfx("m-boom");
          rocket(a, jit(14), { life: .3, arc: 4, size: 2, onHit: (b) => boom(b, 2.2) });
        });
      } else if (w.shot === "mortar") {
        for (let i = 0; i < 6; i++) later(R, i * .22, () => { const a = muzzleOf(R, w, i); flash(a, 1.2, "#ffc070"); smoke(a, 1, 6); kick(w, 1.2); jolt(R, -R.size * .012, 0, .012); shove(R, "y", -R.size * .18); quake(a, .35); if (i === 5) later(R, .5, () => vent(R, 12)); sfx("m-thud"); const b = jit(70); rocket(a, b, { life: 1.9, arc: 160 + a.distanceTo(b) * .25, mortar: true, onHit: (p) => boom(p, 1.4, i % 2 === 1) }); });
      } else if (w.shot === "flame") {
        for (let i = 0; i < 16; i++) later(R, i * .07, () => {
          // the stream sweeps across the target, and the nozzle follows it
          const a = muzzleOf(R, w, 0), fl = at.clone().sub(a).setY(0).normalize(), pt = at.clone().add(V3(fl.z, 0, -fl.x).multiplyScalar(Math.sin(i / 15 * Math.PI * 2) * 14)); if (w.N) w.N.aim = pt;
          const dir = pt.clone().sub(a), d = dir.length(); dir.normalize();
          T.puff(a, { n: 7, color: i % 2 ? "#ff8a2a" : "#ffc04a", size: 6, life: Math.min(.8, d / 160), grow: 3, drag: .4, vel: () => dir.clone().multiplyScalar(170 + Math.random() * 40).add(V3((Math.random() - .5) * 26, (Math.random() - .5) * 18, (Math.random() - .5) * 26)) });
          if (i % 4 === 0) { sfx("m-whoosh"); try { T.flareFx(at, "#ff7a2a", 3, .5, true); } catch {} }
        });
        later(R, 1.2, () => smoke(at, 1.4, 10));
      } else if (w.shot === "drop") {
        for (let i = 0; i < 4; i++) later(R, i * .22, () => { const a = muzzleOf(R, w, 0).add(V3((Math.random() - .5) * 8, 0, (Math.random() - .5) * 8)); jolt(R, R.size * .012, 0, 0); sfx("m-whoosh"); rocket(a, jit(36), { life: .9 + Math.random() * .3, arc: 18, onHit: (b) => boom(b, 1, i > 0) }); });
      }
    }
    function kick(w, amt) { if (w.N) w.N.kick = Math.max(w.N.kick, amt); }

    function scan(R) {
      const head = R.nodes.find((N) => N.q.kind === "head") || R.nodes.find((N) => N.q.kind === "turret");
      const b = R.box, eye = head ? V3(head.q.pivot).add(V3(0, 2, 2)) : V3((b.min.x + b.max.x) / 2, b.max.y * .75, b.max.z - 2);
      const len = clamp(R.size * 2.4, 90, 420), m = new THREE.Mesh(coneGeo, glowMat("#7fe0ff", .0)); m.material.side = THREE.DoubleSide; m.scale.set(len * .32, len * .32, len); m.renderOrder = 9;
      const holder = new THREE.Group(); (head ? head.n.parent : R.body).add(holder); holder.position.copy(head ? head.n.position.clone().add(V3(0, 2, 2)) : eye); holder.add(m); m.rotation.x = .28;
      add({ mesh: holder, kind: "cone", life: 2.8, op: .22, sweep: (f, k) => { holder.rotation.y = Math.sin(k * Math.PI * 2) * .7; m.material.opacity = .22 * Math.sin(Math.PI * k); } });
      holder.material = m.material;
      R.nodes.filter((N) => N.q.kind === "turret" || N.q.kind === "head").forEach((N) => { N.sweepT = 2.8; });
      sfx("m-scan"); const g = ground(center(R)); pulse(g.add(V3(0, .8, 0)), "#7fe0ff", R.size * 2.2, 1.4); pulse(g, "#7fe0ff", R.size * 2.2, 1.4, .5);
    }
    function hit(R, at) {
      R.shake = Math.max(R.shake, .8); const p = at ? V3(at) : boxPoint(R);
      sparks(p, 22, 1.2); smoke(p, .8, 5); flash(p, 1.2, "#fff0c0"); sfx("m-gun"); later(R, .06, () => sfx("m-thud"));
    }
    function wreck(R, mine) {
      for (let i = 0; i < 5; i++) later(R, i * .26 + Math.random() * .1, () => { boom(boxPoint(R), (R.size > 150 ? 2.2 : R.size > 70 ? 1.6 : 1.1) * (i === 4 ? 1.4 : 1), i % 2 === 1); R.shake = 1; });
      later(R, 1.45, () => { smoke(center(R), 2, 16); if (mine) T.put(R.p.group.userData.id, { ...R.p.data, variant: "ruined", mstate: null }); });
    }

    /* ---------- specials ---------- */
    function special(R, act, data, mine) {
      const g = ground(center(R));
      if (act === "stomp") return stomp(R, data.at, mine);
      if (act === "mark") return mark(R, data.at, mine);
      if (act === "relay") return relay(R);
      if (act === "strafe") return strafe(R, data.at, mine);
      if (act === "launch") { // the Aerie: an Overseer lifts off the deck and flies out to its station
        const d = worldOf(R, null, [0, R.box.max.y, 0]), to = worldOf(R, null, [R.box.max.x + 40, 0, (Math.random() - .5) * 60]); to.y = ground(to).y + 45;
        sfx("m-servo"); pulse(d.clone(), "#7fe0ff", 30, .9); later(R, .5, () => { sfx("m-whoosh"); T.puff(d, { n: 16, color: "#a9a49c", dark: true, opacity: .5, size: 7, life: 1, grow: 1.6, drag: 2, vel: () => V3((Math.random() - .5) * 40, Math.random() * 20, (Math.random() - .5) * 40) }); rocket(d, to, { life: 1.1, arc: 30, onHit: (b) => { pulse(ground(b).add(V3(0, .8, 0)), "#7fe0ff", 24, .9); spawn(R, "overseer", b, mine); } }); });
        return;
      }
      if (act === "hangar") { // the Citadel: the belly hangar opens and lowers a Mite on its cable
        const belly = worldOf(R, null, [0, R.box.min.y + (R.box.max.y - R.box.min.y) * .35, 0]), gr = ground(belly);
        sfx("m-servo"); for (let i = 0; i < 5; i++) later(R, i * .25, () => { sparks(belly, 6, .8); if (i % 2) sfx("m-servo"); });
        later(R, 1.4, () => { dust(gr, 1.2, 14); sfx("m-thud"); pulse(gr.clone().add(V3(0, .8, 0)), "#ff6a3a", 40, 1); spawn(R, "tick", worldOf(R, null, [0, 0, R.box.max.z + 16]), mine); });
        return;
      }
      if (act === "ram") {
        const ram = R.nodes.find((N) => N.q.kind === "ram"); sfx("m-servo");
        if (ram) { ram.offT.z = ram.q.push || 8; ram.rate = 60; later(R, .45, () => { ram.offT.z = 0; ram.rate = 10; }); }
        R.rootOffT.z = 10; later(R, .3, () => { const f = worldOf(R, null, [0, 12, R.box.max.z + 6]); boom(f, 1.1, true); sfx("m-thud"); try { T.chunksFx(f, "#7a6f62", 7, 60); } catch {} R.shake = .9; }); later(R, .55, () => { R.rootOffT.z = 0; });
      } else if (act === "grab") {
        const arms = R.nodes.filter((N) => N.q.kind === "arm"), drums = R.nodes.filter((N) => N.q.kind === "wheel");
        arms.forEach((N, i) => { N.rxT = .55; N.rate = 1.8; later(R, 1.1 + i * .1, () => { N.rxT = 0; }); }); sfx("m-servo");
        drums.forEach((N) => { N.fast = 2.4; });
        later(R, .8, () => { const f = worldOf(R, null, [0, 4, R.box.max.z]); dust(ground(f), 1, 14); try { T.chunksFx(f, "#6b6258", 6, 30); } catch {} sfx("m-grind"); });
        later(R, 1.8, () => { sfx("m-grind"); const f = worldOf(R, null, [0, R.box.max.y * .6, R.box.max.z * .55]); smoke(f, .8, 6); });
      } else if (act === "detonate") {
        R.blink = 1.2; sfx("m-scan"); later(R, 1.2, () => { boom(center(R), 1.6); if (mine) T.put(R.p.group.userData.id, { ...R.p.data, variant: "ruined", mstate: null }); });
      } else if (act === "dive") {
        const to = V3(data.at); R.dive = { t: 0, from: R.p.group.position.clone(), to }; sfx("m-whoosh");
        later(R, 1.05, () => { boom(to, 1.4); R.dive = null; if (mine) T.put(R.p.group.userData.id, { ...R.p.data, x: to.x, z: to.z, variant: "ruined", mstate: null }); });
      } else if (act === "rearm") {
        sfx("m-servo"); for (let i = 0; i < 3; i++) pulse(g.clone().add(V3(0, 1, 0)), "#9cff8a", R.size * 3, 1.4, i * .35);
        rigs.forEach((o) => { if (o !== R && center(o).distanceTo(g) < R.size * 3.2) later(R, .6, () => T.puff(center(o), { n: 18, color: "#9cff8a", size: 3, life: .8, vel: () => V3((Math.random() - .5) * 30, 20 + Math.random() * 30, (Math.random() - .5) * 30) })); });
      } else if (act === "brood") {
        const back = worldOf(R, null, [0, 4, R.box.min.z]); sfx("m-servo");
        for (let i = 0; i < 4; i++) later(R, .3 + i * .3, () => { sparks(back, 10); dust(ground(back), .6, 8); sfx("m-thud"); });
        later(R, 1.6, () => { smoke(back, .6, 6); spawn(R, "tick", worldOf(R, null, [0, 0, R.box.min.z - 14]), mine); });
      } else if (act === "jam" || act === "unjam") { if (act === "jam") sfx("m-charge"); }
      else if (act === "planted") { // the spikes go in after the body settles
        R.nodes.filter((N) => N.q.kind === "spike").forEach((N, i) => later(R, .5 + i * .16, () => { const f = worldOf(R, N, [N.q.pivot[0], 0, N.q.pivot[2]]); dust(ground(f), .7, 10); sparks(f, 6); sfx("m-thud"); R.shake = .3; }));
        sfx("m-servo");
      } else if (act === "unplanted") { sfx("m-servo"); R.nodes.filter((N) => N.q.kind === "spike").forEach((N) => dust(ground(worldOf(R, N, N.q.pivot)), .5, 6)); }
      else if (act === "lowered" || act === "unlowered") { sfx("m-servo"); later(R, .5, () => sfx("m-servo")); later(R, 1, () => sfx("m-servo")); }
      else if (act === "stowed" || act === "unstowed") { sfx("m-servo"); if (act === "unstowed") later(R, .9, () => { R.nodes.filter((N) => N.q.kind === "stab").forEach((N) => dust(ground(worldOf(R, null, [(N.q.side || 1) * 30, 0, -24])), .7, 10)); sfx("m-thud"); }); }
      else if (act === "under" || act === "ununder") { R.churn = 2.4; sfx("m-grind"); later(R, 1.1, () => sfx("m-grind")); }
      else if (act === "dig" || act === "undig") { sfx(act === "dig" ? "m-grind" : "m-servo"); }
    }

    /* ---------- melee and the machines' own work ---------- */
    // a stomp: it faces the target, rears back, lifts its front leg high and slams it down
    function stomp(R, at, mine) {
      const ik = R.legs.filter((N) => N.S); if (!ik.length) return;
      const t0 = at ? face(R, needsFace(R, V3(at)), mine) : 0;
      later(R, t0, () => {
        const N = ik.slice().sort((a, b) => (b.foot.z - a.foot.z) || (b.foot.x - a.foot.x))[0], dur = R.size > 150 ? 1.7 : 1.05;
        N.stomp = { t: 0, dur }; sfx("m-servo"); pose(R, R.size * .01, -R.size * .015, -.07, dur * .5);
        later(R, dur * .56, () => { jolt(R, -R.size * .03, R.size * .02, .1); slam(R, R.root.localToWorld(N.A0.clone().add(V3(0, 0, N.len * .25)))); });
      });
    }
    function slam(R, f) {
      const s = clamp(R.size / 80, .6, 3), g = ground(f);
      dust(g, s, 20); sparks(g, 10, s * .6); sfx("m-thud"); if (s > 1.5) later(R, .04, () => sfx("m-boom"));
      try { T.ringFx(g.clone().add(V3(0, .6, 0)), "#d8c8a8", 26 * s, .5); } catch {} try { T.chunksFx(g, "#6b6258", Math.round(3 * s), 40 * s); } catch {}
      R.shake = Math.max(R.shake, .6); shakeNear(g, s * .6); quake(g, s * .5);
    }
    // a spiked foot stabbing in: clods thrown up, a crack ring, sparks off the steel on the big ones
    function pierce(R, at, depth) { const g = ground(at), s = clamp(R.size / 90, .4, 1.8); try { T.chunksFx(g, "#5a5048", Math.round(3 + 3 * s), 26 * s); } catch {} dust(g, s * .6, 5); if (R.size > 60) sparks(g.clone().add(V3(0, .5, 0)), 4, s * .5); try { T.ringFx(g.clone().add(V3(0, .4, 0)), "#4a4038", depth * 2.4, .45); } catch {} }
    // a footfall: dust where a paw comes down; the big ones thud and shake
    function footfall(R, at, side) {
      const s = R.size, g = ground(at); dust(g, clamp(s / 110, .3, 1.8), s > 150 ? 14 : s > 60 ? 8 : 3);
      shove(R, "y", -s * (s > 150 ? .05 : .07)); shove(R, "r", -(side || 0) * (s > 150 ? .05 : .08));
      if (s > 45) quake(g, s > 150 ? 1.1 : .45); if (s > 45) { try { T.ringFx(g.clone().add(V3(0, .5, 0)), "#b8a888", s * .1, .35); } catch {} if (R.thudT <= 0) { sfx("m-thud"); R.thudT = .15; } }
      if (s > 120 && R.thudT <= 0) { sfx("m-thud"); R.thudT = .2; if (s > 150) { R.shake = Math.max(R.shake, .1); try { T.ringFx(g.clone().add(V3(0, .5, 0)), "#b8a888", s * .12, .4); } catch {} } }
    }
    function footstep(R, N, c, A) { if (R.move > .35 && N.lc > 0 && c <= 0) { R.root.updateMatrixWorld(true); footfall(R, R.root.localToWorld(A.clone()), Math.sign(A.x)); } N.lc = c; }
    // a spotter paints the target with a laser for the others to fire on
    function mark(R, at, mine) {
      const target = V3(at), t0 = face(R, needsFace(R, target), mine), head = R.nodes.find((N) => N.q.kind === "head") || R.nodes.find((N) => N.q.kind === "turret");
      later(R, t0, () => {
        if (head) head.aim = target.clone(); sfx("m-scan");
        const from = () => head ? worldOf(R, head, head.q.muzzle || [head.q.pivot[0], head.q.pivot[1], head.q.pivot[2] + 3]) : worldOf(R, null, [(R.box.min.x + R.box.max.x) / 2, R.box.min.y + 1, R.box.max.z]);
        const m = new THREE.Mesh(beamGeo, glowMat("#ff3a2a", .8)); m.renderOrder = 10; T.scene.add(m);
        add({ mesh: m, kind: "laser", life: 3.2, from, b: target.clone() });
        for (let i = 0; i < 3; i++) pulse(ground(target).add(V3(0, .8, 0)), "#ff3a2a", 22, .9, .3 + i * .9);
        later(R, 3.3, () => { if (head) head.aim = null; });
      });
    }
    // a relay: the network's light runs out to every machine near it
    function arcLine(a, b, color) {
      const pts = [], L = a.distanceTo(b); for (let i = 0; i <= 24; i++) { const k = i / 24, p = a.clone().lerp(b, k); p.y += Math.sin(k * Math.PI) * L * .18; pts.push(p); }
      const geo = new THREE.BufferGeometry().setFromPoints(pts), m = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 10; T.scene.add(m); add({ mesh: m, kind: "line", life: 1.5, geo });
    }
    function relay(R) {
      const c = center(R), others = []; rigs.forEach((o) => { if (o !== R && center(o).distanceTo(c) < Math.max(500, R.size * 8)) others.push(o); });
      sfx("m-charge"); pulse(ground(c).add(V3(0, 1, 0)), "#38d6ff", R.size * 3, 1.4); T.puff(c, { n: 20, color: "#8fe8ff", size: 2.6, life: .8, swirl: 6, vel: () => V3((Math.random() - .5) * 40, 10 + Math.random() * 30, (Math.random() - .5) * 40) });
      others.forEach((o, i) => later(R, .2 + i * .12, () => { const b = center(o); arcLine(c, b, "#38d6ff"); later(R, .45, () => { T.puff(b, { n: 14, color: "#8fe8ff", size: 2.6, life: .7, vel: () => V3((Math.random() - .5) * 30, 10 + Math.random() * 30, (Math.random() - .5) * 30) }); pulse(ground(b).add(V3(0, 1, 0)), "#38d6ff", o.size * 1.6, 1); }); }));
    }
    // a strafing run: it dives along the line to the target, guns going, and pulls round back to where it was
    function strafe(R, at, mine) {
      const target = V3(at), t0 = face(R, needsFace(R, target), mine);
      later(R, t0, () => {
        const g = R.p.group; g.updateMatrixWorld(true); R.strafe = { t: 0, dur: 3, to: g.worldToLocal(target.clone()) }; sfx("m-whoosh");
        const dir = target.clone().sub(g.position).setY(0).normalize();
        for (let i = 0; i < 14; i++) later(R, 1 + i * .07, () => {
          const a = worldOf(R, null, [(R.box.min.x + R.box.max.x) / 2, R.box.min.y + 2, R.box.max.z]), b = ground(target.clone().addScaledVector(dir, (i / 13 - .5) * 60));
          tracer(a, b); flash(a, .8); sfx("m-gun"); later(R, a.distanceTo(b) / 1100, () => { sparks(b, 6); if (i % 2 === 0) dust(b, .5, 5); });
        });
      });
    }
    // a machine made by another: set down as a real piece by whoever sent it, when the Table can
    function spawn(R, type, at, mine) { if (mine && T.spawn) try { T.spawn(type, at, R.p.group.rotation.y); } catch (e) { console.warn("could not set the new machine down", e); } }

    /* ---------- the network ---------- */
    function fxIn(data, isMe) {
      const R = rigs.get(data.id); if (!R) return;
      if (data.act === "fire") fire(R, data.at, data.shot, isMe);
      else if (data.act === "scan") scan(R);
      else if (data.act === "hit") hit(R, data.at);
      else if (data.act === "wreck") wreck(R, isMe);
      else if (data.act === "walk") startWalk(R, data, isMe);
      else if (data.act === "state") special(R, (data.on ? "" : "un") + data.key, data, isMe);
      else special(R, data.act, data, isMe);
    }
    const send = (o) => T.game.send("fx", { kind: "mach", ...o });

    /* ---------- walking ---------- */
    function startWalk(R, d, mine) {
      const p = R.p, from = p.group.position.clone(), to = V3(d.to[0], 0, d.to[1]);
      to.y = T.baseY({ ...p.data, x: to.x, z: to.z });
      const dist = Math.hypot(to.x - from.x, to.z - from.z); if (dist < 1) return;
      const r0 = p.group.rotation.y, r1 = Math.atan2(to.x - from.x, to.z - from.z), turn = Math.abs(angTo(r0, r1));
      /* heavy things go slowly: a cruising speed that falls with size, reached and lost over a few seconds (a steady
         push up to speed, a steady run, a steady slowing down), and a slow turn on the spot first */
      const big = R.size > 150, mid = R.size > 60;
      // the small ones, the fliers and the tracked and wheeled are quick; walkers go no faster than their legs can carry them
      let speed; const G = gaitOf(R);
      if (R.flyer) speed = big ? 34 : mid ? 60 : 95;
      else if (!R.legs.length) speed = big ? 30 : mid ? 55 : 80;
      else if (G) speed = R.size < 50 ? 40 : clamp(Math.min(big ? 18 : 30, .7 * G.s * G.mMax / (G.n * G.sd0 * .55)), 8, 60); // the little ones scuttle
      else speed = clamp((R.legLen * 1.1) || 24, 12, 40) * (big ? .55 : mid ? .8 : 1);
      const ta = R.flyer ? (big ? 2.4 : mid ? 1.2 : .6) : !R.legs.length ? (big ? 2.2 : mid ? 1 : .5) : big ? 2.6 : mid ? 1.4 : .5, turnDur = turn / (R.flyer || !R.legs.length ? (big ? .4 : 1.8) : big ? .28 : mid ? .7 : 1.6);
      const run = ramp(dist, speed, ta);
      R.walk = { t: 0, from, to, r0, r1, turnDur, dur: run.T, run, mine, id: p.group.userData.id, riders: riders(R) };
      sfx("m-servo"); pose(R, -R.size * .015, 0, R.flyer ? .08 : .025, .35); // it gathers itself to set off
    }
    function riders(R) {
      const g = R.p.group, out = [], b = R.box; g.updateMatrixWorld(true);
      T.pieces.forEach((q, id) => {
        if (q === R.p || !q.data || !["mini", "prop"].includes(q.data.kind)) return;
        const wp = q.group.position, loc = g.worldToLocal(wp.clone()), gh = T.heightAt(wp.x, wp.z);
        if (loc.x < b.min.x - 4 || loc.x > b.max.x + 4 || loc.z < b.min.z - 4 || loc.z > b.max.z + 4) return;
        if (!(wp.y > (Number.isFinite(gh) ? gh : 0) + 4)) return; // on the ground beside its legs, not on it
        out.push({ id, loc, rel: (q.group.rotation.y || 0) - g.rotation.y });
      });
      return out;
    }
    function carry(R, W) {
      const g = R.p.group; g.updateMatrixWorld(true);
      W.riders.forEach((c) => { const q = T.pieces.get(c.id); if (!q) return; q.group.position.copy(g.localToWorld(c.loc.clone())); q.group.rotation.y = g.rotation.y + c.rel; });
    }
    // a run that speeds up and slows down steadily: how far along it is at time t, and how long it takes in all
    function ramp(D, v, ta) {
      const a = v / ta; let tA = ta, dA = .5 * a * ta * ta; if (2 * dA > D) { tA = Math.sqrt(D / a); v = a * tA; dA = D / 2; }
      const tC = (D - 2 * dA) / v, T = 2 * tA + tC;
      return { T, at: (t) => { t = clamp(t, 0, T); if (t <= tA) return .5 * a * t * t; if (t <= tA + tC) return dA + v * (t - tA); const u = t - tA - tC; return dA + v * tC + v * u - .5 * a * u * u; }, D };
    }
    /* ---------- the gait: feet that stay where they are put ----------
       Every leg with a knee has a foothold in the world. While it stands there the foot does not move, whatever the
       body does; the body carries on over it until the foot is too far behind (or, turning, too far round), and then
       that leg lifts, swings to a new foothold a little ahead of where it would rest and comes down. The others hold
       the weight meanwhile, and the body leans off the lifted leg onto them. At a walk one leg goes at a time (the way a
       four-legged animal walks: three feet down); hurried, the diagonal pairs go together (a trot), and six legs go
       three at a time (a tripod). Steps quicken as it hurries, never past what the legs can do. */
    function gaitOf(R) {
      if (R.gait0 !== undefined) return R.gait0;
      const ik = R.legs.filter((N) => N.S), n = ik.length; if (!n) return (R.gait0 = null);
      /* how far a foot can go forward and back of where it rests before the leg is straight: the stride. Most of
         these legs stand nearly straight, so to walk the body sinks on bent knees (as low as it needs to, within
         reason), the way a heavy animal lowers itself to stride out */
      const len = ik.reduce((a, N) => a + N.len, 0) / n, GO = ik[0].q.gait || null, cr = GO ? (GO.crouch || 0) * len : 0; // a machine can set its own gait (hLeg)
      const fit = (N, t) => { const hip = V3(N.q.pivot[0], N.q.pivot[1] - cr, N.q.pivot[2]), a = V3(N.A0.x + (hip.x - N.A0.x) * t, N.A0.y, N.A0.z + (hip.z - N.A0.z) * t), R0 = (N.L1 + N.L2) * .94;
        const ok = (dz) => hip.distanceTo(V3(a.x, a.y, a.z + dz)) <= R0 && hip.distanceTo(V3(a.x, a.y, a.z - dz)) <= R0;
        if (!ok(0)) return 0; let lo = 0, hi = N.len; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; } return lo; };
      let tuck = 0, dz = 0;
      if (GO) dz = Math.min(...ik.map((N) => fit(N, 0))); else for (let k = 0; k <= 17; k++) { tuck = .05 * k; dz = Math.min(...ik.map((N) => fit(N, tuck))); if (dz >= len * .5) break; }
      R.walkTuck = tuck; R.walkCrouch = cr;
      const s = Math.max(2 * dz * (GO ? GO.reach || .85 : .9), len * .1), sd0 = clamp(.3 + R.size * .003, .3, 1.3), mMax = n >= 6 ? 3 : n === 4 ? 2 : 1;
      const mz = ik.map((N) => N.foot.z).sort((a, b) => a - b)[Math.floor(n / 2)];
      ik.forEach((N, i) => { const right = N.foot.x > 0 ? 1 : 0;
        if (n === 4) N.grp = right ^ (N.foot.z >= mz ? 1 : 0);
        else if (n >= 6) { const side = ik.filter((M) => (M.foot.x > 0) === (N.foot.x > 0)).sort((a, b) => a.foot.z - b.foot.z); N.grp = (right + side.indexOf(N)) % 2; }
        else N.grp = i; });
      return (R.gait0 = { ik, n, s, sd0, mMax, lift: GO && GO.lift, out: GO && GO.out, swing: GO && GO.swing });
    }
    function planLegs(R, dt) {
      const G = gaitOf(R); if (!G) return; const { ik, n, s, sd0, mMax } = G, g = R.p.group, pos = g.position;
      R.root.updateMatrixWorld(true);
      if (!R.pv) R.pv = pos.clone(); const vel = pos.clone().sub(R.pv).divideScalar(Math.max(dt, 1e-4)); vel.y = 0; R.pv.copy(pos);
      if (vel.length() > R.size * 25) { vel.set(0, 0, 0); ik.forEach((N) => { N.P = null; N.sw = null; }); } // a jump, not a walk: stand where it is
      R.velW = (R.velW || V3()).lerp(vel, 1 - Math.exp(-dt * 8)); const v = R.velW.length(), turn = Math.abs(R.yawS || 0) * R.size * .4, pace = v + turn;
      const sw1 = G.swing || 1, sd = clamp(pace > .1 ? .85 * s * mMax / (n * pace) : sd0 * sw1, sd0 * (R.size < 50 ? .35 : .55), sd0 * sw1); // a long, unhurried swing when there is time for it, quicker when the body outpaces the feet
      const need = clamp(Math.ceil(n * sd * pace / (s * .85)), 1, mMax), h0 = T.heightAt(pos.x, pos.z);
      R.tk = (R.tk || 0) + ((R.walkTuck || 0) * clamp(pace / 3, 0, 1) - (R.tk || 0)) * (1 - Math.exp(-dt * 2.5)); // feet in under it as it walks, out again when it stands
      ik.forEach((N) => { const a0 = N.A0.clone(); a0.x += (N.q.pivot[0] - a0.x) * R.tk; a0.z += (N.q.pivot[2] - a0.z) * R.tk; const H = R.root.localToWorld(a0); if (v > .5) H.addScaledVector(R.velW, s * .42 / v); /* a foot goes down well ahead of where it would rest, so each step is a long one */ const gh = T.heightAt(H.x, H.z); if (Number.isFinite(gh) && Number.isFinite(h0)) H.y += gh - h0; N.home = H; if (!N.P) N.P = H.clone(); });
      // feet in the air go on to their footholds (which keep up with the body until they are nearly down)
      for (const N of ik) if (N.sw) { const S = N.sw; S.t += dt; const u = Math.min(1, S.t / S.dur); if (u < .7) S.to.lerp(N.home, 1 - Math.exp(-dt * 10));
        const e = u < .75 ? (u / .75) * (u / .75) * (3 - 2 * u / .75) : 1; N.footW = S.from.clone().lerp(S.to, e); if (S.out) { const w = Math.sin(Math.PI * u) * S.out; N.footW.x += S.ox * w; N.footW.z += S.oz * w; } N.footW.y += (u < .55 ? Math.sin(u / .55 * Math.PI / 2) : Math.cos((u - .55) / .45 * Math.PI / 2) ** 2) * S.lift;
        if (u >= 1) { N.P = S.to.clone(); N.sw = null; N.footW = N.P.clone(); footfall(R, N.P, Math.sign(N.foot.x)); if (N.q.spike) pierce(R, N.P, N.q.spike); } }
      // lift the leg that has fallen furthest behind, if the others can hold the weight
      const moving = pace > .6, thr = moving ? s * .85 : s * .22; let busy = ik.filter((N) => N.sw || N.stomp).length;
      if (!R.st.planted) for (const c of ik.filter((N) => !N.sw && !N.stomp).map((N) => { const hip = R.root.localToWorld(N.n.position.clone()), lim = Math.min(N.L1 + N.L2, Math.max(N.d0 * 1.04, (N.L1 + N.L2) * .93)), reach = hip.distanceTo(N.P) / lim; const e0 = N.P.distanceTo(N.home), far = moving && e0 > s * .15; return { N, e: e0 + (far && reach > .97 ? s : 0), urgent: far && reach > .995 }; }).filter((c) => c.e > thr).sort((a, b) => b.e - a.e)) {
        // a leg about to be pulled straight steps whatever the others are doing (but never all at once)
        if (!c.urgent) { if (busy >= need) continue; const up = ik.filter((M) => M.sw); if (up.length && !up.every((M) => M.grp === c.N.grp)) continue; } else if (busy >= (G.out ? mMax : n - 1)) continue; // a wide walker never lifts more than its pair
        c.N.sw = { t: 0, dur: sd, from: c.N.P.clone(), to: c.N.home.clone(), lift: c.N.len * (R.size > 150 ? .3 : .38) * (G.lift || (c.N.q.spike ? 1.3 : 1)) * clamp(c.e / s, .5, 1) }; if (G.out) { const ox = c.N.P.x - pos.x, oz = c.N.P.z - pos.z, ol = Math.hypot(ox, oz) || 1; c.N.sw.ox = ox / ol; c.N.sw.oz = oz / ol; c.N.sw.out = G.out * c.N.len; } if (c.N.q.spike) { const g = ground(c.N.P); dust(g, .35, 3); try { T.chunksFx(g, "#5a5048", 2, 14); } catch {} } busy++; }
      for (const N of ik) if (!N.sw) N.footW = N.P.clone();
      // the body leans off the lifted legs onto the ones holding it, and dips a little while it has fewer feet down
      let sx = 0, sz = 0, up = 0; ik.forEach((N) => { if (N.sw) { const u = Math.sin(Math.PI * Math.min(1, N.sw.t / N.sw.dur)); sx += Math.sign(N.foot.x) * u; sz += Math.sign(N.foot.z) * u; up += u; } });
      const k = 1 - Math.exp(-dt * 7), S2 = R.sup || (R.sup = { x: 0, r: 0, p: 0, y: 0 });
      R.cr = (R.cr || 0) + ((R.walkCrouch || 0) * clamp(pace / 3, 0, 1) - (R.cr || 0)) * (1 - Math.exp(-dt * 2.5)); // it sinks onto bent knees to walk, and rises when it stops
      S2.x += (-sx / n * R.size * .06 - S2.x) * k; S2.r += (sx / n * .09 - S2.r) * k; S2.p += (-sz / n * .05 - S2.p) * k; S2.y += (-up / n * R.size * .006 - S2.y) * k;
    }
    function tickWalk(R, dt) {
      const W = R.walk; if (!W) return; W.t += dt; const g = R.p.group;
      if (W.t < W.turnDur) { const u = W.t / W.turnDur; g.rotation.y = W.r0 + angTo(W.r0, W.r1) * (u * u * (3 - 2 * u)); g.position.copy(W.from); carry(R, W); return; }
      const k = Math.min(1, (W.t - W.turnDur) / W.dur), e = W.run && W.run.D > 0 ? Math.min(1, W.run.at(W.t - W.turnDur) / W.run.D) : k;
      g.rotation.y = W.r1; g.position.lerpVectors(W.from, W.to, e);
      g.position.y = T.baseY({ ...R.p.data, x: g.position.x, z: g.position.z });
      carry(R, W);
      if (k >= 1) {
        R.walk = null; if (!W.faceOnly) jolt(R, -R.size * .012, R.size * .004, .02); // and settles when it stops
        if (W.mine) {
          // read where the riders ended up before any put: a put re-applies every piece from its token
          const moved = W.riders.map((c) => { const q = T.pieces.get(c.id); if (!q) return null; const v = q.group.position; return [c.id, { ...q.data, x: v.x, z: v.z, y: v.y, rot: q.group.rotation.y }]; }).filter(Boolean);
          T.put(W.id, { ...R.p.data, x: W.to.x, z: W.to.z, rot: W.r1 });
          moved.forEach(([id, d]) => T.put(id, d));
        }
      }
    }

    /* ---------- every frame ---------- */
    function later(R, t, fn) { R.later.push({ t, fn }); }
    // two-bone IK: the thigh turns at the hip so the shin can reach A; the knee opens or closes; the paw stays level
    const _u = V3(), _n = V3(), Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion();
    function solveLeg(N, H, A) {
      const L1 = N.L1, L2 = N.L2; _u.subVectors(A, H); let d = _u.length(); _u.normalize();
      d = clamp(d, Math.abs(L1 - L2) + .01, L1 + L2 - .01);
      Q1.setFromUnitVectors(N.u0, _u);
      const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), be = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
      _n.copy(N.nrm).applyQuaternion(Q1); Q2.setFromAxisAngle(_n, N.al0 - al).multiply(Q1); N.n.quaternion.copy(Q2);
      Q3.setFromAxisAngle(N.nrm, N.be0 - be); N.S.n.quaternion.copy(Q3); N.S.n.position.copy(N.S.rest);
      N.F.n.quaternion.copy(Q2).multiply(Q3).invert(); N.F.n.position.copy(N.F.rest);
    }
    const Q = new THREE.Quaternion(), E = new THREE.Euler(), QA = new THREE.Quaternion();
    function tick(dt) {
      dt = Math.min(dt, .05); clock += dt;
      tickFxList(dt);
      rigs.forEach((R, id) => {
        const p = R.p;
        if (!p || !p.group.parent) { drop(id); return; }
        if (R.real && R.real.material !== hider) take(R);
        R.root.visible = !!(R.real && R.real.visible);
        for (let i = R.later.length - 1; i >= 0; i--) { const l = R.later[i]; l.t -= dt; if (l.t <= 0) { R.later.splice(i, 1); try { l.fn(); } catch (e) { console.error(e); } } }
        tickWalk(R, dt);
        if (R.dive) { R.dive.t += dt; const k = Math.min(1, R.dive.t / 1.05), loc = p.group.worldToLocal(R.dive.to.clone()); R.root.position.set(loc.x * k * k, loc.y * k * k + Math.sin(k * Math.PI) * 14, loc.z * k * k); R.root.rotation.x = k * .9; }
        // how far it moved this frame, whatever moved it
        const pos = p.group.position, rot = p.group.rotation.y;
        let dist = 0; if (R.lastPos) { dist = Math.hypot(pos.x - R.lastPos.x, pos.z - R.lastPos.z) + Math.abs(angTo(R.lastRot, rot)) * R.size * .35; }
        if (dist > R.size * 2) dist = 0; // a jump (undo, a scene change) is not a walk
        R.lastYawRate = R.lastPos ? angTo(R.lastRot, rot) / Math.max(dt, 1e-4) : 0; R.lastPos = pos.clone(); R.lastRot = rot;
        const fwd = R.lastV || 0; R.lastV = dist / Math.max(dt, 1e-4); R.linV = R.lastPos0 ? Math.hypot(pos.x - R.lastPos0.x, pos.z - R.lastPos0.z) / Math.max(dt, 1e-4) : 0; if (R.linV > R.size * 40) R.linV = 0; R.lastPos0 = pos.clone();
        R.move = approach(R.move, dist > .02 ? 1 : 0, dt * 4);
        const stride = Math.max(4, R.legLen * .9 || 10);
        R.gait += dist / stride * Math.PI;
        // lasting-state targets, then the body
        R.bodyOff.lerp(R.bodyOffT, 1 - Math.exp(-dt * 4)); R.rootOff.lerp(R.rootOffT, 1 - Math.exp(-dt * (R.type === "serpent" ? 1.1 : 6)));
        R.shake = Math.max(0, R.shake - dt * 1.8); R.thudT -= dt;
        { const w = R.size > 150 ? 6 : R.size > 70 ? 9 : 13, zt = .32; for (const c of ["y", "z", "p", "r", "x"]) { const a = w * w * (R.atkT[c] - R.atk[c]) - 2 * zt * w * R.atkV[c]; R.atkV[c] += a * dt; R.atk[c] += R.atkV[c] * dt; } }
        // speed, acceleration and turning, smoothed: what the body leans into
        { const v = R.linV || 0, k = 1 - Math.exp(-dt * 3), vs = R.vS; R.vS += (v - R.vS) * k; R.accS += (((R.vS - vs) / Math.max(dt, 1e-3)) - R.accS) * k; R.yawS += ((R.lastYawRate || 0) - R.yawS) * k; }
        if (!R.walk && !R.dive && !R.strafe && R.move < .1 && !R.nodes.some((N) => N.aim)) { R.idleT -= dt; if (R.idleT <= 0) { R.idleT = (R.size > 150 ? 4 : 2.5) + Math.random() * 4; try { idle(R); } catch (e) { console.warn(e); } } }
        const sh = R.shake * Math.min(3, R.size / 40);
        let by = 0, bx = 0, tx = 0, tz = 0, ty = 0; const big = R.size > 150, lean = clamp(R.accS * (big ? .0009 : .0014), -.1, .1), bank = clamp(-R.yawS * (R.flyer ? .5 : .12), -.35, .35);
        const breath = Math.sin(clock * (big ? .55 : .9) + R.size) * (1 - R.move);
        if (R.flyer) { by = Math.sin(clock * 1.4 + R.size) * 1.6 + Math.sin(clock * 3.1) * .3; tx = clamp(R.vS * .0016, 0, .26) + lean; tz = Math.sin(clock * .9) * .04 + bank; ty = Math.sin(clock * .5 + R.size) * .03;
          if (R.hover && R.hover < 90 && Math.random() < dt * 5) dust(ground(center(R)), clamp(R.size / 80, .4, 1.4), 4); } // rotor wash
        else if (R.sup && gaitOf(R)) { by = R.sup.y - (R.cr || 0) + breath * R.size * .006; bx = R.sup.x; tz = R.sup.r + bank; tx = lean + R.sup.p + breath * .012; }
        else if (R.legs.length) { const g2 = R.gait, m = R.move, amp = R.legLen * (big ? .03 : .05);
          by = (Math.abs(Math.sin(g2)) - .5) * amp * m + breath * R.size * .006;   // up over each stride, settling between
          bx = Math.sin(g2) * R.size * (big ? .012 : .018) * m;                    // its weight swings over the planted feet
          tz = Math.sin(g2) * (big ? .03 : .05) * m + bank; ty = Math.sin(g2) * .04 * m; tx = lean + breath * .012; }
        else { by = (Math.random() - .5) * .35 * R.move + breath * R.size * .003; tx = lean * 1.4; tz = bank * .5; } // tracks and wheels: suspension, nosing down as it brakes
        R.body.position.set(R.bodyOff.x + bx + R.atk.x + (Math.random() - .5) * sh, R.bodyOff.y + by + R.atk.y + (Math.random() - .5) * sh, R.bodyOff.z + R.atk.z + (Math.random() - .5) * sh);
        R.body.rotation.set(tx + R.atk.p + (Math.random() - .5) * R.shake * .02, ty, tz + R.atk.r);
        if (!R.flyer && !R.legs.length && R.move > .5 && Math.random() < dt * 5) dust(ground(worldOf(R, null, [(R.box.min.x + R.box.max.x) / 2, 0, R.box.min.z])), clamp(R.size / 160, .2, .8), 3); // tracks and wheels kick up dust
        if (R.strafe) { const S = R.strafe; S.t += dt; const k = Math.min(1, S.t / S.dur), L = Math.hypot(S.to.x, S.to.z) || 1, dx = S.to.x / L, dz = S.to.z / L, out = Math.sin(k * Math.PI), side = Math.sin(k * Math.PI * 2) * R.size * .8;
          R.root.position.set(dx * L * 1.15 * out + dz * side, -Math.min(R.hover * .5, 30) * out, dz * L * 1.15 * out - dx * side);
          R.root.rotation.set(Math.sin(k * Math.PI * 2) * .25, 0, -Math.cos(k * Math.PI * 2) * .3 * out);
          if (k >= 1) { R.strafe = null; R.root.rotation.set(0, 0, 0); } }
        else if (!R.dive) { R.root.position.copy(R.rootOff); if (R.churn > 0) { R.churn -= dt; R.root.position.x += (Math.random() - .5) * .8; if (Math.random() < .3) dust(ground(center(R)), .8, 6); } }
        planLegs(R, dt);
        // parts
        R.nodes.forEach((N) => {
          const q = N.q;
          if (N.ik) return; // shins and paws are set by their thigh
          if (N.S) { // a leg with a knee: the hip rides with the body, the paw steps
            const ph = R.gait + N.phase, step = Math.min(stride * .38, N.len * .32) * R.move;
            const A = N.footW ? R.root.worldToLocal(N.footW.clone()) : N.A0.clone();
            if (N.stomp) { const S = N.stomp; S.t += dt; const k = Math.min(1, S.t / S.dur), up = k < .5 ? Math.sin(k / .5 * Math.PI / 2) : k < .58 ? 1 - (k - .5) / .08 : 0, fw = k < .58 ? k / .58 : k < .78 ? 1 : 1 - (k - .78) / .22;
              A.copy(N.A0); A.y += up * N.len * (S.h || .55); A.z += fw * N.len * (S.f ?? .25); if (S.quiet && !S.down && k >= .58) { S.down = true; R.root.updateMatrixWorld(true); footfall(R, R.root.localToWorld(A.clone()), Math.sign(A.x)); } if (k >= 1) N.stomp = null; }
            else if (!N.footW) footstep(R, N, Math.cos(ph), A);
            if (q.spike) { const want = N.sw && N.sw.t > .02 ? 0 : q.spike; N.sink = approach(N.sink || 0, want, q.spike / (want > (N.sink || 0) ? .07 : .16) * dt); A.y -= N.sink; }
            N.n.position.copy(N.rest).add(R.body.position);
            solveLeg(N, N.n.position, A); return;
          }
          if (q.pitch) {
            const P = R.nodes[q.parentIx]; let want = 0;
            if (P && P.aim && P.q.muzzle) {
              const v = P.n.worldToLocal(P.aim.clone()).sub(N.rest), m = V3(P.q.muzzle).sub(V3(q.pivot));
              want = -(Math.atan2(v.y, Math.hypot(v.x, v.z)) - Math.atan2(m.y, Math.hypot(m.x, m.z)));
              if (P.q.shot === "mortar") want = -.35 - clamp(.25 - Math.hypot(v.x, v.z) / 3000, 0, .25);
            } else if (P && P.sweepT > 0) want = Math.sin(clock * 3) * .08;
            N.pitch = approach(N.pitch || 0, clamp(want, -1.1, .7), dt * (R.size > 150 ? .5 : 1.6));
          }
          if (N.delay > 0) N.delay -= dt; else { N.off.x = approach(N.off.x, N.offT.x, N.rate * dt * 4); N.off.y = approach(N.off.y, N.offT.y, N.rate * dt * 4); N.off.z = approach(N.off.z, N.offT.z, N.rate * dt * 4); N.rx = approach(N.rx, N.rxT, N.rate * dt); N.rz = approach(N.rz, N.rzT, N.rate * dt); }
          N.kick = Math.max(0, N.kick - dt * 10);
          let swing = 0, lift = 0;
          if (q.kind === "leg") {
            const ph = R.gait + N.phase, amp = clamp(stride * .45 / Math.max(1, N.len), .1, .32) * R.move;
            swing = Math.sin(ph) * amp; lift = Math.max(0, Math.cos(ph)) * N.len * .07 * R.move;
            if (q.foot) footstep(R, N, Math.cos(ph), V3(q.foot));
          }
          // turrets: aim, look around while scanning, drift a little at rest
          if (N.restYaw != null || q.kind === "head") {
            let want = N.yaw;
            if (N.aim) { const loc = N.n.parent.worldToLocal(N.aim.clone()); want = Math.atan2(loc.x - N.rest.x, loc.z - N.rest.z) - (N.restYaw || 0); }
            else if (N.look) { const loc = N.n.parent.worldToLocal(N.look.clone()); want = Math.atan2(loc.x - N.rest.x, loc.z - N.rest.z) - (N.restYaw || 0); }
            else if (N.sweepT > 0) { N.sweepT -= dt; want = Math.sin((2.8 - N.sweepT) / 2.8 * Math.PI * 2) * .8; }
            else if (R.st.dig && q.name === "house") want = Math.sin(clock * .3) * .5;
            else want = Math.sin(clock * .21 + N.rest.x) * .12;
            const lim = q.yaw; want = N.yaw + angTo(N.yaw, want); if (lim) want = clamp(want, -lim, lim);
            { const calm = !N.aim && !N.sweepT, w = calm ? (R.size > 150 ? 1.1 : 1.8) : R.size > 150 ? 3.4 : 6, zt = calm ? 1 : .42, a = w * w * (want - N.yaw) - 2 * zt * w * (N.yawV || 0), vmax = calm ? (R.size > 150 ? .25 : .6) : R.size > 150 ? 1.3 : 3; N.yawV = clamp((N.yawV || 0) + a * dt, -vmax, vmax); N.yaw += N.yawV * dt; if (lim) N.yaw = clamp(N.yaw, -lim, lim); }
          }
          if (q.kind === "house") { const want = R.st.dig ? Math.sin(clock * .3) * .5 : 0; N.yaw = approach(N.yaw, want, dt * .3); }
          // spinning parts
          if (N.axis) {
            let w = q.spin != null ? q.spin : 0;
            if (q.kind === "wheel") w = (q.idle || 0) + (R.lastV / Math.max(1, q.r || 6)) * (q.r > 20 ? 0 : 1) + (N.fast ? 18 : 0);
            if (q.kind === "wheel" && q.r > 20) w = R.st.dig ? 1.1 : 0;
            if (q.kind === "drill") w = R.churn > 0 || R.move > .1 ? 14 : 1.5;
            if (N.fast) { N.fast -= dt; if (N.fast <= 0) N.fast = 0; }
            N.ang += w * dt;
          }
          N.n.position.copy(N.rest).add(N.off); N.n.position.y += lift;
          if (N.kick && N.restYaw != null) { const a = (N.restYaw || 0) + N.yaw; N.n.position.x -= Math.sin(a) * N.kick * .5; N.n.position.z -= Math.cos(a) * N.kick * .5; }
          E.set(N.rx + swing + (N.pitch || 0), N.yaw, N.rz); N.n.quaternion.setFromEuler(E);
          if (N.axis) { QA.setFromAxisAngle(N.axis, N.ang); N.n.quaternion.premultiply(QA); }
        });
        // a damaged machine smokes; a jamming one pulses; a digging one throws rubble
        R.smokeT -= dt;
        if (R.smokeT <= 0 && R.root.visible) {
          R.smokeT = .45 + Math.random() * .4;
          if ((p.data.variant || "timber") === "damaged") { smoke(boxPoint(R, true), Math.min(2, R.size / 50), 3); if (Math.random() < .25) sparks(boxPoint(R), 5, .7); }
          if (R.st.jam && Math.random() < .6) { const c = center(R); pulse(ground(c).add(V3(0, 1, 0)), "#c69cff", R.size * 4, 1.6); T.puff(c, { n: 8, color: "#c69cff", size: 2.4, life: .5, vel: () => V3((Math.random() - .5) * 60, (Math.random() - .5) * 60, (Math.random() - .5) * 60) }); }
          if (R.st.dig) { const w = R.nodes.find((N) => N.q.kind === "wheel" && N.q.r > 20); if (w) { const f = worldOf(R, w, [w.q.pivot[0], w.q.pivot[1] - 40, w.q.pivot[2]]); dust(ground(f), 2, 12); try { T.chunksFx(f, "#6b6258", 2, 30); } catch {} if (Math.random() < .3) sfx("m-grind"); } }
        }
        if (R.blink > 0) { R.blink -= dt; if (Math.sin(clock * 30) > .6) T.puff(center(R), { n: 3, color: "#ff3a2a", size: 4, life: .1, vel: () => V3() }); }
      });
    }

    /* ---------- the selection panel ---------- */
    let arming = null;
    function arm(label, cb) {
      disarm();
      const canvas = T.canvas, down = (e) => {
        if (e.target !== canvas) return;
        e.stopImmediatePropagation(); e.preventDefault();
        if (e.button !== 0) { disarm(); return; }
        const at = T.aimAt(e); disarm();
        const swallow = (u) => { u.stopImmediatePropagation(); }; addEventListener("pointerup", swallow, { capture: true, once: true }); addEventListener("click", swallow, { capture: true, once: true });
        if (at) cb(at);
      };
      const key = (e) => { if (e.key === "Escape") disarm(); };
      addEventListener("pointerdown", down, true); addEventListener("keydown", key, true);
      canvas.style.cursor = "crosshair";
      arming = { down, key, label };
      T.toast && T.toast(label + " (Esc to cancel)");
    }
    function disarm() { if (!arming) return; removeEventListener("pointerdown", arming.down, true); removeEventListener("keydown", arming.key, true); T.canvas.style.cursor = ""; arming = null; }

    // everything a machine can do just now, for a Table's menu: { group: move | attack | special | other, label, act, shot, aim, key, on }
    function actions(R, d) {
      const st = (d && d.mstate) || {}, out = [];
      if (!st.planted && !st.under) out.push({ group: "move", act: "walk", label: R.flyer ? "Fly to" : "Walk to", aim: true, hint: "Click where it goes" });
      for (const s of shotKinds(R)) out.push({ group: "attack", act: "fire", shot: s, label: SHOT_NAME[s] || "Fire", aim: true });
      if (STOMP.has(R.type) && R.legs.some((N) => N.S) && !st.planted) out.push({ group: "attack", act: "stomp", label: "Stomp", aim: true });
      for (const sp of [...(SPECIALS[R.type] || []), ...(MORE[R.type] || [])]) {
        if (sp.key) out.push({ group: "special", key: sp.key, on: !st[sp.key], label: st[sp.key] ? sp.off : sp.on });
        else out.push({ group: sp.aim && sp.act !== "mark" ? "attack" : "special", act: sp.act, label: sp.label, aim: !!sp.aim });
      }
      out.push({ group: "special", act: "scan", label: "Scan" }, { group: "other", act: "hit", label: "Take a hit" }, { group: "other", act: "wreck", label: "Wreck", danger: true });
      return out;
    }
    // carry one out: at is the point clicked, for one that is aimed
    function run(id, a, d, at) {
      if (a.key) { const st = (d && d.mstate) || {}; T.put(id, { ...d, mstate: { ...st, [a.key]: a.on } }); send({ id, act: "state", key: a.key, on: a.on }); return; }
      if (a.act === "walk") { if (at) send({ id, act: "walk", to: [at.x, at.z] }); return; }
      const o = { id, act: a.act }; if (a.shot) o.shot = a.shot; if (at) o.at = [at.x, at.y, at.z]; send(o);
    }
    function panel(d, id, el) {
      if (!el) return; const old = el.querySelector(".mach-row"); if (old) old.remove();
      const R = rigs.get(id);
      if (!R || d.kind !== "building" || !T.canMove(d)) return;
      const row = document.createElement("div"); row.className = "sel-row mach-row"; row.style.marginTop = "4px";
      row.innerHTML = `<span class="sub">Machine</span><div class="row" style="flex-wrap:wrap"></div>`;
      const box = row.querySelector(".row"), btn = (label, fn) => { const b = document.createElement("button"); b.className = "btn"; b.textContent = label; b.onclick = fn; box.append(b); return b; };
      for (const a of actions(R, d)) {
        const b = btn(a.label, () => { if (a.aim) arm(a.hint || "Click a target", (at) => run(id, a, d, at)); else { run(id, a, d); if (a.key) setTimeout(() => T.refresh && T.refresh(), 80); } });
        if (a.danger) b.classList.add("danger");
      }
      el.append(row);
    }

    return { sync, tick, fx: fxIn, panel, rigs, disarm, arm, run, actions: (id) => { const R = rigs.get(id); return R ? actions(R, R.data) : []; }, _weapons: weapons };
  };
})();
