/* Machine-Fall FPS, prototype 5: the battle.
   Two sides fight over five points across a town, a refinery and the hills above them. Each side has a commander who spends supply to bring
   squads and vehicles onto the field from an army list, and gives them orders. The player is one of the commanders, and is
   also on the field as a pilot. The other commander is the machine in this file.
   The Frontier Militia are the Table's soldiers; the Machine's infantry are the Table's machine troopers (cb/cbmech.js) on
   the same skeleton. Vehicles are the Table's generated models; the Machine's walk and track on their own rigs.
   Everything here is in metres; the engine draws at U. */
import { THREE, U, clamp, lerp, V3, rnd, $, scene, cam, renderer, charMat, free, freeG, groundH, slopeAt, WORLD, rayBox, rayWorld, SOL, GEN, MACH, placeMachine, removeMachine, mfx, genModel, flash, puff, ringFx, tracer, fxLayer } from "./engine.js";

const toU = (v) => V3(v.x * U, v.y * U, v.z * U);
const WPN = { rifle: { range: 48, dmg: 22, burst: 3, acc: .5, cd: [1.4, 2.4] }, lmg: { range: 52, dmg: 16, burst: 6, acc: .42, cd: [1.6, 2.4] }, dmr: { range: 75, dmg: 48, burst: 1, acc: .7, cd: [1.6, 2.2] }, shotgun: { range: 16, dmg: 50, burst: 1, acc: .75, cd: [1.1, 1.6] } };
export const FACTIONS = {
  militia: { name: "Frontier Militia", blurb: "People with rifles, trucks and a grudge. Cheap, steady infantry and fast gun trucks.", units: {
    rifles: { name: "Rifle squad", icon: "R", guns: ["rifle", "rifle", "rifle", "rifle"], hp: 65, cost: 35, pts: 2, desc: "Four riflemen. They take ground and hold it." },
    support: { name: "Support team", icon: "S", guns: ["lmg", "rifle", "rifle"], hp: 65, cost: 45, pts: 3, desc: "A machine gunner and two riflemen. Best set up on a point." },
    marksmen: { name: "Marksman pair", icon: "M", guns: ["dmr", "dmr"], hp: 55, cost: 40, pts: 2, desc: "Two marksmen who hit hard from a long way off." },
    breachers: { name: "Breachers", icon: "B", guns: ["shotgun", "shotgun", "shotgun"], hp: 70, cost: 45, pts: 2, desc: "Three shotguns for the close work around crates and walls." },
    truck: { name: "Gun truck", icon: "T", veh: { model: "gen:humvee:c1", hp: 260, speed: 6.5, r: 1.3, gun: "mg" }, cost: 90, pts: 4, desc: "An armoured truck with a heavy gun. It chews through infantry." },
    technical: { name: "Rocket technical", icon: "K", veh: { model: "gen:technical:a1", hp: 170, speed: 7, r: 1.3, gun: "rocket" }, cost: 110, pts: 4, desc: "A pickup with a rocket rack. Thin armour, but it hurts vehicles and Titans." } } },
  machine: { name: "The Machine", blurb: "Built troopers that do not tire, and walkers behind them. Fewer bodies, each one harder to stop.", units: {
    lights: { name: "Light troopers", icon: "L", guns: ["rifle", "rifle", "rifle", "rifle"], mech: "light", hp: 45, cost: 45, pts: 2, desc: "Four light frames with rifles. Quick to build, quick to lose." },
    mediums: { name: "Medium troopers", icon: "M", guns: ["lmg", "rifle", "rifle"], mech: "medium", hp: 75, cost: 70, pts: 3, desc: "Three armoured frames around a heavy gun." },
    jumps: { name: "Jump troopers", icon: "J", guns: ["shotgun", "shotgun", "shotgun"], mech: "jump", hp: 60, cost: 60, pts: 3, desc: "Three assault frames that close the distance and finish it up close." },
    heavies: { name: "Heavy troopers", icon: "H", guns: ["lmg", "lmg"], mech: "heavy", hp: 120, cost: 80, pts: 3, desc: "Two full-load frames. Slow to put down." },
    hound: { name: "Hound drone", icon: "D", veh: { model: "gen:hound:a1", mach: true, hp: 200, speed: 5.5, r: 1.1, gun: "mg" }, cost: 80, pts: 3, desc: "A tracked ground drone with a gun station." },
    mantis: { name: "Mantis walker", icon: "W", veh: { model: "gen:mantis:a1", mach: true, hp: 420, speed: 4, r: 1.6, gun: "rocket" }, cost: 140, pts: 5, desc: "A four-legged assault walker with an autocannon and rockets." } } },
};
export const DOCTRINES = { manual: ["Manual", "You bring in every squad yourself and they wait for your orders."], rush: ["Infantry rush", "Infantry as fast as supply allows, sent at the nearest point you do not hold."], armor: ["Armor support", "Vehicles first, with infantry to hold what they take."], mixed: ["Mixed", "Two squads of infantry for every vehicle."] };
export const LIST_PTS = 12, GOAL = 400;
export const LOAD = { side: "militia", weapon: "carbine", chassis: "vanguard", paint: "#c45a1e", doctrine: "mixed", list: { militia: ["rifles", "support", "marksmen", "truck"], machine: ["lights", "mediums", "heavies", "hound"] } };
try { const s = JSON.parse(localStorage.getItem("mf-fps-load") || "null"); if (s) { Object.assign(LOAD, s); LOAD.list = { ...LOAD.list, ...(s.list || {}) }; } } catch (e) {}
export const saveLoad = () => { try { localStorage.setItem("mf-fps-load", JSON.stringify(LOAD)); } catch (e) {} };

export const GRUNTS = [], ALLIES = [], VEH = [], SQUADS = [], POINTS = [];
export const B = { fac: { you: "militia", foe: "machine" }, list: { you: [], foe: [] }, doctrine: { you: "mixed", foe: "mixed" }, score: { you: 0, foe: 0 }, supply: { you: 0, foe: 0 }, time: 0, over: null, hooks: {}, n: 0, ai: { you: 0, foe: 0 }, turn: { you: 0, foe: 0 } };
const arr = (side) => (side === "you" ? ALLIES : GRUNTS), other = (side) => (side === "you" ? "foe" : "you");
const BASE = { you: [0, 128], foe: [0, -166] }, RALLY = { you: [0, 108], foe: [0, -148] };
const COL = { you: [.5, 2.4, 3], foe: [3.2, .5, .3], none: [1.5, 1.4, 1.2] };

/* ---------- where things can go ----------
   Two grids over the whole field, two metres to a square: PASS is where something big can stand (Titans and vehicles),
   WALK is where a soldier can. A flow field leads the big things to one square. For troops, a leg from one spot to
   another is a straight line wherever the line is clear; only a blocked line is taken round, by as few corners as will do. */
const GS = 2, NX = 160, NZ = 170, GX0 = -160, GZ0 = -190, NN = NX * NZ, PASS = new Uint8Array(NN), WALK = new Uint8Array(NN);
export function buildPass() { for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = GX0 + (i + .5) * GS, z = GZ0 + (j + .5) * GS, s = slopeAt(x, z), edge = i < 1 || j < 1 || i > NX - 2 || j > NZ - 2;
  PASS[j * NX + i] = !edge && s < .6 && freeG(x, z, 4.4, 1.6, .55) ? 1 : 0; WALK[j * NX + i] = !edge && s < 1.15 && freeG(x, z, 1.7, .5, .4) ? 1 : 0; } }
const ci = (x) => clamp(Math.floor((x - GX0) / GS), 0, NX - 1), cj = (z) => clamp(Math.floor((z - GZ0) / GS), 0, NZ - 1), cx = (i) => GX0 + (i + .5) * GS, cz = (j) => GZ0 + (j + .5) * GS;
function nearCell(G, i, j) { if (G[j * NX + i]) return j * NX + i; for (let r = 1; r < 40; r++) { let bd = 1e9, b = -1; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || !G[nj * NX + ni]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; b = nj * NX + ni; } } if (b >= 0) return b; } return -1; }
// the nearest spot to (x, z) that a soldier can stand on: the spot itself when it is clear
export function nearestWalk(x, z, G = WALK) { const i = ci(x), j = cj(z); if (G[j * NX + i]) return [x, z]; const c = nearCell(G, i, j); return c < 0 ? [x, z] : [cx(c % NX), cz((c / NX) | 0)]; }
const FQ = new Int32Array(NN);
export function flowTo(x, z) { const F = new Int16Array(NN).fill(-1), c0 = nearCell(PASS, ci(x), cj(z)); if (c0 < 0) return F; let h = 0, t = 0; FQ[t++] = c0; F[c0] = 0;
  while (h < t) { const c = FQ[h++], i = c % NX, v = F[c] + 1; if (i + 1 < NX && PASS[c + 1] && F[c + 1] < 0) { F[c + 1] = v; FQ[t++] = c + 1; } if (i > 0 && PASS[c - 1] && F[c - 1] < 0) { F[c - 1] = v; FQ[t++] = c - 1; } if (c + NX < NN && PASS[c + NX] && F[c + NX] < 0) { F[c + NX] = v; FQ[t++] = c + NX; } if (c >= NX && PASS[c - NX] && F[c - NX] < 0) { F[c - NX] = v; FQ[t++] = c - NX; } }
  return F; }
export function flowDir(F, x, z) { const i = ci(x), j = cj(z); let best = F[j * NX + i] < 0 ? 1e9 : F[j * NX + i], bi = i, bj = j;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue; const v = F[nj * NX + ni]; if (v < 0) continue; if (di && dj && (F[j * NX + ni] < 0 || F[nj * NX + i] < 0)) continue; if (v < best) { best = v; bi = ni; bj = nj; } }
  const tx = cx(bi) - x, tz = cz(bj) - z, l = Math.hypot(tx, tz); return l < .05 ? [0, 0] : [tx / l, tz / l]; }
// is the straight line between two spots clear all the way, on grid G
function segClear(ax, az, bx, bz, G) { const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / .9)); for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; if (!G[cj(z) * NX + ci(x)]) return false; } return true; }
const AG = new Float32Array(NN), AF = new Int32Array(NN), AS = new Uint32Array(NN); let stamp = 0;
function astar(c0, c1, G) { stamp++; const heap = [], hf = [], push = (c, f) => { let k = heap.length; heap.push(c); hf.push(f); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; heap[k] = heap[p]; hf[k] = hf[p]; k = p; } heap[k] = c; hf[k] = f; },
  pop = () => { const top = heap[0], c = heap.pop(), f = hf.pop(), n = heap.length; if (n) { let k = 0; for (;;) { let a = k * 2 + 1; if (a >= n) break; if (a + 1 < n && hf[a + 1] < hf[a]) a++; if (hf[a] >= f) break; heap[k] = heap[a]; hf[k] = hf[a]; k = a; } heap[k] = c; hf[k] = f; } return top; };
  const i1 = c1 % NX, j1 = (c1 / NX) | 0, hh = (c) => { const dx = Math.abs(c % NX - i1), dz = Math.abs(((c / NX) | 0) - j1); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
  AG[c0] = 0; AS[c0] = stamp; AF[c0] = -1; push(c0, hh(c0)); let seen = 0;
  while (heap.length && seen++ < 60000) { const c = pop(); if (c === c1) { const out = []; for (let k = c; k >= 0; k = AF[k]) out.push(k); return out.reverse(); } const i = c % NX, j = (c / NX) | 0, g = AG[c];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue; const n = nj * NX + ni; if (!G[n]) continue; if (di && dj && (!G[j * NX + ni] || !G[nj * NX + i])) continue;
      const ng = g + (di && dj ? 1.414 : 1); if (AS[n] === stamp && AG[n] <= ng) continue; AS[n] = stamp; AG[n] = ng; AF[n] = c; push(n, ng + hh(n)); } }
  return null; }
// The nodes of one leg, from a to exactly b. A clear line gives one node, b itself. A spot nobody can stand on is moved
// to the nearest one that can be. A blocked line is taken round by the shortest way, cut down to its corners.
export function legNodes(a, b, big = false) { const G = big ? PASS : WALK, [bx, bz] = nearestWalk(b.x, b.z, G), [ax, az] = nearestWalk(a.x, a.z, G), end = V3(bx, 0, bz);
  if (segClear(ax, az, bx, bz, G)) return [end]; const c0 = cj(az) * NX + ci(ax), c1 = cj(bz) * NX + ci(bx), cells = astar(c0, c1, G); if (!cells) return [end];
  const pts = cells.map((c) => [cx(c % NX), cz((c / NX) | 0)]); pts[0] = [ax, az]; pts[pts.length - 1] = [bx, bz]; const out = []; let k = 0;
  while (k < pts.length - 1) { let far = k + 1; for (let m = pts.length - 1; m > k + 1; m--) if (segClear(pts[k][0], pts[k][1], pts[m][0], pts[m][1], G)) { far = m; break; } out.push(V3(pts[far][0], 0, pts[far][1])); k = far; }
  out[out.length - 1] = end; return out; }

/* ---------- the three points ---------- */
for (const [name, x, z, label] of [["A", 100, 14, "Town square"], ["B", -6, -4, "Refinery"], ["C", -95, -20, "Lodge"], ["D", 52, -118, "Ridge relay"], ["E", -34, 86, "Depot"]]) { const gy = groundH(x, z);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(.5 * U, .5 * U, .5 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL.none) })); lamp.position.set(x * U, (gy + 5.2) * U, z * U);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(.14 * U, 5 * U, .14 * U), new THREE.MeshToonMaterial({ color: "#2a2724" })); pole.position.set(x * U, (gy + 2.5) * U, z * U); pole.castShadow = true;
  const ring = fxLayer(new THREE.Mesh(new THREE.RingGeometry(8.6 * U, 9 * U, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lamp.material.color, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }))); ring.position.set(x * U, gy * U + 3, z * U);
  const light = new THREE.PointLight("#ffffff", 900, 300, 1.5); light.position.set(x * U, (gy + 4.6) * U, z * U);
  scene.add(lamp, pole, ring, light); POINTS.push({ name, label, x, z, prog: 0, owner: null, lamp, light, n: { you: 0, foe: 0 } });
}

/* ---------- squads, soldiers and vehicles ---------- */
function spotFree(x, z, r) { for (let i = 0; i < 12; i++) { const px = x + (rnd() - .5) * (2 + i), pz = z + (rnd() - .5) * (2 + i * .6); if (freeG(px, pz, 1.8, r)) return [px, pz]; } return [x, z]; }
export function deploy(side, id, paid = true, at = null) { const home = at || BASE[side];
  const def = FACTIONS[B.fac[side]].units[id]; if (!def || B.over) return null; if (paid) { if (B.supply[side] < def.cost || !room(side, def)) return null; B.supply[side] -= def.cost; }
  const manual = side === "you" && B.doctrine.you === "manual";
  const sq = { id: ++B.n, side, def, name: def.name, members: [], veh: null, auto: !manual, order: manual ? { type: "move", pos: V3(RALLY.you[0] + (rnd() - .5) * 10, 0, RALLY.you[1]) } : null, path: [], fresh: false, state: "Deploying", think: rnd(), eng: false, n: def.veh ? 1 : def.guns.length, arrived: false, c: V3(home[0], 0, home[1]), dest: at ? V3(at[0], 0, at[1]) : V3(RALLY[side][0], 0, RALLY[side][1]) }; if (at) { sq.auto = false; sq.order = { type: "move", pos: V3(at[0], 0, at[1]) }; }
  if (def.veh) { const [x, z] = spotFree(home[0] + (at ? 0 : 10), home[1], def.veh.r + .3), v = { veh: true, side, sq, def, pos: V3(x, 0, z), yaw: side === "you" ? 0 : Math.PI, hp: def.veh.hp, r: def.veh.r, alive: true, tgt: null, think: rnd(), cd: 1 + rnd(), flow: null, flowT: 0, dest: null };
    if (def.veh.mach && MACH) { v.mid = "veh" + sq.id; v.group = placeMachine(v.mid, def.veh.model, x * U, z * U, v.yaw + Math.PI).group; } else { v.group = genModel(def.veh.model); scene.add(v.group); }
    const tag = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL[side]) })); tag.position.y = 62; v.group.add(tag); sq.veh = v; VEH.push(v); }
  else def.guns.forEach((gun, i) => { const [x, z] = spotFree(home[0] + (i - def.guns.length / 2) * 1.5, home[1], .5), mil = B.fac[side] === "militia";
    const s = SOL.make({ x: x * U, z: z * U, y: groundH(x, z) * U, yaw: side === "you" ? Math.PI : 0, weapon: gun, role: gun === "lmg" ? "gunner" : gun === "dmr" ? "marksman" : "rifleman", camo: mil ? (i % 2 ? "multicam" : "ranger") : "urban", seed: 100 + B.n * 7 + i });
    if (def.mech && window.CBMech) { try { window.CBMech.dress(s, def.mech, THREE, charMat, { scheme: side === "you" ? "worn" : "steel" }); } catch (e) { console.warn("[mech]", e); } }
    if (side === "you") { const tag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL.you) })); tag.position.y = 36; s.root.add(tag); }
    const g = { s, side, sq, hp: def.hp, W: WPN[gun], tgt: null, think: rnd() * .4, cd: 1 + rnd(), moveT: rnd(), err: V3(), c: .3, slot: i, deadT: 0, gone: false }; s.onShot = () => shot(g); sq.members.push(g); arr(side).push(g); });
  SQUADS.push(sq); return sq;
}
const aliveInf = (side) => arr(side).filter((g) => g.s.dead < 0).length, aliveVeh = (side) => VEH.filter((v) => v.side === side && v.alive).length;
export const room = (side, def) => (def.veh ? aliveVeh(side) < 3 : aliveInf(side) + def.guns.length <= 18);
const posOf = (u) => (u.veh ? V3(u.pos.x, groundH(u.pos.x, u.pos.z) + 1.2, u.pos.z) : V3(u.s.root.position.x / U, u.s.root.position.y / U + 1, u.s.root.position.z / U));

export function damage(u, n, fromU, zone = "chest", byPlayer = false) {
  if (!u) return; if (fromU && DOMES.length) { const ux = u.veh ? u.pos.x : u.s.root.position.x / U, uz = u.veh ? u.pos.z : u.s.root.position.z / U; if (domeAt(ux, uz, u.side) && !domeAt(fromU.x / U, fromU.z / U, u.side)) n *= .3; }   // under a shield dome, what comes from outside does much less
  if (u.veh) { if (!u.alive) return; u.hp -= n; if (u.hp <= 0) { u.alive = false; const p = V3(u.pos.x, groundH(u.pos.x, u.pos.z) + 1, u.pos.z); if (B.hooks.blast) B.hooks.blast(p, 3.2, {}); if (u.mid) { mfx({ id: u.mid, act: "wreck" }); const id = u.mid; setTimeout(() => removeMachine(id), 1500); } else scene.remove(u.group); if (byPlayer && B.hooks.onKill) B.hooks.onKill(15); } return; }
  if (u.s.dead >= 0) return; u.hp -= n; if (u.hp <= 0) { u.s.die(fromU, { zone, force: zone === "blast" ? 2 : 1 }); if (byPlayer && B.hooks.onKill) B.hooks.onKill(9); } else if (rnd() < .5) u.s.hit(fromU, 1); }
// the nearest thing on one side that a line from o along d strikes
export function rayUnits(o, d, best, side) { let who = null;
  for (const g of arr(side)) { const s = g.s; if (s.dead >= 0) continue; const p = s.root.position, x = p.x / U, y = p.y / U, z = p.z / U, hgt = (s.crouch ? 1.3 : 1.85) * (s.build ? s.build.h : 1), t = rayBox(o, d, [x - .4, y, z - .4], [x + .4, y + hgt, z + .4], best); if (t < best) { best = t; who = g; g.hitH = hgt; g.hitY = y; } }
  for (const v of VEH) { if (!v.alive || v.side !== side) continue; const vy = groundH(v.pos.x, v.pos.z), t = rayBox(o, d, [v.pos.x - v.r, vy, v.pos.z - v.r], [v.pos.x + v.r, vy + 2.4, v.pos.z + v.r], best); if (t < best) { best = t; who = v; } }
  return { best, who }; }
export function blastUnits(at, radius, side, dInf, dVeh, byPlayer = false) { if (!side) return; const p = toU(at);
  for (const g of arr(side)) if (g.s.dead < 0) { const q = g.s.root.position; if (Math.hypot(q.x / U - at.x, q.z / U - at.z) < radius && Math.abs(q.y / U - at.y) < radius + 2) damage(g, dInf, p, "blast", byPlayer); }
  for (const v of VEH) if (v.alive && v.side === side && Math.hypot(v.pos.x - at.x, v.pos.z - at.z) < radius + v.r) damage(v, dVeh, p, "blast", byPlayer); }
// what a unit at `from` on `side` would shoot at: the nearest enemy it can see
export function nearestEnemy(side, from, maxD, wantTitan = false) { const foes = []; const add = (kind, ref, pos) => { const d = pos.distanceTo(from); if (d < maxD) foes.push({ kind, ref, pos, d }); };
  for (const g of arr(other(side))) if (g.s.dead < 0) add("inf", g, posOf(g)); for (const v of VEH) if (v.alive && v.side !== side) add("veh", v, posOf(v));
  const pl = B.hooks.pilot ? B.hooks.pilot() : null; if (side === "foe" && pl && pl.ok) add("pilot", null, pl.pos);
  for (const t of B.hooks.titans ? B.hooks.titans() : []) if (t.alive && t.doom <= 0 && t.team !== side) add("titan", t, V3(t.pos.x, t.pos.y + t.h * .55, t.pos.z));
  foes.sort((a, b) => (a.d - (wantTitan && (a.kind === "titan" || a.kind === "veh") ? 30 : a.kind === "titan" ? -25 : 0)) - (b.d - (wantTitan && (b.kind === "titan" || b.kind === "veh") ? 30 : b.kind === "titan" ? -25 : 0)));
  const dir = V3(); for (let i = 0; i < Math.min(5, foes.length); i++) { const f = foes[i]; dir.copy(f.pos).sub(from).divideScalar(f.d || 1); if (rayWorld(from, dir, f.d) >= f.d - .05) return f; } return null; }
const tgtAlive = (t) => t && (t.kind === "inf" ? t.ref.s.dead < 0 : t.kind === "veh" ? t.ref.alive : t.kind === "titan" ? t.ref.alive && t.ref.doom <= 0 : B.hooks.pilot().ok);
const tgtPos = (t) => (t.kind === "inf" || t.kind === "veh" ? posOf(t.ref) : t.kind === "titan" ? V3(t.ref.pos.x, t.ref.pos.y + t.ref.h * .55, t.ref.pos.z) : B.hooks.pilot().pos);
function shot(g) { const t = g.tgt; if (!tgtAlive(t)) return; const from = g.s.root.position, hitP = t.kind === "pilot" && rnd() < g.c; if (B.hooks.shotSnd) B.hooks.shotSnd(from, t.kind === "pilot", hitP);   // sound hook: every soldier's shot
  if (t.kind === "pilot") { if (hitP) B.hooks.hurtPilot(7 * g.W.dmg / 22); } else if (t.kind === "titan") { if (rnd() < .7) B.hooks.hurtTitan(t.ref, 1.5); } else if (rnd() < g.c) damage(t.ref, t.kind === "veh" ? g.W.dmg * .18 : g.W.dmg, from, "chest"); }
function stepSoldier(g, dt) { const s = g.s, rp = s.root.position;
  if (s.dead >= 0) { if (g.cv) drop(g); g.deadT += dt; if (g.deadT > 9 && !g.gone) { g.gone = true; try { s.remove(); } catch (e) {} } return; }
  g.think -= dt; if (g.think <= 0) { g.think = .35 + rnd() * .2; g.tgt = nearestEnemy(g.side, V3(rp.x / U, rp.y / U + 1.5, rp.z / U), g.W.range); if (!g.tgt) s.aimAt(null); }
  const t = g.tgt;
  if (t && tgtAlive(t)) { const p = tgtPos(t); s.aimAt(V3(p.x * U + g.err.x, p.y * U + g.err.y, p.z * U + g.err.z)); g.cd -= dt;
    if (g.cd <= 0 && !s.busy) { if (s.ammo <= 0) s.doReload(); else { const d = t.d, pl = t.kind === "pilot" ? B.hooks.pilot() : null;
      g.c = t.kind === "pilot" ? .5 * clamp(1 - pl.speed / 16, .2, 1) * (pl.grounded ? 1 : .6) * clamp(1.25 - d / 60, .3, 1) : t.kind === "inf" ? g.W.acc * clamp(1.15 - d / g.W.range * .6, .3, 1) * (t.ref.s.crouch ? .7 : 1) * (t.ref.s.moving ? .75 : 1) : .8;
      const miss = (1 - g.c) * 30; g.err.set((rnd() - .5) * miss, (rnd() - .3) * miss * .6, (rnd() - .5) * miss); if (s.cover) { const p2 = tgtPos(t); s.peekFire(V3(p2.x * U + g.err.x, p2.y * U + g.err.y, p2.z * U + g.err.z), g.W.burst); } else s.fire(g.W.burst); g.cd = lerp(g.W.cd[0], g.W.cd[1], rnd()); } } }
  // Going where the squad is going. Each member has its own place round the spot, but where there is something to get
  // behind, it takes that instead: at the end of the way, and on the way too once rounds are coming in (it runs from one
  // piece of cover to the next, firing from each, and fires on the move between them).
  g.moveT -= dt; if (g.moveT <= 0 && !s.busy && !s.peek) { g.moveT = 1.2 + rnd() * .8; const sq = g.sq, px = rp.x / U, pz = rp.z / U, thr = t ? tgtPos(t) : V3(BASE[other(g.side)][0], 0, BASE[other(g.side)][1]);
    s.threat = V3(thr.x * U, 0, thr.z * U); const dk = Math.round(sq.dest.x) + "," + Math.round(sq.dest.z); if (g.dk !== dk) { g.dk = dk; drop(g); g.hop = 0; }
    const far = Math.hypot(px - sq.dest.x, pz - sq.dest.z), near = far < 10;
    if (g.cv && g.cvHop && !near) { g.hop -= 2; if (s.cover && g.hop > 0) return; if (g.hop <= 0 || (!s.cover && !s.goal && !s.pendCover)) drop(g); else return; }   // behind something part way: stay a few seconds, then on
    if (!g.cv && (near || (t && far > 12))) { const c = findCover(g, near ? sq.dest : V3(px, 0, pz), near ? 9 : 11, near ? null : sq.dest, far, thr); if (c) { g.cv = c; c.mfUser = g; g.cvHop = !near; g.hop = 5 + rnd() * 4; } }
    let dx, dz; if (g.cv) { const c = g.cv, ux = c.p.x / U - thr.x, uz = c.p.z / U - thr.z, l = Math.hypot(ux, uz) || 1; dx = c.p.x / U + ux / l * (c.d / U + .9); dz = c.p.z / U + uz / l * (c.d / U + .9); if (s.cover) return; }
    else { const a = g.slot * 2.4 + sq.id, r = 1.5 + g.slot * .75; dx = sq.dest.x + Math.cos(a) * r; dz = sq.dest.z + Math.sin(a) * r; }
    const d = Math.hypot(px - dx, pz - dz); s.autoCover = !!g.cv;
    if (d > 2.2) { if (s.cover) s.leaveCover(); if (s.crouch) s.setStance("stand"); const still = g.lx != null && Math.hypot(px - g.lx, pz - g.lz) < .4 && !s.pendCover; g.lx = px; g.lz = pz;
      // walked into something and stopped: step back and round it, one side then the other
      if (still) { g.stuck = (g.stuck || 0) + 1; if (g.stuck > 3) drop(g); const ux = (dx - px) / d, uz = (dz - pz) / d, sd = g.stuck % 2 ? 1 : -1, k = 3 + g.stuck * .8; s.autoCover = false; s.moveTo(V3((px - uz * sd * k - ux * 1.2) * U, 0, (pz + ux * sd * k - uz * 1.2) * U), "run"); g.moveT = 1.1; }
      else { g.stuck = 0; s.moveTo(V3(dx * U, 0, dz * U), t ? "tacrun" : "run"); } }
    else if (!s.moving && !t && !s.cover && sq.arrived && rnd() < .3) s.setCrouch(rnd() < .6); }
}
const drop = (g) => { if (g.cv) { if (g.cv.mfUser === g) g.cv.mfUser = null; g.cv = null; } };
// something low to get behind: near `at`, not taken by a squad mate, and on the way when a way is given
function findCover(g, at, reach, toward, far, thr) { let best = null, bs = 1e9; for (const c of SOL.covers) { if (c.h > 46 || c.h < 12) continue; const u = c.mfUser; if (u && u !== g && u.s.dead < 0) continue; const cx = c.p.x / U, cz = c.p.z / U, d = Math.hypot(cx - at.x, cz - at.z); if (d > reach) continue;
  if (toward && Math.hypot(cx - toward.x, cz - toward.z) > far - 2.5) continue; if (Math.hypot(cx - thr.x, cz - thr.z) < 5) continue; const sc = d + rnd() * 1.5; if (sc < bs) { bs = sc; best = c; } } return best; }
function stepVeh(v, dt) { if (!v.alive) return; const sq = v.sq, dest = sq.dest;
  v.think -= dt; if (v.think <= 0) { v.think = .5; v.tgt = nearestEnemy(v.side, V3(v.pos.x, groundH(v.pos.x, v.pos.z) + 1.7, v.pos.z), 55, v.def.veh.gun === "rocket"); }
  const t = v.tgt && tgtAlive(v.tgt) ? v.tgt : null, far = Math.hypot(dest.x - v.pos.x, dest.z - v.pos.z);
  let wx = 0, wz = 0; if (far > 4 && !(t && t.d < 26)) { v.flowT -= dt; if (v.flowT <= 0 || !v.flow) { v.flowT = 1.2; v.flow = flowTo(dest.x, dest.z); } [wx, wz] = flowDir(v.flow, v.pos.x, v.pos.z); }
  if (wx || wz) { const sp = v.def.veh.speed * dt, nx = v.pos.x + wx * sp, nz = v.pos.z + wz * sp; if (freeG(nx, v.pos.z, 1.6, v.r, .55)) v.pos.x = nx; if (freeG(v.pos.x, nz, 1.6, v.r, .55)) v.pos.z = nz; }
  const face = (wx || wz) ? Math.atan2(-wx, -wz) : t ? Math.atan2(-(t.pos.x - v.pos.x), -(t.pos.z - v.pos.z)) : v.yaw; let dy = (face - v.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; v.yaw += clamp(dy, -2 * dt, 2 * dt);
  v.group.position.set(v.pos.x * U, groundH(v.pos.x, v.pos.z) * U, v.pos.z * U); v.group.rotation.y = v.yaw + Math.PI;
  v.cd -= dt; if (t && v.cd <= 0) { const p = tgtPos(t), from = V3(v.pos.x, groundH(v.pos.x, v.pos.z) + 2, v.pos.z), rocket = v.def.veh.gun === "rocket", fu = toU(from); v.cd = rocket ? 3.4 + rnd() : 1.8 + rnd() * .8;
    if (v.mid) mfx({ id: v.mid, act: "fire", shot: rocket && (t.kind === "titan" || t.kind === "veh") ? "rocket" : "gun", at: [p.x * U, p.y * U, p.z * U] });
    else { flash(fu, "#ffc477", 1800, .1); for (let i = 0; i < (rocket ? 1 : 4); i++) setTimeout(() => tracer(fu, toU(p).add(V3((rnd() - .5) * 20, (rnd() - .5) * 12, (rnd() - .5) * 20)), rocket ? "#ffb060" : "#ffd890", rocket ? 2600 : 9000, rocket ? 2.2 : .7), i * 90); }
    setTimeout(() => { if (!v.alive || !tgtAlive(t)) return; const q = tgtPos(t), pl = t.kind === "pilot" ? B.hooks.pilot() : null;
      if (rocket) { if (t.kind === "pilot") { if (B.hooks.blast) B.hooks.blast(V3(q.x + (rnd() - .5) * 5, Math.max(0, q.y - 1), q.z + (rnd() - .5) * 5), 2.2, { team: v.side, pilot: 30 }); } else { if (t.kind === "titan") B.hooks.hurtTitan(t.ref, 45); else if (t.kind === "veh") damage(t.ref, 80, fu, "blast"); if (B.hooks.blast) B.hooks.blast(V3(q.x, Math.max(0, q.y - .8), q.z), 2.2, { team: v.side }); } }
      else if (t.kind === "pilot") { if (rnd() < .3 * clamp(1 - pl.speed / 15, .2, 1) * (pl.grounded ? 1 : .6)) B.hooks.hurtPilot(14); } else if (t.kind === "titan") B.hooks.hurtTitan(t.ref, 7); else if (t.kind === "veh") damage(t.ref, 16, fu); else if (rnd() < .6) damage(t.ref, 34, fu); }, rocket ? 600 : 300); }
}
const NAMES = { you: "your", foe: "their" };
function stepSquad(sq, dt) {
  const mem = sq.members.filter((g) => g.s.dead < 0); if (!mem.length && !(sq.veh && sq.veh.alive)) { sq.dead = true; return; }
  if (sq.veh) sq.c.copy(sq.veh.pos); else { sq.c.set(0, 0, 0); for (const g of mem) { sq.c.x += g.s.root.position.x / U; sq.c.z += g.s.root.position.z / U; } sq.c.divideScalar(mem.length); }
  sq.n = mem.length; sq.eng = sq.veh ? !!(sq.veh.tgt && tgtAlive(sq.veh.tgt)) : mem.some((g) => g.tgt && tgtAlive(g.tgt));
  sq.think -= dt; if (sq.auto && (sq.think <= 0 || !sq.order)) { sq.think = 5 + rnd() * 3; let best = -1e9, bi = 0;
    POINTS.forEach((p, i) => { const d = Math.hypot(p.x - sq.c.x, p.z - sq.c.z), mates = SQUADS.filter((o) => o !== sq && o.side === sq.side && !o.dead && o.order && o.order.type === "point" && o.order.i === i).length;
      const v = (p.owner === sq.side ? (p.n[other(sq.side)] > 0 ? 7 : 1 + (sq.order && sq.order.i === i ? 1.5 : 0)) : 10) - d * .035 - mates * 3 + (sq.order && sq.order.type === "point" && sq.order.i === i ? 2 : 0); if (v > best) { best = v; bi = i; } });
    if (!sq.order || sq.order.i !== bi) { sq.order = { type: "point", i: bi }; sq.path = legNodes(sq.c, V3(POINTS[bi].x + (rnd() - .5) * 6, 0, POINTS[bi].z + (rnd() - .5) * 6), !!sq.veh); } }
  const o = sq.order || { type: "move", pos: V3(RALLY[sq.side][0], 0, RALLY[sq.side][1]) }, fin = o.pos || V3(POINTS[o.i].x, 0, POINTS[o.i].z), reach = sq.veh ? 5.5 : 4.5;
  while (sq.path.length && Math.hypot(sq.path[0].x - sq.c.x, sq.path[0].z - sq.c.z) < (sq.path.length === 1 ? 6.5 : reach)) { sq.path.shift(); sq.nodeT = 0; }
  if (sq.path.length > 1 && Math.hypot(sq.path[0].x - sq.c.x, sq.path[0].z - sq.c.z) < 11 && !sq.eng) { sq.nodeT = (sq.nodeT || 0) + dt; if (sq.nodeT > 7) { sq.path.shift(); sq.nodeT = 0; } }   // close to a corner for a while without quite reaching it: on to the next
  sq.dest = sq.path.length ? sq.path[0] : fin; sq.arrived = !sq.path.length && Math.hypot(fin.x - sq.c.x, fin.z - sq.c.z) < 6.5;
  const where = o.type === "point" ? POINTS[o.i].name + ", the " + POINTS[o.i].label.toLowerCase() : null;
  sq.state = sq.eng ? (where ? (sq.arrived ? "Fighting on " : "Fighting on the way to ") + where : "Fighting") : sq.arrived ? (where ? (POINTS[o.i].owner === sq.side ? "Holding " : "Taking ") + where : "Holding position") : where ? "Moving to " + where + (sq.path.some((p) => p.stop) ? " by your stops" : "") : "Moving";
}
function stepPoints(dt) { const pl = B.hooks.pilot ? B.hooks.pilot() : null;
  for (const p of POINTS) { const n = { you: 0, foe: 0 }, near = (x, z) => Math.hypot(x - p.x, z - p.z) < 9;
    for (const side of ["you", "foe"]) { for (const g of arr(side)) if (g.s.dead < 0 && near(g.s.root.position.x / U, g.s.root.position.z / U)) n[side]++; for (const v of VEH) if (v.alive && v.side === side && near(v.pos.x, v.pos.z)) n[side] += 2; }
    if (pl && pl.alive && near(pl.at.x, pl.at.z)) n.you += pl.titan ? 3 : 2; for (const t of B.hooks.titans ? B.hooks.titans() : []) if (t.alive && !t.piloted && near(t.pos.x, t.pos.z)) n[t.team] += 3;
    p.n = n; const diff = clamp(n.you - n.foe, -3, 3); if (diff) p.prog = clamp(p.prog + diff * .055 * dt, -1, 1); else if (!n.you && !n.foe && p.owner) p.prog = clamp(p.prog + (p.owner === "you" ? 1 : -1) * .03 * dt, -1, 1);
    const was = p.owner; if (p.prog >= 1) p.owner = "you"; else if (p.prog <= -1) p.owner = "foe"; else if ((p.owner === "you" && p.prog <= 0) || (p.owner === "foe" && p.prog >= 0)) p.owner = null;
    if (was !== p.owner) { const c = COL[p.owner || "none"]; p.lamp.material.color.setRGB(...c); p.light.color.setRGB(c[0] / 3, c[1] / 3, c[2] / 3); if (p.owner && B.hooks.say) B.hooks.say(p.owner === "you" ? "Your side has taken point " + p.name + "." : "The enemy has taken point " + p.name + ".", 2.5); } }
}
// a commander that plays by a doctrine: what to bring in next, as supply allows
function command(side, dt) { B.ai[side] -= dt; if (B.ai[side] > 0) return; B.ai[side] = 1.5; const doc = B.doctrine[side]; if (doc === "manual") return;
  const U2 = FACTIONS[B.fac[side]].units, ids = B.list[side].filter((id) => U2[id]), inf = ids.filter((id) => !U2[id].veh), veh = ids.filter((id) => U2[id].veh); if (!ids.length) return;
  const k = B.turn[side], wantVeh = veh.length && aliveVeh(side) < 2 && (aliveInf(side) >= 3 || !inf.length) && (doc === "armor" ? k % 2 === 0 : doc === "mixed" ? k % 3 === 2 : false);
  const pool = wantVeh ? veh : inf.length ? inf : veh, id = pool[k % pool.length], def = U2[id];
  if (!room(side, def)) { if (wantVeh || !inf.length) B.turn[side]++; return; } if (aliveInf(side) < 3 && !def.veh && B.supply[side] < def.cost * 2 + 10) return;   // with almost nobody left, wait until two squads can go in together
  if (B.supply[side] >= def.cost) { deploy(side, id); B.turn[side]++; B.ai[side] = .4; } }
let tick = 0;
export function stepBattle(dt) { if (B.over) return; B.time += dt;
  for (const g of GRUNTS) stepSoldier(g, dt); for (const g of ALLIES) stepSoldier(g, dt); for (const v of VEH) stepVeh(v, dt);
  for (const L of [GRUNTS, ALLIES]) for (let i = L.length - 1; i >= 0; i--) if (L[i].gone) L.splice(i, 1);
  for (let i = VEH.length - 1; i >= 0; i--) if (!VEH[i].alive) VEH.splice(i, 1);
  for (let i = SQUADS.length - 1; i >= 0; i--) { stepSquad(SQUADS[i], dt); if (SQUADS[i].dead) { const k = MAP.sels.indexOf(SQUADS[i]); if (k >= 0) MAP.sels.splice(k, 1); SQUADS.splice(i, 1); } }
  stepPoints(dt); stepUtils(dt); command("you", dt); command("foe", dt);
  for (const side of ["you", "foe"]) B.supply[side] = Math.min(300, B.supply[side] + income(side) * dt);   // supply comes in steadily; the side that is behind is sent more
  tick += dt; if (tick >= 1) { tick -= 1; for (const side of ["you", "foe"]) { const own = POINTS.filter((p) => p.owner === side).length; B.score[side] += own * .5; }
    if (B.score.you >= GOAL || B.score.foe >= GOAL) { B.over = B.score.you >= B.score.foe ? "you" : "foe"; if (B.hooks.say) B.hooks.say(B.over === "you" ? "The field is yours. Press T to fight it again." : "The enemy holds the field. Press T to fight it again.", 0); } }
}
export function resetBattle() { for (const L of [GRUNTS, ALLIES]) { for (const g of L) if (!g.gone) { try { g.s.remove(); } catch (e) {} } L.length = 0; }
  for (const v of VEH) { if (v.mid) removeMachine(v.mid); else scene.remove(v.group); } VEH.length = 0; SQUADS.length = 0; MAP.sels = [];
  for (const p of POINTS) { p.prog = 0; p.owner = null; p.lamp.material.color.setRGB(...COL.none); p.light.color.setRGB(.5, .47, .4); }
  B.fac.you = LOAD.side; B.fac.foe = LOAD.side === "militia" ? "machine" : "militia"; B.list.you = LOAD.list[B.fac.you].slice(); B.list.foe = Object.keys(FACTIONS[B.fac.foe].units).filter((id) => !["technical", "jumps"].includes(id));
  B.doctrine.you = LOAD.doctrine; B.doctrine.foe = "mixed"; B.score.you = B.score.foe = 0; B.supply.you = B.supply.foe = 70; B.time = 0; B.over = null; B.turn.you = B.turn.foe = 0; B.ai.you = B.ai.foe = 2;
  for (const side of ["you", "foe"]) { const inf = B.list[side].filter((id) => !FACTIONS[B.fac[side]].units[id].veh); for (let i = 0; i < 3 && inf.length; i++) deploy(side, inf[i % inf.length], false); }
  for (const f of FALLS) scene.remove(f.mesh); FALLS.length = 0; for (const d of DOMES) scene.remove(d.mesh); DOMES.length = 0; for (const m of MEDS) scene.remove(m.mesh); MEDS.length = 0; for (const k in B.cd) B.cd[k] = 0; MAP.arm = null;
}

/* ---------- the commander's cards that are not troops ----------
   An air strike, a shield dome and a medical crate, each paid for in supply and each with a wait before it can be used
   again. Any infantry squad on your list can also be sent down in a drop pod onto a spot you pick, for more supply. */
export const UTILS = {
  strike: { name: "Air strike", icon: "✈", cost: 60, cd: 40, ask: "Click where the air strike should land.", desc: "Five bombs in a line across the spot you click. Kills infantry caught in the open and hurts armour and Titans." },
  shield: { name: "Shield dome", icon: "◠", cost: 40, cd: 35, ask: "Click where the shield should fall.", desc: "A dome 16 metres across that stands for 25 seconds. Fire from outside does much less to your troops inside it." },
  med: { name: "Medical drop", icon: "✚", cost: 30, cd: 30, ask: "Click where the medical crate should fall.", desc: "A crate that mends you and your troops within 9 metres for 20 seconds." } };
export const POD_EXTRA = 30;
B.cd = { strike: 0, shield: 0, med: 0 };
const FALLS = [], DOMES = [], MEDS = [];
export const domeAt = (x, z, side) => DOMES.some((d) => d.side === side && Math.hypot(x - d.x, z - d.z) < d.r);
const slab = (w, h, d, color, glow) => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), new THREE.MeshToonMaterial({ color })); m.position.y = h * U / 2; m.castShadow = true; g.add(m);
  if (glow) { const l = new THREE.Mesh(new THREE.BoxGeometry(w * U * 1.04, h * U * .16, d * U * 1.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(2.6) })); l.position.y = h * U * .62; g.add(l); } scene.add(g); return g; };
export function useUtil(kind, g, unit) { if (B.over) return false; let x = clamp(g.x, WORLD.x0 + 4, WORLD.x1 - 4), z = clamp(g.z, WORLD.z0 + 4, WORLD.z1 - 4);
  if (kind === "pod") { const def = FACTIONS[B.fac.you].units[unit]; if (!def || def.veh || B.supply.you < def.cost + POD_EXTRA || !room("you", def)) return false; [x, z] = nearestWalk(x, z); B.supply.you -= def.cost + POD_EXTRA;
    FALLS.push({ kind, x, z, t: 2.6, v: 90, unit, mesh: slab(2.1, 3.6, 2.1, "#3b4248", "#8fe0f0") }); ringFx(toU(V3(x, groundH(x, z) + .3, z)), "#8fe0f0", 4 * U, 2.6); if (B.hooks.say) B.hooks.say(def.name + " are coming down in a drop pod.", 2.5); return true; }
  const u = UTILS[kind]; if (!u || B.cd[kind] > 0 || B.supply.you < u.cost) return false; B.supply.you -= u.cost; B.cd[kind] = u.cd;
  if (kind === "strike") { const bx = x - BASE.you[0], bz = z - BASE.you[1], l = Math.hypot(bx, bz) || 1, px = -bz / l, pz = bx / l;   // the run crosses the line from your base to the spot
    ringFx(toU(V3(x, groundH(x, z) + .3, z)), "#ff7a3a", 12 * U, 2.4);
    for (let i = -2; i <= 2; i++) { const fx = x + px * i * 5.5, fz = z + pz * i * 5.5; FALLS.push({ kind: "bomb", x: fx, z: fz, t: 2.3 + (i + 2) * .17, v: 55, mesh: slab(.5, 1.3, .5, "#1c1b1a") }); }
    const pm = new THREE.Mesh(new THREE.ConeGeometry(2.6 * U, 11 * U, 4).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ color: "#23262a" })); pm.scale.set(2.4, .45, 1); pm.rotation.y = Math.atan2(px, pz); scene.add(pm);
    FALLS.push({ kind: "plane", x, z, px, pz, t: 2.3, mesh: pm }); if (B.hooks.say) B.hooks.say("Air strike on the way. Keep your people clear.", 2.5); return true; }
  [x, z] = nearestWalk(x, z); FALLS.push({ kind, x, z, t: 1.7, v: 70, mesh: kind === "shield" ? slab(1.1, 1.1, 1.1, "#3b4650", "#6fd8ff") : slab(1.5, 1, 1.1, "#d8d4c4", "#7dffa0") });
  if (B.hooks.say) B.hooks.say(kind === "shield" ? "Shield on the way." : "Medical crate on the way.", 2); return true; }
function landed(f) { const gy = groundH(f.x, f.z), at = V3(f.x, gy, f.z);
  if (f.kind === "bomb") { scene.remove(f.mesh); if (B.hooks.blast) B.hooks.blast(at, 6, { team: "you", titan: 110 }); return false; }
  if (f.kind === "pod") { if (B.hooks.blast) B.hooks.blast(at, 3, { team: "you", titan: 60 }); const sq = deploy("you", f.unit, false, [f.x, f.z]); if (sq && MAP.on) { MAP.sels = [sq]; } f.husk = 10; return true; }
  if (f.kind === "shield") { const dome = fxLayer(new THREE.Mesh(new THREE.SphereGeometry(8 * U, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#6fd8ff", transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    dome.position.set(f.x * U, (gy - 1) * U, f.z * U); scene.add(dome); DOMES.push({ x: f.x, z: f.z, r: 8, side: "you", t: 25, mesh: dome, box: f.mesh }); ringFx(toU(at).setY((gy + .3) * U), "#6fd8ff", 8 * U, .7); flash(toU(at).setY((gy + 3) * U), "#6fd8ff", 2600, .4); return false; }
  MEDS.push({ x: f.x, z: f.z, r: 9, t: 20, tick: 0, box: f.mesh }); ringFx(toU(at).setY((gy + .3) * U), "#7dffa0", 9 * U, .7); return false; }
function stepUtils(dt) { for (const k in B.cd) B.cd[k] = Math.max(0, B.cd[k] - dt);
  for (let i = FALLS.length - 1; i >= 0; i--) { const f = FALLS[i];
    if (f.husk) { f.husk -= dt; if (f.husk <= 0) { scene.remove(f.mesh); FALLS.splice(i, 1); } continue; }
    f.t -= dt; if (f.kind === "plane") { const s = (2.3 - f.t - 2.2) * 95; f.mesh.position.set((f.x + f.px * s) * U, (groundH(f.x, f.z) + 46) * U, (f.z + f.pz * s) * U); if (f.t < -2.4) { scene.remove(f.mesh); FALLS.splice(i, 1); } continue; }
    const gy = groundH(f.x, f.z); f.mesh.position.set(f.x * U, (gy + Math.max(0, f.t) * f.v) * U, f.z * U); if (f.t <= 0 && !landed(f)) FALLS.splice(i, 1); }
  for (let i = DOMES.length - 1; i >= 0; i--) { const d = DOMES[i]; d.t -= dt; d.mesh.material.opacity = (d.t < 3 ? .05 + .1 * (Math.sin(d.t * 14) * .5 + .5) : .13 + .04 * Math.sin(B.time * 3)); if (d.t <= 0) { scene.remove(d.mesh); scene.remove(d.box); DOMES.splice(i, 1); } }
  for (let i = MEDS.length - 1; i >= 0; i--) { const m = MEDS[i]; m.t -= dt; m.tick -= dt;
    if (m.tick <= 0) { m.tick = .5; let any = false; for (const g of ALLIES) if (g.s.dead < 0 && g.hp < g.sq.def.hp && Math.hypot(g.s.root.position.x / U - m.x, g.s.root.position.z / U - m.z) < m.r) { g.hp = Math.min(g.sq.def.hp, g.hp + 9); any = true; }
      const pl = B.hooks.pilot ? B.hooks.pilot() : null; if (pl && pl.alive && !pl.titan && Math.hypot(pl.at.x - m.x, pl.at.z - m.z) < m.r && B.hooks.healPilot && B.hooks.healPilot(7)) any = true;
      if (any || (m.t % 2) < .5) ringFx(V3(m.x * U, (groundH(m.x, m.z) + .3) * U, m.z * U), "#7dffa0", (any ? m.r : 3) * U, .6); }
    if (m.t <= 0) { scene.remove(m.box); MEDS.splice(i, 1); } } }

/* ---------- small pictures of each kind of unit, for the cards ---------- */
const THUMB = {}, tScene = new THREE.Scene(), tCam = new THREE.PerspectiveCamera(28, .8, 1, 4000), tRT = new THREE.WebGLRenderTarget(96, 120);
tScene.add(new THREE.HemisphereLight("#fff4e0", "#5a4a3c", 1.5)); { const d = new THREE.DirectionalLight("#fff0d8", 2.4); d.position.set(-.5, 1, .8); tScene.add(d); }
export function thumbOf(fac, id, side) { const key = fac + id + side; if (THUMB[key] !== undefined) return THUMB[key]; THUMB[key] = ""; try {
  const def = FACTIONS[fac].units[id]; let obj, done = () => {};
  if (def.veh) { obj = genModel(def.veh.model); tScene.add(obj); done = () => tScene.remove(obj); }
  else { const gun = def.guns[0], s = SOL.make({ x: 0, z: 0, yaw: 0, weapon: gun, role: gun === "lmg" ? "gunner" : gun === "dmr" ? "marksman" : "rifleman", camo: fac === "militia" ? "multicam" : "urban", seed: 77 });
    if (def.mech && window.CBMech) window.CBMech.dress(s, def.mech, THREE, charMat, { scheme: side === "you" ? "worn" : "steel" });
    tScene.add(s.root); SOL.update(.03); SOL.update(.03); obj = s.root; done = () => { tScene.remove(s.root); s.remove(); }; }
  obj.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(obj), c = bx.getCenter(V3()), sz = bx.getSize(V3()), r = Math.max(sz.y * 1.02, sz.x * 1.3, sz.z * .9);
  tCam.position.set(c.x + r * .9, c.y + r * .35, c.z + r * 1.9); tCam.lookAt(c); tCam.updateMatrixWorld();
  const was = renderer.getRenderTarget(), col = renderer.getClearColor(new THREE.Color()), al = renderer.getClearAlpha();
  renderer.setRenderTarget(tRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(tScene, tCam); const px = new Uint8Array(96 * 120 * 4); renderer.readRenderTargetPixels(tRT, 0, 0, 96, 120, px);
  renderer.setRenderTarget(was); renderer.setClearColor(col, al); done();
  const cv = document.createElement("canvas"); cv.width = 96; cv.height = 120; const g = cv.getContext("2d"), im = g.createImageData(96, 120);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 96; x++) { const i = ((119 - y) * 96 + x) * 4, o = (y * 96 + x) * 4; for (let k = 0; k < 3; k++) im.data[o + k] = Math.min(255, Math.pow(px[i + k] / 255, 1 / 2.2) * 255); im.data[o + 3] = px[i + 3] > 0 ? 255 : 0; }
  g.putImageData(im, 0, 0); THUMB[key] = cv.toDataURL("image/png"); } catch (e) { console.warn("[thumb]", id, e); } return THUMB[key]; }

/* ---------- the battle map: the yard from above, with everything you command marked on it ----------
   Left click a card to pick a squad, or drag a box round several. With squads picked, left click the ground or a point
   to send them there by the quickest way. Hold Shift and each click adds a stop on the way instead; let go of Shift and
   click where they should end up. Right drag moves the map, middle drag turns it. */
export const MAP = { on: false, auto: false, tx: 0, tz: 4, dist: 120, ang: 0, tilt: .8, sels: [], keys: {}, drag: null, arm: null };
const mapEl = $("map"), mkEl = $("map-marks"), svg = $("map-svg"), boxEl = $("map-box");
export function setMap(on, auto = false) { MAP.on = on; MAP.auto = on && auto; MAP.drag = null; boxEl.style.display = "none"; mapEl.style.display = on ? "block" : "none"; if (on) { const pl = B.hooks.pilot(); MAP.tx = clamp(pl.at.x * .6, -90, 90); MAP.tz = clamp(pl.at.z * .6, -110, 80); MAP.arm = null; deckKey = ""; drawDeck(); } }
export function mapCamera(dt) { const k = MAP.keys, sp = MAP.dist * .9 * dt, s = Math.sin(MAP.ang), c = Math.cos(MAP.ang), f = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0), r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  if (k.Escape) { if (MAP.arm) MAP.arm = null; else MAP.sels = []; k.Escape = false; deckKey = ""; }
  MAP.tx = clamp(MAP.tx + (r * c + f * s) * sp, WORLD.x0, WORLD.x1); MAP.tz = clamp(MAP.tz + (f * c - r * s) * sp, WORLD.z0, WORLD.z1); MAP.ang += ((k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)) * 1.4 * dt;
  const hz = Math.sqrt(Math.max(.05, 1 - MAP.tilt * MAP.tilt)); const gy = groundH(MAP.tx, MAP.tz); cam.position.set((MAP.tx + s * MAP.dist * hz) * U, (gy + MAP.dist * MAP.tilt) * U, (MAP.tz + c * MAP.dist * hz) * U); cam.lookAt(MAP.tx * U, gy * U, MAP.tz * U); if (Math.abs(cam.fov - 46) > .05) { cam.fov = 46; cam.updateProjectionMatrix(); } }
const _v = V3(), scr = (x, y, z) => { _v.set(x * U, (y + groundH(x, z)) * U, z * U).project(cam); return [(_v.x * .5 + .5) * innerWidth, (-_v.y * .5 + .5) * innerHeight, _v.z < 1]; };
function groundAt(mx, my) { const o = cam.position.clone(), d = V3(mx / innerWidth * 2 - 1, -(my / innerHeight) * 2 + 1, .5).unproject(cam).sub(o).normalize(); if (d.y >= -.01) return null; o.divideScalar(U); for (let t = 0; t < 700; t += 2) { if (o.y + d.y * t < groundH(o.x + d.x * t, o.z + d.z * t)) { let a = Math.max(0, t - 2), b = t; for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (o.y + d.y * m < groundH(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } return V3(o.x + d.x * b, 0, o.z + d.z * b); } } return null; }
const spotted = (sq) => sq.side === "you" || SQUADS.some((o) => o.side === "you" && o.c.distanceTo(sq.c) < 70) || Math.hypot(B.hooks.pilot().at.x - sq.c.x, B.hooks.pilot().at.z - sq.c.z) < 70 || (B.hooks.titans().some((t) => t.team === "you" && t.pos.distanceTo(sq.c) < 50));
// the way a squad will go, for drawing: from where it is, through each node of its orders, in straight lines
const routeOf = (sq) => [[sq.c.x, sq.c.z], ...sq.path.map((p) => [p.x, p.z])];
const marks = new Map(); let markT = 0, live = new Set();
function mark(key, x, y, z, cls, html) { const [sx, sy, ok] = scr(x, y, z); let el = marks.get(key); if (!ok) { if (el) el.style.display = "none"; return null; } if (!el) { el = document.createElement("div"); mkEl.append(el); marks.set(key, el); }
  live.add(key); el.style.display = ""; if (el._c !== cls) { el.className = "mk " + cls; el._c = cls; } if (el._h !== html) { el.innerHTML = html; el._h = html; } el.style.left = (sx | 0) + "px"; el.style.top = (sy | 0) + "px"; return [sx, sy]; }
export function mapFrame(dt) { cam.updateMatrixWorld(); live = new Set(); const way = !!(MAP.keys.ShiftLeft || MAP.keys.ShiftRight) && MAP.sels.length > 0;
  const arm = MAP.arm; $("map-mode").style.display = way || arm ? "block" : "none"; $("map-mode").textContent = arm ? (arm.kind === "pod" ? "Click where the drop pod should land." : UTILS[arm.kind].ask) + " Esc to call it off." : "Stops: each click adds a stop on the way. Let go of Shift and click where they should end up."; mapEl.style.cursor = arm ? "copy" : way ? "cell" : "crosshair";
  for (const p of POINTS) mark("p" + p.name, p.x, 6, p.z, "pt " + (p.owner || "none"), `<b>${p.name}</b><span class="pl">${p.label}</span><i><u style="width:${Math.round(Math.abs(p.prog) * 100)}%;background:${p.prog > 0 ? "#8fe0f0" : "#e05a3a"}"></u></i>`);
  for (const sq of SQUADS) { if (!spotted(sq)) continue; const sel = MAP.sels.includes(sq), mine = sq.side === "you", th = thumbOf(B.fac[sq.side], Object.keys(FACTIONS[B.fac[sq.side]].units).find((k) => FACTIONS[B.fac[sq.side]].units[k] === sq.def), sq.side);
    const at = mark("s" + sq.id, sq.c.x, sq.veh ? 3.2 : 2.7, sq.c.z, "card " + sq.side + (sel ? " sel" : ""), `${th ? `<img src="${th}">` : `<b>${sq.def.icon}</b>`}<span><strong>${sq.name}</strong>${sq.veh ? "" : ` <q>${"▮".repeat(sq.n)}</q>`}${mine ? `<em>${sq.state}</em>` : ""}</span>`); sq.scr = at; }
  const pl = B.hooks.pilot(); if (pl.alive) mark("hero", pl.at.x, 2.4, pl.at.z, "hero", `<b>◆</b><span>You${pl.titan ? ", in your Titan" : ""}</span>`);
  for (const t of B.hooks.titans()) if (t.alive && !t.piloted && (t.team === "you" || spotted({ side: "foe", c: t.pos }))) mark("t" + t.team, t.pos.x, 6.5, t.pos.z, t.team + " veh", `<b>▲</b><span>${t.team === "you" ? "Your Titan, standing guard" : "Enemy Titan"}</span>`);
  for (const [k, el] of marks) if (!live.has(k)) { el.remove(); marks.delete(k); }
  // the picked squads: a ring under each, and one clear line along the way it will take, with its stops numbered
  let h = ""; for (const s of MAP.sels) { const [cx, cy, ok] = scr(s.c.x, .1, s.c.z); if (ok) h += `<ellipse cx="${cx | 0}" cy="${cy | 0}" rx="26" ry="12" class="ring"/>`;
    const pts = routeOf(s).map(([x, z]) => scr(x, .2, z)).filter((p) => p[2]); if (pts.length > 1) h += `<polyline points="${pts.map((p) => (p[0] | 0) + "," + (p[1] | 0)).join(" ")}" class="way under"/><polyline points="${pts.map((p) => (p[0] | 0) + "," + (p[1] | 0)).join(" ")}" class="way"/>`;
    s.path.filter((p) => p.stop).forEach((p, i) => { const [x, y, k] = scr(p.x, .2, p.z); if (k) h += `<circle cx="${x | 0}" cy="${y | 0}" r="9" class="stop"/><text x="${x | 0}" y="${(y | 0) + 4}" class="num">${i + 1}</text>`; });
    const o = s.order, f = o ? (o.pos || POINTS[o.i]) : null; if (f) { const [x, y, k] = scr(f.x, .2, f.z); if (k) h += `<path d="M${x - 9} ${y}L${x} ${y - 9}L${x + 9} ${y}L${x} ${y + 9}Z" class="end"/>`; } }
  svg.innerHTML = h;
  markT -= dt; if (markT <= 0) { markT = .2; drawDeck(); }
  const sup = B.supply.you; $("sup-fill").style.width = sup / 3 + "%"; $("sup-n").textContent = Math.floor(sup);
}
export const income = (side) => (B.over ? 0 : 2.4 + POINTS.filter((p) => p.owner === side).length * .3 + POINTS.filter((p) => p.owner === other(side)).length * .8);
let deckKey = "";
function drawDeck() { const side = B.fac.you, Un = FACTIONS[side].units, S = MAP.sels, pl = B.hooks.pilot();
  $("map-top").innerHTML = `<b class="you">YOU ${Math.floor(B.score.you)}</b> ${POINTS.map((p) => `<i class="${p.owner || "none"}">${p.name}</i>`).join("")} <b class="foe">${Math.floor(B.score.foe)} THEM</b> <span>first to ${GOAL}</span>${pl.dead > 0 ? ` <span class="warn">You are down. Back in ${pl.dead.toFixed(1)} s</span>` : ""}`;
  $("sup-rate").textContent = "+" + income("you").toFixed(1) + " each second";
  const ticks = B.list.you.map((id) => `<s style="left:${Un[id].cost / 3}%" title="${Un[id].name}"><b>${Un[id].icon}</b></s>`).join(""); if ($("sup-ticks")._h !== ticks) { $("sup-ticks").innerHTML = ticks; $("sup-ticks")._h = ticks; }
  const dk = B.doctrine.you + "|" + Object.keys(UTILS).map((k) => Math.ceil(B.cd[k]) + (B.supply.you >= UTILS[k].cost ? "y" : "n")).join("") + (MAP.arm ? MAP.arm.kind + (MAP.arm.unit || "") : "") + B.list.you.map((id) => (B.supply.you >= Un[id].cost + POD_EXTRA ? "p" : "")).join("") + B.list.you.map((id) => (B.supply.you >= Un[id].cost ? 1 : 0) + (room("you", Un[id]) ? "r" : "f")).join("") + (B.over || "");
  if (dk !== deckKey) { deckKey = dk; $("map-doc").innerHTML = Object.entries(DOCTRINES).map(([k, [n]]) => `<button data-doc="${k}" class="${B.doctrine.you === k ? "on" : ""}" title="${DOCTRINES[k][1]}">${n}</button>`).join("");
    $("map-deck").innerHTML = B.list.you.map((id) => { const d = Un[id], rm = room("you", d) && !B.over, ok = B.supply.you >= d.cost && rm, okP = !d.veh && B.supply.you >= d.cost + POD_EXTRA && rm, th = thumbOf(side, id, "you"), armed = MAP.arm && MAP.arm.kind === "pod" && MAP.arm.unit === id;
      return `<div class="dcard ${ok ? "" : "off"}${armed ? " arm" : ""}">${th ? `<img src="${th}">` : `<b>${d.icon}</b>`}<span><strong>${d.name}</strong><small>${d.veh ? "Vehicle" : d.guns.length + " troops"} · ${d.cost} supply</small><em>${ok ? "Ready" : !rm ? "The field is full" : "Not enough supply"}</em><span class="dbs"><button class="db ${ok ? "" : "off"}" data-dep="${id}" title="Bring them on at your base.">Deploy</button>${d.veh ? "" : `<button class="db pod ${okP ? "" : "off"}" data-pod="${id}" title="Drop this squad from above onto a spot you click. Costs ${POD_EXTRA} more supply.">Drop pod +${POD_EXTRA}</button>`}</span></span></div>`; }).join("");
    $("map-util").innerHTML = Object.entries(UTILS).map(([k, u]) => { const cd = Math.ceil(B.cd[k]), ok = cd <= 0 && B.supply.you >= u.cost && !B.over; return `<button class="ucard ${ok ? "" : "off"}${MAP.arm && MAP.arm.kind === k ? " arm" : ""}" data-util="${k}" title="${u.desc}"><b>${u.icon}</b><span><strong>${u.name}</strong><small>${cd > 0 ? "Ready in " + cd + " s" : u.cost + " supply"}</small></span></button>`; }).join(""); }
  const selH = S.length === 1 ? `<strong>${S[0].name}${S[0].veh ? "" : " ×" + S[0].n}</strong><p>${S[0].state}.</p><p class="dim">${S[0].auto ? "This squad is choosing its own points." : "This squad is following your order."}</p>` : S.length ? `<strong>${S.length} squads picked</strong><p class="dim">${S.map((s) => s.name).join(", ")}</p>` :
    `<strong>No squad picked</strong><p class="dim">Left click a squad's card to pick it, or drag a box round several. Then left click where they should go. Hold Shift to add stops on the way.</p>`;
  const full = selH + (S.length ? `<div><button data-act="auto" class="${S.every((s) => s.auto) ? "on" : ""}">Choose their own</button><button data-act="hold">Hold here</button><button data-act="clear">Forget the stops</button><button data-act="none">Let go</button></div>` : ""); if ($("map-sel")._h !== full) { $("map-sel").innerHTML = full; $("map-sel")._h = full; }
}
// Send the picked squads to exactly where was clicked. With Shift each click is a stop on the way; the squads go from
// node to node in straight lines, and only a line that is blocked gets corners added to take it round.
function orderTo(g, way) { g.x = clamp(g.x, WORLD.x0 + 2, WORLD.x1 - 2); g.z = clamp(g.z, WORLD.z0 + 2, WORLD.z1 - 2); const i = POINTS.findIndex((p) => Math.hypot(p.x - g.x, p.z - g.z) < 8);
  for (const s of MAP.sels) { s.auto = false; if (!s.fresh) s.path = []; const start = s.path.length ? s.path[s.path.length - 1] : s.c, nodes = legNodes(start, g, !!s.veh), end = nodes[nodes.length - 1]; if (way) end.stop = true; s.path.push(...nodes); s.fresh = way;
    s.order = !way && i >= 0 ? { type: "point", i, pos: end.clone() } : { type: "move", pos: end.clone() }; for (const m of s.members) m.moveT = 0; } drawDeck(); }
mapEl.addEventListener("contextmenu", (e) => e.preventDefault());
mapEl.addEventListener("wheel", (e) => { MAP.dist = clamp(MAP.dist * Math.exp(e.deltaY * .0012), 24, 300); e.preventDefault(); }, { passive: false });
mapEl.addEventListener("mousedown", (e) => { const b = e.target.closest("button");
  if (b) { if (b.dataset.dep) { deploy("you", b.dataset.dep); deckKey = ""; } else if (b.dataset.pod) { MAP.arm = b.classList.contains("off") ? null : { kind: "pod", unit: b.dataset.pod }; deckKey = ""; } else if (b.dataset.util) { MAP.arm = b.classList.contains("off") ? null : { kind: b.dataset.util }; deckKey = ""; } else if (b.dataset.doc) { B.doctrine.you = LOAD.doctrine = b.dataset.doc; saveLoad(); deckKey = ""; } else if (b.dataset.act) { const a = b.dataset.act; if (a === "none") MAP.sels = []; for (const s of MAP.sels) { if (a === "auto") { s.auto = true; s.think = 0; s.path = []; } else if (a === "hold") { s.auto = false; s.order = { type: "move", pos: s.c.clone() }; s.path = []; } else s.path = []; s.rk = ""; } } drawDeck(); return; }
  if (e.target.closest("#map-top, #map-bottom, #map-sel, #map-supply")) return; e.preventDefault();
  MAP.drag = { b: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }; });
addEventListener("mousemove", (e) => { const d = MAP.drag; if (!MAP.on || !d) return; const dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
  if (d.b === 2) { const k = MAP.dist / innerHeight * 1.25, s = Math.sin(MAP.ang), c = Math.cos(MAP.ang); MAP.tx = clamp(MAP.tx - (dx * c + dy * s) * k, WORLD.x0, WORLD.x1); MAP.tz = clamp(MAP.tz - (dy * c - dx * s) * k, WORLD.z0, WORLD.z1); }
  else if (d.b === 1) { MAP.ang -= dx * .006; MAP.tilt = clamp(MAP.tilt + dy * .003, .35, .97); }
  else if (d.b === 0 && d.moved) { boxEl.style.display = "block"; boxEl.style.left = Math.min(d.x, e.clientX) + "px"; boxEl.style.top = Math.min(d.y, e.clientY) + "px"; boxEl.style.width = Math.abs(e.clientX - d.x) + "px"; boxEl.style.height = Math.abs(e.clientY - d.y) + "px"; } });
addEventListener("mouseup", (e) => { const d = MAP.drag; if (!MAP.on || !d) return; MAP.drag = null; boxEl.style.display = "none"; if (d.b !== 0) return;
  if (d.moved) { const x0 = Math.min(d.x, e.clientX), x1 = Math.max(d.x, e.clientX), y0 = Math.min(d.y, e.clientY), y1 = Math.max(d.y, e.clientY); MAP.sels = SQUADS.filter((s) => s.side === "you" && s.scr && s.scr[0] > x0 && s.scr[0] < x1 && s.scr[1] - 20 > y0 - 30 && s.scr[1] - 20 < y1 + 30); drawDeck(); return; }
  // a click: on a card it picks that squad; anywhere else it sends the picked squads there
  let pick = null, best = 1e9; for (const s of SQUADS) { if (s.side !== "you" || !s.scr) continue; const ox = e.clientX - s.scr[0], oy = e.clientY - s.scr[1]; if (Math.abs(ox) < 78 && oy > -58 && oy < 6) { const dd = Math.abs(ox) + Math.abs(oy + 26); if (dd < best) { best = dd; pick = s; } } }
  if (MAP.arm) { const g = groundAt(e.clientX, e.clientY); if (g && useUtil(MAP.arm.kind, g, MAP.arm.unit)) { MAP.arm = null; deckKey = ""; drawDeck(); } return; }
  if (pick) { MAP.sels = [pick]; drawDeck(); return; }
  if (MAP.sels.length) { const g = groundAt(e.clientX, e.clientY); if (g) orderTo(g, e.shiftKey); } });
