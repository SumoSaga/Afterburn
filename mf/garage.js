/* Afterburn: the garage behind the menu.
   A hangar bay built well under the field, where nothing in a fight can see it. Your pilot sits on a crate at one end
   with what they carry laid out beside them, and your Titan stands in its bay at the other. The Pilot and Titan tabs
   of the menu look at one or the other, and the camera travels through the bay between them. Change your gun, your kit,
   your faction or your paint and the bay changes with you. */
import { THREE, U, scene, cam, charMat, CFG } from "./engine.js";
import { makeFigure } from "./figure.js";
import { makeRig } from "./titan.js";
import { gunProp, heldProp } from "./hands.js";
import { LOAD } from "./battle.js";

const Y0 = -160, root = new THREE.Group(); root.position.set(0, Y0 * U, 0); root.visible = false; scene.add(root);
const mats = {}, mat = (c) => mats[c] || (mats[c] = new THREE.MeshToonMaterial({ color: c })), lit = (c) => new THREE.MeshBasicMaterial({ color: c });
const box = (w, h, d, x, y, z, c, parent = root, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), typeof c === "string" ? mat(c) : c); m.position.set(x * U, (y + h / 2) * U, z * U); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

// the bay: floor, walls, roof beams, a gantry for the Titan, a corner for the pilot
box(30, .4, 22, 0, -.4, 0, "#34373a"); box(30, 13, .5, 0, 0, -10, "#2c2f33"); box(.5, 13, 22, -14, 0, 0, "#2c2f33"); box(.5, 13, 22, 14, 0, 0, "#2a2d30"); box(30, .5, 22, 0, 12.6, 0, "#1f2124"); box(30, 13, .5, 0, 0, 11, "#24272a");
for (let x = -12; x <= 12; x += 6) box(.5, .7, 22, x, 11.9, 0, "#3c4046"); for (const z of [-6, 0, 6]) box(30, .4, .4, 0, 11.6, z, "#3c4046");
for (const x of [-9, -3, 3, 9]) box(.12, .04, 20, x, 0, 0, "#5a5136");   // painted lanes
box(9, .05, 9, 5, 0, -4, "#2a2c2e"); for (const [w, d, x, z] of [[9.4, .3, 5, .6], [9.4, .3, 5, -8.6], [.3, 9, .5, -4], [.3, 9, 9.5, -4]]) box(w, .06, d, x, 0, z, "#c9a23a");   // the Titan's bay, edged in yellow
for (const x of [.4, 9.6]) { box(.6, 9.5, .6, x, 0, -8.4, "#4a4f52"); box(.6, 9.5, .6, x, 0, -7, "#4a4f52"); box(.3, .3, 1.6, x, 6, -7.7, "#4a4f52"); } box(9.8, .5, .8, 5, 9.5, -7.7, "#c45a1e"); box(9.8, .25, 2.2, 5, 6, -8.6, "#3c4046"); box(9.8, .9, .1, 5, 6.25, -7.5, "#4a4f52");   // gantry and catwalk
for (let i = 0; i < 5; i++) box(.5, .08, .1, 1.4, .6 + i * .55, -7.6, "#4a4f52"); box(.08, 6, .08, 1.15, 0, -7.6, "#4a4f52"); box(.08, 6, .08, 1.65, 0, -7.6, "#4a4f52");
box(2.4, 1.3, 1.1, 11.5, 0, -8.6, "#7c3a1e"); box(2.4, 1.3, 1.1, 11.5, 1.3, -8.6, "#3f6f9a"); box(1.4, 1, 1.4, 11.8, 0, -6.6, "#4f5a3c"); for (const [x, z] of [[11, 4], [11.8, 4.5], [11.3, 5.2]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.32 * U, .32 * U, .95 * U, 10), mat("#5f676d")); c.position.set(x * U, .475 * U, z * U); c.castShadow = true; root.add(c); }
// the pilot's end: the crate they sit on, a bench for the guns, a locker, a tool chest, a lamp over it all
box(1.2, .5, .75, -5.6, 0, 3.4, "#4f5a3c"); box(1.25, .06, .8, -5.6, .5, 3.4, "#3b4430"); box(2.2, .78, .8, -4.5, 0, 2.55, "#5c4030"); box(2.3, .06, .9, -4.5, .78, 2.55, "#76634c");
box(1, 2.1, .6, -8, 0, 1.4, "#4a5560"); box(1, 2.1, .6, -9.05, 0, 1.4, "#44505a"); box(.04, 1.5, .5, -7.48, .3, 1.4, "#2a2d30"); box(.9, .9, .6, -7.2, 0, 3.9, "#b0312a"); box(.95, .05, .65, -7.2, .9, 3.9, "#2a2724"); box(.6, .35, .4, -7.2, .95, 3.9, "#3c4046");
box(3.4, .04, 2.6, -5, 0, 3.3, "#3d3a34"); box(.06, 3.2, .06, -5, 8.9, 3.2, "#2a2724"); box(.9, .12, .9, -5, 8.8, 3.2, "#2a2724"); box(.5, .1, .5, -5, 8.7, 3.2, lit(new THREE.Color(3, 2.2, 1.2)));
box(1.6, .12, .5, 5, 11.3, -3, lit(new THREE.Color(1.6, 2.2, 3))); box(1.6, .12, .5, 5, 11.3, 2, lit(new THREE.Color(1.6, 2.2, 3)));
const lamps = [new THREE.PointLight("#ffc890", 1700, 520, 1.5), new THREE.PointLight("#bcd8ff", 5200, 1100, 1.4)]; lamps[0].position.set(-4.8 * U, 2.6 * U, 4.6 * U); lamps[1].position.set(4 * U, 10.5 * U, 0); for (const l of lamps) { l.visible = false; root.add(l); }

// what changes with your choices
const gear = new THREE.Group(); root.add(gear); let fig = null, figKey = "", rig = null, rigKey = "", gearKey = "";
function refresh() { if (!root.visible) return;
  const fk = LOAD.side + LOAD.paint; if (fk !== figKey) { figKey = fk; if (fig) fig.dispose(); fig = makeFigure(LOAD.side, false, LOAD.paint); root.add(fig.root); for (const c of fig.root.children) if (c.geometry && c.geometry.type === "OctahedronGeometry") c.visible = false; }
  const lo = LOAD.tlo && LOAD.tlo[LOAD.chassis], rk = LOAD.paint + LOAD.chassis + LOAD.side + JSON.stringify(lo || {}); if (rk !== rigKey) { rigKey = rk; if (rig) rig.root.removeFromParent(); rig = makeRig("you", { accent: LOAD.paint, cls: LOAD.chassis, lo, mech: ({ machine: { light: "kestrel", medium: "centurion", heavy: "bastion" }, militia: { light: "jackal", medium: "nomad", heavy: "furnace" } })[LOAD.side][LOAD.chassis] }); root.add(rig.root); rig.root.position.set(5 * U, 0, -4 * U); rig.root.rotation.y = Math.PI - .25; rig.root.updateMatrixWorld(true); { const bx = new THREE.Box3().setFromObject(rig.root); rigTall = Math.max(3, (bx.max.y - bx.min.y) / U); } }
  /* The pilot wears the loadout: the primary in the hands, the sidearm in a thigh holster, the ordnance on the belt, the kit
     strapped to the chest and the weapon for mechs slung across the back. */
  const gk = [LOAD.weapon, LOAD.sidearm, LOAD.ord, LOAD.kit, LOAD.anti, figKey].join(); if (gk !== gearKey && fig) { gearKey = gk; for (const o of worn) o.removeFromParent(); worn.length = 0;
    fig.setGun(gunProp(LOAD.weapon, charMat));
    const wear = (par, obj, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => { if (!obj) return; const w = new THREE.Group(); w.position.set(x, y, z); w.rotation.set(rx, ry, rz); w.scale.setScalar(s); w.add(obj); par.add(w); worn.push(w); return w; };
    wear(fig.hips, gunProp(LOAD.sidearm || "pistol", charMat), -.24, -.12, .02, -Math.PI / 2, 0, 0, .9);   // holstered, muzzle down, on the right thigh
    wear(fig.hips, heldProp(LOAD.ord || "frag"), .17, .03, .15, 0, 0, 0, 1.5);   // ordnance on the belt
    wear(fig.chest, heldProp(LOAD.kit) || heldProp("shield"), .12, .02, .17, -.3, 0, 0, 1.5);   // the kit on a chest strap
    const back = wear(fig.chest, new THREE.Group(), 0, .02, -.2, 0, 0, .7); wear(back, gunProp(ANTIK[LOAD.anti] || "charge", charMat), 0, 0, 0, Math.PI / 2, 0, 0, .95); }
  if (!gear.children.length) for (const x of [-3.75, -3.58]) box(.09, .13, .09, x, .84, 2.35, "#3b4430", gear); }   // two grenades on the bench

const ANTIK = { mag: "maglauncher", arc: "arccannon", rail: "charge", seeker: "seeker" }, worn = [];
// a moment of light on whatever was just changed, and the camera leaning in on the part you are looking at
const pulseL = new THREE.PointLight("#9fd8ff", 0, 260, 1.6); pulseL.visible = false; root.add(pulseL); let pulseT = 0, focus = null;
function partAt(slot) { const v = new THREE.Vector3(); if (!tab) return null;
  if (tab === "pilot") { if (!fig) return null; const o = slot === "wpn" ? fig.chest : slot === "sidearm" || slot === "ord" ? fig.hips : fig.chest; o.getWorldPosition(v); if (slot === "anti") v.y += .1 * U; }
  else { if (!rig) return null; const o = slot === "prim" ? rig.gun : slot === "q" ? rig.mods.q || rig.pod : slot === "e" ? rig.mods.e || rig.armL.fore : slot === "kit" ? rig.mods.kit || rig.torso : rig.torso; o.getWorldPosition(v); }
  v.divideScalar(U); v.y -= Y0; return v; }
// where the camera stands for each tab, and where it looks. The subject sits right of the middle, clear of the menu.
const VIEWS = { pilot: { p: [-2.2, 1.45, 8.6], t: [-7.5, 1.0, 6.0] }, titan: { p: [-2.4, 2.4, 8], t: [.8, 4, -4] } };
export const GARAGE_FOV = 52;
// the view for the tab, or a closer one on the part being looked at: the camera comes in along its own line and keeps the part right of the menu
/* The Pilot tab's camera stands in front of the pilot and keeps them in the screen space the menu leaves on the right
   (frameX is the middle of that space, 0 to 1 across the screen). With no part picked it shows the whole pilot; on a part it
   comes in close at that part's height, and the pilot turns to show it: the back for the weapon for mechs, the right hip for
   the sidearm, the belt for ordnance. */
const PFOC = { wpn: { h: 1.22, turn: -.15 }, sidearm: { h: .86, turn: 1.15 }, ord: { h: .98, turn: -.45 }, kit: { h: 1.3, turn: -.3 }, anti: { h: 1.32, turn: 2.55 } };
const PILOT_AT = new THREE.Vector3(-6.0, 0, 4.1), PILOT_YAW = Math.PI + .62; let frameX = .74, turnNow = 0;
function pilotView() { const f = PFOC[focus || sfocus], d = f ? 1.6 : 2.35, h = f ? f.h : .95, face = PILOT_YAW, fx = Math.sin(face - Math.PI), fz = Math.cos(face - Math.PI);
  const a = -.28, cx = fx * Math.cos(a) - fz * Math.sin(a), cz = fx * Math.sin(a) + fz * Math.cos(a), at = new THREE.Vector3(PILOT_AT.x, Y0 + h, PILOT_AT.z), p = at.clone().add(new THREE.Vector3(cx * d, .08, cz * d));
  const fwd = at.clone().sub(p).setY(0).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x), tanH = Math.tan(GARAGE_FOV * Math.PI / 360) * (cam.aspect || 1.6), s = clamp(frameX * 2 - 1, -.6, .7);
  return { p, t: at.clone().addScaledVector(right, -d * s * tanH) }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); let sfocus = null;
/* The Titan tab works the same way: the mech stands large in the space right of the menu, and on a slot the camera comes in on
   that part while the mech turns to show it. The primary is in the right hand, ordnance on the left shoulder, the coax on the
   right shoulder; a defensive kit can sit on the left forearm, the gun, the back or the legs. */
const TITAN_AT = new THREE.Vector3(5, 0, -4), TITAN_ROT = Math.PI - .25; let tTurn = 0, rigTall = 6;
const ETURN = { phase: 2.5, vtol: 2.5, sonar: 2.6, anchor: .15, gunshield: -.45 };
function titanTurn(slot) { if (!slot) return 0; if (slot === "prim") return -.45; if (slot === "q") return .6; if (slot === "kit") return -.6; if (slot === "x") return 0; const e = LOAD.tlo && LOAD.tlo[LOAD.chassis] && LOAD.tlo[LOAD.chassis].e; return ETURN[e] ?? .6; }
function titanView() { const slot = focus || sfocus, fx = -Math.sin(TITAN_ROT), fz = -Math.cos(TITAN_ROT), a = .3, cx = fx * Math.cos(a) - fz * Math.sin(a), cz = fx * Math.sin(a) + fz * Math.cos(a);
  let at = null; if (slot && slot !== "x") { const q = partAt(slot); if (q) { at = q; at.y += Y0; } }
  const tall = rigTall, d = at ? tall * .75 : tall * 1.3;
  if (!at) at = new THREE.Vector3(TITAN_AT.x, Y0 + tall * (slot === "x" ? .7 : .5), TITAN_AT.z);
  const p = at.clone().add(new THREE.Vector3(cx * d, slot && slot !== "x" ? tall * .06 : tall * .12, cz * d)), fwd = at.clone().sub(p).setY(0).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x), tanH = Math.tan(GARAGE_FOV * Math.PI / 360) * (cam.aspect || 1.6), s = clamp(frameX * 2 - 1, -.6, .7);
  return { p, t: at.clone().addScaledVector(right, -d * s * tanH) }; }
function focusView(v) { if (tab === "pilot") return pilotView(); if (tab === "titan") return titanView(); const base = { p: V(v.p), t: V(v.t) }; const fs = focus || sfocus; if (!fs) return base; const part = partAt(fs); if (!part) return base; part.y += Y0;
  // move the camera part of the way toward the part, and its aim a little less, so the subject stays right of the menu as it comes closer
  if (tab === "pilot") return { p: base.p.clone().lerp(part, .42).add(new THREE.Vector3(0, .1, 0)), t: base.t.clone().lerp(part, .3) };
  return { p: base.p.clone().lerp(part, .36).add(new THREE.Vector3(0, .5, 0)), t: base.t.clone().lerp(part, .1) }; }
const cur = { p: new THREE.Vector3(), t: new THREE.Vector3() }, from = { p: new THREE.Vector3(), t: new THREE.Vector3() }; let tab = null, k = 1, time = 0;
const V = (a) => new THREE.Vector3(a[0], a[1] + Y0, a[2]), ease = (u) => u * u * (3 - 2 * u);
export const GARAGE = {
  get on() { return !!tab; },
  // which tab of the menu is up: "pilot" and "titan" are in the bay, anything else is back out over the field
  setTab(name) { const next = VIEWS[name] ? name : null, was = tab; if (next === was) return; tab = next; root.visible = !!tab; for (const l of lamps) l.visible = !!tab; if (!tab) { cam.fov = CFG.fov; cam.updateProjectionMatrix(); return; } refresh();
    if (was) { from.p.copy(cur.p); from.t.copy(cur.t); k = 0; } else { cur.p.copy(V(VIEWS[tab].p)); cur.t.copy(V(VIEWS[tab].t)); k = 1; } },
  refresh,
  step(dt) { if (!tab) return false; time += dt; if (cam.fov !== GARAGE_FOV) { cam.fov = GARAGE_FOV; cam.updateProjectionMatrix(); } const v = VIEWS[tab]; if (k < 1) { k = Math.min(1, k + dt / 1.6); const e = ease(k); const to = tab === "pilot" ? pilotView() : tab === "titan" ? titanView() : { p: V(v.p), t: V(v.t) }; cur.p.lerpVectors(from.p, to.p, e); cur.t.lerpVectors(from.t, to.t, e); cur.p.y += Math.sin(e * Math.PI) * .5; }
    if (k >= 1) { const want = focusView(v); const e = 1 - Math.exp(-dt * 3.2); cur.p.lerp(want.p, e); cur.t.lerp(want.t, e); }
    const sway = Math.sin(time * .25) * .12; cam.position.set((cur.p.x + sway) * U, cur.p.y * U, cur.p.z * U); cam.lookAt(cur.t.x * U, cur.t.y * U, cur.t.z * U);
    // the pilot stands by the crate, turning a little as they shift their weight, and shows off a new pick with a half turn
    const show = Math.max(0, pulseT); const ft = tab === "pilot" && PFOC[focus || sfocus] ? PFOC[focus || sfocus].turn : 0; turnNow += (ft - turnNow) * (1 - Math.exp(-dt * 4));
    if (fig) fig.pose(dt, { x: PILOT_AT.x, y: 0, z: PILOT_AT.z, yaw: PILOT_YAW + turnNow + Math.sin(time * .5) * .05 - Math.sin(show * Math.PI) * .4, pitch: -.12 + Math.sin(show * Math.PI) * .15, speed: 0, grounded: true, sit: false, sliding: false, crouch: false, wall: 0, dj: 9, vy: 0, dead: false, hidden: false });
    { const tt = tab === "titan" ? titanTurn(focus || sfocus) : 0; tTurn += (tt - tTurn) * (1 - Math.exp(-dt * 3)); if (rig) rig.root.rotation.y = TITAN_ROT + tTurn; }
    if (rig) { rig.pose(dt, { speed: 0, kneel: 0, hatch: 0, aimYaw: Math.sin(time * .2) * .08, aimPitch: 0, recoil: show * .6, punch: 0, limp: false }); rig.root.position.y = -Math.sin(show * Math.PI) * .12 * U; }
    if (pulseT > 0) { pulseT -= dt * 1.1; pulseL.visible = true; pulseL.intensity = Math.max(0, pulseT) * 700; } else pulseL.visible = false;
    return true; },
  // point the camera at one part of the loadout while its cards are looked at (null to go back)
  focus(slot) { focus = slot || null; },
  // the part whose cards are at the top of the menu as you scroll
  scrollFocus(slot) { sfocus = slot || null; },
  // where across the screen the subject should stand: the middle of the space right of the menu
  frame(x) { if (x > 0 && x < 1) frameX = x; },
  // light up the part that just changed
  pulse(slot) { setTimeout(() => { const p = partAt(slot); if (!p) return; pulseL.position.set(p.x * U, (p.y + Y0) * U, p.z * U); pulseT = 1; }, 60); },
  leave() { if (tab) { cam.fov = CFG.fov; cam.updateProjectionMatrix(); } tab = null; root.visible = false; for (const l of lamps) l.visible = false; } };
if (typeof window !== "undefined") window.__garage = GARAGE;
