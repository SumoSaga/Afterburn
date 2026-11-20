/* Afterburn, prototype 6: the game (the pilot and what the pilot carries, the Titans, the cockpit, the screens).
   The battle itself (squads, vehicles, points, the commander's map) is in mf/battle.js.
   Everything here is in metres; the engine draws at U units to the metre. */
import { THREE, U, clamp, lerp, V3, rnd, $, CFG, DEF, saveCfg, renderer, scene, cam, gunScene, gunMat, makeRTs, render, BOXES, hitsBox, free, freeG, boxesNear, groundH, WORLD, rayBox, rayWorld,
  flash, puff, ringFx, flareFx, chunksFx, tracer, fxLayer, SOL, WEATHER, charMat, PLAN, MAPKEY, MAPNAME, SALT, retryField, setMap as pickMap } from "./engine.js";
import { VM } from "./hands.js";
import { GARAGE, GARAGE_FOV } from "./garage.js";
import { makeRig, TITAN } from "./titan.js";
import { B, GRUNTS, ALLIES, VEH, SQUADS, POINTS, FACTIONS, DOCTRINES, LIST_PTS, LIST_MAX, PASSIVES, SUPCAP, supUsed, credit, nearAI, pingTo, fieldTest, stunAt, addDome, GOAL, OP, SECN, homeOf, setHomes, spend, opLine, LOAD, saveLoad, MAP, setMap, mapCamera, mapFrame, deploy, damage, rayUnits, blastUnits, nearestEnemy, stepBattle, resetBattle, buildPass, flowTo, flowDir, domeAt, useUtil, snapshot, applySnap, netIn } from "./battle.js";
import { NET, onMsg, send, host, join, leave, cut } from "./net.js";
import { makeFigure } from "./figure.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const toU = (v) => V3(v.x * U, v.y * U, v.z * U);
/* SOUND HOOKS (keep these when editing this file): the Punch package in punch/punch.js makes every sound. Each snd(...) call below is one hook.
   They are safe when sound is missing or still loading. The list of hooks is in punch/HOOKS.md. */
const SND = window.PUNCH || null; try { if (SND && !localStorage.getItem("ab-snd-off-1")) { localStorage.setItem("ab-snd-off-1", "1"); SND.enable(false); } } catch (e) {}   // sound starts off until it has been reworked; after that the choice in Settings is kept
const xyz = (v) => [v.x, v.y, v.z];
const snd = (name, o) => { try { return SND ? SND.play(name, o) : null; } catch (e) { return null; } };
const surface = (p) => p.y < .12 ? "impact_dirt" : (Math.floor(p.x / 6) + Math.floor(p.z / 6)) & 1 ? "impact_metal" : "impact_concrete";
const angD = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/* ---------- bodies that walk into boxes: the pilot and the Titans ---------- */
function axis(B, ax, delta, stepOK, hits) {
  if (!delta) return; const p = B.pos; p.setComponent(ax, p.getComponent(ax) + delta);
  for (const b of boxesNear(p.x, p.z, B.r)) { if (!hitsBox(p.x, p.y, p.z, B.h, b, B.r)) continue;
    if (ax === 1) { if (delta < 0) { p.y = b.max[1]; if (B.vel.y < -9 && B.onLand) B.onLand(-B.vel.y); B.grounded = true; } else p.y = b.min[1] - B.h - .001; B.vel.y = 0; }
    else { const up = b.max[1] - p.y;
      if (stepOK && up > 0 && up <= .5 && free(p.x, b.max[1] + .001, p.z, B.h, B.r)) { p.y = b.max[1] + .001; continue; }   // a low lip: step up onto it
      p.setComponent(ax, delta > 0 ? b.min[ax] - B.r - .001 : b.max[ax] + B.r + .001); hits.push({ ax, n: delta > 0 ? -1 : 1, b }); B.vel.setComponent(ax, 0); } } 
  // the ground itself: hills are walked up, and landed on
  const gh = groundH(p.x, p.z); if (p.y < gh) { if (ax === 1 && delta < 0 && B.vel.y < -9 && B.onLand) B.onLand(-B.vel.y); p.y = gh; if (B.vel.y < 0) B.vel.y = 0; B.grounded = true; }
  if (ax !== 1) p.setComponent(ax, clamp(p.getComponent(ax), ax === 0 ? WORLD.x0 + 1 : WORLD.z0 + 1, ax === 0 ? WORLD.x1 - 1 : WORLD.z1 - 1)); }
function moveBody(B, dt) { const hits = [], was = B.grounded; B.grounded = false; const n = Math.max(1, Math.ceil(B.vel.length() * dt / .2)), s = dt / n;
  for (let i = 0; i < n; i++) { axis(B, 0, B.vel.x * s, was, hits); axis(B, 2, B.vel.z * s, was, hits); axis(B, 1, B.vel.y * s, was, hits); } return { hits, was }; }
function accelerate(B, wx, wz, wishSpeed, accel, dt) { const cur = B.vel.x * wx + B.vel.z * wz, add = wishSpeed - cur; if (add <= 0) return; const a = Math.min(accel * wishSpeed * dt, add); B.vel.x += wx * a; B.vel.z += wz * a; }
function friction(B, f, dt) { const s = Math.hypot(B.vel.x, B.vel.z); if (s < .01) { B.vel.x = B.vel.z = 0; return; } const k = Math.max(0, s - Math.max(s, 2.5) * f * dt) / s; B.vel.x *= k; B.vel.z *= k; }

/* ---------- the pilot ---------- */
const SPAWN = [0, .1, 126];
const P = { pos: V3(), vel: V3(), h: 1.8, r: .35, eye: 1.68, yaw: 0, pitch: 0, roll: 0, grounded: false, canDouble: true, jumpBuf: 0, coyote: 0, sliding: false, slideCd: 0, crouchLatch: false,
  wall: null, lastWall: null, wallCd: 0, mantle: null, hp: 125, hurtT: 9, dead: 0, dip: 0, bob: 0, shake: 0, weapon: 0, ammo: 24, reload: 0, swapT: -1, swapFrom: "carbine", swapTo: 0, nadeT: -1, meleeT: -1, nades: 2, fireCd: 0, kick: 0, spread: 0, charge: 0,
  meter: 0, titan: null, mine: null, onLand(v) { P.dip = clamp(v * .012, 0, .25); } };
const CK = { mode: "off", t: 0, glitch: 0 };   // the cockpit screens: off, dark, boot, on, shut
const K = {}; let mouseDown = false, started = false, panelOpen = false, locked = false, noLock = false;
let runT = 0, runOn = false, runDone = false, hurtFx = 0, coolFx = 0, sayT = 0, clock = 0;
const hs = () => Math.hypot(P.vel.x, P.vel.z);
function nearWall(ax, n) { const p = P.pos, x = p.x - (ax === 0 ? n * .3 : 0), z = p.z - (ax === 2 ? n * .3 : 0);
  for (const b of boxesNear(x, z, P.r)) if (b.max[1] >= p.y + 1.2 && b.min[1] <= p.y + .8 && hitsBox(x, p.y + .5, z, .8, b, P.r)) return b; return null; }
const _down = V3(0, -1, 0);
function groundBelow() { const t = rayWorld(P.pos.clone().setY(P.pos.y + .1), _down, 50); return P.pos.y + .1 - t; }
function endWall(cd) { const w = P.wall; P.lastWall = { ax: w.ax, n: w.n, c: P.pos.getComponent(w.ax) }; P.wall = null; P.wallCd = cd; }
function respawn() { const ox = B.mp ? (MY.slot > 1 ? 5 : 0) : 0; const north = B.mp && !MY.south, hm = homeOf(north ? "foe" : "you"), tz = north ? -400 : 400, pt0 = POINTS.find((p) => p.sector === Math.min(OP.sector, SECN - 1)) || { x: hm[0], z: hm[1] - tz }; P.pos.set(hm[0] + ox, groundH(hm[0] + ox, hm[1]) + .1, hm[1]); P.vel.set(0, 0, 0); P.yaw = Math.atan2(-(pt0.x - hm[0]), -(pt0.z - hm[1])); P.pitch = 0; P.hp = HP; P.dead = 0; P.mags = { 0: PW[LOAD.weapon] ? PW[LOAD.weapon].mag : 28, 2: PW.pistol.mag }; P.weapon = 0; P.ads = 0; P.adsHeld = false; P.grap = null; P.stimT = 0; P.wall = P.mantle = null; P.sliding = false; P.h = 1.8; P.nades = 2; P.swapT = P.nadeT = P.meleeT = -1; P.ammo = pw().mag; P.reload = 0; P.canDouble = true; P.titan = null; }

function useKit() { if (P.dead > 0 || P.seq || !started || MAP.on) return; if (P.grap) { endGrapple(); return; } if (P.kitCd > 0) { snd("dry"); return; }
  if (LOAD.kit === "sonar") { P.kitCd = 20; P.sonarT = 4; P.sonarN = 0; P.sonarR = 20; snd("selector", { pitch: .6, gain: 1.6 }); say("Sonar.", 1); return; }
  if (LOAD.kit === "phase") { P.kitCd = 22; P.phaseT = 2; P.reload = 0; P.charge = 0; coolFx = 1; snd("charge_cool", { pitch: .7 }); say("Phase.", 1); return; }
  if (LOAD.kit === "decoy") { if (DECOYS.length >= 2) { snd("dry"); return; } P.kitCd = DECOYS.length ? 12 : 1; const f = makeFigure(LOAD.side, false, LOAD.paint); scene.add(f.root); const d = Math.max(hs(), 6.5); DECOYS.push({ decoy: true, slot: -1 - DECOYS.length - Math.floor(clock * 10), side: "you", ok: true, on: true, fig: f, pos: P.pos.clone(), chest: V3(), yaw: P.yaw, vx: -Math.sin(P.yaw) * d, vz: -Math.cos(P.yaw) * d, speed: d, grounded: true, h: 1.8, t: 5 }); snd("raise", { pitch: 1.2 }); return; }
  if (LOAD.kit === "stim") { P.stimT = 3.5; P.kitCd = 18; P.hurtT = 99; snd("raise", { pitch: 1.4, gain: 1.3 }); say("Stim.", 1); return; }
  aimRay(0); const d = rayWorld(_o, _d, 28); if (d >= 28) { snd("dry"); say("Nothing within 28 metres for the line to bite.", 1.5); return; }
  P.grap = { at: _o.clone().addScaledVector(_d, d - .2), t: 0 }; P.reload = 0; P.charge = 0; snd("swap", { pitch: 1.6, gain: 1.4 }); if (!ROPE.parent) scene.add(ROPE); }
function endGrapple() { if (!P.grap) return; P.kitCd = 6 + 8 * clamp(P.grap.t / 2.4, 0, 1); P.grap = null; ROPE.visible = false; P.canDouble = true; snd("swap", { pitch: .9 }); }
const ROPE = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(), V3()]), new THREE.LineBasicMaterial({ color: "#d8d2c0" })); ROPE.frustumCulled = false; ROPE.visible = false;
const DECOYS = [], MARKS = [];
function mark(x, y, z) { let m = MARKS.find((q) => !q.visible); if (!m) { m = new THREE.Mesh(new THREE.OctahedronGeometry(.28 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .7, .4), depthTest: false, transparent: true, opacity: .9 })); m.renderOrder = 50; scene.add(m); MARKS.push(m); } m.visible = true; m.position.set(x * U, y * U, z * U); }
function stepDecoys(dt) { for (let i = DECOYS.length - 1; i >= 0; i--) { const d = DECOYS[i]; d.t -= dt; const nx = d.pos.x + d.vx * dt, nz = d.pos.z + d.vz * dt; if (freeG(nx, nz, 1.6, .4, .6)) { d.pos.x = nx; d.pos.z = nz; } else { d.vx = d.vz = 0; d.speed = 0; } d.pos.y = groundH(d.pos.x, d.pos.z); d.chest.set(d.pos.x, d.pos.y + 1.1, d.pos.z);
    d.fig.pose(dt, { x: d.pos.x, y: d.pos.y, z: d.pos.z, yaw: d.yaw, pitch: 0, speed: d.speed, grounded: true, sliding: false, crouch: false, wall: 0, dj: 9, vy: 0, dead: false, hidden: false }); if (d.t <= 0 || d.hit) { d.fig.dispose(); DECOYS.splice(i, 1); puff(toU(d.chest), { n: 14, color: "#8fe0f0", hot: 2.4, size: 3, life: .3, vel: () => V3((rnd() - .5) * 60, rnd() * 60, (rnd() - .5) * 60) }); } } }
function stepKit(dt) { P.kitCd = Math.max(0, (P.kitCd || 0) - dt); P.ordCd = Math.max(0, (P.ordCd || 0) - dt); P.phaseT = Math.max(0, (P.phaseT || 0) - dt); if (P.phaseT > 0) coolFx = Math.max(coolFx, .8); stepDecoys(dt);
  for (const m of MARKS) m.visible = false; if (P.sonarT > 0) { P.sonarT -= dt; const pulse = P.sonarT < 2 ? 1 : 0; if (pulse >= P.sonarN) { P.sonarN = pulse + 1; snd("selector", { pitch: .5, gain: 1.4 }); ringFx(toU(P.pos).setY(P.pos.y * U + 8), "#ff8a6a", 20 * U, .8); }
    for (const u of GRUNTS) if (u.s.dead < 0) { const q = u.s.root.position; if (Math.hypot(q.x / U - P.pos.x, q.z / U - P.pos.z) < (P.sonarR || 20)) mark(q.x / U, q.y / U + 1.1, q.z / U); } for (const v of VEH) if (v.alive && v.side === "foe" && Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z) < (P.sonarR || 20)) mark(v.pos.x, groundH(v.pos.x, v.pos.z) + 1.2, v.pos.z); for (const rp of RPS.values()) if (rp.ok && rp.side === "foe" && Math.hypot(rp.pos.x - P.pos.x, rp.pos.z - P.pos.z) < (P.sonarR || 20)) mark(rp.pos.x, rp.pos.y + 1.1, rp.pos.z); for (const t of TITANS) if (t.alive && t.team === "foe" && Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) < (P.sonarR || 20)) mark(t.pos.x, t.pos.y + 3, t.pos.z); } P.stimT = Math.max(0, (P.stimT || 0) - dt); if (P.stimT > 0) P.hurtT = Math.max(P.hurtT, 5);
  const s = hs(); if (s > 13.5) { const ns = Math.min(18, s - (s - 13.5) * .9 * dt); P.vel.x *= ns / s; P.vel.z *= ns / s; }   // above 13.5 the air takes a little back; 18 is the most there is
  const gp = P.grap; if (!gp) return; gp.t += dt; const cx = P.pos.x, cy = P.pos.y + P.h * .6, cz = P.pos.z, dx = gp.at.x - cx, dy = gp.at.y - cy, dz = gp.at.z - cz, d = Math.hypot(dx, dy, dz);
  if (d < 2.3 || gp.t > 2.4 || P.titan || P.dead > 0 || P.jumpBuf > 0) { if (P.jumpBuf > 0) { P.jumpBuf = 0; P.vel.y = Math.max(P.vel.y, 3) + 2.5; } endGrapple(); return; }
  if (P.grounded && dy > .5) { P.grounded = false; P.pos.y += .06; P.vel.y = Math.max(P.vel.y, 3.5); } P.sliding = false; if (P.wall) { P.wall = null; }
  const pull = 44 * dt; P.vel.x += dx / d * pull; P.vel.y += dy / d * pull + CFG.gravity * .75 * dt; P.vel.z += dz / d * pull; const sp = Math.hypot(P.vel.x, P.vel.y, P.vel.z); if (sp > 18) P.vel.multiplyScalar(18 / sp);
  const hand = V3(cx, cy - .15, cz).addScaledVector(_r, -.25); ROPE.geometry.setFromPoints([toU(hand), toU(gp.at)]); ROPE.visible = true; }
function stepPilot(dt) {
  P.jumpBuf -= dt; P.coyote -= dt; P.slideCd -= dt; P.wallCd -= dt; P.hurtT += dt; if (P.dead <= 0) stepKit(dt);
  if (P.dead > 0) { P.dead -= dt; if (P.dead <= 0) { respawn(); if (B.mp === "guest") relay("back", 1); else spend(B.mp && !MY.south ? "foe" : "you", 1); say("You are back at your drop point. Click to take the mouse back.", 3); if (MAP.auto) setMap(false); } return; }
  if (P.hurtT > 4.5 && P.hp < HP) P.hp = Math.min(HP, P.hp + 45 * dt);
  if (P.seq) { stepSeq(dt); if (!P.titan) return; }
  if (P.titan) return stepRide(dt);
  if (P.mantle) { const m = P.mantle; m.t += dt / m.dur; const k = Math.min(1, m.t);
    P.pos.y = lerp(m.y0, m.y1, Math.min(1, k * 1.7)); const q = clamp((k - .35) / .65, 0, 1); P.pos.x = lerp(m.x0, m.x1, q); P.pos.z = lerp(m.z0, m.z1, q);
    if (k >= 1) { P.mantle = null; P.vel.set(m.dx * m.sp, 0, m.dz * m.sp); } return; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const mz = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), mx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
  let wx = fx * mz + rx * mx, wz = fz * mz + rz * mx; const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
  const crouchKey = !!K.KeyC; if (!crouchKey) P.crouchLatch = false;

  if (P.wall) {
    const w = P.wall; w.t += dt; P.canDouble = true;
    w.sp = Math.min(Math.max(w.sp, CFG.wallSpeed * .8) + 6 * dt, Math.max(w.sp, CFG.wallSpeed * (P.stimT > 0 ? 1.4 : 1)));
    P.vel.x = w.tx * w.sp; P.vel.z = w.tz * w.sp;
    const late = w.t > CFG.wallTime * .7; P.vel.y = late ? P.vel.y - CFG.gravity * .45 * dt : Math.max(P.vel.y - 9 * dt, 0);
    const b = nearWall(w.ax, w.n);
    if (P.jumpBuf > 0) { P.jumpBuf = 0; if (w.ax === 0) P.vel.x += w.n * CFG.wallKick; else P.vel.z += w.n * CFG.wallKick; P.vel.y = CFG.jump * 1.03; endWall(.2); }
    else if (!b || w.t > CFG.wallTime || P.grounded || (mz < 0)) endWall(.25);
  } else if (P.grounded) {
    P.canDouble = true; P.lastWall = null; P.coyote = .1;
    if (crouchKey && !P.sliding && !P.crouchLatch) { if (hs() > 5.6) { P.sliding = true; if (P.slideCd <= 0) { const s = hs(), k = (s + CFG.slideBoost) / s; P.vel.x *= k; P.vel.z *= k; P.slideCd = 1.8; } } else P.crouchLatch = true; }
    if (P.sliding && (!crouchKey || hs() < 3.5)) { P.sliding = false; if (crouchKey) P.crouchLatch = true; }
    if (P.jumpBuf > 0) { P.jumpBuf = 0; P.coyote = 0; P.vel.y = CFG.jump; P.grounded = false; P.sliding = false; }
    else if (P.sliding) { friction(P, .5, dt); accelerate(P, wx, wz, 1.5, 6, dt); if (rnd() < dt * 30) puff(toU(P.pos).setY(P.pos.y * U + 2), { n: 2, color: "#ad9677", dark: true, opacity: .4, size: 4, life: .5, grow: 1.5, drag: 2, vel: () => V3((rnd() - .5) * 20, 8, (rnd() - .5) * 20) }); }
    else { friction(P, 7, dt); accelerate(P, wx, wz, P.crouchLatch && crouchKey ? 3 : (P.ads > .5 ? 3.2 : (K.ShiftLeft || K.ShiftRight) && mz > 0 ? CFG.sprint : CFG.walk) * (P.stimT > 0 ? 1.4 : 1), 11, dt); }
  } else {
    P.sliding = false;
    accelerate(P, wx, wz, CFG.air, 14, dt);
    if (P.jumpBuf > 0) {
      if (P.coyote > 0) { P.jumpBuf = 0; P.coyote = 0; P.vel.y = CFG.jump; }
      else if (P.canDouble) { P.jumpBuf = 0; P.canDouble = false; P.vel.y = CFG.jump; if (wl > 0) { const s = hs(); P.vel.x = lerp(P.vel.x, wx * s, .4); P.vel.z = lerp(P.vel.z, wz * s, .4); }
        puff(toU(P.pos), { n: 10, color: "#8fe0f0", hot: 2.6, size: 3, life: .25, vel: () => V3((rnd() - .5) * 40, -40 - rnd() * 60, (rnd() - .5) * 40) }); }
    }
  }
  if (!P.wall) P.vel.y -= CFG.gravity * dt;
  const wantH = P.sliding || (crouchKey && P.crouchLatch && P.grounded) ? 1.0 : 1.8;
  if (wantH < P.h) P.h = wantH; else if (wantH > P.h && free(P.pos.x, P.pos.y, P.pos.z, wantH)) P.h = wantH;

  const vb = P.vel.clone(), { hits, was } = moveBody(P, dt);

  // a wall got in the way while in the air: pull up onto it if the top is in reach, otherwise run along it
  if (!P.grounded && !P.wall && hits.length) {
    for (const hI of hits) { const b = hI.b, up = b.max[1] - P.pos.y, nx = hI.ax === 0 ? hI.n : 0, nz = hI.ax === 2 ? hI.n : 0;
      if (up > .5 && up <= 2.15 && wx * -nx + wz * -nz > .3 && free(P.pos.x - nx * .75, b.max[1] + .02, P.pos.z - nz * .75, 1.8)) {
        P.mantle = { t: 0, dur: .16 + up * .08, x0: P.pos.x, y0: P.pos.y, z0: P.pos.z, x1: P.pos.x - nx * .75, y1: b.max[1] + .02, z1: P.pos.z - nz * .75, dx: -nx, dz: -nz, sp: Math.max(4, Math.hypot(vb.x, vb.z) * .75) };
        P.h = 1.8; P.vel.set(0, 0, 0); return; }
      const tx0 = hI.ax === 0 ? 0 : 1, tz0 = hI.ax === 0 ? 1 : 0, along = vb.x * tx0 + vb.z * tz0;
      const same = P.lastWall && P.lastWall.ax === hI.ax && P.lastWall.n === hI.n && Math.abs(P.lastWall.c - P.pos.getComponent(hI.ax)) < .5;
      if (P.wallCd <= 0 && !same && !was && Math.abs(along) > 3 && b.max[1] >= P.pos.y + 1.5 && b.min[1] <= P.pos.y + .6 && P.pos.y - groundBelow() > .5) {
        const sg = Math.sign(along); P.wall = { ax: hI.ax, n: hI.n, tx: tx0 * sg, tz: tz0 * sg, sp: Math.abs(along), t: 0 }; P.vel.y = clamp(vb.y * .6, 1.5, 4.5); break; } } }
}

/* ---------- blasts and damage ---------- */
function hurtPilot(n, from) { if (P.dead > 0 || P.titan || P.seq || P.phaseT > 0) return; if (domeAt(P.pos.x, P.pos.z, "you")) n *= .5; if (B.mp !== "guest" && nearAI("you", P.pos.x, P.pos.z, 20)) n *= .8; /* the Field Commander Aura: a fifth less damage beside your own troops */ snd("pilot_hurt", { gain: clamp(.6 + n / 40, .6, 1.4) }); P.hp -= n; P.hurtT = 0; hurtFx = 1; if (P.hp <= 0) { P.hp = 0; P.dead = 6; mouseDown = false; if (B.mp) relay("pdown", 0); if (!MAP.on) { setMap(true, true); if (document.pointerLockElement) document.exitPointerLock(); } } }
function blast(at, radius, o = {}) {   // at in metres
  const p = toU(at); snd("explosion", { pos: xyz(at), gain: clamp(radius / 2.2, .6, 2) }); flash(p.clone().setY(p.y + 12), "#ffb45a", 2500 + radius * 2200, .35);
  puff(p, { n: 26, color: "#fbe6a0", hot: 3, size: 5 + radius, life: .32, drag: 3, vel: () => V3((rnd() - .5) * 90 * radius, rnd() * 70 * radius, (rnd() - .5) * 90 * radius) });
  puff(p, { n: 16, color: "#332a21", dark: true, opacity: .7, size: 9 + radius * 3, life: 2, grow: 2.2, drag: 2, vel: () => V3((rnd() - .5) * 40, 20 + rnd() * 40, (rnd() - .5) * 40) });
  ringFx(p.clone().setY(p.y + .6), "#f2c46a", radius * U * 1.2, .4); if (radius > 1.5) chunksFx(p.clone().setY(p.y + 2), "#5c4c3a", 4, 40 + radius * 8);
  const d = Math.hypot(at.x - P.pos.x, at.z - P.pos.z); if (d < 30) P.shake = Math.max(P.shake, clamp(radius / (d + 2), 0, .6));
  blastUnits(at, radius, victims(o.team), 9999, 70, o.team === "you");
  if (o.team !== "you" && o.pilot && d < radius && Math.abs(at.y - P.pos.y) < radius + 1) hurtPilot(o.pilot * (1 - d / radius * .6));
  if (B.mp && o.team && o.pilot && (o.team === "you" || B.mp === "host")) for (const rp of RPS.values()) { if (!rp.ok || rp.side === o.team) continue; const d2 = Math.hypot(at.x - rp.pos.x, at.z - rp.pos.z); if (d2 < radius && Math.abs(at.y - rp.pos.y) < radius + 1) relay("phit", [rp.slot, Math.round(o.pilot * (1 - d2 / radius * .6)), 0]); }
  for (const t of TITANS) if (t.alive && t.team !== o.team && o.titan && Math.hypot(t.pos.x - at.x, t.pos.z - at.z) < radius + t.r) hurtTitan(t, o.titan);
}

/* ---------- the battle's units, as the pilot's weapons and the Titans meet them ---------- */
const _o = V3(), _d = V3();
const gruntHit = (o, d, best) => rayUnits(o, d, best, "foe");
const victims = (team) => (team === "you" ? "foe" : team === "foe" ? "you" : null);
/* The pilot's guns, from the outline. dmg is [close, far] and rng is [where it starts to fall, where it reaches the far
   number]. hs multiplies a head shot. spread is from the hip, ads is down the sights. zoom is how far the view closes in. */
const HP = 125;
const PW = { carbine: { name: "Assault Rifle", snd: "carbine", mag: 28, cd: 60 / 650, dmg: [25, 18], rng: [35, 65], hs: 1.5, spread: .011, ads: .0007, zoom: .25, reload: 1.5, kick: 1, desc: "Automatic. Fair from the hip and dead straight down the sights, for holding a lane." },
  smg: { name: "SMG", snd: "smg", mag: 36, cd: 60 / 850, dmg: [22, 12], rng: [18, 38], hs: 1.4, spread: .005, ads: .004, zoom: .14, reload: 1.3, kick: .7, desc: "Fast and close. It shoots straight from the hip, even on a wall." },
  shotgun: { name: "Shotgun", snd: "shotgun", mag: 6, cd: 60 / 85, dmg: [18.75, 3], rng: [8, 18], max: 18, pellets: 8, hs: 1.2, spread: .055, ads: .05, zoom: .1, reload: 2.2, kick: 3.2, desc: "Eight pellets. One shot inside 8 metres, nothing past 18. Made for the halls." },
  longrifle: { name: "Marksman Rifle", snd: "sniper", mag: 12, cd: 60 / 240, dmg: [45, 35], rng: [55, 90], hs: 1.8, spread: .022, ads: .0003, zoom: .5, reload: 1.8, kick: 2.2, desc: "Three to the body or one to the head and one more. Wide from the hip, crisp down the sights." },
  pistol: { name: "Sidearm", snd: "pistol", mag: 12, cd: 60 / 360, dmg: [30, 18], rng: [15, 40], hs: 1.5, spread: .006, ads: .002, zoom: .14, reload: 1.1, kick: 1.3, side: true, desc: "Every pilot carries one." } };
const KITS = { grapple: ["Grapple Hook", "A 28 metre line that pulls you to what it bites. Let go with Q or by jumping and you keep the speed. 14 seconds to come back, less if you let go early. You cannot fire while it reels."], stim: ["Stim Boost", "40 percent faster for 3.5 seconds, and your health starts coming back at once. 18 seconds to come back."],
  sonar: ["Sonar Pulse", "Two pulses over 4 seconds that show you every enemy within 20 metres through walls, and put their squads on your map. 20 seconds to come back."], phase: ["Phase Shift", "Two seconds out of the world. Nothing can hurt you or see you, and you cannot fire. 22 seconds to come back."], decoy: ["Holo-Decoy", "A copy of you that runs on ahead and draws their fire for 5 seconds, or until it is hit. Two charges, 12 seconds each."] };
const ANTI = { rail: ["Rail-Charge Rifle", "Hold to charge for 0.8 seconds, then a beam. It hits Titans and vehicles hard and puts a pilot down."], seeker: ["Seeker Launcher", "Hold on a Titan, a vehicle or a placed asset for 1.4 seconds to lock, and a rocket goes. Nearly a fifth of a Titan's hull, or 450 to anything else. It cannot be fired at troops or pilots."] };
const ORD = { frag: ["Frag Grenade", "Hold X to pull the pin and cook it, let go to throw. Four seconds from pin to blast. Do not hold it for all four."], arc: ["Arc Grenade", "Goes off the moment it touches anything. 40 to pilots and troops close by, and it shuts down turrets, beacons and pods within 6 metres for 4 seconds."] };
const dmgAt = (w, d) => (w.max && d > w.max ? 0 : lerp(w.dmg[0], w.dmg[1], clamp((d - w.rng[0]) / (w.rng[1] - w.rng[0]), 0, 1)));
const pw = () => (P.weapon === 2 ? PW.pistol : PW[LOAD.weapon] && !PW[LOAD.weapon].side ? PW[LOAD.weapon] : PW.carbine);
/* Mechs on the outline's scale. Hull is in bars of 2,500. No shield of its own: that will come from batteries. At no hull a
   mech is doomed: it gets one last bar of 2,500 and can still fight, and its pilot can get out (hold B) before it goes.
   Damage written for the old scale (a hull of 500) is multiplied by TS on the way in; the outline's own numbers are passed raw. */
const TS = 20, BAR = 2500;
const MECHS = { centurion: { name: "Centurion", cls: "Medium", fac: "Core Directorate", hull: 10000, speed: 7, dash: 2, dashCd: 6.5, mag: 24, shot: 220, desc: "The Directorate's line mech. Four bars of hull, two dashes, a 30 mm autocannon. Q is a salvo of eight tracking missiles, E a Vortex Wall that turns fire aside for 6 seconds, F a sensor pulse out to 40 metres, and X the Salvo Core once it has charged." } };
const mechOf = (fac) => MECHS.centurion;   // the Coalition's Nomad comes next; until then both sides walk Centurions
const CHASSIS = { vanguard: { name: "Centurion", hull: 10000, speed: 7, dash: 2, desc: MECHS.centurion.desc } };
B.hooks = { pilot: () => ({ ok: P.dead <= 0 && !P.titan && !P.seq && !(P.phaseT > 0), alive: P.dead <= 0, dead: P.dead, pos: V3(P.pos.x, P.pos.y + P.h * .6, P.pos.z), at: P.pos, speed: hs(), grounded: P.grounded, titan: !!P.titan }),
  titans: () => { for (const t of TITANS) t.piloted = t === P.titan; return TITANS; }, hurtPilot: (n) => hurtPilot(n), net: (k, d) => send(k, d), hurtRemote: (slot, n) => { if (slot < 0) { const d = DECOYS.find((q) => q.slot === slot); if (d) d.hit = true; return; } relay("phit", [slot, Math.round(n), 0]); }, rpilots: () => (B.mp ? [...RPS.values(), ...DECOYS] : DECOYS), pilots: () => { const L = P.dead <= 0 ? [{ key: "you", side: "you", x: P.pos.x, z: P.pos.z }] : []; if (!(P.phaseT > 0) || !L.length) {} else L.length = 0; if (B.mp) for (const rp of RPS.values()) if (rp.ok || rp.inTitan) L.push({ key: keyOf(rp.slot), side: rp.side, x: rp.pos.x, z: rp.pos.z }); return L; }, attackers: () => (B.mp ? Math.max(1, Math.ceil((1 + RPS.size) / 2)) : 1),
  healPilot: (n) => { if (P.dead > 0 || P.hp >= HP) return false; P.hp = Math.min(HP, P.hp + n); return true; }, hurtTitan: (t, n) => hurtTitan(t, n), blast: (at, r, o) => blast(at, r, o), onKill: (n) => { snd("kill"); P.meter = Math.min(100, P.meter + (n >= 15 ? 5 : 2)); }, onCap: (p) => { if (P.dead <= 0 && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 12) P.meter = Math.min(100, P.meter + 15); },
  shotSnd: (q, atPilot, hit) => { snd("grunt_shot", { pos: [q.x / U, q.y / U + 1.4, q.z / U] }); if (atPilot && !hit && rnd() < .6) snd("flyby", { pos: [P.pos.x + (rnd() - .5) * 5, P.pos.y + 1.5, P.pos.z + (rnd() - .5) * 5], delay: .02 + rnd() * .05 }); }, say: (t, sec) => say(t, sec) };

/* ---------- Titans ---------- */
const TITANS = [], DROPS = [], LATER = [], ROCKETS = [], HUSKS = []; let foeCalled = false;
const later = (t, fn) => LATER.push({ t, fn });
const approach = (v, to, r) => (Math.abs(to - v) <= r ? to : v + Math.sign(to - v) * r);
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
function makeTitan(team, x, z, yaw, kit = null) {
  const ch = CHASSIS[kit ? kit.chassis : team === "you" ? LOAD.chassis : "vanguard"] || CHASSIS.vanguard, rig = makeRig(team, team === "you" ? { accent: kit ? kit.paint : LOAD.paint } : {}); scene.add(rig.root);
  const t = { team, rig, pos: V3(x, .05, z), vel: V3(), yaw, r: 1.5, h: 5.8, eye: 5.3, shield: 0, hull: ch.hull, hullMax: ch.hull, speed: ch.speed, dashMax: ch.dash, shieldT: 9, hitT: 9, alive: true, doom: 0, doomed: false, vortex: 0, vortexCd: 0, pulseCd: 0, core: 0, coreT: 0, ammo: 24, reload: 0, fireCd: 0, dash: ch.dash, dashT: 0, dashing: 0, grounded: true,
    cd: 2 + rnd(), rk: 4 + rnd() * 4, think: 0, flow: null, strafe: 1, strafeT: 0, walk: 0, kneel: 0, kneelTo: 0, hatch: 0, hatchTo: 0, aimYaw: 0, aimPitch: 0, recoil: 0, punch: 0, punchCd: 0, busy: false, land: 1 };
  TITANS.push(t); return t;
}
// a point given in the Titan's own frame (metres, forward is -z), out in the yard
function titanPoint(t, lx, ly, lz) { const s = Math.sin(t.yaw), c = Math.cos(t.yaw); return V3(t.pos.x + lx * c + lz * s, t.pos.y + ly, t.pos.z - lx * s + lz * c); }
const chestY = (t) => TITAN.CHEST - TITAN.KNEEL * t.kneel;
const seatPt = (t) => titanPoint(t, 0, chestY(t) + .05, .1), hatchPt = (t) => titanPoint(t, 0, chestY(t) + .2, -2.8);
function placeTitan(t, dt) {
  t.kneel = approach(t.kneel, t.kneelTo, dt * 1.5); t.hatch = approach(t.hatch, t.hatchTo, dt * 2.4); t.recoil = Math.max(0, t.recoil - dt * 6); t.land = Math.max(0, t.land - dt * 1.1); if (t.punch > 0) t.punch -= dt; t.punchCd -= dt;
  const fwd = -t.vel.x * Math.sin(t.yaw) - t.vel.z * Math.cos(t.yaw), sp = Math.hypot(t.vel.x, t.vel.z);
  t.rig.root.position.set(t.pos.x * U, t.pos.y * U, t.pos.z * U); t.rig.root.rotation.y = t.yaw; t.rig.root.visible = t !== P.titan || MAP.on;
  t.rig.pose(dt, { speed: sp * (fwd < -.5 ? -1 : 1), kneel: Math.max(t.kneel, ease(t.land) * .7), hatch: t.hatch, aimYaw: t.aimYaw, aimPitch: t.aimPitch, recoil: t.recoil, punch: t.punch > 0 ? Math.sin(clamp(1 - t.punch / .45, 0, 1) * Math.PI) : 0, limp: t.doom > 0 || t.doomed });
}
const muzzleOf = (t) => t.rig.muzzle.getWorldPosition(V3());
function hurtTitan(t, n, raw = false) { if (!t.alive || t.doom > 0) return; let dmg = raw ? n : n * TS; if (t.remote != null) { relay("thit", [t.remote, Math.round(dmg)]); snd("titan_hit", { pos: [t.pos.x, t.pos.y + t.h * .6, t.pos.z], gain: clamp(.45 + dmg / 1200, .45, 1.3) }); return; }
  if (t.vortex > 0) dmg *= .25; t.shieldT = 0; t.hitT = 0; const s = Math.min(t.shield, dmg); snd(s > 0 ? "shield_hit" : "titan_hit", { pos: [t.pos.x, t.pos.y + t.h * .6, t.pos.z], gain: clamp(.45 + dmg / 1200, .45, 1.3) }); t.shield -= s; t.hull -= dmg - s; if (t === P.titan) { hurtFx = Math.max(hurtFx, s > 0 ? 0 : .6); if (s > 0) coolFx = 1; P.shake = Math.max(P.shake, .12 + dmg * .0002); CK.glitch = .18; }
  if (t.hull <= 0 && !t.doomed) { t.doomed = true; t.hull = BAR; if (t === P.titan) say("Your mech is doomed. It has one bar left. Fight on, or hold B to get out.", 4); else say(t.team === "you" ? "A friendly mech is doomed." : "Their mech is doomed. Finish it.", 3); }
  else if (t.hull <= 0) { t.hull = 0; t.doom = 2.6; t.hatchTo = 1; if (t === P.titan || (P.seq && P.seq.T === t)) { throwClear(t); say("Your mech is gone. You have been thrown clear.", 3); } else say(t.team === "you" ? "A friendly mech is going up." : "Their mech is going up.", 3); } }
function stepTitans(dt) {
  for (let i = LATER.length - 1; i >= 0; i--) { const l = LATER[i]; l.t -= dt; if (l.t <= 0) { LATER.splice(i, 1); l.fn(); } }
  for (let i = DROPS.length - 1; i >= 0; i--) { const D = DROPS[i]; D.t += dt; const gy = groundH(D.x, D.z), k = Math.min(1, D.t / D.dur), y = lerp(gy + 150, gy + 2.5, k * k); D.pod.position.set(D.x * U, y * U, D.z * U);
    if (rnd() < dt * 60) puff(V3(D.x * U, (y + 4) * U, D.z * U), { n: 5, color: "#ffb060", hot: 3, size: 6, life: .5, drag: 1, vel: () => V3((rnd() - .5) * 30, 60 + rnd() * 80, (rnd() - .5) * 30) });
    if (k >= 1) { DROPS.splice(i, 1); scene.remove(D.pod); snd("titanfall", { pos: [D.x, 1, D.z] }); const at = V3(D.x, gy + .05, D.z); if (D.ghost) { const p = toU(at); flareFx(p, "#ffb060", 9, 1.1); ringFx(p.clone().setY(p.y + 1), "#f2c46a", 11 * U, .7); chunksFx(p.clone().setY(p.y + 3), "#5c4c3a", 8, 70); continue; } const t = makeTitan(D.team, D.x, D.z, D.yaw); t.pos.y = gy + .05; placeTitan(t, .016); if (D.team === "you") P.mine = t;
      const p = toU(at); flareFx(p, "#ffb060", 9, 1.1); ringFx(p.clone().setY(p.y + 1), "#f2c46a", 11 * U, .7); chunksFx(p.clone().setY(p.y + 3), "#5c4c3a", 8, 70);
      puff(p, { n: 40, color: "#ad9677", dark: true, opacity: .5, size: 8, life: 2.6, grow: 2.2, drag: 1.4, vel: () => { const a = rnd() * 6.28; return V3(Math.cos(a) * (60 + rnd() * 90), 8 + rnd() * 30, Math.sin(a) * (60 + rnd() * 90)); } });
      const d = Math.hypot(D.x - P.pos.x, D.z - P.pos.z); P.shake = Math.max(P.shake, clamp(9 / (d + 4), 0, .9));
      blastUnits(at, 4.5, victims(D.team), 9999, 220, D.team === "you");
      for (const o of TITANS) if (o !== t && o.alive && Math.hypot(o.pos.x - D.x, o.pos.z - D.z) < 4.5) hurtTitan(o, 180);
      if (D.team !== "you" && d < 4.5 && !P.titan) hurtPilot(100);
      say(D.team === "you" ? "Your Titan is down and standing by. Walk up to it and press E to climb in." : "The Opposition's Titan has landed.", 4); } }
  // rockets in flight: they climb out of the pod, then turn onto what they were sent at
  for (let i = ROCKETS.length - 1; i >= 0; i--) { const r = ROCKETS[i]; r.t += dt; _d.copy(r.tgt).sub(r.pos); const dist = _d.length(); _d.divideScalar(dist || 1); r.vel.lerp(_d.clone().multiplyScalar(38), clamp(dt * (2 + r.t * 9), 0, 1));
    const step = r.vel.length() * dt, dir = r.vel.clone().normalize(), hitW = rayWorld(r.pos, dir, step + .2) < step + .2; r.pos.addScaledVector(r.vel, dt); r.mesh.position.set(r.pos.x * U, r.pos.y * U, r.pos.z * U); r.mesh.lookAt(r.mesh.position.clone().add(dir));
    puff(toU(r.pos), { n: 2, color: "#8f8a80", dark: true, opacity: .45, size: 5, life: .9, grow: 1.8, drag: 2, vel: () => V3((rnd() - .5) * 8, 4, (rnd() - .5) * 8) });
    if (hitW || dist < 1.4 || r.t > 4) { scene.remove(r.mesh); ROCKETS.splice(i, 1); blast(r.pos, 1.9, r.ghost ? {} : { team: r.team, titan: r.dmg || 10, pilot: 24 }); } }
  for (let i = TITANS.length - 1; i >= 0; i--) { const t = TITANS[i]; if (t.remote != null) { stepPuppet(t, dt); continue; }
    if (t.doom > 0) { t.doom -= dt; t.vel.set(0, t.vel.y, 0); if (rnd() < dt * 12) { const q = toU(t.pos).add(V3((rnd() - .5) * 30, (1 + rnd() * 4) * U, (rnd() - .5) * 30)); puff(q, { n: 8, color: "#ff9a3c", hot: 3, size: 5, life: .4, vel: () => V3((rnd() - .5) * 50, 40 + rnd() * 50, (rnd() - .5) * 50) }); flash(q, "#ff8a3a", 1200, .15); }
      placeTitan(t, dt);
      if (t.doom <= 0) { t.alive = false; if (OP.ai && t.team === OP.atk) spend(OP.atk, 3); blast(V3(t.pos.x, t.pos.y + 2.5, t.pos.z), 5, { team: t.team, titan: 60, pilot: 60 }); chunksFx(toU(t.pos).setY(t.pos.y * U + 60), "#34373a", 8, 90); t.rig.wreck(); HUSKS.push(t.rig); TITANS.splice(i, 1); if (t.team === "you") { P.mine = null; P.meter = 0; } checkDone(); }
      continue; }
    t.shieldT += dt; t.hitT += dt; t.vortex = Math.max(0, t.vortex - dt); t.vortexCd = Math.max(0, t.vortexCd - dt); t.pulseCd = Math.max(0, t.pulseCd - dt); t.core = Math.min(1, t.core + dt / 75); if (t.wall) t.wall.visible = t.vortex > 0;
    t.fireCd -= dt; t.rk -= dt; if (t.reload > 0) { t.reload -= dt; if (t.reload <= 0) t.ammo = 24; }
    if (t.dash < t.dashMax) { t.dashT += dt; if (t.dashT > 6.5) { t.dash++; t.dashT = 0; } }
    if (t !== P.titan && !t.busy) stepTitanAI(t, dt); else if (t.busy && t !== P.titan) { friction(t, 5, dt); t.vel.y -= 22 * dt; moveBody(t, dt); t.aimYaw = approach(t.aimYaw, 0, dt * 2); t.aimPitch = approach(t.aimPitch, 0, dt * 2); }
    placeTitan(t, dt);
  }
}
// the rocket pod: six rockets, one after another
function fireRockets(t, at, n = 8, dmg = 10) { if (n === 8) t.rk = t === P.titan ? 12 : 12 + rnd() * 4; for (let i = 0; i < n; i++) later(i * .09, () => { if (!t.alive || t.doom > 0) return; const from = t.rig.pod.getWorldPosition(V3()).divideScalar(U), aim = at.clone().sub(from).normalize();
  const m = fxLayer(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2, .8) }))); scene.add(m);
  ROCKETS.push({ pos: from, vel: aim.multiplyScalar(14).add(V3((rnd() - .5) * 6, 9 + rnd() * 4, (rnd() - .5) * 6)), tgt: at.clone().add(V3((rnd() - .5) * 2.4, (rnd() - .5) * 1, (rnd() - .5) * 2.4)), team: t.team, t: 0, mesh: m, dmg }); if (B.mp) { const q = ROCKETS[ROCKETS.length - 1].tgt; relay("tfx", [1, r2(from.x), r2(from.y), r2(from.z), r2(q.x), r2(q.y), r2(q.z)], false); }
  snd("rocket", t === P.titan ? undefined : { pos: xyz(from) }); flash(toU(from), "#ffb060", 1800, .12); puff(toU(from), { n: 8, color: "#c7cbc8", dark: true, opacity: .5, size: 8, life: 1.2, grow: 2, drag: 2, vel: () => V3((rnd() - .5) * 30, 10 + rnd() * 20, (rnd() - .5) * 30) }); if (t === P.titan) P.shake = Math.max(P.shake, .08); }); }
// the fist: whatever stands in front of it is hit hard
function doPunch(t, yaw) { if (t.punchCd > 0) return; t.punch = .45; t.punchCd = 1.3; if (B.mp) relay("tfx", [2]); later(.17, () => { if (!t.alive || t.doom > 0) return; const fx = -Math.sin(yaw), fz = -Math.cos(yaw), at = V3(t.pos.x + fx * 3, t.pos.y + 3.4, t.pos.z + fz * 3); let hit = false;
  for (const o of TITANS) if (o !== t && o.alive && o.team !== t.team) { const dx = o.pos.x - t.pos.x, dz = o.pos.z - t.pos.z, d = Math.hypot(dx, dz); if (d < 4.8 && (dx * fx + dz * fz) / (d || 1) > .3) { hurtTitan(o, 110); o.vel.x += fx * 9; o.vel.z += fz * 9; hit = true; } }
  blastUnits(at, 3.2, victims(t.team), 9999, 110, t.team === "you"); hit = true;
  if (t.team !== "you" && !P.titan && !P.seq && Math.hypot(P.pos.x - at.x, P.pos.z - at.z) < 3 && Math.abs(P.pos.y - t.pos.y) < 5) { hurtPilot(80); hit = true; }
  if (hit) { const p = toU(at); flash(p, "#ffd28a", 4000, .2); puff(p, { n: 22, color: "#ffe9b0", hot: 3, size: 5, life: .3, vel: () => V3((rnd() - .5) * 160, (rnd() - .3) * 120, (rnd() - .5) * 160) }); ringFx(p, "#f2c46a", 60, .3); P.shake = Math.max(P.shake, t === P.titan ? .5 : .25); } }); }
function stepTitanAI(t, dt) {
  const chest = V3(t.pos.x, t.pos.y + t.h * .7, t.pos.z);
  // what it shoots at: the other side's Titan first, then the pilot or the nearest grunt it can see
  let tgt = null, kind = null; const foe = TITANS.find((o) => o.team !== t.team && o.alive && o.doom <= 0);
  const sees = (q) => { _d.copy(q).sub(chest); const d = _d.length(); _d.divideScalar(d); return d < 75 && rayWorld(chest, _d, d) >= d - .01 ? d : -1; };
  if (foe) { tgt = V3(foe.pos.x, foe.pos.y + foe.h * .6, foe.pos.z); kind = foe; }
  else { const e = nearestEnemy(t.team, chest, 62); if (e && e.kind !== "titan") { tgt = e.pos.clone(); kind = e.kind === "pilot" ? "pilot" : e.ref; } }
  const d = tgt ? sees(tgt) : -1, los = d > 0;
  let wx = 0, wz = 0;
  if (t.team !== "you" && tgt) {   // the Opposition's Titan hunts; yours holds where it stands
    t.think -= dt; if (t.think <= 0 || !t.flow) { t.think = .7; t.flow = flowTo(tgt.x, tgt.z); }
    if (!los || d > 30) [wx, wz] = flowDir(t.flow, t.pos.x, t.pos.z);
    else { t.strafeT -= dt; if (t.strafeT <= 0) { t.strafeT = 3 + rnd() * 3; t.strafe = rnd() < .5 ? -1 : 1; } const ux = (tgt.x - t.pos.x) / d, uz = (tgt.z - t.pos.z) / d, close = kind && kind.alive && d > 6 ? ux * .5 : d < 5 ? -ux : 0, closeZ = kind && kind.alive && d > 6 ? uz * .5 : d < 5 ? -uz : 0; wx = -uz * t.strafe * .6 + close; wz = ux * t.strafe * .6 + closeZ; const l = Math.hypot(wx, wz) || 1; wx /= l; wz /= l; }
  }
  friction(t, 3, dt); if (wx || wz) accelerate(t, wx, wz, 4.4, 2.2, dt); t.vel.y -= 22 * dt; moveBody(t, dt);
  const face = los ? Math.atan2(-(tgt.x - t.pos.x), -(tgt.z - t.pos.z)) : (wx || wz) ? Math.atan2(-wx, -wz) : t.yaw, legs = (wx || wz) && los ? Math.atan2(-wx, -wz) : face;
  t.yaw += clamp(angD(t.yaw, Math.abs(angD(legs, face)) < 1 ? legs : face), -1.5 * dt, 1.5 * dt);
  t.aimYaw = los ? clamp(angD(t.yaw, face), -1.1, 1.1) : approach(t.aimYaw, 0, dt * 2); t.aimPitch = los ? clamp(Math.atan2(tgt.y - chest.y, d), -.6, .6) : approach(t.aimPitch, 0, dt * 2);
  t.cd -= dt; const onTgt = los && Math.abs(angD(t.yaw + t.aimYaw, face)) < .25;
  if (onTgt && kind && kind.alive && d < 4.6) doPunch(t, face);
  if (onTgt && t.rk <= 0 && d < 60 && d > 8 && (kind === "pilot" || (kind && kind.alive))) fireRockets(t, kind === "pilot" ? V3(P.pos.x, P.pos.y + .2, P.pos.z) : tgt.clone());
  if (onTgt && t.cd <= 0) { t.cd = 2.4 + rnd() * .8; const who = kind;
    for (let i = 0; i < 3; i++) later(i * .13, () => { if (!t.alive || t.doom > 0 || t.busy) return; t.recoil = 1; const mz = muzzleOf(t); snd("cannon", { pos: [mz.x / U, mz.y / U, mz.z / U] }); flash(mz, "#ffc477", 2600, .1);
      let end;
      if (who === "pilot") { const hit = !P.titan && !P.seq && rnd() < .2 * clamp(1 - hs() / 15, .15, 1) * (P.grounded ? 1 : .55); end = hit ? V3(P.pos.x, P.pos.y + .2, P.pos.z) : V3(P.pos.x + (rnd() - .5) * 7, Math.max(0, P.pos.y), P.pos.z + (rnd() - .5) * 7); blast(end, 2, { team: t.team, pilot: hit ? 45 : 22 }); }
      else if (who && who.veh) { end = V3(who.pos.x, 1, who.pos.z); if (rnd() < .8) damage(who, 45, mz); blast(end, 1.5, {}); }
      else if (who && who.s) { const q = who.s.root.position; end = V3(q.x / U, q.y / U + .3, q.z / U); if (i === 0 && rnd() < .85) blast(end, 2.2, { team: t.team }); else blast(end.add(V3((rnd() - .5) * 3, 0, (rnd() - .5) * 3)), 1.4, {}); }
      else if (who && who.alive) { end = V3(who.pos.x + (rnd() - .5) * 2, who.pos.y + who.h * (.3 + rnd() * .5), who.pos.z + (rnd() - .5) * 2); if (rnd() < .75) hurtTitan(who, 11); blast(end, 1.3, {}); }
      if (end) tracer(mz, toU(end), "#ffb070", 9000, 1.5); }); }
}
function callTitan(team, x, z, yaw) { const pod = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(3.2 * U, 5 * U, 3.2 * U), new THREE.MeshToonMaterial({ color: "#332a21" })), fire = new THREE.Mesh(new THREE.BoxGeometry(2.4 * U, 9 * U, 2.4 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, .7) }));
  fire.position.y = 7 * U; pod.add(body, fire); pod.position.set(x * U, 150 * U, z * U); scene.add(pod); DROPS.push({ team, x, z, yaw, t: 0, dur: 2.4, pod }); }
function tryCallTitan() {
  if (P.mine || DROPS.some((D) => D.team === "you" && !D.ghost)) return; if (P.meter < 100) { say("Your Titan is not ready yet. The meter fills over time and with every grunt you put down.", 2.5); return; }
  cam.getWorldDirection(_d); _o.copy(P.pos).setY(P.pos.y + P.eye); const t = rayWorld(_o, _d, 60), at = _o.clone().addScaledVector(_d, t);
  if (t >= 60 || at.y > groundH(at.x, at.z) + .7 || !freeG(at.x, at.z, 5.9, 1.7, .55) || rayWorld(V3(at.x, groundH(at.x, at.z) + 6.5, at.z), V3(0, 1, 0), 100, false) < 100) { say("Your Titan needs open ground under open sky. Aim at a clear patch within 60 metres.", 3); return; }
  P.meter = 0; { const yw = Math.atan2(-(P.pos.x - at.x), -(P.pos.z - at.z)); callTitan("you", at.x, at.z, yw); if (B.mp) relay("tdrop", [r2(at.x), r2(at.z), r2(yw)]); } say("Titanfall is on its way. Stand clear.", 2.4);
}
function callFoe() { foeCalled = true; let best = null, bd = 0; for (const [x, z] of [[0, -120], [0, -80], [20, -22], [-10, 8], [22, 16], [-36, -8], [10, 24], [100, 0], [-60, -30], [0, 80]]) { if (!freeG(x, z, 5.9, 1.8, .55)) continue; const d = Math.hypot(x - P.pos.x, z - P.pos.z); if (d > bd) { bd = d; best = [x, z]; } }
  if (!best) return; callTitan("foe", best[0], best[1], 0); say("The Opposition is dropping a Titan of its own.", 3.5); }

/* ---------- getting in and out: the pilot really goes in through the chest ----------
   In: the Titan kneels and lifts its hatch, the pilot jumps to the opening, drops into the seat and turns to face out,
   the hatch comes down and it goes dark, then the screens come on one by one and the Titan stands.
   Out: the screens go dark, the Titan kneels, the hatch lifts, and the pilot climbs out and down in front of it. */
function startEnter(t) { if (P.seq || t.busy || t.land > .1) return; P.seq = { kind: "in", t: 0, T: t, p0: V3(P.pos.x, P.pos.y + P.eye, P.pos.z), yaw0: P.yaw, pitch0: P.pitch }; t.busy = true; t.kneelTo = 1; P.vel.set(0, 0, 0); P.wall = P.mantle = null; P.sliding = false; mouseDown = false; say(""); }
function startExit() { const t = P.titan; if (!t || P.seq) return; P.seq = { kind: "out", t: 0, T: t }; t.busy = true; t.kneelTo = 1; t.vel.set(0, t.vel.y, 0); mouseDown = false; CK.mode = "shut"; CK.t = 0; }
function exitSpot(t) { for (const a of [0, .7, -.7, Math.PI / 2, -Math.PI / 2, Math.PI]) { const x = t.pos.x - Math.sin(t.yaw + a) * 3.8, z = t.pos.z - Math.cos(t.yaw + a) * 3.8; if (free(x, groundH(x, z) + .1, z, 1.8)) return V3(x, groundH(x, z) + .1, z); } return V3(t.pos.x, t.pos.y + t.h + .2, t.pos.z); }
function throwClear(t) { P.seq = null; P.titan = null; t.busy = false; CK.mode = "off"; P.pos.set(t.pos.x, t.pos.y + t.h + .3, t.pos.z); P.vel.set(-Math.sin(P.yaw) * 4, 18, -Math.cos(P.yaw) * 4); P.canDouble = true; P.h = 1.8; P.grounded = false;
  chunksFx(toU(titanPoint(t, 0, chestY(t), -1.2)), "#8f8a80", 4, 80); flash(toU(P.pos), "#ffd28a", 3000, .2); }
function stepSeq(dt) { const s = P.seq, T = s.T; s.t += dt; const k = s.t;
  if (!T.alive || T.doom > 0) { throwClear(T); return; }
  if (s.kind === "in") {
    if (k > .25 && k < 1.6) T.hatchTo = 1; if (k >= 1.6) T.hatchTo = 0;
    if (k >= 1.6 && CK.mode === "off") { CK.mode = "dark"; CK.t = 0; }
    if (k >= 2.25 && !s.in) { s.in = true; P.titan = T; T.rk = 0; T.cd = 2; T.kneelTo = 0; P.yaw = T.yaw; P.pitch = 0; P.pos.copy(T.pos); CK.mode = "boot"; CK.t = 0; }
    if (k >= 3.3) { P.seq = null; T.busy = false; say("You are in. Left button fires the 40 mm, right button fires the rocket pod, F throws a punch, Shift dashes, E gets you out.", 5); }
  } else {
    if (k >= .45 && !s.outp) { s.outp = true; P.titan = null; T.hatchTo = 1; s.g = exitSpot(T); CK.mode = "off"; }
    if (k >= 2.05) { P.pos.copy(s.g); P.vel.set(0, 0, 0); P.yaw = T.yaw; P.pitch = 0; P.h = 1.8; P.grounded = false; P.seq = null; T.busy = false; T.kneelTo = 0; T.hatchTo = 0; }
  }
}
// where the eye is during the sequence: [position in metres, yaw, pitch], or null when the ordinary view applies
function seqCam() { const s = P.seq; if (!s) return null; const T = s.T, k = s.t, face = T.yaw + Math.PI;
  if (s.kind === "in") {
    if (k < .9) { const u = ease(k / .9), p = s.p0.clone().lerp(hatchPt(T), u); p.y += Math.sin(u * Math.PI) * 1.2; return [p, s.yaw0 + angD(s.yaw0, face) * u, lerp(s.pitch0, -.12, u)]; }
    if (k < 1.6) { const u = ease((k - .9) / .7); return [hatchPt(T).lerp(seatPt(T), u), face + Math.PI * u, lerp(-.12, 0, u)]; }
    if (k < 2.25) return [seatPt(T), T.yaw, 0];
    return null;
  }
  if (k < .45) return null;
  if (k < 1.05) return [seatPt(T), T.yaw, 0];
  if (k < 1.5) { const u = ease((k - 1.05) / .45); return [seatPt(T).lerp(hatchPt(T), u), T.yaw, lerp(0, -.3, u)]; }
  const u = ease((k - 1.5) / .55), g = s.g.clone(); g.y += 1.68; return [hatchPt(T).lerp(g, u), T.yaw, lerp(-.3, 0, u)];
}
function stepRide(dt) { const t = P.titan; if (!t.alive || t.doom > 0) { throwClear(t); return; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), go = P.seq ? 0 : 1, mz = go * ((K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0)), mx = go * ((K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0));
  let wx = fx * mz + rx * mx, wz = fz * mz + rz * mx; const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
  if (go && K._dash && t.dash > 0 && t.dashing <= 0) { t.dash--; t.dashing = .32; const dx = wl > 0 ? wx : fx, dz = wl > 0 ? wz : fz; t.vel.x = dx * 17; t.vel.z = dz * 17; P.shake = Math.max(P.shake, .15);
    puff(toU(t.pos).setY(t.pos.y * U + 8), { n: 24, color: "#ad9677", dark: true, opacity: .5, size: 10, life: 1.2, grow: 2, drag: 2, vel: () => V3((rnd() - .5) * 90, 6 + rnd() * 20, (rnd() - .5) * 90) }); } K._dash = false;
  if (go && K._punch) doPunch(t, P.yaw); K._punch = false;
  if (go && K._wall && t.vortexCd <= 0) { t.vortex = 6; t.vortexCd = 18; if (!t.wall) { t.wall = fxLayer(new THREE.Mesh(new THREE.BoxGeometry(9 * U, 6.5 * U, .15 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 1.8, 2.4), transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))); t.wall.position.set(0, 3.4 * U, -4.2 * U); t.rig.root.add(t.wall); } snd("shield_hit", { gain: 1.4, pitch: .7 }); if (B.mp !== "guest") addDome("you", t.pos.x - Math.sin(P.yaw) * 5, t.pos.z - Math.cos(P.yaw) * 5, 7, 6); say("Vortex Wall up.", 1.5); } K._wall = false;
  if (go && K._pulse && t.pulseCd <= 0) { t.pulseCd = 15; P.sonarT = 4; P.sonarN = 0; P.sonarR = 40; say("Sensor pulse.", 1.5); } K._pulse = false;
  if (go && K._core) { if (t.core >= 1) { t.core = 0; t.coreT = 3.6; t.coreN = 0; say("Salvo Core.", 2); snd("charge_fire", { pitch: .6, gain: 1.5 }); } else say("The core is at " + Math.round(t.core * 100) + " percent.", 1.5); } K._core = false;
  if (t.coreT > 0) { t.coreT -= dt; const due = Math.floor((3.6 - t.coreT) / .16); while (t.coreN < due && t.coreN < 22) { t.coreN++; aimRay(0); const best = rayWorld(_o, _d, 140); fireRockets(t, _o.clone().addScaledVector(_d, Math.max(4, best - .3)), 1, 12.5); } }
  if (go && K.KeyB) { t.ejT = (t.ejT || 0) + dt; if (t.ejT > .5) { t.ejT = 0; if (t.doomed) { throwClear(t); P.vel.y = 22; t.doom = 1.6; t.hatchTo = 1; say("Out. Your mech is going up.", 2.5); } else startExit(); } } else t.ejT = 0;
  if (go && K._rockets && t.rk <= 0) { aimRay(0); const best = rayWorld(_o, _d, 120); fireRockets(t, _o.clone().addScaledVector(_d, Math.max(4, best - .3))); } K._rockets = false;
  if (t.dashing > 0) t.dashing -= dt; else { friction(t, 4, dt); accelerate(t, wx, wz, t.speed, 3.2, dt); }
  t.vel.y -= 22 * dt; moveBody(t, dt); t.yaw += clamp(angD(t.yaw, P.yaw), -2.6 * dt, 2.6 * dt); t.aimYaw = clamp(angD(t.yaw, P.yaw), -1.1, 1.1); t.aimPitch = P.pitch;
  t.walk += Math.hypot(t.vel.x, t.vel.z) * dt; P.pos.copy(t.pos); P.vel.copy(t.vel); P.grounded = t.grounded;
}

/* ---------- what the pilot holds ---------- */
const gun = new THREE.Group(); gun.scale.setScalar(.62); gunScene.add(gun);   // the Titan cannon you see from the cockpit; the pilot's own hands are in hands.js
function partGeo(list) { const g = []; const c = new THREE.Color(); for (const [w, h, d, x, y, z, col] of list) { const b = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed(); b.deleteAttribute("uv"); c.set(col); const a = []; for (let i = 0; i < b.attributes.position.count; i++) a.push(c.r, c.g, c.b); b.setAttribute("color", new THREE.Float32BufferAttribute(a, 3)); g.push(b); } return mergeGeometries(g); }
const cannon = new THREE.Mesh(partGeo([[.24, .22, 1.2, 0, 0, -.4, "#454c52"], [.07, .07, 1.0, -.055, .12, -1.5, "#231d17"], [.07, .07, 1.0, .055, .12, -1.5, "#231d17"], [.07, .07, 1.0, 0, .03, -1.5, "#231d17"], [.2, .2, .1, 0, .01, -1.52, "#5f676d"], [.2, .2, .08, 0, .01, -1.98, "#5f676d"],
  [.28, .05, .8, 0, .22, -.5, "#7d858a"], [.26, .04, .5, 0, -.03, -.55, "#c9733a"], [.3, .3, .36, 0, -.04, .3, "#5f676d"], [.22, .26, .26, -.2, -.06, -.2, "#4f5a3c"], [.23, .05, .27, -.2, .06, -.2, "#c9733a"], [.04, .1, .3, .13, .08, -.3, "#231d17"]]), gunMat); cannon.scale.setScalar(.72); gunScene.add(cannon);
const fist = new THREE.Mesh(partGeo([[.5, .44, .5, 0, 0, 0, "#34373a"], [.56, .2, .56, 0, .2, 0, "#b9b3a4"], [.44, .44, .9, 0, 0, .7, "#8f8a80"], [.16, .16, .52, -.16, .1, -.3, "#34373a"], [.16, .16, .52, .16, .1, -.3, "#34373a"]]), gunMat); fist.visible = false; gunScene.add(fist);
const flashM = new THREE.Mesh(new THREE.BoxGeometry(.11, .11, .14), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.8, 1) })); flashM.visible = false; gunScene.add(flashM);
let flashT = 0, hitT = 0;
const _f = V3(), _r = V3(), _u = V3();
function aimRay(spread) { cam.getWorldDirection(_f); _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion); _d.copy(_f).addScaledVector(_r, (rnd() - .5) * spread * 2).addScaledVector(_u, (rnd() - .5) * spread * 2).normalize(); _o.copy(cam.position).divideScalar(U); }
function titanHit(o, d, best, team) { let who = null; for (const t of TITANS) { if (!t.alive || t.team === team) continue; const tt = rayBox(o, d, [t.pos.x - t.r, t.pos.y, t.pos.z - t.r], [t.pos.x + t.r, t.pos.y + t.h, t.pos.z + t.r], best); if (tt < best) { best = tt; who = t; } } return { best, who }; }
function muzzleAt(side, down, fwd) { return _o.clone().addScaledVector(_r, side).addScaledVector(_u, -down).addScaledVector(_f, fwd).multiplyScalar(U); }
function fireCarbine() { const w = pw();
  P.ammo--; snd(w.snd, { layerGain: { mech: P.ammo < 6 ? 1 + (6 - P.ammo) * .5 : 1 } }); P.fireCd = w.cd; P.kick = Math.min(1, P.kick + .35); VM.kick(w.kick * (1 - P.ads * .35)); flashT = .045; if (!runOn && !runDone) runOn = true;
  const sp = lerp(w.spread, w.ads, P.ads) + P.spread * .02 * (1 - P.ads * .7) + (P.grounded || w === PW.smg ? 0 : .006); P.spread = Math.min(1, P.spread + .12); P.pitch += .004 * w.kick * (1 - P.ads * .4); const from = muzzleAt(.2, .16, .7); flash(from, "#ffc477", 900, .06); let marked = false, shown = 0;
  for (let k = 0; k < (w.pellets || 1); k++) { aimRay(sp);
    let best = rayWorld(_o, _d, 220); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best; const rh = rpHit(_o, _d, best); best = rh.best;
    const end = _o.clone().addScaledVector(_d, best), eu = toU(end), dm = dmgAt(w, best); if (shown++ < 3) tracer(from, eu, "#ffd890", 9000, .5); if (k === 0) netShot(end, 0);
    const mark = (head) => { if (!marked) { marked = true; snd("hitmarker", { pitch: head ? 1.25 : 1 }); } hitT = .12; };
    if (rh.hit) { if (dm > 0) { const head = end.y - rh.rp.pos.y > rh.rp.h * .82; relay("phit", [rh.rp.slot, Math.round(dm * (head ? w.hs : 1)), head ? 1 : 0]); if (k < 2) snd("impact_body", { pos: xyz(end) }); mark(head); } }
    else if (th.who) { hurtTitan(th.who, w.pellets ? .2 : .5); if (!marked) { marked = true; snd("hitmarker", { gain: .7 }); } hitT = .08; if (k < 3) puff(eu, { n: 6, color: th.who.shield > 0 ? "#8fe0f0" : "#ffe9b0", hot: 3, size: 2, life: .2, vel: () => V3((rnd() - .5) * 70, rnd() * 50, (rnd() - .5) * 70) }); }
    else if (gh.who) { if (dm > 0) { const g2 = gh.who, head = !g2.veh && end.y - g2.hitY > g2.hitH * .8; if (k < 2) snd(g2.veh ? "impact_metal" : "impact_body", { pos: xyz(end) }); mark(head); damage(g2, dm * (head ? w.hs : 1) * (g2.veh ? (g2.def.veh.static && w.pellets ? .5 : .4) : 1), toU(P.pos), head ? "head" : "chest", true); if (g2.veh) puff(eu, { n: 6, color: "#ffe9b0", hot: 3, size: 2, life: .2, vel: () => V3((rnd() - .5) * 70, rnd() * 50, (rnd() - .5) * 70) }); } }
    else if (k < 3) { snd(surface(end), { pos: xyz(end) }); puff(eu, { n: 6, color: "#ffe9b0", hot: 3, size: 2, life: .2, grav: -170, vel: () => V3((rnd() - .5) * 70, rnd() * 50, (rnd() - .5) * 70) }); puff(eu, { n: 2, color: "#a09684", dark: true, opacity: .4, size: 4, life: .7, grow: 1.8, drag: 3, vel: () => V3((rnd() - .5) * 12, 8, (rnd() - .5) * 12) }); } }
}
let chargeSnd = null;
function fireCharge() {
  if (chargeSnd) { chargeSnd.stop(.03); chargeSnd = null; } snd("charge_fire"); snd("charge_cool"); P.charge = 0; P.fireCd = .9; P.kick = 1; VM.kick(3.2); flashT = .08; if (!runOn && !runDone) runOn = true; aimRay(0); P.pitch += .02; coolFx = .5;
  let best = rayWorld(_o, _d, 260); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best; const rh = rpHit(_o, _d, best); best = rh.best;
  const end = _o.clone().addScaledVector(_d, best), eu = toU(end), from = muzzleAt(.2, .16, .8); tracer(from, eu, "#8fe0f0", 30000, 1.6); flash(from, "#8fe0f0", 2600, .14); flash(eu, "#8fe0f0", 2200, .2);
  puff(eu, { n: 18, color: "#d8f8ff", hot: 3, size: 4, life: .35, vel: () => V3((rnd() - .5) * 110, rnd() * 90, (rnd() - .5) * 110) }); ringFx(eu, "#8fe0f0", 30, .3);
  netShot(end, 1);
  if (rh.hit) { const head = end.y - rh.rp.pos.y > rh.rp.h * .82; relay("phit", [rh.rp.slot, 125, head ? 1 : 0]); snd("impact_body", { pos: xyz(end) }); snd("hitmarker", { pitch: head ? 1.25 : 1 }); hitT = .12; }
  else if (th.who) { hurtTitan(th.who, 650, true); snd("hitmarker", { gain: .9 }); hitT = .15; } else if (!gh.who) snd("impact_metal", { pos: xyz(end), gain: 1.4, pitch: .8 }); else if (gh.who) { snd("hitmarker"); hitT = .15; damage(gh.who, gh.who.veh ? 130 : 9999, toU(P.pos), "chest", true); }
}
function fireCannon(t) {
  t.ammo--; snd("cannon"); t.fireCd = .2; P.kick = 1; t.recoil = 1; flashT = .06; P.shake = Math.max(P.shake, .1); aimRay(.006);
  let best = rayWorld(_o, _d, 260); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best;
  const end = _o.clone().addScaledVector(_d, Math.max(0, best - .1)), from = muzzleAt(.9, .7, 2.4); tracer(from, toU(end), "#ffd890", 9000, 1.5); flash(from, "#ffc477", 3200, .1); if (B.mp) relay("tfx", [0, r2(end.x), r2(end.y), r2(end.z)], false);
  puff(from, { n: 8, color: "#8f8a80", dark: true, opacity: .35, size: 8, life: 1.2, grow: 2, drag: 2.4, vel: () => V3((rnd() - .5) * 20, 10 + rnd() * 14, (rnd() - .5) * 20) });
  if (th.who) { hurtTitan(th.who, 220, true); t.core = Math.min(1, t.core + .012); hitT = .12; } else if (gh.who) damage(gh.who, 220, toU(P.pos), gh.who.veh ? "blast" : "chest", true); if (gh.who || th.who) { hitT = .12; snd("hitmarker", { gain: .8 }); }
  blast(end, 2.2, { team: "you" });
}
/* A ping from the fight. Tap G or the middle mouse button: your squads within 35 metres go where you are looking.
   Hold G a moment longer: every squad of yours that is not locked to a point goes. Squads you sent to a point from
   the map are locked there and a ping never pulls them off. */
let gDownT = 0; const WHEEL = { on: false, x: 0, y: 0, el: null, was: false, armed: false, dbl: false }, WEDGE = { near: "Nearby", core: "Core infantry", spec: "Specialists", all: "All not locked", fa: "Fireteam Alpha", fb: "Fireteam Beta" }, myTags = () => (LOAD.tags && LOAD.tags[LOAD.side]) || {};
const wheelPick = () => (Math.hypot(WHEEL.x, WHEEL.y) < 28 ? "near" : Math.abs(WHEEL.x) > Math.abs(WHEEL.y) ? (WHEEL.x < 0 ? "core" : "spec") : WHEEL.y < 0 ? "near" : "all");
function wheelDraw() { if (!WHEEL.el) { WHEEL.el = document.createElement("div"); WHEEL.el.style.cssText = "position:fixed;left:50%;top:50%;width:300px;height:220px;margin:-110px 0 0 -150px;z-index:30;pointer-events:none;font:13px ui-monospace,Menlo,monospace;color:#efe2c8"; document.body.appendChild(WHEEL.el); }
  const pk = wheelPick(), cell = (k, css) => `<div style="position:absolute;${css};padding:6px 10px;border:2px solid ${pk === k ? "#8fe0f0" : "#6b5438"};background:${pk === k ? "#17333a" : "#1b1713cc"}">${WEDGE[k]}</div>`;
  WHEEL.el.style.display = WHEEL.on ? "block" : "none"; if (WHEEL.on) WHEEL.el.innerHTML = cell("near", "left:50%;top:0;transform:translateX(-50%)") + cell("core", "left:0;top:50%;transform:translateY(-50%)") + cell("spec", "right:0;top:50%;transform:translateY(-50%)") + cell("all", "left:50%;bottom:0;transform:translateX(-50%)").replace(WEDGE.all, WHEEL.dbl ? "All, locked too" : WEDGE.all + " (flick twice for all)"); }
function ping(which, force) { if (!started || P.dead > 0 || MAP.on) return; aimRay(0); const dist = Math.min(140, rayWorld(_o, _d, 140)), x = _o.x + _d.x * dist, z = _o.z + _d.z * dist;
  const mine = SQUADS.filter((q) => q.owner === "you" && !q.dead && q.c && !(q.def.veh && q.def.veh.static) && (which === "near" ? Math.hypot(q.c.x - P.pos.x, q.c.z - P.pos.z) < 35 : which === "core" ? !!q.def.core || q.def.capw >= .3 && !q.def.veh && q.def.hp < 150 : which === "spec" ? !(q.def.core || q.def.capw >= .3 && !q.def.veh && q.def.hp < 150) : which === "fa" ? myTags()[q.defId] === "a" : which === "fb" ? myTags()[q.defId] === "b" : true));
  if (!mine.length) { say(which === "fa" || which === "fb" ? "No squads in " + WEDGE[which] + " are on the field. Tag cards in your battlegroup to put them in a fireteam." : which === "near" ? "None of your squads are within 35 metres. Hold G for the wheel to call the others." : "You have no squads of that kind on the field.", 3); snd("dry"); return; }
  pingTo(V3(x, 0, z), mine, !!force); snd("selector"); const pt = POINTS.find((p) => Math.hypot(p.x - x, p.z - z) < 8); say(WEDGE[which] + ", " + (mine.length === 1 ? "one squad" : mine.length + " squads") + (pt ? ": take point " + pt.name + "." : ": move there.") + (force ? " Locked squads come too." : " Locked squads stay where they are."), 2.5); }
addEventListener("keyup", (e) => { if (e.code === "KeyX") P.nadeHold = false; if (e.code === "KeyG" && gDownT) { const pk = WHEEL.on ? wheelPick() : "near", f = pk === "all" && WHEEL.dbl; WHEEL.on = false; wheelDraw(); gDownT = 0; ping(pk, f); } });
const SWAP = .5, NADE = .8, KNIFE = .5, gunKind = () => P.weapon === 1 ? "charge" : P.weapon === 2 ? "pistol" : PW[LOAD.weapon] && !PW[LOAD.weapon].side ? LOAD.weapon : "carbine", handsBusy = () => P.swapT >= 0 || P.nadeT >= 0 || P.meleeT >= 0 || !!P.grap || P.phaseT > 0;
const NADES = [];
function startSwap(to) { if (P.titan || handsBusy() || to === P.weapon) return; P.swapFrom = gunKind(); P.swapTo = to; P.swapT = 0; P.reload = 0; P.charge = 0; snd("swap"); }
function startNade() { if (P.titan || P.seq || P.dead > 0 || handsBusy() || P.ordCd > 0) { if (P.ordCd > 0 && !P.titan) snd("dry"); return; } P.nadeT = 0; P.nadeOut = false; P.nadeHold = LOAD.ord === "frag"; P.fuse = 0; P.reload = 0; P.charge = 0; snd("frag_pin"); }
function startKnife() { if (P.titan || P.seq || P.dead > 0 || handsBusy()) return; P.meleeT = 0; P.meleeHit = false; P.reload = 0; P.charge = 0; snd("melee_knife"); }
function throwNade() { P.ordCd = 18; const arc = LOAD.ord === "arc", fuse = arc ? 6 : Math.max(.15, 4 - P.fuse); aimRay(0); const pos = _o.clone().addScaledVector(_r, -.25).addScaledVector(_f, .5), vel = _f.clone().multiplyScalar(21).add(V3(0, 4.5, 0)).addScaledVector(P.vel, .6); snd("swap", { pitch: 1.3, gain: .8 }); mkNade(pos, vel, "you", fuse, arc); if (B.mp) relay("nade", [r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z), r2(fuse), arc ? 1 : 0]); }
function mkNade(pos, vel, team, fuse = 1.7, arc = false, side = null) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), new THREE.MeshBasicMaterial({ color: "#2f3528" })); scene.add(m); if (arc) m.material.color.set("#3f8fb0"); NADES.push({ pos, vel, team, t: fuse, arc, side: side || team, mesh: m, spin: rnd() * 6 }); }
// a grenade in the air: it falls, bounces off whatever it meets and goes off when its fuse runs out
function stepNades(dt) { for (let i = NADES.length - 1; i >= 0; i--) { const n = NADES[i], p = n.pos, v = n.vel; n.t -= dt; v.y -= 24 * dt; let hit = false;
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt; if (free(nx, p.y, p.z, .15, .12)) p.x = nx; else { v.x *= -.45; hit = true; } if (free(p.x, p.y, nz, .15, .12)) p.z = nz; else { v.z *= -.45; hit = true; }
    const ny = p.y + v.y * dt, g = groundH(p.x, p.z) + .08; if (ny <= g) { p.y = g; if (v.y < -3) hit = true; v.y *= -.35; v.x *= .7; v.z *= .7; } else if (!free(p.x, ny, p.z, .15, .12)) { if (v.y < -3) hit = true; v.y *= -.35; v.x *= .7; v.z *= .7; } else p.y = ny;
    if (hit && v.length() > 2.5) snd("frag_bounce", { pos: xyz(p) }); n.spin += dt * 9; n.mesh.position.set(p.x * U, p.y * U, p.z * U); n.mesh.rotation.set(n.spin, n.spin * .7, 0);
    if (n.arc && hit) { scene.remove(n.mesh); NADES.splice(i, 1); snd("charge_fire", { pos: xyz(p), pitch: 1.5 }); flash(toU(p), "#8fe0f0", 2600, .25); ringFx(toU(p), "#8fe0f0", 6 * U, .5); puff(toU(p), { n: 18, color: "#d8f8ff", hot: 3, size: 3, life: .3, vel: () => V3((rnd() - .5) * 110, rnd() * 80, (rnd() - .5) * 110) });
      if (n.side && B.mp !== "guest") stunAt(p.x, p.z, 6, n.side, 4); if (n.team === "you") { for (const u of GRUNTS) if (u.s.dead < 0 && Math.hypot(u.s.root.position.x / U - p.x, u.s.root.position.z / U - p.z) < 3.5) damage(u, 40, toU(P.pos), "blast", true); for (const rp of RPS.values()) if (rp.ok && rp.side === "foe" && rp.pos.distanceTo(p) < 4) relay("phit", [rp.slot, 40, 0]); } continue; }
    if (n.t <= 0) { scene.remove(n.mesh); NADES.splice(i, 1); snd("frag_blast", { pos: xyz(p) }); blast(p.clone(), 4.2, n.team ? { team: n.team } : {}); } } }
function knifeHit() { aimRay(0); const fast = Math.hypot(P.vel.x, P.vel.y, P.vel.z) > 11; let best = Math.min(2.7, rayWorld(_o, _d, 2.7)); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best; const rh = rpHit(_o, _d, best), end = _o.clone().addScaledVector(_d, rh.best);
  const behind = (yaw) => Math.sin(yaw) * _d.x + Math.cos(yaw) * _d.z > .3;   // they are facing the way the blade is travelling
  if (rh.hit) { const kill = fast || behind(rh.rp.yaw + Math.PI); relay("phit", [rh.rp.slot, kill ? 999 : 65, 0]); snd("melee_hit", { pos: xyz(end) }); snd("hitmarker", { pitch: kill ? 1.25 : 1 }); hitT = .15; P.shake = Math.max(P.shake, .12); }
  else if (th.who) { hurtTitan(th.who, 2); snd("impact_metal", { pos: xyz(end) }); P.shake = Math.max(P.shake, .08); }
  else if (gh.who) { const u = gh.who, kill = !u.veh && (fast || behind(u.s.root.rotation.y)); snd(u.veh ? "impact_metal" : "melee_hit", { pos: xyz(end) }); snd("hitmarker", { pitch: kill ? 1.25 : 1 }); hitT = .15; P.shake = Math.max(P.shake, .12); damage(u, u.veh ? 20 : kill ? 9999 : 65, toU(P.pos), "chest", true); } }
const SEEK = [];   // seeker rockets on their way: they land a moment after the lock
function stepSeek(dt) { for (let i = SEEK.length - 1; i >= 0; i--) { const s = SEEK[i]; s.t -= dt; if (s.t > 0) continue; SEEK.splice(i, 1); const r = s.tg.ref, at = s.tg.kind === "t" ? V3(r.pos.x, r.pos.y + r.h * .55, r.pos.z) : V3(r.pos.x, groundH(r.pos.x, r.pos.z) + 1, r.pos.z); blast(at, 1.8, {}); snd("hitmarker"); hitT = .15; if (s.tg.kind === "t") { if (r.alive) hurtTitan(r, 1800, true); } else if (r.alive) damage(r, 450, toU(P.pos), "blast", true); } }
const VS = { visible: false };
function stepGun(dt) {
  P.fireCd -= dt; P.kick = Math.max(0, P.kick - dt * 5); P.spread = Math.max(0, P.spread - dt * 1.6); flashT -= dt; hitT -= dt; stepNades(dt); stepSeek(dt);
  const t = P.titan, out = t || P.dead > 0 || P.seq; if (out) { P.swapT = P.nadeT = P.meleeT = -1; }
  // the moves the hands make: each has its own clock, and the thing it does happens part way through
  if (P.swapT >= 0) { const was = P.swapT; P.swapT += dt; if (was < SWAP * .42 && P.swapT >= SWAP * .42) { if (P.weapon !== 1) P.mags[P.weapon] = P.ammo; P.weapon = P.swapTo; if (P.weapon !== 1) P.ammo = P.mags[P.weapon]; snd("raise"); } if (P.swapT >= SWAP) { P.swapT = -1; VM.bump(-1.2); } }
  if (P.nadeT >= 0) { P.fuse += dt; if (P.nadeHold && P.nadeT >= NADE * .4) { P.nadeT = NADE * .4 - dt; if (P.fuse >= 4) { P.nadeT = -1; P.nadeHold = false; P.ordCd = 18; snd("frag_blast"); blast(P.pos.clone().setY(P.pos.y + 1), 4.2, {}); hurtPilot(140); } } }
  if (P.nadeT >= 0) { P.nadeT += dt; if (!P.nadeOut && P.nadeT >= NADE * .5) { P.nadeOut = true; throwNade(); VM.bump(1.6); } if (P.nadeT >= NADE) P.nadeT = -1; }
  if (P.meleeT >= 0) { P.meleeT += dt; if (!P.meleeHit && P.meleeT >= KNIFE * .36) { P.meleeHit = true; knifeHit(); VM.bump(1); } if (P.meleeT >= KNIFE) P.meleeT = -1; }
  P.ads += ((P.adsHeld && !t && !handsBusy() && P.reload <= 0 && P.dead <= 0 && !P.wall ? 1 : 0) - P.ads) * (1 - Math.exp(-dt * 12));
  const busy = handsBusy(), canFire = mouseDown && P.dead <= 0 && !P.mantle && !P.seq && !busy;
  if (chargeSnd && (t || P.weapon !== 1 || P.dead > 0 || busy)) { chargeSnd.stop(.05); chargeSnd = null; }
  if (t) { if ((K.KeyR && t.ammo < 24 && t.reload <= 0) || (t.ammo <= 0 && t.reload <= 0)) { t.reload = 2.2; snd("reload", { pitch: .6, gain: 1.2 }); } else if (mouseDown && P.dead <= 0 && !P.seq && t.fireCd <= 0 && t.reload <= 0) fireCannon(t); }
  else if (busy) { }
  else if (P.weapon === 1 && LOAD.anti === "seeker") { let tg = null; if (canFire && P.fireCd <= 0) { aimRay(0); let bs = .14; const see = (ref, x, y, z, kind) => { const dx = x - _o.x, dy = y - _o.y, dz = z - _o.z, d = Math.hypot(dx, dy, dz); if (d > 130) return; const off = Math.acos(clamp((dx * _d.x + dy * _d.y + dz * _d.z) / d, -1, 1)); if (off < bs && rayWorld(_o, V3(dx / d, dy / d, dz / d), d) >= d - 1.5) { bs = off; tg = { ref, kind, at: V3(x, y, z) }; } };
      for (const q of TITANS) if (q.alive && q.team === "foe") see(q, q.pos.x, q.pos.y + q.h * .55, q.pos.z, "t"); for (const v of VEH) if (v.alive && v.side === "foe") see(v, v.pos.x, groundH(v.pos.x, v.pos.z) + (v.def.veh.hover || 1.2), v.pos.z, "v"); }
    if (tg) { if (P.lockOn !== tg.ref) { P.lockOn = tg.ref; P.charge = 0; snd("selector", { pitch: 1.4 }); } P.charge += dt / 1.4; if (P.charge >= 1) { P.charge = 0; P.fireCd = 2.6; P.lockOn = null; P.kick = 1; VM.kick(3.4); flashT = .08; snd("charge_fire", { pitch: .7 }); const from = muzzleAt(.2, .16, .8); tracer(from, toU(tg.at), "#ffb060", 6000, 2.2); flash(from, "#ffb060", 2400, .14); netShot(tg.at, 1);
        SEEK.push({ t: clamp(_o.distanceTo(tg.at) / 90, .15, 1.2), tg }); } } else { P.lockOn = null; P.charge = Math.max(0, P.charge - dt * 2.5); } }
  else if (P.weapon === 1) { if (canFire && P.fireCd <= 0) { if (!chargeSnd) chargeSnd = snd("charge_up"); P.charge += dt / .8; if (P.charge >= 1) fireCharge(); } else { if (chargeSnd) { chargeSnd.stop(.05); chargeSnd = null; } P.charge = Math.max(0, P.charge - dt * 2); } }
  else { if (P.reload > 0) { const R = pw().reload, u0 = 1 - P.reload / R; P.reload -= dt; const u1 = 1 - P.reload / R; if (u0 < .27 && u1 >= .27) VM.bump(-.8); if (u0 < .655 && u1 >= .655) { VM.bump(2.2); snd("selector", { gain: .8, pitch: .8 }); } if (u0 < .87 && u1 >= .87) VM.bump(-1.6); if (P.reload <= 0) P.ammo = pw().mag; }
    else if ((K.KeyR && P.ammo < pw().mag) || P.ammo <= 0) { P.reload = pw().reload; snd("reload"); } else if (canFire && P.fireCd <= 0) fireCarbine(); }
  const s = hs(), moving = P.grounded && !P.sliding && !t ? Math.min(1, s / 9) : 0; P.bob += dt * (5 + s * .9) * (moving > 0 ? 1 : 0);
  VS.visible = !t && P.dead <= 0 && !P.seq && !MAP.on && started; VS.kind = gunKind(); VS.charge = P.weapon === 1 ? P.charge : 0; VS.ads = P.ads; VS.reload = P.weapon !== 1 && P.reload > 0 ? clamp(1 - P.reload / pw().reload, 0, 1) : -1; VS.swap = P.swapT >= 0 ? P.swapT / SWAP : -1; VS.swapFrom = P.swapFrom; VS.nade = P.nadeT >= 0 ? P.nadeT / NADE : -1; VS.melee = P.meleeT >= 0 ? P.meleeT / KNIFE : -1;
  VS.speed = s; VS.grounded = P.grounded; VS.vy = P.vel.y; VS.vy0 = P.vyWas || 0; P.vyWas = P.vel.y; VS.sliding = P.sliding; VS.mantle = !!P.mantle; VS.roll = P.roll; VS.dip = P.dip; VS.yaw = P.yaw; VS.pitch = P.pitch; VS.firing = mouseDown || P.fireCd > -.25; VM.step(dt, VS);
  gun.visible = !!t; cannon.visible = !!t && CK.mode === "on"; fist.visible = cannon.visible && t.punch > 0; if (fist.visible) { const u = Math.sin(clamp(1 - t.punch / .45, 0, 1) * Math.PI); fist.position.set(-.5 + u * .3, -.75 + u * .35, -.6 - u * .9); }
  if (t) { const tr = t.reload > 0 ? Math.sin(Math.min(1, (2.2 - t.reload) / 2.2) * Math.PI) : 0, wb = Math.sin(t.walk * 1.1); cannon.position.set(.66, -.6 - tr * .4 + Math.abs(wb) * .02, -.5 + P.kick * .1); cannon.rotation.set(P.kick * .03 + tr * .5, .04, 0); }
  flashM.visible = flashT > 0 && (!!t || VS.visible); if (flashM.visible) { if (t) { flashM.position.set(.66, -.52, -2.0); flashM.scale.setScalar(2.6); } else { flashM.position.copy(VM.muzzle); flashM.position.z -= .05; flashM.scale.setScalar(P.weapon === 1 ? 1.5 : .9); } flashM.rotation.z = rnd() * 3; }
}

/* ---------- the run ---------- */
function checkDone() {}
function restart() { for (const rp of RPS.values()) rp.titan = null; for (const t of TITANS) scene.remove(t.rig.root); TITANS.length = 0; for (const h of HUSKS) scene.remove(h.root); HUSKS.length = 0; for (const r of ROCKETS) scene.remove(r.mesh); ROCKETS.length = 0; P.seq = null; CK.mode = "off"; for (const D of DROPS) scene.remove(D.pod); DROPS.length = 0; LATER.length = 0; foeCalled = false; P.mine = null; P.meter = 0; P.weapon = 0; P.charge = 0;
  resetBattle(); respawn(); if (MAP.on) setMap(false); runT = 0; runOn = true; runDone = false; say(""); }

/* ---------- input ---------- */
const cv = renderer.domElement;
function wantLock() { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { noLock = true; }); } catch (e) { noLock = true; } }
document.addEventListener("pointerlockchange", () => { const was = locked; locked = document.pointerLockElement === cv; if (!locked) { mouseDown = false; for (const k in K) K[k] = false; if (was && started && !panelOpen && !MAP.on) openSettings(); } });   // Escape frees the mouse, and that is the way into Settings
document.addEventListener("pointerlockerror", () => { noLock = true; });
const active = () => started && !panelOpen && (locked || noLock || MAP.on);
function toggleMap() { if (MAP.on) { setMap(false); wantLock(); } else { setMap(true); for (const k in K) K[k] = false; mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); } }
function useKey() { if (P.seq || P.titan) return; const m = P.mine; if (m && m.alive && m.doom <= 0 && Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 7 && Math.abs(m.pos.y - P.pos.y) < 6) startEnter(m); }
addEventListener("keydown", (e) => { if (started && !panelOpen && e.ctrlKey) e.preventDefault(); if (e.repeat) return; if (started && ["Space", "Tab", "KeyC", "KeyR", "KeyE", "KeyV", "KeyQ", "KeyF", "KeyG", "KeyX", "Digit1", "Digit2", "Digit3"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyP" && started && !MAP.on) { togglePanel(); return; }
  if (e.code === "Tab" && started && !panelOpen) { toggleMap(); return; }
  if (MAP.on) { MAP.keys[e.code] = true; if (e.code === "KeyT") again(); return; }
  if (!active()) return; const code = e.code === "ControlLeft" ? "KeyC" : e.code; K[code] = true;
  if (code === "Space") P.jumpBuf = .14; if (code === "KeyT") again(); if (code === "KeyE" && P.dead <= 0) useKey(); if (code === "KeyV" && P.dead <= 0 && !P.titan) tryCallTitan();
  if (code === "ShiftLeft" || code === "ShiftRight" || code === "Space") K._dash = !!P.titan; if (code === "KeyF") { if (P.titan) K._pulse = true; else startKnife(); } if (P.titan && !e.repeat) { if (code === "KeyV") K._punch = true; if (code === "KeyQ") K._rockets = true; if (code === "KeyE") K._wall = true; if (code === "KeyX") K._core = true; } if (code === "KeyZ" && !e.repeat) ping("fa"); if (code === "KeyB" && !e.repeat && !P.titan) ping("fb"); if (code === "KeyX" && !P.titan) startNade(); if (code === "KeyG" && !e.repeat) { gDownT = performance.now(); WHEEL.x = WHEEL.y = 0; WHEEL.was = WHEEL.armed = WHEEL.dbl = false; setTimeout(() => { if (gDownT && performance.now() - gDownT >= 190) { WHEEL.on = true; wheelDraw(); } }, 200); }
  if (!P.titan && (code === "Digit1" || code === "Digit2" || code === "Digit3")) startSwap(code === "Digit1" ? 0 : code === "Digit2" ? 1 : 2); if (code === "KeyQ" && !P.titan && !e.repeat) useKit();
  if (!runOn && !runDone && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) runOn = true; });
addEventListener("keyup", (e) => { K[e.code === "ControlLeft" ? "KeyC" : e.code] = false; MAP.keys[e.code] = false; });
addEventListener("blur", () => { for (const k in K) K[k] = false; mouseDown = false; });
cv.addEventListener("mousedown", (e) => { if (!started || panelOpen) return; if (!locked && !noLock) { wantLock(); return; } if (e.button === 1) { e.preventDefault(); ping("near"); } if (e.button === 0) mouseDown = true; if (e.button === 2 && P.titan) K._rockets = true; if (e.button === 2 && !P.titan) P.adsHeld = true; });
addEventListener("mouseup", (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) P.adsHeld = false; });
addEventListener("mousemove", (e) => { if (WHEEL.on) { WHEEL.x = clamp(WHEEL.x + e.movementX, -90, 90); WHEEL.y = clamp(WHEEL.y + e.movementY, -90, 90); if (WHEEL.y > 55) { if (WHEEL.armed) WHEEL.dbl = true; WHEEL.was = true; } else if (WHEEL.was && WHEEL.y < 20) WHEEL.armed = true; wheelDraw(); return; } if (!active() || MAP.on || P.dead > 0 || P.seq) return; const k = .0022 * CFG.sens * (P.titan ? .8 : 1) * (1 - (P.ads || 0) * pw().zoom * 1.2); P.yaw -= e.movementX * k; P.pitch = clamp(P.pitch - e.movementY * k, -1.5, 1.5); });
cv.addEventListener("contextmenu", (e) => e.preventDefault());

/* ---------- screen furniture ---------- */
const msg = $("msg"); function say(t, secs = 0) { msg.textContent = t; msg.style.display = t ? "block" : "none"; sayT = secs; }
function begin(lock = true) { if (SND) SND.start(); saveLoad(); GARAGE.leave(); started = true; $("start").style.display = "none"; $("hud").style.display = "block"; restart(); if (lock) wantLock(); }
$("go").onclick = () => { if (NET.open) return; begin(); };
const PAINTS = ["#c45a1e", "#3f6f9a", "#5c7f36", "#b0312a", "#c9a03a", "#e2d0ae"];
function buildSetup() { const U2 = FACTIONS[LOAD.side].units, list = LOAD.list[LOAD.side] = LOAD.list[LOAD.side].filter((id) => U2[id]), used = list.reduce((a, id) => a + U2[id].pts, 0), btn = (attr, k, label, on, extra = "") => `<button data-${attr}="${k}" class="${on ? "on" : ""}" ${extra}>${label}</button>`;
  const tags = LOAD.tags[LOAD.side] || (LOAD.tags[LOAD.side] = {}), can = (d) => used + d.pts <= LIST_PTS && list.length < LIST_MAX;
  $("setup").innerHTML = `<section data-pane="faction"><h2>Your faction</h2><div class="tiles">${Object.entries(FACTIONS).map(([k, f]) => `<button data-side="${k}" class="tile ${LOAD.side === k ? "on" : ""}"><b>${f.name}</b><span>${f.blurb}</span></button>`).join("")}</div><p class="note">Each faction has its own battlegroup, kept separately. Alone, the other faction is run by the machine. In a match, players on the same side may bring different factions for now.</p></section>
    <section data-pane="pilot"><h2>Primary weapon</h2><div class="row">${Object.entries(PW).filter(([, w]) => !w.side).map(([k, w]) => btn("wpn", k, w.name, LOAD.weapon === k)).join("")}</div><p class="note">${(PW[LOAD.weapon] || PW.carbine).desc} Hold the right mouse button to aim down the sights: you walk at 3.2 metres a second and the gun tightens up.</p><h2>Tactical kit</h2><div class="row">${Object.entries(KITS).map(([k, d]) => btn("kit", k, d[0], LOAD.kit === k)).join("")}</div><p class="note">${KITS[LOAD.kit][1]}</p><h2>Against Titans</h2><div class="row">${Object.entries(ANTI).map(([k, d]) => btn("anti", k, d[0], LOAD.anti === k)).join("")}</div><p class="note">${ANTI[LOAD.anti][1]} Key 2.</p><h2>Ordnance</h2><div class="row">${Object.entries(ORD).map(([k, d]) => btn("ord", k, d[0], LOAD.ord === k)).join("")}</div><p class="note">${ORD[LOAD.ord][1]} One at a time, 18 seconds to come back. Key X.</p><h2>Also carried</h2><p class="note">A sidearm (key 3) and a knife (F). The knife does 65, or finishes it outright from behind or when you are moving faster than 11 metres a second. You have 125 health, and it starts coming back 4.5 seconds after you were last hit.</p></section>
    <section data-pane="titan"><h2>${mechOf(LOAD.side).name} <span class="pts">${mechOf(LOAD.side).cls} · 10,000 hull in four bars · two dashes</span></h2><p class="note">${mechOf(LOAD.side).desc} V is its melee, and holding B gets you out. At no hull it is doomed: one last bar, and it can still fight. The Nomad, the mech the Coalition will field, is not built yet, so for now both factions walk the Centurion.</p><h2>Paint</h2><div class="row">${PAINTS.map((c) => `<button data-paint="${c}" class="sw ${LOAD.paint === c ? "on" : ""}" style="background:${c}" title="Paint"></button>`).join("")}</div></section>
    <section data-pane="group"><h2>${FACTIONS[LOAD.side].name} battlegroup <span class="pts">${used} of ${LIST_PTS} points · ${list.length} of ${LIST_MAX} cards</span></h2><p class="note">These are the cards you bring. Each has a price here, out of ${LIST_PTS}, and a price in Command Points during the fight. While a squad lives it holds some of your ${SUPCAP} supply. You may bring the same card twice. A card in a fireteam answers its own key in the fight: Z calls Alpha, B calls Beta.</p>
    <div class="cat">${Object.entries(U2).map(([k, d]) => { const cnt = list.filter((x) => x === k).length, ok = can(d), tg = tags[k]; return `<div class="${cnt ? "in" : ""}"><b>${d.icon}</b><span><strong>${d.name}${cnt > 1 ? " ×" + cnt : ""}</strong> <em>${d.pts} points · ${d.cost} CP · ${d.sup} supply</em><br>${d.desc}</span><span class="cbtns"><button data-unit="${k}" ${ok ? "" : "disabled"} class="${cnt ? "on" : ""}">${cnt ? (ok ? "Add another" : "In the group") : ok ? "Add" : "No room"}</button>${cnt ? `<button data-drop="${k}">Remove</button><button data-tag="${k}" class="${tg ? "on" : ""}">${tg === "a" ? "Fireteam Alpha" : tg === "b" ? "Fireteam Beta" : "No fireteam"}</button>` : ""}</span></div>`; }).join("")}</div>
    <h2>Doctrine</h2><div class="row">${Object.entries(PASSIVES).map(([k, d]) => btn("pas", k, d[0], LOAD.passive === k)).join("")}</div><p class="note">${PASSIVES[LOAD.passive][1]}</p>
    <h2>How your troops arrive</h2><div class="row">${Object.entries(DOCTRINES).map(([k, d]) => btn("doc", k, d[0], LOAD.doctrine === k)).join("")}</div><p class="note">${DOCTRINES[LOAD.doctrine][1]} You can change this on the battle map at any time.</p></section>`;
  $("go").disabled = !list.length; GARAGE.refresh(); }
$("setup").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
  if (d.side) LOAD.side = d.side; else if (d.wpn) LOAD.weapon = d.wpn; else if (d.kit) LOAD.kit = d.kit; else if (d.anti) LOAD.anti = d.anti; else if (d.ord) LOAD.ord = d.ord; else if (d.ch) LOAD.chassis = d.ch; else if (d.paint) LOAD.paint = d.paint; else if (d.doc) LOAD.doctrine = d.doc; else if (d.pas) LOAD.passive = d.pas; else if (d.unit) { const l = LOAD.list[LOAD.side], U3 = FACTIONS[LOAD.side].units, used = l.reduce((a, id) => a + (U3[id] ? U3[id].pts : 0), 0); if (U3[d.unit] && used + U3[d.unit].pts <= LIST_PTS && l.length < LIST_MAX) l.push(d.unit); } else if (d.drop) { const l = LOAD.list[LOAD.side], i = l.lastIndexOf(d.drop); if (i >= 0) l.splice(i, 1); } else if (d.tag) { const t = LOAD.tags[LOAD.side] || (LOAD.tags[LOAD.side] = {}); t[d.tag] = t[d.tag] === "a" ? "b" : t[d.tag] === "b" ? "" : "a"; }
  saveLoad(); buildSetup(); });
buildSetup();
$("m-nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (!b) return; { const bay = b.dataset.tab === "pilot" || b.dataset.tab === "titan"; if (bay !== GARAGE.on) { const f = $("m-fade"); f.style.transition = "none"; f.style.opacity = 1; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = "opacity .5s"; f.style.opacity = 0; })); } GARAGE.setTab(b.dataset.tab); } $("m-main").className = "tab-" + b.dataset.tab; for (const q of $("m-nav").querySelectorAll("button")) q.classList.toggle("on", q === b); snd("selector"); });
for (const b of document.querySelectorAll("#m-modes button[data-role]")) { b.classList.toggle("on", (MAPKEY.split("-")[2] || "sa")[1] === b.dataset.role); b.onclick = () => { if ((MAPKEY.split("-")[2] || "sa")[1] === b.dataset.role) return; $("map-role").value = b.dataset.role; $("map-go").click(); }; }
/* Settings: Escape opens it in a match (the browser frees the mouse on Escape, so losing the mouse is the cue), and the
   menu has a button for it. It holds what a player would look for: sound on or off and its levels, mouse speed, view. */
let setOpen = false, setAt = 0;
function slRow(host, label, mn, mx, st, get, set, show = (v) => v) { const row = document.createElement("label"); row.className = "sl"; const a = document.createElement("span"); a.textContent = label; const r = document.createElement("input"); r.type = "range"; r.min = mn; r.max = mx; r.step = st; r.value = get(); const v = document.createElement("span"); v.textContent = show(+r.value);
  r.oninput = () => { set(+r.value); v.textContent = show(+r.value); }; row.append(a, r, v); host.append(row); }
function buildSettings() { const sb = $("s-snd"), mix = $("s-mix"), view = $("s-view"), pc = (v) => Math.round(v * 100) + "%"; mix.innerHTML = view.innerHTML = "";
  if (SND) { const on = !!SND.SET.on; sb.textContent = on ? "Sound is on" : "Sound is off"; sb.className = on ? "on" : ""; mix.style.opacity = on ? 1 : .45; const lv = (k, label, mx = 1.2) => slRow(mix, label, 0, mx, .01, () => SND.SET[k], (v) => { SND.SET[k] = v; SND.applyMix(); SND.saveMix(); }, pc);
    lv("master", "Overall volume"); lv("weapons", "Weapons", 1.5); lv("impacts", "Hits and blasts", 1.5); lv("world", "Troops and machines", 1.5); lv("voice", "Voices", 1.5); lv("ambience", "Wind and weather", 1.5); lv("ui", "Menus and markers", 1.5); }
  else { sb.textContent = "No sound on this browser"; sb.disabled = true; }
  slRow(view, "Mouse speed", .3, 2.5, .05, () => CFG.sens, (v) => { CFG.sens = v; saveCfg(); }); slRow(view, "Field of view", 70, 115, 1, () => CFG.fov, (v) => { CFG.fov = v; saveCfg(); }); slRow(view, "Pixel size", 1, 6, 1, () => CFG.px, (v) => { CFG.px = v; saveCfg(); makeRTs(); });
  const tg = (id, k, label) => { const b = $(id), on = CFG[k] !== 0; b.textContent = label + (on ? " on" : " off"); b.className = on ? "on" : ""; b.onclick = () => { CFG[k] = on ? 0 : 1; saveCfg(); buildSettings(); }; }; tg("s-shadow", "shadows", "Shadows"); tg("s-line", "outlines", "Outlines"); tg("s-fps", "fps", "Frame counter"); $("fps").style.display = CFG.fps ? "block" : "none"; }
{ let n = 0, t0 = performance.now(); const tick = () => { n++; const t = performance.now(); if (t - t0 >= 1000) { if (CFG.fps) $("fps").textContent = Math.round(n * 1000 / (t - t0)) + " fps"; n = 0; t0 = t; } requestAnimationFrame(tick); }; tick(); $("fps").style.display = CFG.fps ? "block" : "none"; }
function openSettings() { if (setOpen) return; if (panelOpen) togglePanel(); setOpen = true; setAt = performance.now(); panelOpen = true; buildSettings(); $("s-tune").style.display = started ? "" : "none"; $("settings").style.display = "block"; if (document.pointerLockElement) document.exitPointerLock(); }
function closeSettings(lock) { if (!setOpen) return; setOpen = false; panelOpen = false; $("settings").style.display = "none"; buildPanel(); if (lock && started) wantLock(); }
$("s-snd").onclick = () => { if (!SND) return; SND.enable(!SND.SET.on); if (SND.SET.on && SND.ctx && SND.ctx.state === "suspended") SND.ctx.resume(); buildSettings(); };
$("s-close").onclick = () => closeSettings(true); $("s-tune").onclick = () => { closeSettings(false); if (started) togglePanel(); }; $("s-lab").onclick = () => { if (SND && SND.lab) { closeSettings(false); SND.lab.open(); } };
$("m-settings").onclick = openSettings;
addEventListener("keydown", (e) => { if (e.code !== "Escape" || e.repeat) return; if (setOpen) { if (performance.now() - setAt > 300) closeSettings(false); } else if (!document.pointerLockElement && (!started || noLock) && !MAP.on) openSettings(); });   // closing with Escape leaves the mouse free: click the field to take it back
function togglePanel() { if (setOpen) return; panelOpen = !panelOpen; $("panel").style.display = panelOpen ? "block" : "none"; if (panelOpen) { if (document.pointerLockElement) document.exitPointerLock(); } else wantLock(); }
const SLIDERS = [["px", "Pixel size", 1, 6, 1], ["fov", "Field of view", 70, 115, 1], ["sens", "Mouse speed", .3, 2.5, .05], ["sprint", "Sprint speed", 6, 14, .5], ["jump", "Jump power", 5, 11, .2],
  ["gravity", "Gravity", 12, 34, 1], ["air", "Air control", .5, 6, .25], ["wallTime", "Wall run time", .6, 4, .05], ["wallSpeed", "Wall run speed", 7, 16, .5], ["wallKick", "Wall kick", 3, 11, .5], ["slideBoost", "Slide boost", 0, 7, .5]];
const SKIES = [["clear", "Clear"], ["overcast", "Overcast"], ["rain", "Rain"], ["storm", "Storm"], ["snow", "Snow"], ["fog", "Fog"]];
function buildPanel() { const host = $("sliders"); host.innerHTML = "";
  for (const [k, label, mn, mx, st] of SLIDERS) { const row = document.createElement("label"); row.className = "sl"; const a = document.createElement("span"); a.textContent = label; const r = document.createElement("input"); r.type = "range"; r.min = mn; r.max = mx; r.step = st; r.value = CFG[k]; const v = document.createElement("span"); v.textContent = CFG[k];
    r.oninput = () => { CFG[k] = +r.value; v.textContent = r.value; saveCfg(); if (k === "px") makeRTs(); }; row.append(a, r, v); host.append(row); }
  $("t-outline").className = CFG.outlines ? "on" : ""; $("t-pal").className = CFG.palette ? "on" : ""; $("t-block").className = CFG.blocks ? "on" : "";
  const sk = $("skies"); sk.innerHTML = ""; for (const [k, n] of SKIES) { const b = document.createElement("button"); b.textContent = n; b.className = CFG.weather === k ? "on" : ""; b.onclick = () => { CFG.weather = WEATHER.state.weather = k; saveCfg(); buildPanel(); }; sk.append(b); } }
$("t-outline").onclick = () => { CFG.outlines = CFG.outlines ? 0 : 1; saveCfg(); buildPanel(); };
$("t-pal").onclick = () => { CFG.palette = CFG.palette ? 0 : 1; saveCfg(); buildPanel(); };
$("t-block").onclick = () => { CFG.blocks = CFG.blocks ? 0 : 1; saveCfg(); buildPanel(); };
$("t-reset").onclick = () => { Object.assign(CFG, DEF); WEATHER.state.weather = CFG.weather; saveCfg(); buildPanel(); makeRTs(); };
$("t-close").onclick = togglePanel;
if (SND) { const vol = $("t-vol"), volv = $("t-volv"), sb = $("t-snd"), showSnd = () => { vol.value = SND.SET.master; volv.textContent = (+SND.SET.master).toFixed(2); sb.textContent = SND.SET.on ? "Sound is on" : "Sound is off"; sb.className = SND.SET.on ? "on" : ""; };
  vol.oninput = () => { SND.SET.master = +vol.value; SND.applyMix(); SND.saveMix(); showSnd(); }; sb.onclick = () => { SND.enable(!SND.SET.on); showSnd(); };
  $("t-lab").onclick = $("lab").onclick = () => SND.lab.open(); SND.lab.onClose = showSnd; showSnd(); }
$("t-meter").onclick = () => { P.meter = 100; $("t-note").textContent = "Your Titan is ready. Go back to the yard and press V."; };
$("t-copy").onclick = () => { const txt = JSON.stringify(CFG); const done = (ok) => { $("t-note").textContent = ok ? "Copied. Paste it to Claude and the numbers can become the new defaults." : txt; };
  try { navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); } catch (e) { done(false); } };
buildPanel();

const el = Object.fromEntries(["speed", "ammo", "hpfill", "kills", "timer", "state", "cross", "meterfill", "meterlab", "wname", "lab1", "foe", "foefill", "cockpit", "tl", "bl", "br",
  "pn0", "pn1", "pn2", "ck", "ck2", "ck-strip", "ck-rng", "ck-lock", "ck-locklab", "ck-warn", "ck-sys", "ck-radar", "ck-wpn", "ck-vit", "ck-boot", "ck-ammo", "ck-ammoarc", "ck-sharc", "ck-frame"].map((k) => [k, $(k)]));
let hudT = 0, warnKey = "";
{ let h = ""; for (let d = -360; d <= 720; d += 15) { const n = ((d % 360) + 360) % 360; h += `<span style="left:${(d + 360) * 4}px">${n % 90 === 0 ? "NESW"[n / 90] : n % 45 === 0 ? n : "·"}</span>`; } el["ck-strip"].innerHTML = h; }
const TRI = '<svg viewBox="0 0 20 18" width="15" height="13"><path d="M10 1.5 18.5 16.5H1.5Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6.5v5M10 13.5v1.2" stroke="currentColor" stroke-width="2"/></svg>';
const segs = (n, of, ch = "▮") => `<b>${ch.repeat(Math.max(0, n))}</b><i>${ch.repeat(Math.max(0, of - n))}</i>`;
const flick = (u) => (u < 0 ? 1 : u < .15 ? .25 : u < .3 ? .9 : u < .45 ? .4 : u < .6 ? .8 : u < .85 ? (.85 - u) * 2 : 0);
const rctx = el["ck-radar"].getContext("2d");
function cockpit(dt) {
  CK.t += dt; CK.glitch = Math.max(0, CK.glitch - dt); const t = P.titan, on = CK.mode !== "off" && !MAP.on; $("hud").classList.toggle("mapon", MAP.on);
  el.cockpit.style.display = on ? "block" : "none"; el.tl.style.display = el.bl.style.display = el.br.style.display = on ? "none" : "block"; el.cross.style.display = on ? "none" : "block"; msg.style.top = on ? "28%" : "22%"; if (!on) return;
  let op = [0, 0, 0], hud = 1, frame = 1;
  if (CK.mode === "dark") { const k = clamp(CK.t / .45, 0, 1); op = [k, k, k]; hud = 0; frame = k; }
  else if (CK.mode === "boot") { op = [flick((CK.t - .4) / .5), flick((CK.t - .12) / .5), flick((CK.t - .56) / .5)]; hud = CK.t < .75 ? 0 : CK.t < 1.05 ? (rnd() < .6 ? 1 : .2) : 1; if (CK.t > 1.5) CK.mode = "on"; }
  else if (CK.mode === "shut") { const k = clamp(CK.t / .3, 0, 1); op = [k, k * k, k]; hud = 1 - k; }
  else if (CK.glitch > 0) { op = [rnd() * .35, rnd() * .2, rnd() * .35]; el.ck.style.transform = `translate(${(rnd() - .5) * 8}px, ${(rnd() - .5) * 4}px)`; } else el.ck.style.transform = "";
  el.pn0.style.opacity = op[0]; el.pn1.style.opacity = op[1]; el.pn2.style.opacity = op[2]; el.ck.style.opacity = el.ck2.style.opacity = hud; el["ck-frame"].style.opacity = frame;
  const bt = el["ck-boot"]; if (CK.mode === "boot" && CK.t < 1.45) { bt.style.display = "block"; bt.innerHTML = ["REACTOR ONLINE", "PILOT LINK ESTABLISHED", "WEAPONS FREE"].filter((_, i) => CK.t > .2 + i * .3).join("<br>"); } else bt.style.display = "none";
  if (!t) return;
  // the bracket: whatever hostile thing is nearest the middle of the view and in sight
  cam.getWorldDirection(_f); _o.copy(cam.position).divideScalar(U); let best = .26, lock = null, lp = null, ld = 0;
  const tryLock = (pt, ref) => { _d.copy(pt).sub(_o); const d = _d.length(); _d.divideScalar(d); const a = Math.acos(clamp(_d.dot(_f), -1, 1)); if (a < best && rayWorld(_o, _d, d) >= d - .01) { best = a; lock = ref; lp = pt; ld = d; } };
  for (const o of TITANS) if (o.team === "foe" && o.alive) tryLock(V3(o.pos.x, o.pos.y + o.h * .55, o.pos.z), o);
  for (const g of GRUNTS) if (g.s.dead < 0) { const q = g.s.root.position; tryLock(V3(q.x / U, q.y / U + 1, q.z / U), g); }
  const L = el["ck-lock"]; if (lock) { const v = toU(lp).project(cam), size = clamp((lock.s ? 2.2 : 7) / ld * innerHeight * .62, 26, innerHeight * .7); L.style.display = "block"; L.style.left = (v.x * .5 + .5) * innerWidth - size / 2 + "px"; L.style.top = (-v.y * .5 + .5) * innerHeight - size / 2 + "px"; L.style.width = L.style.height = size + "px"; L.className = best < .06 ? "hot" : "";
    el["ck-locklab"].textContent = (lock.s ? "INFANTRY" : "HOSTILE TITAN " + Math.round((lock.hull + lock.shield) / (lock.hullMax + 150) * 100) + "%") + "  " + Math.round(ld) + " M"; } else L.style.display = "none";
  el["ck-strip"].style.transform = `translateX(${-((((-P.yaw * 180 / Math.PI) % 360) + 360) % 360 + 360) * 4}px)`;
  hudT -= dt; if (hudT > 0) return; hudT = .08;
  aimRay(0); const rng = rayWorld(_o, _d, 300); el["ck-rng"].textContent = rng >= 300 ? "RNG ---" : "RNG " + Math.round(rng) + " M";
  el["ck-ammo"].textContent = t.reload > 0 ? "--" : t.ammo; el["ck-ammoarc"].setAttribute("stroke-dasharray", (t.reload > 0 ? (1 - t.reload / 2.2) : t.ammo / 24) * 88 + " 400"); el["ck-sharc"].setAttribute("stroke-dasharray", t.shield / 150 * 88 + " 400");
  const foe = TITANS.find((o) => o.team === "foe"), W = [];
  if (t.hitT < 1) W.push(["red", "INCOMING FIRE"]); if (t.hull < t.hullMax * .35 || t.doomed) W.push(["red", t.doomed ? "DOOMED: HOLD B TO GET OUT" : "HULL CRITICAL"]); if (t.core >= 1) W.push(["amber", "CORE READY: X"]); if (foe) W.push(["amber", "HOSTILE TITAN ON FIELD"]); if (DROPS.some((D) => D.team === "foe")) W.push(["amber", "TITANFALL DETECTED"]); if (t.reload > 0) W.push(["", "RELOADING"]);
  const key = W.map((w) => w[1]).join("|"); if (key !== warnKey) { warnKey = key; el["ck-warn"].innerHTML = W.map(([c, x]) => `<div class="${c}">${TRI}${x}</div>`).join(""); }
  el["ck-sys"].innerHTML = `<u>CENTURION · ${t.doomed ? "DOOMED" : Math.ceil(t.hull / BAR) + " OF " + Math.round(t.hullMax / BAR) + " BARS"}</u>Q SALVO ${t.rk > 0 ? Math.ceil(t.rk) + "s" : "ready"} · E WALL ${t.vortex > 0 ? "up" : t.vortexCd > 0 ? Math.ceil(t.vortexCd) + "s" : "ready"}<br>F PULSE ${t.pulseCd > 0 ? Math.ceil(t.pulseCd) + "s" : "ready"} · X CORE ${Math.round(t.core * 100)}%<br>V MELEE · HOLD B: OUT<br>LINK &nbsp;&nbsp; PILOT ${segs(4, 4)}<br>REACTOR ${Math.round(60 + t.hull / t.hullMax * 38)}%<br>DASH &nbsp;&nbsp; ${segs(t.dash, t.dashMax, "■")}<br><br>SECTOR &nbsp;${Math.min(OP.sector + 1, SECN)} OF ${SECN}<br>TICKETS ${OP.tickets}<br>POINTS &nbsp;${POINTS.filter((p) => p.sector === OP.sector).map((p) => (p.owner === "you" ? p.name : p.owner === "foe" ? p.name.toLowerCase() : "·")).join(" ")}<br>CP &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${Math.floor(B.supply.you)}<br><br>TAB &nbsp;&nbsp;&nbsp;COMMAND`;
  el["ck-wpn"].innerHTML = `<u>40 MM CANNON</u><em>${t.reload > 0 ? "RELOAD" : t.ammo + " / 18"}</em><span class="pips">${segs(t.reload > 0 ? 0 : t.ammo, 18)}</span><u>ROCKET POD</u><em class="${t.rk <= 0 ? "" : "dim"}">${t.rk <= 0 ? "READY" : "LOADING"}</em><span class="pips">${segs(t.rk <= 0 ? 6 : Math.floor((1 - t.rk / 8) * 6), 6, "◆")}</span><u>FIST</u><em class="${t.punchCd <= 0 ? "" : "dim"}">${t.punchCd <= 0 ? "READY" : "..."}</em><small>LMB &nbsp;RMB &nbsp;F</small>`;
  el["ck-vit"].innerHTML = `<div><label>CORE</label><span class="sh">${segs(Math.floor(t.core * 15), 15)}</span><label>${Math.round(t.core * 100)}%</label></div><div class="${t.doomed ? "crit" : ""}"><label>${t.doomed ? "DOOMED" : "HULL"}</label><span class="hu">${segs(Math.ceil(t.hull / (t.doomed ? BAR : t.hullMax) * 20), 20)}</span><label>${Math.round(t.hull)}</label></div>`;
  // radar: what is around, turned so that ahead is up
  const c = rctx, R = 78; c.clearRect(0, 0, 160, 160); c.strokeStyle = "rgba(143,224,240,.55)"; c.lineWidth = 1; for (const r of [R, R * .66, R * .33]) { c.beginPath(); c.arc(80, 80, r, 0, 6.3); c.stroke(); } c.beginPath(); c.moveTo(80, 2); c.lineTo(80, 158); c.moveTo(2, 80); c.lineTo(158, 80); c.stroke();
  const fxx = -Math.sin(P.yaw), fzz = -Math.cos(P.yaw), blip = (x, z, col, sz) => { const dx = x - t.pos.x, dz = z - t.pos.z, px = (dx * -fzz + dz * fxx) / 60 * R, py = (dx * fxx + dz * fzz) / 60 * R, l = Math.hypot(px, py), k = l > R ? R / l : 1; c.fillStyle = col; c.fillRect(80 + px * k - sz / 2, 80 - py * k - sz / 2, sz, sz); };
  for (const g of GRUNTS) if (g.s.dead < 0) blip(g.s.root.position.x / U, g.s.root.position.z / U, "#e05a3a", 4); if (foe) blip(foe.pos.x, foe.pos.z, "#ff3a3a", 9); c.fillStyle = "#8fe0f0"; c.beginPath(); c.moveTo(80, 73); c.lineTo(85, 86); c.lineTo(75, 86); c.fill();
}
function hud(dt) { el.cross.className = hitT > 0 ? "hit" : ""; if (sayT > 0) { sayT -= dt; if (sayT <= 0) say(""); } cockpit(dt); if (P.titan || CK.mode !== "off") { el.state.textContent = ""; el.foe.style.display = "none"; return; }
  hudT -= dt; if (hudT > 0) return; hudT = .08; const m = P.mine;
  el.lab1.textContent = "Pilot"; el.hpfill.style.width = P.hp / HP * 100 + "%"; el.speed.textContent = hs().toFixed(1); el.wname.textContent = (P.weapon === 1 ? ANTI[LOAD.anti][0] : pw().name) + " · 1 2 3 · " + ORD[LOAD.ord][0] + (P.ordCd > 0 ? " " + Math.ceil(P.ordCd) + " s" : " ready") + " (X) · " + KITS[LOAD.kit][0] + (P.kitCd > 0 ? " " + Math.ceil(P.kitCd) + " s" : " ready") + " (Q)"; el.ammo.textContent = P.weapon === 1 ? (P.charge > 0 ? (LOAD.anti === "seeker" ? "locking " + Math.round(P.charge * 100) + "%" : "charging") : P.fireCd > 0 ? "cooling" : "ready") : P.reload > 0 ? "reloading" : P.ammo + " / " + pw().mag;
  el.kills.innerHTML = opLine(); el.timer.textContent = "CP " + Math.floor(B.supply.you) + " · supply " + supUsed("you") + "/" + SUPCAP + " · G: ping · Tab: command";
  el.meterfill.style.width = (m ? 100 : P.meter) + "%"; el.meterlab.textContent = m ? "Titan: standing by" : DROPS.some((D) => D.team === "you") ? "Titan: on its way" : P.meter >= 100 ? "Titan ready: press V" : "Titan " + Math.floor(P.meter) + "%";
  const foe = TITANS.find((o) => o.team === "foe"); el.foe.style.display = foe ? "block" : "none"; if (foe) el.foefill.style.width = (foe.hull + foe.shield) / 5 + "%"; 
  const near = !P.seq && m && m.alive && m.doom <= 0 && Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 7;
  el.state.textContent = !locked && !noLock && !panelOpen ? "CLICK TO TAKE THE MOUSE BACK" : near ? "PRESS E TO CLIMB IN" : P.wall ? "WALL RUN" : P.mantle ? "CLIMB" : P.sliding ? "SLIDE" : ""; }

/* ---------- frame ---------- */
const H = 1 / 120; let acc = 0, last = performance.now(), menuSpin = 0;
function advance(dt) {
  if (active() || (B.mp && started)) { acc += dt; while (acc >= H) { stepPilot(H); acc -= H; } stepGun(dt); stepBattle(dt); stepTitans(dt); if (!B.mp && !foeCalled && B.time > 100 && !B.over) callFoe(); if (!P.mine && !B.over) P.meter = Math.min(100, P.meter + .8 * dt); if (B.mp) netTick(dt); }
  try { SOL.update(dt); } catch (e) { if (!advance.w1) { advance.w1 = 1; console.error("[soldiers]", e); } }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
  if (!window.__hold) advance(dt);
  hurtFx = Math.max(0, hurtFx - dt * 1.6); coolFx = Math.max(0, coolFx - dt * 2.5); P.shake = Math.max(0, P.shake - dt * 1.5);
  if (!started) { menuSpin += dt * .06; if (!GARAGE.step(dt)) { cam.position.set(Math.sin(menuSpin) * 30 * U, 12 * U, (Math.cos(menuSpin) * 30 + 4) * U); cam.rotation.set(-.28, menuSpin, 0); } gun.visible = cannon.visible = false; VS.visible = false; VM.step(dt, VS); }
  else if (MAP.on) { mapCamera(dt); mapFrame(dt); gun.visible = cannon.visible = fist.visible = flashM.visible = false; VS.visible = false; VM.step(dt, VS); }
  else if (seqCam()) { const [p, yaw, pitch] = seqCam(); cam.position.set(p.x * U, p.y * U, p.z * U); cam.rotation.set(pitch, yaw, 0); if (Math.abs(cam.fov - 84) > .05) { cam.fov = lerp(cam.fov, 84, 1 - Math.exp(-dt * 6)); cam.updateProjectionMatrix(); } }
  else { const t = P.titan, sh = P.shake * .06;
    const wallRoll = P.wall ? -(P.wall.ax === 0 ? P.wall.n * Math.cos(P.yaw) : -P.wall.n * Math.sin(P.yaw)) * .2 : 0;
    P.roll = lerp(P.roll, wallRoll + (P.sliding ? .04 : 0), 1 - Math.exp(-dt * 10)); P.dip = Math.max(0, P.dip - dt * .9);
    P.eye = t ? t.eye - TITAN.KNEEL * Math.max(t.kneel, ease(t.land) * .7) : lerp(Math.min(P.eye, 1.8), P.h - .12 - (P.dead > 0 ? .9 : 0), 1 - Math.exp(-dt * 14));
    const moving = P.grounded && !P.sliding && !t ? Math.min(1, hs() / 9) : 0, bob = t ? Math.abs(Math.sin(t.walk * 1.1)) * .09 : Math.abs(Math.sin(P.bob)) * .035 * moving;
    cam.position.set(P.pos.x * U, (P.pos.y + P.eye - P.dip + bob) * U, P.pos.z * U); cam.rotation.set(P.pitch + VM.cam.pitch + (rnd() - .5) * sh, P.yaw + (rnd() - .5) * sh, P.roll + VM.cam.roll + (P.dead > 0 ? .5 : 0) + (rnd() - .5) * sh);
    const fov = !started && GARAGE.on ? GARAGE_FOV : (t ? 88 : CFG.fov * (1 - (P.ads || 0) * (P.weapon === 1 ? .3 : pw().zoom))) + clamp((hs() - 9) / 8, 0, 1) * 9 * (1 - (P.ads || 0)) + (P.stimT > 0 ? 6 : 0); if (Math.abs(cam.fov - fov) > .05) { cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 6)); cam.updateProjectionMatrix(); } }
  const t = P.titan;
  render(clock, dt, Math.max(MAP.on ? 0 : hurtFx, P.dead > 0 && !MAP.on ? .8 : 0, t ? (1 - t.hull / t.hullMax) * .4 : (1 - P.hp / HP) * .5), Math.max(coolFx, P.charge * .6), MAP.on);
  if (SND) { cam.getWorldDirection(_f); SND.listener(cam.position.x / U, cam.position.y / U, cam.position.z / U, _f.x, _f.y, _f.z); }
  if (started) hud(dt);
}
buildPass(); setHomes(); respawn();
{ const bad = fieldTest(); if (bad.length) { console.warn("[field] " + MAPKEY + " salt " + SALT + ": " + bad.join("; ")); if (!retryField()) window.__fieldBad = bad; } else console.log("[field] " + MAPKEY + " salt " + SALT + ": every point can be reached"); }

/* ---------- more than one player ----------
   Up to four: two sides of one or two. Each player's own pilot and Titan run on their own machine and are sent to the
   others about twenty times a second, by way of the host. A hit is decided on the screen of the one who fired. The
   battle itself runs on the host (see mf/battle.js). A player whose link drops keeps their place, their troops stay on
   the field, and they are let back in when their browser finds the host again. */
const MY = { slot: 0, team: 0, south: true, name: "", token: (() => { try { if (/[?&]local/.test(location.search)) throw 0; let t = localStorage.getItem("afterburn-token"); if (!t) { t = Math.random().toString(36).slice(2, 12); localStorage.setItem("afterburn-token", t); } return t; } catch (e) { return Math.random().toString(36).slice(2, 12); } })() };
let ROSTER = [], mpOn = false;   // everyone in the match: { slot, name, team, kit, here } and, on the host, { id, token }
const RPS = new Map(), keyOf = (slot) => (slot === 0 ? "you" : "p" + slot), slotOf = (id) => { const r = ROSTER.find((q) => q.id === id); return r ? r.slot : -1; };
const myKit = () => ({ fac: LOAD.side, list: LOAD.list[LOAD.side].slice(), doctrine: LOAD.doctrine, passive: LOAD.passive, chassis: LOAD.chassis, paint: LOAD.paint });
const relSide = (hostSide) => ((hostSide === "you") === MY.south ? "you" : "foe");   // the host's side names, as this screen sees them
const ONE = { phit: 1, thit: 1 };   // messages meant for one player; the rest are for everybody
// send something to the player it is for, or to everyone, whichever this player is
function relay(k, d, sure = true) { if (!B.mp) return; if (B.mp === "guest") return send(k, d, sure); if (ONE[k]) { const r = ROSTER.find((q) => q.slot === d[0]); if (r && r.id) send(k, d, sure, r.id); } else send(k, [0, d], sure); }
function mkRP(r) { const rp = { slot: r.slot, name: r.name, kit: r.kit || {}, side: r.team === MY.team ? "you" : "foe", on: false, seen: 0, pos: V3(), net: V3(), chest: V3(), yaw: 0, pitch: 0, h: 1.8, dead: false, grounded: true, sliding: false, wall: 0, speed: 0, vy: 0, djN: 0, djT: 9, inTitan: false, fig: null, titan: null, pk: null,
    get ok() { return this.on && !this.dead && !this.inTitan; } }; RPS.set(r.slot, rp); return rp; }
function dropRP(rp) { if (rp.fig) { rp.fig.dispose(); rp.fig = null; } if (rp.titan) { scene.remove(rp.titan.rig.root); const i = TITANS.indexOf(rp.titan); if (i >= 0) TITANS.splice(i, 1); rp.titan = null; } }
function setRoster(list) { for (const rp of RPS.values()) dropRP(rp); RPS.clear(); ROSTER = list; const me = ROSTER.find((r) => r.slot === MY.slot); if (me) MY.team = me.team; for (const r of ROSTER) if (r.slot !== MY.slot) mkRP(r); }
function rpHit(o, d, best) { let rp = null; if (B.mp) for (const q of RPS.values()) { if (!q.ok || q.side === "you") continue; const p = q.pos, t = rayBox(o, d, [p.x - .42, p.y, p.z - .42], [p.x + .42, p.y + q.h, p.z + .42], best); if (t < best) { best = t; rp = q; } } return { best, hit: !!rp, rp }; }
function netShot(end, kind) { if (B.mp) relay("sh", [+P.pos.x.toFixed(1), +(P.pos.y + P.h * .8).toFixed(1), +P.pos.z.toFixed(1), +end.x.toFixed(1), +end.y.toFixed(1), +end.z.toFixed(1), kind], false); }
const r2 = (v) => +v.toFixed(2);
let djN = 0, wasDouble = true;
function myPacket() { if (wasDouble && !P.canDouble && !P.grounded) djN++; wasDouble = P.canDouble; const t = P.mine && P.mine.alive ? P.mine : null, w = P.wall ? Math.sign(-(P.wall.ax === 0 ? P.wall.n * Math.cos(P.yaw) : -P.wall.n * Math.sin(P.yaw))) : 0;
  return [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), r2(P.yaw), r2(P.pitch), r2(P.h), (P.dead > 0 ? 1 : 0) | (P.grounded ? 2 : 0) | (P.sliding ? 4 : 0) | (P.titan || P.seq ? 8 : 0), +hs().toFixed(1), w, djN, +P.vel.y.toFixed(1),
    t ? [r2(t.pos.x), r2(t.pos.y), r2(t.pos.z), r2(t.yaw), +t.vel.x.toFixed(1), +t.vel.z.toFixed(1), r2(t.kneel), r2(t.hatch), r2(t.aimYaw), r2(t.aimPitch), Math.round(t.shield), Math.round(t.hull), t.hullMax, (t.doom > 0 ? 1 : 0) | (t === P.titan ? 2 : 0)] : 0]; }
function applyPk(rp, a) { rp.pk = a; rp.net.set(a[0], a[1], a[2]); if (!rp.on) rp.pos.copy(rp.net); rp.on = true; rp.seen = performance.now(); rp.yaw = a[3]; rp.pitch = a[4]; rp.h = a[5]; rp.dead = !!(a[6] & 1); rp.grounded = !!(a[6] & 2); rp.sliding = !!(a[6] & 4); rp.inTitan = !!(a[6] & 8); rp.speed = a[7]; rp.wall = a[8]; if (a[9] !== rp.djN) { rp.djN = a[9]; rp.djT = 0; } rp.vy = a[10];
  const tn = a[11]; if (tn) { if (!rp.titan) { const t = makeTitan(rp.side, tn[0], tn[2], tn[3], rp.kit); t.remote = rp.slot; t.pos.y = tn[1]; t.land = 0; rp.titan = t; } rp.titan.net = tn; } else if (rp.titan) { const t = rp.titan; rp.titan = null; const i = TITANS.indexOf(t); if (i >= 0) TITANS.splice(i, 1); blast(V3(t.pos.x, t.pos.y + 2.5, t.pos.z), 5, {}); chunksFx(toU(t.pos).setY(t.pos.y * U + 60), "#34373a", 8, 90); t.rig.wreck(); HUSKS.push(t.rig); } }
// a Titan that belongs to someone else: it goes where its owner's machine says it is
function stepPuppet(t, dt) { const n = t.net; if (n) { const k = 1 - Math.exp(-dt * 12); t.pos.x += (n[0] - t.pos.x) * k; t.pos.y += (n[1] - t.pos.y) * k; t.pos.z += (n[2] - t.pos.z) * k; let dy = (n[3] - t.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; t.yaw += dy * k;
    t.vel.set(n[4], 0, n[5]); t.kneelTo = n[6]; t.hatchTo = n[7]; t.aimYaw = n[8]; t.aimPitch = n[9]; t.shield = n[10]; t.hull = n[11]; t.hullMax = n[12]; t.doom = n[13] & 1 ? 1 : 0; } placeTitan(t, dt); }
function stepRemote(dt) { const now = performance.now(); for (const rp of RPS.values()) { if (rp.on && now - rp.seen > 2500) rp.on = false; if (!rp.on) { if (rp.fig) rp.fig.root.visible = false; continue; }
    rp.pos.lerp(rp.net, rp.pos.distanceTo(rp.net) > 12 ? 1 : 1 - Math.exp(-dt * 18)); rp.chest.set(rp.pos.x, rp.pos.y + rp.h * .6, rp.pos.z); rp.djT += dt;
    if (!rp.fig) rp.fig = makeFigure(rp.kit.fac, rp.side === "foe", rp.kit.paint);
    rp.fig.pose(dt, { x: rp.pos.x, y: rp.pos.y, z: rp.pos.z, yaw: rp.yaw, pitch: rp.pitch, speed: rp.speed, grounded: rp.grounded, sliding: rp.sliding, crouch: rp.h < 1.5 && !rp.sliding, wall: rp.wall, dj: rp.djT, vy: rp.vy, dead: rp.dead, hidden: rp.inTitan }); } }
let netT = 0, snapT = 0, pingT = 0;
function netTick(dt) { stepRemote(dt); netT += dt; snapT += dt; pingT += dt;
  if (netT >= .05) { netT = 0; const pk = myPacket(); if (B.mp === "guest") send("p", pk, false); else send("pp", [[0, pk], ...ROSTER.filter((r) => r.here && r.slot && RPS.get(r.slot) && RPS.get(r.slot).pk).map((r) => [r.slot, RPS.get(r.slot).pk])], false); }
  if (B.mp === "host" && snapT >= .1) { snapT = 0; for (const r of ROSTER) if (r.id && r.here) send("snap", snapshot(keyOf(r.slot)), false, r.id); }
  if (pingT >= 1) { pingT = 0; const n = ROSTER.filter((r) => r.here !== false).length; $("tr").textContent = (B.mp === "host" ? "Hosting " + NET.code : "In " + NET.code + "  ·  ping " + NET.ping + " ms") + "  ·  " + n + " of " + ROSTER.length + " here  ·  Esc: free the mouse"; } }
// what happens on this screen when another player does something
const ACT = {
  sh: (slot, a) => { const from = V3(a[0] * U, a[1] * U, a[2] * U), to = V3(a[3] * U, a[4] * U, a[5] * U); tracer(from, to, a[6] ? "#8fe0f0" : "#ffb890", a[6] ? 30000 : 9000, a[6] ? 1.6 : .5); flash(from, a[6] ? "#8fe0f0" : "#ffc477", 900, .06); snd("grunt_shot", { pos: [a[0], a[1], a[2]] }); },
  back: (slot) => { const rp = RPS.get(slot); if (rp && B.mp === "host") spend(rp.side, 1); },
  pdown: (slot) => { const rp = RPS.get(slot); if (!rp) return; if (B.mp === "host") for (const w of B.cmds) if (B.side[w] !== rp.side) credit(w, 40 / Math.max(1, B.cmds.filter((k) => B.side[k] !== rp.side).length)); if (rp.side === "foe") { snd("kill"); say("An enemy pilot is down.", 2.5); } else say((rp.name || "Your teammate") + " is down.", 2.5); },
  tdrop: (slot, a) => { const rp = RPS.get(slot); if (!rp) return; callTitan(rp.side, a[0], a[1], a[2]); DROPS[DROPS.length - 1].ghost = true; say(rp.side === "foe" ? "An enemy Titan is dropping." : (rp.name || "Your teammate") + " has called a Titan.", 3); },
  tfx: (slot, a) => { const rp = RPS.get(slot), t = rp && rp.titan; if (!t) return;
    if (a[0] === 0) { const from = muzzleOf(t), end = V3(a[1], a[2], a[3]); tracer(from, toU(end), "#ffd890", 9000, 1.5); flash(from, "#ffc477", 3200, .1); t.recoil = 1; snd("cannon", { pos: [t.pos.x, t.pos.y + 4, t.pos.z] }); later(.03, () => blast(end, 2.2, {})); }
    else if (a[0] === 1) { const from = V3(a[1], a[2], a[3]), tgt = V3(a[4], a[5], a[6]), m = fxLayer(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2, .8) }))); scene.add(m); ROCKETS.push({ pos: from, vel: tgt.clone().sub(from).normalize().multiplyScalar(14).add(V3(0, 10, 0)), tgt, team: null, ghost: true, t: 0, mesh: m }); snd("rocket", { pos: xyz(from) }); }
    else if (a[0] === 2) { t.punch = .45; } },
  nade: (slot, a) => { const rp = RPS.get(slot); mkNade(V3(a[0], a[1], a[2]), V3(a[3], a[4], a[5]), null, a[6] || 1.7, !!a[7], rp ? rp.side : null); } };
for (const k in ACT) onMsg(k, (m, from) => { if (B.mp === "host") { const slot = slotOf(from); if (slot < 0) return; ACT[k](slot, m); send(k, [slot, m], k !== "sh", null, from); } else if (B.mp === "guest" && m[0] !== MY.slot) ACT[k](m[0], m[1]); });
for (const k in ONE) onMsg(k, (a, from) => { if (B.mp === "host" && a[0] !== 0) { const r = ROSTER.find((q) => q.slot === a[0]); if (r && r.id) send(k, a, true, r.id); return; } if (!B.mp) return; if (k === "phit") hurtPilot(a[1] * (a[2] ? 1.25 : 1)); else if (P.mine) hurtTitan(P.mine, a[1], true); });
onMsg("p", (a, from) => { const rp = RPS.get(slotOf(from)); if (rp && B.mp === "host") applyPk(rp, a); });
onMsg("pp", (list) => { if (B.mp !== "guest") return; for (const [slot, pk] of list) { const rp = RPS.get(slot); if (rp && pk) applyPk(rp, pk); } });
onMsg("snap", (o) => { if (B.mp === "guest") applySnap(o); });
onMsg("util", (a, from) => { if (B.mp === "guest") useUtil(a[0], V3(a[1], 0, a[2]), a[3] || undefined, relSide(a[4]), true); else if (B.mp === "host" && slotOf(from) > 0) netIn.util(a, keyOf(slotOf(from))); });
for (const k of ["dep", "doc", "order", "act"]) onMsg(k, (a, from) => { if (B.mp === "host" && slotOf(from) > 0) netIn[k](a, keyOf(slotOf(from))); });
onMsg("hit", (a, from) => { const slot = slotOf(from), rp = RPS.get(slot); if (B.mp === "host" && rp) netIn.hit(a, keyOf(slot), V3(rp.pos.x * U, rp.pos.y * U, rp.pos.z * U)); });

/* the room before a match, and getting into one */
const mpNote = (t) => { $("mp-status").textContent = t; };
function showRoster() { const el = $("mp-roster"); if (!ROSTER.length) { el.innerHTML = ""; $("mp-start").style.display = $("mp-team").style.display = "none"; return; }
  const row = (r) => `<div class="${r.team ? "foe" : "you"}">${r.slot === MY.slot ? "▸ " : ""}${(r.name || "Player " + (r.slot + 1)).replace(/[<>&]/g, "")}${r.slot === 0 ? " (host)" : ""}${r.here === false ? " (dropped)" : ""}</div>`;
  el.innerHTML = `<div><div class="lab">Side one</div>${ROSTER.filter((r) => !r.team).map(row).join("") || "<div class=\"dim\">nobody yet</div>"}</div><div><div class="lab">Side two</div>${ROSTER.filter((r) => r.team).map(row).join("") || "<div class=\"dim\">nobody yet</div>"}</div>`;
  $("mp-team").style.display = started ? "none" : ""; $("mp-start").style.display = NET.role === "host" && !started ? "" : "none"; }
const lobbyOut = () => { for (const r of ROSTER) if (r.id) send("lobby", { you: r.slot, map: MAPKEY, salt: SALT, players: ROSTER.map(({ slot, name, team, here }) => ({ slot, name, team, here })) }, true, r.id); showRoster(); };
const startMsg = (r, back) => ({ map: MAPKEY, salt: SALT, slot: r.slot, duo: B.duo, south: r.team === ROSTER[0].team, back: !!back, roster: ROSTER.map(({ slot, name, team, kit, here }) => ({ slot, name, team, kit, here })) });
function mpBegin(role) { B.mp = role; mpOn = true; B.flip = !MY.south; if (role === "host") B.roster = ROSTER.map((r) => ({ key: keyOf(r.slot), side: r.team === ROSTER[0].team ? "you" : "foe", ...(r.kit || {}) })); begin(false); showRoster(); }
function hostStart(again) { if (ROSTER.length < 2) { mpNote("Wait for at least one other player to join."); return; } if (!ROSTER.some((r) => r.team !== ROSTER[0].team)) { mpNote("Both sides need at least one player. Someone has to switch sides."); return; }
  ROSTER[0].kit = myKit(); B.duo = ROSTER.length > 2; MY.slot = 0; MY.south = true; MY.team = ROSTER[0].team; const list = ROSTER; setRoster(list); for (const r of ROSTER) if (r.id) send(again ? "again" : "start", startMsg(r), true, r.id);
  if (again) { B.roster = ROSTER.map((r) => ({ key: keyOf(r.slot), side: r.team === ROSTER[0].team ? "you" : "foe", ...(r.kit || {}) })); restart(); } else mpBegin("host"); say(again ? "The match starts again." : "The match is on.", 3); }
onMsg("_join", () => {});
onMsg("hello", (m, from) => { if (NET.role !== "host") return; let r = ROSTER.find((q) => q.token === m.token && q.slot);
  if (r) { r.id = from; r.here = true; r.kit = started ? r.kit : m.kit; r.name = m.name || r.name; B.away[keyOf(r.slot)] = false; if (started) { send("start", startMsg(r, true), true, from); say((r.name || "A player") + " is back in.", 3); } lobbyOut(); return; }
  if (started) { send("no", "That match has already started.", true, from); return; } if (ROSTER.length >= 4) { send("no", "That match is full.", true, from); return; }
  const slot = [1, 2, 3].find((k) => !ROSTER.some((q) => q.slot === k)), t0 = ROSTER.filter((q) => !q.team).length, t1 = ROSTER.length - t0;
  ROSTER.push({ slot, token: m.token, id: from, name: m.name || "Player " + (slot + 1), team: t1 < t0 ? 1 : 0, kit: m.kit, here: true }); ROSTER.sort((a, b) => a.slot - b.slot); mpNote("Your code is " + NET.code + ". " + (ROSTER.length - 1) + " joined. Start when everyone is in."); lobbyOut(); });
onMsg("_leave", (id) => { const r = ROSTER.find((q) => q.id === id); if (!r) return; if (!started) { ROSTER = ROSTER.filter((q) => q !== r); lobbyOut(); return; } r.here = false; r.id = null; B.away[keyOf(r.slot)] = true; const rp = RPS.get(r.slot); if (rp) rp.on = false; say((r.name || "A player") + " has dropped. Their place is held for them.", 4); lobbyOut(); });
onMsg("team", (x, from) => { if (NET.role !== "host" || started) return; const r = ROSTER.find((q) => q.id === from); if (r && ROSTER.filter((q) => q.team !== r.team).length < 2) { r.team = r.team ? 0 : 1; lobbyOut(); } });
// the host's field is the field: if this page built another one, load the host's and come straight back in
function wrongField(key, salt) { if (key && key === MAPKEY && salt != null && salt !== SALT) { try { sessionStorage.setItem("ab-map-join", key); sessionStorage.setItem("ab-autojoin", JSON.stringify({ code: NET.code, name: MY.name || "" })); } catch (e) { return false; } leave(); return retryField(salt); } if (!key || key === MAPKEY) return false; try { if (salt != null) localStorage.setItem("ab-salt:" + key, salt); } catch (e) {} mpNote("The host is on another field. Loading it and joining again..."); try { sessionStorage.setItem("ab-map-join", key); sessionStorage.setItem("ab-autojoin", JSON.stringify({ code: NET.code, name: MY.name || "" })); } catch (e) { return false; } leave(); setTimeout(() => location.reload(), 300); return true; }
onMsg("lobby", (m) => { if (NET.role !== "guest" || wrongField(m.map, m.salt)) return; MY.slot = m.you; ROSTER = m.players; showRoster(); if (!started) mpNote("You are in. Waiting for the host to start the match."); });
onMsg("no", (why) => { mpNote(why); leave(); ROSTER = []; showRoster(); });
onMsg("start", (m) => { if (NET.role !== "guest" || wrongField(m.map, m.salt)) return; MY.slot = m.slot; MY.south = m.south; B.duo = m.duo; setRoster(m.roster); if (m.back && B.mp === "guest" && started) { B.over = null; say("You are back in.", 3); return; } mpBegin("guest"); say(m.back ? "You are back in." : "The match is on.", 3); });
onMsg("again", (m) => { if (B.mp !== "guest") return; MY.slot = m.slot; MY.south = m.south; B.duo = m.duo; B.flip = !MY.south; setRoster(m.roster); restart(); say("The host has started the match again.", 3); });
const hello = () => send("hello", { token: MY.token, name: MY.name, kit: myKit() });
onMsg("_open", () => { if (mpOn) hello(); });   // the link came back by itself: ask for the same place
onMsg("_close", () => { if (B.mp === "guest" && started) say("The link to the host has dropped. Trying to get back in.", 0); else mpNote("The link to the host has dropped."); });
onMsg("_retry", (secs) => { mpNote("Trying to get back in. " + secs + " seconds left."); });
onMsg("_lost", () => { mpNote("Could not get back in."); if (B.mp && started) { say("Could not get back to the host. Press T to play on alone.", 0); B.over = B.over || "foe"; } });
function again() { if (B.mp === "guest") { if (NET.open) { say("Only the host can start the match again.", 2.5); return; } leave(); B.mp = null; mpOn = false; B.duo = false; B.flip = false; setRoster([]); $("tr").textContent = "P: tuning   T: restart   Esc: free the mouse"; restart(); return; } if (B.mp === "host") { hostStart(true); return; } restart(); }
const nameOf = () => { MY.name = ($("mp-name").value || "").trim().slice(0, 16); try { localStorage.setItem("afterburn-name", MY.name); } catch (e) {} };
try { $("mp-name").value = localStorage.getItem("afterburn-name") || ""; $("mp-code").value = sessionStorage.getItem("afterburn-code") || ""; } catch (e) {}
$("mp-host").onclick = async () => { if (NET.role) return; nameOf(); mpNote("Asking for a code..."); try { const code = await host(); MY.slot = 0; ROSTER = [{ slot: 0, id: null, token: MY.token, name: MY.name || "Player 1", team: 0, kit: myKit(), here: true }]; mpNote("Your code is " + code + ". Give it to the other players, and start when everyone is in."); $("mp-code").value = code; showRoster(); } catch (e) { mpNote(e.message + " Try again."); } };
$("mp-join").onclick = async () => { if (NET.role) return; nameOf(); const code = $("mp-code").value.trim(); if (code.length < 3 && !/[?&]local/.test(location.search)) { mpNote("Type the host's code first."); return; } mpNote("Linking..."); try { await join(code); try { sessionStorage.setItem("afterburn-code", NET.code); } catch (e) {} mpOn = true; mpNote("Linked."); hello(); } catch (e) { mpNote(e.message); } };
$("mp-team").onclick = () => { if (NET.role === "guest") send("team", 0); else if (NET.role === "host") { const r = ROSTER[0]; if (ROSTER.filter((q) => q.team !== r.team).length < 2) { r.team = r.team ? 0 : 1; lobbyOut(); } } };
$("mp-start").onclick = () => hostStart(false);
try { const aj = JSON.parse(sessionStorage.getItem("ab-autojoin") || "null"); if (aj && aj.code) { sessionStorage.removeItem("ab-autojoin"); $("mp-code").value = aj.code; if (aj.name) $("mp-name").value = aj.name; setTimeout(() => $("mp-join").click(), 600); } } catch (e) {}
// choosing the field: a kind and a number. The page loads again with the new field built.
{ const kind = $("map-kind"), num = $("map-num"), size = $("map-size"), role = $("map-role"), cur = MAPKEY.split("-"), tail = cur[2] || "sa"; for (const [k, name] of [["mixed", "Mixed country"], ["town", "Town"], ["works", "Works"], ["airfield", "Airfield"], ["farm", "Farmland"]]) { const o = document.createElement("option"); o.value = k; o.textContent = name; kind.appendChild(o); }
  kind.value = cur[0]; num.value = cur[1] || ""; size.value = tail[0]; role.value = tail[1];
  const go = (n) => pickMap(kind.value + "-" + (String(n).replace(/\D/g, "").slice(0, 6) || "1") + "-" + size.value + role.value);
  $("map-go").onclick = () => go(num.value || "1"); $("map-new").onclick = () => go(1000 + Math.floor(Math.random() * 9000));
  $("map-now").textContent = "You are on " + MAPNAME + ", and you " + (OP.atk === "you" ? "attack" : "defend") + ". " + SECN + " sectors: " + POINTS.map((p) => p.name + " " + p.label.toLowerCase() + (p.roof ? " (roofed)" : "")).join(", ") + "."; }
window.__mf = { renderer, scene, TITANS, makeTitan, hurtTitan, startEnter, K, PLAN, MAPKEY, groundH, VM, startSwap, startNade, startKnife, NADES, NET, RPS, MY, cut, get ROSTER() { return ROSTER; }, makeFigure, send, snapshot, useUtil, snd, SND, B, MAP, setMap, deploy, SQUADS, ALLIES, VEH, POINTS, LOAD, P, K, GRUNTS, TITANS, DROPS, CFG, BOXES, stepPilot, stepTitans, fireCarbine, fireCannon, callTitan, callFoe, startEnter, startExit, tryCallTitan, CK, ROCKETS, fireRockets, doPunch, useKey, hurtTitan, restart, SOL, U, cam,
  get started() { return started; }, sim(sec) { for (let i = 0; i < sec * 30; i++) advance(1 / 30); }, mouse(v) { mouseDown = v; }, force() { started = true; noLock = true; $("start").style.display = "none"; $("hud").style.display = "block"; restart(); } };
requestAnimationFrame(frame);
