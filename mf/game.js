/* Machine-Fall FPS, prototype 4: the game (the pilot and what the pilot carries, the Titans, the cockpit, the screens).
   The battle itself (squads, vehicles, points, the commander's map) is in mf/battle.js.
   Everything here is in metres; the engine draws at U units to the metre. */
import { THREE, U, clamp, lerp, V3, rnd, $, CFG, DEF, saveCfg, renderer, scene, cam, gunScene, gunMat, makeRTs, render, BOXES, hitsBox, free, freeG, boxesNear, groundH, WORLD, rayBox, rayWorld,
  flash, puff, ringFx, flareFx, chunksFx, tracer, fxLayer, SOL, WEATHER } from "./engine.js";
import { makeRig, TITAN } from "./titan.js";
import { B, GRUNTS, ALLIES, VEH, SQUADS, POINTS, FACTIONS, DOCTRINES, LIST_PTS, GOAL, LOAD, saveLoad, MAP, setMap, mapCamera, mapFrame, deploy, damage, rayUnits, blastUnits, nearestEnemy, stepBattle, resetBattle, buildPass, flowTo, flowDir, domeAt } from "./battle.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const toU = (v) => V3(v.x * U, v.y * U, v.z * U);
/* SOUND HOOKS (keep these when editing this file): the Punch package in punch/punch.js makes every sound. Each snd(...) call below is one hook.
   They are safe when sound is missing or still loading. The list of hooks is in punch/HOOKS.md. */
const SND = window.PUNCH || null, xyz = (v) => [v.x, v.y, v.z];
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
  wall: null, lastWall: null, wallCd: 0, mantle: null, hp: 100, hurtT: 9, dead: 0, dip: 0, bob: 0, shake: 0, weapon: 0, ammo: 24, reload: 0, fireCd: 0, kick: 0, spread: 0, charge: 0,
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
function respawn() { P.pos.set(...SPAWN); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0; P.hp = 100; P.dead = 0; P.wall = P.mantle = null; P.sliding = false; P.h = 1.8; P.ammo = pw().mag; P.reload = 0; P.canDouble = true; P.titan = null; }

function stepPilot(dt) {
  P.jumpBuf -= dt; P.coyote -= dt; P.slideCd -= dt; P.wallCd -= dt; P.hurtT += dt;
  if (P.dead > 0) { P.dead -= dt; if (P.dead <= 0) { respawn(); say("You are back at your drop point. Click to take the mouse back.", 3); if (MAP.auto) setMap(false); } return; }
  if (P.hurtT > 4 && P.hp < 100) P.hp = Math.min(100, P.hp + 25 * dt);
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
    w.sp = Math.min(Math.max(w.sp, CFG.wallSpeed * .8) + 6 * dt, Math.max(w.sp, CFG.wallSpeed));
    P.vel.x = w.tx * w.sp; P.vel.z = w.tz * w.sp;
    const late = w.t > CFG.wallTime * .7; P.vel.y = late ? P.vel.y - CFG.gravity * .45 * dt : Math.max(P.vel.y - 9 * dt, 0);
    const b = nearWall(w.ax, w.n);
    if (P.jumpBuf > 0) { P.jumpBuf = 0; if (w.ax === 0) P.vel.x += w.n * CFG.wallKick; else P.vel.z += w.n * CFG.wallKick; P.vel.y = CFG.jump * 1.03; endWall(.2); }
    else if (!b || w.t > CFG.wallTime || P.grounded || (mz < 0)) endWall(.25);
  } else if (P.grounded) {
    P.canDouble = true; P.lastWall = null; P.coyote = .1;
    if (crouchKey && !P.sliding && !P.crouchLatch) { if (hs() > 6.5) { P.sliding = true; if (P.slideCd <= 0) { const s = hs(), k = (s + CFG.slideBoost) / s; P.vel.x *= k; P.vel.z *= k; P.slideCd = 1.8; } } else P.crouchLatch = true; }
    if (P.sliding && (!crouchKey || hs() < 3.5)) { P.sliding = false; if (crouchKey) P.crouchLatch = true; }
    if (P.jumpBuf > 0) { P.jumpBuf = 0; P.coyote = 0; P.vel.y = CFG.jump; P.grounded = false; P.sliding = false; }
    else if (P.sliding) { friction(P, .5, dt); accelerate(P, wx, wz, 1.5, 6, dt); if (rnd() < dt * 30) puff(toU(P.pos).setY(P.pos.y * U + 2), { n: 2, color: "#ad9677", dark: true, opacity: .4, size: 4, life: .5, grow: 1.5, drag: 2, vel: () => V3((rnd() - .5) * 20, 8, (rnd() - .5) * 20) }); }
    else { friction(P, 7, dt); accelerate(P, wx, wz, P.crouchLatch && crouchKey ? 3 : (K.ShiftLeft || K.ShiftRight) && mz > 0 ? CFG.sprint : CFG.walk, 11, dt); }
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
function hurtPilot(n, from) { if (P.dead > 0 || P.titan || P.seq) return; if (domeAt(P.pos.x, P.pos.z, "you")) n *= .5; snd("pilot_hurt", { gain: clamp(.6 + n / 40, .6, 1.4) }); P.hp -= n; P.hurtT = 0; hurtFx = 1; if (P.hp <= 0) { P.hp = 0; P.dead = 6; mouseDown = false; if (!MAP.on) { setMap(true, true); if (document.pointerLockElement) document.exitPointerLock(); } } }
function blast(at, radius, o = {}) {   // at in metres
  const p = toU(at); snd("explosion", { pos: xyz(at), gain: clamp(radius / 2.2, .6, 2) }); flash(p.clone().setY(p.y + 12), "#ffb45a", 2500 + radius * 2200, .35);
  puff(p, { n: 26, color: "#fbe6a0", hot: 3, size: 5 + radius, life: .32, drag: 3, vel: () => V3((rnd() - .5) * 90 * radius, rnd() * 70 * radius, (rnd() - .5) * 90 * radius) });
  puff(p, { n: 16, color: "#332a21", dark: true, opacity: .7, size: 9 + radius * 3, life: 2, grow: 2.2, drag: 2, vel: () => V3((rnd() - .5) * 40, 20 + rnd() * 40, (rnd() - .5) * 40) });
  ringFx(p.clone().setY(p.y + .6), "#f2c46a", radius * U * 1.2, .4); if (radius > 1.5) chunksFx(p.clone().setY(p.y + 2), "#5c4c3a", 4, 40 + radius * 8);
  const d = Math.hypot(at.x - P.pos.x, at.z - P.pos.z); if (d < 30) P.shake = Math.max(P.shake, clamp(radius / (d + 2), 0, .6));
  blastUnits(at, radius, victims(o.team), 9999, 70, o.team === "you");
  if (o.team !== "you" && o.pilot && d < radius && Math.abs(at.y - P.pos.y) < radius + 1) hurtPilot(o.pilot * (1 - d / radius * .6));
  for (const t of TITANS) if (t.alive && t.team !== o.team && o.titan && Math.hypot(t.pos.x - at.x, t.pos.z - at.z) < radius + t.r) hurtTitan(t, o.titan);
}

/* ---------- the battle's units, as the pilot's weapons and the Titans meet them ---------- */
const _o = V3(), _d = V3();
const gruntHit = (o, d, best) => rayUnits(o, d, best, "foe");
const victims = (team) => (team === "you" ? "foe" : team === "foe" ? "you" : null);
const PW = { carbine: { name: "Carbine", mag: 24, cd: .095, dmg: 25, spread: .004, reload: 1.35, desc: "Automatic, steady, good at most ranges." }, longrifle: { name: "Longrifle", mag: 8, cd: .38, dmg: 70, spread: .0008, reload: 1.7, desc: "One heavy round at a time. A head shot ends it." }, smg: { name: "Scatter SMG", mag: 36, cd: .06, dmg: 15, spread: .012, reload: 1.2, desc: "A lot of small rounds very quickly. Best while you are moving." } };
const pw = () => PW[LOAD.weapon] || PW.carbine;
const CHASSIS = { vanguard: { name: "Vanguard", hull: 350, speed: 6.2, dash: 2, desc: "The all-round frame: 350 hull, two dashes." }, bastion: { name: "Bastion", hull: 470, speed: 5.2, dash: 1, desc: "Heavier plate and a slower stride: 470 hull, one dash." }, lancer: { name: "Lancer", hull: 270, speed: 7.4, dash: 3, desc: "Stripped for speed: 270 hull, three dashes." } };
B.hooks = { pilot: () => ({ ok: P.dead <= 0 && !P.titan && !P.seq, alive: P.dead <= 0, dead: P.dead, pos: V3(P.pos.x, P.pos.y + P.h * .6, P.pos.z), at: P.pos, speed: hs(), grounded: P.grounded, titan: !!P.titan }),
  titans: () => { for (const t of TITANS) t.piloted = t === P.titan; return TITANS; }, hurtPilot: (n) => hurtPilot(n), healPilot: (n) => { if (P.dead > 0 || P.hp >= 100) return false; P.hp = Math.min(100, P.hp + n); return true; }, hurtTitan: (t, n) => hurtTitan(t, n), blast: (at, r, o) => blast(at, r, o), onKill: (n) => { snd("kill"); P.meter = Math.min(100, P.meter + n); },
  shotSnd: (q, atPilot, hit) => { snd("grunt_shot", { pos: [q.x / U, q.y / U + 1.4, q.z / U] }); if (atPilot && !hit && rnd() < .6) snd("flyby", { pos: [P.pos.x + (rnd() - .5) * 5, P.pos.y + 1.5, P.pos.z + (rnd() - .5) * 5], delay: .02 + rnd() * .05 }); }, say: (t, sec) => say(t, sec) };

/* ---------- Titans ---------- */
const TITANS = [], DROPS = [], LATER = [], ROCKETS = [], HUSKS = []; let foeCalled = false;
const later = (t, fn) => LATER.push({ t, fn });
const approach = (v, to, r) => (Math.abs(to - v) <= r ? to : v + Math.sign(to - v) * r);
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
function makeTitan(team, x, z, yaw) {
  const ch = CHASSIS[team === "you" ? LOAD.chassis : "vanguard"] || CHASSIS.vanguard, rig = makeRig(team, team === "you" ? { accent: LOAD.paint } : {}); scene.add(rig.root);
  const t = { team, rig, pos: V3(x, .05, z), vel: V3(), yaw, r: 1.5, h: 5.8, eye: 5.3, shield: 150, hull: ch.hull, hullMax: ch.hull, speed: ch.speed, dashMax: ch.dash, shieldT: 9, hitT: 9, alive: true, doom: 0, ammo: 18, reload: 0, fireCd: 0, dash: ch.dash, dashT: 0, dashing: 0, grounded: true,
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
  t.rig.pose(dt, { speed: sp * (fwd < -.5 ? -1 : 1), kneel: Math.max(t.kneel, ease(t.land) * .7), hatch: t.hatch, aimYaw: t.aimYaw, aimPitch: t.aimPitch, recoil: t.recoil, punch: t.punch > 0 ? Math.sin(clamp(1 - t.punch / .45, 0, 1) * Math.PI) : 0, limp: t.doom > 0 });
}
const muzzleOf = (t) => t.rig.muzzle.getWorldPosition(V3());
function hurtTitan(t, n) { if (!t.alive || t.doom > 0) return; t.shieldT = 0; t.hitT = 0; const s = Math.min(t.shield, n); snd(s > 0 ? "shield_hit" : "titan_hit", { pos: [t.pos.x, t.pos.y + t.h * .6, t.pos.z], gain: clamp(.45 + n / 60, .45, 1.3) }); t.shield -= s; t.hull -= n - s; if (t === P.titan) { hurtFx = Math.max(hurtFx, s > 0 ? 0 : .6); if (s > 0) coolFx = 1; P.shake = Math.max(P.shake, .12 + n * .004); CK.glitch = .18; }
  if (t.hull <= 0) { t.hull = 0; t.doom = 2.6; t.hatchTo = 1; if (t === P.titan || (P.seq && P.seq.T === t)) { throwClear(t); say("Your Titan is doomed. You have been thrown clear.", 3); } else say(t.team === "you" ? "Your Titan is doomed." : "The Opposition Titan is doomed.", 3); } }
function stepTitans(dt) {
  for (let i = LATER.length - 1; i >= 0; i--) { const l = LATER[i]; l.t -= dt; if (l.t <= 0) { LATER.splice(i, 1); l.fn(); } }
  for (let i = DROPS.length - 1; i >= 0; i--) { const D = DROPS[i]; D.t += dt; const gy = groundH(D.x, D.z), k = Math.min(1, D.t / D.dur), y = lerp(gy + 150, gy + 2.5, k * k); D.pod.position.set(D.x * U, y * U, D.z * U);
    if (rnd() < dt * 60) puff(V3(D.x * U, (y + 4) * U, D.z * U), { n: 5, color: "#ffb060", hot: 3, size: 6, life: .5, drag: 1, vel: () => V3((rnd() - .5) * 30, 60 + rnd() * 80, (rnd() - .5) * 30) });
    if (k >= 1) { DROPS.splice(i, 1); scene.remove(D.pod); snd("titanfall", { pos: [D.x, 1, D.z] }); const at = V3(D.x, gy + .05, D.z), t = makeTitan(D.team, D.x, D.z, D.yaw); t.pos.y = gy + .05; placeTitan(t, .016); if (D.team === "you") P.mine = t;
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
    if (hitW || dist < 1.4 || r.t > 4) { scene.remove(r.mesh); ROCKETS.splice(i, 1); blast(r.pos, 1.9, { team: r.team, titan: 20, pilot: 24 }); } }
  for (let i = TITANS.length - 1; i >= 0; i--) { const t = TITANS[i];
    if (t.doom > 0) { t.doom -= dt; t.vel.set(0, t.vel.y, 0); if (rnd() < dt * 12) { const q = toU(t.pos).add(V3((rnd() - .5) * 30, (1 + rnd() * 4) * U, (rnd() - .5) * 30)); puff(q, { n: 8, color: "#ff9a3c", hot: 3, size: 5, life: .4, vel: () => V3((rnd() - .5) * 50, 40 + rnd() * 50, (rnd() - .5) * 50) }); flash(q, "#ff8a3a", 1200, .15); }
      placeTitan(t, dt);
      if (t.doom <= 0) { t.alive = false; blast(V3(t.pos.x, t.pos.y + 2.5, t.pos.z), 5, { team: t.team, titan: 60, pilot: 60 }); chunksFx(toU(t.pos).setY(t.pos.y * U + 60), "#34373a", 8, 90); t.rig.wreck(); HUSKS.push(t.rig); TITANS.splice(i, 1); if (t.team === "you") { P.mine = null; P.meter = 0; } checkDone(); }
      continue; }
    t.shieldT += dt; t.hitT += dt; if (t.shieldT > 6 && t.shield < 150) t.shield = Math.min(150, t.shield + 25 * dt);
    t.fireCd -= dt; t.rk -= dt; if (t.reload > 0) { t.reload -= dt; if (t.reload <= 0) t.ammo = 18; }
    if (t.dash < t.dashMax) { t.dashT += dt; if (t.dashT > 3.5) { t.dash++; t.dashT = 0; } }
    if (t !== P.titan && !t.busy) stepTitanAI(t, dt); else if (t.busy && t !== P.titan) { friction(t, 5, dt); t.vel.y -= 22 * dt; moveBody(t, dt); t.aimYaw = approach(t.aimYaw, 0, dt * 2); t.aimPitch = approach(t.aimPitch, 0, dt * 2); }
    placeTitan(t, dt);
  }
}
// the rocket pod: six rockets, one after another
function fireRockets(t, at) { t.rk = t === P.titan ? 8 : 9 + rnd() * 4; for (let i = 0; i < 6; i++) later(i * .09, () => { if (!t.alive || t.doom > 0) return; const from = t.rig.pod.getWorldPosition(V3()).divideScalar(U), aim = at.clone().sub(from).normalize();
  const m = fxLayer(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2, .8) }))); scene.add(m);
  ROCKETS.push({ pos: from, vel: aim.multiplyScalar(14).add(V3((rnd() - .5) * 6, 9 + rnd() * 4, (rnd() - .5) * 6)), tgt: at.clone().add(V3((rnd() - .5) * 2.4, (rnd() - .5) * 1, (rnd() - .5) * 2.4)), team: t.team, t: 0, mesh: m });
  snd("rocket", t === P.titan ? undefined : { pos: xyz(from) }); flash(toU(from), "#ffb060", 1800, .12); puff(toU(from), { n: 8, color: "#c7cbc8", dark: true, opacity: .5, size: 8, life: 1.2, grow: 2, drag: 2, vel: () => V3((rnd() - .5) * 30, 10 + rnd() * 20, (rnd() - .5) * 30) }); if (t === P.titan) P.shake = Math.max(P.shake, .08); }); }
// the fist: whatever stands in front of it is hit hard
function doPunch(t, yaw) { if (t.punchCd > 0) return; t.punch = .45; t.punchCd = 1.3; later(.17, () => { if (!t.alive || t.doom > 0) return; const fx = -Math.sin(yaw), fz = -Math.cos(yaw), at = V3(t.pos.x + fx * 3, t.pos.y + 3.4, t.pos.z + fz * 3); let hit = false;
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
      else if (who && who.alive) { end = V3(who.pos.x + (rnd() - .5) * 2, who.pos.y + who.h * (.3 + rnd() * .5), who.pos.z + (rnd() - .5) * 2); if (rnd() < .75) hurtTitan(who, 24); blast(end, 1.3, {}); }
      if (end) tracer(mz, toU(end), "#ffb070", 9000, 1.5); }); }
}
function callTitan(team, x, z, yaw) { const pod = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(3.2 * U, 5 * U, 3.2 * U), new THREE.MeshToonMaterial({ color: "#332a21" })), fire = new THREE.Mesh(new THREE.BoxGeometry(2.4 * U, 9 * U, 2.4 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, .7) }));
  fire.position.y = 7 * U; pod.add(body, fire); pod.position.set(x * U, 150 * U, z * U); scene.add(pod); DROPS.push({ team, x, z, yaw, t: 0, dur: 2.4, pod }); }
function tryCallTitan() {
  if (P.mine || DROPS.some((D) => D.team === "you")) return; if (P.meter < 100) { say("Your Titan is not ready yet. The meter fills over time and with every grunt you put down.", 2.5); return; }
  cam.getWorldDirection(_d); _o.copy(P.pos).setY(P.pos.y + P.eye); const t = rayWorld(_o, _d, 60), at = _o.clone().addScaledVector(_d, t);
  if (t >= 60 || at.y > groundH(at.x, at.z) + .7 || !freeG(at.x, at.z, 5.9, 1.7, .55) || rayWorld(V3(at.x, groundH(at.x, at.z) + 6.5, at.z), V3(0, 1, 0), 100, false) < 100) { say("Your Titan needs open ground under open sky. Aim at a clear patch within 60 metres.", 3); return; }
  P.meter = 0; callTitan("you", at.x, at.z, Math.atan2(-(P.pos.x - at.x), -(P.pos.z - at.z))); say("Titanfall is on its way. Stand clear.", 2.4);
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
  if (go && K._rockets && t.rk <= 0) { aimRay(0); const best = rayWorld(_o, _d, 120); fireRockets(t, _o.clone().addScaledVector(_d, Math.max(4, best - .3))); } K._rockets = false;
  if (t.dashing > 0) t.dashing -= dt; else { friction(t, 4, dt); accelerate(t, wx, wz, t.speed, 3.2, dt); }
  t.vel.y -= 22 * dt; moveBody(t, dt); t.yaw += clamp(angD(t.yaw, P.yaw), -2.6 * dt, 2.6 * dt); t.aimYaw = clamp(angD(t.yaw, P.yaw), -1.1, 1.1); t.aimPitch = P.pitch;
  t.walk += Math.hypot(t.vel.x, t.vel.z) * dt; P.pos.copy(t.pos); P.vel.copy(t.vel); P.grounded = t.grounded;
}

/* ---------- what the pilot holds ---------- */
const gun = new THREE.Group(); gun.scale.setScalar(.62); gunScene.add(gun);
function partGeo(list) { const g = []; const c = new THREE.Color(); for (const [w, h, d, x, y, z, col] of list) { const b = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed(); b.deleteAttribute("uv"); c.set(col); const a = []; for (let i = 0; i < b.attributes.position.count; i++) a.push(c.r, c.g, c.b); b.setAttribute("color", new THREE.Float32BufferAttribute(a, 3)); g.push(b); } return mergeGeometries(g); }
const carbine = new THREE.Mesh(partGeo([[.07, .09, .5, 0, 0, -.1, "#454c52"], [.045, .045, .3, 0, .03, -.5, "#231d17"], [.08, .1, .22, 0, -.01, .26, "#5f676d"], [.06, .16, .08, 0, -.15, .02, "#231d17"], [.05, .14, .07, 0, -.13, -.16, "#c9733a"],
  [.03, .05, .1, 0, .09, -.06, "#231d17"], [.09, .03, .2, 0, .085, -.22, "#7d858a"], [.075, .02, .3, 0, -.012, -.2, "#c9733a"], [.1, .1, .12, 0, -.1, .12, "#4f5a3c"], [.09, .09, .3, .02, -.2, .3, "#4f5a3c"], [.02, .03, .34, .045, .03, -.2, "#231d17"], [.02, .03, .34, -.045, .03, -.2, "#231d17"]]), gunMat); gun.add(carbine);
const chargeR = new THREE.Mesh(partGeo([[.08, .1, .62, 0, 0, -.16, "#3b4430"], [.05, .05, .5, 0, .025, -.62, "#231d17"], [.1, .12, .2, 0, -.01, .26, "#5f676d"], [.06, .16, .08, 0, -.15, .02, "#231d17"], [.11, .05, .3, 0, .1, -.2, "#7d858a"],
  [.12, .12, .1, 0, -.01, -.42, "#454c52"], [.12, .12, .06, 0, -.01, -.6, "#454c52"], [.1, .1, .12, 0, -.1, .12, "#4f5a3c"], [.09, .09, .3, .02, -.2, .3, "#4f5a3c"]]), gunMat); gun.add(chargeR);
const coil = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .14), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 2.4, 3) })); coil.position.set(0, .05, -.51); chargeR.add(coil);
const cannon = new THREE.Mesh(partGeo([[.24, .22, 1.2, 0, 0, -.4, "#454c52"], [.07, .07, 1.0, -.055, .12, -1.5, "#231d17"], [.07, .07, 1.0, .055, .12, -1.5, "#231d17"], [.07, .07, 1.0, 0, .03, -1.5, "#231d17"], [.2, .2, .1, 0, .01, -1.52, "#5f676d"], [.2, .2, .08, 0, .01, -1.98, "#5f676d"],
  [.28, .05, .8, 0, .22, -.5, "#7d858a"], [.26, .04, .5, 0, -.03, -.55, "#c9733a"], [.3, .3, .36, 0, -.04, .3, "#5f676d"], [.22, .26, .26, -.2, -.06, -.2, "#4f5a3c"], [.23, .05, .27, -.2, .06, -.2, "#c9733a"], [.04, .1, .3, .13, .08, -.3, "#231d17"]]), gunMat); cannon.scale.setScalar(.72); gunScene.add(cannon);
const fist = new THREE.Mesh(partGeo([[.5, .44, .5, 0, 0, 0, "#34373a"], [.56, .2, .56, 0, .2, 0, "#b9b3a4"], [.44, .44, .9, 0, 0, .7, "#8f8a80"], [.16, .16, .52, -.16, .1, -.3, "#34373a"], [.16, .16, .52, .16, .1, -.3, "#34373a"]]), gunMat); fist.visible = false; gunScene.add(fist);
const flashM = new THREE.Mesh(new THREE.BoxGeometry(.11, .11, .14), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.8, 1) })); flashM.visible = false; gunScene.add(flashM);
let flashT = 0, hitT = 0;
const _f = V3(), _r = V3(), _u = V3();
function aimRay(spread) { cam.getWorldDirection(_f); _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion); _d.copy(_f).addScaledVector(_r, (rnd() - .5) * spread * 2).addScaledVector(_u, (rnd() - .5) * spread * 2).normalize(); _o.copy(cam.position).divideScalar(U); }
function titanHit(o, d, best, team) { let who = null; for (const t of TITANS) { if (!t.alive || t.team === team) continue; const tt = rayBox(o, d, [t.pos.x - t.r, t.pos.y, t.pos.z - t.r], [t.pos.x + t.r, t.pos.y + t.h, t.pos.z + t.r], best); if (tt < best) { best = tt; who = t; } } return { best, who }; }
function muzzleAt(side, down, fwd) { return _o.clone().addScaledVector(_r, side).addScaledVector(_u, -down).addScaledVector(_f, fwd).multiplyScalar(U); }
function fireCarbine() {
  P.ammo--; snd("carbine", { layerGain: { mech: P.ammo < 6 ? 1 + (6 - P.ammo) * .5 : 1 }, pitch: LOAD.weapon === "longrifle" ? .82 : LOAD.weapon === "smg" ? 1.18 : 1 }); P.fireCd = pw().cd; P.kick = Math.min(1, P.kick + .35); flashT = .045; if (!runOn && !runDone) runOn = true;
  aimRay(pw().spread + P.spread * .02 + (P.grounded ? 0 : .006)); P.spread = Math.min(1, P.spread + .12); P.pitch += .004;
  let best = rayWorld(_o, _d, 220); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best;
  const end = _o.clone().addScaledVector(_d, best), eu = toU(end), from = muzzleAt(.2, .16, .7); tracer(from, eu, "#ffd890", 9000, .5); flash(from, "#ffc477", 900, .06);
  if (th.who) { hurtTitan(th.who, 3); snd("hitmarker", { gain: .7 }); hitT = .08; puff(eu, { n: 6, color: th.who.shield > 0 ? "#8fe0f0" : "#ffe9b0", hot: 3, size: 2, life: .2, vel: () => V3((rnd() - .5) * 70, rnd() * 50, (rnd() - .5) * 70) }); }
  else if (gh.who) { const g = gh.who, head = !g.veh && end.y - g.hitY > g.hitH * .8; snd(g.veh ? "impact_metal" : "impact_body", { pos: xyz(end) }); snd("hitmarker", { pitch: head ? 1.25 : 1 }); damage(g, pw().dmg * (head ? 2.5 : 1) * (g.veh ? .2 : 1), toU(P.pos), head ? "head" : "chest", true); hitT = .12; if (g.veh) puff(eu, { n: 6, color: "#ffe9b0", hot: 3, size: 2, life: .2, vel: () => V3((rnd() - .5) * 70, rnd() * 50, (rnd() - .5) * 70) }); }
  else { snd(surface(end), { pos: xyz(end) }); puff(eu, { n: 6, color: "#ffe9b0", hot: 3, size: 2, life: .2, grav: -170, vel: () => V3((rnd() - .5) * 70, rnd() * 50, (rnd() - .5) * 70) }); puff(eu, { n: 2, color: "#a09684", dark: true, opacity: .4, size: 4, life: .7, grow: 1.8, drag: 3, vel: () => V3((rnd() - .5) * 12, 8, (rnd() - .5) * 12) }); }
}
let chargeSnd = null;
function fireCharge() {
  if (chargeSnd) { chargeSnd.stop(.03); chargeSnd = null; } snd("charge_fire"); snd("charge_cool"); P.charge = 0; P.fireCd = .9; P.kick = 1; flashT = .08; if (!runOn && !runDone) runOn = true; aimRay(0); P.pitch += .02; coolFx = .5;
  let best = rayWorld(_o, _d, 260); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best;
  const end = _o.clone().addScaledVector(_d, best), eu = toU(end), from = muzzleAt(.2, .16, .8); tracer(from, eu, "#8fe0f0", 30000, 1.6); flash(from, "#8fe0f0", 2600, .14); flash(eu, "#8fe0f0", 2200, .2);
  puff(eu, { n: 18, color: "#d8f8ff", hot: 3, size: 4, life: .35, vel: () => V3((rnd() - .5) * 110, rnd() * 90, (rnd() - .5) * 110) }); ringFx(eu, "#8fe0f0", 30, .3);
  if (th.who) { hurtTitan(th.who, 70); snd("hitmarker", { gain: .9 }); hitT = .15; } else if (!gh.who) snd("impact_metal", { pos: xyz(end), gain: 1.4, pitch: .8 }); else if (gh.who) { snd("hitmarker"); hitT = .15; damage(gh.who, gh.who.veh ? 130 : 9999, toU(P.pos), "chest", true); }
}
function fireCannon(t) {
  t.ammo--; snd("cannon"); t.fireCd = .24; P.kick = 1; t.recoil = 1; flashT = .06; P.shake = Math.max(P.shake, .1); aimRay(.006);
  let best = rayWorld(_o, _d, 260); const gh = gruntHit(_o, _d, best); best = gh.best; const th = titanHit(_o, _d, best, "you"); best = th.best;
  const end = _o.clone().addScaledVector(_d, Math.max(0, best - .1)), from = muzzleAt(.9, .7, 2.4); tracer(from, toU(end), "#ffd890", 9000, 1.5); flash(from, "#ffc477", 3200, .1);
  puff(from, { n: 8, color: "#8f8a80", dark: true, opacity: .35, size: 8, life: 1.2, grow: 2, drag: 2.4, vel: () => V3((rnd() - .5) * 20, 10 + rnd() * 14, (rnd() - .5) * 20) });
  if (th.who) { hurtTitan(th.who, 34); hitT = .12; } else if (gh.who && gh.who.veh) damage(gh.who, 80, toU(P.pos), "blast", true); if (gh.who || th.who) { hitT = .12; snd("hitmarker", { gain: .8 }); }
  blast(end, 2.2, { team: "you" });
}
function stepGun(dt) {
  P.fireCd -= dt; P.kick = Math.max(0, P.kick - dt * 5); P.spread = Math.max(0, P.spread - dt * 1.6); flashT -= dt; hitT -= dt;
  const t = P.titan, canFire = mouseDown && P.dead <= 0 && !P.mantle && !P.seq;
  if (chargeSnd && (t || P.weapon !== 1 || P.dead > 0)) { chargeSnd.stop(.05); chargeSnd = null; }
  if (t) { if ((K.KeyR && t.ammo < 18 && t.reload <= 0) || (t.ammo <= 0 && t.reload <= 0)) { t.reload = 2.2; snd("reload", { pitch: .6, gain: 1.2 }); } else if (canFire && t.fireCd <= 0 && t.reload <= 0) fireCannon(t); }
  else if (P.weapon === 1) { if (canFire && P.fireCd <= 0) { if (!chargeSnd) chargeSnd = snd("charge_up"); P.charge += dt / .8; if (P.charge >= 1) fireCharge(); } else { if (chargeSnd) { chargeSnd.stop(.05); chargeSnd = null; } P.charge = Math.max(0, P.charge - dt * 2); } }
  else { if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0) P.ammo = pw().mag; } else if ((K.KeyR && P.ammo < pw().mag) || P.ammo <= 0) { P.reload = pw().reload; snd("reload"); } else if (canFire && P.fireCd <= 0) fireCarbine(); }
  const s = hs(), moving = P.grounded && !P.sliding && !t ? Math.min(1, s / 9) : 0; P.bob += dt * (5 + s * .9) * (moving > 0 ? 1 : 0);
  const rl = !t && P.weapon === 0 && P.reload > 0 ? Math.sin(clamp(1 - P.reload / pw().reload, 0, 1) * Math.PI) : 0;
  gun.visible = !t && P.dead <= 0 && !P.seq; carbine.visible = P.weapon === 0; chargeR.visible = P.weapon === 1; cannon.visible = !!t && CK.mode === "on"; fist.visible = cannon.visible && t.punch > 0; if (fist.visible) { const u = Math.sin(clamp(1 - t.punch / .45, 0, 1) * Math.PI); fist.position.set(-.5 + u * .3, -.75 + u * .35, -.6 - u * .9); }
  gun.position.set(.17 + Math.cos(P.bob) * .012 * moving + P.roll * .25, -.17 + Math.abs(Math.sin(P.bob)) * .014 * moving - rl * .22 - P.dip * .3 - (P.sliding ? .03 : 0), -.5 + P.kick * .05);
  gun.rotation.set(P.kick * .05 + rl * .7 + (P.mantle ? .6 : 0), .03, P.roll * .6 + (P.sliding ? -.18 : 0));
  if (P.weapon === 1) { coil.scale.setScalar(.6 + P.charge * 1.6); coil.material.color.setRGB(.5 + P.charge * 2, 2.4 + P.charge * 3, 3 + P.charge * 4); if (P.charge > 0) gun.position.x += (rnd() - .5) * .004 * P.charge; }
  if (t) { const tr = t.reload > 0 ? Math.sin(Math.min(1, (2.2 - t.reload) / 2.2) * Math.PI) : 0, wb = Math.sin(t.walk * 1.1); cannon.position.set(.66, -.6 - tr * .4 + Math.abs(wb) * .02, -.5 + P.kick * .1); cannon.rotation.set(P.kick * .03 + tr * .5, .04, 0); }
  flashM.visible = flashT > 0; if (flashM.visible) { if (t) { flashM.position.set(.66, -.52, -2.0); flashM.scale.setScalar(2.6); } else { flashM.position.set(gun.position.x, gun.position.y + .035, gun.position.z - .47); flashM.scale.setScalar(P.weapon === 1 ? 1.6 : 1); } flashM.rotation.z = rnd() * 3; }
}

/* ---------- the run ---------- */
function checkDone() {}
function restart() { for (const t of TITANS) scene.remove(t.rig.root); TITANS.length = 0; for (const h of HUSKS) scene.remove(h.root); HUSKS.length = 0; for (const r of ROCKETS) scene.remove(r.mesh); ROCKETS.length = 0; P.seq = null; CK.mode = "off"; for (const D of DROPS) scene.remove(D.pod); DROPS.length = 0; LATER.length = 0; foeCalled = false; P.mine = null; P.meter = 0; P.weapon = 0; P.charge = 0;
  respawn(); resetBattle(); if (MAP.on) setMap(false); runT = 0; runOn = true; runDone = false; say(""); }

/* ---------- input ---------- */
const cv = renderer.domElement;
function wantLock() { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { noLock = true; }); } catch (e) { noLock = true; } }
document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === cv; if (!locked) { mouseDown = false; for (const k in K) K[k] = false; } });
document.addEventListener("pointerlockerror", () => { noLock = true; });
const active = () => started && !panelOpen && (locked || noLock || MAP.on);
function toggleMap() { if (MAP.on) { setMap(false); wantLock(); } else { setMap(true); for (const k in K) K[k] = false; mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); } }
function useKey() { if (P.seq) return; if (P.titan) { startExit(); return; } const m = P.mine; if (m && m.alive && m.doom <= 0 && Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 7 && Math.abs(m.pos.y - P.pos.y) < 6) startEnter(m); }
addEventListener("keydown", (e) => { if (started && !panelOpen && e.ctrlKey) e.preventDefault(); if (e.repeat) return; if (started && ["Space", "Tab", "KeyC", "KeyR", "KeyE", "KeyV", "KeyQ", "KeyF"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyP" && started && !MAP.on) { togglePanel(); return; }
  if (e.code === "Tab" && started && !panelOpen) { toggleMap(); return; }
  if (MAP.on) { MAP.keys[e.code] = true; if (e.code === "KeyT") restart(); return; }
  if (!active()) return; const code = e.code === "ControlLeft" ? "KeyC" : e.code; K[code] = true;
  if (code === "Space") P.jumpBuf = .14; if (code === "KeyT") restart(); if (code === "KeyE" && P.dead <= 0) useKey(); if (code === "KeyV" && P.dead <= 0 && !P.titan) tryCallTitan();
  if (code === "ShiftLeft" || code === "ShiftRight" || code === "Space") K._dash = !!P.titan; if (code === "KeyF") K._punch = !!P.titan;
  if (!P.titan && (code === "KeyQ" || code === "Digit1" || code === "Digit2")) { P.weapon = code === "KeyQ" ? 1 - P.weapon : code === "Digit2" ? 1 : 0; P.charge = 0; P.fireCd = Math.max(P.fireCd, .25); snd("swap"); }
  if (!runOn && !runDone && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) runOn = true; });
addEventListener("keyup", (e) => { K[e.code === "ControlLeft" ? "KeyC" : e.code] = false; MAP.keys[e.code] = false; });
addEventListener("blur", () => { for (const k in K) K[k] = false; mouseDown = false; });
cv.addEventListener("mousedown", (e) => { if (!started || panelOpen) return; if (!locked && !noLock) { wantLock(); return; } if (e.button === 0) mouseDown = true; if (e.button === 2 && P.titan) K._rockets = true; });
addEventListener("mouseup", (e) => { if (e.button === 0) mouseDown = false; });
addEventListener("mousemove", (e) => { if (!active() || MAP.on || P.dead > 0 || P.seq) return; const k = .0022 * CFG.sens * (P.titan ? .8 : 1); P.yaw -= e.movementX * k; P.pitch = clamp(P.pitch - e.movementY * k, -1.5, 1.5); });
cv.addEventListener("contextmenu", (e) => e.preventDefault());

/* ---------- screen furniture ---------- */
const msg = $("msg"); function say(t, secs = 0) { msg.textContent = t; msg.style.display = t ? "block" : "none"; sayT = secs; }
$("go").onclick = () => { if (SND) SND.start(); saveLoad(); started = true; $("start").style.display = "none"; $("hud").style.display = "block"; restart(); wantLock(); };
const PAINTS = ["#c45a1e", "#3f6f9a", "#5c7f36", "#b0312a", "#c9a03a", "#e2d0ae"];
function buildSetup() { const U2 = FACTIONS[LOAD.side].units, list = LOAD.list[LOAD.side] = LOAD.list[LOAD.side].filter((id) => U2[id]), used = list.reduce((a, id) => a + U2[id].pts, 0), btn = (attr, k, label, on, extra = "") => `<button data-${attr}="${k}" class="${on ? "on" : ""}" ${extra}>${label}</button>`;
  $("setup").innerHTML = `<h2>Your side</h2><div class="row">${Object.entries(FACTIONS).map(([k, f]) => btn("side", k, f.name, LOAD.side === k)).join("")}</div><p class="note">${FACTIONS[LOAD.side].blurb} The other side is run by the machine across the yard.</p>
    <h2>Your pilot</h2><div class="row">${Object.entries(PW).map(([k, w]) => btn("wpn", k, w.name, LOAD.weapon === k)).join("")}</div><p class="note">${pw().desc} Every pilot also carries the charge rifle for Titans and vehicles.</p>
    <h2>Your Titan</h2><div class="row">${Object.entries(CHASSIS).map(([k, c]) => btn("ch", k, c.name, LOAD.chassis === k)).join("")}</div><p class="note">${(CHASSIS[LOAD.chassis] || CHASSIS.vanguard).desc}</p><div class="row">${PAINTS.map((c) => `<button data-paint="${c}" class="sw ${LOAD.paint === c ? "on" : ""}" style="background:${c}" title="Paint"></button>`).join("")}</div>
    <h2>Your army list <span class="pts">${used} of ${LIST_PTS} points</span></h2><p class="note">These are the squads and vehicles you can bring onto the field. Each one costs list points here and supply during the battle.</p>
    <div class="cat">${Object.entries(U2).map(([k, d]) => { const inl = list.includes(k), can = inl || used + d.pts <= LIST_PTS; return `<div class="${inl ? "in" : ""}"><b>${d.icon}</b><span><strong>${d.name}</strong> <em>${d.pts} points · ${d.cost} supply</em><br>${d.desc}</span><button data-unit="${k}" ${can ? "" : "disabled"} class="${inl ? "on" : ""}">${inl ? "In the list" : can ? "Add" : "No points left"}</button></div>`; }).join("")}</div>
    <h2>How your troops arrive</h2><div class="row">${Object.entries(DOCTRINES).map(([k, d]) => btn("doc", k, d[0], LOAD.doctrine === k)).join("")}</div><p class="note">${DOCTRINES[LOAD.doctrine][1]} You can change this on the battle map at any time.</p>`;
  $("go").disabled = !list.length; }
$("setup").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
  if (d.side) LOAD.side = d.side; else if (d.wpn) LOAD.weapon = d.wpn; else if (d.ch) LOAD.chassis = d.ch; else if (d.paint) LOAD.paint = d.paint; else if (d.doc) LOAD.doctrine = d.doc; else if (d.unit) { const l = LOAD.list[LOAD.side], i = l.indexOf(d.unit); if (i >= 0) l.splice(i, 1); else l.push(d.unit); }
  saveLoad(); buildSetup(); });
buildSetup();
function togglePanel() { panelOpen = !panelOpen; $("panel").style.display = panelOpen ? "block" : "none"; if (panelOpen) { if (document.pointerLockElement) document.exitPointerLock(); } else wantLock(); }
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
  el["ck-ammo"].textContent = t.reload > 0 ? "--" : t.ammo; el["ck-ammoarc"].setAttribute("stroke-dasharray", (t.reload > 0 ? (1 - t.reload / 2.2) : t.ammo / 18) * 88 + " 400"); el["ck-sharc"].setAttribute("stroke-dasharray", t.shield / 150 * 88 + " 400");
  const foe = TITANS.find((o) => o.team === "foe"), W = [];
  if (t.hitT < 1) W.push(["red", "INCOMING FIRE"]); if (t.hull < t.hullMax * .35) W.push(["red", "HULL CRITICAL"]); if (t.shield <= 0) W.push(["amber", "SHIELD DOWN"]); if (foe) W.push(["amber", "HOSTILE TITAN ON FIELD"]); if (DROPS.some((D) => D.team === "foe")) W.push(["amber", "TITANFALL DETECTED"]); if (t.reload > 0) W.push(["", "RELOADING"]);
  const key = W.map((w) => w[1]).join("|"); if (key !== warnKey) { warnKey = key; el["ck-warn"].innerHTML = W.map(([c, x]) => `<div class="${c}">${TRI}${x}</div>`).join(""); }
  el["ck-sys"].innerHTML = `<u>VANGUARD FRAME 07</u>LINK &nbsp;&nbsp; PILOT ${segs(4, 4)}<br>REACTOR ${Math.round(60 + t.hull / t.hullMax * 38)}%<br>DASH &nbsp;&nbsp; ${segs(t.dash, t.dashMax, "■")}<br><br>SCORE &nbsp; ${Math.floor(B.score.you)} : ${Math.floor(B.score.foe)}<br>POINTS &nbsp;${POINTS.map((p) => (p.owner === "you" ? p.name : p.owner === "foe" ? p.name.toLowerCase() : "·")).join(" ")}<br>SUPPLY &nbsp;${Math.floor(B.supply.you)}<br><br>TAB &nbsp;&nbsp;&nbsp;COMMAND`;
  el["ck-wpn"].innerHTML = `<u>40 MM CANNON</u><em>${t.reload > 0 ? "RELOAD" : t.ammo + " / 18"}</em><span class="pips">${segs(t.reload > 0 ? 0 : t.ammo, 18)}</span><u>ROCKET POD</u><em class="${t.rk <= 0 ? "" : "dim"}">${t.rk <= 0 ? "READY" : "LOADING"}</em><span class="pips">${segs(t.rk <= 0 ? 6 : Math.floor((1 - t.rk / 8) * 6), 6, "◆")}</span><u>FIST</u><em class="${t.punchCd <= 0 ? "" : "dim"}">${t.punchCd <= 0 ? "READY" : "..."}</em><small>LMB &nbsp;RMB &nbsp;F</small>`;
  el["ck-vit"].innerHTML = `<div><label>SHIELD</label><span class="sh">${segs(Math.ceil(t.shield / 10), 15)}</span><label>${Math.round(t.shield / 1.5)}%</label></div><div class="${t.hull < t.hullMax * .35 ? "crit" : ""}"><label>HULL</label><span class="hu">${segs(Math.ceil(t.hull / t.hullMax * 20), 20)}</span><label>${Math.round(t.hull / t.hullMax * 100)}%</label></div>`;
  // radar: what is around, turned so that ahead is up
  const c = rctx, R = 78; c.clearRect(0, 0, 160, 160); c.strokeStyle = "rgba(143,224,240,.55)"; c.lineWidth = 1; for (const r of [R, R * .66, R * .33]) { c.beginPath(); c.arc(80, 80, r, 0, 6.3); c.stroke(); } c.beginPath(); c.moveTo(80, 2); c.lineTo(80, 158); c.moveTo(2, 80); c.lineTo(158, 80); c.stroke();
  const fxx = -Math.sin(P.yaw), fzz = -Math.cos(P.yaw), blip = (x, z, col, sz) => { const dx = x - t.pos.x, dz = z - t.pos.z, px = (dx * -fzz + dz * fxx) / 60 * R, py = (dx * fxx + dz * fzz) / 60 * R, l = Math.hypot(px, py), k = l > R ? R / l : 1; c.fillStyle = col; c.fillRect(80 + px * k - sz / 2, 80 - py * k - sz / 2, sz, sz); };
  for (const g of GRUNTS) if (g.s.dead < 0) blip(g.s.root.position.x / U, g.s.root.position.z / U, "#e05a3a", 4); if (foe) blip(foe.pos.x, foe.pos.z, "#ff3a3a", 9); c.fillStyle = "#8fe0f0"; c.beginPath(); c.moveTo(80, 73); c.lineTo(85, 86); c.lineTo(75, 86); c.fill();
}
function hud(dt) { el.cross.className = hitT > 0 ? "hit" : ""; if (sayT > 0) { sayT -= dt; if (sayT <= 0) say(""); } cockpit(dt); if (P.titan || CK.mode !== "off") { el.state.textContent = ""; el.foe.style.display = "none"; return; }
  hudT -= dt; if (hudT > 0) return; hudT = .08; const m = P.mine;
  el.lab1.textContent = "Pilot"; el.hpfill.style.width = P.hp + "%"; el.speed.textContent = hs().toFixed(1); el.wname.textContent = P.weapon ? "Charge rifle (Q)" : pw().name + " (Q)"; el.ammo.textContent = P.weapon ? (P.charge > 0 ? "charging" : P.fireCd > 0 ? "cooling" : "ready") : P.reload > 0 ? "reloading" : P.ammo + " / " + pw().mag;
  el.kills.innerHTML = `<span class="you">${Math.floor(B.score.you)}</span> ${POINTS.map((p) => `<i class="${p.owner || "none"}">${p.name}</i>`).join("")} <span class="foe">${Math.floor(B.score.foe)}</span>`; el.timer.textContent = "Supply " + Math.floor(B.supply.you) + " · Tab: command";
  el.meterfill.style.width = (m ? 100 : P.meter) + "%"; el.meterlab.textContent = m ? "Titan: standing by" : DROPS.some((D) => D.team === "you") ? "Titan: on its way" : P.meter >= 100 ? "Titan ready: press V" : "Titan " + Math.floor(P.meter) + "%";
  const foe = TITANS.find((o) => o.team === "foe"); el.foe.style.display = foe ? "block" : "none"; if (foe) el.foefill.style.width = (foe.hull + foe.shield) / 5 + "%"; 
  const near = !P.seq && m && m.alive && m.doom <= 0 && Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 7;
  el.state.textContent = !locked && !noLock && !panelOpen ? "CLICK TO TAKE THE MOUSE BACK" : near ? "PRESS E TO CLIMB IN" : P.wall ? "WALL RUN" : P.mantle ? "CLIMB" : P.sliding ? "SLIDE" : ""; }

/* ---------- frame ---------- */
const H = 1 / 120; let acc = 0, last = performance.now(), menuSpin = 0;
function advance(dt) {
  if (active()) { acc += dt; while (acc >= H) { stepPilot(H); acc -= H; } stepGun(dt); stepBattle(dt); stepTitans(dt); if (!foeCalled && B.time > 100 && !B.over) callFoe(); if (!P.mine && !B.over) P.meter = Math.min(100, P.meter + .8 * dt); }
  try { SOL.update(dt); } catch (e) { if (!advance.w1) { advance.w1 = 1; console.error("[soldiers]", e); } }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
  advance(dt);
  hurtFx = Math.max(0, hurtFx - dt * 1.6); coolFx = Math.max(0, coolFx - dt * 2.5); P.shake = Math.max(0, P.shake - dt * 1.5);
  if (!started) { menuSpin += dt * .06; cam.position.set(Math.sin(menuSpin) * 30 * U, 12 * U, (Math.cos(menuSpin) * 30 + 4) * U); cam.rotation.set(-.28, menuSpin, 0); gun.visible = cannon.visible = false; }
  else if (MAP.on) { mapCamera(dt); mapFrame(dt); gun.visible = cannon.visible = fist.visible = flashM.visible = false; }
  else if (seqCam()) { const [p, yaw, pitch] = seqCam(); cam.position.set(p.x * U, p.y * U, p.z * U); cam.rotation.set(pitch, yaw, 0); if (Math.abs(cam.fov - 84) > .05) { cam.fov = lerp(cam.fov, 84, 1 - Math.exp(-dt * 6)); cam.updateProjectionMatrix(); } }
  else { const t = P.titan, sh = P.shake * .06;
    const wallRoll = P.wall ? -(P.wall.ax === 0 ? P.wall.n * Math.cos(P.yaw) : -P.wall.n * Math.sin(P.yaw)) * .2 : 0;
    P.roll = lerp(P.roll, wallRoll + (P.sliding ? .04 : 0), 1 - Math.exp(-dt * 10)); P.dip = Math.max(0, P.dip - dt * .9);
    P.eye = t ? t.eye - TITAN.KNEEL * Math.max(t.kneel, ease(t.land) * .7) : lerp(Math.min(P.eye, 1.8), P.h - .12 - (P.dead > 0 ? .9 : 0), 1 - Math.exp(-dt * 14));
    const moving = P.grounded && !P.sliding && !t ? Math.min(1, hs() / 9) : 0, bob = t ? Math.abs(Math.sin(t.walk * 1.1)) * .09 : Math.abs(Math.sin(P.bob)) * .035 * moving;
    cam.position.set(P.pos.x * U, (P.pos.y + P.eye - P.dip + bob) * U, P.pos.z * U); cam.rotation.set(P.pitch + (rnd() - .5) * sh, P.yaw + (rnd() - .5) * sh, P.roll + (P.dead > 0 ? .5 : 0) + (rnd() - .5) * sh);
    const fov = (t ? 88 : CFG.fov) + clamp((hs() - 9) / 8, 0, 1) * 9; if (Math.abs(cam.fov - fov) > .05) { cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 6)); cam.updateProjectionMatrix(); } }
  const t = P.titan;
  render(clock, dt, Math.max(MAP.on ? 0 : hurtFx, P.dead > 0 && !MAP.on ? .8 : 0, t ? (1 - t.hull / t.hullMax) * .4 : (1 - P.hp / 100) * .5), Math.max(coolFx, P.charge * .6), MAP.on);
  if (SND) { cam.getWorldDirection(_f); SND.listener(cam.position.x / U, cam.position.y / U, cam.position.z / U, _f.x, _f.y, _f.z); }
  if (started) hud(dt);
}
buildPass(); respawn();
window.__mf = { snd, SND, B, MAP, setMap, deploy, SQUADS, ALLIES, VEH, POINTS, LOAD, P, K, GRUNTS, TITANS, DROPS, CFG, BOXES, stepPilot, stepTitans, fireCarbine, fireCannon, callTitan, callFoe, startEnter, startExit, tryCallTitan, CK, ROCKETS, fireRockets, doPunch, useKey, hurtTitan, restart, SOL, U, cam,
  get started() { return started; }, sim(sec) { for (let i = 0; i < sec * 30; i++) advance(1 / 30); }, mouse(v) { mouseDown = v; }, force() { started = true; noLock = true; $("start").style.display = "none"; $("hud").style.display = "block"; restart(); } };
requestAnimationFrame(frame);
