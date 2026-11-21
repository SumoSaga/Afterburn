/* Afterburn: Galactic Conquest, from Hayden's campaign specification (2026-11-20), for one player against the machine.
   Nine systems joined by jump lanes between two capitals. Each side has Strike Fleets that move one lane a turn.
   A turn has the spec's four phases: income (taken for you), purchase (fleets, garrisons, Bonus Cards, resupply),
   movement (one fleet, one lane), and resolution (a clash in orbit if a fleet is there, then the ground assault,
   which is an operation fought in the game). Then the enemy takes its turn the same way.
   Systems give standing perks, results ripple into the next battle, and one Bonus Card can be played per operation.
   Ticket numbers in the spec are for a pool of 250; this game's pool is 30 a pilot, so they are scaled by 30/250.
   Kept in the browser under ab-campaign and in the save file. */
const KEY = "ab-campaign", TS = 30 / 250, tk = (n) => Math.round(n * TS);
export const TYPES = {
  capital: { name: "Capital Hub", kind: "town", perk: "150 more War Credits a turn. Lose it and the war is lost." },
  foundry: { name: "Mech Foundry", kind: "works", perk: "Your call-in meter starts every battle at 15." },
  comms: { name: "Comms Relay", kind: "mixed", perk: "Your tactical assets are ready a fifth sooner." },
  shipyard: { name: "Orbital Shipyard", kind: "airfield", perk: "One more Strike Fleet allowed, and an Orbital Strike you can call once for nothing." },
  supply: { name: "Fuel and Supply Depot", kind: "works", perk: tk(40) + " more tickets when you attack, and Command Points come in 15 percent faster." },
  fortress: { name: "Fortress World", kind: "works", perk: "When you defend, two auto-turrets are already standing at the first sector's points." },
  colony: { name: "Colony Hub", kind: "farm", perk: tk(50) + " more tickets when you attack." },
  tech: { name: "Tech Enclave", kind: "town", perk: "Your mech's core starts every battle a quarter charged." } };
const LAYOUT = [   // id, name, type, x, y on the map (0 to 100), lanes
  ["aegis", "Aegis Prime", "capital", 7, 50, ["astra", "helios"]], ["astra", "Port Astra", "shipyard", 27, 22, ["aegis", "vulcan", "aether"]], ["helios", "Helios Refinery", "supply", 27, 78, ["aegis", "vulcan", "prometheus"]],
  ["vulcan", "Vulcan-4", "foundry", 50, 50, ["astra", "helios", "aether", "prometheus"]], ["aether", "Aether Array", "comms", 51, 13, ["astra", "vulcan", "bastion9"]], ["prometheus", "Prometheus Station", "tech", 51, 87, ["helios", "vulcan", "veridian"]],
  ["bastion9", "Bastion-9", "fortress", 74, 24, ["aether", "haven"]], ["veridian", "Veridian Colony", "colony", 74, 76, ["prometheus", "haven"]], ["haven", "Haven Outpost", "capital", 93, 50, ["bastion9", "veridian"]]];
const WX = { aegis: "day", astra: "overcast", helios: "fog", vulcan: "storm", aether: "snow", prometheus: "rain", bastion9: "overcast", veridian: "day", haven: "clear" };   // each world has its own weather, and a battle there is fought in it
const START = { machine: ["aegis", "astra", "helios"], militia: ["haven", "bastion9", "veridian"] }, CAPITAL = { machine: "aegis", militia: "haven" };
export const CARDS = {
  garrison: { name: "Garrison Reinforcements", desc: tk(60) + " more tickets when you attack, or 150 more Command Points when you defend." },
  munitions: { name: "Enhanced Munitions", desc: "Your pilot's weapons do 15 percent more for the operation." },
  supremacy: { name: "Orbital Supremacy", desc: "Command Points come in 30 percent faster and your tactical assets are ready in half the time." },
  ace: { name: "Ace Mech Deployment", desc: "Your call-in meter starts at 50." },
  grid: { name: "Automated Defense Grid", desc: "When you defend, auto-turrets stand at every point of the first two sectors." },
  reserves: { name: "Emergency Reserves", desc: tk(60) + " more tickets when you attack, or 250 more Command Points when you defend." } };
export const other = (f) => (f === "militia" ? "machine" : "militia");
// what each faction is good at on the map (section 1 of the spec)
export const cost = (f, what) => ({ fleet: f === "machine" ? 160 : 200, fortify: f === "machine" ? 45 : 60, card: f === "militia" ? 60 : 80, resupply: 50 })[what];
export const CAMP = { s: null };
try { CAMP.s = JSON.parse(localStorage.getItem(KEY) || "null"); if (CAMP.s && CAMP.s.v !== 2) CAMP.s = null; } catch (e) {}
export const saveCamp = () => { try { if (CAMP.s) localStorage.setItem(KEY, JSON.stringify(CAMP.s)); else localStorage.removeItem(KEY); } catch (e) {} };
const S = () => CAMP.s, held = (f) => Object.values(S().nodes).filter((n) => n.owner === f), fleetsOf = (f) => S().fleets.filter((q) => q.f === f), log = (t) => S().log.unshift(t);
export const fleetCap = (f) => 2 + held(f).filter((n) => n.type === "shipyard").length;
export function newCampaign(fac) { const nodes = {}; for (const [id, name, type, x, y, adj] of LAYOUT) nodes[id] = { id, name, type, x, y, adj, wx: WX[id] || "clear", owner: START.machine.includes(id) ? "machine" : START.militia.includes(id) ? "militia" : "", gar: type === "fortress" || type === "capital" ? 2 : 1 };
  CAMP.s = { v: 2, fac, turn: 1, phase: "you", moved: false, credits: { machine: 150, militia: 150 }, nodes, fleets: [{ id: 1, f: "machine", at: "aegis", dep: false }, { id: 2, f: "militia", at: "haven", dep: false }], nid: 2, cards: { machine: [], militia: [] }, play: "", ripple: {}, dom: { machine: 0, militia: 0 }, pending: null, threat: null, sel: "", fsel: 0, log: [], over: "" };
  log("The war begins. Each side holds its capital and two systems, with one Strike Fleet at the capital. Three systems between you belong to nobody."); const got = income(fac); log("Turn 1. You collected " + got + " War Credits."); saveCamp(); return CAMP.s; }
function income(f) { const n = held(f); let got = 40 + n.length * 25 + n.filter((q) => q.type === "capital").length * 150; if (f === "machine") got = Math.round(got * 1.1); S().credits[f] += got; return got; }
/* ---------- purchase ---------- */
export function buyFleet() { const s = S(), f = s.fac; if (s.over || s.phase !== "you" || s.credits[f] < cost(f, "fleet") || fleetsOf(f).length >= fleetCap(f) || s.nodes[CAPITAL[f]].owner !== f) return false; s.credits[f] -= cost(f, "fleet"); s.fleets.push({ id: ++s.nid, f, at: CAPITAL[f], dep: false }); log("A new Strike Fleet is ready at " + s.nodes[CAPITAL[f]].name + "."); saveCamp(); return true; }
export function fortify(id) { const s = S(), n = s.nodes[id], f = s.fac; if (!n || n.owner !== f || s.credits[f] < cost(f, "fortify") || s.over) return false; s.credits[f] -= cost(f, "fortify"); n.gar++; log("You strengthened the garrison on " + n.name + "."); saveCamp(); return true; }
export function buyCard(k) { const s = S(), f = s.fac; if (!CARDS[k] || s.over || s.credits[f] < cost(f, "card")) return false; s.credits[f] -= cost(f, "card"); s.cards[f].push(k); log("You bought a Bonus Card: " + CARDS[k].name + "."); saveCamp(); return true; }
export function resupply(fid) { const s = S(), q = s.fleets.find((x) => x.id === fid), f = s.fac; if (!q || q.f !== f || !q.dep || s.credits[f] < cost(f, "resupply")) return false; s.credits[f] -= cost(f, "resupply"); q.dep = false; log("That fleet is resupplied."); saveCamp(); return true; }
export function setCard(k) { const s = S(); s.play = s.play === k ? "" : k; saveCamp(); }
/* ---------- movement and resolution ---------- */
// where a fleet may go this turn: one lane, or for the Coalition two if the first system is its own
export function reach(q) { const s = S(), out = new Set(); for (const a of s.nodes[q.at].adj) { out.add(a); if (q.f === "militia" && s.nodes[a].owner === "militia") for (const b of s.nodes[a].adj) if (b !== q.at) out.add(b); } return [...out]; }
export const canMove = (fid, to) => { const s = S(), q = s && s.fleets.find((x) => x.id === fid); return !!q && !s.over && s.phase === "you" && !s.moved && q.f === s.fac && reach(q).includes(to); };
const numOf = (id) => 1000 + LAYOUT.findIndex((q) => q[0] === id) * 137;
export const fieldFor = (id, role) => TYPES[S().nodes[id].type].kind + "-" + numOf(id) + "-s" + role;
// a clash in orbit, settled by the dice (there is no boarding fight in the game yet). The side that holds the system has the edge.
function orbit(att, node) { const s = S(), def = s.fleets.find((q) => q.f !== att.f && q.at === node.id); if (!def) return true; const win = Math.random() < (node.owner === def.f ? .4 : .5) + (def.dep ? .15 : 0) - (att.dep ? .15 : 0);
  if (win) { s.fleets.splice(s.fleets.indexOf(def), 1); log((att.f === s.fac ? "Your fleet won" : "Their fleet won") + " the clash over " + node.name + "."); if (att.f === s.fac) s.ripple.orbital = true; } else { s.fleets.splice(s.fleets.indexOf(att), 1); log((att.f === s.fac ? "Your fleet was lost" : "Their fleet was lost") + " in the clash over " + node.name + "."); } return win; }
export function moveFleet(fid, to) { if (!canMove(fid, to)) return null; const s = S(), q = s.fleets.find((x) => x.id === fid), n = s.nodes[to]; s.moved = true; s.fsel = 0;
  if (!orbit(q, n)) { check(); endYourTurn(); return null; } q.at = to;
  if (n.owner === s.fac) { log("Your fleet moved to " + n.name + "."); saveCamp(); return null; }
  if (!n.owner) { n.owner = s.fac; n.gar = 1; log("Your fleet took " + n.name + " unopposed."); check(); saveCamp(); return null; }
  s.pending = { id: to, role: "a", key: fieldFor(to, "a"), fleet: fid, card: s.play }; if (s.play) { s.cards[s.fac].splice(s.cards[s.fac].indexOf(s.play), 1); } s.play = ""; log("Your fleet is over " + n.name + ". The ground assault is on."); saveCamp(); return s.pending.key; }
export function endTurn() { const s = S(); if (!s || s.phase !== "you" || s.over || s.pending) return; endYourTurn(); }
function endYourTurn() { const s = S(); if (s.over) { saveCamp(); return; } enemyTurn(); saveCamp(); }
function check() { const s = S(), me = s.fac, e = other(me), N = Object.keys(s.nodes).length; if (s.over) return;
  if (s.nodes[CAPITAL[e]].owner === me || held(me).length === N) s.over = "won"; else if (s.nodes[CAPITAL[me]].owner === e || held(e).length === N) s.over = "lost";
  else if (!fleetsOf(e).length && s.credits[e] < cost(e, "fleet")) s.over = "won"; else if (!fleetsOf(me).length && s.credits[me] < cost(me, "fleet")) s.over = "lost";
  if (s.over) log(s.over === "won" ? "The war is won." : "The war is lost."); }
function dominance() { const s = S(), need = Math.ceil(Object.keys(s.nodes).length * .75); for (const f of ["machine", "militia"]) { s.dom[f] = held(f).length >= need ? s.dom[f] + 1 : 0; if (s.dom[f] >= 2 && !s.over) { s.over = f === s.fac ? "won" : "lost"; log(f === s.fac ? "You have held three quarters of the map for two turns. The war is won." : "They have held three quarters of the map for two turns. The war is lost."); } } }
// distance in lanes from a system to the nearest one a side does not hold, for the enemy's fleet to steer by
function stepToward(q, want) { const s = S(), seen = { [q.at]: null }, line = [q.at]; while (line.length) { const c = line.shift(); if (c !== q.at && want(s.nodes[c])) { let p = c; while (seen[p] !== q.at) p = seen[p]; return p; } for (const a of s.nodes[c].adj) if (!(a in seen)) { seen[a] = c; line.push(a); } } return null; }
function enemyTurn() { const s = S(), e = other(s.fac); s.phase = "enemy"; income(e);
  if (fleetsOf(e).length < Math.min(2, fleetCap(e)) && s.credits[e] >= cost(e, "fleet") && s.nodes[CAPITAL[e]].owner === e) { s.credits[e] -= cost(e, "fleet"); s.fleets.push({ id: ++s.nid, f: e, at: CAPITAL[e], dep: false }); log("They have built a Strike Fleet."); }
  else if (s.credits[e] >= cost(e, "fortify") + 100) { const own = held(e); own.sort((a, b) => a.gar - b.gar); own[0].gar++; s.credits[e] -= cost(e, "fortify"); }
  const fl = fleetsOf(e); let q = fl[Math.floor(Math.random() * fl.length)];
  if (q) { const to = stepToward(q, (n) => n.owner !== e); if (to) { const n = s.nodes[to]; if (orbit(q, n)) { q.at = to;
        if (!n.owner) { n.owner = e; n.gar = 1; log("Their fleet took " + n.name + " unopposed."); }
        else if (n.owner === s.fac) { s.threat = to; s.tfleet = q.id; s.phase = "defend"; log("Their fleet is over " + n.name + ". Defend it yourself or leave it to the garrison."); check(); saveCamp(); return; } } } }
  check(); nextTurn(); }
function nextTurn() { const s = S(); if (!s.over) dominance(); if (s.over) { saveCamp(); return; } s.turn++; s.phase = "you"; s.moved = false; s.threat = null; const got = income(s.fac); log("Turn " + s.turn + ". You collected " + got + " War Credits."); saveCamp(); }
export function startDefence() { const s = S(); s.pending = { id: s.threat, role: "d", key: fieldFor(s.threat, "d"), fleet: s.tfleet, card: s.play }; if (s.play) s.cards[s.fac].splice(s.cards[s.fac].indexOf(s.play), 1); s.play = ""; saveCamp(); return s.pending.key; }
export function autoDefend() { const s = S(), n = s.nodes[s.threat]; if (!n) return; const hold = Math.random() < Math.min(.85, .3 + n.gar * .15 + (n.type === "fortress" ? .15 : 0)); if (hold) { log("The garrison on " + n.name + " held."); n.gar = Math.max(1, n.gar - 1); } else { n.owner = other(s.fac); n.gar = 1; log(n.name + " has fallen."); } check(); nextTurn(); }
/* A battle fought in the game has ended. won is from your side of it; frac is the attackers' tickets left as a share of
   their pool and sector is how far they had come (0 is the first). The spec's ripples are worked out here. */
export function resolve(won, frac = .5, sector = 0) { const s = S(); if (!s || !s.pending) return ""; const p = s.pending, n = s.nodes[p.id], me = s.fac, e = other(me); s.pending = null; s.ripple = {}; let msg;
  if (p.role === "a") { const fl = s.fleets.find((q) => q.id === p.fleet);
    if (won) { n.owner = me; n.gar = 1; msg = n.name + " is yours."; if (frac > .4) { s.ripple.momentum = true; msg += " A decisive victory: your meter starts 15 higher in the next battle."; } else if (frac < .15) { if (fl) fl.dep = true; msg += " It was a close thing. That fleet is depleted until it is resupplied."; } }
    else { msg = "The attack on " + n.name + " failed."; if (fl) fl.at = fl.at === p.id ? (n.adj.find((a) => s.nodes[a].owner === me) || CAPITAL[me]) : fl.at; if (sector <= 1) { s.ripple.disrupted = true; msg += " They stopped you early: you start the next battle with fewer Command Points."; } }
    log(msg); check(); if (!s.over) endYourTurn(); }
  else { const fl = s.fleets.find((q) => q.id === p.fleet);
    if (won) { msg = "You held " + n.name + "."; if (fl) fl.at = n.adj.find((a) => s.nodes[a].owner === e) || CAPITAL[e]; if (sector <= 1) { s.ripple.momentum = true; msg += " A decisive defence: your meter starts 15 higher in the next battle."; } }
    else { n.owner = e; n.gar = 1; msg = n.name + " has fallen."; if (frac > .4) { s.ripple.disrupted = true; msg += " It was a rout: you start the next battle with fewer Command Points."; } }
    log(msg); check(); if (!s.over) nextTurn(); }
  saveCamp(); return msg; }
export const pendingFor = (mapKey) => (S() && S().pending && S().pending.key === mapKey ? S().pending : null);
/* Everything the campaign changes about the battle that is about to be fought, for your side. */
export function battleSetup() { const s = S(), p = s.pending, t = held(s.fac).map((n) => n.type), has = (x) => t.includes(x), atk = p.role === "a", c = p.card, fl = s.fleets.find((q) => q.id === p.fleet), o = { weather: s.nodes[p.id].wx || WX[p.id] || "", meter: 0, cp: 0, tickets: 0, assets: 1, core: 0, rate: 1, dmg: 1, turrets: 0, strike: false, notes: [] };
  if (has("foundry")) { o.meter += 15; o.notes.push("Foundry: meter at 15"); } if (has("comms")) { o.assets *= .8; o.notes.push("Relay: assets a fifth sooner"); } if (has("shipyard")) { o.strike = true; o.notes.push("Shipyard: one free Orbital Strike"); }
  if (has("supply")) { o.rate *= 1.15; if (atk) o.tickets += tk(40); o.notes.push("Depot: faster Command Points" + (atk ? ", " + tk(40) + " more tickets" : "")); } if (has("colony") && atk) { o.tickets += tk(50); o.notes.push("Colony: " + tk(50) + " more tickets"); }
  if (has("tech")) { o.core = .25; o.notes.push("Enclave: core a quarter charged"); } if (has("fortress") && !atk) { o.turrets = Math.max(o.turrets, 1); o.notes.push("Fortress: turrets at the first sector"); }
  if (s.ripple.momentum) { o.meter += 15; o.notes.push("Momentum: meter 15 higher"); } if (s.ripple.disrupted) { o.cp -= 40; o.notes.push("Disrupted: 40 fewer Command Points"); } if (s.ripple.orbital && atk) { o.cp += 60; o.notes.push("Won the orbit: 60 more Command Points"); }
  if (atk && fl && fl.dep) { o.tickets -= tk(30); o.notes.push("Depleted fleet: " + tk(30) + " fewer tickets"); }
  if (c === "garrison") { if (atk) o.tickets += tk(60); else o.cp += 150; } else if (c === "munitions") o.dmg = 1.15; else if (c === "supremacy") { o.rate *= 1.3; o.assets *= .5; } else if (c === "ace") o.meter = Math.max(o.meter, 50); else if (c === "grid" && !atk) o.turrets = 2; else if (c === "reserves") { if (atk) o.tickets += tk(60); else o.cp += 250; }
  if (c && CARDS[c]) o.notes.push("Card: " + CARDS[c].name); return o; }
// what your held systems give you, in words, for the map screen
export const standing = () => { const s = S(); return s ? [...new Set(held(s.fac).map((n) => n.type))].filter((t) => t !== "capital").map((t) => TYPES[t].name) : []; };
export function endCampaign() { CAMP.s = null; saveCamp(); }
