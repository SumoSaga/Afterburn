/* Afterburn: the campaign (step 7, a first cut made from section 6 of Hayden's outline, for one player against the machine).
   Nine systems joined by jump lanes, with each faction's capital at either end. A turn is: you collect War Credits for
   what you hold, you may spend them, you may attack one enemy system that touches one of yours (that is an operation,
   fought in the game, with you attacking), and then the enemy attacks one of yours (you defend it yourself, or leave it
   to the garrison and the dice). Systems give perks to whoever holds them, and those are applied to your side at the
   start of every campaign battle. You win by taking their capital or holding seven of the nine systems; you lose the
   same ways. Kept in the browser under ab-campaign and in the save file. */
const KEY = "ab-campaign";
export const TYPES = {
  capital: { name: "Capital", kind: "town", perk: "Lose it and the war is lost." },
  foundry: { name: "Mech Foundry", kind: "works", perk: "Your call-in meter starts every battle at 15." },
  supply: { name: "Supply Depot", kind: "farm", perk: "50 more Command Points at the start, and 10 more tickets when you attack." },
  comms: { name: "Comms Relay", kind: "mixed", perk: "Your tactical assets are ready a fifth sooner." },
  shipyard: { name: "Orbital Shipyard", kind: "airfield", perk: "20 more War Credits a turn." },
  fortress: { name: "Fortress World", kind: "works", perk: "Its own garrison starts at 2, and it is harder to take by the dice." },
  tech: { name: "Tech Enclave", kind: "town", perk: "Your core starts every battle a quarter charged." } };
const LAYOUT = [   // id, name, type, x, y on the map (0 to 100), lanes
  ["prime", "Directorate Prime", "capital", 8, 50, ["halcyon", "verge"]], ["halcyon", "Halcyon Yards", "shipyard", 28, 24, ["prime", "ostrava", "meridian"]], ["verge", "The Verge", "supply", 28, 76, ["prime", "ostrava", "kessel"]],
  ["ostrava", "Ostrava", "foundry", 50, 50, ["halcyon", "verge", "meridian", "kessel"]], ["meridian", "Meridian Relay", "comms", 52, 14, ["halcyon", "ostrava", "tarn"]], ["kessel", "Kessel Deep", "tech", 52, 86, ["verge", "ostrava", "brink"]],
  ["tarn", "Tarn's Wall", "fortress", 74, 26, ["meridian", "enclave"]], ["brink", "Brink", "supply", 74, 74, ["kessel", "enclave"]], ["enclave", "The Outer Enclave", "capital", 92, 50, ["tarn", "brink"]]];
const START = { machine: ["prime", "halcyon", "verge"], militia: ["enclave", "tarn", "brink"] };
export const CAMP = { s: null };
try { CAMP.s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
export const saveCamp = () => { try { if (CAMP.s) localStorage.setItem(KEY, JSON.stringify(CAMP.s)); else localStorage.removeItem(KEY); } catch (e) {} };
const other = (f) => (f === "militia" ? "machine" : "militia");
export function newCampaign(fac) { const nodes = {}; for (const [id, name, type, x, y, adj] of LAYOUT) nodes[id] = { id, name, type, x, y, adj, owner: START.machine.includes(id) ? "machine" : START.militia.includes(id) ? "militia" : "", gar: type === "fortress" || type === "capital" ? 2 : 1 };
  CAMP.s = { v: 1, fac, turn: 1, phase: "you", credits: { [fac]: 100, [other(fac)]: 100 }, nodes, pending: null, threat: null, log: ["The war begins. You hold three systems and so do they. The three between you belong to nobody."], over: "" }; income(fac); saveCamp(); return CAMP.s; }
const held = (f) => Object.values(CAMP.s.nodes).filter((n) => n.owner === f);
function income(f) { const n = held(f), got = 40 + n.length * 15 + n.filter((q) => q.type === "shipyard").length * 20; CAMP.s.credits[f] += got; return got; }
export const canAttack = (id) => { const s = CAMP.s, n = s && s.nodes[id]; return !!n && !s.over && s.phase === "you" && n.owner !== s.fac && n.adj.some((a) => s.nodes[a].owner === s.fac); };
const numOf = (id) => 1000 + LAYOUT.findIndex((q) => q[0] === id) * 137;
export const fieldFor = (id, role) => TYPES[CAMP.s.nodes[id].type].kind + "-" + numOf(id) + "-s" + role;
function check() { const s = CAMP.s, mine = held(s.fac).length, cap = (f) => Object.values(s.nodes).find((n) => n.type === "capital" && START[f].includes(n.id)); if (cap(other(s.fac)).owner === s.fac || mine >= 7) s.over = "won"; else if (cap(s.fac).owner !== s.fac || held(other(s.fac)).length >= 7) s.over = "lost"; if (s.over) s.log.unshift(s.over === "won" ? "The war is won." : "The war is lost."); }
// the enemy's turn: it collects, sometimes reinforces, takes an empty system if one touches it, or else threatens one of yours
function enemyTurn() { const s = CAMP.s, e = other(s.fac); if (s.over) return; income(e);
  const reach = Object.values(s.nodes).filter((n) => n.owner !== e && n.adj.some((a) => s.nodes[a].owner === e)), free = reach.filter((n) => !n.owner);
  if (free.length && Math.random() < .7) { const n = free[Math.floor(Math.random() * free.length)]; n.owner = e; n.gar = 1; s.log.unshift("They moved into " + n.name + " unopposed."); check(); nextTurn(); return; }
  const yours = reach.filter((n) => n.owner === s.fac); if (yours.length) { yours.sort((a, b) => a.gar - b.gar); s.threat = yours[0].id; s.phase = "defend"; s.log.unshift("They are attacking " + yours[0].name + ". Defend it yourself or leave it to the garrison."); saveCamp(); return; }
  if (s.credits[e] >= 60) { const own = held(e); const n = own[Math.floor(Math.random() * own.length)]; n.gar++; s.credits[e] -= 60; }
  nextTurn(); }
function nextTurn() { const s = CAMP.s; if (s.over) { saveCamp(); return; } s.turn++; s.phase = "you"; s.threat = null; const got = income(s.fac); s.log.unshift("Turn " + s.turn + ". You collected " + got + " War Credits."); saveCamp(); }
export function pass() { const s = CAMP.s; if (!s || s.phase !== "you" || s.over) return; s.log.unshift("You held your ground this turn."); enemyTurn(); saveCamp(); }
export function reinforce(id) { const s = CAMP.s, n = s.nodes[id]; if (!n || n.owner !== s.fac || s.credits[s.fac] < 60 || s.over) return false; s.credits[s.fac] -= 60; n.gar++; s.log.unshift("You strengthened the garrison on " + n.name + "."); saveCamp(); return true; }
// take an empty system without a fight
export function occupy(id) { const s = CAMP.s, n = s.nodes[id]; if (!canAttack(id) || n.owner) return false; n.owner = s.fac; n.gar = 1; s.log.unshift("You moved into " + n.name + " unopposed."); check(); enemyTurn(); saveCamp(); return true; }
export function startBattle(id, role) { const s = CAMP.s; s.pending = { id, role, key: fieldFor(id, role) }; saveCamp(); return s.pending.key; }
export function autoDefend() { const s = CAMP.s, n = s.nodes[s.threat]; if (!n) return; const hold = Math.random() < Math.min(.85, .3 + n.gar * .15 + (n.type === "fortress" ? .15 : 0)); if (hold) { s.log.unshift("The garrison on " + n.name + " held."); n.gar = Math.max(1, n.gar - 1); } else { n.owner = other(s.fac); n.gar = 1; s.log.unshift(n.name + " has fallen."); } check(); nextTurn(); }
// a battle fought in the game has ended. won is from your side of it.
export function resolve(won) { const s = CAMP.s; if (!s || !s.pending) return ""; const p = s.pending, n = s.nodes[p.id]; s.pending = null; let msg;
  if (p.role === "a") { if (won) { n.owner = s.fac; n.gar = 1; msg = n.name + " is yours."; } else msg = "The attack on " + n.name + " failed."; s.log.unshift(msg); check(); if (!s.over) enemyTurn(); }
  else { if (won) msg = "You held " + n.name + "."; else { n.owner = other(s.fac); n.gar = 1; msg = n.name + " has fallen."; } s.log.unshift(msg); check(); if (!s.over) nextTurn(); }
  saveCamp(); return msg; }
export const pendingFor = (mapKey) => (CAMP.s && CAMP.s.pending && CAMP.s.pending.key === mapKey ? CAMP.s.pending : null);
export const perks = () => { const s = CAMP.s, t = s ? held(s.fac).map((n) => n.type) : []; return { meter: t.includes("foundry") ? 15 : 0, cp: t.includes("supply") ? 50 : 0, tickets: t.includes("supply") ? 10 : 0, assets: t.includes("comms") ? .8 : 1, core: t.includes("tech") ? .25 : 0 }; };
export function endCampaign() { CAMP.s = null; saveCamp(); }
