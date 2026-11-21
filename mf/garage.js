/* Afterburn: the garage behind the menu.
   A hangar bay built well under the field, where nothing in a fight can see it. Your pilot sits on a crate at one end
   with what they carry laid out beside them, and your Titan stands in its bay at the other. The Pilot and Titan tabs
   of the menu look at one or the other, and the camera travels through the bay between them. Change your gun, your kit,
   your faction or your paint and the bay changes with you. */
import { THREE, U, scene, cam, charMat, CFG } from "./engine.js";
import { makeFigure } from "./figure.js";
import { makeRig } from "./titan.js";
import { gunProp } from "./hands.js";
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
  const fk = LOAD.side + LOAD.paint; if (fk !== figKey) { figKey = fk; if (fig) fig.dispose(); fig = makeFigure(LOAD.side, false, LOAD.paint); root.add(fig.root); }
  const rk = LOAD.paint + LOAD.chassis + LOAD.side; if (rk !== rigKey) { rigKey = rk; if (rig) rig.root.removeFromParent(); rig = makeRig("you", { accent: LOAD.paint, cls: LOAD.chassis, mech: ({ machine: { light: "kestrel", medium: "centurion", heavy: "bastion" }, militia: { light: "jackal", medium: "nomad", heavy: "furnace" } })[LOAD.side][LOAD.chassis] }); root.add(rig.root); rig.root.position.set(5 * U, 0, -4 * U); rig.root.rotation.y = Math.PI - .25; }
  const gk = LOAD.weapon + LOAD.kit; if (gk !== gearKey) { gearKey = gk; while (gear.children.length) gear.remove(gear.children[0]);
    const lay = (kind, x, z, ry) => { const g = gunProp(kind, charMat); g.scale.setScalar(U); g.position.set(x * U, .88 * U, z * U); g.rotation.set(0, ry, Math.PI / 2); gear.add(g); };
    lay(LOAD.weapon, -4.7, 2.42, 1.45); lay("pistol", -3.85, 2.8, 1.9); const ch = gunProp("charge", charMat); ch.scale.setScalar(U); ch.position.set(-3.2 * U, .62 * U, 2.75 * U); ch.rotation.set(-1.25, 0, .08); gear.add(ch);   // primary and sidearm on the bench, the rail-charge rifle leaning on it
    for (const x of [-3.75, -3.58]) box(.09, .13, .09, x, .84, 2.35, "#3b4430", gear);   // two grenades
    if (LOAD.kit === "stim") { box(.26, .07, .09, -5.3, .84, 2.85, "#d8d4c4", gear); box(.1, .08, .1, -5.2, .84, 2.85, lit(new THREE.Color(.6, 2.6, 1.2)), gear); box(.26, .07, .09, -5.3, .84, 2.72, "#d8d4c4", gear); box(.1, .08, .1, -5.2, .84, 2.72, lit(new THREE.Color(.6, 2.6, 1.2)), gear); }
    else { const coil = new THREE.Mesh(new THREE.TorusGeometry(.13 * U, .035 * U, 6, 14), mat("#2a2724")); coil.rotation.x = Math.PI / 2; coil.position.set(-5.3 * U, .88 * U, 2.8 * U); gear.add(coil); box(.2, .09, .12, -5.04, .84, 2.8, "#5f676d", gear); box(.06, .06, .16, -4.9, .86, 2.8, "#c45a1e", gear); } } }

// where the camera stands for each tab, and where it looks. The subject sits right of the middle, clear of the menu.
const VIEWS = { pilot: { p: [-4.4, 1.15, 6.4], t: [-7.25, .9, 3.6] }, titan: { p: [-2.4, 2.4, 8], t: [.8, 4, -4] } };
export const GARAGE_FOV = 52;
const cur = { p: new THREE.Vector3(), t: new THREE.Vector3() }, from = { p: new THREE.Vector3(), t: new THREE.Vector3() }; let tab = null, k = 1, time = 0;
const V = (a) => new THREE.Vector3(a[0], a[1] + Y0, a[2]), ease = (u) => u * u * (3 - 2 * u);
export const GARAGE = {
  get on() { return !!tab; },
  // which tab of the menu is up: "pilot" and "titan" are in the bay, anything else is back out over the field
  setTab(name) { const next = VIEWS[name] ? name : null, was = tab; if (next === was) return; tab = next; root.visible = !!tab; for (const l of lamps) l.visible = !!tab; if (!tab) { cam.fov = CFG.fov; cam.updateProjectionMatrix(); return; } refresh();
    if (was) { from.p.copy(cur.p); from.t.copy(cur.t); k = 0; } else { cur.p.copy(V(VIEWS[tab].p)); cur.t.copy(V(VIEWS[tab].t)); k = 1; } },
  refresh,
  step(dt) { if (!tab) return false; time += dt; if (cam.fov !== GARAGE_FOV) { cam.fov = GARAGE_FOV; cam.updateProjectionMatrix(); } const v = VIEWS[tab]; if (k < 1) { k = Math.min(1, k + dt / 1.6); const e = ease(k); cur.p.lerpVectors(from.p, V(v.p), e); cur.t.lerpVectors(from.t, V(v.t), e); cur.p.y += Math.sin(e * Math.PI) * .5; }
    const sway = Math.sin(time * .25) * .12; cam.position.set((cur.p.x + sway) * U, cur.p.y * U, cur.p.z * U); cam.lookAt(cur.t.x * U, cur.t.y * U, cur.t.z * U);
    if (fig) fig.pose(dt, { x: -5.6, y: 0, z: 3.5, yaw: Math.PI + .3, pitch: 0, speed: 0, grounded: true, sit: true, sliding: false, crouch: false, wall: 0, dj: 9, vy: 0, dead: false, hidden: false });
    if (rig) rig.pose(dt, { speed: 0, kneel: 0, hatch: 0, aimYaw: Math.sin(time * .2) * .08, aimPitch: 0, recoil: 0, punch: 0, limp: false });
    return true; },
  leave() { if (tab) { cam.fov = CFG.fov; cam.updateProjectionMatrix(); } tab = null; root.visible = false; for (const l of lamps) l.visible = false; } };
if (typeof window !== "undefined") window.__garage = GARAGE;
