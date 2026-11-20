/* Machine-Fall FPS, prototype 5: the battle.
   Two sides fight over five points across a town, a refinery and the hills above them. Each side has a commander who spends supply to bring
   squads and vehicles onto the field from an army list, and gives them orders. The player is one of the commanders, and is
   also on the field as a pilot. The other commander is the machine in this file.
   The Frontier Militia are the Table's soldiers; the Machine's infantry are the Table's machine troopers (cb/cbmech.js) on
   the same skeleton. Vehicles are the Table's generated models; the Machine's walk and track on their own rigs.
   Everything here is in metres; the engine draws at U. */
import { THREE, U, clamp, lerp, V3, rnd, $, scene, cam, renderer, charMat, free, freeG, groundH, slopeAt, WORLD, SITES, PLAN, rayBox, rayWorld, SOL, GEN, MACH, placeMachine, removeMachine, mfx, genModel, flash, puff, ringFx, tracer, fxLayer } from "./engine.js";

const toU = (v) => V3(v.x * U, v.y * U, v.z * U);
const WPN = { rifle: { range: 48, dmg: 22, burst: 3, acc: .5, cd: [1.4, 2.4] }, lmg: { range: 52, dmg: 16, burst: 6, acc: .42, cd: [1.6, 2.4] }, dmr: { range: 75, dmg: 48, burst: 1, acc: .7, cd: [1.6, 2.2] }, shotgun: { range: 16, dmg: 50, burst: 1, acc: .75, cd: [1.1, 1.6] }, at: { range: 62, dmg: 20, burst: 1, acc: .6, cd: [3.2, 4.4], titan: 30, veh: 5 } };
/* The cards. cost is Command Points in the fight, sup is the supply the squad holds while it lives, pts is what the card
   costs in the 100-point battlegroup (cost divided by ten). capw is how much one trooper counts on a point. core marks
   the Core Infantry the Attrition Wave doctrine pays back. militia is the Frontier Coalition, machine the Core Directorate. */
export const FACTIONS = {
  militia: { name: "Frontier Coalition", blurb: "The outer settlements. Hit and run, salvage and stubbornness.", units: {
    assault: { name: "Assault Infantry", icon: "A", guns: ["rifle", "rifle", "rifle", "rifle"], hp: 60, cost: 100, sup: 3, pts: 10, capw: .3, core: true, desc: "Four militia with rifles. They take points faster than anything else you have." },
    breachers: { name: "Heavy Breachers", icon: "B", guns: ["lmg", "shotgun"], hp: 200, cost: 180, sup: 4, pts: 18, capw: .4, desc: "Two heavies in armour. Slow to put down, and they hold a doorway." },
    antiarmor: { name: "Anti-Armor Team", icon: "R", guns: ["at", "at"], hp: 90, cost: 200, sup: 4, pts: 20, capw: .1, desc: "Two rocket troopers. They make a Titan back off a lane. Weak to a pilot who gets round them." },
    skirmishers: { name: "Saboteur Skirmishers", icon: "S", guns: ["rifle", "rifle", "shotgun"], hp: 75, cost: 160, sup: 3, pts: 16, capw: .3, desc: "Three fast saboteurs. Coalition only. Good on a point, thin under fire." },
    turret: { name: "Auto-Turret Pod", icon: "T", veh: { build: "turret", static: true, hp: 350, speed: 0, r: .9, gun: "mg", range: 25 }, cost: 150, sup: 3, pts: 15, desc: "A gun on legs that you drop where you want it. It watches 25 metres around itself. Good in a hall or on a flank." },
    beacon: { name: "Forward Drop Beacon", icon: "F", veh: { build: "beacon", static: true, beacon: true, hp: 350, speed: 0, r: .7 }, cost: 220, sup: 3, pts: 22, desc: "While it stands, the squads you and your side deploy arrive beside it. It is spent after three squads." },
    drones: { name: "Support Drone Pair", icon: "D", veh: { build: "drones", hover: 2.4, drone: true, nocap: true, hp: 200, speed: 7.5, r: .6 }, cost: 160, sup: 3, pts: 16, desc: "Two drones that fly with your nearest squad, mend troops within 10 metres and show you enemy squads within 30. Send them somewhere and they hold there instead." },
    miner: { name: "Salvage Mine-Layer Drone", icon: "M", veh: { build: "miner", hover: 2, miner: true, nocap: true, hp: 120, speed: 6, r: .6 }, cost: 170, sup: 3, pts: 17, desc: "A drone that flies to where you send it and back, leaving up to four mines behind it. Coalition only. A mine goes off under the first enemy to come within a few steps." } } },
  machine: { name: "Core Directorate", blurb: "The central government. Drilled troops, heavy shields and weight of fire.", units: {
    assault: { name: "Assault Infantry", icon: "A", guns: ["rifle", "rifle", "rifle", "rifle"], mech: "light", hp: 60, cost: 100, sup: 3, pts: 10, capw: .3, core: true, desc: "Four troopers with rifles. They take points faster than anything else you have." },
    breachers: { name: "Heavy Breachers", icon: "B", guns: ["lmg", "shotgun"], mech: "heavy", hp: 200, cost: 180, sup: 4, pts: 18, capw: .4, desc: "Two Stalkers in full plate. Slow to put down, and they hold a doorway." },
    antiarmor: { name: "Anti-Armor Team", icon: "R", guns: ["at", "at"], mech: "medium", hp: 90, cost: 200, sup: 4, pts: 20, capw: .1, desc: "Two rocket troopers. They make a Titan back off a lane. Weak to a pilot who gets round them." },
    aegis: { name: "Aegis Shield Squad", icon: "G", guns: ["rifle", "rifle", "rifle"], mech: "medium", hp: 120, shield: 250, cost: 220, sup: 4, pts: 22, capw: .3, desc: "Three troopers behind energy shields that stop 250 damage from the front. Directorate only. Go round them." },
    turret: { name: "Auto-Turret Pod", icon: "T", veh: { build: "turret", static: true, hp: 350, speed: 0, r: .9, gun: "mg", range: 25 }, cost: 150, sup: 3, pts: 15, desc: "A gun on legs that you drop where you want it. It watches 25 metres around itself. Good in a hall or on a flank." },
    beacon: { name: "Forward Drop Beacon", icon: "F", veh: { build: "beacon", static: true, beacon: true, hp: 350, speed: 0, r: .7 }, cost: 220, sup: 3, pts: 22, desc: "While it stands, the squads you and your side deploy arrive beside it. It is spent after three squads." },
    drones: { name: "Support Drone Pair", icon: "D", veh: { build: "drones", hover: 2.4, drone: true, nocap: true, hp: 200, speed: 7.5, r: .6 }, cost: 160, sup: 3, pts: 16, desc: "Two drones that fly with your nearest squad, mend troops within 10 metres and show you enemy squads within 30. Send them somewhere and they hold there instead." },
    recon: { name: "Orbital Recon Pod", icon: "O", veh: { build: "recon", static: true, recon: true, hp: 400, speed: 0, r: .8 }, cost: 180, sup: 2, pts: 18, desc: "A sensor pod. Directorate only. Enemy squads within 35 metres of it show on your map." } } },
};
export const PASSIVES = { combined: ["Combined Arms", "Your troops within 20 metres of you take points a quarter faster and take 15 percent less damage."], shock: ["Shock Drop", "Your drop pods land 30 percent sooner."], logistics: ["Mechanized Logistics", "Your support cards cost 15 percent less."], attrition: ["Attrition Wave", "When one of your Assault Infantry squads is wiped out, you get a fifth of its cost back."] };
export const CP0 = 150, CPMAX = 600, CPRATE = 6, SUPCAP = 10, LIST_MAX = 6;
export const DOCTRINES = { manual: ["Manual", "You bring in every squad yourself and they wait for your orders."], rush: ["Infantry rush", "Infantry as fast as supply allows, sent at the nearest point you do not hold."], armor: ["Armor support", "Vehicles first, with infantry to hold what they take."], mixed: ["Mixed", "Two squads of infantry for every vehicle."] };
export const LIST_PTS = 100, GOAL = 400;
export const LOAD = { side: "militia", weapon: "carbine", chassis: "vanguard", paint: "#c45a1e", doctrine: "manual", passive: "combined", kit: "grapple", anti: "rail", ord: "frag", v: 2, tags: { militia: {}, machine: {} }, list: { militia: ["assault", "breachers", "antiarmor", "skirmishers", "turret"], machine: ["assault", "breachers", "antiarmor", "aegis", "turret"] } };
try { const s = JSON.parse(localStorage.getItem("mf-fps-load") || "null"); if (s) { if (s.v !== 2) { s.doctrine = "manual"; s.v = 2; } Object.assign(LOAD, s); LOAD.list = { ...LOAD.list, ...(s.list || {}) }; } } catch (e) {}
for (const f in FACTIONS) { LOAD.list[f] = (LOAD.list[f] || []).filter((id) => FACTIONS[f].units[id]).slice(0, LIST_MAX); if (!LOAD.list[f].length) LOAD.list[f] = Object.keys(FACTIONS[f].units); } if (!PASSIVES[LOAD.passive]) LOAD.passive = "combined"; LOAD.tags = { militia: {}, machine: {}, ...(LOAD.tags || {}) }; if (!["grapple", "stim", "sonar", "phase", "decoy"].includes(LOAD.kit)) LOAD.kit = "grapple"; if (LOAD.anti !== "seeker") LOAD.anti = "rail"; if (LOAD.ord !== "arc") LOAD.ord = "frag";
export const saveLoad = () => { try { localStorage.setItem("mf-fps-load", JSON.stringify(LOAD)); } catch (e) {} };

export const GRUNTS = [], ALLIES = [], VEH = [], SQUADS = [], POINTS = [];
export const B = { fac: { you: "militia", foe: "machine" }, list: { you: [], foe: [] }, doctrine: { you: "mixed", foe: "mixed" }, score: { you: 0, foe: 0 }, supply: { you: 0, foe: 0 }, time: 0, over: null, hooks: {}, away: {}, mp: null, roster: null, duo: false, cmds: ["you", "foe"], side: { you: "you", foe: "foe" }, cap: { inf: 18, veh: 3 }, share: 1, cd: {}, n: 0, ai: { you: 0, foe: 0 }, turn: { you: 0, foe: 0 } };
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
for (const [name, x, z, label, sector = 0, roof = 0] of SITES) { const gy = groundH(x, z);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(.5 * U, .5 * U, .5 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL.none) })); lamp.position.set(x * U, (gy + 5.2) * U, z * U);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(.14 * U, 5 * U, .14 * U), new THREE.MeshToonMaterial({ color: "#2a2724" })); pole.position.set(x * U, (gy + 2.5) * U, z * U); pole.castShadow = true;
  const ring = fxLayer(new THREE.Mesh(new THREE.RingGeometry(8.6 * U, 9 * U, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lamp.material.color, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }))); ring.position.set(x * U, gy * U + 3, z * U);
  const light = new THREE.PointLight("#ffffff", 900, 300, 1.5); light.position.set(x * U, (gy + 4.6) * U, z * U);
  scene.add(lamp, pole, ring, light); POINTS.push({ name, label, x, z, sector, roof: !!roof, prog: 0, owner: null, lamp, light, n: { you: 0, foe: 0 }, w: { you: 0, foe: 0 } });
}

/* ---------- the operation: one side attacks through the sectors in turn, the other holds them ----------
   Only the points of the active sector can change hands. When the attackers hold all of them the sector falls, the
   defenders get 40 seconds to fall back, and the next sector opens. The attackers have tickets: a pilot coming back costs
   one (or, with no pilots on that side, a bought squad wiped costs one and a Titan lost costs three). At no tickets the
   first battalion is spent and a second comes in where the first stopped. When the second is spent the defenders have won. */
B.stats = { stuck: 0, moved: 0, repath: 0 };
export const OP = { atk: PLAN ? PLAN.atk : "you", sector: 0, tickets: 30, max: 30, batt: 1, phase: "fight", t: 0, wave: 4, ot: 0, ai: false };
export const SECN = 1 + Math.max(0, ...SITES.map((q) => q[4] || 0)), ATK = PLAN ? PLAN.atk : "you", HOMES = PLAN ? PLAN.homes : [{ atk: [0, 126], def: [0, -152] }];
const say = (t, n) => { if (B.hooks.say) B.hooks.say(t, n); };
/* Can troops get where the operation needs them? From each side's way in to every point of every sector, on foot,
   and for the open points by vehicle too. Returns what failed, as short lines. */
export function fieldTest() { const bad = [], walk = (a, b, G) => { const [ax, az] = nearestWalk(a[0], a[1], G), [bx, bz] = nearestWalk(b[0], b[1], G); if (Math.hypot(bx - b[0], bz - b[1]) > (G === PASS ? 9 : 3.5) || Math.hypot(ax - a[0], az - a[1]) > 8) return false; return segClear(ax, az, bx, bz, G) || !!astar(cj(az) * NX + ci(ax), cj(bz) * NX + ci(bx), G); };
  HOMES.forEach((h, k) => { for (const p of POINTS) if (p.sector === k) for (const [who, at] of [["attackers", h.atk], ["defenders", h.def]]) { if (!walk(at, [p.x, p.z], WALK)) bad.push(p.name + ": " + who + " cannot walk in"); else if (!p.roof && !walk(at, [p.x, p.z], PASS)) bad.push(p.name + ": " + who + " cannot drive in"); } }); return bad; }
export function setHomes() { const k = Math.min(OP.sector, SECN - 1), kd = Math.min(SECN - 1, k + (OP.phase === "retreat" ? 1 : 0)), fix = (p, raw) => (raw ? p.slice() : nearestWalk(p[0], p[1])), pa = fix(HOMES[k].atk, k === 0), pd = fix(HOMES[kd].def, kd === SECN - 1), d = other(ATK);
  BASE[ATK] = pa; RALLY[ATK] = pa; BASE[d] = pd; RALLY[d] = pd; }
export const homeOf = (side) => BASE[side];   // side as the map has it: "you" is the south end
export function spend(side, n = 1) { if (B.mp === "guest" || B.over || side !== OP.atk || OP.phase !== "fight") return; OP.tickets = Math.max(0, OP.tickets - n); }
const tgtSector = (side) => (OP.phase === "retreat" && side !== OP.atk ? Math.min(SECN - 1, OP.sector + 1) : OP.sector);
function sectorFalls() { const a = OP.atk; if (OP.sector >= SECN - 1) { B.over = a; say(a === "you" ? "The citadel is yours. The operation is won. Press T to fight it again." : "The citadel has fallen. The operation is lost. Press T to fight it again.", 0); return; }
  OP.phase = "retreat"; OP.t = 40; OP.tickets = Math.min(OP.max, OP.tickets + Math.round(OP.max / 3)); setHomes(); for (const sq of SQUADS) if (sq.side !== a && (sq.auto || sq.wave !== undefined)) { sq.think = 0; sq.order = null; sq.wave = undefined; }
  say(a === "you" ? "Sector " + (OP.sector + 1) + " is yours. They are falling back. The next sector opens in 40 seconds." : "Sector " + (OP.sector + 1) + " has fallen. Fall back to the next line. You have 40 seconds.", 5); }
function waveSquad(side, i) { const who = B.cmds.find((w) => B.side[w] === side); if (!who) return; const U2 = FACTIONS[B.fac[who]].units, id = Object.keys(U2).find((k) => !U2[k].veh), sq = id && deploy(who, id, false, null, true); if (!sq) return; sq.owner = "wave"; sq.wave = i; sq.auto = false; sq.order = { type: "point", i }; sq.path = legNodes(sq.c.set(BASE[side][0], 0, BASE[side][1]), V3(POINTS[i].x + (rnd() - .5) * 6, 0, POINTS[i].z + (rnd() - .5) * 6), false); }
function stepOp(dt) { const a = OP.atk, d = other(a);
  if (OP.phase === "retreat") { OP.t -= dt; if (OP.t <= 0) { OP.sector++; OP.phase = "fight"; OP.wave = 2; setHomes(); say(a === "you" ? "Sector " + (OP.sector + 1) + " is open. Push on." : "They are coming. Hold sector " + (OP.sector + 1) + ".", 4); } return; }
  if (OP.phase === "regroup") { OP.t -= dt; if (OP.t <= 0) { OP.phase = "fight"; OP.batt = 2; OP.tickets = OP.max; OP.wave = 1; for (const w of B.cmds) if (B.side[w] === a) B.supply[w] = Math.min(CPMAX, B.supply[w] + 100); if (B.hooks.surge) B.hooks.surge(a); say(a === "you" ? "Your second battalion is in. This is the last of it." : "Their second battalion is in. Hold them once more.", 5); } return; }
  OP.wave -= dt; if (OP.wave <= 0) { OP.wave = 40; for (const side of ["you", "foe"]) POINTS.forEach((p, i) => { if (p.sector === OP.sector && SQUADS.filter((q) => !q.dead && q.wave === i && q.side === side).length < 2) waveSquad(side, i); }); }
  if (OP.tickets <= 0) { if (POINTS.some((p) => p.sector === OP.sector && p.n[a] > 0)) OP.ot = 5; else { OP.ot -= dt; if (OP.ot <= 0) { if (OP.batt < 2) { OP.phase = "regroup"; OP.t = 20; say(a === "you" ? "Your first battalion is spent. The second comes in where you stand in 20 seconds." : "Their first battalion is spent. A second is coming in 20 seconds.", 5); } else { B.over = d; say(d === "you" ? "You held. Both battalions are spent and the operation is yours. Press T to fight it again." : "Both battalions are spent. The operation is lost. Press T to fight it again.", 0); } } } } }
export const opLine = () => { const a = OP.atk === "you", pts = POINTS.filter((p) => p.sector === Math.min(OP.sector + (OP.phase === "retreat" ? 1 : 0), SECN - 1)).map((p) => `<i class="${p.owner || "none"}" title="${p.roof ? "Roofed: pilots and troops only" : "Open air"}">${p.name}${p.roof ? "&#9650;" : ""}</i>`).join("");
  return `<span class="${a ? "you" : "foe"}">${a ? "ATTACK" : "DEFEND"}</span> Sector ${Math.min(OP.sector + (OP.phase === "retreat" ? 2 : 1), SECN)}/${SECN} ${pts} <span class="${a ? "you" : "foe"}">${OP.phase === "retreat" ? "opens in " + Math.ceil(OP.t) : OP.phase === "regroup" ? "battalion 2 in " + Math.ceil(OP.t) : OP.tickets + " tickets" + (OP.batt > 1 ? " · last battalion" : "")}</span>`; };

/* ---------- squads, soldiers and vehicles ---------- */
function spotFree(x, z, r) { for (let i = 0; i < 12; i++) { const px = x + (rnd() - .5) * (2 + i), pz = z + (rnd() - .5) * (2 + i * .6); if (freeG(px, pz, 1.8, r)) return [px, pz]; } return [x, z]; }
const sideOf = (who) => B.side[who] || who;
const mkSquad = (side, id, def, sqId, home, at, owner = side, fac = B.fac[owner]) => { const manual = B.doctrine[owner] === "manual"; return { id: sqId, side, owner, fac, def, defId: id, name: def.name, members: [], veh: null, auto: !manual, order: manual ? { type: "move", pos: V3(RALLY[side][0] + (rnd() - .5) * 10, 0, RALLY[side][1]) } : null, path: [], fresh: false, state: "Deploying", think: rnd(), eng: false, n: def.veh ? 1 : def.guns.length, arrived: false, c: V3(home[0], 0, home[1]), dest: at ? V3(at[0], 0, at[1]) : V3(RALLY[side][0], 0, RALLY[side][1]) }; };
// the things you place: built here from a few boxes, in the colours of the side that owns them
function assetModel(kind, side) { const g = new THREE.Group(), body = new THREE.MeshToonMaterial({ color: "#4a4f52" }), dark = new THREE.MeshToonMaterial({ color: "#26282a" }), lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL[side]) });
  const bx = (w, h, d, x, y, z, m, ry = 0, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), m); o.position.set(x * U, y * U, z * U); o.rotation.set(rx, ry, 0); o.castShadow = true; g.add(o); return o; };
  if (kind === "turret") { for (const a of [0, 2.1, 4.2]) bx(.14, 1, .14, Math.sin(a) * .5, .45, Math.cos(a) * .5, dark, 0, 0).rotation.set(Math.cos(a) * .5, 0, -Math.sin(a) * .5); bx(.7, .5, .9, 0, 1.15, 0, body); bx(.5, .3, .3, 0, 1.5, .1, dark); bx(.12, .12, 1.1, -.16, 1.18, -.9, dark); bx(.12, .12, 1.1, .16, 1.18, -.9, dark); bx(.2, .08, .2, 0, 1.7, .1, lit); }
  else if (kind === "beacon") { bx(1.3, .25, 1.3, 0, .12, 0, body); bx(.5, .7, .5, 0, .6, 0, dark); bx(.1, 3.2, .1, 0, 2.5, 0, dark); bx(.5, .5, .5, 0, 4.2, 0, lit); for (const a of [0, 1.57, 3.14, 4.71]) bx(.08, .08, 1.1, Math.sin(a) * .7, .3, Math.cos(a) * .7, dark, a); }
  else if (kind === "drones") { for (const sx of [-.8, .8]) { bx(.7, .28, .9, sx, 0, 0, body); bx(.3, .12, .3, sx, -.2, -.3, lit); for (const [rx, rz] of [[-.45, -.5], [.45, -.5], [-.45, .5], [.45, .5]]) bx(.42, .04, .42, sx + rx, .18, rz, dark); } }
  else if (kind === "miner") { bx(1.2, .4, 1.6, 0, 0, 0, body); bx(1, .2, .5, 0, -.3, .4, dark); bx(.3, .14, .3, 0, -.28, -.6, lit); for (const [rx, rz] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) bx(.6, .05, .6, rx, .28, rz, dark); for (const mx of [-.3, 0, .3]) bx(.24, .14, .24, mx, -.42, .4, lit); }
  else { bx(1.1, 1.5, 1.1, 0, .85, 0, body); bx(1.2, .16, 1.2, 0, 1.2, 0, lit); bx(.7, .3, .7, 0, 1.75, 0, dark); bx(.06, 1.6, .06, .3, 2.6, .3, dark); bx(.9, .06, .5, 0, 2.1, 0, dark, .5, .4); }
  return g; }
function mkVeh(sq, x, z) { const side = sq.side, def = sq.def, v = { veh: true, side, sq, def, pos: V3(x, 0, z), yaw: side === "you" ? 0 : Math.PI, hp: def.veh.hp, r: def.veh.r, alive: true, tgt: null, think: rnd(), cd: 1 + rnd(), flow: null, flowT: 0, dest: null };
  if (def.veh.mach && MACH) { v.mid = "veh" + sq.id; v.group = placeMachine(v.mid, def.veh.model, x * U, z * U, v.yaw + Math.PI).group; } else { v.group = def.veh.build ? assetModel(def.veh.build, side) : genModel(def.veh.model); scene.add(v.group); } if (def.veh.beacon) v.drops = 3; if (def.veh.hover) { v.bob = rnd() * 6; v.laid = 0; v.leg = 0; if (def.veh.drone) sq.auto = true; }
  const tag = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL[side]) })); tag.position.y = 62; v.group.add(tag); sq.veh = v; VEH.push(v); return v; }
function mkSoldier(sq, i, x, z, id) { const side = sq.side, def = sq.def, gun = def.guns[i], mil = sq.fac === "militia";
  const s = SOL.make({ x: x * U, z: z * U, y: groundH(x, z) * U, yaw: side === "you" ? Math.PI : 0, weapon: gun, role: gun === "lmg" ? "gunner" : gun === "dmr" ? "marksman" : "rifleman", camo: mil ? (i % 2 ? "multicam" : "ranger") : "urban", seed: 100 + sq.id * 7 + i });
  if (def.mech && window.CBMech) { try { window.CBMech.dress(s, def.mech, THREE, charMat, { scheme: side === "you" ? "worn" : "steel" }); } catch (e) { console.warn("[mech]", e); } }
  if (side === "you") { const tag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL.you) })); tag.position.y = 36; s.root.add(tag); }
  const g = { id: id || ++B.n, s, side, sq, hp: def.hp, sh: def.shield || 0, W: WPN[gun], tgt: null, think: rnd() * .4, cd: 1 + rnd(), moveT: rnd(), err: V3(), c: .3, slot: i, deadT: 0, gone: false, shots: 0 }; s.onShot = () => shot(g); sq.members.push(g); arr(side).push(g); return g; }
function beaconFor(side) { const live = POINTS.filter((p) => p.sector === OP.sector), cx = live.reduce((t, p) => t + p.x, 0) / (live.length || 1), cz = live.reduce((t, p) => t + p.z, 0) / (live.length || 1); let best = null, bd = 1e9; for (const v of VEH) if (v.alive && v.side === side && v.def.veh.beacon && v.drops > 0 && !(v.stun > 0)) { const d = Math.hypot(v.pos.x - cx, v.pos.z - cz); if (d < bd) { bd = d; best = v; } } return best; }
export function deploy(who, id, paid = true, at = null, plain = false) { const side = sideOf(who), bc = !at && !plain && B.mp !== "guest" ? beaconFor(side) : null, home = at || (bc ? [bc.pos.x + 2, bc.pos.z + 2] : BASE[side]);
  if (B.mp === "guest") { B.hooks.net("dep", id); return null; }   // the guest asks; the host's battle decides
  const def = FACTIONS[B.fac[who]].units[id]; if (!def || B.over) return null; if (paid) { if (B.supply[who] < def.cost || !room(who, def)) return null; B.supply[who] -= def.cost; }
  const sq = mkSquad(side, id, def, ++B.n, home, at, who); if (at) { sq.auto = false; sq.order = { type: "move", pos: V3(at[0], 0, at[1]) }; }
  if (def.veh) { const [x, z] = spotFree(home[0] + (at ? 0 : 10), home[1], def.veh.r + .3); mkVeh(sq, x, z); }
  else def.guns.forEach((gun, i) => { const [x, z] = spotFree(home[0] + (i - def.guns.length / 2) * 1.5, home[1], .5); mkSoldier(sq, i, x, z); });
  if (bc && !def.veh) { bc.drops--; if (bc.drops <= 0) setTimeout(() => { if (bc.alive) wreckVeh(bc); }, 1500); }
  SQUADS.push(sq); return sq;
}
const aliveInf = (who) => arr(sideOf(who)).filter((g) => g.s.dead < 0 && !g.gone && g.sq.owner === who).length, aliveVeh = (who) => VEH.filter((v) => v.sq.owner === who && v.alive).length;
export const supUsed = (who) => SQUADS.reduce((t, q) => t + (!q.dead && q.owner === who ? q.def.sup || 3 : 0), 0);
export const room = (who, def) => supUsed(who) + (def.sup || 3) <= SUPCAP;
export const credit = (who, n) => { if (who && B.supply[who] !== undefined && !B.over) B.supply[who] = Math.min(CPMAX, B.supply[who] + n); };
const passive = (who) => (B.passive && B.passive[who]) || null, cmdPilot = (who) => PIL.find((p) => p.key === who);
let PIL = [];
export function addDome(side, x, z, r, sec) { const col = side === "you" ? "#6fd8ff" : "#ff8a6a", gy = groundH(x, z), dome = fxLayer(new THREE.Mesh(new THREE.SphereGeometry(r * U, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))); dome.position.set(x * U, (gy - 1) * U, z * U); scene.add(dome); DOMES.push({ x, z, r, side, t: sec, mesh: dome, box: new THREE.Object3D() }); }   // a short shield over troops, as the Vortex Wall gives
export function stunAt(x, z, r, bySide, sec) { for (const v of VEH) if (v.alive && v.side !== bySide && v.def.veh.static && Math.hypot(v.pos.x - x, v.pos.z - z) < r) v.stun = sec; }   // an arc grenade shuts placed assets down for a while
export const nearAI = (side, x, z, r) => arr(side).some((g) => g.s.dead < 0 && Math.hypot(g.s.root.position.x / U - x, g.s.root.position.z / U - z) < r);
export const utilCost = (who, k) => Math.round(UTILS[k].cost * (passive(who) === "logistics" ? .85 : 1));
const posOf = (u) => (u.veh ? V3(u.pos.x, groundH(u.pos.x, u.pos.z) + 1.2, u.pos.z) : V3(u.s.root.position.x / U, u.s.root.position.y / U + 1, u.s.root.position.z / U));

const wreckVeh = (u) => { u.alive = false; const p = V3(u.pos.x, groundH(u.pos.x, u.pos.z) + 1, u.pos.z); if (B.hooks.blast) B.hooks.blast(p, 3.2, {}); if (u.mid) { mfx({ id: u.mid, act: "wreck" }); const id = u.mid; setTimeout(() => removeMachine(id), 1500); } else scene.remove(u.group); };
export function damage(u, n, fromU, zone = "chest", byPlayer = false) {
  if (!u) return; if (B.mp === "guest") { B.hooks.net("hit", [u.veh ? -u.sq.id : u.id, Math.round(n), zone]); if (fromU && !u.veh && u.s.dead < 0 && rnd() < .5) u.s.hit(fromU, 1); return; } if (fromU && DOMES.length) { const ux = u.veh ? u.pos.x : u.s.root.position.x / U, uz = u.veh ? u.pos.z : u.s.root.position.z / U; if (domeAt(ux, uz, u.side) && !domeAt(fromU.x / U, fromU.z / U, u.side)) n *= .3; }   // under a shield dome, what comes from outside does much less
  const by = byPlayer === true ? "you" : byPlayer || null;
  if (u.veh) { if (!u.alive) return; u.hp -= n; if (u.hp <= 0) { wreckVeh(u); credit(by, 25); if (byPlayer === true && B.hooks.onKill) B.hooks.onKill(15); } return; }
  if (u.s.dead >= 0) return; const ow = u.sq.owner, op = passive(ow) === "combined" ? cmdPilot(ow) : null, ux = u.s.root.position.x / U, uz = u.s.root.position.z / U; if (op && Math.hypot(op.x - ux, op.z - uz) < 20) n *= .85;
  if (u.sh > 0 && fromU && zone !== "blast") { const yaw = u.s.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), dx = fromU.x / U - ux, dz = fromU.z / U - uz, dl = Math.hypot(dx, dz) || 1; if ((fx * dx + fz * dz) / dl > .35) { const a = Math.min(u.sh, n); u.sh -= a; n -= a; if (n <= 0) return; } }   // an energy shield stops what comes from the front until it is spent
  u.hp -= n; if (u.hp <= 0) { u.s.die(fromU, { zone, force: zone === "blast" ? 2 : 1 }); credit(by, u.sq.def.hp >= 150 ? 25 : 10); if (byPlayer === true && B.hooks.onKill) B.hooks.onKill(9); } else if (rnd() < .5) u.s.hit(fromU, 1); }
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
  const pl = B.hooks.pilot ? B.hooks.pilot() : null; if (side === "foe" && pl && pl.ok) add("pilot", null, pl.pos); for (const rp of B.hooks.rpilots ? B.hooks.rpilots() : []) if (rp.side !== side && rp.ok) add("rpilot", rp, rp.chest);
  for (const t of B.hooks.titans ? B.hooks.titans() : []) if (t.alive && t.doom <= 0 && t.team !== side) add("titan", t, V3(t.pos.x, t.pos.y + t.h * .55, t.pos.z));
  foes.sort((a, b) => (a.d - (wantTitan && (a.kind === "titan" || a.kind === "veh") ? 30 : a.kind === "titan" ? -25 : 0)) - (b.d - (wantTitan && (b.kind === "titan" || b.kind === "veh") ? 30 : b.kind === "titan" ? -25 : 0)));
  const dir = V3(); for (let i = 0; i < Math.min(5, foes.length); i++) { const f = foes[i]; dir.copy(f.pos).sub(from).divideScalar(f.d || 1); if (rayWorld(from, dir, f.d) >= f.d - .05) return f; } return null; }
const tgtAlive = (t) => t && (t.kind === "inf" ? t.ref.s.dead < 0 : t.kind === "veh" ? t.ref.alive : t.kind === "titan" ? t.ref.alive && t.ref.doom <= 0 : t.kind === "rpilot" ? t.ref.ok : B.hooks.pilot().ok);
const tgtPos = (t) => (t.kind === "inf" || t.kind === "veh" ? posOf(t.ref) : t.kind === "titan" ? V3(t.ref.pos.x, t.ref.pos.y + t.ref.h * .55, t.ref.pos.z) : t.kind === "rpilot" ? t.ref.chest : B.hooks.pilot().pos);
const isP = (t) => t.kind === "pilot" || t.kind === "rpilot", pilotOf = (t) => (t.kind === "rpilot" ? t.ref : B.hooks.pilot()), hurtP = (t, n) => (t.kind === "rpilot" ? B.hooks.hurtRemote(t.ref.slot, n) : B.hooks.hurtPilot(n));
function shot(g) { if (B.mp === "guest") { if (B.hooks.shotSnd) B.hooks.shotSnd(g.s.root.position, false, true); return; } g.shots++; const t = g.tgt; if (!tgtAlive(t)) return; const from = g.s.root.position, hitP = isP(t) && rnd() < g.c; if (B.hooks.shotSnd) B.hooks.shotSnd(from, t.kind === "pilot", hitP);   // sound hook: every soldier's shot
  if (isP(t)) { if (hitP) hurtP(t, 7 * g.W.dmg / 22); } else if (t.kind === "titan") { if (rnd() < .7) B.hooks.hurtTitan(t.ref, g.W.titan || 1.5); } else if (rnd() < g.c) damage(t.ref, t.kind === "veh" ? g.W.dmg * (g.W.veh || .18) : g.W.dmg, from, "chest"); }
function stepSoldier(g, dt) { const s = g.s, rp = s.root.position;
  if (s.dead >= 0) { if (g.cv) drop(g); g.deadT += dt; if (g.deadT > 9 && !g.gone) { g.gone = true; try { s.remove(); } catch (e) {} } return; }
  g.think -= dt; if (g.think <= 0) { g.think = .35 + rnd() * .2; g.tgt = nearestEnemy(g.side, V3(rp.x / U, rp.y / U + 1.5, rp.z / U), g.W.range); if (!g.tgt) s.aimAt(null); }
  const t = g.tgt;
  if (t && tgtAlive(t)) { const p = tgtPos(t); s.aimAt(V3(p.x * U + g.err.x, p.y * U + g.err.y, p.z * U + g.err.z)); g.cd -= dt;
    if (g.cd <= 0 && !s.busy) { if (s.ammo <= 0) s.doReload(); else { const d = t.d, pl = isP(t) ? pilotOf(t) : null;
      g.c = isP(t) ? .5 * clamp(1 - pl.speed / 16, .2, 1) * (pl.grounded ? 1 : .6) * clamp(1.25 - d / 60, .3, 1) : t.kind === "inf" ? g.W.acc * clamp(1.15 - d / g.W.range * .6, .3, 1) * (t.ref.s.crouch ? .7 : 1) * (t.ref.s.moving ? .75 : 1) : .8;
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
    else { const a = g.slot * 2.4 + sq.id, r = sq.path.length > 1 ? .5 + g.slot * .3 : 1.5 + g.slot * .75; [dx, dz] = nearestWalk(sq.dest.x + Math.cos(a) * r, sq.dest.z + Math.sin(a) * r); }   // close together on the way, spread out on arriving, and never a place inside something
    const d = Math.hypot(px - dx, pz - dz); s.autoCover = !!g.cv;
    if (d > 2.2) { if (s.cover) s.leaveCover(); if (s.crouch) s.setStance("stand"); const still = g.lx != null && Math.hypot(px - g.lx, pz - g.lz) < .4 && !s.pendCover; g.lx = px; g.lz = pz;
      // walked into something and stopped: step back and round it, one side then the other
      if (still && g.stuck >= 4) { g.stuck++; drop(g); s.autoCover = false; B.stats.stuck++; if (g.stuck > 9) { const [wx, wz] = nearestWalk(sq.c.x + (rnd() - .5) * 2, sq.c.z + (rnd() - .5) * 2); rp.set(wx * U, groundH(wx, wz) * U, wz * U); g.stuck = 0; g.lx = null; B.stats.moved++; } else { const way = legNodes(V3(px, 0, pz), V3(dx, 0, dz), false), n0 = way[0]; s.moveTo(V3(n0.x * U, 0, n0.z * U), "run"); g.moveT = 1.4; } }
      else if (still) { g.stuck = (g.stuck || 0) + 1; if (g.stuck > 3) drop(g); const ux = (dx - px) / d, uz = (dz - pz) / d, sd = g.stuck % 2 ? 1 : -1, k = 3 + g.stuck * .8; s.autoCover = false; s.moveTo(V3((px - uz * sd * k - ux * 1.2) * U, 0, (pz + ux * sd * k - uz * 1.2) * U), "run"); g.moveT = 1.1; }
      else { g.stuck = 0; s.moveTo(V3(dx * U, 0, dz * U), t ? "tacrun" : "run"); } }
    else if (!s.moving && !t && !s.cover && sq.arrived && rnd() < .3) s.setCrouch(rnd() < .6); }
}
const drop = (g) => { if (g.cv) { if (g.cv.mfUser === g) g.cv.mfUser = null; g.cv = null; } };
// something low to get behind: near `at`, not taken by a squad mate, and on the way when a way is given
function findCover(g, at, reach, toward, far, thr) { let best = null, bs = 1e9; for (const c of SOL.covers) { if (c.h > 46 || c.h < 12) continue; const u = c.mfUser; if (u && u !== g && u.s.dead < 0) continue; const cx = c.p.x / U, cz = c.p.z / U, d = Math.hypot(cx - at.x, cz - at.z); if (d > reach) continue;
  if (toward && Math.hypot(cx - toward.x, cz - toward.z) > far - 2.5) continue; if (Math.hypot(cx - thr.x, cz - thr.z) < 5) continue; const sc = d + rnd() * 1.5; if (sc < bs) { bs = sc; best = c; } } return best; }
/* ---------- drones and mines ---------- */
const MINES = []; let mineKey = "";
const hoverY = (v) => (v.def.veh.hover ? v.def.veh.hover + Math.sin((v.bob = (v.bob || 0) + .05)) * .12 : 0);
function mkMine(x, z, side) { const g = new THREE.Group(), c = COL[side]; const d = new THREE.Mesh(new THREE.CylinderGeometry(.34 * U, .4 * U, .12 * U, 8), new THREE.MeshToonMaterial({ color: "#2b2d2e" })), l = new THREE.Mesh(new THREE.BoxGeometry(.12 * U, .1 * U, .12 * U), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]) })); l.position.y = .1 * U; g.add(d, l); g.position.set(x * U, (groundH(x, z) + .06) * U, z * U); scene.add(g); return g; }
function stepHover(v, dt) { const sq = v.sq, D = v.def.veh; let tx = v.pos.x, tz = v.pos.z, stop = 3;
  if (D.drone) { if (sq.auto || !sq.order || !sq.order.pos) { let best = null, bd = 1e9; for (const q of SQUADS) if (q !== sq && !q.dead && q.side === v.side && !q.veh) { const d = Math.hypot(q.c.x - v.pos.x, q.c.z - v.pos.z) - (q.owner === sq.owner ? 40 : 0); if (d < bd) { bd = d; best = q; } } if (best) { tx = best.c.x; tz = best.c.z; } } else { tx = sq.order.pos.x; tz = sq.order.pos.z; stop = 1; }
    for (const g of arr(v.side)) if (g.s.dead < 0 && g.hp < g.sq.def.hp && Math.hypot(g.s.root.position.x / U - v.pos.x, g.s.root.position.z / U - v.pos.z) < 10) g.hp = Math.min(g.sq.def.hp, g.hp + 6 * dt); }
  else if (D.miner) { const home = BASE[v.side], live = POINTS.filter((p) => p.sector === OP.sector), far = sq.order && sq.order.pos && !sq.auto ? sq.order.pos : live.length ? live.reduce((b, p) => (Math.hypot(p.x - v.pos.x, p.z - v.pos.z) < Math.hypot(b.x - v.pos.x, b.z - v.pos.z) ? p : b)) : null; if (far) { const goal = v.leg ? { x: home[0], z: home[1] } : far; tx = goal.x; tz = goal.z; stop = 4; if (Math.hypot(tx - v.pos.x, tz - v.pos.z) < 5) v.leg = v.leg ? 0 : 1; }
    v.laid += D.speed * dt; if (v.laid > 11 && MINES.filter((m) => m.by === v).length < 4 && Math.hypot(v.pos.x - home[0], v.pos.z - home[1]) > 25 && freeG(v.pos.x, v.pos.z, 1, .4, .5)) { v.laid = 0; MINES.push({ x: v.pos.x, z: v.pos.z, side: v.side, by: v, arm: 1.5, mesh: mkMine(v.pos.x, v.pos.z, v.side) }); } }
  const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz); if (d > stop) { const sp = Math.min(D.speed * dt, d - stop); v.pos.x += dx / d * sp; v.pos.z += dz / d * sp; let dy = (Math.atan2(-dx, -dz) - v.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; v.yaw += clamp(dy, -3 * dt, 3 * dt); }
  v.pos.x = clamp(v.pos.x, WORLD.x0 + 3, WORLD.x1 - 3); v.pos.z = clamp(v.pos.z, WORLD.z0 + 3, WORLD.z1 - 3); sq.c.copy(v.pos); v.group.position.set(v.pos.x * U, (groundH(v.pos.x, v.pos.z) + hoverY(v)) * U, v.pos.z * U); v.group.rotation.y = v.yaw + Math.PI; }
// a mine waits a moment after it is laid, then goes off under the first enemy to come close: a trooper, a vehicle on the ground, a pilot or a Titan
function stepMines(dt) { for (let i = MINES.length - 1; i >= 0; i--) { const m = MINES[i], foe = other(m.side); m.arm -= dt; if (m.arm > 0) continue;
    const hit = arr(foe).some((g) => g.s.dead < 0 && Math.hypot(g.s.root.position.x / U - m.x, g.s.root.position.z / U - m.z) < 2.2) || VEH.some((v) => v.alive && v.side === foe && !v.def.veh.hover && Math.hypot(v.pos.x - m.x, v.pos.z - m.z) < 3) || PIL.some((p) => p.side === foe && Math.hypot(p.x - m.x, p.z - m.z) < 2.5) || (B.hooks.titans ? B.hooks.titans() : []).some((t) => t.alive && t.team === foe && Math.hypot(t.pos.x - m.x, t.pos.z - m.z) < 4);
    if (hit) { scene.remove(m.mesh); MINES.splice(i, 1); if (B.hooks.blast) B.hooks.blast(V3(m.x, groundH(m.x, m.z) + .3, m.z), 4.2, { team: m.side, titan: 35, pilot: 90 }); } } }
function stepVeh(v, dt) { if (!v.alive) return; if (v.stun > 0) { v.stun -= dt; v.tgt = null; return; } if (v.def.veh.hover) return stepHover(v, dt); const sq = v.sq, dest = sq.dest;
  v.think -= dt; if (v.think <= 0) { v.think = .5; v.tgt = v.def.veh.gun ? nearestEnemy(v.side, V3(v.pos.x, groundH(v.pos.x, v.pos.z) + 1.7, v.pos.z), v.def.veh.range || 55, v.def.veh.gun === "rocket") : null; }
  const t = v.tgt && tgtAlive(v.tgt) ? v.tgt : null, far = Math.hypot(dest.x - v.pos.x, dest.z - v.pos.z);
  let wx = 0, wz = 0; if (!v.def.veh.static && far > 4 && !(t && t.d < 26)) { v.flowT -= dt; if (v.flowT <= 0 || !v.flow) { v.flowT = 1.2; v.flow = flowTo(dest.x, dest.z); } [wx, wz] = flowDir(v.flow, v.pos.x, v.pos.z); }
  if (wx || wz) { const sp = v.def.veh.speed * dt, nx = v.pos.x + wx * sp, nz = v.pos.z + wz * sp; if (freeG(nx, v.pos.z, 1.6, v.r, .55)) v.pos.x = nx; if (freeG(v.pos.x, nz, 1.6, v.r, .55)) v.pos.z = nz; }
  const face = (wx || wz) ? Math.atan2(-wx, -wz) : t ? Math.atan2(-(t.pos.x - v.pos.x), -(t.pos.z - v.pos.z)) : v.yaw; let dy = (face - v.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; v.yaw += clamp(dy, -2 * dt, 2 * dt);
  v.group.position.set(v.pos.x * U, groundH(v.pos.x, v.pos.z) * U, v.pos.z * U); v.group.rotation.y = v.yaw + Math.PI;
  v.cd -= dt; if (t && v.cd <= 0) { const p = tgtPos(t), from = V3(v.pos.x, groundH(v.pos.x, v.pos.z) + 2, v.pos.z), rocket = v.def.veh.gun === "rocket", fu = toU(from); v.cd = rocket ? 3.4 + rnd() : 1.8 + rnd() * .8;
    if (v.mid) mfx({ id: v.mid, act: "fire", shot: rocket && (t.kind === "titan" || t.kind === "veh") ? "rocket" : "gun", at: [p.x * U, p.y * U, p.z * U] });
    else { flash(fu, "#ffc477", 1800, .1); for (let i = 0; i < (rocket ? 1 : 4); i++) setTimeout(() => tracer(fu, toU(p).add(V3((rnd() - .5) * 20, (rnd() - .5) * 12, (rnd() - .5) * 20)), rocket ? "#ffb060" : "#ffd890", rocket ? 2600 : 9000, rocket ? 2.2 : .7), i * 90); }
    setTimeout(() => { if (!v.alive || !tgtAlive(t)) return; const q = tgtPos(t), pl = isP(t) ? pilotOf(t) : null;
      if (rocket) { if (isP(t)) { if (B.hooks.blast) B.hooks.blast(V3(q.x + (rnd() - .5) * 5, Math.max(0, q.y - 1), q.z + (rnd() - .5) * 5), 2.2, { team: v.side, pilot: 30 }); } else { if (t.kind === "titan") B.hooks.hurtTitan(t.ref, 45); else if (t.kind === "veh") damage(t.ref, 80, fu, "blast"); if (B.hooks.blast) B.hooks.blast(V3(q.x, Math.max(0, q.y - .8), q.z), 2.2, { team: v.side }); } }
      else if (isP(t)) { if (rnd() < .3 * clamp(1 - pl.speed / 15, .2, 1) * (pl.grounded ? 1 : .6)) hurtP(t, 14); } else if (t.kind === "titan") B.hooks.hurtTitan(t.ref, 7); else if (t.kind === "veh") damage(t.ref, 16, fu); else if (rnd() < .6) damage(t.ref, 34, fu); }, rocket ? 600 : 300); }
}
const NAMES = { you: "your", foe: "their" };
function stepSquad(sq, dt) {
  const mem = sq.members.filter((g) => g.s.dead < 0); if (!mem.length && !(sq.veh && sq.veh.alive)) { sq.dead = true; return; }
  if (sq.veh) sq.c.copy(sq.veh.pos); else { sq.c.set(0, 0, 0); for (const g of mem) { sq.c.x += g.s.root.position.x / U; sq.c.z += g.s.root.position.z / U; } sq.c.divideScalar(mem.length); }
  sq.n = mem.length; sq.eng = sq.veh ? !!(sq.veh.tgt && tgtAlive(sq.veh.tgt)) : mem.some((g) => g.tgt && tgtAlive(g.tgt));
  sq.think -= dt; if (sq.auto && (sq.think <= 0 || !sq.order)) { sq.think = 5 + rnd() * 3; const ts = tgtSector(sq.side); let best = -1e9, bi = Math.max(0, POINTS.findIndex((p) => p.sector === ts));
    POINTS.forEach((p, i) => { if (p.sector !== ts) return; const d = Math.hypot(p.x - sq.c.x, p.z - sq.c.z), mates = SQUADS.filter((o) => o !== sq && o.side === sq.side && !o.dead && o.order && o.order.type === "point" && o.order.i === i).length;
      const v = (p.owner === sq.side ? (p.n[other(sq.side)] > 0 ? 7 : 1 + (sq.order && sq.order.i === i ? 1.5 : 0)) : 10) - d * .035 - mates * 3 + (sq.order && sq.order.type === "point" && sq.order.i === i ? 2 : 0); if (v > best) { best = v; bi = i; } });
    if (!sq.order || sq.order.i !== bi) { sq.order = { type: "point", i: bi }; sq.path = legNodes(sq.c, V3(POINTS[bi].x + (rnd() - .5) * 6, 0, POINTS[bi].z + (rnd() - .5) * 6), !!sq.veh); } }
  const o = sq.order || { type: "move", pos: V3(RALLY[sq.side][0], 0, RALLY[sq.side][1]) }, fin = o.pos || V3(POINTS[o.i].x, 0, POINTS[o.i].z), reach = sq.veh ? 5.5 : 4.5;
  while (sq.path.length && Math.hypot(sq.path[0].x - sq.c.x, sq.path[0].z - sq.c.z) < (sq.path.length === 1 ? 6.5 : reach)) { sq.path.shift(); sq.nodeT = 0; }
  if (sq.path.length > 1 && Math.hypot(sq.path[0].x - sq.c.x, sq.path[0].z - sq.c.z) < 11 && !sq.eng) { sq.nodeT = (sq.nodeT || 0) + dt; if (sq.nodeT > 7) { sq.path.shift(); sq.nodeT = 0; } }   // close to a corner for a while without quite reaching it: on to the next
  if (!sq.veh && !sq.eng && sq.path.length) { sq.lagT = (sq.lagT || 0) + dt; if (sq.lagT > 6) { const moved = sq.lagC ? Math.hypot(sq.c.x - sq.lagC.x, sq.c.z - sq.lagC.z) : 99; sq.lagC = sq.c.clone(); sq.lagT = 0; if (moved < 2.5) { const end = sq.path[sq.path.length - 1]; sq.path = legNodes(sq.c, end, false); B.stats.repath++; } } } else sq.lagT = 0;
  sq.dest = sq.path.length ? sq.path[0] : fin; sq.arrived = !sq.path.length && Math.hypot(fin.x - sq.c.x, fin.z - sq.c.z) < 6.5;
  const where = o.type === "point" ? POINTS[o.i].name + ", the " + POINTS[o.i].label.toLowerCase() : null;
  sq.state = sq.eng ? (where ? (sq.arrived ? "Fighting on " : "Fighting on the way to ") + where : "Fighting") : sq.arrived ? (where ? (POINTS[o.i].owner === sq.side ? "Holding " : "Taking ") + where : "Holding position") : where ? "Moving to " + where + (sq.path.some((p) => p.stop) ? " by your stops" : "") : "Moving";
}
function stepPoints(dt) { const pl = B.hooks.pilot ? B.hooks.pilot() : null, rps = B.hooks.rpilots ? B.hooks.rpilots() : [], tis = B.hooks.titans ? B.hooks.titans() : [];
  for (const p of POINTS) { const n = { you: 0, foe: 0 }, w = { you: 0, foe: 0 }, ai = { you: 0, foe: 0 }, aura = { you: false, foe: false }, far = (x, z) => Math.hypot(x - p.x, z - p.z);
    const pilot = (side, x, z, titan) => { const d = far(x, z); if (d < 20) aura[side] = true; if (d < 9) { n[side]++; w[side] += titan ? (p.roof ? 0 : 1.5) : 1; } };   // a pilot counts 1, a Titan 1.5 and only in the open
    if (pl && pl.alive) pilot("you", pl.at.x, pl.at.z, pl.titan); for (const rp of rps) if (!rp.decoy && (rp.ok || rp.inTitan)) pilot(rp.side, rp.pos.x, rp.pos.z, rp.inTitan);
    for (const side of ["you", "foe"]) { for (const g of arr(side)) if (g.s.dead < 0 && far(g.s.root.position.x / U, g.s.root.position.z / U) < 9) { const gx = g.s.root.position.x / U, gz = g.s.root.position.z / U, op = passive(g.sq.owner) === "combined" ? cmdPilot(g.sq.owner) : null; n[side]++; ai[side] += (g.sq.def.capw || .3) * (op && Math.hypot(op.x - gx, op.z - gz) < 20 ? 1.25 : 1); } for (const v of VEH) if (v.alive && !v.def.veh.static && !v.def.veh.nocap && v.side === side && far(v.pos.x, v.pos.z) < 9) { n[side]++; ai[side] += .4; } }
    for (const t of tis) if (t.alive && !t.piloted && t.remote == null && far(t.pos.x, t.pos.z) < 9) { n[t.team]++; if (!p.roof) w[t.team] += 1.5; }
    for (const side of ["you", "foe"]) w[side] += ai[side] * (aura[side] ? 1.25 : 1);   // troops count 0.3 each, a quarter more with a pilot of theirs within 20 m
    p.n = n; p.w = w; if (p.sector !== OP.sector || OP.phase !== "fight") continue;
    const net = w.you - w.foe; if (Math.abs(net) > .01) p.prog = clamp(p.prog + Math.sign(net) * Math.min(Math.abs(net), 2.5) / 12 * dt, -1, 1); else if (!n.you && !n.foe && p.owner) p.prog = clamp(p.prog + (p.owner === "you" ? 1 : -1) * .03 * dt, -1, 1);
    const was = p.owner; if (p.prog >= 1) p.owner = "you"; else if (p.prog <= -1) p.owner = "foe"; else if ((p.owner === "you" && p.prog <= 0) || (p.owner === "foe" && p.prog >= 0)) p.owner = null;
    if (was !== p.owner) ownerChanged(p); }
  if (OP.phase === "fight" && !B.over && POINTS.every((p) => p.sector !== OP.sector || p.owner === OP.atk)) sectorFalls(); }
function ownerChanged(p, quiet) { if (!quiet && p.owner === "you" && B.hooks.onCap) B.hooks.onCap(p); const c = COL[p.owner || "none"]; p.lamp.material.color.setRGB(...c); p.light.color.setRGB(c[0] / 3, c[1] / 3, c[2] / 3); if (!quiet && p.owner && B.hooks.say) B.hooks.say(p.owner === "you" ? "Your side has taken point " + p.name + "." : "The enemy has taken point " + p.name + ".", 2.5); }

// a commander that plays by a doctrine: what to bring in next, as supply allows
function command(side, dt) { B.ai[side] -= dt; if (B.ai[side] > 0) return; B.ai[side] = 1.5; const doc = B.doctrine[side]; if (doc === "manual" || B.away[side]) return;
  const U2 = FACTIONS[B.fac[side]].units, ids = B.list[side].filter((id) => U2[id]), inf = ids.filter((id) => !U2[id].veh), veh = ids.filter((id) => U2[id].veh && !U2[id].veh.static); if (!inf.length && !veh.length) return;
  const k = B.turn[side], wantVeh = veh.length && aliveVeh(side) < 2 && (aliveInf(side) >= 3 || !inf.length) && (doc === "armor" ? k % 2 === 0 : doc === "mixed" ? k % 3 === 2 : false);
  const pool = wantVeh ? veh : inf.length ? inf : veh, id = pool[k % pool.length], def = U2[id];
  if (!room(side, def)) { if (wantVeh || !inf.length) B.turn[side]++; return; } if (false) return;   // with almost nobody left, wait until two squads can go in together
  if (B.supply[side] >= def.cost) { deploy(side, id); B.turn[side]++; B.ai[side] = .4; } }
let tick = 0;
let escT = 0;
export function stepBattle(dt) { if (B.mp === "guest") return stepGuest(dt); if (B.over) return; B.time += dt; PIL = B.hooks.pilots ? B.hooks.pilots() : [];
  escT += dt; if (escT >= 5) { escT = 0; for (const p of PIL) { const live = POINTS.filter((q) => q.sector === OP.sector); if (arr(p.side).some((g) => g.s.dead < 0 && Math.hypot(g.s.root.position.x / U - p.x, g.s.root.position.z / U - p.z) < 20 && live.some((q) => Math.hypot(g.s.root.position.x / U - q.x, g.s.root.position.z / U - q.z) < 9))) credit(p.key, 15); } }   // staying with your troops on a point pays
  for (const g of GRUNTS) stepSoldier(g, dt); for (const g of ALLIES) stepSoldier(g, dt); for (const v of VEH) stepVeh(v, dt);
  for (const L of [GRUNTS, ALLIES]) for (let i = L.length - 1; i >= 0; i--) if (L[i].gone) L.splice(i, 1);
  for (let i = VEH.length - 1; i >= 0; i--) if (!VEH[i].alive) VEH.splice(i, 1);
  for (let i = SQUADS.length - 1; i >= 0; i--) { stepSquad(SQUADS[i], dt); if (SQUADS[i].dead) { if (SQUADS[i].def.core && passive(SQUADS[i].owner) === "attrition") credit(SQUADS[i].owner, SQUADS[i].def.cost * .2); if (OP.ai && SQUADS[i].side === OP.atk && SQUADS[i].owner !== "wave") spend(OP.atk, 1); const k = MAP.sels.indexOf(SQUADS[i]); if (k >= 0) MAP.sels.splice(k, 1); SQUADS.splice(i, 1); } }
  stepPoints(dt); stepOp(dt); stepMines(dt); stepUtils(dt); for (const w of B.cmds) command(w, dt);
  for (const w of B.cmds) B.supply[w] = Math.min(CPMAX, B.supply[w] + income(w) * dt);   // supply comes in steadily; the side that is behind is sent more
}
export function resetBattle() { for (const L of [GRUNTS, ALLIES]) { for (const g of L) if (!g.gone) { try { g.s.remove(); } catch (e) {} } L.length = 0; }
  for (const v of VEH) { if (v.mid) removeMachine(v.mid); else scene.remove(v.group); } VEH.length = 0; SQUADS.length = 0; MAP.sels = [];
  OP.atk = ATK; OP.sector = 0; OP.batt = 1; OP.phase = "fight"; OP.t = 0; OP.wave = 4; OP.ot = 0; OP.ai = !B.mp && ATK === "foe"; OP.max = OP.tickets = 30 * Math.max(1, B.hooks.attackers ? B.hooks.attackers() : 1); setHomes();
  for (const p of POINTS) { p.owner = other(ATK); p.prog = p.owner === "you" ? 1 : -1; ownerChanged(p, true); }
  GH.sq.clear(); GH.g.clear(); B.cmds = []; B.side = {}; B.away = {};
  const add = (key, side, fac, list, doc) => { fac = FACTIONS[fac] ? fac : "militia"; B.cmds.push(key); B.side[key] = side; B.fac[key] = fac; B.list[key] = (list || []).filter((id) => FACTIONS[fac].units[id]); B.doctrine[key] = DOCTRINES[doc] ? doc : "mixed"; B.supply[key] = CP0; B.passive = B.passive || {}; B.passive[key] = key === "you" ? LOAD.passive : (B.roster || []).find((r) => r.key === key)?.passive || null; B.turn[key] = 0; B.ai[key] = 2; B.cd[key] = { strike: 0, shield: 0, med: 0 }; };
  add("you", "you", LOAD.side, LOAD.list[LOAD.side].slice(), LOAD.doctrine);
  if (B.mp === "host") { for (const r of B.roster || []) if (r.key !== "you") add(r.key, r.side, r.fac, r.list, r.doctrine); }   // every other player is a commander too, on one side or the other
  else if (!B.mp) { const f = LOAD.side === "militia" ? "machine" : "militia"; add("foe", "foe", f, Object.keys(FACTIONS[f].units).filter((id) => !["technical", "jumps"].includes(id)), "mixed"); }
  B.cap = B.duo ? { inf: 10, veh: 2 } : { inf: 18, veh: 3 }; B.share = B.duo ? .6 : 1; B.score.you = B.score.foe = 0; B.time = 0; B.over = null;
  if (B.mp !== "guest") for (const w of B.cmds) { const inf = B.list[w].filter((id) => !FACTIONS[B.fac[w]].units[id].veh); for (let i = 0; i < 0 && inf.length; i++) deploy(w, inf[i % inf.length], false); }
  for (const f of FALLS) scene.remove(f.mesh); FALLS.length = 0; for (const d of DOMES) { scene.remove(d.mesh); scene.remove(d.box); } DOMES.length = 0; for (const m of MEDS) scene.remove(m.box); MEDS.length = 0; for (const m of MINES) scene.remove(m.mesh); MINES.length = 0; mineKey = ""; MAP.arm = null;
}

/* ---------- the commander's cards that are not troops ----------
   An air strike, a shield dome and a medical crate, each paid for in supply and each with a wait before it can be used
   again. Any infantry squad on your list can also be sent down in a drop pod onto a spot you pick, for more supply. */
export const UTILS = {
  strike: { name: "Air strike", icon: "✈", cost: 180, cd: 40, ask: "Click where the air strike should land.", desc: "Five bombs in a line across the spot you click. Kills infantry caught in the open and hurts armour and Titans." },
  shield: { name: "Shield dome", icon: "◠", cost: 120, cd: 35, ask: "Click where the shield should fall.", desc: "A dome 16 metres across that stands for 25 seconds. Fire from outside does much less to your troops inside it." },
  med: { name: "Medical drop", icon: "✚", cost: 90, cd: 30, ask: "Click where the medical crate should fall.", desc: "A crate that mends you and your troops within 9 metres for 20 seconds." } };
export const POD_EXTRA = 50;
B.cd = { you: { strike: 0, shield: 0, med: 0 } };
const FALLS = [], DOMES = [], MEDS = [];
export const domeAt = (x, z, side) => DOMES.some((d) => d.side === side && Math.hypot(x - d.x, z - d.z) < d.r);
const baseOf = (side) => BASE[B.flip ? other(side) : side];   // on the guest's screen "you" are the far base
const slab = (w, h, d, color, glow) => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), new THREE.MeshToonMaterial({ color })); m.position.y = h * U / 2; m.castShadow = true; g.add(m);
  if (glow) { const l = new THREE.Mesh(new THREE.BoxGeometry(w * U * 1.04, h * U * .16, d * U * 1.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(2.6) })); l.position.y = h * U * .62; g.add(l); } scene.add(g); return g; };
// side is whose card it is. ghost is the guest's copy of something the host has already decided: it is shown, and it
// does what only this screen can know (shield or mend its own pilot), but it spends nothing and hurts nobody.
export function useUtil(kind, g, unit, who = "you", ghost = false) { if (B.over) return false; const side = ghost ? who : sideOf(who);   // a ghost is told the side, as this screen sees it
  if (B.mp === "guest" && !ghost) { B.hooks.net("util", [kind, g.x, g.z, unit || ""]); return true; }
  let x = clamp(g.x, WORLD.x0 + 4, WORLD.x1 - 4), z = clamp(g.z, WORLD.z0 + 4, WORLD.z1 - 4); const mine = side === "you", col = mine ? "#8fe0f0" : "#ff7a5a", tell = () => { if (!ghost && B.mp === "host") B.hooks.net("util", [kind, x, z, unit || "", side]); }, def0 = ghost ? null : FACTIONS[B.fac[who]].units[unit];
  if (kind === "pod") { const def = def0; if (!ghost) { const st = def && def.veh && def.veh.static, price = def ? def.cost + (st ? 0 : POD_EXTRA) : 0; if (!def || (def.veh && !st) || B.supply[who] < price || !room(who, def)) return false; [x, z] = nearestWalk(x, z); B.supply[who] -= price; }
    FALLS.push({ kind, side, who, ghost, x, z, t: passive(who) === "shock" ? 1.8 : 2.6, v: 90, unit, mesh: slab(2.1, 3.6, 2.1, "#3b4248", col) }); ringFx(toU(V3(x, groundH(x, z) + .3, z)), col, 4 * U, 2.6); if (B.hooks.say) B.hooks.say(mine ? (def && who === "you" ? (def.veh ? "Your " + def.name + " is coming down." : def.name + " are coming down in a drop pod.") : "A drop pod is coming down for your side.") : "An enemy drop pod is coming down.", 2.5); tell(); return true; }
  const u = UTILS[kind]; if (!u) return false; if (!ghost) { if (B.cd[who][kind] > 0 || B.supply[who] < utilCost(who, kind)) return false; B.supply[who] -= utilCost(who, kind); B.cd[who][kind] = u.cd; if (kind !== "strike") [x, z] = nearestWalk(x, z); }
  if (kind === "strike") { const bs = baseOf(side), bx = x - bs[0], bz = z - bs[1], l = Math.hypot(bx, bz) || 1, px = -bz / l, pz = bx / l;   // the run crosses the line from that side's base to the spot
    ringFx(toU(V3(x, groundH(x, z) + .3, z)), mine ? "#ff7a3a" : "#ff3a2a", 12 * U, 2.4);
    for (let i = -2; i <= 2; i++) { const fx = x + px * i * 5.5, fz = z + pz * i * 5.5; FALLS.push({ kind: "bomb", side, ghost, x: fx, z: fz, t: 2.3 + (i + 2) * .17, v: 55, mesh: slab(.5, 1.3, .5, "#1c1b1a") }); }
    const pm = new THREE.Mesh(new THREE.ConeGeometry(2.6 * U, 11 * U, 4).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ color: "#23262a" })); pm.scale.set(2.4, .45, 1); pm.rotation.y = Math.atan2(px, pz); scene.add(pm);
    FALLS.push({ kind: "plane", x, z, px, pz, t: 2.3, mesh: pm }); if (B.hooks.say) B.hooks.say(mine ? "Air strike on the way. Keep your people clear." : "Enemy air strike coming in.", 2.5); tell(); return true; }
  FALLS.push({ kind, side, ghost, x, z, t: 1.7, v: 70, mesh: kind === "shield" ? slab(1.1, 1.1, 1.1, "#3b4650", mine ? "#6fd8ff" : "#ff8a6a") : slab(1.5, 1, 1.1, "#d8d4c4", mine ? "#7dffa0" : "#ffb070") });
  if (mine && B.hooks.say) B.hooks.say(kind === "shield" ? "Shield on the way." : "Medical crate on the way.", 2); tell(); return true; }
function landed(f) { const gy = groundH(f.x, f.z), at = V3(f.x, gy, f.z), mine = f.side === "you";
  if (f.kind === "bomb") { scene.remove(f.mesh); if (B.hooks.blast) B.hooks.blast(at, 6, f.ghost ? {} : { team: f.side, titan: 110, pilot: 70 }); return false; }
  if (f.kind === "pod") { if (B.hooks.blast) B.hooks.blast(at, 3, f.ghost ? {} : { team: f.side, titan: 60, pilot: 40 }); if (!f.ghost) { const sq = deploy(f.who, f.unit, false, [f.x, f.z]); if (sq && f.who === "you" && MAP.on) MAP.sels = [sq]; } f.husk = 10; return true; }
  if (f.kind === "shield") { const col = mine ? "#6fd8ff" : "#ff8a6a", dome = fxLayer(new THREE.Mesh(new THREE.SphereGeometry(8 * U, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    dome.position.set(f.x * U, (gy - 1) * U, f.z * U); scene.add(dome); DOMES.push({ x: f.x, z: f.z, r: 8, side: f.side, t: 25, mesh: dome, box: f.mesh }); ringFx(toU(at).setY((gy + .3) * U), col, 8 * U, .7); flash(toU(at).setY((gy + 3) * U), col, 2600, .4); return false; }
  MEDS.push({ x: f.x, z: f.z, r: 9, t: 20, tick: 0, box: f.mesh, side: f.side, ghost: f.ghost }); ringFx(toU(at).setY((gy + .3) * U), mine ? "#7dffa0" : "#ffb070", 9 * U, .7); return false; }
function stepUtils(dt) { for (const w in B.cd) for (const k in B.cd[w]) B.cd[w][k] = Math.max(0, B.cd[w][k] - dt);
  for (let i = FALLS.length - 1; i >= 0; i--) { const f = FALLS[i];
    if (f.husk) { f.husk -= dt; if (f.husk <= 0) { scene.remove(f.mesh); FALLS.splice(i, 1); } continue; }
    f.t -= dt; if (f.kind === "plane") { const s = (2.3 - f.t - 2.2) * 95; f.mesh.position.set((f.x + f.px * s) * U, (groundH(f.x, f.z) + 46) * U, (f.z + f.pz * s) * U); if (f.t < -2.4) { scene.remove(f.mesh); FALLS.splice(i, 1); } continue; }
    const gy = groundH(f.x, f.z); f.mesh.position.set(f.x * U, (gy + Math.max(0, f.t) * f.v) * U, f.z * U); if (f.t <= 0 && !landed(f)) FALLS.splice(i, 1); }
  for (let i = DOMES.length - 1; i >= 0; i--) { const d = DOMES[i]; d.t -= dt; d.mesh.material.opacity = (d.t < 3 ? .05 + .1 * (Math.sin(d.t * 14) * .5 + .5) : .13 + .04 * Math.sin(B.time * 3)); if (d.t <= 0) { scene.remove(d.mesh); scene.remove(d.box); DOMES.splice(i, 1); } }
  for (let i = MEDS.length - 1; i >= 0; i--) { const m = MEDS[i]; m.t -= dt; m.tick -= dt;
    if (m.tick <= 0) { m.tick = .5; let any = false; if (!m.ghost) for (const g of arr(m.side)) if (g.s.dead < 0 && g.hp < g.sq.def.hp && Math.hypot(g.s.root.position.x / U - m.x, g.s.root.position.z / U - m.z) < m.r) { g.hp = Math.min(g.sq.def.hp, g.hp + 9); any = true; }
      const pl = B.hooks.pilot ? B.hooks.pilot() : null; if (m.side === "you" && pl && pl.alive && !pl.titan && Math.hypot(pl.at.x - m.x, pl.at.z - m.z) < m.r && B.hooks.healPilot && B.hooks.healPilot(7)) any = true;
      if (any || (m.t % 2) < .5) ringFx(V3(m.x * U, (groundH(m.x, m.z) + .3) * U, m.z * U), m.side === "you" ? "#7dffa0" : "#ffb070", (any ? m.r : 3) * U, .6); }
    if (m.t <= 0) { scene.remove(m.box); MEDS.splice(i, 1); } } }

/* ---------- two players ----------
   The host's browser runs the battle. Several times a second it sends the other player a picture of it: the score, the
   points, every squad, soldier and vehicle. The guest's browser builds the same troops from that picture and walks them
   to where the host says they are. On the guest's screen the sides are swapped, so "you" is always your own side.
   What the guest does as a commander (deploy, orders, support cards) and what its pilot hits are sent to the host, which
   applies them to the real battle. */
const r1 = (v) => Math.round(v * 10) / 10, GH = { sq: new Map(), g: new Map() }, FACS = Object.keys(FACTIONS);
// who is one commander's key on the host ("p1", "p2"...). Sides are sent as that player sees them: 1 is their own side.
export function snapshot(who) { const my = B.side[who], rel = (sd) => (sd === my ? 1 : 0), cd = B.cd[who], sg = my === "you" ? 1 : -1;
  return { t: r1(B.time), sc: [r1(B.score[my]), r1(B.score[other(my)])], sup: Math.floor(B.supply[who]), cd: [Math.ceil(cd.strike), Math.ceil(cd.shield), Math.ceil(cd.med)], ov: B.over ? (B.over === my ? 1 : 2) : 0, mn: MINES.map((m) => [r1(m.x), r1(m.z), m.side === my ? 1 : 0]), op: [OP.sector, OP.tickets, OP.max, OP.batt, ["fight", "retreat", "regroup"].indexOf(OP.phase), Math.ceil(OP.t), OP.atk === my ? 1 : 0],
    p: POINTS.map((p) => [Math.round(p.prog * 100 * sg), p.owner ? (p.owner === my ? 1 : 2) : 0, p.n[my], p.n[other(my)]]),
    q: SQUADS.map((q) => { const f = q.owner === who, o = q.order, v = q.veh; return [q.id, rel(q.side) | (f ? 2 : 0), FACS.indexOf(q.fac), q.defId, q.auto ? 1 : 0, q.state, f ? q.path.map((n) => [r1(n.x), r1(n.z), n.stop ? 1 : 0]) : 0, f && o ? [o.type === "point" ? o.i : -1, o.pos ? r1(o.pos.x) : 0, o.pos ? r1(o.pos.z) : 0, o.pos ? 1 : 0] : 0, v ? [r1(v.pos.x), r1(v.pos.z), r1(v.yaw), v.alive ? Math.ceil(v.hp) : 0] : 0]; }),
    s: [...ALLIES, ...GRUNTS].filter((g) => !g.gone).map((g) => { const p = g.s.root.position, t = g.s.dead < 0 && g.tgt && tgtAlive(g.tgt) ? tgtPos(g.tgt) : null; return [g.id, g.sq.id, g.slot, r1(p.x / U), r1(p.z / U), (g.s.dead >= 0 ? 1 : 0) | (g.s.crouch ? 2 : 0), g.shots, t ? [r1(t.x), r1(t.y), r1(t.z)] : 0]; }) }; }
export function applySnap(o) { const now = performance.now();
  B.time = o.t; B.score.you = o.sc[0]; B.score.foe = o.sc[1]; B.supply.you = o.sup; B.cd.you.strike = o.cd[0]; B.cd.you.shield = o.cd[1]; B.cd.you.med = o.cd[2];
  if (o.ov && !B.over) { B.over = o.ov === 1 ? "you" : "foe"; if (B.hooks.say) B.hooks.say(B.over === "you" ? "The field is yours. The host can press T to fight it again." : "The enemy holds the field. The host can press T to fight it again.", 0); }
  if (o.mn) { const k = JSON.stringify(o.mn); if (k !== mineKey) { mineKey = k; for (const m of MINES) scene.remove(m.mesh); MINES.length = 0; for (const a of o.mn) MINES.push({ x: a[0], z: a[1], side: a[2] ? "you" : "foe", arm: 9, mesh: mkMine(a[0], a[1], a[2] ? "you" : "foe") }); } }
  if (o.op) { const ch = OP.sector !== o.op[0] || OP.phase !== ["fight", "retreat", "regroup"][o.op[4]]; OP.sector = o.op[0]; OP.tickets = o.op[1]; OP.max = o.op[2]; OP.batt = o.op[3]; OP.phase = ["fight", "retreat", "regroup"][o.op[4]]; OP.t = o.op[5]; OP.atk = o.op[6] ? "you" : "foe"; if (ch) setHomes(); }
  o.p.forEach((a, i) => { const p = POINTS[i], ow = a[1] ? (a[1] === 1 ? "you" : "foe") : null; p.prog = a[0] / 100; p.n = { you: a[2], foe: a[3] }; if (ow !== p.owner) { p.owner = ow; ownerChanged(p); } });
  const seenQ = new Set(), seenG = new Set();
  for (const a of o.q) { let q = GH.sq.get(a[0]); const side = a[1] & 1 ? "you" : "foe", mine = !!(a[1] & 2);
    if (!q) { const fac = FACS[a[2]], def = FACTIONS[fac] && FACTIONS[fac].units[a[3]]; if (!def) continue; q = mkSquad(side, a[3], def, a[0], [0, 0], null, mine ? "you" : side === "you" ? "ally" : "foe", fac); q.order = null; GH.sq.set(a[0], q); SQUADS.push(q); if (mine && MAP.want && now - MAP.want < 5000) { MAP.sels = [q]; MAP.want = 0; } if (a[8]) { mkVeh(q, a[8][0], a[8][1]); q.c.set(a[8][0], 0, a[8][1]); } }
    seenQ.add(a[0]); q.state = a[5]; if (mine && !(q.holdT > now)) { q.auto = !!a[4]; q.path = a[6] ? a[6].map((n) => { const v = V3(n[0], 0, n[1]); if (n[2]) v.stop = true; return v; }) : []; q.order = a[7] ? { type: a[7][0] >= 0 ? "point" : "move", i: a[7][0], pos: a[7][3] ? V3(a[7][1], 0, a[7][2]) : null } : null; }
    if (q.veh && a[8]) { q.veh.net = a[8]; q.veh.hp = a[8][3]; if (!a[8][3] && q.veh.alive) wreckVeh(q.veh); } }
  for (const a of o.s) { let g = GH.g.get(a[0]); const q = GH.sq.get(a[1]); if (!q) continue; if (!g) { if (a[5] & 1) continue; g = mkSoldier(q, a[2], a[3], a[4], a[0]); GH.g.set(a[0], g); g.shots = a[6]; } seenG.add(a[0]); g.net = a; }
  for (const [id, g] of GH.g) if (!seenG.has(id)) { g.gone = true; try { g.s.remove(); } catch (e) {} GH.g.delete(id); }
  for (const [id, q] of GH.sq) if (!seenQ.has(id)) { if (q.veh && q.veh.alive) wreckVeh(q.veh); q.dead = true; GH.sq.delete(id); } }
function stepGuest(dt) { B.time += dt;
  for (const L of [ALLIES, GRUNTS]) for (let i = L.length - 1; i >= 0; i--) { const g = L[i], s = g.s, a = g.net; if (g.gone) { L.splice(i, 1); continue; } if (!a) continue; const p = s.root.position;
    if (a[5] & 1) { if (s.dead < 0) s.die(V3(p.x + (rnd() - .5) * 200, p.y, p.z + (rnd() - .5) * 200), { zone: "chest", force: 1 }); continue; } if (s.dead >= 0) continue;
    const d = Math.hypot(a[3] - p.x / U, a[4] - p.z / U); g.pt = (g.pt || 0) - dt;
    if (d > 9) s.place(a[3] * U, a[4] * U, groundH(a[3], a[4]) * U);
    else if (g.pt <= 0 && d > .9 && !s.busy) { g.pt = .3; if (s.cover) s.leaveCover(); if (s.crouch) s.setStance("stand"); s.autoCover = false; s.moveTo(V3(a[3] * U, 0, a[4] * U), a[7] ? "tacrun" : "run"); }
    else if (g.pt <= 0 && d <= .9 && !s.moving) { g.pt = .5; if (!!(a[5] & 2) !== !!s.crouch) s.setCrouch(!!(a[5] & 2)); }
    s.aimAt(a[7] ? V3(a[7][0] * U, a[7][1] * U, a[7][2] * U) : null);
    if (a[6] > g.shots) { g.shots = a[6]; if (!s.busy) { if (s.ammo <= 0) s.doReload(); else s.fire(g.W.burst); } } }
  for (let i = VEH.length - 1; i >= 0; i--) { const v = VEH[i], n = v.net; if (!v.alive) { VEH.splice(i, 1); continue; } if (!n) continue; const k = 1 - Math.exp(-dt * 8); v.pos.x += (n[0] - v.pos.x) * k; v.pos.z += (n[1] - v.pos.z) * k;
    let dy = (n[2] - v.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; v.yaw += dy * k; v.group.position.set(v.pos.x * U, (groundH(v.pos.x, v.pos.z) + hoverY(v)) * U, v.pos.z * U); v.group.rotation.y = v.yaw + Math.PI; }
  for (let i = SQUADS.length - 1; i >= 0; i--) { const sq = SQUADS[i]; if (sq.dead) { const k = MAP.sels.indexOf(sq); if (k >= 0) MAP.sels.splice(k, 1); SQUADS.splice(i, 1); continue; }
    const mem = sq.members.filter((g) => g.s.dead < 0 && !g.gone); if (sq.veh) sq.c.copy(sq.veh.pos); else if (mem.length) { sq.c.set(0, 0, 0); for (const g of mem) { sq.c.x += g.s.root.position.x / U; sq.c.z += g.s.root.position.z / U; } sq.c.divideScalar(mem.length); } sq.n = mem.length; }
  stepUtils(dt); }
// what another player asked for, applied to the real battle on the host. who is that player's commander key.
const theirs = (ids, who) => SQUADS.filter((q) => q.owner === who && ids.includes(q.id));
export const netIn = {
  dep: (id, who) => { deploy(who, id); },
  doc: (k, who) => { if (DOCTRINES[k]) B.doctrine[who] = k; },
  order: (a, who) => { const g = V3(a[1], 0, a[2]); g.ping = a[4] | 0; orderTo(g, !!a[3], theirs(a[0], who), true); },
  act: (a, who) => squadAct(a[0], theirs(a[1], who), true),
  util: (a, who) => { useUtil(a[0], V3(a[1], 0, a[2]), a[3] || undefined, who); },
  hit: (a, who, fromU) => { const sd = B.side[who], u = a[0] < 0 ? VEH.find((v) => v.sq.id === -a[0] && v.side !== sd) : [...ALLIES, ...GRUNTS].find((g) => g.id === a[0] && g.side !== sd); if (u) damage(u, Math.min(a[1], 9999), fromU, a[2] || "chest", who); } };

/* ---------- small pictures of each kind of unit, for the cards ---------- */
const THUMB = {}, tScene = new THREE.Scene(), tCam = new THREE.PerspectiveCamera(28, .8, 1, 4000), tRT = new THREE.WebGLRenderTarget(96, 120);
tScene.add(new THREE.HemisphereLight("#fff4e0", "#5a4a3c", 1.5)); { const d = new THREE.DirectionalLight("#fff0d8", 2.4); d.position.set(-.5, 1, .8); tScene.add(d); }
export function thumbOf(fac, id, side) { const key = fac + id + side; if (THUMB[key] !== undefined) return THUMB[key]; THUMB[key] = ""; try {
  const def = FACTIONS[fac].units[id]; let obj, done = () => {};
  if (def.veh) { obj = def.veh.build ? assetModel(def.veh.build, side) : genModel(def.veh.model); tScene.add(obj); done = () => tScene.remove(obj); }
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
const spotted = (sq) => sq.side === "you" || VEH.some((v) => v.alive && v.side === "you" && (v.def.veh.recon || v.def.veh.drone) && Math.hypot(v.pos.x - sq.c.x, v.pos.z - sq.c.z) < (v.def.veh.recon ? 35 : 30)) || SQUADS.some((o) => o.side === "you" && o.c.distanceTo(sq.c) < 70) || Math.hypot(B.hooks.pilot().at.x - sq.c.x, B.hooks.pilot().at.z - sq.c.z) < 70 || (B.hooks.titans().some((t) => t.team === "you" && t.pos.distanceTo(sq.c) < 50));
// the way a squad will go, for drawing: from where it is, through each node of its orders, in straight lines
const routeOf = (sq) => [[sq.c.x, sq.c.z], ...sq.path.map((p) => [p.x, p.z])];
const marks = new Map(); let markT = 0, live = new Set();
function mark(key, x, y, z, cls, html) { const [sx, sy, ok] = scr(x, y, z); let el = marks.get(key); if (!ok) { if (el) el.style.display = "none"; return null; } if (!el) { el = document.createElement("div"); mkEl.append(el); marks.set(key, el); }
  live.add(key); el.style.display = ""; if (el._c !== cls) { el.className = "mk " + cls; el._c = cls; } if (el._h !== html) { el.innerHTML = html; el._h = html; } el.style.left = (sx | 0) + "px"; el.style.top = (sy | 0) + "px"; return [sx, sy]; }
export function mapFrame(dt) { cam.updateMatrixWorld(); live = new Set(); const way = !!(MAP.keys.ShiftLeft || MAP.keys.ShiftRight) && MAP.sels.length > 0;
  const arm = MAP.arm; $("map-mode").style.display = way || arm ? "block" : "none"; $("map-mode").textContent = arm ? (arm.kind === "pod" ? "Click where the drop pod should land." : UTILS[arm.kind].ask) + " Esc to call it off." : "Stops: each click adds a stop on the way. Let go of Shift and click where they should end up."; mapEl.style.cursor = arm ? "copy" : way ? "cell" : "crosshair";
  for (const p of POINTS) mark("p" + p.name, p.x, 6, p.z, "pt " + (p.owner || "none"), `<b>${p.name}</b><span class="pl">${p.label}</span><i><u style="width:${Math.round(Math.abs(p.prog) * 100)}%;background:${p.prog > 0 ? "#8fe0f0" : "#e05a3a"}"></u></i>`);
  for (const sq of SQUADS) { if (!spotted(sq)) continue; const sel = MAP.sels.includes(sq), mine = sq.owner === "you", th = thumbOf(sq.fac, sq.defId, sq.side);
    const at = mark("s" + sq.id, sq.c.x, sq.veh ? 3.2 : 2.7, sq.c.z, "card " + sq.side + (sel ? " sel" : "") + (sq.side === "you" && !mine ? " ally" : ""), `${th ? `<img src="${th}">` : `<b>${sq.def.icon}</b>`}<span><strong>${sq.name}</strong>${sq.veh ? "" : ` <q>${"▮".repeat(sq.n)}</q>`}${mine ? `<em>${sq.state}</em>` : ""}</span>`); sq.scr = at; }
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
  const sup = B.supply.you; $("sup-fill").style.width = sup / 6 + "%"; $("sup-n").textContent = Math.floor(sup);
}
export const income = (who) => (B.over ? 0 : CPRATE);
let deckKey = "";
function drawDeck() { const side = B.fac.you, Un = FACTIONS[side].units, S = MAP.sels, pl = B.hooks.pilot();
  $("map-top").innerHTML = `${opLine()}${pl.dead > 0 ? ` <span class="warn">You are down. Back in ${pl.dead.toFixed(1)} s</span>` : ""}`;
  $("sup-rate").textContent = "+" + income("you").toFixed(0) + " each second · supply " + supUsed("you") + " of " + SUPCAP;
  const ticks = B.list.you.map((id) => `<s style="left:${Un[id].cost / 6}%" title="${Un[id].name}"><b>${Un[id].icon}</b></s>`).join(""); if ($("sup-ticks")._h !== ticks) { $("sup-ticks").innerHTML = ticks; $("sup-ticks")._h = ticks; }
  const dk = B.doctrine.you + "|" + Object.keys(UTILS).map((k) => Math.ceil(B.cd.you[k]) + (B.supply.you >= utilCost("you", k) ? "y" : "n")).join("") + (MAP.arm ? MAP.arm.kind + (MAP.arm.unit || "") : "") + B.list.you.map((id) => (B.supply.you >= Un[id].cost + POD_EXTRA ? "p" : "")).join("") + B.list.you.map((id) => (B.supply.you >= Un[id].cost ? 1 : 0) + (room("you", Un[id]) ? "r" : "f")).join("") + (B.over || "");
  if (dk !== deckKey) { deckKey = dk; $("map-doc").innerHTML = Object.entries(DOCTRINES).map(([k, [n]]) => `<button data-doc="${k}" class="${B.doctrine.you === k ? "on" : ""}" title="${DOCTRINES[k][1]}">${n}</button>`).join("");
    $("map-deck").innerHTML = B.list.you.map((id) => { const d = Un[id], rm = room("you", d) && !B.over, ok = B.supply.you >= d.cost && rm, st = !!(d.veh && d.veh.static), okP = (st ? B.supply.you >= d.cost : !d.veh && B.supply.you >= d.cost + POD_EXTRA) && rm, th = thumbOf(side, id, "you"), armed = MAP.arm && MAP.arm.kind === "pod" && MAP.arm.unit === id;
      return `<div class="dcard ${ok ? "" : "off"}${armed ? " arm" : ""}">${th ? `<img src="${th}">` : `<b>${d.icon}</b>`}<span><strong>${d.name}</strong><small>${st ? "Placed asset" : d.veh ? "Vehicle" : d.guns.length + " troops"} · ${d.cost} CP · ${d.sup || 3} supply</small><em>${ok ? "Ready" : !rm ? "No supply free" : "Not enough CP"}</em><span class="dbs">${st ? `<button class="db pod ${okP ? "" : "off"}" data-pod="${id}" title="Drop it onto a spot you click.">Place</button>` : `<button class="db ${ok ? "" : "off"}" data-dep="${id}" title="Bring them on at your base, or beside a drop beacon if your side has one.">Deploy</button>`}${d.veh ? "" : `<button class="db pod ${okP ? "" : "off"}" data-pod="${id}" title="Drop this squad from above onto a spot you click. Costs ${POD_EXTRA} more CP.">Drop pod +${POD_EXTRA}</button>`}</span></span></div>`; }).join("");
    $("map-util").innerHTML = Object.entries(UTILS).map(([k, u]) => { const cd = Math.ceil(B.cd.you[k]), ok = cd <= 0 && B.supply.you >= utilCost("you", k) && !B.over; return `<button class="ucard ${ok ? "" : "off"}${MAP.arm && MAP.arm.kind === k ? " arm" : ""}" data-util="${k}" title="${u.desc}"><b>${u.icon}</b><span><strong>${u.name}</strong><small>${cd > 0 ? "Ready in " + cd + " s" : utilCost("you", k) + " CP"}</small></span></button>`; }).join(""); }
  const selH = S.length === 1 ? `<strong>${S[0].name}${S[0].veh ? "" : " ×" + S[0].n}</strong><p>${S[0].state}.</p><p class="dim">${S[0].auto ? "This squad is choosing its own points." : S[0].lock ? "This squad is locked to its point. A ping will not pull it off." : "This squad is following your order."}</p>` : S.length ? `<strong>${S.length} squads picked</strong><p class="dim">${S.map((s) => s.name).join(", ")}</p>` :
    `<strong>No squad picked</strong><p class="dim">Left click a squad's card to pick it, or drag a box round several. Then left click where they should go. Hold Shift to add stops on the way.</p>`;
  const full = selH + (S.length ? `<div><button data-act="auto" class="${S.every((s) => s.auto) ? "on" : ""}">Choose their own</button><button data-act="hold">Hold here</button><button data-act="clear">Forget the stops</button><button data-act="none">Let go</button></div>` : ""); if ($("map-sel")._h !== full) { $("map-sel").innerHTML = full; $("map-sel")._h = full; }
}
// Send the picked squads to exactly where was clicked. With Shift each click is a stop on the way; the squads go from
// node to node in straight lines, and only a line that is blocked gets corners added to take it round.
export const pingTo = (g, sels, force) => { g.ping = force ? 2 : 1; orderTo(g, false, sels); };
function orderTo(g, way, sels = MAP.sels, asked = false) { if (g.ping === 1 && B.mp !== "guest") sels = sels.filter((q) => !q.lock); g.x = clamp(g.x, WORLD.x0 + 2, WORLD.x1 - 2); g.z = clamp(g.z, WORLD.z0 + 2, WORLD.z1 - 2); const i = POINTS.findIndex((p) => Math.hypot(p.x - g.x, p.z - g.z) < 8);
  if (B.mp === "guest" && !asked) B.hooks.net("order", [sels.map((q) => q.id), r1(g.x), r1(g.z), way ? 1 : 0, g.ping || 0]);
  for (const s of sels) { s.auto = false; if (!s.fresh) s.path = []; const start = s.path.length ? s.path[s.path.length - 1] : s.c, nodes = legNodes(start, g, !!s.veh), end = nodes[nodes.length - 1]; if (way) end.stop = true; s.path.push(...nodes); s.fresh = way; s.holdT = performance.now() + 700;
    s.order = !way && i >= 0 ? { type: "point", i, pos: end.clone() } : { type: "move", pos: end.clone() }; s.lock = !g.ping && !way && i >= 0; for (const m of s.members) m.moveT = 0; } if (!asked) drawDeck(); }
function squadAct(a, sels, asked = false) { if (B.mp === "guest" && !asked) B.hooks.net("act", [a, sels.map((q) => q.id)]);
  for (const s of sels) { if (a === "auto") { s.auto = true; s.think = 0; s.path = []; } else if (a === "hold") { s.auto = false; s.order = { type: "move", pos: s.c.clone() }; s.path = []; } else s.path = []; s.fresh = false; s.holdT = performance.now() + 700; } }
mapEl.addEventListener("contextmenu", (e) => e.preventDefault());
mapEl.addEventListener("wheel", (e) => { MAP.dist = clamp(MAP.dist * Math.exp(e.deltaY * .0012), 24, 300); e.preventDefault(); }, { passive: false });
mapEl.addEventListener("mousedown", (e) => { const b = e.target.closest("button");
  if (b) { if (b.dataset.dep) { const nq = deploy("you", b.dataset.dep); if (nq) MAP.sels = [nq]; else if (B.mp === "guest") MAP.want = performance.now(); deckKey = ""; } else if (b.dataset.pod) { MAP.arm = b.classList.contains("off") ? null : { kind: "pod", unit: b.dataset.pod }; deckKey = ""; } else if (b.dataset.util) { MAP.arm = b.classList.contains("off") ? null : { kind: b.dataset.util }; deckKey = ""; } else if (b.dataset.doc) { B.doctrine.you = LOAD.doctrine = b.dataset.doc; saveLoad(); deckKey = ""; if (B.mp === "guest") B.hooks.net("doc", b.dataset.doc); } else if (b.dataset.act) { const a = b.dataset.act; if (a === "none") MAP.sels = []; else squadAct(a, MAP.sels); } drawDeck(); return; }
  if (e.target.closest("#map-top, #map-bottom, #map-sel, #map-supply")) return; e.preventDefault();
  MAP.drag = { b: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }; });
addEventListener("mousemove", (e) => { const d = MAP.drag; if (!MAP.on || !d) return; const dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
  if (d.b === 2) { const k = MAP.dist / innerHeight * 1.25, s = Math.sin(MAP.ang), c = Math.cos(MAP.ang); MAP.tx = clamp(MAP.tx - (dx * c + dy * s) * k, WORLD.x0, WORLD.x1); MAP.tz = clamp(MAP.tz - (dy * c - dx * s) * k, WORLD.z0, WORLD.z1); }
  else if (d.b === 1) { MAP.ang -= dx * .006; MAP.tilt = clamp(MAP.tilt + dy * .003, .35, .97); }
  else if (d.b === 0 && d.moved) { boxEl.style.display = "block"; boxEl.style.left = Math.min(d.x, e.clientX) + "px"; boxEl.style.top = Math.min(d.y, e.clientY) + "px"; boxEl.style.width = Math.abs(e.clientX - d.x) + "px"; boxEl.style.height = Math.abs(e.clientY - d.y) + "px"; } });
addEventListener("mouseup", (e) => { const d = MAP.drag; if (!MAP.on || !d) return; MAP.drag = null; boxEl.style.display = "none"; if (d.b !== 0) return;
  if (d.moved) { const x0 = Math.min(d.x, e.clientX), x1 = Math.max(d.x, e.clientX), y0 = Math.min(d.y, e.clientY), y1 = Math.max(d.y, e.clientY); MAP.sels = SQUADS.filter((s) => s.owner === "you" && s.scr && s.scr[0] > x0 && s.scr[0] < x1 && s.scr[1] - 20 > y0 - 30 && s.scr[1] - 20 < y1 + 30); drawDeck(); return; }
  // a click: on a card it picks that squad; anywhere else it sends the picked squads there
  let pick = null, best = 1e9; for (const s of SQUADS) { if (s.owner !== "you" || !s.scr) continue; const ox = e.clientX - s.scr[0], oy = e.clientY - s.scr[1]; if (Math.abs(ox) < 78 && oy > -58 && oy < 6) { const dd = Math.abs(ox) + Math.abs(oy + 26); if (dd < best) { best = dd; pick = s; } } }
  if (MAP.arm) { const g = groundAt(e.clientX, e.clientY); if (g && useUtil(MAP.arm.kind, g, MAP.arm.unit)) { MAP.arm = null; deckKey = ""; drawDeck(); } return; }
  if (pick) { MAP.sels = [pick]; drawDeck(); return; }
  if (MAP.sels.length) { const g = groundAt(e.clientX, e.clientY); if (g) orderTo(g, e.shiftKey); } });
