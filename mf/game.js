/* Afterburn, prototype 6: the game (the pilot and what the pilot carries, the Titans, the cockpit, the screens).
   The battle itself (squads, vehicles, points, the commander's map) is in mf/battle.js.
   Everything here is in metres; the engine draws at U units to the metre. */
import { THREE, U, clamp, lerp, V3, rnd, $, CFG, DEF, saveCfg, renderer, scene, cam, gunScene, gunMat, makeRTs, render, BOXES, hitsBox, free, freeG, boxesNear, groundH, WORLD, rayBox, rayWorld,
  post, flash, puff, ringFx, flareFx, chunksFx, tracer, fxLayer, SOL, WEATHER, charMat, PLAN, MAPKEY, MAPNAME, SALT, retryField, setMap as pickMap } from "./engine.js";
import { VM } from "./hands.js";
import { GARAGE, GARAGE_FOV } from "./garage.js";
import { makeRig, TITAN, cockpitRifle } from "./titan.js";
import "./editor.js";
import { B, GRUNTS, ALLIES, VEH, SQUADS, POINTS, FACTIONS, DOCTRINES, LIST_PTS, LIST_MAX, PASSIVES, SUPCAP, supUsed, squadsOut, thumbOf, credit, nearAI, pingTo, fieldTest, stunAt, addDome, GOAL, OP, SECN, homeOf, setHomes, spend, opLine, LOAD, saveLoad, MAP, setMap, mapCamera, mapFrame, deploy, damage, rayUnits, blastUnits, nearestEnemy, stepBattle, resetBattle, buildPass, flowTo, flowDir, domeAt, useUtil, snapshot, applySnap, netIn, UTILS, utilsFor, layMine, refund, TECH, MAST, saveMast, levelOf, xpNext, tpFree, buyTier, pickBranch, wornTech } from "./battle.js";
import { NET, onMsg, send, host, join, leave, cut } from "./net.js";
import { makeFigure } from "./figure.js";
import { CAMP, TYPES as CTYPES, CARDS as CCARDS, newCampaign, cost as campCost, fleetCap, buyFleet, fortify, buyCard, resupply, setCard, reach as fleetReach, canMove, moveFleet, endTurn as campEndTurn, startDefence, autoDefend, resolve as campResolve, pendingFor, battleSetup, standing, endCampaign, other as otherFac } from "./campaign.js";
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
  wall: null, lastWall: null, wallCd: 0, mantle: null, hp: 125, hurtT: 9, dead: 0, dip: 0, bob: 0, shake: 0, weapon: 0, ammo: 24, reload: 0, swapT: -1, swapFrom: "carbine", swapTo: 0, nadeT: -1, meleeT: -1, kitT: -1, nades: 2, fireCd: 0, kick: 0, spread: 0, charge: 0,
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

function useKit() { if (P.dead > 0 || P.seq || !started || MAP.on) return; if (P.grap) { endGrapple(); return; } if (P.kitCd > 0) { snd("dry"); return; } P.kitT = 0; P.kitHit = false;
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
function hurtPilot(n, from) { if (P.dead > 0 || P.titan || P.seq || P.phaseT > 0) return; if (domeAt(P.pos.x, P.pos.z, "you")) n *= .5; if (B.mp !== "guest" && nearAI("you", P.pos.x, P.pos.z, 20)) n *= .8; /* the Field Commander Aura: a fifth less damage beside your own troops */ snd("pilot_hurt", { gain: clamp(.6 + n / 40, .6, 1.4) }); P.hp -= n; P.hurtT = 0; hurtFx = 1; if (P.hp <= 0) { P.hp = 0; P.dead = 6; P.battery = false; P.rodeo = null; if (!B.mp && OP.phase === "retreat" && OP.atk !== "you") refund(2); mouseDown = false; if (B.mp) relay("pdown", 0); if (!MAP.on) { setMap(true, true); if (document.pointerLockElement) document.exitPointerLock(); } } }
function blast(at, radius, o = {}) {   // at in metres
  const p = toU(at); snd("explosion", { pos: xyz(at), gain: clamp(radius / 2.2, .6, 2) }); flash(p.clone().setY(p.y + 12), "#ffb45a", 2500 + radius * 2200, .35);
  puff(p, { n: 26, color: "#fbe6a0", hot: 3, size: 5 + radius, life: .32, drag: 3, vel: () => V3((rnd() - .5) * 90 * radius, rnd() * 70 * radius, (rnd() - .5) * 90 * radius) });
  puff(p, { n: 16, color: "#332a21", dark: true, opacity: .7, size: 9 + radius * 3, life: 2, grow: 2.2, drag: 2, vel: () => V3((rnd() - .5) * 40, 20 + rnd() * 40, (rnd() - .5) * 40) });
  ringFx(p.clone().setY(p.y + .6), "#f2c46a", radius * U * 1.2, .4); if (radius > 1.5) chunksFx(p.clone().setY(p.y + 2), "#5c4c3a", 4, 40 + radius * 8);
  const d = Math.hypot(at.x - P.pos.x, at.z - P.pos.z); if (d < 30) P.shake = Math.max(P.shake, clamp(radius / (d + 2), 0, .6));
  blastUnits(at, radius, victims(o.team), 9999, 70, o.team === "you");
  if (o.team !== "you" && o.pilot && d < radius && Math.abs(at.y - P.pos.y) < radius + 1) hurtPilot(o.pilot * (1 - d / radius * .6));
  if (B.mp && o.team && o.pilot && (o.team === "you" || B.mp === "host")) for (const rp of RPS.values()) { if (!rp.ok || rp.side === o.team) continue; const d2 = Math.hypot(at.x - rp.pos.x, at.z - rp.pos.z); if (d2 < radius && Math.abs(at.y - rp.pos.y) < radius + 1) relay("phit", [rp.slot, Math.round(o.pilot * (1 - d2 / radius * .6)), 0]); }
  for (const t of TITANS) if (t.alive && t.team !== o.team && o.titan && Math.hypot(t.pos.x - at.x, t.pos.z - at.z) < radius + t.r) { hurtTitan(t, o.titan); if (o.emp && t.remote == null) { t.dash = 0; t.dashT = -2; } }
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
  grenadier: { name: "Grenadier", snd: "shotgun", mag: 6, cd: 60 / 110, dmg: [95, 95], rng: [0, 1], hs: 1, spread: .004, ads: .002, zoom: .12, reload: 2.4, kick: 2.6, lob: 45, desc: "Lobs a grenade at 45 metres a second that goes off on what it hits: 65 to pilots close by, and it clears troops and hurts turrets. Good on the move, hard on anyone standing still." },
  sniper: { name: "Heavy Sniper", snd: "sniper", mag: 5, cd: 60 / 45, dmg: [110, 110], rng: [200, 300], hs: 2, spread: .06, ads: .0001, zoom: .68, reload: 2.6, kick: 4.2, desc: "110 anywhere on the body at any range, and one to the head is enough. Slow between shots and poor from the hip." },
  pistol: { name: "Sidearm", snd: "pistol", mag: 12, cd: 60 / 360, dmg: [30, 18], rng: [15, 40], hs: 1.5, spread: .006, ads: .002, zoom: .14, reload: 1.1, kick: 1.3, side: true, desc: "Every pilot carries one." } };
const KITS = { grapple: ["Grapple Hook", "A 28 metre line that pulls you to what it bites. Let go with Q or by jumping and you keep the speed. 14 seconds to come back, less if you let go early. You cannot fire while it reels."], stim: ["Stim Boost", "40 percent faster for 3.5 seconds, and your health starts coming back at once. 18 seconds to come back."],
  sonar: ["Sonar Pulse", "Two pulses over 4 seconds that show you every enemy within 20 metres through walls, and put their squads on your map. 20 seconds to come back."], phase: ["Phase Shift", "Two seconds out of the world. Nothing can hurt you or see you, and you cannot fire. 22 seconds to come back."], decoy: ["Holo-Decoy", "A copy of you that runs on ahead and draws their fire for 5 seconds, or until it is hit. Two charges, 12 seconds each."] };
const ANTI = { mag: ["Magnetic Grenade Launcher", "Two grenades a pull that go off against a mech or on what they hit: 350 each to a mech, 200 to a placed asset. Short range. No charge-up."], arc: ["Arc Disruptor Cannon", "A slow ball of lightning that crosses the field hurting every mech, vehicle and placed asset within 8 metres: 150 a tick, two and a half times that into a shield."], rail: ["Rail-Charge Rifle", "Hold to charge for 0.8 seconds, then a beam. It hits Titans and vehicles hard and puts a pilot down."], seeker: ["Seeker Launcher", "Hold on a Titan, a vehicle or a placed asset for 1.4 seconds to lock, and a rocket goes. Nearly a fifth of a Titan's hull, or 450 to anything else. It cannot be fired at troops or pilots."] };
const ORD = { therm: ["Thermite Star", "Sticks where it lands and burns for 4 seconds: 1,100 to a mech it catches, and it clears a doorway."], satchel: ["Satchel Charge", "A short throw. Press X again to set it off: 160 to pilots, 1,400 to a mech, 600 to a placed asset."], frag: ["Frag Grenade", "Hold X to pull the pin and cook it, let go to throw. Four seconds from pin to blast. Do not hold it for all four."], arc: ["Arc Grenade", "Goes off the moment it touches anything. 40 to pilots and troops close by, and it shuts down turrets, beacons and pods within 6 metres for 4 seconds."] };
const dmgAt = (w, d) => (P.campDmg || 1) * (w.max && d > w.max ? 0 : lerp(w.dmg[0], w.dmg[1], clamp((d - w.rng[0]) / (w.rng[1] - w.rng[0]), 0, 1)));
const pw = () => (P.weapon === 2 ? PW.pistol : PW[LOAD.weapon] && !PW[LOAD.weapon].side ? PW[LOAD.weapon] : PW.carbine);
/* Mechs on the outline's scale. Hull is in bars of 2,500. No shield of its own: that will come from batteries. At no hull a
   mech is doomed: it gets one last bar of 2,500 and can still fight, and its pilot can get out (hold B) before it goes.
   Damage written for the old scale (a hull of 500) is multiplied by TS on the way in; the outline's own numbers are passed raw. */
const TS = 20, BAR = 2500;
const MECHS = {
  kestrel: { name: "Kestrel", cls: "light", fac: "Core Directorate", hull: 7500, speed: 8.5, dash: 3, dashCd: 5, h: 5, eye: 4.55, mag: 6, wpn: "Gauss Rail-Carbine", keys: ["Designator", "Aegis", "Thruster"], desc: "The Directorate's scout. Three bars, three dashes, the fastest legs. Its rail-carbine does 450 a shot, or up to 1,400 if you hold the trigger a second before letting go. Q is a dart that does 600 and marks a mech so everything hurts it a fifth more, E a buckler that soaks 1,500 for a moment, F three seconds in the air on thrusters, and X the Orbital Lock Core: up to three targets in view take 3,500 each from above." },
  centurion: { name: "Centurion", cls: "medium", fac: "Core Directorate", hull: 10000, speed: 7, dash: 2, dashCd: 6.5, h: 5.8, eye: 5.3, mag: 24, wpn: "Autocannon", keys: ["Salvo", "Wall", "Pulse"], desc: "The Directorate's line mech. Four bars of hull, two dashes, a 30 mm autocannon. Q is a salvo of eight tracking missiles, E a Vortex Wall that turns fire aside for 6 seconds, F a sensor pulse out to 40 metres, and X the Salvo Core once it has charged." },
  bastion: { name: "Bastion", cls: "heavy", fac: "Core Directorate", hull: 12500, speed: 5.5, dash: 1, dashCd: 8, h: 6.3, eye: 5.8, mag: 120, wpn: "Rotary Vulcan", keys: ["Mortar", "Gun-shield", "Fortify"], desc: "The Directorate's anchor. Five bars, one dash, slow. Its Vulcan spins up the longer you hold it, 140 a round from a belt of 120. Q lobs a concussion mortar that does 1,100 and shoves mechs back, E puts a 3,500 shield on the gun for 6 seconds and slows you, F digs in for 5 seconds (a quarter less damage, faster spin, no moving), and X is the Aegis Overdrive Core: a full shield for you and cover for troops within 15 metres." },
  jackal: { name: "Jackal", cls: "light", fac: "Frontier Coalition", hull: 7500, speed: 8.5, dash: 3, dashCd: 5, h: 5, eye: 4.55, mag: 5, wpn: "Scrap Flak-Shotgun", keys: ["Arc wave", "Phase dash", "Jammer"], desc: "The Coalition's flanker. Three bars, three dashes, fast. Its flak-shotgun does up to 900 close in and little past 40 metres. Q is an arc wave that strips the shields off mechs in front of you, E a 15 metre blink, F a jammer that blinds enemy turrets and pods within 30 metres for 6 seconds, and X the Overclock Core: dashes back at once and twice as fast, and a melee of 1,400, for 8 seconds." },
  nomad: { name: "Nomad", cls: "medium", fac: "Frontier Coalition", hull: 10000, speed: 7, dash: 2, dashCd: 6.5, h: 5.8, eye: 5.3, mag: 30, wpn: "Plasma Repeater", keys: ["Mines", "Siphon", "Rearm"], desc: "The Coalition's skirmisher, built on a working frame. Four bars of hull, two dashes, a plasma repeater that fires in threes and bites harder into shields and turrets. Q throws three EMP mines, E is a claw that pulls the shield off an enemy mech and onto yours, F makes your dashes and mines ready again at once, and X is the Arc Storm Core, a burst 25 metres across." },
  furnace: { name: "Furnace", cls: "heavy", fac: "Frontier Coalition", hull: 12500, speed: 5.5, dash: 1, dashCd: 8, h: 6.3, eye: 5.8, mag: 4, wpn: "Slag Launcher", keys: ["Canister", "Plating", "Slag wall"], desc: "The Coalition's siege frame. Five bars, one dash, slow. Its launcher lobs slag that does 1,100 where it lands and leaves a fire that burns 1,200 more. Q sets down a gas canister (two at a time) that slag turns into a wide fire, E raises furnace plating that soaks 3,000 and scorches mechs pressed against it, F sends a line of fire 30 metres ahead, and X is the Meltdown Core: 4,500 to mechs close by and burning ground after." } };
const BYF = { machine: { light: "kestrel", medium: "centurion", heavy: "bastion" }, militia: { light: "jackal", medium: "nomad", heavy: "furnace" } };
if (!BYF.machine[LOAD.chassis]) LOAD.chassis = "medium";   // the frame you bring: light, medium or heavy
const mechOf = (fac, cls = LOAD.chassis) => MECHS[BYF[fac === "militia" ? "militia" : "machine"][cls] || BYF.machine.medium];
B.hooks = { pilot: () => ({ ok: P.dead <= 0 && !P.titan && !P.seq && !(P.phaseT > 0), alive: P.dead <= 0, dead: P.dead, pos: V3(P.pos.x, P.pos.y + P.h * .6, P.pos.z), at: P.pos, speed: hs(), grounded: P.grounded, titan: !!P.titan }),
  titans: () => { for (const t of TITANS) t.piloted = t === P.titan; return TITANS; }, hurtPilot: (n) => hurtPilot(n), net: (k, d) => send(k, d), hurtRemote: (slot, n) => { if (slot < 0) { const d = DECOYS.find((q) => q.slot === slot); if (d) d.hit = true; return; } relay("phit", [slot, Math.round(n), 0]); }, rpilots: () => (B.mp ? [...RPS.values(), ...DECOYS] : DECOYS), pilots: () => { const L = P.dead <= 0 ? [{ key: "you", side: "you", x: P.pos.x, z: P.pos.z }] : []; if (!(P.phaseT > 0) || !L.length) {} else L.length = 0; if (B.mp) for (const rp of RPS.values()) if (rp.ok || rp.inTitan) L.push({ key: keyOf(rp.slot), side: rp.side, x: rp.pos.x, z: rp.pos.z }); return L; }, attackers: () => (B.mp ? Math.max(1, Math.ceil((1 + RPS.size) / 2)) : 1),
  healPilot: (n) => { if (P.dead > 0 || P.hp >= HP) return false; P.hp = Math.min(HP, P.hp + n); return true; }, hurtTitan: (t, n) => hurtTitan(t, n), blast: (at, r, o) => blast(at, r, o), onKill: (n) => { snd("kill"); P.meter = Math.min(100, P.meter + (n >= 15 ? 5 : 2)); }, emp: (x, z, r, side) => { for (const t of TITANS) if (t.alive && t.team !== side && t.remote == null && Math.hypot(t.pos.x - x, t.pos.z - z) < r + t.r) { t.shield = 0; t.dash = 0; t.dashT = -2; if (t === P.titan) say("EMP. Your shield is gone and your dashes are down.", 2.5); } }, retreatOver: (d) => { if (d === "you" && P.dead <= 0) { P.meter = Math.min(100, P.meter + 10); say("You made the next line. 50 Command Points and a tenth on your meter.", 3.5); } }, assetWait: () => P.campAssets || 1, cpRate: () => P.campRate || 1, battery: () => { if (P.battery || P.dead > 0) return false; P.battery = true; say("You have a battery. Carry it to a friendly mech and press E.", 3.5); return true; }, onCap: (p) => { if (P.dead <= 0 && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 12) P.meter = Math.min(100, P.meter + 15); },
  shotSnd: (q, atPilot, hit) => { snd("grunt_shot", { pos: [q.x / U, q.y / U + 1.4, q.z / U] }); if (atPilot && !hit && rnd() < .6) snd("flyby", { pos: [P.pos.x + (rnd() - .5) * 5, P.pos.y + 1.5, P.pos.z + (rnd() - .5) * 5], delay: .02 + rnd() * .05 }); }, say: (t, sec) => say(t, sec) };

/* ---------- Titans ---------- */
const TITANS = [], DROPS = [], LATER = [], ROCKETS = [], HUSKS = []; let foeCalled = false;
const later = (t, fn) => LATER.push({ t, fn });
const approach = (v, to, r) => (Math.abs(to - v) <= r ? to : v + Math.sign(to - v) * r);
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
function makeTitan(team, x, z, yaw, kit = null) {
  const myF = (B.fac && B.fac.you) || LOAD.side, fac = team === "you" ? myF : myF === "militia" ? "machine" : "militia";   // each side is one faction, and the two sides are opposite
  const cls = kit && BYF.machine[kit.chassis] ? kit.chassis : team === "you" ? LOAD.chassis : ["medium", "medium", "heavy", "light"][Math.floor(rnd() * 4)], mech = BYF[fac][cls], ch = MECHS[mech], rig = makeRig(team, { cls, mech, ...(team === "you" ? { accent: kit ? kit.paint : LOAD.paint } : {}) }); scene.add(rig.root);
  const t = { team, rig, mech, batt: true, smoke: 0, smokeT: 0, pos: V3(x, .05, z), vel: V3(), yaw, r: cls === "heavy" ? 1.7 : cls === "light" ? 1.3 : 1.5, h: ch.h, eye: ch.eye, ward: 0, wardT: 0, markT: 0, drT: 0, fortT: 0, ocT: 0, hoverT: 0, spin: 0, chg: 0, cans: 2, shield: 0, hull: ch.hull, hullMax: ch.hull, speed: ch.speed, dashMax: ch.dash, shieldT: 9, hitT: 9, alive: true, doom: 0, doomed: false, vortex: 0, vortexCd: 0, pulseCd: 0, core: 0, coreT: 0, ammo: MECHS[mech].mag, reload: 0, fireCd: 0, dash: ch.dash, dashT: 0, dashing: 0, grounded: true,
    cd: 2 + rnd(), rk: 4 + rnd() * 4, think: 0, flow: null, strafe: 1, strafeT: 0, walk: 0, kneel: 0, kneelTo: 0, hatch: 0, hatchTo: 0, aimYaw: 0, aimPitch: 0, recoil: 0, punch: 0, punchCd: 0, busy: false, land: 1 };
  if (team === "you" && P.campCore) t.core = P.campCore; TITANS.push(t); return t;
}
// a point given in the Titan's own frame (metres, forward is -z), out in the yard
function titanPoint(t, lx, ly, lz) { const s = Math.sin(t.yaw), c = Math.cos(t.yaw); return V3(t.pos.x + lx * c + lz * s, t.pos.y + ly, t.pos.z - lx * s + lz * c); }
const chestY = (t) => TITAN.CHEST - TITAN.KNEEL * t.kneel;
const seatPt = (t) => titanPoint(t, 0, chestY(t) + .05, .1), hatchPt = (t) => titanPoint(t, 0, chestY(t) + .2, -2.8);
function placeTitan(t, dt) {
  t.kneel = approach(t.kneel, t.kneelTo, dt * 1.5); t.hatch = approach(t.hatch, t.hatchTo, dt * 2.4); t.recoil = Math.max(0, t.recoil - dt * 6); t.land = Math.max(0, t.land - dt * 1.1); if (t.punch > 0) t.punch -= dt; t.punchCd -= dt;
  const fwd = -t.vel.x * Math.sin(t.yaw) - t.vel.z * Math.cos(t.yaw), sp = Math.hypot(t.vel.x, t.vel.z);
  t.rig.root.position.set(t.pos.x * U, t.pos.y * U, t.pos.z * U); t.rig.root.rotation.y = t.yaw; t.rig.root.visible = t !== P.titan || MAP.on;
  t.rig.pose(dt, { speed: sp * (fwd < -.5 ? -1 : 1), kneel: Math.max(t.kneel, ease(t.land) * .7), hatch: t.hatch, aimYaw: t.aimYaw, aimPitch: t.aimPitch, recoil: t.recoil, punch: t.punch > 0 ? Math.sin(clamp(1 - t.punch / .45, 0, 1) * Math.PI) : 0, limp: t.doom > 0 || t.doomed, reload: t.reload > 0 ? clamp(1 - t.reload / 2.2, 0, 1) : -1 });
}
const muzzleOf = (t) => t.rig.muzzle.getWorldPosition(V3());
function hurtTitan(t, n, raw = false, shMul = 1) { if (!t.alive || t.doom > 0) return; let dmg = raw ? n : n * TS; if (t.markT > 0) dmg *= 1.2; if (t.remote != null) { relay("thit", [t.remote, Math.round(dmg)]); snd("titan_hit", { pos: [t.pos.x, t.pos.y + t.h * .6, t.pos.z], gain: clamp(.45 + dmg / 1200, .45, 1.3) }); return; }
  if (t.vortex > 0) dmg *= .25; if (t.fortT > 0 || t.drT > 0) dmg *= .75; if (t.ward > 0) { const w = Math.min(t.ward, dmg); t.ward -= w; dmg -= w; if (dmg <= 0) { snd("shield_hit", { pos: [t.pos.x, t.pos.y + t.h * .6, t.pos.z], gain: .8, pitch: 1.4 }); return; } } t.shieldT = 0; t.hitT = 0; const s = Math.min(t.shield, dmg * shMul); snd(s > 0 ? "shield_hit" : "titan_hit", { pos: [t.pos.x, t.pos.y + t.h * .6, t.pos.z], gain: clamp(.45 + dmg / 1200, .45, 1.3) }); t.shield -= s; t.hull -= dmg - s / shMul; if (t === P.titan) { hurtFx = Math.max(hurtFx, s > 0 ? 0 : .6); if (s > 0) coolFx = 1; P.shake = Math.max(P.shake, .12 + dmg * .0002); CK.glitch = .18; }
  if (t.hull <= 0 && !t.doomed) { t.doomed = true; t.hull = BAR; if (t === P.titan) say("Your mech is doomed. It has one bar left. Fight on, or hold B to get out.", 4); else say(t.team === "you" ? "A friendly mech is doomed." : "Their mech is doomed. Finish it.", 3); }
  else if (t.hull <= 0) { t.hull = 0; t.doom = 2.6; t.hatchTo = 1; if (t === P.titan || (P.seq && P.seq.T === t)) { throwClear(t); say("Your mech is gone. You have been thrown clear.", 3); } else say(t.team === "you" ? "A friendly mech is going up." : "Their mech is going up.", 3); } }
function stepTitans(dt) { stepRodeo(dt); stepFires(dt);
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
    t.fireCd -= dt; t.rk -= dt; if (t.reload > 0) { t.reload -= dt; if (t.reload <= 0) t.ammo = MECHS[t.mech].mag; } if (!t.smokeGot && t.core >= .25) { t.smokeGot = true; t.smoke = 1; if (t === P.titan) say("Electric smoke is ready. C sets it off, and it throws off anyone riding you.", 3.5); } if (t.smokeT > 0) smokeStep(t, dt); t.markT -= dt; t.drT -= dt; t.ocT -= dt; if (t.wardT > 0) { t.wardT -= dt; if (t.wardT <= 0) t.ward = 0; } t.spinT = (t.spinT || 0) - dt; if (t.spinT <= 0) t.spin = Math.max(0, t.spin - dt * .8); if (t.scorchT > 0) { t.scorchT -= dt; const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw); for (const o of TITANS) if (o.alive && o.team !== t.team && Math.hypot(o.pos.x - t.pos.x - fx * 3, o.pos.z - t.pos.z - fz * 3) < 4.5) { if (o.remote == null) hurtTitan(o, 400 * dt, true); else if (rnd() < dt * 4) hurtTitan(o, 100, true); } }
    if (t.dash < t.dashMax) { t.dashT += dt; if (t.dashT > MECHS[t.mech].dashCd / (t.ocT > 0 ? 2 : 1)) { t.dash++; t.dashT = 0; } }
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
  for (const o of TITANS) if (o !== t && o.alive && o.team !== t.team) { const dx = o.pos.x - t.pos.x, dz = o.pos.z - t.pos.z, d = Math.hypot(dx, dz); if (d < 4.8 && (dx * fx + dz * fz) / (d || 1) > .3) { hurtTitan(o, t.ocT > 0 ? 1400 : 2200, true); o.vel.x += fx * 9; o.vel.z += fz * 9; hit = true; } }
  blastUnits(at, 3.2, victims(t.team), 9999, 110, t.team === "you"); hit = true;
  if (t.team !== "you" && !P.titan && !P.seq && Math.hypot(P.pos.x - at.x, P.pos.z - at.z) < 3 && Math.abs(P.pos.y - t.pos.y) < 5) { hurtPilot(80); hit = true; }
  if (hit) { const p = toU(at); flash(p, "#ffd28a", 4000, .2); puff(p, { n: 22, color: "#ffe9b0", hot: 3, size: 5, life: .3, vel: () => V3((rnd() - .5) * 160, (rnd() - .3) * 120, (rnd() - .5) * 160) }); ringFx(p, "#f2c46a", 60, .3); P.shake = Math.max(P.shake, t === P.titan ? .5 : .25); } }); }
/* A mech the machine is driving uses one thing of its own every so often, when an enemy mech is close: a ward for the ones
   that have one, a mark, a shield strip, mines, fire. With a full core and an enemy mech within 20 metres it lets the core go. */
function aiAbility(t, dt) { t.abT = (t.abT == null ? 5 + rnd() * 5 : t.abT) - dt; if (t.abT > 0) return; const o = TITANS.find((q) => q.team !== t.team && q.alive && q.doom <= 0), d = o ? Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) : 1e9; if (!o || d > 45) { t.abT = 2; return; } t.abT = 9 + rnd() * 6; const m = t.mech, mine = o === P.titan;
  if (t.core >= 1 && d < 20) { t.core = 0; const c = toU(V3(t.pos.x, t.pos.y + 2, t.pos.z)); flash(c, "#ffd0a0", 8000, .5); ringFx(c, "#ffb060", 20 * U, .8); snd("charge_fire", { pos: [t.pos.x, t.pos.y + 3, t.pos.z], pitch: .5, gain: 1.5 }); hurtTitan(o, 2500, true); if (mine) say("Their " + MECHS[m].name + " let its core go.", 2.5); return; }
  if (m === "centurion") { t.vortex = 6; } else if (m === "bastion") { t.ward = 3500; t.wardT = 6; } else if (m === "kestrel") { t.ward = 1500; t.wardT = 2.5; if (o.remote == null) o.markT = 5; }
  else if (m === "jackal") { if (o.remote == null && d < 30) { o.shield = 0; ringFx(toU(V3(t.pos.x, t.pos.y + 1, t.pos.z)), "#9fd8ff", 30 * U, .6); if (mine) say("An arc wave took your shield.", 2); } }
  else if (m === "nomad") { if (B.mp !== "guest") for (let i = 0; i < 3; i++) layMine(o.pos.x + (rnd() - .5) * 7, o.pos.z + (rnd() - .5) * 7, t.team, true); }
  else if (m === "furnace") { addFire(o.pos.x, o.pos.z, 4, 4, 400, t.team); blast(V3(o.pos.x, o.pos.y + .5, o.pos.z), 3, {}); } }
function stepTitanAI(t, dt) { aiAbility(t, dt);
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
  if (PLAN && PLAN.indoor) { say("No mech can come down through the deck. This fight is on foot.", 2.5); return; } if (P.mine || DROPS.some((D) => D.team === "you" && !D.ghost)) return; if (P.meter < 100) { say("Your Titan is not ready yet. The meter fills over time and with every grunt you put down.", 2.5); return; }
  cam.getWorldDirection(_d); _o.copy(P.pos).setY(P.pos.y + P.eye); const t = rayWorld(_o, _d, 60), at = _o.clone().addScaledVector(_d, t);
  if (t >= 60 || at.y > groundH(at.x, at.z) + .7 || !freeG(at.x, at.z, 5.9, 1.7, .55) || rayWorld(V3(at.x, groundH(at.x, at.z) + 6.5, at.z), V3(0, 1, 0), 100, false) < 100) { say("Your Titan needs open ground under open sky. Aim at a clear patch within 60 metres.", 3); return; }
  P.meter = 0; { const yw = Math.atan2(-(P.pos.x - at.x), -(P.pos.z - at.z)); callTitan("you", at.x, at.z, yw); if (B.mp) relay("tdrop", [r2(at.x), r2(at.z), r2(yw)]); } say("Titanfall is on its way. Stand clear.", 2.4);
}
function callFoe() { foeCalled = true; if (PLAN && PLAN.indoor) return; let best = null, bd = 0; for (const [x, z] of [[0, -120], [0, -80], [20, -22], [-10, 8], [22, 16], [-36, -8], [10, 24], [100, 0], [-60, -30], [0, 80]]) { if (!freeG(x, z, 5.9, 1.8, .55)) continue; const d = Math.hypot(x - P.pos.x, z - P.pos.z); if (d > bd) { bd = d; best = [x, z]; } }
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
    if (k >= 3.3) { P.seq = null; T.busy = false; say("You are in. Left button fires the " + MECHS[T.mech].wpn.toLowerCase() + ". Q is " + MECHS[T.mech].keys[0].toLowerCase() + ", E " + MECHS[T.mech].keys[1].toLowerCase() + ", F " + MECHS[T.mech].keys[2].toLowerCase() + ", X the core, C smoke, V the melee. Shift sprints and Space dashes. Hold B to get out.", 7); }
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
  if (go && K._dash && t.dash > 0 && t.dashing <= 0 && !(t.fortT > 0)) { t.dash--; t.dashing = .32; const dx = wl > 0 ? wx : fx, dz = wl > 0 ? wz : fz; t.vel.x = dx * 17; t.vel.z = dz * 17; P.shake = Math.max(P.shake, .15);
    puff(toU(t.pos).setY(t.pos.y * U + 8), { n: 24, color: "#ad9677", dark: true, opacity: .5, size: 10, life: 1.2, grow: 2, drag: 2, vel: () => V3((rnd() - .5) * 90, 6 + rnd() * 20, (rnd() - .5) * 90) }); } K._dash = false;
  if (go && K._punch) doPunch(t, P.yaw); K._punch = false;
  if (go && K._smoke) { if (t.smoke > 0) { mechSmoke(t); say("Electric smoke.", 1.5); } else say(t.smokeGot ? "The smoke is spent." : "Smoke comes at a quarter core.", 1.5); } K._smoke = false;
  if (ABIL[t.mech]) { if (go) ABIL[t.mech](t); K._wall = K._pulse = K._core = K._rockets = false; }
  if (go && K._wall && t.vortexCd <= 0) { t.vortex = 6; t.vortexCd = 18; if (!t.wall) { t.wall = fxLayer(new THREE.Mesh(new THREE.BoxGeometry(9 * U, 6.5 * U, .15 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 1.8, 2.4), transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))); t.wall.position.set(0, 3.4 * U, -4.2 * U); t.rig.root.add(t.wall); } snd("shield_hit", { gain: 1.4, pitch: .7 }); if (B.mp !== "guest") addDome("you", t.pos.x - Math.sin(P.yaw) * 5, t.pos.z - Math.cos(P.yaw) * 5, 7, 6); say("Vortex Wall up.", 1.5); } K._wall = false;
  if (go && K._pulse && t.pulseCd <= 0) { t.pulseCd = 15; P.sonarT = 4; P.sonarN = 0; P.sonarR = 40; say("Sensor pulse.", 1.5); } K._pulse = false;
  if (go && K._core) { if (t.core >= 1) { t.core = 0; t.coreT = 3.6; t.coreN = 0; say("Salvo Core.", 2); snd("charge_fire", { pitch: .6, gain: 1.5 }); } else say("The core is at " + Math.round(t.core * 100) + " percent.", 1.5); } K._core = false;
  if (t.coreT > 0) { t.coreT -= dt; const due = Math.floor((3.6 - t.coreT) / .16); while (t.coreN < due && t.coreN < 22) { t.coreN++; aimRay(0); const best = rayWorld(_o, _d, 140); fireRockets(t, _o.clone().addScaledVector(_d, Math.max(4, best - .3)), 1, 12.5); } }
  if (go && K.KeyB) { t.ejT = (t.ejT || 0) + dt; if (t.ejT > .5) { t.ejT = 0; if (t.doomed) { throwClear(t); P.vel.y = 22; t.doom = 1.6; t.hatchTo = 1; say("Out. Your mech is going up.", 2.5); } else startExit(); } } else t.ejT = 0;
  if (go && K._rockets && t.rk <= 0) { aimRay(0); const best = rayWorld(_o, _d, 120); fireRockets(t, _o.clone().addScaledVector(_d, Math.max(4, best - .3))); } K._rockets = false;
  if (t.fortT > 0) { t.fortT -= dt; wx = wz = 0; }
  if (t.dashing > 0) t.dashing -= dt; else { friction(t, 4, dt); accelerate(t, wx, wz, t.speed * (t.mech === "bastion" && t.wardT > 0 ? .6 : 1) * ((K.ShiftLeft || K.ShiftRight) && t.reload <= 0 ? 1.45 : 1), 3.2, dt); }
  t.vel.y -= 22 * dt; if (t.hoverT > 0) { t.hoverT -= dt; t.vel.y = t.hoverT > 2.3 ? 8 : Math.max(t.vel.y, 0); } moveBody(t, dt); t.yaw += clamp(angD(t.yaw, P.yaw), -2.6 * dt, 2.6 * dt); t.aimYaw = clamp(angD(t.yaw, P.yaw), -1.1, 1.1); t.aimPitch = P.pitch;
  t.walk += Math.hypot(t.vel.x, t.vel.z) * dt; P.pos.copy(t.pos); P.vel.copy(t.vel); P.grounded = t.grounded;
}

/* ---------- what the pilot holds ---------- */
const gun = new THREE.Group(); gun.scale.setScalar(.62); gunScene.add(gun);   // the Titan cannon you see from the cockpit; the pilot's own hands are in hands.js
function partGeo(list) { const g = []; const c = new THREE.Color(); for (const [w, h, d, x, y, z, col] of list) { const b = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed(); b.deleteAttribute("uv"); c.set(col); const a = []; for (let i = 0; i < b.attributes.position.count; i++) a.push(c.r, c.g, c.b); b.setAttribute("color", new THREE.Float32BufferAttribute(a, 3)); g.push(b); } return mergeGeometries(g); }
const cannonBuilt = new THREE.Mesh(partGeo([[.24, .22, 1.2, 0, 0, -.4, "#454c52"], [.07, .07, 1.0, -.055, .12, -1.5, "#231d17"], [.07, .07, 1.0, .055, .12, -1.5, "#231d17"], [.07, .07, 1.0, 0, .03, -1.5, "#231d17"], [.2, .2, .1, 0, .01, -1.52, "#5f676d"], [.2, .2, .08, 0, .01, -1.98, "#5f676d"],
  [.28, .05, .8, 0, .22, -.5, "#7d858a"], [.26, .04, .5, 0, -.03, -.55, "#c9733a"], [.3, .3, .36, 0, -.04, .3, "#5f676d"], [.22, .26, .26, -.2, -.06, -.2, "#4f5a3c"], [.23, .05, .27, -.2, .06, -.2, "#c9733a"], [.04, .1, .3, .13, .08, -.3, "#231d17"]]), gunMat);
// From the cockpit you see the mech's own rifle (the model), low on the right, with its drum coming off in a reload. The built cannon is the fallback.
/* What you see of your mech's weapon from the cockpit is the weapon itself: the same blocks the mech carries outside,
   one per kind of mech, made the first time you climb into that kind. Its drum comes off in a reload. */
const cannon = new THREE.Group(), CGUN = {}; let CR = cockpitRifle(); if (CR) { CR.g.scale.setScalar(.8); CR.g.position.set(0, .1, 1.0); cannon.add(CR.g); } cannon.scale.setScalar(.72); gunScene.add(cannon); const CR_MODEL = !!CR;
function cockpitGun(mech) { if (CR_MODEL) return; if (!CGUN[mech]) { const r = makeRig("you", { mech, accent: LOAD.paint }), gun = r.gun; gun.position.set(0, .1, 1.0); gun.rotation.set(0, 0, 0); gun.scale.setScalar(.6); gun.traverse((o) => { o.visible = true; }); r.flash.visible = false; cannon.add(gun); CGUN[mech] = { g: gun, mag: r.hold.mag }; } for (const k in CGUN) CGUN[k].g.visible = k === mech; CR = CGUN[mech]; }
const fist = new THREE.Mesh(partGeo([[.5, .44, .5, 0, 0, 0, "#34373a"], [.56, .2, .56, 0, .2, 0, "#b9b3a4"], [.44, .44, .9, 0, 0, .7, "#8f8a80"], [.16, .16, .52, -.16, .1, -.3, "#34373a"], [.16, .16, .52, .16, .1, -.3, "#34373a"]]), gunMat); fist.visible = false; gunScene.add(fist);
const flashM = new THREE.Mesh(new THREE.BoxGeometry(.11, .11, .14), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.8, 1) })); flashM.visible = false; gunScene.add(flashM);
let flashT = 0, hitT = 0;
const _f = V3(), _r = V3(), _u = V3();
function aimRay(spread) { cam.getWorldDirection(_f); _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion); _d.copy(_f).addScaledVector(_r, (rnd() - .5) * spread * 2).addScaledVector(_u, (rnd() - .5) * spread * 2).normalize(); _o.copy(cam.position).divideScalar(U); }
function titanHit(o, d, best, team) { let who = null; for (const t of TITANS) { if (!t.alive || t.team === team) continue; const tt = rayBox(o, d, [t.pos.x - t.r, t.pos.y, t.pos.z - t.r], [t.pos.x + t.r, t.pos.y + t.h, t.pos.z + t.r], best); if (tt < best) { best = tt; who = t; } } return { best, who }; }
function muzzleAt(side, down, fwd) { return _o.clone().addScaledVector(_r, side).addScaledVector(_u, -down).addScaledVector(_f, fwd).multiplyScalar(U); }
function fireCarbine() { const w = pw(); if (w.lob) { P.ammo--; snd(w.snd, { pitch: .8 }); P.fireCd = w.cd; VM.kick(w.kick); flashT = .045; aimRay(w.spread); P.pitch += .004 * w.kick; launch(_o.clone().addScaledVector(_f, .7).addScaledVector(_u, -.12), _d.clone().multiplyScalar(w.lob).addScaledVector(P.vel, .5), 5, "gl"); return; }
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
function mechBolt(t, dmg, col, shMul, r) {
  snd("cannon", shMul > 1 ? { pitch: 1.5, gain: .8 } : undefined); P.kick = 1; t.recoil = 1; flashT = .06; P.shake = Math.max(P.shake, .1); aimRay(.006);
  let best = rayWorld(_o, _d, 260); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best;
  const end = _o.clone().addScaledVector(_d, Math.max(0, best - .1)), from = muzzleAt(.9, .7, 2.4); tracer(from, toU(end), col, 9000, 1.5); flash(from, col, 3200, .1); if (B.mp) relay("tfx", [0, r2(end.x), r2(end.y), r2(end.z)], false);
  puff(from, { n: 8, color: "#8f8a80", dark: true, opacity: .35, size: 8, life: 1.2, grow: 2, drag: 2.4, vel: () => V3((rnd() - .5) * 20, 10 + rnd() * 14, (rnd() - .5) * 20) });
  if (th.who) { hurtTitan(th.who, dmg, true, shMul); t.core = Math.min(1, t.core + .012); hitT = .12; } else if (gh.who) damage(gh.who, dmg * (gh.who.veh && gh.who.def.veh.static ? shMul : 1), toU(P.pos), gh.who.veh ? "blast" : "chest", true); if (gh.who || th.who) { hitT = .12; snd("hitmarker", { gain: .8 }); }
  blast(end, r, { team: "you" });
}
// one pellet or slug with no blast of its own
function mechPellet(t, dmg, spread, col, trace) { aimRay(spread); let best = rayWorld(_o, _d, 220); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best; const end = _o.clone().addScaledVector(_d, Math.max(0, best - .1));
  if (trace) tracer(muzzleAt(.9, .7, 2.4), toU(end), col, 12000, 1.2); const k = typeof dmg === "function" ? dmg(best) : dmg; if (th.who) { hurtTitan(th.who, k, true); t.core = Math.min(1, t.core + .006); hitT = .12; } else if (gh.who) { damage(gh.who, k, toU(P.pos), gh.who.veh ? "blast" : "chest", true); hitT = .12; } return end; }
const kickMech = (t, k) => { P.kick = k; t.recoil = 1; flashT = .06; P.shake = Math.max(P.shake, .08 * k); flash(muzzleAt(.9, .7, 2.4), "#ffc477", 3000, .1); };
/* How each mech fires. Centurion: one 220 round a pull. Nomad: three bolts of 240 that bite 1.4 times as hard into shields and
   placed assets. Bastion: 140 a round, faster the longer it has been spinning. Jackal: nine pellets of 100, falling to 20 by
   40 metres. Furnace: slag that lands a moment later for 1,100 and leaves a fire. Kestrel fires on letting go: see railShot. */
function fireCannon(t) { const m = t.mech;
  if (m === "nomad") { const n = Math.min(3, t.ammo); t.ammo -= n; t.fireCd = .46; for (let i = 0; i < n; i++) later(i * .07, () => { if (P.titan === t && t.alive && t.doom <= 0) mechBolt(t, 240, "#8fe0f0", 1.4, 1.5); }); return; }
  if (m === "bastion") { t.ammo--; t.spin = Math.min(1, t.spin + (t.fortT > 0 ? .16 : .08)); t.spinT = .35; t.fireCd = lerp(.2, .06, t.spin); snd("cannon", { pitch: 1.25, gain: .7 }); kickMech(t, .5); mechPellet(t, 140, .012 + .01 * t.spin, "#ffd890", true); return; }
  if (m === "jackal") { t.ammo--; t.fireCd = .72; snd("shotgun", { pitch: .6, gain: 1.4 }); kickMech(t, 2.2); for (let i = 0; i < 9; i++) mechPellet(t, (d) => (d < 12 ? 100 : d > 40 ? 20 : 100 - 80 * (d - 12) / 28), .05, "#ffb070", i % 3 === 0); return; }
  if (m === "furnace") { t.ammo--; t.fireCd = 1.1; snd("thump", { gain: 1.5, pitch: .6 }); kickMech(t, 2.6); aimRay(.004); const at = _o.clone().addScaledVector(_d, Math.max(3, rayWorld(_o, _d, 90) - .3)); tracer(muzzleAt(.9, .7, 2.4), toU(at), "#ff8a3a", 2600, 3); later(.4, () => slagLand(at)); return; }
  t.ammo--; t.fireCd = .2; mechBolt(t, 220, "#ffd890", 1, 2.2); }
// the Kestrel: hold to charge, let go to fire. 450 at a tap, 1,400 after a second.
function railShot(t) { const c = clamp(t.chg, 0, 1); t.chg = 0; t.ammo--; t.fireCd = .45; snd("charge_fire", { pitch: 1 + c * .3, gain: .9 + c * .5 }); kickMech(t, 1 + c * 2); mechPellet(t, 450 + 950 * c, .001, c > .9 ? "#d8f8ff" : "#8fe0f0", true); }
/* fire on the ground: it burns mechs, troops and pilots of the other side that stand in it */
const FIRES = [], CANS = []; let fireTick = 0;
function addFire(x, z, r, sec, dps, team = "you", ghost = false) { FIRES.push({ x, z, r, t: sec, dps, team, ghost }); if (!ghost && team === "you" && B.mp) relay("fire", [r2(x), r2(z), r, sec, dps]); }   // a ghost is another player's fire: drawn here, and it burns this pilot, but the mechs and troops are its owner's to count
function slagLand(at) { blast(at, 3.5, { team: "you", titan: 55, pilot: 120 }); addFire(at.x, at.z, 4, 3, 400); for (let i = CANS.length - 1; i >= 0; i--) { const c = CANS[i]; if (Math.hypot(c.x - at.x, c.z - at.z) < 6) { scene.remove(c.mesh); CANS.splice(i, 1); blast(V3(c.x, groundH(c.x, c.z) + 1, c.z), 5, { team: "you", titan: 40, pilot: 120 }); addFire(c.x, c.z, 7, 6, 500); } } }
function stepFires(dt) { fireTick -= dt; const tick = fireTick <= 0; if (tick) fireTick = .25;
  for (let i = CANS.length - 1; i >= 0; i--) { const c = CANS[i]; c.t -= dt; if (c.t <= 0) { scene.remove(c.mesh); CANS.splice(i, 1); } }
  for (let i = FIRES.length - 1; i >= 0; i--) { const f = FIRES[i]; f.t -= dt; if (f.t <= 0) { FIRES.splice(i, 1); continue; } const gy = groundH(f.x, f.z);
    if (rnd() < dt * 5 * f.r) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * f.r; puff(toU(V3(f.x + Math.cos(a) * d, gy + .3, f.z + Math.sin(a) * d)), { n: 5, color: "#ff9a3c", hot: 3, size: 6, life: .5, vel: () => V3((rnd() - .5) * 20, 40 + rnd() * 50, (rnd() - .5) * 20) }); }
    if (!tick) continue; const n = f.dps * .25; if (f.team !== "you" && !P.titan && P.dead <= 0 && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < f.r) hurtPilot(n * .2); if (f.ghost) continue; for (const o of TITANS) if (o.alive && o.team !== f.team && Math.hypot(o.pos.x - f.x, o.pos.z - f.z) < f.r + o.r) hurtTitan(o, n, true);
    blastUnits(V3(f.x, gy + .5, f.z), f.r, victims(f.team), n * .4, n, f.team === "you"); } }
/* ---------- what Q, E, F and X do in each mech but the Centurion (whose four are in stepRide) ---------- */
const aimSpot = (far) => { aimRay(0); return _o.clone().addScaledVector(_d, Math.max(3, rayWorld(_o, _d, far) - .4)); }, aimMech = (far) => { aimRay(0); return titanHit(_o, _d, rayWorld(_o, _d, far), "you").who; };
const ahead = (t, o, far, cone) => { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), dx = o.pos.x - t.pos.x, dz = o.pos.z - t.pos.z, d = Math.hypot(dx, dz); return d < far && (dx * fx + dz * fz) / (d || 1) > cone; };
const coreGo = (t, name, fn) => { if (!K._core) return; if (t.core >= 1) { t.core = 0; say(name + ".", 2); snd("charge_fire", { pitch: .5, gain: 1.6 }); P.shake = Math.max(P.shake, .4); fn(); } else say("The core is at " + Math.round(t.core * 100) + " percent.", 1.5); };
const ABIL = {
  kestrel(t) {
    if (K._rockets && t.rk <= 0) { const o = aimMech(120); if (o) { t.rk = 10; hurtTitan(o, 600, true); o.markT = 5; tracer(muzzleAt(-.9, .7, 2), toU(V3(o.pos.x, o.pos.y + 3.5, o.pos.z)), "#ff5a3a", 5000, 1.5); say("Marked. It takes a fifth more for 5 seconds.", 2); } else say("The dart needs a mech under the crosshair.", 1.5); }
    if (K._wall && t.vortexCd <= 0) { t.vortexCd = 12; t.ward = 1500; t.wardT = 2.5; snd("shield_hit", { pitch: 1.5 }); say("Aegis up.", 1.2); }
    if (K._pulse && t.pulseCd <= 0) { t.pulseCd = 14; t.hoverT = 3; snd("thump", { pitch: 1.4 }); say("Thrusters.", 1.2); }
    coreGo(t, "Orbital Lock Core", () => { const picks = TITANS.filter((o) => o.alive && o.team !== t.team && ahead(t, o, 110, .3)).slice(0, 3).map((o) => o.pos); for (const v of VEH) if (picks.length < 3 && v.alive && v.side === "foe" && ahead(t, v, 110, .3)) picks.push(v.pos);
      if (!picks.length) picks.push(aimSpot(110)); picks.forEach((p, i) => later(1 + i * .25, () => { const at = V3(p.x, groundH(p.x, p.z) + .5, p.z); tracer(toU(V3(at.x, at.y + 160, at.z)), toU(at), "#d8f8ff", 30000, 4); blast(at, 5, { team: "you", titan: 175, pilot: 150 }); })); }); },
  bastion(t) {
    if (K._rockets && t.rk <= 0) { t.rk = 10; const at = aimSpot(90); snd("thump", { gain: 1.4 }); later(.7, () => { blast(at, 5.5, { team: "you", titan: 55, pilot: 150 }); for (const o of TITANS) if (o.alive && o.team !== t.team && o.remote == null) { const dx = o.pos.x - at.x, dz = o.pos.z - at.z, d = Math.hypot(dx, dz); if (d < 7) { o.vel.x += dx / (d || 1) * 10; o.vel.z += dz / (d || 1) * 10; } } }); }
    if (K._wall && t.vortexCd <= 0) { t.vortexCd = 16; t.ward = 3500; t.wardT = 6; snd("shield_hit", { pitch: .8, gain: 1.3 }); say("Gun-shield up. You are slower behind it.", 1.8); }
    if (K._pulse && t.pulseCd <= 0) { t.pulseCd = 18; t.fortT = 5; snd("thump", { pitch: .5, gain: 1.4 }); say("Dug in.", 1.5); }
    coreGo(t, "Aegis Overdrive Core", () => { t.shield = BAR; t.drT = 8; if (B.mp !== "guest") addDome("you", t.pos.x, t.pos.z, 15, 8); }); },
  jackal(t) {
    if (K._rockets && t.rk <= 0) { t.rk = 10; const p = toU(V3(t.pos.x, t.pos.y + 1, t.pos.z)); for (const k of [.3, .6, 1]) ringFx(p, "#9fd8ff", 30 * U * k, .3 + k * .3); snd("shield_hit", { pitch: .6, gain: 1.4 }); let n = 0; for (const o of TITANS) if (o.alive && o.team !== t.team && ahead(t, o, 30, .4)) { n++; if (o.remote == null) o.shield = 0; hurtTitan(o, 300, true); } say(n ? "Arc wave. Their shields are gone." : "Arc wave.", 1.5); }
    if (K._wall && t.vortexCd <= 0) { t.vortexCd = 8; const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), o = V3(t.pos.x, t.pos.y + 2.5, t.pos.z), d = Math.max(0, Math.min(15, rayWorld(o, V3(fx, 0, fz), 17) - 2)); flash(toU(o), "#b8a0ff", 3000, .2); t.pos.x += fx * d; t.pos.z += fz * d; t.vel.x = fx * 6; t.vel.z = fz * 6; flash(toU(V3(t.pos.x, t.pos.y + 2.5, t.pos.z)), "#b8a0ff", 3000, .2); snd("thump", { pitch: 1.6 }); }
    if (K._pulse && t.pulseCd <= 0) { t.pulseCd = 20; if (B.mp !== "guest") stunAt(t.pos.x, t.pos.z, 30, "you", 6); ringFx(toU(V3(t.pos.x, t.pos.y + 1, t.pos.z)), "#c0c0c0", 30 * U, 1); say("Jammer on. Their turrets and pods are blind for 6 seconds.", 2.2); }
    coreGo(t, "Overclock Core", () => { t.dash = t.dashMax; t.dashT = 0; t.ocT = 8; }); },
  furnace(t) {
    if (t.cans < 2 && t.rk <= 0) { t.cans++; t.rk = 12; }
    if (K._rockets) { if (t.cans > 0) { const at = aimSpot(40), m = new THREE.Mesh(new THREE.CylinderGeometry(.5 * U, .5 * U, 1.3 * U, 8), new THREE.MeshToonMaterial({ color: "#a4532a" })); m.position.set(at.x * U, (groundH(at.x, at.z) + .65) * U, at.z * U); scene.add(m); CANS.push({ x: at.x, z: at.z, t: 25, mesh: m }); if (t.cans === 2) t.rk = 12; t.cans--; say("Canister down. Put slag on it.", 1.8); } else say("No canister ready.", 1.2); }
    if (K._wall && t.vortexCd <= 0) { t.vortexCd = 16; t.ward = 3000; t.wardT = 5; t.scorchT = 5; snd("shield_hit", { pitch: .6, gain: 1.3 }); say("Plating up.", 1.2); }
    if (K._pulse && t.pulseCd <= 0) { t.pulseCd = 18; const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); for (let i = 1; i <= 5; i++) addFire(t.pos.x + fx * i * 6, t.pos.z + fz * i * 6, 3.2, 5, 400); snd("thump", { pitch: .5, gain: 1.5 }); say("Slag wall.", 1.2); }
    coreGo(t, "Meltdown Core", () => { const c = V3(t.pos.x, t.pos.y + 1.5, t.pos.z); blast(c, 9, { team: "you", titan: 0, pilot: 150 }); for (const o of TITANS) if (o.alive && o.team !== t.team && Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < 14 + o.r) hurtTitan(o, 4500, true); addFire(t.pos.x, t.pos.z, 12, 5, 500); }); },
};
/* ---------- the Nomad's four ---------- */
ABIL.nomad = function (t) {
  if (K._rockets && t.rk <= 0) { t.rk = 14; aimRay(0); const best = rayWorld(_o, _d, 45), at = _o.clone().addScaledVector(_d, Math.max(3, best - .5)); for (let i = 0; i < 3; i++) { const a = i * 2.09 + rnd(), x = at.x + Math.cos(a) * 2.2, z = at.z + Math.sin(a) * 2.2; if (B.mp === "guest") relay("nmine", [r2(x), r2(z)]); else layMine(x, z, "you", true); ringFx(toU(V3(x, groundH(x, z) + .3, z)), "#8fe0f0", 2 * U, .5); } snd("thump", { gain: 1.2 }); say("Mines out.", 1.5); }
  if (K._wall && t.vortexCd <= 0) { aimRay(0); const th = titanHit(_o, _d, rayWorld(_o, _d, 45), "you"); if (th.who && th.who.shield > 0) { const n = Math.min(1500, Math.round(th.who.shield)); hurtTitan(th.who, n, true); t.shield = Math.min(BAR, t.shield + n); t.vortexCd = 16; tracer(muzzleAt(-.9, .7, 2), toU(V3(th.who.pos.x, th.who.pos.y + 3.5, th.who.pos.z)), "#8fe0f0", 4000, 2.4); snd("shield_hit", { gain: 1.4, pitch: 1.3 }); say("The claw took " + n + " of their shield.", 2); } else say(th.who ? "That mech has no shield to take." : "No mech in reach of the claw.", 1.8); }
  if (K._pulse && t.pulseCd <= 0) { t.pulseCd = 18; t.dash = t.dashMax; t.dashT = 0; t.rk = 0; snd("reload", { pitch: 1.4 }); say("Rearmed. Dashes and mines are ready.", 1.8); }
  if (K._core) { if (t.core >= 1) { t.core = 0; const c = V3(t.pos.x, t.pos.y + 1.5, t.pos.z), p = toU(c); say("Arc Storm Core.", 2); snd("charge_fire", { pitch: .5, gain: 1.6 }); flash(p, "#9fd8ff", 9000, .5); for (const k of [.4, .7, 1]) ringFx(p.clone().setY(p.y + 4), "#9fd8ff", 25 * U * k, .5 + k * .4); P.shake = Math.max(P.shake, .5);
      for (const o of TITANS) if (o.alive && o.team !== t.team && Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < 25 + o.r) { if (o.remote == null) { o.shield = 0; o.dash = 0; o.dashT = -2; } hurtTitan(o, 3000, true); }
      blastUnits(c, 25, "foe", 40, 3000, true); if (B.mp !== "guest") stunAt(t.pos.x, t.pos.z, 25, "you", 8); } else say("The core is at " + Math.round(t.core * 100) + " percent.", 1.5); }
}
/* ---------- batteries, riding a mech, and electric smoke ----------
   A mech has no shield of its own. A battery gives it one bar of shield and mends half a bar of hull, and pays whoever
   brought it a quarter of their call-in meter. Batteries come from a dispenser crate or out of an enemy mech: climb on
   (E beside it), and after a moment you tear its battery out for a full bar of damage. If the slot is already empty you
   leave a grenade in it instead. A mech earns one charge of electric smoke at a quarter core, and smoke throws a rider off. */
function installBattery(t) { t.shield = BAR; if (!t.doomed) t.hull = Math.min(t.hullMax, t.hull + 1250); t.batt = true; const p = toU(V3(t.pos.x, t.pos.y + 3.5, t.pos.z)); flash(p, "#8fe0f0", 3000, .3); ringFx(p, "#8fe0f0", 4 * U, .5); snd("shield_hit", { pos: [t.pos.x, t.pos.y + 3, t.pos.z], gain: 1.2, pitch: 1.2 }); }
function giveBattery(t) { P.battery = false; P.meter = Math.min(100, P.meter + 25); if (t.remote != null) relay("tbat", [t.remote]); else installBattery(t); say("Battery in. That mech has a shield, and you have a quarter more on your own meter.", 3); }
function throwRider(hurt) { const T = P.rodeo && P.rodeo.T; P.rodeo = null; if (T) { const s = Math.sin(T.yaw), c = Math.cos(T.yaw); P.vel.set(s * 7, 9, c * 7); P.grounded = false; } if (hurt) { hurtPilot(hurt); say("Electric smoke. You are thrown off.", 2.5); } }
function mechSmoke(t) { t.smoke = 0; t.smokeT = 4; snd("thump", { pos: [t.pos.x, t.pos.y + 4, t.pos.z], gain: 1.3, pitch: .7 }); if (t.remote == null && B.mp) relay("tsmk", 0); if (P.rodeo && P.rodeo.T === t) throwRider(45); }
function smokeStep(t, dt) { t.smokeT -= dt; if (rnd() < dt * 22) puff(toU(V3(t.pos.x + (rnd() - .5) * 5, t.pos.y + 2 + rnd() * 4, t.pos.z + (rnd() - .5) * 5)), { n: 5, color: "#9fb4c0", dark: true, opacity: .55, size: 12, life: 1.6, grow: 2, drag: 1.5, vel: () => V3((rnd() - .5) * 30, 10 + rnd() * 20, (rnd() - .5) * 30) }); if (rnd() < dt * 6) flash(toU(V3(t.pos.x, t.pos.y + 4, t.pos.z)), "#9fd8ff", 900, .08);
  if (t.team !== "you" && !P.titan && P.dead <= 0 && Math.hypot(P.pos.x - t.pos.x, P.pos.z - t.pos.z) < 6 && Math.abs(P.pos.y - t.pos.y) < 9) hurtPilot(30 * dt); }
function stepRodeo(dt) { const R = P.rodeo; if (!R) return; const T = R.T; if (!T.alive || T.doom > 0 || P.dead > 0 || P.titan) { P.rodeo = null; return; } if (K.Space && R.t > .3) { throwRider(0); return; }
  R.t += dt; const at = titanPoint(T, 0, T.h + .05, .7); P.pos.copy(at); P.vel.set(0, 0, 0); P.grounded = true;
  if (R.t >= 1.3) { if (T.batt !== false) { T.batt = false; hurtTitan(T, 2500, true); if (!P.battery) { P.battery = true; say("You tore its battery out. Carry it to a friendly mech and press E.", 3.5); } else say("You tore its battery out.", 2.5); } else { hurtTitan(T, 1800, true); say("The slot was empty, so you left a grenade in it.", 2.5); } snd("explosion", { pos: [T.pos.x, T.pos.y + 5, T.pos.z], gain: .9 }); throwRider(0); } }
function startRodeo(T) { P.rodeo = { T, t: 0 }; say(T.batt !== false ? "You are on. Hold tight while you get the battery out. Space lets go." : "You are on. Space lets go.", 2.5); if (T.remote == null && T.smoke > 0) later(.6, () => { if (P.rodeo && P.rodeo.T === T && T.alive) mechSmoke(T); }); }

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
const SWAP = .5, NADE = .8, KNIFE = .5, KITU = .6, gunKind = () => P.weapon === 1 ? ({ mag: "maglauncher", arc: "arccannon", seeker: "seeker" }[LOAD.anti] || "charge") : P.weapon === 2 ? "pistol" : PW[LOAD.weapon] && !PW[LOAD.weapon].side ? LOAD.weapon : "carbine", handsBusy = () => P.swapT >= 0 || P.nadeT >= 0 || P.meleeT >= 0 || !!P.grap || P.phaseT > 0;
const NADES = [];
function startSwap(to) { if (P.titan || handsBusy() || to === P.weapon) return; P.swapFrom = gunKind(); P.swapTo = to; P.swapT = 0; P.reload = 0; P.charge = 0; snd("swap"); }
function startNade() { const sat = NADES.find((n) => n.kind === "satchel" && n.team === "you" && !n.boom); if (sat && !P.titan) { sat.boom = true; snd("selector"); if (B.mp) relay("boom", 0); return; } if (P.titan || P.seq || P.dead > 0 || handsBusy() || P.ordCd > 0) { if (P.ordCd > 0 && !P.titan) snd("dry"); return; } P.nadeT = 0; P.nadeOut = false; P.nadeHold = LOAD.ord === "frag"; P.fuse = 0; P.reload = 0; P.charge = 0; snd("frag_pin"); }
function startKnife() { if (P.titan || P.seq || P.dead > 0 || handsBusy()) return; P.meleeT = 0; P.meleeHit = false; P.reload = 0; P.charge = 0; snd("melee_knife"); }
function throwNade() { const kind = LOAD.ord, short = kind === "satchel"; P.ordCd = kind === "satchel" ? 20 : 18; const fuse = kind === "frag" ? Math.max(.15, 4 - P.fuse) : kind === "satchel" ? 40 : 6; aimRay(0); const pos = _o.clone().addScaledVector(_r, -.25).addScaledVector(_f, .5), vel = _f.clone().multiplyScalar(short ? 12 : 21).add(V3(0, 4.5, 0)).addScaledVector(P.vel, .6); snd("swap", { pitch: 1.3, gain: .8 }); launch(pos, vel, fuse, kind); }
// send something through the air: frag, arc, therm (thermite star), satchel, gl (the Grenadier's round), mag (magnetic grenade), orb (the arc disruptor's ball)
function launch(pos, vel, fuse, kind) { mkNade(pos, vel, "you", fuse, kind); if (B.mp) relay("nade", [r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z), r2(fuse), kind]); }
const NCOL = { frag: "#2f3528", arc: "#3f8fb0", therm: "#ff8a3a", satchel: "#6a5a3a", gl: "#3a3f2a", mag: "#5a6a7a", orb: "#bfeaff" };
function mkNade(pos, vel, team, fuse = 1.7, kind = "frag", side = null) { if (kind === true || kind === 1) kind = "arc"; else if (!kind) kind = "frag"; const big = kind === "orb" ? 3 : kind === "satchel" ? 1.6 : 1, m = new THREE.Mesh(new THREE.BoxGeometry(2.2 * big, 2.6 * big, 2.2 * big), new THREE.MeshBasicMaterial({ color: new THREE.Color(NCOL[kind] || NCOL.frag).multiplyScalar(kind === "orb" || kind === "therm" ? 2.6 : 1) })); scene.add(m); NADES.push({ pos, vel, team, t: fuse, kind, arc: kind === "arc", side: side || team, mesh: m, spin: rnd() * 6, tick: 0 }); }
// a grenade in the air: it falls, bounces off whatever it meets and goes off when its fuse runs out
function stepNades(dt) { for (let i = NADES.length - 1; i >= 0; i--) { const n = NADES[i], p = n.pos, v = n.vel; n.t -= dt; const K2 = n.kind, mine = n.team === "you", gone = () => { scene.remove(n.mesh); NADES.splice(i, 1); }; let hit = false;
    if (K2 === "orb") { p.addScaledVector(v, dt); n.mesh.position.set(p.x * U, p.y * U, p.z * U); n.mesh.rotation.y += dt * 9; n.tick -= dt; if (rnd() < dt * 30) flash(toU(p), "#9fd8ff", 700, .06);
      if (n.tick <= 0) { n.tick = .4; if (mine) { for (const o of TITANS) if (o.alive && o.team !== "you" && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 8 + o.r) { hurtTitan(o, 150, true, 2.5); tracer(toU(p), toU(V3(o.pos.x, o.pos.y + 3, o.pos.z)), "#bfeaff", 20000, 1); } for (const u of VEH) if (u.alive && u.side === "foe" && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 8) damage(u, 150, toU(P.pos), "blast", true); } }
      if (n.t <= 0 || !free(p.x, p.y, p.z, .3, .3) || p.y < groundH(p.x, p.z)) { ringFx(toU(p), "#9fd8ff", 4 * U, .4); gone(); } continue; }
    if (K2 === "satchel" && n.boom) { gone(); snd("frag_blast", { pos: xyz(p) }); blast(p.clone(), 5, mine ? { team: "you", titan: 70, pilot: 160 } : {}); if (mine) for (const u of VEH) if (u.alive && u.side === "foe" && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 5) damage(u, 600, toU(P.pos), "blast", true); continue; }
    if (K2 === "gl" || K2 === "mag" || K2 === "therm") { const o = TITANS.find((q) => q.alive && (n.team ? q.team !== n.team : true) && Math.hypot(q.pos.x - p.x, q.pos.z - p.z) < q.r + .7 && p.y > q.pos.y - .5 && p.y < q.pos.y + q.h + .5); if (o) { n.stuck = o; hit = true; n.onMech = true; } }
    v.y -= (K2 === "gl" ? 12 : 24) * dt;
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt; if (free(nx, p.y, p.z, .15, .12)) p.x = nx; else { v.x *= -.45; hit = true; } if (free(p.x, p.y, nz, .15, .12)) p.z = nz; else { v.z *= -.45; hit = true; }
    const ny = p.y + v.y * dt, g = groundH(p.x, p.z) + .08; if (ny <= g) { p.y = g; if (v.y < -3) hit = true; v.y *= -.35; v.x *= .7; v.z *= .7; } else if (!free(p.x, ny, p.z, .15, .12)) { if (v.y < -3) hit = true; v.y *= -.35; v.x *= .7; v.z *= .7; } else p.y = ny;
    if (hit && v.length() > 2.5) snd("frag_bounce", { pos: xyz(p) }); n.spin += dt * 9; n.mesh.position.set(p.x * U, p.y * U, p.z * U); n.mesh.rotation.set(n.spin, n.spin * .7, 0);
    if ((K2 === "gl" || K2 === "mag") && (hit || n.onMech)) { gone(); snd("frag_blast", { pos: xyz(p), gain: .8 }); if (K2 === "gl") { blast(p.clone(), 3, mine ? { team: "you", titan: 4, pilot: 65 } : {}); if (mine) for (const u of VEH) if (u.alive && u.side === "foe" && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 3.5) damage(u, 165, toU(P.pos), "blast", true); } else { blast(p.clone(), 2.2, mine ? { team: "you", titan: 17.5, pilot: 40 } : {}); if (mine) for (const u of VEH) if (u.alive && u.side === "foe" && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 3) damage(u, 200, toU(P.pos), "blast", true); } continue; }
    if (K2 === "therm" && (hit || n.onMech)) { gone(); snd("charge_fire", { pos: xyz(p), pitch: 1.2 }); if (mine) { if (n.stuck) { const o = n.stuck; for (let k = 0; k < 8; k++) later(k * .5, () => { if (o.alive) hurtTitan(o, 137.5, true); }); } addFire(p.x, p.z, 2.5, 4, n.stuck ? 0 : 275); } continue; }
    if (K2 === "satchel") { if (hit) { v.x *= .3; v.z *= .3; } }
    if (n.arc && hit) { scene.remove(n.mesh); NADES.splice(i, 1); snd("charge_fire", { pos: xyz(p), pitch: 1.5 }); flash(toU(p), "#8fe0f0", 2600, .25); ringFx(toU(p), "#8fe0f0", 6 * U, .5); puff(toU(p), { n: 18, color: "#d8f8ff", hot: 3, size: 3, life: .3, vel: () => V3((rnd() - .5) * 110, rnd() * 80, (rnd() - .5) * 110) });
      if (n.side && B.mp !== "guest") stunAt(p.x, p.z, 6, n.side, 4); if (n.team === "you") { for (const u of GRUNTS) if (u.s.dead < 0 && Math.hypot(u.s.root.position.x / U - p.x, u.s.root.position.z / U - p.z) < 3.5) damage(u, 40, toU(P.pos), "blast", true); for (const rp of RPS.values()) if (rp.ok && rp.side === "foe" && rp.pos.distanceTo(p) < 4) relay("phit", [rp.slot, 40, 0]); } continue; }
    if (n.t <= 0) { scene.remove(n.mesh); NADES.splice(i, 1); if (K2 === "satchel" || K2 === "therm") continue; snd("frag_blast", { pos: xyz(p) }); blast(p.clone(), 4.2, n.team ? { team: n.team } : {}); } } }
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
  const t = P.titan, out = t || P.dead > 0 || P.seq; if (out) { P.swapT = P.nadeT = P.meleeT = P.kitT = -1; }
  // the moves the hands make: each has its own clock, and the thing it does happens part way through
  if (P.swapT >= 0) { const was = P.swapT; P.swapT += dt; if (was < SWAP * .42 && P.swapT >= SWAP * .42) { if (P.weapon !== 1) P.mags[P.weapon] = P.ammo; P.weapon = P.swapTo; if (P.weapon !== 1) P.ammo = P.mags[P.weapon]; snd("raise"); } if (P.swapT >= SWAP) { P.swapT = -1; VM.bump(-1.2); } }
  if (P.nadeT >= 0) { P.fuse += dt; if (P.nadeHold && P.nadeT >= NADE * .4) { P.nadeT = NADE * .4 - dt; if (P.fuse >= 4) { P.nadeT = -1; P.nadeHold = false; P.ordCd = 18; snd("frag_blast"); blast(P.pos.clone().setY(P.pos.y + 1), 4.2, {}); hurtPilot(140); } } }
  if (P.nadeT >= 0) { P.nadeT += dt; if (!P.nadeOut && P.nadeT >= NADE * .5) { P.nadeOut = true; throwNade(); VM.bump(1.6); } if (P.nadeT >= NADE) P.nadeT = -1; }
  if (P.kitT >= 0) { P.kitT += dt; if (!P.kitHit && P.kitT >= KITU * .5) { P.kitHit = true; VM.bump(1.2); } if (P.kitT >= KITU) P.kitT = -1; }
  if (P.meleeT >= 0) { P.meleeT += dt; if (!P.meleeHit && P.meleeT >= KNIFE * .36) { P.meleeHit = true; knifeHit(); VM.bump(1); } if (P.meleeT >= KNIFE) P.meleeT = -1; }
  P.ads += ((P.adsHeld && !t && !handsBusy() && P.reload <= 0 && P.dead <= 0 && !P.wall ? 1 : 0) - P.ads) * (1 - Math.exp(-dt * 12));
  const busy = handsBusy(), canFire = mouseDown && P.dead <= 0 && !P.mantle && !P.seq && !busy;
  if (chargeSnd && (t || P.weapon !== 1 || P.dead > 0 || busy)) { chargeSnd.stop(.05); chargeSnd = null; }
  if (t) { if ((K.KeyR && t.ammo < MECHS[t.mech].mag && t.reload <= 0) || (t.ammo <= 0 && t.reload <= 0)) { t.reload = 2.2; snd("reload", { pitch: .6, gain: 1.2 }); } else if (t.mech === "kestrel") { const ok = P.dead <= 0 && !P.seq && t.fireCd <= 0 && t.reload <= 0 && t.ammo > 0; if (mouseDown && ok) t.chg = Math.min(1.2, t.chg + dt); else if (t.chg > 0) { if (ok) railShot(t); else t.chg = 0; } } else if (mouseDown && P.dead <= 0 && !P.seq && t.fireCd <= 0 && t.reload <= 0) fireCannon(t); }
  else if (busy) { }
  else if (P.weapon === 1 && LOAD.anti === "seeker") { let tg = null; if (canFire && P.fireCd <= 0) { aimRay(0); let bs = .14; const see = (ref, x, y, z, kind) => { const dx = x - _o.x, dy = y - _o.y, dz = z - _o.z, d = Math.hypot(dx, dy, dz); if (d > 130) return; const off = Math.acos(clamp((dx * _d.x + dy * _d.y + dz * _d.z) / d, -1, 1)); if (off < bs && rayWorld(_o, V3(dx / d, dy / d, dz / d), d) >= d - 1.5) { bs = off; tg = { ref, kind, at: V3(x, y, z) }; } };
      for (const q of TITANS) if (q.alive && q.team === "foe") see(q, q.pos.x, q.pos.y + q.h * .55, q.pos.z, "t"); for (const v of VEH) if (v.alive && v.side === "foe") see(v, v.pos.x, groundH(v.pos.x, v.pos.z) + (v.def.veh.hover || 1.2), v.pos.z, "v"); }
    if (tg) { if (P.lockOn !== tg.ref) { P.lockOn = tg.ref; P.charge = 0; snd("selector", { pitch: 1.4 }); } P.charge += dt / 1.4; if (P.charge >= 1) { P.charge = 0; P.fireCd = 2.6; P.lockOn = null; P.kick = 1; VM.kick(3.4); flashT = .08; snd("charge_fire", { pitch: .7 }); const from = muzzleAt(.2, .16, .8); tracer(from, toU(tg.at), "#ffb060", 6000, 2.2); flash(from, "#ffb060", 2400, .14); netShot(tg.at, 1);
        SEEK.push({ t: clamp(_o.distanceTo(tg.at) / 90, .15, 1.2), tg }); } } else { P.lockOn = null; P.charge = Math.max(0, P.charge - dt * 2.5); } }
  else if (P.weapon === 1 && LOAD.anti === "mag") { P.charge = 0; if (canFire && P.fireCd <= 0) { P.fireCd = 1.5; for (let i = 0; i < 2; i++) later(i * .16, () => { if (P.dead > 0 || P.titan) return; aimRay(.01); VM.kick(2.2); flashT = .06; snd("shotgun", { pitch: 1.2, gain: .9 }); launch(_o.clone().addScaledVector(_f, .7).addScaledVector(_u, -.12), _d.clone().multiplyScalar(26).add(V3(0, 2.5, 0)).addScaledVector(P.vel, .5), 3, "mag"); }); } }
  else if (P.weapon === 1 && LOAD.anti === "arc") { P.charge = 0; if (canFire && P.fireCd <= 0) { P.fireCd = 3.2; aimRay(0); VM.kick(3); flashT = .08; snd("charge_fire", { pitch: 1.4 }); launch(_o.clone().addScaledVector(_f, 1), _d.clone().multiplyScalar(15), 6, "orb"); } }
  else if (P.weapon === 1) { if (canFire && P.fireCd <= 0) { if (!chargeSnd) chargeSnd = snd("charge_up"); P.charge += dt / .8; if (P.charge >= 1) fireCharge(); } else { if (chargeSnd) { chargeSnd.stop(.05); chargeSnd = null; } P.charge = Math.max(0, P.charge - dt * 2); } }
  else { if (P.reload > 0) { const R = pw().reload, u0 = 1 - P.reload / R; P.reload -= dt; const u1 = 1 - P.reload / R; if (u0 < .27 && u1 >= .27) VM.bump(-.8); if (u0 < .655 && u1 >= .655) { VM.bump(2.2); snd("selector", { gain: .8, pitch: .8 }); } if (u0 < .87 && u1 >= .87) VM.bump(-1.6); if (P.reload <= 0) P.ammo = pw().mag; }
    else if ((K.KeyR && P.ammo < pw().mag) || P.ammo <= 0) { P.reload = pw().reload; snd("reload"); } else if (canFire && P.fireCd <= 0) fireCarbine(); }
  const s = hs(), moving = P.grounded && !P.sliding && !t ? Math.min(1, s / 9) : 0; P.bob += dt * (5 + s * .9) * (moving > 0 ? 1 : 0);
  VS.visible = !t && P.dead <= 0 && !P.seq && !MAP.on && started; VS.kind = gunKind(); VS.charge = P.weapon === 1 ? P.charge : 0; VS.ads = P.ads; VS.reload = P.weapon !== 1 && P.reload > 0 ? clamp(1 - P.reload / pw().reload, 0, 1) : -1; VS.swap = P.swapT >= 0 ? P.swapT / SWAP : -1; VS.swapFrom = P.swapFrom; VS.nade = P.nadeT >= 0 ? P.nadeT / NADE : -1; VS.melee = P.meleeT >= 0 ? P.meleeT / KNIFE : -1; VS.kit = P.kitT >= 0 ? P.kitT / KITU : -1; VS.kitKind = LOAD.kit; VS.ord = LOAD.ord;
  VS.speed = s; VS.grounded = P.grounded; VS.vy = P.vel.y; VS.vy0 = P.vyWas || 0; P.vyWas = P.vel.y; VS.sliding = P.sliding; VS.mantle = !!P.mantle; VS.roll = P.roll; VS.dip = P.dip; VS.yaw = P.yaw; VS.pitch = P.pitch; VS.firing = mouseDown || P.fireCd > -.25; VM.step(dt, VS);
  if (t) cockpitGun(t.mech); gun.visible = !!t; cannon.visible = !!t && CK.mode === "on"; fist.visible = cannon.visible && t.punch > 0; if (fist.visible) { const u = Math.sin(clamp(1 - t.punch / .45, 0, 1) * Math.PI); fist.position.set(-.5 + u * .3, -.75 + u * .35, -.6 - u * .9); }
  if (t) { const tr = t.reload > 0 ? Math.sin(Math.min(1, (2.2 - t.reload) / 2.2) * Math.PI) : 0, wb = Math.sin(t.walk * 1.1); cannon.position.set(CR ? .5 : .66, (CR ? -.4 : -.6) - tr * (CR ? .3 : .4) + Math.abs(wb) * .02, (CR ? -1.15 : -.5) + P.kick * .1); cannon.rotation.set(P.kick * .03 + tr * .5, .04, CR ? -tr * .35 : 0); if (CR) { const re = t.reload > 0 ? clamp(1 - t.reload / 2.2, 0, 1) : -1, k = (a, b) => clamp((re - a) / (b - a), 0, 1); CR.mag.visible = re < 0 || re < .33 || re > .52; CR.mag.position.y = re < 0 ? 0 : re < .33 ? -.9 * k(.22, .32) : -1.4 * (1 - k(.58, .68)); CR.g.position.set(0, .1, 1.0); CR.g.rotation.set(0, 0, 0); } }
  flashM.visible = flashT > 0 && (!!t || VS.visible); if (flashM.visible) { if (t) { flashM.position.set(CR ? .5 : .66, CR ? -.33 : -.52, CR ? -2.36 : -2.0); flashM.scale.setScalar(2.6); } else { flashM.position.copy(VM.muzzle); flashM.position.z -= .05; flashM.scale.setScalar(P.weapon === 1 ? 1.5 : .9); } flashM.rotation.z = rnd() * 3; }
}

/* ---------- the run ---------- */
function checkDone() {}
function restart() { for (const rp of RPS.values()) rp.titan = null; for (const t of TITANS) scene.remove(t.rig.root); TITANS.length = 0; for (const h of HUSKS) scene.remove(h.root); HUSKS.length = 0; for (const r of ROCKETS) scene.remove(r.mesh); ROCKETS.length = 0; P.seq = null; CK.mode = "off"; for (const D of DROPS) scene.remove(D.pod); DROPS.length = 0; LATER.length = 0; foeCalled = false; P.mine = null; P.meter = 0; P.weapon = 0; P.charge = 0;
  resetBattle(); respawn(); if (MAP.on) setMap(false); runT = 0; runOn = true; runDone = false; say("");
  campDone = false; P.campCore = 0; P.campAssets = 1; P.campRate = 1; P.campDmg = 1;
  WEATHER.state.weather = PLAN && PLAN.indoor ? "clear" : CFG.weather;
  if (!B.mp && pendingFor(MAPKEY)) { const k = battleSetup(); if (k.weather && !(PLAN && PLAN.indoor)) WEATHER.state.weather = k.weather; P.meter = Math.min(100, k.meter); B.supply.you = Math.max(0, B.supply.you + k.cp); if (OP.atk === "you") { OP.max = Math.max(5, OP.max + k.tickets); OP.tickets = OP.max; } P.campCore = k.core; P.campAssets = k.assets; P.campRate = k.rate; P.campDmg = k.dmg;
    if (k.strike) { if (!B.assets.includes("strike")) B.assets.push("strike"); B.supply.you += 180; }
    if (k.turrets) for (const p of POINTS) if (p.sector < k.turrets) deploy("you", "turret", false, [p.x + 3, p.z + 3]);
    if (k.notes.length) later(1.5, () => say("The campaign gives you: " + k.notes.join(". ") + ".", 7)); } }
let campDone = false;
function campWatch() { if (campDone || B.mp || !B.over || !pendingFor(MAPKEY)) return; campDone = true; const msg = campResolve(B.over === "you", OP.max ? OP.tickets / OP.max : 0, OP.sector); say(msg + " Press T to go back to the war.", 0); }

/* ---------- input ---------- */
const cv = renderer.domElement;
function wantLock() { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { noLock = true; }); } catch (e) { noLock = true; } }
document.addEventListener("pointerlockchange", () => { const was = locked; locked = document.pointerLockElement === cv; if (!locked) { mouseDown = false; for (const k in K) K[k] = false; if (was && started && !panelOpen && !MAP.on) openSettings(); } });   // Escape frees the mouse, and that is the way into Settings
document.addEventListener("pointerlockerror", () => { noLock = true; });
const active = () => started && !panelOpen && (locked || noLock || MAP.on);
function toggleMap() { if (MAP.on) { setMap(false); wantLock(); } else { setMap(true); for (const k in K) K[k] = false; mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); } }
function useKey() { if (P.seq || P.titan || P.rodeo) return; const near = (t, r) => t.alive && t.doom <= 0 && Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) < r && Math.abs(t.pos.y - P.pos.y) < 9;
  if (P.battery) { const f = TITANS.find((t) => t.team === "you" && near(t, 7)); if (f) { giveBattery(f); return; } }
  const m = P.mine; if (m && near(m, 7) && Math.abs(m.pos.y - P.pos.y) < 6) { startEnter(m); return; }
  const foe = TITANS.find((t) => t.team !== "you" && near(t, 5.5)); if (foe) startRodeo(foe); }
addEventListener("keydown", (e) => { if (started && !panelOpen && e.ctrlKey) e.preventDefault(); if (e.repeat) return; if (started && ["Space", "Tab", "KeyC", "KeyR", "KeyE", "KeyV", "KeyQ", "KeyF", "KeyG", "KeyX", "Digit1", "Digit2", "Digit3"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyP" && started && !MAP.on) { togglePanel(); return; }
  if (e.code === "Tab" && started && !panelOpen) { toggleMap(); return; }
  if (MAP.on) { MAP.keys[e.code] = true; if (e.code === "KeyT") again(); return; }
  if (!active()) return; const code = e.code === "ControlLeft" ? "KeyC" : e.code; K[code] = true;
  if (code === "Space") P.jumpBuf = .14; if (code === "KeyT") again(); if (code === "KeyE" && P.dead <= 0) useKey(); if (code === "KeyV" && P.dead <= 0 && !P.titan) tryCallTitan();
  if (code === "Space") K._dash = !!P.titan; if (code === "KeyF") { if (P.titan) K._pulse = true; else startKnife(); } if (P.titan && !e.repeat) { if (code === "KeyV") K._punch = true; if (code === "KeyQ") K._rockets = true; if (code === "KeyE") K._wall = true; if (code === "KeyX") K._core = true; if (code === "KeyC") K._smoke = true; } if (code === "KeyZ" && !e.repeat) ping("fa"); if (code === "KeyB" && !e.repeat && !P.titan) ping("fb"); if (code === "KeyX" && !P.titan) startNade(); if (code === "KeyG" && !e.repeat) { gDownT = performance.now(); WHEEL.x = WHEEL.y = 0; WHEEL.was = WHEEL.armed = WHEEL.dbl = false; setTimeout(() => { if (gDownT && performance.now() - gDownT >= 190) { WHEEL.on = true; wheelDraw(); } }, 200); }
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
function masteryRow(id) { const L = levelOf(id), nx = xpNext(id), T = TECH[id], tp = tpFree(id), t = MAST.tiers[id] || {}; let h = `<br><em>Level ${L}${nx ? " · " + nx[0] + " of " + nx[1] + " XP to the next" : " · mastered"}${T ? " · " + tp + " Tech Point" + (tp === 1 ? "" : "s") + " to spend" : ""}</em>`;
  if (T) for (const br of ["a", "b"]) { const n = t[br] || 0, worn = MAST.pick[id] === br && n > 0, cost = [1, 1, 2][n]; h += `<br><span class="tech"><button data-wear="${id}:${br}" class="${worn ? "on" : ""}" ${n ? "" : "disabled"}>${worn ? "Worn" : "Wear"}</button> <strong>${T[br].name}</strong> ${T[br].tiers.map((x, i) => `<i class="${i < n ? "got" : ""}">${i + 1}. ${x}</i>`).join(" ")} ${n < 3 ? `<button data-tier="${id}:${br}" ${tp >= cost ? "" : "disabled"}>Open tier ${n + 1} (${cost})</button>` : ""}</span>`; }
  return h; }
/* One file holds everything this browser knows about you: loadout, battlegroups, assets, mastery and tech, and settings. */
function exportSave() { const data = { app: "afterburn", v: 1, when: new Date().toISOString(), load: LOAD, mastery: MAST, cfg: CFG, campaign: CAMP.s }, a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" })); a.download = "afterburn-save.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function importSave(file, note) { const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (d.app !== "afterburn" || !d.load) throw new Error("not a save"); localStorage.setItem("mf-fps-load", JSON.stringify(d.load)); if (d.mastery) localStorage.setItem("ab-mastery", JSON.stringify(d.mastery)); if (d.cfg) localStorage.setItem("mf-fps-cfg3", JSON.stringify(d.cfg)); if (d.campaign) localStorage.setItem("ab-campaign", JSON.stringify(d.campaign)); note.textContent = "Loaded. The page will start again with it."; setTimeout(() => location.reload(), 900); } catch (e) { note.textContent = "That file is not an Afterburn save."; } }; r.readAsText(file); }
function buildCampaign() { const host = $("camp"); if (!host) return; const s = CAMP.s;
  if (!s) { host.innerHTML = `<h2>Galactic Conquest</h2><p class="note">Nine systems lie between Aegis Prime and Haven Outpost. You play one side and the machine plays the other. Each turn you collect War Credits, spend them on fleets, garrisons and Bonus Cards, and move one Strike Fleet one jump. A fleet that arrives over an enemy system starts an operation on the ground, and you fight it. The systems you hold help you in every battle, and how a battle ends carries into the next. Take their capital, hold three quarters of the map for two turns, or leave them with no fleet and no means to build one.</p><div class="row"><button data-camp="new" class="on">Begin as the ${FACTIONS[LOAD.side].name}</button></div><p class="note">You go to war as the faction chosen on the Faction tab. The Directorate earns a tenth more and pays less for fleets and garrisons. The Coalition pays less for Bonus Cards, and its fleets may jump twice when the first jump is through its own space.</p>`; return; }
  const me = s.fac, col = (o) => (o === me ? "#8fe0f0" : o ? "#ff7a5a" : "#8a8272"), N = Object.values(s.nodes), sel = s.nodes[s.sel] || null, pend = s.pending, lanes = [], mine = s.fleets.filter((q) => q.f === me), fs = mine.find((q) => q.id === s.fsel), can = fs && !s.moved ? fleetReach(fs) : []; for (const n of N) for (const a of n.adj) if (a > n.id) lanes.push([n, s.nodes[a]]);
  const fleetsAt = (id, f) => s.fleets.filter((q) => q.at === id && q.f === f).length, your = s.phase === "you" && !s.over && !pend;
  let act = "";
  if (s.over) act = `<p class="note"><b>${s.over === "won" ? "The war is won." : "The war is lost."}</b></p>`;
  else if (pend) act = `<p class="note">A battle is waiting on <b>${s.nodes[pend.id].name}</b>: you ${pend.role === "a" ? "attack" : "defend"}${pend.card ? ", with " + CCARDS[pend.card].name : ""}. ${pend.key === MAPKEY ? "The field is loaded. Go to Play and drop in alone." : ""}</p><div class="row">${pend.key === MAPKEY ? "" : `<button data-camp="resume" class="on">Load the field</button>`}<button data-camp="concede">Call it off (counts as lost)</button></div>`;
  else if (s.phase === "defend") { const t = s.nodes[s.threat]; act = `<p class="note">Their fleet is over <b>${t.name}</b> (garrison ${t.gar}). Pick a Bonus Card below if you want one for this fight.</p><div class="row"><button data-camp="defend" class="on">Defend it yourself</button><button data-camp="auto">Leave it to the garrison</button></div>`; }
  else { act = `<h2>Fleets <span class="pts">${mine.length} of ${fleetCap(me)}${s.moved ? " · you have moved this turn" : " · one fleet may move one jump"}</span></h2><div class="row">${mine.map((q, i) => `<button data-fleet="${q.id}" class="${s.fsel === q.id ? "on" : ""}">Fleet ${i + 1} at ${s.nodes[q.at].name}${q.dep ? " (depleted)" : ""}</button>${q.dep ? `<button data-resup="${q.id}" ${s.credits[me] >= campCost(me, "resupply") ? "" : "disabled"}>Resupply (${campCost(me, "resupply")})</button>` : ""}`).join("") || "<span class='note'>You have no fleet.</span>"}<button data-camp="fleet" ${s.credits[me] >= campCost(me, "fleet") && mine.length < fleetCap(me) ? "" : "disabled"}>Build a fleet (${campCost(me, "fleet")})</button></div>
      <p class="note">${fs ? (s.moved ? "You have already moved this turn." : "Pick a lit system to send this fleet there. An enemy system means an assault; an empty one is taken without a fight.") : "Pick a fleet, then a system for it."}</p>`;
    if (sel) { const T = CTYPES[sel.type]; act += `<p class="note"><b>${sel.name}</b> · ${T.name} · ${sel.owner === me ? "yours" : sel.owner ? "theirs" : "nobody's"} · garrison ${sel.gar} · ${({ day: "clear days", clear: "long dusk", overcast: "overcast", rain: "rain", storm: "storms", snow: "snow", fog: "fog" })[sel.wx] || "clear"}<br>${T.perk}</p><div class="row">${fs && canMove(fs.id, sel.id) ? `<button data-camp="move" class="on">${sel.owner && sel.owner !== me ? "Assault " : "Send the fleet to "}${sel.name}</button>` : ""}${sel.owner === me ? `<button data-camp="fortify" ${s.credits[me] >= campCost(me, "fortify") ? "" : "disabled"}>Strengthen the garrison (${campCost(me, "fortify")})</button>` : ""}</div>`; }
    act += `<div class="row"><button data-camp="endturn">End the turn</button></div>`; }
  const cards = s.over ? "" : `<h2>Bonus Cards <span class="pts">one may be played in each operation · ${campCost(me, "card")} War Credits each</span></h2><div class="cat">${Object.entries(CCARDS).map(([k, c]) => { const n = s.cards[me].filter((x) => x === k).length; return `<div class="${s.play === k ? "in" : ""}"><b>${n || "·"}</b><span><strong>${c.name}</strong><br>${c.desc}</span><span class="cbtns">${your || s.phase === "defend" ? `<button data-buy="${k}" ${s.credits[me] >= campCost(me, "card") && s.phase === "you" ? "" : "disabled"}>Buy</button>` : ""}${n ? `<button data-play="${k}" class="${s.play === k ? "on" : ""}">${s.play === k ? "Will be played" : "Play in the next fight"}</button>` : ""}</span></div>`; }).join("")}</div>`;
  host.innerHTML = `<h2>Galactic Conquest <span class="pts">Turn ${s.turn} · ${s.credits[me]} War Credits · ${N.filter((n) => n.owner === me).length} of ${N.length} systems</span></h2>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:300px;background:rgba(10,9,8,.55);border:1px solid #5a4630">${lanes.map(([a, b]) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#5a4630" stroke-width=".5" vector-effect="non-scaling-stroke"/>`).join("")}</svg>
    <div style="position:relative;height:0">${N.map((n) => `<button data-node="${n.id}" style="position:absolute;left:${n.x}%;top:${-300 + n.y * 3}px;transform:translate(-50%,-50%);padding:2px 7px;font-size:12px;border-color:${can.includes(n.id) ? "#f2c46a" : col(n.owner)};color:${col(n.owner)};background:${s.sel === n.id ? "#3a2a12" : "rgba(20,16,12,.92)"}">${n.type === "capital" ? "★ " : ""}${n.name}${"▲".repeat(fleetsAt(n.id, me))}<span style="color:#ff7a5a">${"▼".repeat(fleetsAt(n.id, otherFac(me)))}</span>${s.threat === n.id ? " ⚠" : ""}</button>`).join("")}</div>
    <p class="note">▲ your fleets · <span style="color:#ff7a5a">▼</span> theirs · Standing perks: ${standing().join(", ") || "none yet"}.</p>${act}${cards}<p class="note">${s.log.slice(0, 6).join("<br>")}</p><div class="row"><button data-camp="end">${s.over ? "Clear the map for a new war" : "Give up this war"}</button></div>`; }
$("camp").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const s = CAMP.s, d = b.dataset, side = () => { if (LOAD.side !== s.fac) { LOAD.side = s.fac; saveLoad(); } };
  if (d.node) { s.sel = d.node; } else if (d.fleet) { s.fsel = s.fsel === +d.fleet ? 0 : +d.fleet; } else if (d.resup) resupply(+d.resup); else if (d.buy) buyCard(d.buy); else if (d.play) setCard(d.play);
  else if (d.camp === "new") newCampaign(LOAD.side); else if (d.camp === "end") endCampaign(); else if (d.camp === "endturn") campEndTurn(); else if (d.camp === "fortify") fortify(s.sel); else if (d.camp === "fleet") buyFleet(); else if (d.camp === "auto") autoDefend();
  else if (d.camp === "move") { const key = moveFleet(s.fsel, s.sel); if (key) { side(); pickMap(key); return; } } else if (d.camp === "defend") { side(); pickMap(startDefence()); return; }
  else if (d.camp === "resume") { side(); pickMap(s.pending.key); return; } else if (d.camp === "concede") campResolve(false, 1, 0);
  buildCampaign(); });
function buildSetup() { const U2 = FACTIONS[LOAD.side].units, list = LOAD.list[LOAD.side] = LOAD.list[LOAD.side].filter((id) => U2[id]), AS = LOAD.assets[LOAD.side], used = list.reduce((a, id) => a + U2[id].pts, 0) + AS.reduce((a, k) => a + UTILS[k].pts, 0), btn = (attr, k, label, on, extra = "") => `<button data-${attr}="${k}" class="${on ? "on" : ""}" ${extra}>${label}</button>`;
  const tags = LOAD.tags[LOAD.side] || (LOAD.tags[LOAD.side] = {}), can = (d) => used + d.pts <= LIST_PTS && list.length + AS.length < LIST_MAX;
  $("setup").innerHTML = `<section data-pane="faction"><h2>Your faction</h2><div class="tiles">${Object.entries(FACTIONS).map(([k, f]) => `<button data-side="${k}" class="tile ${LOAD.side === k ? "on" : ""}"><b>${f.name}</b><span>${f.blurb}</span></button>`).join("")}</div><p class="note">Each faction has its own battlegroup, kept separately. Alone, the other faction is run by the machine. In a match the host\'s side plays the host\'s faction and the other side plays the other one, so keep a battlegroup ready for both.</p></section>
    <section data-pane="pilot"><h2>Primary weapon</h2><div class="row">${Object.entries(PW).filter(([, w]) => !w.side).map(([k, w]) => btn("wpn", k, w.name, LOAD.weapon === k)).join("")}</div><p class="note">${(PW[LOAD.weapon] || PW.carbine).desc} Hold the right mouse button to aim down the sights: you walk at 3.2 metres a second and the gun tightens up.</p><h2>Tactical kit</h2><div class="row">${Object.entries(KITS).map(([k, d]) => btn("kit", k, d[0], LOAD.kit === k)).join("")}</div><p class="note">${KITS[LOAD.kit][1]}</p><h2>Against Titans</h2><div class="row">${Object.entries(ANTI).map(([k, d]) => btn("anti", k, d[0], LOAD.anti === k)).join("")}</div><p class="note">${ANTI[LOAD.anti][1]} Key 2.</p><h2>Ordnance</h2><div class="row">${Object.entries(ORD).map(([k, d]) => btn("ord", k, d[0], LOAD.ord === k)).join("")}</div><p class="note">${ORD[LOAD.ord][1]} One at a time, 18 seconds to come back. Key X.</p><h2>Also carried</h2><p class="note">A sidearm (key 3) and a knife (F). The knife does 65, or finishes it outright from behind or when you are moving faster than 11 metres a second. You have 125 health, and it starts coming back 4.5 seconds after you were last hit.</p></section>
    <section data-pane="titan"><h2>Frame</h2><div class="row">${["light", "medium", "heavy"].map((k) => btn("ch", k, mechOf(LOAD.side, k).name + " (" + k + ")", LOAD.chassis === k)).join("")}</div><h2>${mechOf(LOAD.side).name} <span class="pts">${mechOf(LOAD.side).fac} · ${(mechOf(LOAD.side).hull / 2500)} bars of hull · ${mechOf(LOAD.side).dash} ${mechOf(LOAD.side).dash > 1 ? "dashes" : "dash"}</span></h2><p class="note">${mechOf(LOAD.side).desc} V is its melee, and holding B gets you out. At no hull it is doomed: one last bar, and it can still fight. C sets off its one charge of electric smoke, which comes at a quarter core. Your mech goes with your faction: the Directorate walks the Centurion and the Coalition the Nomad.</p><h2>Paint</h2><div class="row">${PAINTS.map((c) => `<button data-paint="${c}" class="sw ${LOAD.paint === c ? "on" : ""}" style="background:${c}" title="Paint"></button>`).join("")}</div></section>
    <section data-pane="group"><h2>${FACTIONS[LOAD.side].name} deck <span class="pts">${list.length + AS.length} of ${LIST_MAX} cards · ${used} of ${LIST_PTS} points</span></h2><p class="note">This is what you take into the fight. Click a card in your deck to take it out, and a card in the collection below to put it in. There is no limit on how many squads you can have on the field at once. Each one costs Command Points when you send it.</p>
    <div class="ptbar"><div style="width:${Math.min(100, used / LIST_PTS * 100)}%"></div></div>
    <div class="deck">${[...list.map((k, i) => ({ k, i, d: U2[k], unit: true })), ...AS.map((k) => ({ k, d: UTILS[k] }))].map((c) => { const th = c.unit ? thumbOf(LOAD.side, c.k, "you") : "", tg = c.unit ? tags[c.k] : ""; return `<div class="pcard in ${c.unit ? "" : "asset"}"><button class="pc-main" ${c.unit ? `data-dropi="${c.i}"` : `data-asset="${c.k}"`} title="Take it out of the deck"><span class="pc-cost">${c.d.cost}<small>CP</small></span><span class="pc-art">${th ? `<img src="${th}">` : `<b>${c.d.icon}</b>`}</span><strong>${c.d.name}</strong><em>${c.unit ? (c.d.veh ? (c.d.veh.static ? "Placed asset" : "Vehicle") : c.d.guns.length + " troops") : "Support · " + c.d.cd + " s wait"}</em><i>${c.d.pts} points</i></button>${c.unit ? `<button class="pc-tag ${tg ? "on" : ""}" data-tag="${c.k}" title="A card in a fireteam answers its own key in the fight: Z calls Alpha, B calls Beta.">${tg === "a" ? "Fireteam Alpha" : tg === "b" ? "Fireteam Beta" : "No fireteam"}</button>` : `<span class="pc-tag none">Battle map</span>`}</div>`; }).join("")}${Array.from({ length: Math.max(0, LIST_MAX - list.length - AS.length) }, () => `<div class="pcard empty"><span>Empty slot</span></div>`).join("")}</div>
    <h2>Collection: squads and machines</h2><p class="note">You may put the same card in twice.</p>
    <div class="coll">${Object.entries(U2).map(([k, d]) => { const cnt = list.filter((x) => x === k).length, ok = can(d), th = thumbOf(LOAD.side, k, "you"); return `<div class="ccard ${cnt ? "in" : ""} ${ok ? "" : "full"}"><span class="pc-art">${th ? `<img src="${th}">` : `<b>${d.icon}</b>`}</span><span class="cc-body"><strong>${d.name}${cnt ? ` <u>in deck${cnt > 1 ? " ×" + cnt : ""}</u>` : ""}</strong><em>${d.cost} CP · ${d.pts} points · ${d.veh ? (d.veh.static ? "placed asset" : "vehicle") : d.guns.length + " troops"}</em><span class="cc-desc">${d.desc}${masteryRow(k)}</span></span><button data-unit="${k}" ${ok ? "" : "disabled"}>${ok ? (cnt ? "Add another" : "Add to deck") : list.length + AS.length >= LIST_MAX ? "Deck is full" : "Not enough points"}</button></div>`; }).join("")}</div>
    <h2>Collection: tactical assets</h2><p class="note">Support you call down from the battle map. Each takes a slot and points like a squad does, costs Command Points when you use it, and then has a wait before it is ready again.</p>
    <div class="coll">${utilsFor(LOAD.side).map((k) => { const u = UTILS[k], inn = AS.includes(k), ok = inn || can(u); return `<div class="ccard ${inn ? "in" : ""} ${ok ? "" : "full"}"><span class="pc-art"><b>${u.icon}</b></span><span class="cc-body"><strong>${u.name}${inn ? " <u>in deck</u>" : ""}</strong><em>${u.cost} CP · ${u.pts} points · ${u.cd} s wait</em><span class="cc-desc">${u.desc}</span></span><button data-asset="${k}" ${ok ? "" : "disabled"}>${inn ? "Take out" : ok ? "Add to deck" : list.length + AS.length >= LIST_MAX ? "Deck is full" : "Not enough points"}</button></div>`; }).join("")}</div>
    <h2>Doctrine</h2><div class="row">${Object.entries(PASSIVES).map(([k, d]) => btn("pas", k, d[0], LOAD.passive === k)).join("")}</div><p class="note">${PASSIVES[LOAD.passive][1]}</p>
    <h2>How your troops arrive</h2><div class="row">${Object.entries(DOCTRINES).map(([k, d]) => btn("doc", k, d[0], LOAD.doctrine === k)).join("")}</div><p class="note">${DOCTRINES[LOAD.doctrine][1]} You can change this on the battle map at any time.</p></section>`;
  $("go").disabled = !list.length; GARAGE.refresh(); buildCampaign(); }
$("setup").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
  if (d.tier) { const [id, br] = d.tier.split(":"); buyTier(id, br); } else if (d.wear) { const [id, br] = d.wear.split(":"); pickBranch(id, br); } else if (d.asset) { const A = LOAD.assets[LOAD.side], i = A.indexOf(d.asset), U3 = FACTIONS[LOAD.side].units, used = LOAD.list[LOAD.side].reduce((a, id) => a + (U3[id] ? U3[id].pts : 0), 0) + A.reduce((a, k) => a + UTILS[k].pts, 0); if (i >= 0) A.splice(i, 1); else if (UTILS[d.asset] && used + UTILS[d.asset].pts <= LIST_PTS && LOAD.list[LOAD.side].length + A.length < LIST_MAX) A.push(d.asset); } else if (d.side) LOAD.side = d.side; else if (d.wpn) LOAD.weapon = d.wpn; else if (d.kit) LOAD.kit = d.kit; else if (d.anti) LOAD.anti = d.anti; else if (d.ord) LOAD.ord = d.ord; else if (d.ch) LOAD.chassis = d.ch; else if (d.paint) LOAD.paint = d.paint; else if (d.doc) LOAD.doctrine = d.doc; else if (d.pas) LOAD.passive = d.pas; else if (d.unit) { const l = LOAD.list[LOAD.side], U3 = FACTIONS[LOAD.side].units, A = LOAD.assets[LOAD.side], used = l.reduce((a, id) => a + (U3[id] ? U3[id].pts : 0), 0) + A.reduce((a, k) => a + UTILS[k].pts, 0); if (U3[d.unit] && used + U3[d.unit].pts <= LIST_PTS && l.length + A.length < LIST_MAX) l.push(d.unit); } else if (d.dropi !== undefined) { const l = LOAD.list[LOAD.side], i = +d.dropi; if (i >= 0 && i < l.length) l.splice(i, 1); } else if (d.drop) { const l = LOAD.list[LOAD.side], i = l.lastIndexOf(d.drop); if (i >= 0) l.splice(i, 1); } else if (d.tag) { const t = LOAD.tags[LOAD.side] || (LOAD.tags[LOAD.side] = {}); t[d.tag] = t[d.tag] === "a" ? "b" : t[d.tag] === "b" ? "" : "a"; }
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
  { const wx = $("s-wx"); wx.innerHTML = ""; for (const [k, n] of SKIES) { const b = document.createElement("button"); b.textContent = n; b.className = CFG.weather === k ? "on" : ""; b.onclick = () => { CFG.weather = WEATHER.state.weather = k; saveCfg(); buildSettings(); }; wx.append(b); } }
  const tg = (id, k, label) => { const b = $(id), on = CFG[k] !== 0; b.textContent = label + (on ? " on" : " off"); b.className = on ? "on" : ""; b.onclick = () => { CFG[k] = on ? 0 : 1; saveCfg(); buildSettings(); }; }; tg("s-shadow", "shadows", "Shadows"); tg("s-line", "outlines", "Outlines"); tg("s-fps", "fps", "Frame counter"); $("fps").style.display = CFG.fps ? "block" : "none"; }
{ let n = 0, t0 = performance.now(); const tick = () => { n++; const t = performance.now(); if (t - t0 >= 1000) { if (CFG.fps) $("fps").textContent = Math.round(n * 1000 / (t - t0)) + " fps"; n = 0; t0 = t; } requestAnimationFrame(tick); }; tick(); $("fps").style.display = CFG.fps ? "block" : "none"; }
function openSettings() { if (setOpen) return; if (panelOpen) togglePanel(); setOpen = true; setAt = performance.now(); panelOpen = true; buildSettings(); $("s-tune").style.display = started ? "" : "none"; $("settings").style.display = "block"; if (document.pointerLockElement) document.exitPointerLock(); }
function closeSettings(lock) { if (!setOpen) return; setOpen = false; panelOpen = false; $("settings").style.display = "none"; buildPanel(); if (lock && started) wantLock(); }
$("s-snd").onclick = () => { if (!SND) return; SND.enable(!SND.SET.on); if (SND.SET.on && SND.ctx && SND.ctx.state === "suspended") SND.ctx.resume(); buildSettings(); };
$("s-close").onclick = () => closeSettings(true); $("s-tune").onclick = () => { closeSettings(false); if (started) togglePanel(); }; $("s-lab").onclick = () => { if (SND && SND.lab) { closeSettings(false); SND.lab.open(); } };
addEventListener("pagehide", () => saveMast()); $("presets").addEventListener("click", (e) => { const b = e.target.closest("button[data-preset]"); if (b) pickMap(b.dataset.preset.slice(0, -1) + ((MAPKEY.split("-")[2] || "sa")[1] || "a")); }); addEventListener("keydown", (e) => { if (e.code === "KeyU" && started && B.over && !B.mp && !campDone && !pendingFor(MAPKEY)) { const p = MAPKEY.split("-"); p[2] = p[2][0] + (p[2][1] === "a" ? "d" : "a"); pickMap(p.join("-")); } }); $("m-settings").onclick = openSettings;
$("s-export").onclick = () => { saveLoad(); saveMast(); exportSave(); $("s-savenote").textContent = "Saved as afterburn-save.json."; }; $("s-import").onclick = () => $("s-file").click(); $("s-file").onchange = (e) => { if (e.target.files[0]) importSave(e.target.files[0], $("s-savenote")); };
addEventListener("keydown", (e) => { if (e.code !== "Escape" || e.repeat) return; if (setOpen) { if (performance.now() - setAt > 300) closeSettings(false); } else if (!document.pointerLockElement && (!started || noLock) && !MAP.on) openSettings(); });   // closing with Escape leaves the mouse free: click the field to take it back
function togglePanel() { if (setOpen) return; panelOpen = !panelOpen; $("panel").style.display = panelOpen ? "block" : "none"; if (panelOpen) { if (document.pointerLockElement) document.exitPointerLock(); } else wantLock(); }
const SLIDERS = [["px", "Pixel size", 1, 6, 1], ["fov", "Field of view", 70, 115, 1], ["sens", "Mouse speed", .3, 2.5, .05], ["sprint", "Sprint speed", 6, 14, .5], ["jump", "Jump power", 5, 11, .2],
  ["gravity", "Gravity", 12, 34, 1], ["air", "Air control", .5, 6, .25], ["wallTime", "Wall run time", .6, 4, .05], ["wallSpeed", "Wall run speed", 7, 16, .5], ["wallKick", "Wall kick", 3, 11, .5], ["slideBoost", "Slide boost", 0, 7, .5]];
const SKIES = [["day", "Clear day"], ["clear", "Dusk"], ["overcast", "Overcast"], ["rain", "Rain"], ["storm", "Storm"], ["snow", "Snow"], ["fog", "Fog"]];
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
  el["ck-ammo"].textContent = t.reload > 0 ? "--" : t.ammo; el["ck-ammoarc"].setAttribute("stroke-dasharray", (t.reload > 0 ? (1 - t.reload / 2.2) : t.ammo / MECHS[t.mech].mag) * 88 + " 400"); el["ck-sharc"].setAttribute("stroke-dasharray", t.shield / 150 * 88 + " 400");
  const foe = TITANS.find((o) => o.team === "foe"), W = [];
  if (t.hitT < 1) W.push(["red", "INCOMING FIRE"]); if (t.hull < t.hullMax * .35 || t.doomed) W.push(["red", t.doomed ? "DOOMED: HOLD B TO GET OUT" : "HULL CRITICAL"]); if (t.core >= 1) W.push(["amber", "CORE READY: X"]); if (foe) W.push(["amber", "HOSTILE TITAN ON FIELD"]); if (DROPS.some((D) => D.team === "foe")) W.push(["amber", "TITANFALL DETECTED"]); if (t.reload > 0) W.push(["", "RELOADING"]);
  const key = W.map((w) => w[1]).join("|"); if (key !== warnKey) { warnKey = key; el["ck-warn"].innerHTML = W.map(([c, x]) => `<div class="${c}">${TRI}${x}</div>`).join(""); }
  el["ck-sys"].innerHTML = `<u>${MECHS[t.mech].name.toUpperCase()} · ${t.doomed ? "DOOMED" : Math.ceil(t.hull / BAR) + " OF " + Math.round(t.hullMax / BAR) + " BARS"}</u>Q ${MECHS[t.mech].keys[0].toUpperCase()} ${t.rk > 0 ? Math.ceil(t.rk) + "s" : "ready"} · E ${MECHS[t.mech].keys[1].toUpperCase()} ${t.vortex > 0 ? "up" : t.vortexCd > 0 ? Math.ceil(t.vortexCd) + "s" : "ready"}<br>F ${MECHS[t.mech].keys[2].toUpperCase()} ${t.pulseCd > 0 ? Math.ceil(t.pulseCd) + "s" : "ready"} · X CORE ${Math.round(t.core * 100)}%<br>C SMOKE ${t.smoke > 0 ? "ready" : t.smokeGot ? "spent" : "at 25%"} · SHIELD ${Math.round(t.shield)}<br>V MELEE · HOLD B: OUT<br>LINK &nbsp;&nbsp; PILOT ${segs(4, 4)}<br>REACTOR ${Math.round(60 + t.hull / t.hullMax * 38)}%<br>DASH &nbsp;&nbsp; ${segs(t.dash, t.dashMax, "■")}<br><br>SECTOR &nbsp;${Math.min(OP.sector + 1, SECN)} OF ${SECN}<br>TICKETS ${OP.tickets}<br>POINTS &nbsp;${POINTS.filter((p) => p.sector === OP.sector).map((p) => (p.owner === "you" ? p.name : p.owner === "foe" ? p.name.toLowerCase() : "·")).join(" ")}<br>CP &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${Math.floor(B.supply.you)}<br><br>TAB &nbsp;&nbsp;&nbsp;COMMAND`;
  el["ck-wpn"].innerHTML = `<u>${MECHS[t.mech].wpn.toUpperCase()}</u><em>${t.reload > 0 ? "RELOAD" : t.ammo + " / " + MECHS[t.mech].mag}</em><span class="pips">${segs(t.reload > 0 ? 0 : t.ammo, 18)}</span><u>${MECHS[t.mech].keys[0].toUpperCase()}</u><em class="${t.rk <= 0 ? "" : "dim"}">${t.rk <= 0 ? "READY" : "LOADING"}</em><span class="pips">${segs(t.rk <= 0 ? 6 : Math.floor((1 - t.rk / 8) * 6), 6, "◆")}</span><u>FIST</u><em class="${t.punchCd <= 0 ? "" : "dim"}">${t.punchCd <= 0 ? "READY" : "..."}</em><small>LMB &nbsp;RMB &nbsp;F</small>`;
  el["ck-vit"].innerHTML = `<div><label>CORE</label><span class="sh">${segs(Math.floor(t.core * 15), 15)}</span><label>${Math.round(t.core * 100)}%</label></div><div class="${t.doomed ? "crit" : ""}"><label>${t.doomed ? "DOOMED" : "HULL"}</label><span class="hu">${segs(Math.ceil(t.hull / (t.doomed ? BAR : t.hullMax) * 20), 20)}</span><label>${Math.round(t.hull)}</label></div>`;
  // radar: what is around, turned so that ahead is up
  const c = rctx, R = 78; c.clearRect(0, 0, 160, 160); c.strokeStyle = "rgba(143,224,240,.55)"; c.lineWidth = 1; for (const r of [R, R * .66, R * .33]) { c.beginPath(); c.arc(80, 80, r, 0, 6.3); c.stroke(); } c.beginPath(); c.moveTo(80, 2); c.lineTo(80, 158); c.moveTo(2, 80); c.lineTo(158, 80); c.stroke();
  const fxx = -Math.sin(P.yaw), fzz = -Math.cos(P.yaw), blip = (x, z, col, sz) => { const dx = x - t.pos.x, dz = z - t.pos.z, px = (dx * -fzz + dz * fxx) / 60 * R, py = (dx * fxx + dz * fzz) / 60 * R, l = Math.hypot(px, py), k = l > R ? R / l : 1; c.fillStyle = col; c.fillRect(80 + px * k - sz / 2, 80 - py * k - sz / 2, sz, sz); };
  for (const g of GRUNTS) if (g.s.dead < 0) blip(g.s.root.position.x / U, g.s.root.position.z / U, "#e05a3a", 4); if (foe) blip(foe.pos.x, foe.pos.z, "#ff3a3a", 9); c.fillStyle = "#8fe0f0"; c.beginPath(); c.moveTo(80, 73); c.lineTo(85, 86); c.lineTo(75, 86); c.fill();
}
const HX = Object.fromEntries(["hp", "hpbar", "mag", "pips", "ord", "kit", "w", "cp", "sup", "tm"].map((k) => [k, $("h-" + k)]));
function slot(e, name, cd, full) { const wait = cd > 0; e.classList.toggle("wait", wait); e.children[0].style.width = (wait ? clamp(1 - cd / full, 0, 1) * 100 : 0) + "%"; e.children[2].textContent = name; e.children[3].textContent = wait ? Math.ceil(cd) : ""; }
/* ---------- finding your way: point markers in the world, a compass, a small map, and the point you are standing on ----------
   The small map is the field drawn once from the plan (lanes and anything taller than a pilot) and turned each frame so
   that ahead is up. Your side is blue on it and theirs red; their troops show only inside 45 metres. The compass is a
   strip of 140 degrees with the points and the mechs set along it. Each point carries its letter above it in the world,
   in its owner's colour, with how far it has gone toward one side or the other. */
const NAV = { mini: $("mini"), ctx: $("mini").getContext("2d"), comp: $("compass"), marks: $("ptmarks"), cap: $("capbox"), base: null, pool: {}, v: new THREE.Vector3() };
function navBase() { const c = document.createElement("canvas"), k = 2, X = (x) => (x + 150) * k, Z = (z) => (z + 200) * k; c.width = 300 * k; c.height = 360 * k; const g = c.getContext("2d"); g.fillStyle = "#15181b"; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#343a40"; g.lineWidth = 8 * k; g.lineCap = "round"; for (const r of PLAN.roads || []) { g.beginPath(); g.moveTo(X(r.ax), Z(r.az)); g.lineTo(X(r.bx), Z(r.bz)); g.stroke(); }
  for (const p of PLAN.prims || []) { if (p[0] === "s" && p[4] + (p[8] || 0) > 2.2 && !(p[7] && p[7].roof) && p[4] > 1) { g.fillStyle = p[4] + (p[8] || 0) > 6 ? "#9aa2a8" : "#6a7178"; g.fillRect(X(p[1] - p[3] / 2), Z(p[2] - p[5] / 2), p[3] * k, p[5] * k); } else if (p[0] === "ct") { g.fillStyle = "#9aa2a8"; g.beginPath(); g.arc(X(p[1]), Z(p[2]), p[3] * k, 0, 6.3); g.fill(); } }
  for (const q of PLAN.gens || []) if (q.kind === "b") { g.fillStyle = "#7d858b"; g.fillRect(X(q.x - q.hw), Z(q.z - q.hd), q.hw * 2 * k, q.hd * 2 * k); } NAV.base = c; }
const navEl = (key, host, cls) => { let e = NAV.pool[key]; if (!e) { e = NAV.pool[key] = document.createElement("div"); host.append(e); } e.className = cls; e._used = true; return e; };
const NAVC = { you: "#7fe3f5", foe: "#ff6a4a", none: "#d9d2c2" }, wrapA = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a; };
function nav() { const on = started && P.dead <= 0 && !MAP.on && !P.seq, ride = !!P.titan || CK.mode !== "off"; NAV.mini.style.display = NAV.comp.style.display = on && !ride ? "block" : "none"; NAV.marks.style.display = on ? "block" : "none"; if (!on) { NAV.cap.style.display = "none"; return; }
  for (const k in NAV.pool) NAV.pool[k]._used = false; const yaw = P.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw), px = P.pos.x, pz = P.pos.z, act = Math.min(OP.sector, SECN - 1), foes = TITANS.filter((t) => t.team !== "you" && t.alive);
  // the points, written in the world
  let here = null; for (const p of POINTS) { const d = Math.hypot(p.x - px, p.z - pz), live = p.sector === act; if (d < 9 && (!here || d < here.d)) here = { p, d };
    NAV.v.set(p.x * U, (groundH(p.x, p.z) + (d < 14 ? 4.2 : 9)) * U, p.z * U); const front = NAV.v.clone().applyMatrix4(cam.matrixWorldInverse).z < 0; NAV.v.project(cam); if (!front || Math.abs(NAV.v.x) > 1.05 || Math.abs(NAV.v.y) > 1.05) continue;
    const e = navEl("w" + p.name, NAV.marks, "wpt " + (p.owner || "none") + (live ? "" : " off") + (p.n && p.n.you && p.n.foe ? " con" : "")), pr = Math.round(Math.abs(p.prog) * 100), key = (p.owner || "") + pr + (p.prog > 0) + Math.round(d / 2); e.style.transform = `translate(${((NAV.v.x * .5 + .5) * innerWidth).toFixed(1)}px, ${((-NAV.v.y * .5 + .5) * innerHeight).toFixed(1)}px) translate(-50%, -100%) scale(${d > 90 ? .8 : 1})`;
    if (e._k !== key) { e._k = key; e.innerHTML = `<b>${p.name}</b><i><u style="width:${pr}%;background:${p.prog > 0 ? NAVC.you : NAVC.foe}"></u></i><em>${Math.round(d)} m</em>`; } }
  // the point under your feet
  if (here) { const p = here.p, live = p.sector === act && OP.phase === "fight", net = p.w ? p.w.you - p.w.foe : (p.n ? p.n.you - p.n.foe : 0), both = p.n && p.n.you > 0 && p.n.foe > 0, pr = Math.round(Math.abs(p.prog) * 100);
    const state = !live ? (p.sector < act ? "Already taken" : "Not in play yet") : both && Math.abs(net) < .05 ? "Contested" : net > 0 ? (p.owner === "you" && p.prog >= 1 ? "Held" : p.prog < 0 ? "Breaking their hold" : "Capturing") : net < 0 ? "Losing it" : p.owner === "you" ? "Held" : "Holding"; const key = p.name + state + pr + (p.prog > 0) + (p.n ? p.n.you + "," + p.n.foe : "");
    NAV.cap.style.display = "block"; if (NAV.cap._k !== key) { NAV.cap._k = key; NAV.cap.className = (p.owner || "none") + (both ? " con" : ""); NAV.cap.innerHTML = `<b>${p.name}</b><span><strong>${state}</strong><i><u style="width:${pr}%;background:${p.prog > 0 ? NAVC.you : NAVC.foe}"></u></i><em>${p.label} · your side ${p.n ? p.n.you : 0} · theirs ${p.n ? p.n.foe : 0}</em></span>`; } } else NAV.cap.style.display = "none";
  if (!ride) { // the compass
    const W = 280, K = 228, put = (key, yawTo, cls, html) => { const x = -wrapA(yawTo - yaw) * K; if (Math.abs(x) > W - 8) return; const e = navEl(key, NAV.comp, cls); e.style.transform = `translateX(${(W + x).toFixed(1)}px) translateX(-50%)`; if (e._k !== html) { e._k = html; e.innerHTML = html; } }, to = (x, z) => Math.atan2(-(x - px), -(z - pz));
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].forEach((n, i) => put("c" + n, -i * Math.PI / 4, "cc" + (i % 2 ? " minor" : ""), n)); for (let i = 0; i < 24; i++) if (i % 3) put("t" + i, -i * Math.PI / 12, "ct", "");
    for (const p of POINTS) if (p.sector === act || p.sector === act + 1) put("p" + p.name, to(p.x, p.z), "cp " + (p.owner || "none") + (p.sector === act ? "" : " off"), `<b>${p.name}</b><em>${Math.round(Math.hypot(p.x - px, p.z - pz))}</em>`);
    foes.forEach((t, i) => put("f" + i, to(t.pos.x, t.pos.z), "cti foe", `<b>&#9670;</b><em>${Math.round(Math.hypot(t.pos.x - px, t.pos.z - pz))}</em>`)); if (P.mine && P.mine.alive) put("mine", to(P.mine.pos.x, P.mine.pos.z), "cti you", `<b>&#9670;</b><em>${Math.round(Math.hypot(P.mine.pos.x - px, P.mine.pos.z - pz))}</em>`);
    // the small map
    if (!NAV.base) navBase(); const g = NAV.ctx, R = 100, k = R / 62; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 200, 200); g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, 6.3); g.clip(); g.translate(R, R); g.rotate(yaw); g.scale(k / 2, k / 2); g.globalAlpha = .9; g.drawImage(NAV.base, -(px + 150) * 2, -(pz + 200) * 2); g.restore(); g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, 6.3); g.clip();
    const at = (x, z, edge) => { const dx = x - px, dz = z - pz; let rx = (dx * cs - dz * sn) * k, ry = (dx * sn + dz * cs) * k; const l = Math.hypot(rx, ry); if (l > R - 9) { if (!edge) return null; rx *= (R - 9) / l; ry *= (R - 9) / l; } return [R + rx, R + ry]; }, dot = (x, z, col, s, edge) => { const q = at(x, z, edge); if (q) { g.fillStyle = col; g.fillRect(q[0] - s / 2, q[1] - s / 2, s, s); } };
    for (const u of ALLIES) if (u.s.dead < 0) dot(u.s.root.position.x / U, u.s.root.position.z / U, NAVC.you, 4); for (const u of GRUNTS) if (u.s.dead < 0) { const x = u.s.root.position.x / U, z = u.s.root.position.z / U; if (Math.hypot(x - px, z - pz) < 45) dot(x, z, NAVC.foe, 4); }
    if (B.mp) for (const rp of RPS.values()) if (rp.ok && rp.side === "you") dot(rp.pos.x, rp.pos.z, "#fff", 5);
    for (const t of TITANS) if (t.alive) { const q = at(t.pos.x, t.pos.z, true); if (!q) continue; g.fillStyle = t.team === "you" ? NAVC.you : NAVC.foe; g.save(); g.translate(q[0], q[1]); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore(); }
    g.font = "bold 12px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; for (const p of POINTS) { if (p.sector !== act && p.sector !== act + 1) continue; const q = at(p.x, p.z, true); g.fillStyle = "#101214"; g.beginPath(); g.arc(q[0], q[1], 10, 0, 6.3); g.fill(); g.strokeStyle = NAVC[p.owner || "none"]; g.lineWidth = 2; g.beginPath(); g.arc(q[0], q[1], 9, -Math.PI / 2, -Math.PI / 2 + Math.max(.04, Math.abs(p.prog)) * Math.PI * 2); g.stroke(); g.fillStyle = NAVC[p.owner || "none"]; g.fillText(p.name, q[0], q[1] + .5); }
    g.restore(); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(R, R - 8); g.lineTo(R + 5.5, R + 6); g.lineTo(R, R + 3); g.lineTo(R - 5.5, R + 6); g.fill(); g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(R, R, R - 1, 0, 6.3); g.stroke(); }
  for (const k in NAV.pool) if (!NAV.pool[k]._used) NAV.pool[k].className = "gone"; }
function hud(dt) { campWatch(); nav(); el.cross.className = hitT > 0 ? "hit" : ""; if (sayT > 0) { sayT -= dt; if (sayT <= 0) say(""); } cockpit(dt); if (P.titan || CK.mode !== "off") { el.state.textContent = ""; el.foe.style.display = "none"; return; }
  hudT -= dt; if (hudT > 0) return; hudT = .08; const m = P.mine;
  const W = pw(), anti = P.weapon === 1, word = anti ? (P.charge > 0 ? (LOAD.anti === "seeker" ? "locking " + Math.round(P.charge * 100) + "%" : "charging") : P.fireCd > 0 ? "cooling" : "ready") : P.reload > 0 ? "reloading" : "";
  el.lab1.textContent = "Pilot"; el.hpfill.style.width = P.hp / HP * 100 + "%"; HX.hp.textContent = Math.max(0, Math.ceil(P.hp)); HX.hpbar.classList.toggle("low", P.hp < HP * .35); el.speed.textContent = hs().toFixed(1) + " m/s";
  el.wname.textContent = anti ? ANTI[LOAD.anti][0] : W.name; el.ammo.textContent = word || P.ammo; el.ammo.className = word ? "word" : P.ammo <= W.mag * .25 ? "low" : ""; HX.mag.textContent = word ? "" : "/ " + W.mag;
  HX.pips.style.display = anti ? "none" : "block"; HX.pips.style.width = Math.min(240, W.mag * 6) + "px"; HX.pips.firstChild.style.width = (word ? 0 : P.ammo / W.mag * 100) + "%";
  slot(HX.ord, ORD[LOAD.ord][0], P.ordCd, 20); slot(HX.kit, KITS[LOAD.kit][0], P.kitCd, 20); { const ks = HX.w.children; for (let i = 0; i < 3; i++) ks[i].className = (P.weapon === 0 ? 0 : P.weapon === 1 ? 1 : 2) === i ? "on" : ""; }
  el.kills.innerHTML = opLine(); HX.cp.textContent = Math.floor(B.supply.you); HX.sup.textContent = squadsOut("you"); el.timer.textContent = "G ping · Tab command";
  el.meterfill.style.width = (m ? 100 : P.meter) + "%"; HX.tm.classList.toggle("full", !m && P.meter >= 100); el.meterlab.textContent = m ? "Titan: standing by" : DROPS.some((D) => D.team === "you") ? "Titan: on its way" : P.meter >= 100 ? "Titan ready: press V" : "Titan " + Math.floor(P.meter) + "%";
  const foe = TITANS.find((o) => o.team === "foe"); el.foe.style.display = foe ? "block" : "none"; if (foe) el.foefill.style.width = (foe.hull + foe.shield) / 5 + "%"; 
  const near = !P.seq && m && m.alive && m.doom <= 0 && Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 7, nearFoe = !near && !P.rodeo && TITANS.some((t) => t.team !== "you" && t.alive && t.doom <= 0 && Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) < 5.5 && Math.abs(t.pos.y - P.pos.y) < 9);
  el.state.textContent = !locked && !noLock && !panelOpen ? "CLICK TO TAKE THE MOUSE BACK" : P.rodeo ? "RIDING. SPACE LETS GO" : near ? (P.battery ? "PRESS E TO FIT THE BATTERY" : "PRESS E TO CLIMB IN") : nearFoe ? "PRESS E TO CLIMB ON" : P.battery ? "CARRYING A BATTERY" : P.wall ? "WALL RUN" : P.mantle ? "CLIMB" : P.sliding ? "SLIDE" : ""; }

/* ---------- frame ---------- */
const H = 1 / 120; let acc = 0, last = performance.now(), menuSpin = 0;
function advance(dt) {
  if (active() || (B.mp && started)) { acc += dt; while (acc >= H) { stepPilot(H); acc -= H; } stepGun(dt); stepBattle(dt); stepTitans(dt); if (!B.mp && !foeCalled && B.time > 100 && !B.over) callFoe(); if (!P.mine && !B.over) P.meter = Math.min(100, P.meter + .8 * dt); if (B.mp) netTick(dt); }
  try { SOL.update(dt); } catch (e) { if (!advance.w1) { advance.w1 = 1; console.error("[soldiers]", e); } }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, .05); last = now; clock += dt;   // never negative: a frame stamped earlier than the last one used to wind the hurt and chill tints up instead of down, and they stayed on the edges of the view
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
{ const bad = fieldTest(); if (bad.length) { console.warn("[field] " + MAPKEY + " salt " + SALT + ": " + bad.join("; ")); if (MAPKEY.startsWith("custom-") || !retryField()) window.__fieldBad = bad; } else console.log("[field] " + MAPKEY + " salt " + SALT + ": every point can be reached"); }

/* ---------- more than one player ----------
   Up to four: two sides of one or two. Each player's own pilot and Titan run on their own machine and are sent to the
   others about twenty times a second, by way of the host. A hit is decided on the screen of the one who fired. The
   battle itself runs on the host (see mf/battle.js). A player whose link drops keeps their place, their troops stay on
   the field, and they are let back in when their browser finds the host again. */
const MY = { slot: 0, team: 0, south: true, name: "", token: (() => { try { if (/[?&]local/.test(location.search)) throw 0; let t = localStorage.getItem("afterburn-token"); if (!t) { t = Math.random().toString(36).slice(2, 12); localStorage.setItem("afterburn-token", t); } return t; } catch (e) { return Math.random().toString(36).slice(2, 12); } })() };
let ROSTER = [], mpOn = false;   // everyone in the match: { slot, name, team, kit, here } and, on the host, { id, token }
const RPS = new Map(), keyOf = (slot) => (slot === 0 ? "you" : "p" + slot), slotOf = (id) => { const r = ROSTER.find((q) => q.id === id); return r ? r.slot : -1; };
const myKit = () => ({ fac: LOAD.side, tech: wornTech(), lists: LOAD.list, list: LOAD.list[LOAD.side].slice(), doctrine: LOAD.doctrine, passive: LOAD.passive, chassis: LOAD.chassis, paint: LOAD.paint });
const relSide = (hostSide) => ((hostSide === "you") === MY.south ? "you" : "foe");   // the host's side names, as this screen sees them
const ONE = { phit: 1, thit: 1, tbat: 1 };   // messages meant for one player; the rest are for everybody
// send something to the player it is for, or to everyone, whichever this player is
function relay(k, d, sure = true) { if (!B.mp) return; if (k === "phit") P.lastPhit = { slot: d[0], t: performance.now() }; if (B.mp === "guest") return send(k, d, sure); if (ONE[k]) { const r = ROSTER.find((q) => q.slot === d[0]); if (r && r.id) send(k, d, sure, r.id); } else send(k, [0, d], sure); }
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
  pdown: (slot) => { const rp = RPS.get(slot); if (!rp) return; if (B.mp === "host" && OP.phase === "retreat" && rp.side !== OP.atk) refund(2); if (B.mp === "host") for (const w of B.cmds) if (B.side[w] !== rp.side) credit(w, 40 / Math.max(1, B.cmds.filter((k) => B.side[k] !== rp.side).length)); if (rp.side === "foe") { snd("kill"); say("An enemy pilot is down.", 2.5); if (P.lastPhit && P.lastPhit.slot === slot && performance.now() - P.lastPhit.t < 2500) P.meter = Math.min(100, P.meter + 10); } else say((rp.name || "Your teammate") + " is down.", 2.5); },
  tdrop: (slot, a) => { const rp = RPS.get(slot); if (!rp) return; callTitan(rp.side, a[0], a[1], a[2]); DROPS[DROPS.length - 1].ghost = true; say(rp.side === "foe" ? "An enemy Titan is dropping." : (rp.name || "Your teammate") + " has called a Titan.", 3); },
  tfx: (slot, a) => { const rp = RPS.get(slot), t = rp && rp.titan; if (!t) return;
    if (a[0] === 0) { const from = muzzleOf(t), end = V3(a[1], a[2], a[3]); tracer(from, toU(end), "#ffd890", 9000, 1.5); flash(from, "#ffc477", 3200, .1); t.recoil = 1; snd("cannon", { pos: [t.pos.x, t.pos.y + 4, t.pos.z] }); later(.03, () => blast(end, 2.2, {})); }
    else if (a[0] === 1) { const from = V3(a[1], a[2], a[3]), tgt = V3(a[4], a[5], a[6]), m = fxLayer(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2, .8) }))); scene.add(m); ROCKETS.push({ pos: from, vel: tgt.clone().sub(from).normalize().multiplyScalar(14).add(V3(0, 10, 0)), tgt, team: null, ghost: true, t: 0, mesh: m }); snd("rocket", { pos: xyz(from) }); }
    else if (a[0] === 2) { t.punch = .45; } },
  fire: (slot, a) => { const rp = RPS.get(slot); if (rp) addFire(a[0], a[1], a[2], a[3], a[4], rp.side, true); },
  tsmk: (slot) => { const rp = RPS.get(slot), t = rp && rp.titan; if (!t) return; t.smokeT = 4; if (P.rodeo && P.rodeo.T === t) throwRider(45); },
  nmine: (slot, a) => { const rp = RPS.get(slot); if (rp && B.mp === "host") layMine(a[0], a[1], rp.side, true); },
  nade: (slot, a) => { const rp = RPS.get(slot); mkNade(V3(a[0], a[1], a[2]), V3(a[3], a[4], a[5]), null, a[6] || 1.7, a[7], rp ? rp.side : null); },
  boom: (slot) => { const rp = RPS.get(slot); for (const n of NADES) if (n.kind === "satchel" && !n.team && n.side === (rp && rp.side)) n.boom = true; } };
for (const k in ACT) onMsg(k, (m, from) => { if (B.mp === "host") { const slot = slotOf(from); if (slot < 0) return; ACT[k](slot, m); send(k, [slot, m], k !== "sh", null, from); } else if (B.mp === "guest" && m[0] !== MY.slot) ACT[k](m[0], m[1]); });
for (const k in ONE) onMsg(k, (a, from) => { if (B.mp === "host" && a[0] !== 0) { const r = ROSTER.find((q) => q.slot === a[0]); if (r && r.id) send(k, a, true, r.id); return; } if (!B.mp) return; if (k === "phit") hurtPilot(a[1] * (a[2] ? 1.25 : 1)); else if (k === "tbat") { if (P.mine && P.mine.alive) { installBattery(P.mine); say("A battery has been fitted to your mech.", 2.5); } } else if (P.mine) hurtTitan(P.mine, a[1], true); });
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
const startMsg = (r, back) => ({ fac: r.team === ROSTER[0].team ? LOAD.side : LOAD.side === "militia" ? "machine" : "militia", map: MAPKEY, salt: SALT, slot: r.slot, duo: B.duo, south: r.team === ROSTER[0].team, back: !!back, roster: ROSTER.map(({ slot, name, team, kit, here }) => ({ slot, name, team, kit, here })) });
function mpBegin(role) { B.mp = role; mpOn = true; B.flip = !MY.south; if (role === "host") B.roster = ROSTER.map((r) => ({ key: keyOf(r.slot), side: r.team === ROSTER[0].team ? "you" : "foe", ...(r.kit || {}) })); begin(false); showRoster(); }
function hostStart(again) { if (ROSTER.length < 2) { mpNote("Wait for at least one other player to join."); return; }
  { const want = ROSTER.length <= 2 ? "s" : ROSTER.length <= 4 ? "m" : "l", have = (MAPKEY.split("-")[2] || "sa")[0], nm = { s: "1v1", m: "2v2", l: "3v3" }; if (want !== have && !hostStart.warned && !again) { hostStart.warned = true; mpNote("This field is the " + nm[have] + " size and there are " + ROSTER.length + " of you. For the " + nm[want] + " size, load it from the Play tab and host again. Press Start once more to play on this one."); return; } } if (!ROSTER.some((r) => r.team !== ROSTER[0].team)) { mpNote("Both sides need at least one player. Someone has to switch sides."); return; }
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
onMsg("start", (m) => { if (NET.role !== "guest" || wrongField(m.map, m.salt)) return; MY.slot = m.slot; MY.south = m.south; B.duo = m.duo; B.myFac = m.fac; setRoster(m.roster); if (m.back && B.mp === "guest" && started) { B.over = null; say("You are back in.", 3); return; } mpBegin("guest"); say(m.back ? "You are back in." : "The match is on.", 3); });
onMsg("again", (m) => { if (B.mp !== "guest") return; MY.slot = m.slot; MY.south = m.south; B.duo = m.duo; B.flip = !MY.south; setRoster(m.roster); restart(); say("The host has started the match again.", 3); });
const hello = () => send("hello", { token: MY.token, name: MY.name, kit: myKit() });
onMsg("_open", () => { if (mpOn) hello(); });   // the link came back by itself: ask for the same place
onMsg("_close", () => { if (B.mp === "guest" && started) say("The link to the host has dropped. Trying to get back in.", 0); else mpNote("The link to the host has dropped."); });
onMsg("_retry", (secs) => { mpNote("Trying to get back in. " + secs + " seconds left."); });
onMsg("_lost", () => { mpNote("Could not get back in."); if (B.mp && started) { say("Could not get back to the host. Press T to play on alone.", 0); B.over = B.over || "foe"; } });
function again() { if (campDone) { location.reload(); return; } if (B.mp === "guest") { if (NET.open) { say("Only the host can start the match again.", 2.5); return; } leave(); B.mp = null; mpOn = false; B.duo = false; B.flip = false; setRoster([]); $("tr").textContent = "P: tuning   T: restart   Esc: free the mouse"; restart(); return; } if (B.mp === "host") { hostStart(true); return; } restart(); }
const nameOf = () => { MY.name = ($("mp-name").value || "").trim().slice(0, 16); try { localStorage.setItem("afterburn-name", MY.name); } catch (e) {} };
try { $("mp-name").value = localStorage.getItem("afterburn-name") || ""; $("mp-code").value = sessionStorage.getItem("afterburn-code") || ""; } catch (e) {}
$("mp-host").onclick = async () => { if (NET.role) return; nameOf(); mpNote("Asking for a code..."); try { const code = await host(); MY.slot = 0; ROSTER = [{ slot: 0, id: null, token: MY.token, name: MY.name || "Player 1", team: 0, kit: myKit(), here: true }]; mpNote("Your code is " + code + ". Give it to the other players, and start when everyone is in."); $("mp-code").value = code; showRoster(); } catch (e) { mpNote(e.message + " Try again."); } };
$("mp-join").onclick = async () => { if (NET.role) return; nameOf(); const code = $("mp-code").value.trim(); if (code.length < 3 && !/[?&]local/.test(location.search)) { mpNote("Type the host's code first."); return; } mpNote("Linking..."); try { await join(code); try { sessionStorage.setItem("afterburn-code", NET.code); } catch (e) {} mpOn = true; mpNote("Linked."); hello(); } catch (e) { mpNote(e.message); } };
$("mp-team").onclick = () => { if (NET.role === "guest") send("team", 0); else if (NET.role === "host") { const r = ROSTER[0]; if (ROSTER.filter((q) => q.team !== r.team).length < 2) { r.team = r.team ? 0 : 1; lobbyOut(); } } };
$("mp-start").onclick = () => hostStart(false);
try { const aj = JSON.parse(sessionStorage.getItem("ab-autojoin") || "null"); if (aj && aj.code) { sessionStorage.removeItem("ab-autojoin"); $("mp-code").value = aj.code; if (aj.name) $("mp-name").value = aj.name; setTimeout(() => $("mp-join").click(), 600); } } catch (e) {}
// choosing the field: a kind and a number. The page loads again with the new field built.
{ const kind = $("map-kind"), num = $("map-num"), size = $("map-size"), role = $("map-role"), cur = MAPKEY.split("-"), tail = cur[2] || "sa"; for (const [k, name] of [["colony", "Frontier colony"], ["city", "City blocks"], ["ship", "Ship boarding"], ["mixed", "Mixed country"], ["town", "Town"], ["works", "Works"], ["airfield", "Airfield"], ["farm", "Farmland"]]) { const o = document.createElement("option"); o.value = k; o.textContent = name; kind.appendChild(o); }
  kind.value = cur[0]; num.value = cur[1] || ""; size.value = tail[0]; role.value = tail[1];
  const go = (n) => pickMap(kind.value + "-" + (String(n).replace(/\D/g, "").slice(0, 6) || "1") + "-" + size.value + role.value);
  $("map-go").onclick = () => go(num.value || "1"); $("map-new").onclick = () => go(1000 + Math.floor(Math.random() * 9000));
  $("map-now").textContent = "You are on " + MAPNAME + ", and you " + (OP.atk === "you" ? "attack" : "defend") + ". " + SECN + " sectors: " + POINTS.map((p) => p.name + " " + p.label.toLowerCase() + (p.roof ? " (roofed)" : "")).join(", ") + "."; }
window.__mf = { post, OP, renderer, scene, cannon, CR, CK, gunScene, TITANS, makeTitan, hurtTitan, startEnter, K, PLAN, MAPKEY, groundH, VM, startSwap, startNade, startKnife, NADES, NET, RPS, MY, cut, get ROSTER() { return ROSTER; }, makeFigure, send, snapshot, useUtil, snd, SND, B, MAP, setMap, deploy, SQUADS, ALLIES, VEH, POINTS, LOAD, P, K, GRUNTS, TITANS, DROPS, CFG, BOXES, stepPilot, stepTitans, fireCarbine, fireCannon, callTitan, callFoe, startEnter, startExit, tryCallTitan, CK, ROCKETS, fireRockets, doPunch, useKey, hurtTitan, restart, SOL, U, cam,
  get started() { return started; }, sim(sec) { for (let i = 0; i < sec * 30; i++) advance(1 / 30); }, mouse(v) { mouseDown = v; }, force() { started = true; noLock = true; $("start").style.display = "none"; $("hud").style.display = "block"; restart(); } };
requestAnimationFrame(frame);
