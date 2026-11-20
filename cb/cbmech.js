/* Circuit Breaker: the machine troopers, v2 (15 Nov 2026).
   The machines' old humanoid models, built from Hayden's cut-limb Automata kit (the separate legs, torsos, heads, arms and
   weapons he dropped in Intake) instead of being cut out of posed minis. Every trooper shares one pair of legs (Legs 01,
   plain or with pouches), one arm (Arms 12, with its shoulder pad on the torso) and differs by torso, head and weapon:
     Light  - Torso 01 Basic,      Head 01
     Medium - Torso 03 Caged Kevlar, Head 05
     Jump   - Torso 06 Caged Kevlar Backpack, Head 08
     Heavy  - Torso 07 Caged Full Load, Head 03
   Each part is straightened at its own joint (hip, knee, ankle, shoulder, elbow, wrist, waist, neck ball) and hung on the
   soldier kit's skeleton (soldiers.js), so a trooper walks, runs, takes cover, aims, fires, reloads, throws, falls and goes
   down exactly as a soldier does, with its legs under its hips and its trunk upright. Their own guns from the kit (the AR,
   the grenade launcher, the heavy pistol and the hack knife) replace the soldier's.

   CBMech.dress(s, kind, THREE, material) dresses a figure from RevelrySoldiers().make(); CBMech.arm(s, THREE, material)
   swaps its weapons for the kit's (call it after anything else that changes the weapon, e.g. wieldItem). Paint: plates
   take the season's camo when the material does it (aCamo 1 and 2); the frame is gunmetal; accents burnt orange; the
   visor glows (brighter than white, so it blooms). */
(function () {
  const D = window.CB_MECH_DATA; if (!D || D.v !== 2) return;
  const bytes = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  const SCHEMES = {
    // frame, plate, second plate, accent, glow
    worn: ["#34373a", "#b9b3a4", "#8f8a80", "#c45a1e", [3.2, 1.0, .28]],
    steel: ["#2b2e31", "#7d848a", "#5d6469", "#b0312a", [3.0, .5, .25]],
    drab: ["#30302a", "#6e6a4e", "#55533e", "#c9a03a", [2.6, 1.4, .3]],
    black: ["#1e2022", "#45494d", "#36393c", "#c45a1e", [.5, 2.2, 3.2]],
    gun: ["#1f2123", "#3a3d40", "#2c2f31", "#c45a1e", [3.0, 1.0, .3]],
  };
  const KINDS = { light: { name: "Light trooper" }, medium: { name: "Medium trooper" }, jump: { name: "Jump trooper" }, heavy: { name: "Heavy trooper" },
    controller: { name: "Controller", drone: true }, prototype: { name: "Prototype" }, uav: { name: "UAV drone", flyer: true } };
  // which of the kit's weapons stands in for each soldier weapon
  const GUN = { rifle: "ar", dmr: "ar", lmg: "gl", shotgun: "gl", pistol: "pistol", machete: "knife", axe: "knife", bat: "knife" };
  const cache = new Map();
  function geo(THREE, key, scheme, camo = true) {
    const ck = key + "/" + scheme; if (cache.has(ck)) return cache.get(ck);
    const P = D.parts[key]; if (!P) return null;
    const q = new Int16Array(bytes(P.p)), idx = new Uint16Array(bytes(P.i)), k = new Uint8Array(bytes(P.k)), sh = new Uint8Array(bytes(P.s));
    const n = k.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), cam = new Float32Array(n * 2), S = SCHEMES[scheme] || SCHEMES.worn;
    const C = S.map((c) => (Array.isArray(c) ? c : new THREE.Color(c).toArray()));
    for (let i = 0; i < n; i++) {
      pos[i * 3] = q[i * 3] / 1000; pos[i * 3 + 1] = q[i * 3 + 1] / 1000; pos[i * 3 + 2] = q[i * 3 + 2] / 1000;
      const kk = k[i], s = kk === 4 ? 1 : sh[i] / 200, c = C[kk] || C[1];
      col[i * 3] = c[0] * s; col[i * 3 + 1] = c[1] * s; col[i * 3 + 2] = c[2] * s;
      cam[i * 2] = camo ? (kk === 1 ? 1 : kk === 2 ? 2 : 0) : 0; cam[i * 2 + 1] = s;
    }
    let g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("aCamo", new THREE.BufferAttribute(cam, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g = g.toNonIndexed(); g.computeVertexNormals(); g.computeBoundingSphere(); cache.set(ck, g); return g;
  }
  /* Drones (15 Nov): the kit's deployed UAV (Accessories UAV_Drone Deployed). A Controller (Torso 08 with its launcher
     empty) keeps its drone hovering over its shoulder, circling slowly and turning to whatever the Controller aims at.
     A UAV drone token is a figure with no body: the drone hovers at chest height where its gun fires from, never takes
     cover, and drops to the ground when it goes down. */
  const DRONES = []; let ticking = false;
  function droneMesh(THREE, material) { const g = geo(THREE, D.uav, "steel"); const m = new THREE.Mesh(g, material); m.castShadow = true; m.userData.mech = true; return m; }
  let lastT = 0;
  function tickDrones() {
    const t = performance.now() / 1000, dt = Math.min(.1, lastT ? t - lastT : .016); lastT = t; const k = Math.min(1, dt * 3.6);
    for (let i = DRONES.length - 1; i >= 0; i--) {
      const d = DRONES[i], s = d.s;
      if (!s.root.parent) { if (d.free && d.mesh.parent) d.mesh.parent.remove(d.mesh); DRONES.splice(i, 1); continue; }
      const dead = s.dead >= 0;
      if (d.free) { // the Controller's drone: in world space, following its operator
        const p = s.root.position, a = t * .45 + d.ph, want = dead ? null : { x: p.x + Math.cos(a) * 9, y: (s.baseY || 0) + 34 + Math.sin(t * 1.7 + d.ph) * 1.2, z: p.z + Math.sin(a) * 9 };
        const m = d.mesh;
        if (want) { m.position.x += (want.x - m.position.x) * k; m.position.y += (want.y - m.position.y) * k; m.position.z += (want.z - m.position.z) * k; d.vy = 0; }
        else { d.vy = (d.vy || 0) - 70 * dt; m.position.y = Math.max(1.5, m.position.y + d.vy * dt); m.rotation.z += (.6 - m.rotation.z) * k; }
        const look = s.aim && !dead ? Math.atan2(s.aim.x - m.position.x, s.aim.z - m.position.z) : s.yaw;
        let dy = look - m.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); m.rotation.y += dy * k; m.rotation.x = dead ? m.rotation.x : Math.sin(t * 1.3 + d.ph) * .05;
      } else { // a UAV token: the drone rides the figure's root
        const m = d.mesh;
        if (dead) { d.vy = (d.vy || 0) - 70 * dt; m.position.y = Math.max(1.2, m.position.y + d.vy * dt); m.rotation.z += (.7 - m.rotation.z) * k; }
        else { d.vy = 0; m.position.y = 16 + Math.sin(t * 1.9 + d.ph) * .9; m.rotation.z = Math.sin(t * 1.1 + d.ph) * .06; m.rotation.x = (s.trav || s.goal ? .18 : 0) + Math.sin(t * 1.4 + d.ph) * .04; }
      }
    }
    if (DRONES.length) requestAnimationFrame(tickDrones); else ticking = false;
  }
  function addDrone(s, THREE, material, free) {
    const m = droneMesh(THREE, material); const d = { s, mesh: m, free, ph: Math.random() * 6.28 };
    if (free) { m.position.copy(s.root.position).add(new THREE.Vector3(6, 34, 0)); s.root.parent.add(m); } else { s.root.add(m); m.position.set(0, 16, 0); }
    DRONES.push(d); s.drone = m; if (!ticking) { ticking = true; requestAnimationFrame(tickDrones); }
  }
  function dress(s, kind, THREE, material, o = {}) {
    if (kind === "uav") { if (s.mech) return s; // no body: hide the figure, keep its gun's muzzle working from where the drone hovers
      s.root.traverse((c) => { if (c.isMesh) c.visible = false; }); s.mech = "uav"; s.autoCover = false; s.noCover = true;
      s.build = { ...s.build, h: 1, bulk: 1, tw: 1, td: 1 };
      for (const fn of ["hit", "die"]) { const f0 = s[fn]; s[fn] = function () { window.CB_MECH_HIT = true; try { return f0.apply(this, arguments); } finally { window.CB_MECH_HIT = false; } }; }
      addDrone(s, THREE, material, false); return s; }
    const K = D.kinds[kind]; if (!K || s.mech) return s;
    const scheme = o.scheme || K.scheme || "worn", J = K.joints, M = K.map;
    const keep = new Set([s.nade]); for (const w in s.W) { keep.add(s.W[w].magHand); keep.add(s.W[w].magIn); }
    const joints = [s.pelvis, s.spine, s.chest, s.neck, s.head, s.LL.th, s.LL.sh, s.LL.ft, s.LR.th, s.LR.sh, s.LR.ft, s.AL.up, s.AL.fo, s.AL.hd, s.AR.up, s.AR.fo, s.AR.hd];
    for (const j of joints) for (const c of j.children) if (c.isMesh && !keep.has(c)) c.visible = false;
    // the kit's joints: the trunk turns at the waist (spine), the chest sits on it, the head on the neck ball
    s.spine.position.set(...J.spine); s.chest.position.set(...J.chest); s.neck.position.set(...J.neck); s.head.position.set(...J.head);
    for (const [g, sd] of [[s.AL, 1], [s.AR, -1]]) g.up.position.set(sd * J.shoulder[0], J.shoulder[1], J.shoulder[2]);
    for (const [g, sd] of [[s.LL, 1], [s.LR, -1]]) g.th.position.set(sd * J.hip[0], J.hip[1], J.hip[2]);
    const add = (j, key, mirror) => { const g = geo(THREE, key, scheme); if (!g) return; const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; if (mirror) m.scale.x = -1; m.userData.mech = true; j.add(m); };
    add(s.pelvis, M.pelvis); add(s.chest, M.chest); add(s.head, M.head);
    // every limb was stored for the figure's left side (+x); the right is its mirror
    for (const [L, A, mir] of [[s.LL, s.AL, false], [s.LR, s.AR, true]]) { add(L.th, M.th, mir); add(L.sh, M.sh, mir); add(L.ft, M.ft, mir); add(A.up, M.up, mir); add(A.fo, M.fo, mir); add(A.hd, M.hd, mir); }
    s.build = { ...s.build, h: K.h || 1, bulk: 1, tw: 1, td: 1 };
    s.mech = kind;
    // a hit on a machine throws sparks, not blood (cb.html's blood effect reads this flag)
    for (const fn of ["hit", "die"]) { const f0 = s[fn]; s[fn] = function () { window.CB_MECH_HIT = true; try { return f0.apply(this, arguments); } finally { window.CB_MECH_HIT = false; } }; }
    arm(s, THREE, material);
    if (kind === "controller" && s.root.parent) addDrone(s, THREE, material, true);
    return s;
  }
  // the kit's own weapons in place of the soldier's: geometry and the points the hands and the muzzle flash use
  function arm(s, THREE, material) {
    if (!s.mech || !s.W) return;
    if (s.mech === "uav") { for (const k in s.W) s.W[k].obj.visible = false; return; }
    for (const slot of ["primary", "sidearm"]) {
      const W = s.W[slot]; if (!W) continue; const kind = W.R.kind || (slot === "sidearm" ? "pistol" : "rifle"), id = GUN[W.R.pistol ? "pistol" : kind];
      const w = id && D.weapons[id]; if (!w) continue; const g = geo(THREE, w.key, "gun", false); if (!g) continue;
      W.obj.geometry = g; if (material) W.obj.material = material;
      for (const k of ["grip", "support", "muzzle", "magwell"]) if (w[k]) W.R[k] = new THREE.Vector3(...w[k]);
      if (W.magIn) W.magIn.visible = false; W.R.noMag = true;
    }
  }
  window.CBMech = { dress, arm, KINDS, SCHEMES, kinds: Object.keys(D.kinds) };
})();
