/* Afterburn: what the pilot sees of themself: two arms, two gloved hands, and whatever they are holding.
   Everything here lives in the small scene drawn over the world (the camera is at the origin, looking down -z).
   The weapon hangs on a rig that is pushed about by springs: recoil throws it back and up and it snaps home, it trails
   the view a little when you turn, it dips when you land and drops to a carry when you sprint. The right hand stays on
   the grip. The left hand rides the foregrip until a move needs it:
   - a reload: the rifle rolls over, the hand strips the magazine, goes down for a fresh one, seats it with a slap and
     racks the handle;
   - a swap: the weapon drops away and the other is brought up and settles;
   - a grenade: the hand goes to the belt, comes up, cocks back and throws;
   - the knife: the rifle is swung out of the way and the left hand cuts across.
   Each move is a set of key poses on a clock from 0 to 1, eased so that the fast parts are fast and the stops are hard.
   game.js owns the rules (ammunition, timers, what gets hit); this file only shows them. */
import { THREE, gunScene, gunMat, clamp, lerp, rnd } from "./engine.js";
import { loadModel, cloneSkinned } from "./puppet.js";
import { build, box as B, drum as C, loft as Lf, ball as Bl } from "./parts.js";

const S = { gun: "#3d444a", gun2: "#4b5258", dark: "#1c1d1f", mag: "#2e3236", suit: "#6f745c", wrap: "#8c917a", shell: "#d6cfb8", accent: "#c45a1e", steel: "#9aa0a4", grit: .75, gritScale: 26 };
const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(.35, 1.25, 1.5) }), hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .8, .4) });
const root = new THREE.Group(); gunScene.add(root);
const rig = new THREE.Group(); root.add(rig);
const X = Math.PI / 2;

/* ---------- the weapons, built along -z from the grip ---------- */
function rifle(o, mat = gunMat) { const g = new THREE.Group(), bl = o.barrel, body = [B(.05, .078, .3, 0, .022, -.08, "gun"), B(.036, .014, .28, 0, .066, -.1, "dark"), Lf([[.1, .058, .064], [.1 + o.guard, .05, .056]], 0, .022, 0, "gun2", 8, .5, -X),
    C(.012, bl, 0, .028, -.1 - o.guard - bl / 2, "dark", "z", 8), C(.019, .05, 0, .028, -.1 - o.guard - bl, "gun", "z", 8), B(.036, .095, .046, 0, -.058, .032, "dark", .3), B(.012, .012, .07, 0, -.022, -.01, "dark"),
    B(.042, .07, .2, 0, .004, .2, "gun2"), B(.046, .09, .03, 0, 0, .31, "dark"), B(.03, .02, .06, 0, .083, -.06, "dark"), B(.012, .03, .012, 0, .08, -.1 - o.guard + .02, "dark"), B(.04, .012, .3, 0, -.012, -.2, "accent")];
  if (o.scope) body.push(C(.021, .19, 0, .118, -.04, "dark", "z", 10), C(.027, .04, 0, .118, -.15, "gun", "z", 10), C(.024, .03, 0, .118, .06, "gun", "z", 10), B(.02, .03, .03, 0, .092, -.08, "dark"), B(.02, .03, .03, 0, .092, .01, "dark"));
  if (o.pistol) body.splice(7, 2);
  if (!o.scope) body.push(B(.042, .008, .052, 0, .088, -.06, "dark"), B(.005, .04, .03, -.02, .108, -.06, "dark"), B(.005, .04, .03, .02, .108, -.06, "dark"), B(.044, .005, .03, 0, .129, -.06, "dark"), B(.004, .004, .002, 0, .108, -.06, "glow"));   // an open frame with a dot in it, so there is something to look through
  build(g, body, S, glow, mat);
  const mag = new THREE.Group(); mag.position.set(0, -.018, -.075); mag.rotation.x = -.12; g.add(mag); build(mag, [B(.03, o.mag, .052, 0, -o.mag / 2, 0, "mag"), B(.034, .014, .056, 0, -o.mag + .004, 0, "dark"), B(.032, .01, .054, 0, -.03, 0, "steel")], S, glow, mat);
  const bolt = new THREE.Group(); bolt.position.set(.03, .05, .04); g.add(bolt); build(bolt, [B(.03, .014, .03, 0, 0, 0, "steel")], S, glow, mat);
  g.userData = { sightY: o.scope ? .152 : .108, mag, bolt, fore: new THREE.Vector3(0, -.008, -.12 - o.guard * .55), well: new THREE.Vector3(0, -.09, -.07), top: new THREE.Vector3(.035, .05, .06), muzzle: new THREE.Vector3(0, .028, -.13 - o.guard - bl), magLen: o.mag }; return g; }
function charger(mat = gunMat) { const g = new THREE.Group(); build(g, [B(.06, .09, .34, 0, .022, -.1, "gun"), Lf([[.1, .075, .085], [.4, .06, .07]], 0, .025, 0, "gun2", 8, .5, -X), C(.016, .3, 0, .03, -.55, "dark", "z", 8), ...[0, 1, 2, 3].map((i) => B(.085, .085, .012, 0, .03, -.3 - i * .045, "dark")),
    C(.03, .08, 0, .03, -.7, "gun", "z", 10), B(.036, .095, .046, 0, -.058, .032, "dark", .3), B(.044, .075, .2, 0, .004, .2, "gun2"), B(.048, .095, .03, 0, 0, .31, "dark"), B(.05, .05, .09, 0, .1, -.04, "dark"), B(.045, .1, .07, 0, -.05, -.1, "accent")], S, glow, mat);
  const coil = new THREE.Mesh(new THREE.BoxGeometry(.045, .045, .11), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 2.4, 3) })); coil.position.set(0, .03, -.62); g.add(coil);
  g.userData = { coil, fore: new THREE.Vector3(0, -.01, -.3), well: new THREE.Vector3(0, -.09, -.1), top: new THREE.Vector3(.035, .05, .06), muzzle: new THREE.Vector3(0, .03, -.75) }; return g; }
const SPEC = { shotgun: { barrel: .14, guard: .34, mag: .035 }, pistol: { barrel: .03, guard: .09, mag: .1, pistol: true }, carbine: { barrel: .2, guard: .26, mag: .12 }, longrifle: { barrel: .36, guard: .3, mag: .09, scope: true }, smg: { barrel: .08, guard: .16, mag: .17 } };
/* The assault rifle is a model (models/rifle.glb): one mesh, no moving parts of its own. Its magazine is cut away from the
   rest by where its triangles lie (below the well, between the grip and the front of the well), so it can come out, and
   it is given a top so it looks whole in the hand. The model is 1 unit long with its muzzle toward +z; here it is turned
   to point along -z with the grip at the origin, like the built guns, and carries the same marks they do (where the
   hands go, the muzzle, the sight line), so the reload, the recoil and everything else written for them plays on it. */
const RM = await loadModel("rifle.glb", "mfRifle"), RSC = .9, RMATS = {};
function modelRifle(mat) { if (!RM) return null; let src = null; RM.scene.traverse((o) => { if (o.isMesh) src = o; }); const key = mat === gunMat ? "held" : "prop", tex = RMATS[key] || (RMATS[key] = RM.mk("#ffffff", key, mat === gunMat ? "0.6" : "0.5"));
  const pos = src.geometry.attributes.position, idx = src.geometry.index.array, body = [], mag = [];
  for (let i = 0; i < idx.length; i += 3) { let cy = 0, zl = 9, zh = -9, yh = -9; for (let k = 0; k < 3; k++) { const v = idx[i + k], y = pos.getY(v), z = pos.getZ(v); cy += y / 3; zl = Math.min(zl, z); zh = Math.max(zh, z); yh = Math.max(yh, y); }
    (cy < .128 && zl > -.08 && zh < .035 && yh < .145 ? mag : body).push(idx[i], idx[i + 1], idx[i + 2]); }
  const M = new THREE.Matrix4().makeRotationY(Math.PI).scale(new THREE.Vector3(RSC, RSC, RSC)).setPosition(0, .028 - .31 * RSC, -.12), geo = (ix) => { const g = src.geometry.clone(); g.setIndex(ix); g.applyMatrix4(M); return g; }, bodyG = geo(body), magGeo = geo(mag), part = (g) => { const m = new THREE.Mesh(g, tex); m.frustumCulled = false; return m; };
  const g = new THREE.Group(); g.add(part(bodyG));
  const top = [B(.03, .07, .074, .004, -.125, -.1, "dark", -.44)], magG = new THREE.Group(); magG.position.set(0, -.018, 0); { const m = part(magGeo); m.position.y = .018; magG.add(m); } const cap = new THREE.Group(); cap.position.y = .018; magG.add(cap); build(cap, top, S, glow, mat); g.add(magG);
  const bolt = new THREE.Group(); bolt.position.set(.046, .052, .04); g.add(bolt); build(bolt, [B(.014, .014, .034, 0, 0, 0, "steel")], S, glow, mat);
  // a magazine on its own, centred, for the hand and for the one that falls
  const loose = () => { const o = new THREE.Group(), m = part(magGeo); m.position.set(0, .19, .1); o.add(m); const c = new THREE.Group(); c.position.set(0, .19, .1); o.add(c); build(c, top, S, glow, mat); return o; };
  g.userData = { sightY: .128, mag: magG, bolt, loose, grip: new THREE.Vector3(.004, -.105, .05), fore: new THREE.Vector3(0, -.06, -.27), well: new THREE.Vector3(0, -.19, -.1), top: new THREE.Vector3(.046, .052, .06), muzzle: new THREE.Vector3(0, .028, -.12 - .5 * RSC), magLen: .12 }; return g; }
// the rifle for a figure to carry: built along +z from the butt of its stock, about 0.75 m long
export function carriedRifle(mat) { const r = modelRifle(mat); if (!r) return null; const s = .75 / RSC, o = new THREE.Group(); r.rotation.y = Math.PI; r.scale.setScalar(s); r.position.set(0, -.028 * s, (.5 * RSC - .12) * s); o.add(r); return o; }
export const gunProp = (kind, mat) => (kind === "charge" ? charger(mat) : (kind === "carbine" && modelRifle(mat)) || rifle(SPEC[kind] || SPEC.carbine, mat));   // the same guns as the ones in your hands, for standing about in the garage
const GUNS = { charge: charger() }; for (const k in SPEC) GUNS[k] = (k === "carbine" && modelRifle(gunMat)) || rifle(SPEC[k]);
for (const k in GUNS) { GUNS[k].visible = false; rig.add(GUNS[k]); }

/* ---------- arms: the hand is at the arm's origin and the forearm runs back along +z toward the elbow ---------- */
function arm(sd) { const a = new THREE.Group(); build(a, [Bl(.088, .055, .105, 0, 0, 0, "dark"), ...[-.03, -.01, .01, .03].flatMap((x) => [B(.018, .03, .055, x, -.016, -.062, "dark"), B(.018, .046, .02, x, -.04, -.086, "dark")]), B(.022, .026, .06, sd * .048, -.004, -.034, "dark", 0, 0, sd * .5), B(.06, .012, .05, 0, .03, .0, "shell"),
    Lf([[.03, .086, .074], [.08, .098, .088]], 0, 0, 0, "dark", 10, 0, X), Lf([[.07, .09, .08], [.2, .108, .1], [.5, .125, .118]], 0, 0, 0, "suit", 10, 0, X), Lf([[.11, .108, .1], [.26, .128, .12]], 0, 0, 0, "wrap", 10, 0, X), Lf([[.13, .05, .13, 0, .0], [.24, .06, .15]], sd * .05, 0, 0, "shell", 8, .3, X),
    Lf([[.105, .112, .104], [.118, .112, .104]], 0, 0, 0, "dark", 10, 0, X), Lf([[.25, .132, .124], [.264, .132, .124]], 0, 0, 0, "dark", 10, 0, X)], S, glow, gunMat); a.userData.built = a.children.slice(); root.add(a); return a; }
const TUNE = { tiltR: 0, tiltL: 0 }; globalThis.__armTune = TUNE;
const armR = arm(1), armL = arm(-1), elbowR = new THREE.Vector3(.36, -.52, .3), elbowL = new THREE.Vector3(-.42, -.6, .22);
/* The arms you see are the pilot model's own (models/pilot.glb): the same suit, bracers and gloves other players see on
   you, with fingers that close. Each built arm above stays as the thing the moves steer (a point at the palm, the forearm
   running back toward the elbow); the model's arm is hung on it so its palm sits on that point and its forearm lies
   along that line, and the built arm's own pieces are hidden. Only the triangles that belong to one arm are kept from the
   model. Fingers are curled bone by bone toward the palm: closed on the grip and the handguard, the first finger
   squeezing on a shot, the left hand opening when it lets go to fetch something and closing again on what it holds. */
const PM = await loadModel("pilot.glb", "mfPilot", "#c08f84"), FING = ["Index", "Middle", "Ring", "Pinky"], ARMS = {};
function modelArm(driver, sideName) { if (!PM) return null; const box = new THREE.Group(), mdl = cloneSkinned(PM.scene); box.scale.setScalar(1.84); box.add(mdl); let skin = null; mdl.traverse((o) => { if (o.isSkinnedMesh) skin = o; });
  // keep only this arm: triangles whose corners all hang mostly on its bones
  const names = skin.skeleton.bones.map((b) => b.name), mine = names.map((n) => n.startsWith("mixamorig" + sideName) && /Arm|Hand/.test(n)), si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight, idx = skin.geometry.index.array, keep = [];
  const own = (v) => { let w = 0; for (let k = 0; k < 4; k++) if (mine[si.getComponent(v, k)]) w += sw.getComponent(v, k); return w > .5; };
  for (let i = 0; i < idx.length; i += 3) if (own(idx[i]) && own(idx[i + 1]) && own(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  const g = skin.geometry.clone(); g.setIndex(keep); skin.geometry = g; skin.material = ARMS.mat || (ARMS.mat = PM.mk("#ffffff", "arm", "0.6")); skin.frustumCulled = false;
  // where the hand is at rest, and which way is which
  box.updateMatrixWorld(true); const bone = (n) => mdl.getObjectByName("mixamorig" + sideName + n), wp = (n) => bone(n).getWorldPosition(new THREE.Vector3());
  const H = wp("Hand"), E = wp("ForeArm"), O = H.clone().lerp(wp("HandMiddle1"), .55), Z0 = E.clone().sub(H).normalize(), palm = wp("HandIndex1").sub(H).cross(wp("HandPinky1").sub(H)).normalize(); if (sideName === "Left") palm.negate();
  const Y0 = palm.clone().negate(); Y0.addScaledVector(Z0, -Y0.dot(Z0)).normalize(); const X0 = Y0.clone().cross(Z0), M0 = new THREE.Matrix4().makeBasis(X0, Y0, Z0).setPosition(O), hold = new THREE.Group(); hold.matrixAutoUpdate = false; hold.matrix.copy(M0).invert(); hold.add(box); driver.add(hold);
  for (const m of driver.userData.built) m.visible = false;
  // each finger bone: how it sits at rest and the line it folds about
  const fold = (n) => { const b = bone(n), nx = b.children[0]; if (!b || !nx) return null; const f = nx.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize(), ax = f.cross(palm).normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()); return { b, q0: b.quaternion.clone(), ax }; };
  const fingers = FING.map((f) => [1, 2, 3].map((i) => fold("Hand" + f + i)).filter(Boolean)), thumb = [1, 2, 3].map((i) => fold("HandThumb" + i)).filter(Boolean), q = new THREE.Quaternion(), wrist = { b: bone("Hand"), q0: bone("Hand").quaternion.clone(), ax: X0.clone().applyQuaternion(bone("Hand").getWorldQuaternion(new THREE.Quaternion()).invert()) };
  const bend = (j, a) => j.b.quaternion.copy(j.q0).multiply(q.setFromAxisAngle(j.ax, a));
  // curl: how closed the hand is (0 open, 1 a fist). trig: the first finger's own squeeze. tilt: the wrist bent toward the palm
  return { hold, curl: 0, set(curl, trig = 0, tilt = 0) { fingers.forEach((F, i) => { const c = i === 0 ? curl * .7 + trig : curl; F.forEach((j, k) => bend(j, c * [1.15, 1.35, .9][k])); }); thumb.forEach((j, k) => bend(j, curl * [.35, .5, .5][k])); bend(wrist, tilt); } }; }
ARMS.R = modelArm(armR, "Right"); ARMS.L = modelArm(armL, "Left");
// what the left hand can be holding
const held = { mag: new THREE.Group(), nade: new THREE.Group(), knife: new THREE.Group() };
build(held.mag, [B(.03, .12, .052, 0, -.02, -.05, "mag", .5)], S, glow, gunMat); build(held.nade, [Bl(.058, .07, .058, 0, -.01, -.06, "gun2"), C(.014, .03, 0, .03, -.06, "steel", "y", 6), B(.012, .05, .03, .03, .0, -.06, "steel")], S, glow, gunMat);
build(held.knife, [B(.022, .03, .1, 0, -.02, -.04, "dark"), B(.05, .012, .012, 0, -.02, -.095, "steel"), B(.008, .044, .24, 0, -.02, -.22, "shell"), B(.008, .026, .07, 0, -.029, -.36, "shell", .25)], S, glow, gunMat);
for (const k in held) { held[k].visible = false; armL.add(held[k]); }
for (const k in GUNS) { const D = GUNS[k].userData; if (D.loose) { D.handMag = D.loose(); D.handMag.position.set(0, -.02, -.05); D.handMag.rotation.x = .5; D.handMag.visible = false; armL.add(D.handMag); } }   // a model's own magazine in the hand
const drops = [];   // magazines on their way to the floor

/* ---------- easing and key poses ---------- */
const out = (u) => 1 - Math.pow(1 - u, 3), back = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }, inn = (u) => u * u * u;
// keys: [time, value, ease into this key]. Returns the value at u.
function key(u, keys) { if (u <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) { const a = keys[i - 1], b = keys[i], k = (u - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * (b[2] || out)(clamp(k, 0, 1)); } return keys[keys.length - 1][1]; }
const key3 = (u, keys, o) => { for (let j = 0; j < 3; j++) o[j] = key(u, keys.map((q) => [q[0], q[1][j], q[2]])); return o; };
const spring = (s, k, c, dt) => { s.v += (-k * s.x - c * s.v) * dt; s.x += s.v * dt; };
const rec = { z: { x: 0, v: 0 }, p: { x: 0, v: 0 }, y: { x: 0, v: 0 }, r: { x: 0, v: 0 }, up: { x: 0, v: 0 } }, sway = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }, land = { x: 0, v: 0 }, jolt = { x: 0, v: 0 };
let cycle = 0, carry = 0, lastYaw = 0, lastPitch = 0, wasAir = false, shown = "", bobT = 0;
const gp = [0, 0, 0], gr = [0, 0, 0], lh = [0, 0, 0], lw = [0, 0, 0], tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
export const VM = { cam: { pitch: 0, roll: 0 }, muzzle: new THREE.Vector3(),
  // a shot: k is how hard it kicks
  kick(k) { rec.z.v += 2.6 * k; rec.p.v += 3.4 * k; rec.up.v += .9 * k; rec.y.v += (rnd() - .5) * 2.4 * k; rec.r.v += (rnd() - .5) * 3 * k; VM.cam.pitch += .006 * k; cycle = 1; const G = GUNS[shown], D = G && G.userData; if (D && D.mag && root.visible) { const m = new THREE.Group(); build(m, [B(.007, .007, .02, 0, 0, 0, "accent")], S, glow, gunMat); m.position.copy(D.top).applyMatrix4(rig.matrix); m.quaternion.copy(rig.quaternion); root.add(m); drops.push({ m, v: new THREE.Vector3(.5 + rnd() * .3, .45 + rnd() * .3, .1 + rnd() * .2), s: new THREE.Vector3(10 + rnd() * 20, 0, 10 + rnd() * 20), t: .25 }); } },   // the bolt cycles and a case is thrown out to the right
  // a hard stop somewhere in a move (a magazine seated, a handle let go): the whole rig jumps
  bump(k) { jolt.v += k; },
  /* st: { kind, visible, charge, reload (0..1 or -1), swap (0..1 or -1), swapFrom, nade (0..1 or -1), melee (0..1 or -1), speed, grounded, vy, sliding, mantle, roll, dip, yaw, pitch, firing } */
  step(dt, st) { root.visible = st.visible; if (!st.visible) return;
    let kind = st.kind; if (st.swap >= 0 && st.swap < .42) kind = st.swapFrom; if (kind !== shown) { for (const k in GUNS) GUNS[k].visible = k === kind; shown = kind; } const G = GUNS[kind], D = G.userData;
    // springs: recoil, the lag behind the view, landing
    spring(rec.z, 320, 26, dt); spring(rec.p, 300, 24, dt); spring(rec.up, 340, 28, dt); spring(rec.y, 240, 20, dt); spring(rec.r, 240, 20, dt); spring(jolt, 520, 30, dt);
    let dy = st.yaw - lastYaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; const dp = st.pitch - lastPitch; lastYaw = st.yaw; lastPitch = st.pitch;
    sway.x.v += clamp(dy, -.3, .3) * 55; sway.y.v += clamp(dp, -.3, .3) * 55; spring(sway.x, 150, 19, dt); spring(sway.y, 150, 19, dt);
    if (wasAir && st.grounded) land.v -= clamp(-st.vy0 * .22, 0, 3.2); wasAir = !st.grounded; spring(land, 190, 17, dt); if (!st.grounded) land.x += clamp(-st.vy * .0016, -.02, .02) * dt * 30;
    VM.cam.pitch += (0 - VM.cam.pitch) * (1 - Math.exp(-dt * 14)); VM.cam.roll += (rec.r.x * .1 - VM.cam.roll) * (1 - Math.exp(-dt * 12));
    const busy = st.reload >= 0 || st.swap >= 0 || st.nade >= 0 || st.melee >= 0, run = st.grounded && !st.sliding ? clamp(st.speed / 9, 0, 1) : 0;
    carry += ((st.speed > 7.2 && st.grounded && !st.sliding && !st.firing && !busy ? 1 : 0) - carry) * (1 - Math.exp(-dt * 9)); bobT += dt * (5 + st.speed * .9) * (run > 0 ? 1 : 0);
    // the move being played, if any, as offsets to the rifle and a place for the left hand
    gp[0] = gp[1] = gp[2] = gr[0] = gr[1] = gr[2] = lh[0] = lh[1] = lh[2] = 0; let free = 0, item = null, magOff = 0, magShow = true, boltZ = 0;
    if (st.reload >= 0 && D.mag) { const u = st.reload; gr[2] = key(u, [[0, 0], [.1, .62], [.62, .62], [.68, .5], [.86, .5], [1, 0, back]]); gr[1] = key(u, [[0, 0], [.1, -.28], [.86, -.24], [1, 0, back]]); gr[0] = key(u, [[0, 0], [.1, .12], [.86, .1], [1, 0]]); gp[1] = key(u, [[0, 0], [.1, .03], [.86, .025], [1, 0]]); gp[0] = key(u, [[0, 0], [.1, -.045], [.86, -.04], [1, 0]]);
      key3(u, [[0, [0, 0, 0]], [.1, [0, 0, 0]], [.2, [0, -.075, .1]], [.27, [0, -.26, .14], inn], [.34, [0, -.5, .2]], [.5, [0, -.5, .2]], [.6, [0, -.2, .12]], [.655, [0, -.075, .1], inn], [.7, [0, -.075, .1]], [.79, [.035, .06, .2]], [.845, [.035, .06, .26], inn], [.88, [.035, .06, .2]], [1, [0, 0, 0]]], lh);
      magOff = key(u, [[0, 0], [.2, 0], [.27, -.19, inn], [.34, -.5], [.5, -.5], [.6, -.13], [.655, 0, inn], [1, 0]]); magShow = u < .3 || u > .5; boltZ = key(u, [[0, 0], [.79, 0], [.845, .045, inn], [.87, 0, inn], [1, 0]]); }
    else if (st.swap >= 0) { const u = st.swap; gp[1] = key(u, [[0, 0], [.4, -.42, inn], [.42, -.42], [1, 0, back]]); gr[0] = key(u, [[0, 0], [.4, -.9, inn], [.42, .7], [1, 0, back]]); gr[2] = key(u, [[0, 0], [.4, .35], [.42, -.3], [1, 0, back]]); gp[0] = key(u, [[0, 0], [.4, .05], [1, 0]]); }
    else if (st.nade >= 0) { const u = st.nade; free = key(u, [[0, 0], [.1, 1], [.78, 1], [1, 0]]); item = u > .16 && u < .5 ? "nade" : null; key3(u, [[0, [-.2, -.3, -.3]], [.16, [-.3, -.55, -.2]], [.34, [-.34, .0, -.12], back], [.42, [-.38, .06, -.02]], [.52, [-.04, .06, -.8], inn], [.68, [-.1, -.25, -.6]], [1, [-.2, -.3, -.3]]], lw);
      gp[0] = key(u, [[0, 0], [.2, .035], [.6, .03], [1, 0]]); gr[2] = key(u, [[0, 0], [.2, -.2], [.44, -.28], [.56, -.05, inn], [1, 0, back]]); gr[1] = key(u, [[0, 0], [.2, -.12], [.6, -.1], [1, 0]]); gr[0] = key(u, [[0, 0], [.42, .08], [.54, -.12, inn], [1, 0, back]]); }
    else if (st.melee >= 0) { const u = st.melee; free = key(u, [[0, 0], [.08, 1], [.75, 1], [1, 0]]); item = u > .06 && u < .8 ? "knife" : null; key3(u, [[0, [-.3, -.4, -.3]], [.2, [-.42, -.02, -.3], back], [.42, [.12, -.1, -.62], inn], [.6, [.26, -.26, -.5]], [1, [-.2, -.3, -.3]]], lw);
      gp[0] = key(u, [[0, 0], [.18, .13], [.6, .12], [1, 0, back]]); gr[1] = key(u, [[0, 0], [.18, -.55], [.6, -.5], [1, 0, back]]); gr[2] = key(u, [[0, 0], [.18, -.2], [1, 0]]); gp[2] = key(u, [[0, 0], [.2, .05], [.42, -.03, inn], [1, 0]]); }
    // where the rifle is
    const bx = Math.cos(bobT) * .011 * run, by = Math.abs(Math.sin(bobT)) * .013 * run, ch = st.charge || 0;
    const A = st.ads || 0, sy = D.sightY || .1;
    rig.position.set((.155 + bx + st.roll * .22 - carry * .04) * (1 - A) + gp[0] + sway.x.x * .012 * (1 - A * .7) + (ch ? (rnd() - .5) * .004 * ch : 0), A * (-sy + .165 - by) + -.165 + by - st.dip * .3 - (st.sliding ? .03 : 0) + gp[1] - carry * .05 + land.x + rec.up.x * .012 - sway.y.x * .01 + jolt.x * .012, -.4 + A * .12 + rec.z.x * .06 * (1 - A * .4) + gp[2] + carry * .02);
    e.set(rec.p.x * .09 * (1 - A * .5) + gr[0] + (st.mantle ? .6 : 0) + carry * .22 - sway.y.x * .05 - land.x * 1.2 + jolt.x * .05, .03 * (1 - A) + gr[1] + rec.y.x * .03 + carry * .55 + sway.x.x * .06, st.roll * .6 + (st.sliding ? -.2 : 0) + gr[2] + rec.r.x * .05 + carry * .25 + sway.x.x * .05, "YXZ"); rig.quaternion.setFromEuler(e);
    cycle = Math.max(0, cycle - dt * 16); if (D.mag) { D.mag.position.y = -.018 + magOff; D.mag.visible = magShow; D.bolt.position.z = .04 + boltZ + Math.sin(cycle * Math.PI) * .04; } if (D.coil) { D.coil.scale.setScalar(.6 + ch * 1.6); D.coil.material.color.setRGB(.5 + ch * 2, 2.4 + ch * 3, 3 + ch * 4); }
    rig.updateMatrix(); VM.muzzle.copy(D.muzzle).applyMatrix4(rig.matrix);
    // the right hand on the grip; the left on the foregrip, or wherever the move has sent it
    (D.grip ? tmp.copy(D.grip) : tmp.set(0, -.062, .04)).applyMatrix4(rig.matrix); armR.position.copy(tmp); armR.lookAt(elbowR); armR.rotateZ(-1.25);
    tmp.copy(D.fore); tmp.x += lh[0]; tmp.y += lh[1]; tmp.z += lh[2]; tmp.applyMatrix4(rig.matrix); if (free > 0) { tmp2.set(lw[0], lw[1], lw[2]); tmp.lerp(tmp2, free); }
    armL.position.copy(tmp); armL.lookAt(elbowL); armL.rotateZ(lerp(1.35, .5, free));
    if (ARMS.R) { const k = 1 - Math.exp(-dt * 18), holding = !!item || (st.reload >= .5 && st.reload < .655), away = free > .3 || (st.reload >= .22 && st.reload < .7 && !holding);
      ARMS.L.curl += ((holding ? 1 : away ? .3 : .85) - ARMS.L.curl) * k; ARMS.R.curl += (1 - ARMS.R.curl) * k; ARMS.R.set(ARMS.R.curl, Math.sin(cycle * Math.PI) * .35 + (st.firing ? .12 : 0), TUNE.tiltR); ARMS.L.set(ARMS.L.curl, ARMS.L.curl * .3, TUNE.tiltL); }
    { const inHand = st.reload >= .5 && st.reload < .655 && !!D.mag; held.mag.visible = inHand && !D.handMag; for (const k in GUNS) { const hm = GUNS[k].userData.handMag; if (hm) hm.visible = inHand && GUNS[k] === G; } } held.nade.visible = item === "nade"; held.knife.visible = item === "knife";
    if (st.reload >= 0 && D.mag && st.reload >= .27 && !VM._dropped) { VM._dropped = true; const m = D.loose ? D.loose() : new THREE.Group(); if (!D.loose) build(m, [B(.03, .12, .052, 0, 0, 0, "mag")], S, glow, gunMat); m.position.copy(D.well).applyMatrix4(rig.matrix); m.quaternion.copy(rig.quaternion); root.add(m); drops.push({ m, v: new THREE.Vector3(-.15, -.2, .1), s: new THREE.Vector3(rnd() * 6, rnd() * 6, rnd() * 6), t: 0 }); }
    if (st.reload < 0) VM._dropped = false;
    for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; d.v.y -= 4.5 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.s.x * dt; d.m.rotation.z += d.s.z * dt; if (d.t > .7) { root.remove(d.m); drops.splice(i, 1); } }
  } };
