/* Afterburn: the map maker.
   Given a key such as "town-4172" this lays out a whole battlefield and hands the engine a plan to build. The same
   key always gives the same field, so every player in a match stands on the same ground.

   The frame never changes: the south base, the north base, and five places to fight over between them. The five are
   set out so that neither base is closer to them than the other (turn the map half a turn about its middle and each
   place lands on its partner). What stands at each place is not mirrored.

   A place is a district: two streets that cross at the point, buildings fronting the streets with alleys between,
   yards behind, and scatter laid down by rule (against walls, along kerbs, round the square, in the open).
   Each district has a kit: town, works, airfield or farm. Between districts run roads with poles, wrecks and
   road blocks, and out in the hills are small outposts: a camp, a farmstead, a fuel stop, a relay, a crash.

   Nothing here touches the scene. Every piece is written down as a line in plan.prims or plan.gens, with its height
   left for the engine to read off the ground. */
const hashStr = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed) { let a = seed >>> 0; const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (x, y) => x + r() * (y - x); r.int = (x, y) => Math.floor(x + r() * (y - x + 1)); r.pick = (arr) => arr[Math.floor(r() * arr.length)]; r.chance = (p) => r() < p; r.sign = () => (r() < .5 ? -1 : 1);
  r.w = (list) => { let s = 0; for (const q of list) s += q[1]; let k = r() * s; for (const q of list) { k -= q[1]; if (k <= 0) return q[0]; } return list[0][0]; }; return r; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, sm = (t) => t * t * (3 - 2 * t);
const CON = "#7d858a", CON2 = "#a1a7a8", STEEL = "#5f676d", DRAB = "#4f5a3c", DRAB2 = "#66704a", RUST = "#7c3a1e", SAND = "#917b5f", WOOD = "#5c4030", WOOD2 = "#76634c", DARK = "#2a2724";
const BOXCOL = [RUST, "#3f6f9a", DRAB, STEEL, "#c9733a", "#8a3a2a", "#b9a582"];

// a field made in the editor, read back from this browser's library by its number
const DESIGN = (id) => { try { const d = JSON.parse(localStorage.getItem("ab-maps") || "{}")[id]; return d && Array.isArray(d.pts) && d.pts.length && [...new Set(d.pts.map((p) => p.s))].sort().every((s, i) => s === i) ? d : null; } catch (e) { return null; } };
export const THEMES = { custom: "Custom field", highlands: "Highlands", colony: "Frontier colony", city: "City blocks", ship: "Ship boarding", mixed: "Mixed country", town: "Town", works: "Works", airfield: "Airfield", farm: "Farmland" };
/* front: what stands along the streets. yard: what fills the ground behind. veh: what is parked or wrecked.
   wall: what leans against buildings. open: what is dropped on open ground. sq: what stands round the square. */
const KITS = {
  town: { names: ["Market street", "Old town", "High street", "Crossroads", "Church row"], street: "asphalt", sw: 8, ground: "dirt", walk: "pave", tight: .6, park: .5,
    front: [["shop", 3], ["rowhouse", 4], ["stripmall", 1], ["diner", 1], ["apartment", 1], ["clinic", .7], ["office", .6], ["firestation", .5], ["house", 1.2]], mark: ["church", "watertower"], yard: [["house", 3], ["rowhouse", 1], ["cabin", .6]], yardN: 7,
    veh: [["sedan", 4], ["taxi", 2], ["suv", 2], ["van", 1], ["citybus", .7], ["pickup", 1], ["motorcycle", 1], ["police", .5], ["ambulance", .3]],
    wall: [["dumpster", 3], ["crates", 2], ["barrels", 1.5], ["pallets", 1.5], ["ac", 2], ["bench", 1]], open: [["wall", 2], ["tree", 3], ["bush", 3], ["crates", 1], ["stall", 1.5], ["rubble", 1.5], ["sandbag", 1], ["planter", 1], ["busstop", .6], ["billboard", .4]],
    sq: [["stall", 2], ["planter", 2], ["barrier", 1], ["sandbag", 1.5], ["veh", 2], ["bench", 1], ["crates", 1]] },
  works: { names: ["The works", "Tank yard", "Freight depot", "Pump station", "Foundry"], street: "asphalt", sw: 9, ground: "apron", walk: "apron", tight: .25, park: .3,
    front: [["warehouse", 4], ["office", .8], ["firestation", .4], ["fueltank", 2], ["silo", 1], ["shop", .4]], mark: ["watertower", "celltower"], yard: [["fueltank", 2], ["silo", 1.5], ["warehouse", 1]], yardN: 5,
    veh: [["boxtruck", 3], ["semi", 2], ["pickup", 2], ["van", 1], ["tractor", .4]],
    wall: [["crates", 3], ["barrels", 3], ["pallets", 2], ["dumpster", 1], ["ac", 1], ["tank", 1.5]], open: [["container", 5], ["container2", 3], ["crates", 2], ["barrels", 2], ["piperack", 1.5], ["wall", 2], ["tank", 1.5], ["rubble", 1], ["sandbag", 1], ["bush", 1]],
    sq: [["container", 2], ["barrier", 2], ["crates", 2], ["sandbag", 1.5], ["veh", 1.5], ["barrels", 1]] },
  airfield: { names: ["The airfield", "Terminal", "Flight line", "The strip"], street: "runway", sw: 14, ground: "apron", walk: "apron", tight: .15, park: .12,
    front: [["hangar", 3], ["terminal", 1.2], ["warehouse", 1], ["fueltank", 1.5], ["office", .5]], mark: ["tower"], yard: [["airliner", 2], ["fueltank", 2], ["hangar", 1]], yardN: 4,
    veh: [["ambulance", 1], ["firetruck", 2], ["boxtruck", 2], ["van", 2], ["humvee", 1], ["citybus", 1]],
    wall: [["crates", 3], ["barrels", 2], ["pallets", 2], ["ac", 1]], open: [["container", 3], ["crates", 3], ["barrier", 3], ["barrels", 1], ["sandbag", 1.5], ["tent", 1], ["hesco", 1.5]],
    sq: [["barrier", 3], ["crates", 2], ["sandbag", 2], ["veh", 2], ["container", 1]] },
  farm: { names: ["The farm", "Mill lane", "Home fields", "The orchard", "Chapel end"], street: "track", sw: 5, ground: "grass", walk: "dirt", tight: 0, park: .2, fields: 3,
    front: [["house", 2], ["cabin", 3], ["barn", 2.5], ["silo", 1.5], ["shop", .4], ["church", .3]], mark: ["watertower", "silo"], yard: [["barn", 2], ["silo", 2], ["cabin", 1]], yardN: 4,
    veh: [["tractor", 3], ["pickup", 3], ["sedan", 1], ["schoolbus", .4]],
    wall: [["bales", 3], ["crates", 2], ["barrels", 2], ["pallets", 1]], open: [["bales", 4], ["fence", 4], ["tree", 4], ["bush", 3], ["crates", 1], ["rock", 2], ["tank", .6]],
    sq: [["bales", 2], ["fence", 1], ["veh", 2], ["crates", 1.5], ["sandbag", 1]] } };
const CAPS = { apartment: 2, office: 2, terminal: 1, church: 2, firestation: 2, airliner: 2 }, THIN = { watertower: .9, billboard: .4, celltower: 1.1, busstop: 0 };
const MIX = { highlands: ["works", "town", "farm", "airfield", "works", "town"], colony: ["works", "airfield", "works", "works"], city: ["works", "town", "works", "airfield", "town"], ship: ["works", "airfield", "works", "airfield"], mixed: null, town: ["town", "town", "town", "farm", "works"], works: ["works", "works", "works", "town", "airfield"], airfield: ["airfield", "works", "airfield", "town", "works"], farm: ["farm", "farm", "farm", "town", "works"] };

export function planMap(key, api) {
  const kp = key.split("-"), DZ = kp[0] === "custom" ? DESIGN(kp[1]) : null, theme = THEMES[kp[0]] ? (kp[0] === "custom" && !DZ ? "colony" : kp[0]) : "mixed", size = (kp[2] || "sa")[0], flip = (kp[2] || "sa")[1] === "d", R = rng(hashStr(kp[0] + "-" + kp[1] + "-" + size + (api.salt ? "~" + api.salt : ""))), wear = R.range(.25, .7);
  const plan = { key, theme, zones: [], sites: [], districts: [], roads: [], prims: [], gens: [], trees: [], bushes: [], rocks: [], paint: [], yards: [], halls: [], lit: 0 };   // halls: the roofed buildings, [x0, z0, x1, z1, height], which no mech may enter
  const P = plan.prims, occ = [], keep = [], count = {}, HIGH = theme === "highlands", COLONY = theme === "colony", CITY = theme === "city" || COLONY, URB = CITY, SHIP = theme === "ship", CUSTOM = theme === "custom", FLAT = CITY || SHIP || CUSTOM, mz = (z) => ((kp[2] || "sa")[1] === "d" ? -42 - z : z); plan.indoor = SHIP;   // City blocks and Ship boarding are built on level ground for pilots: see the urban layer below
  const fits = (x0, z0, x1, z1, m = 0, lists = [occ, keep]) => { if (CUSTOM) return true; for (const L of lists) for (const o of L) if (x0 - m < o[2] && x1 + m > o[0] && z0 - m < o[3] && z1 + m > o[1]) return false; return true; };
  const S = (x, z, w, h, d, col, o, dy = 0) => P.push(["s", x, z, w, h, d, col, o || { stripe: false, base: col, cap: col }, dy]), D = (x, z, w, h, d, col, dy = 0, roof = 0) => P.push(["d", x, z, w, h, d, col, dy, roof]), G = (x, z, w, h, d, dy = 0) => P.push(["g", x, z, w, h, d, dy]);
  const state = () => { const k = R(); return k < wear * .22 ? "ruined" : k < wear * .75 ? "damaged" : "timber"; };

  /* ---------- small things built from boxes: each gives its size (along, across) and how to put it down turned or not ---------- */
  const B = (x, z, r, ox, oz, lw, h, ld, col, o, dy) => S(x + (r ? oz : ox), z + (r ? ox : oz), r ? ld : lw, h, r ? lw : ld, col, o, dy), Dd = (x, z, r, ox, oz, lw, h, ld, col, dy) => D(x + (r ? oz : ox), z + (r ? ox : oz), r ? ld : lw, h, r ? lw : ld, col, dy);
  const PROPS = {
    barrier: () => ({ w: 3, d: .6, put: (x, z, r) => { B(x, z, r, 0, 0, 3, .95, .55, CON2); Dd(x, z, r, 0, 0, 3.02, .12, .2, "#c9733a", .95); } }),
    sandbag: () => { const len = R.pick([2.8, 3.5, 4.2]); return { w: len, d: .7, put: (x, z, r) => P.push(["sb", x, z, len, r]) }; },
    hesco: () => { const n = R.int(2, 4); return { w: n * 1.35, d: 1.35, put: (x, z, r) => { for (let i = 0; i < n; i++) { B(x, z, r, (i - (n - 1) / 2) * 1.35, 0, 1.3, 1.4, 1.3, "#8f7d5a"); Dd(x, z, r, (i - (n - 1) / 2) * 1.35, 0, 1.1, .12, 1.1, "#6c5a44", 1.4); } } }; },
    crates: () => { const two = R.chance(.6), top = R.chance(.5), c1 = R.pick([DRAB, DRAB2, WOOD2]), c2 = R.pick([DRAB, DRAB2, WOOD2]); return { w: two ? 2.9 : 1.5, d: 1.5, put: (x, z, r) => { const o = two ? -.7 : 0; B(x, z, r, o, 0, 1.4, 1.2, 1.4, c1); if (two) B(x, z, r, .75, .1, 1.2, 1, 1.2, c2); if (top) B(x, z, r, o, 0, 1, .9, 1, c2, null, 1.2); } }; },
    barrels: () => { const n = R.int(2, 5); return { w: 1.6, d: 2.4, put: (x, z) => P.push(["br", x - .4, z - .8, n]) }; },
    dumpster: () => { const c = R.pick(["#3b5a44", "#4a5560", "#5a4a3a"]); return { w: 2.2, d: 1.2, put: (x, z, r) => { B(x, z, r, 0, 0, 2.1, 1.25, 1.1, c); Dd(x, z, r, 0, 0, 2.2, .1, 1.2, DARK, 1.25); } }; },
    container: () => { const c = R.pick(BOXCOL); return { w: 6.2, d: 2.5, put: (x, z, r) => { B(x, z, r, 0, 0, 6.1, 2.6, 2.44, c); Dd(x, z, r, 3.06, 0, .06, 2.3, 2.2, DARK, .15); for (let i = -2; i <= 2; i++) Dd(x, z, r, i * 1.1, 0, .12, 2.5, 2.5, c, .05); } }; },
    container2: () => { const c = R.pick(BOXCOL), c2 = R.pick(BOXCOL), sh = R.range(-1.2, 1.2), two = R.chance(.5); return { w: 6.2, d: two ? 5.1 : 2.5, put: (x, z, r) => { const o = two ? -1.3 : 0; B(x, z, r, 0, o, 6.1, 2.6, 2.44, c); B(x, z, r, sh, o, 6.1, 2.6, 2.44, c2, null, 2.6); if (two) B(x, z, r, 0, 1.3, 6.1, 2.6, 2.44, R.pick(BOXCOL)); } }; },
    stall: () => { const c = R.pick(["#b0312a", "#3f6f9a", "#c9a23a", "#e2d0ae", "#4f7a4a"]); return { w: 3, d: 2, put: (x, z, r) => { B(x, z, r, 0, .3, 2.6, .95, .9, WOOD2); for (const [a, b] of [[-1.4, -.9], [1.4, -.9], [-1.4, .9], [1.4, .9]]) Dd(x, z, r, a, b, .08, 2.3, .08, DARK); Dd(x, z, r, 0, 0, 3, .1, 2, c, 2.3); Dd(x, z, r, 0, -1, 3, .35, .06, c, 1.95); for (let i = 0; i < 3; i++) Dd(x, z, r, -.8 + i * .8, .3, .5, .25, .5, R.pick(BOXCOL), .95); } }; },
    bench: () => ({ w: 1.8, d: .6, soft: true, put: (x, z, r) => { Dd(x, z, r, 0, 0, 1.8, .08, .5, WOOD2, .42); Dd(x, z, r, -.7, 0, .1, .42, .4, DARK); Dd(x, z, r, .7, 0, .1, .42, .4, DARK); Dd(x, z, r, 0, .22, 1.8, .4, .06, WOOD2, .5); } }),
    planter: () => ({ w: 2.4, d: 1, put: (x, z, r) => { B(x, z, r, 0, 0, 2.4, .6, 1, CON); plan.bushes.push([R.pick(["round", "leafy", "fern"]), x, z, .7, .55]); } }),
    pallets: () => { const n = R.int(2, 6); return { w: 1.3, d: 1.1, soft: true, put: (x, z, r) => { for (let i = 0; i < n; i++) Dd(x + R.range(-.05, .05), z + R.range(-.05, .05), r, 0, 0, 1.2, .14, 1, R.chance(.5) ? WOOD2 : "#6a5840", i * .16); } }; },
    ac: () => ({ w: 1.2, d: .9, put: (x, z, r) => { B(x, z, r, 0, 0, 1.1, .9, .8, "#8a8e92"); Dd(x, z, r, 0, 0, .7, .06, .5, DARK, .9); } }),
    bales: () => { const n = R.int(1, 3); return { w: 2.8, d: 1, put: (x, z, r) => { const c = "#c9a85a"; B(x, z, r, -.7, 0, 1.3, .9, .9, c); if (n > 1) B(x, z, r, .7, 0, 1.3, .9, .9, "#b9984a"); if (n > 2) B(x, z, r, 0, 0, 1.3, .9, .9, c, null, .9); } }; },
    tent: () => ({ w: 3.8, d: 4.8, put: (x, z, r) => { B(x, z, r, 0, 0, 3.6, 1.7, 4.6, DRAB2); Dd(x, z, r, 0, 0, 2.5, .5, 4.6, DRAB2, 1.7); Dd(x, z, r, 0, 0, 1.2, .35, 4.6, DRAB, 2.2); Dd(x, z, r, 0, 2.32, 1.1, 1.5, .06, DARK); } }),
    tower: () => ({ w: 3.8, d: 3.8, put: (x, z) => { const c = "#463a2d"; for (const [a, b] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) { S(x + a, z + b, .28, 4.6, .28, c); D(x + a, z + b, .14, 2.3, .14, c, 4.9); }
      S(x, z, 3.4, .3, 3.4, WOOD2, null, 4.6); S(x, z - 1.64, 3.4, 1, .12, WOOD, null, 4.9); S(x - 1.64, z, .12, 1, 3.4, WOOD, null, 4.9); S(x + 1.64, z, .12, 1, 3.4, WOOD, null, 4.9); D(x, z, 3.9, .18, 3.9, DRAB, 7.1); for (let i = 0; i < 9; i++) D(x, z + 1.72, .9, .06, .08, c, .4 + i * .5); D(x - .45, z + 1.72, .07, 4.7, .07, c); D(x + .45, z + 1.72, .07, 4.7, .07, c); } }),
    piperack: () => ({ w: 6.8, d: 1, put: (x, z, r) => { B(x, z, r, -3.1, 0, .3, 4, .3, STEEL); B(x, z, r, 3.1, 0, .3, 4, .3, STEEL); Dd(x, z, r, 0, -.3, 6.8, .3, .3, RUST, 3.6); Dd(x, z, r, 0, .05, 6.8, .22, .22, CON2, 3.65); Dd(x, z, r, 0, .35, 6.8, .26, .26, "#3b4430", 3.6); Dd(x, z, r, 0, 0, 6.6, .12, 1, DARK, 3.45); } }),
    tank: () => { const rr = R.range(1.2, 1.9), h = R.range(2.4, 4.2), c = R.pick([RUST, CON2, "#3b4430", "#8a8e92"]); return { w: rr * 2 + .2, d: rr * 2 + .2, put: (x, z) => P.push(["ct", x, z, rr, h, c]) }; },
    rubble: () => ({ w: 2.6, d: 2.2, put: (x, z) => { S(x, z, 1.6, .5, 1.2, "#6f6a62"); for (let i = 0; i < 7; i++) D(x + R.range(-1.2, 1.2), z + R.range(-1, 1), R.range(.3, .9), R.range(.15, .5), R.range(.3, .9), R.pick(["#6f6a62", "#7a756c", "#8a5a44", "#625d56"])); } }),
    wall: () => { const len = R.pick([4, 6, 8]), c = R.pick(["#8a5a44", CON, "#9a8f80"]), gap = R.chance(.4); return { w: len, d: .4, put: (x, z, r) => { if (gap) { B(x, z, r, -len / 4 - .5, 0, len / 2 - 1, 1.7, .35, c); B(x, z, r, len / 4 + .5, 0, len / 2 - 1, 1.1, .35, c); } else B(x, z, r, 0, 0, len, 1.7, .35, c); Dd(x, z, r, 0, 0, len + .1, .1, .45, "#3c4046", gap ? 1.1 : 1.7); } }; },
    fence: () => { const len = R.pick([5, 7.5, 10]); return { w: len, d: .3, put: (x, z, r) => { B(x, z, r, 0, 0, len, 1.05, .12, WOOD, { hide: true }); for (let u = -len / 2; u <= len / 2 + .01; u += 2.5) Dd(x, z, r, u, 0, .14, 1.2, .14, WOOD); Dd(x, z, r, 0, 0, len, .1, .06, WOOD2, .95); Dd(x, z, r, 0, 0, len, .1, .06, WOOD2, .5); } }; },
    lamp: () => ({ w: .4, d: .4, put: (x, z, r, dx = 1, dz = 0) => { S(x, z, .22, 6, .22, DARK); D(x + dx * .7, z + dz * .7, dx ? 1.5 : .16, .14, dz ? 1.5 : .16, DARK, 5.9); G(x + dx * 1.3, z + dz * 1.3, .4, .14, .34, 5.72); } }),
    pole: () => ({ w: .4, d: .4, put: (x, z, r) => { S(x, z, .26, 7.5, .26, WOOD); Dd(x, z, r, 0, 0, 2.2, .14, .14, WOOD, 6.8); Dd(x, z, r, -.9, 0, .1, .2, .1, CON2, 6.94); Dd(x, z, r, .9, 0, .1, .2, .1, CON2, 6.94); } }) };
  const prop = (name, x, z, r, m = .25, lists) => { if (name === "tree") { if (!fits(x - .5, z - .5, x + .5, z + .5, .3, lists)) return false; occ.push([x - .4, z - .4, x + .4, z + .4]); plan.trees.push([R.pick(["oak", "birch", "pine", "dead", "oak"]), x, z, R.range(.7, 1.05)]); return true; }
    if (name === "bush") { plan.bushes.push([R.pick(["dry", "leafy", "nettle", "round", "fern"]), x, z, R.range(.8, 1.3), 0]); return true; } if (name === "rock") { plan.rocks.push([x, z, R.range(4, 13)]); return true; }
    if (name === "busstop" || name === "billboard") return gen(name, x, z, r ? Math.PI / 2 : 0, state(), m);
    const q = PROPS[name](), hw = (r ? q.d : q.w) / 2, hd = (r ? q.w : q.d) / 2; if (!q.soft && !fits(x - hw, z - hd, x + hw, z + hd, m, lists)) return false; if (!q.soft) occ.push([x - hw, z - hd, x + hw, z + hd]); q.put(x, z, r); return true; };
  // one of the Table's generated pieces: a building, a structure or a vehicle. rot is the way its front faces.
  function gen(type, x, z, rot, st, m = .5, lists, seed = R.int(0, 3)) { if (CAPS[type] && (count[type] || 0) >= CAPS[type]) return false; const model = "gen:" + type + ":" + seed, dm = api.dims(model); if (!dm) return false; const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), hw = (dm[0] * c + dm[2] * s) / 2, hd = (dm[0] * s + dm[2] * c) / 2;
    if (!fits(x - hw, z - hd, x + hw, z + hd, m, lists)) return false; const veh = api.isVeh(type), thin = THIN[type]; if (thin !== 0) { const k = thin ? thin / Math.max(hw, hd) : 1; occ.push([x - hw * k, z - hd * k, x + hw * k, z + hd * k]); }
    count[type] = (count[type] || 0) + 1; plan.gens.push({ model, type, state: st, x, z, rot, kind: veh ? "v" : thin !== undefined ? "t" : "b", core: thin || 0, hw, hd }); return { hw, hd, model }; }
  const vehicle = (kit, x, z, rot, lists) => gen(R.w(kit.veh), x, z, rot + R.range(-.12, .12) + (R.chance(.5) ? Math.PI : 0), R.w([["timber", .45], ["damaged", .3], ["ruined", .25]]), .3, lists);

  /* ---------- the sectors: bands across the field from the attackers' base to the citadel ----------
     a is how far a band is from the attackers' base edge (0) toward the defenders' (250). Each band is [a, half size, points]. */
  const SPEC = { s: { bands: [[42, 30, 2], [120, 30, 2], [206, 34, 1]], xr: [36, 44] }, m: { bands: [[30, 25, 2], [88, 25, 2], [146, 25, 2], [206, 28, 1]], xr: [34, 62] }, l: { bands: [[30, 25, 3], [88, 25, 3], [146, 25, 3], [206, 24, 2]], xr: [40, 66] } }[size] || null;
  const zOf = (a) => (flip ? -146 + a : 104 - a), even = (v) => Math.round(v / 2) * 2, defH = flip ? 0 : 2, atkZ = flip ? -152 : 126, defZ = flip ? 126 : -152, HALLCOL = { town: "#8a5a44", works: "#5f676d", airfield: "#8a8e92", farm: "#76634c" };
  const kits = MIX[theme] ? MIX[theme].slice() : ["town", "works", "airfield", "farm", R.pick(["town", "works", "farm"])]; for (let i = kits.length - 1; i > 0; i--) { const j = R.int(0, i); [kits[i], kits[j]] = [kits[j], kits[i]]; }
  const used = {}; plan.sectors = []; plan.atk = flip ? "foe" : "you"; plan.size = size; let li = 0;
  if (CUSTOM) { const ids = [...new Set(DZ.pts.map((q) => q.s))].sort((a, b) => a - b);   // the sectors and their objectives are the ones drawn in the editor
    ids.forEach((sv, k) => { const last = k === ids.length - 1, qs = DZ.pts.filter((q) => q.s === sv).sort((a, b) => b.z - a.z), sec = { k, z: even(qs.reduce((a, q) => a + mz(q.z), 0) / qs.length), pts: [], gapX: even(qs.reduce((a, q) => a + q.x, 0) / qs.length) + (qs.some((q) => q.roof) ? 22 : 0), last }; plan.sectors.push(sec);
      qs.forEach((q) => { const name = "ABCDEFGHIJKL"[li], d = { name, label: last && qs.length === 1 ? "The citadel" : "Point " + name, x: even(q.x), z: even(mz(q.z)), r: 12, h: 0, kn: "works", kit: KITS.works, ax: 0, blds: [], sector: k, roof: !!q.roof, last }; plan.districts.push(d); sec.pts.push(li); plan.sites.push([name, d.x, d.z, d.label, k, d.roof ? 1 : 0]); plan.zones.push([d.x - 15, d.z - 15, d.x + 15, d.z + 15, 0, 24]); plan.yards.push([d.x, d.z, 15]); li++; }); }); }
  else SPEC.bands.forEach(([a, r, n], k) => { const last = k === SPEC.bands.length - 1, z = even(zOf(a)), xs = n === 1 ? [0] : n === 3 ? [-84, even(R.range(-4, 4)), 84] : last ? (size === "l" ? [-42, 42] : [-28, 28]) : [-even(R.range(SPEC.xr[0], SPEC.xr[1])), even(R.range(SPEC.xr[0], SPEC.xr[1]))];
    const h = FLAT ? 0 : last ? defH : Math.round(clamp(api.hills(0, z) * .3 - 1, 0, 6)), roofAt = n === 1 ? 0 : n === 3 ? 1 : R.int(0, 1), sec = { k, z, pts: [], gapX: n === 3 ? 42 : n === 1 ? 20 : 0, last }; plan.sectors.push(sec);
    xs.forEach((x, i) => { const kn = kits[li % kits.length], kit = KITS[kn], name = "ABCDEFGHIJKL"[li], roof = SHIP || i === roofAt; let label, tries = 0; do label = last ? (n === 1 ? "The citadel" : i ? "Citadel east" : "Citadel west") : R.pick(kit.names); while (used[label] && ++tries < 30); if (used[label] && !last) { used[label]++; label = label + " " + used[label]; } else used[label] = 1;
      const d = { name, label, x, z, r, h: HIGH ? h + (last ? 5 : R.pick([0, 3, 6, 9])) : h, kn, kit, ax: R.chance(.5) ? 1 : 0, blds: [], sector: k, roof, last }; plan.districts.push(d); sec.pts.push(li); plan.sites.push([name, x, z, label, k, roof ? 1 : 0]); plan.zones.push([x - r - 3, z - r - 3, x + r + 3, z + r + 3, d.h, HIGH ? 18 : 24]); plan.yards.push([x, z, r + 3]); li++; }); });
  plan.homes = plan.sectors.map((sec, k) => ({ atk: k === 0 ? [0, atkZ] : [plan.sectors[k - 1].gapX, plan.sectors[k - 1].z], def: sec.last ? [0, defZ] : [plan.sectors[k + 1].gapX, plan.sectors[k + 1].z] }));
  plan.zones.push([-34, 104, 34, 150, 0, 26], [-34, -190, 34, -146, FLAT ? 0 : 2, 26]); if (FLAT) plan.zones.push([-124, -190, 124, 152, 0, 30]); keep.push([-10, 100, 10, 150], [-10, -190, 10, -142]);

  /* ---------- roads: out of a district by the street that points the right way, then straight to the next ---------- */
  const exitOf = (d, tx, tz) => { const ex = d.r + 3, c = [[ex, 0], [-ex, 0], [0, ex], [0, -ex]]; let b = c[0], bs = -1e9; for (const q of c) { const sc = q[0] * (tx - d.x) + q[1] * (tz - d.z); if (sc > bs) { bs = sc; b = q; } } return [d.x + b[0], d.z + b[1], d.h]; };
  const road = (a, b, k) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 3) return; const n = Math.max(2, Math.round(len / 6)), mid = api.hills((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) * .5; plan.roads.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], k, hw: k === "track" ? 2.4 : 3.6, len });
    for (let i = 1; i < n; i++) { const t = i / n, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), base = lerp(a[2], b[2], sm(t)); plan.zones.push([x - 4.5, z - 4.5, x + 4.5, z + 4.5, base + (len > 30 ? clamp((mid - base) * .5, -2, 5) * Math.sin(Math.PI * t) : 0), 13]); } };
  const link = (d1, d2) => road(exitOf(d1, d2.x, d2.z), exitOf(d2, d1.x, d1.z), d1.kit.street === "track" && d2.kit.street === "track" ? "track" : "asphalt"), DS = (k) => (CUSTOM ? [] : plan.sectors[k].pts.map((i) => plan.districts[i]));
  const baseEdge = (z0, d) => [clamp(d.x, -26, 26), z0, z0 > 0 ? 0 : 2], aEdge = flip ? -146 : 104, dEdge = flip ? 104 : -146;
  for (const d of DS(0)) road(baseEdge(aEdge, d), exitOf(d, d.x, aEdge + (flip ? -200 : 200)), "asphalt"); for (const d of DS(plan.sectors.length - 1)) road(baseEdge(dEdge, d), exitOf(d, d.x, dEdge + (flip ? 200 : -200)), "asphalt");
  for (let k = 0; k < plan.sectors.length; k++) { const row = DS(k); for (let i = 0; i + 1 < row.length; i++) link(row[i], row[i + 1]); if (k + 1 < plan.sectors.length) { const nx = DS(k + 1), seen = new Set(); for (const d of row) { const t = nx.reduce((b, q) => (Math.abs(q.x - d.x) < Math.abs(b.x - d.x) ? q : b)); seen.add(t); link(d, t); } for (const q of nx) if (!seen.has(q)) link(row.reduce((b, d) => (Math.abs(q.x - d.x) < Math.abs(b.x - d.x) ? d : b)), q); } }

  if (CUSTOM) for (const L of DZ.lanes || []) road([L[0], mz(L[1]), 0], [L[2], mz(L[3]), 0], "asphalt");

  /* ---------- an objective hall: the roofed point. Hollow, four doorways a squad can use and a mech cannot, a roof you
     can run on with two skylights to drop through, a gallery inside and cover on the floor. 22 m by 16 m. ---------- */
  function hall(d, W, rect) { const col = d.last ? CON : HALLCOL[d.kn] || CON, trim = d.last ? "#c9733a" : "#3c4046", HL = 11, HW = 8, T = .5, H = 5.5, DW = 2.2, DH = 3.2, dl = R.pick([-4, 4]);
    const bx = (u0, v0, u1, v1, y, h, c, o) => { const q = rect(u0, v0, u1, v1); S((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, q[2] - q[0], h, q[3] - q[1], c, o || { stripe: false, base: c, cap: c }, y); }, dc = (u0, v0, u1, v1, y, h, c, roof) => { const q = rect(u0, v0, u1, v1); D((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, q[2] - q[0], h, q[3] - q[1], c, y, roof ? 1 : 0); };
    for (const sd of [-1, 1]) { const v0 = sd * HW - T / 2, v1 = sd * HW + T / 2, du = sd * dl;   // the long walls, a doorway in each, off centre and not facing each other
      bx(-HL, v0, du - DW, v1, .001, H, col); bx(du + DW, v0, HL, v1, .001, H, col); bx(du - DW, v0, du + DW, v1, DH, H - DH, col); dc(du - DW, v0 - .06, du + DW, v1 + .06, DH - .12, .14, trim);
      const u0 = sd * HL - T / 2, u1 = sd * HL + T / 2;   // the end walls, a doorway in the middle of each where the main street runs in
      bx(u0, -HW, u1, -DW, .001, H, col); bx(u0, DW, u1, HW, .001, H, col); bx(u0, -DW, u1, DW, DH, H - DH, col); dc(u0 - .06, -DW, u1 + .06, DW, DH - .12, .14, trim); }
    for (const [u0, v0, u1, v1] of [[-HL - .4, -HW - .4, HL + .4, -1.5], [-HL - .4, 1.5, HL + .4, HW + .4], [-HL - .4, -1.5, -7, 1.5], [-4, -1.5, 4, 1.5], [7, -1.5, HL + .4, 1.5]]) bx(u0, v0, u1, v1, H, .4, "#3c4046", { roof: true });   // the roof, with two skylights
    for (const u of [-7, -4, 4, 7]) dc(u - .08, -1.5, u + .08, 1.5, H + .4, .25, trim, true);
    bx(-10.5, 4.6, -1.5, 7.6, 2.8, .3, WOOD2); dc(-10.5, 4.5, -1.5, 4.62, 3.1, .9, "#3c4046"); bx(-1.4, 5.2, .2, 7, .001, 1.9, DRAB); bx(.3, 5.4, 1.7, 6.8, .001, 1, DRAB2);   // a gallery along one wall, and crates to climb to it
    for (const [u, v, w, dd, h, c] of [[-6, -3.5, 3, .5, 1.2, CON2], [6, 3.2, .5, 3, 1.2, CON2], [5.5, -4.5, 1.4, 1.4, 1.3, DRAB], [-4, 1.6, 1.3, 1.3, 1.1, WOOD2], [8.5, -1, 1.2, 2.4, 1, DRAB2], [-8.5, -5.5, 2.6, 1.2, 1.3, STEEL]]) bx(u - w / 2, v - dd / 2, u + w / 2, v + dd / 2, .001, h, c);
    for (const sd of [-1, 1]) { const q = rect(sd * dl - 1.5, sd * (HW + .3), sd * dl + 1.5, sd * (HW + .5)); G((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, q[2] - q[0], .16, q[3] - q[1], DH + .2); }
    occ.push(rect(-HL - .6, -HW - .6, HL + .6, HW + .6)); { const q = rect(-HL, -HW, HL, HW); plan.halls.push([Math.min(q[0], q[2]), Math.min(q[1], q[3]), Math.max(q[0], q[2]), Math.max(q[1], q[3]), (d.h || 0) + H]); } for (const sd of [-1, 1]) keep.push(rect(sd * dl - 3, sd * HW, sd * dl + 3, sd * (HW + 6)), rect(sd * HL, -3, sd * (HL + 6), 3)); }


  /* ---------- frontier pieces: what a colony world is built from ----------
     Prefabricated blocks in pale panel with a band of colour under the roof and dark window strips, long blast walls to
     run along, raised pipelines to run on, tank farms with a catwalk, landing pads with a dropship. City blocks and the
     Frontier colony are made of these from one base to the other, so there is always a wall, a roof or a pipe within a
     jump of the last one. */
  const PANEL = ["#cfcabb", "#b9b6aa", "#a8b0b0", "#c2b59a", "#9aa3a0"], TRIMS = ["#d2691e", "#2f7f86", "#c9a23a", "#8a3a2a", "#3f6f9a"], GLASS = "#1c2630", FRAME = "#3c4046", WALLC = ["#8f959a", "#7d858a", "#a39c8c"];
  const nearRoad = (x, z, r) => !CUSTOM && plan.roads.some((rd) => { const t = clamp(((x - rd.ax) * (rd.bx - rd.ax) + (z - rd.az) * (rd.bz - rd.az)) / (rd.len * rd.len), 0, 1); return Math.hypot(x - lerp(rd.ax, rd.bx, t), z - lerp(rd.az, rd.bz, t)) < r; });
  const prefab = (x, z, w, d, h, y0 = 0, col = R.pick(PANEL), trim = R.pick(TRIMS)) => { S(x, z, w, h, d, col, null, y0); if (!y0) D(x, z, w + .5, .45, d + .5, FRAME);
    for (let y = 1.9; y < h - 1.5; y += 3.1) { D(x, z, w + .1, 1.1, d * .8, GLASS, y0 + y); D(x, z, w * .8, 1.1, d + .1, GLASS, y0 + y); }
    D(x, z, w + .14, .5, d + .14, trim, y0 + h - .9); D(x, z, w + .4, .3, d + .4, FRAME, y0 + h); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) D(x + a * w / 2, z + b * d / 2, .45, h, .45, FRAME, y0);
    if (w > 6 && d > 6) { S(x + R.range(-w / 4, w / 4), z + R.range(-d / 4, d / 4), 2.2, 1.2, 1.6, "#8a8e92", null, y0 + h); if (R.chance(.5)) D(x + w / 3, z - d / 3, .12, 4, .12, FRAME, y0 + h); if (R.chance(.45)) D(x - w / 5, z + d / 5, w * .4, .1, d * .3, "#24364a", y0 + h + .45); }
    if (R.chance(.6)) { const sd = R.sign(); if (R.chance(.5)) G(x, z + sd * (d / 2 + .08), Math.min(4, w * .4), .22, .08, y0 + Math.min(3.4, h - 1.4)); else G(x + sd * (w / 2 + .08), z, .08, .22, Math.min(4, d * .4), y0 + Math.min(3.4, h - 1.4)); } };
  const place = (x, z, hw, hd, m = 2.2, lane = 8) => { if (!fits(x - hw, z - hd, x + hw, z + hd, m) || nearRoad(x, z, lane + Math.max(hw, hd) * .8)) return false; occ.push([x - hw, z - hd, x + hw, z + hd]); return true; };
  // a blast wall: long, tall and flat, with a hazard stripe at its foot
  const runwall = (x, z, len, az, h = R.pick([8, 9, 10]), force) => { const w = az ? 1.2 : len, d = az ? len : 1.2; if (!force && !place(x, z, w / 2, d / 2, 1.5, 7.6)) return false; if (force) { if (!fits(x - w / 2, z - d / 2, x + w / 2, z + d / 2, .5) || nearRoad(x, z, 8.2)) return false; occ.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]); }
    const c = R.pick(WALLC); S(x, z, w, h, d, c); D(x, z, w + .25, .3, d + .25, FRAME, h); D(x, z, w + .08, .4, d + .08, "#c9733a", .8); for (let u = -len / 2 + 6; u < len / 2 - 2; u += 6) D(x + (az ? 0 : u), z + (az ? u : 0), az ? 1.3 : .14, h, az ? .14 : 1.3, FRAME); return true; };
  // a pipeline: a square duct on pylons, high enough to walk under, wide enough to run along the top of
  const pipeline = (x, z, len, az, yF) => { const w = az ? 2.2 : len, d = az ? len : 2.2; if (!place(x, z, w / 2, d / 2, 1.5, 7.6)) return false; const y = yF === undefined ? R.pick([0, 4.2, 4.2]) : yF, c = R.pick([RUST, "#a1a7a8", "#c2b59a", "#56613f"]); S(x, z, w, 2.2, d, c, null, y);
    for (let u = -len / 2 + 1; u <= len / 2 - 1; u += 6) D(x + (az ? 0 : u), z + (az ? u : 0), az ? 2.5 : .5, 2.5, az ? .5 : 2.5, FRAME, y - .15); if (y) for (let u = -len / 2 + 2; u <= len / 2 - 2; u += Math.max(8, (len - 4) / Math.ceil((len - 4) / 12))) S(x + (az ? 0 : u), z + (az ? u : 0), .9, y, .9, "#5f676d");
    if (y) { const e = len / 2 + 1.2; for (let i = 0; i < 3; i++) S(x + (az ? 0 : e + i * 1.4), z + (az ? e + i * 1.4 : 0), az ? 2.2 : 1.4, y - 1.2 - i * 1.5 + 2.2, az ? 1.4 : 2.2, "#565e64"); } return true; };
  // tanks with a catwalk across their tops
  const tankfarm = (x, z, azF) => { const n = azF === undefined ? R.int(2, 3) : 2, rr = azF === undefined ? R.range(3, 4.2) : 3.4, h = R.pick([7, 8, 9]), az = azF === undefined ? R.chance(.5) : azF, span = (n - 1) * (rr * 2 + 1.5); if (!place(x, z, az ? rr + 1 : span / 2 + rr + 1, az ? span / 2 + rr + 1 : rr + 1)) return false; const c = R.pick(["#cfcabb", "#a8b0b0", RUST, "#c2b59a"]);
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * (rr * 2 + 1.5), tx = x + (az ? 0 : o), tz = z + (az ? o : 0); P.push(["ct", tx, tz, rr, h, c]); D(tx, tz, rr * 1.7, .5, rr * 1.7, R.pick(TRIMS), h * .6); }
    S(x, z, az ? 1.6 : span + 2, .3, az ? span + 2 : 1.6, "#6c747a", null, h + .1); D(x, z, az ? 1.8 : span + 2, .9, az ? span + 2 : .12, "#c9733a", h + .4); return true; };
  const dropship = (x, z) => { S(x, z, 14, 2.8, 4.4, "#7d858a", null, 1.4); S(x - 4, z, 5, 1.6, 9.5, "#6c747a", null, 2.2); S(x + 5.5, z, 2, 2.2, .6, "#5f676d", null, 4.2); for (const sx of [-4, 3]) for (const sz of [-1.7, 1.7]) S(x + sx, z + sz, .5, 1.4, .5, FRAME); D(x - 7.1, z, .3, 1, 2.6, "#2a3038", 2.4); G(x + 7.1, z, .2, .6, 1.6, 2.2); };
  // a landing pad: painted ground, lights at the corners, sometimes a dropship on it
  const pad = (x, z) => { if (!place(x, z, 9, 9, 1.5)) return false; plan.paint.push({ x0: x - 9, z0: z - 9, x1: x + 9, z1: z + 9, k: "apron" }); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { G(x + a * 8.4, z + b * 8.4, .5, .2, .5, .05); D(x + a * 8.4, z + b * 5, .5, .06, 6, "#c9733a"); D(x + a * 5, z + b * 8.4, 6, .06, .5, "#c9733a"); }
    D(x, z, 1, .06, 7, "#d8d2c0"); D(x - 2.5, z, 1, .06, 7, "#d8d2c0"); D(x + 2.5, z, 1, .06, 7, "#d8d2c0"); D(x, z, 6, .07, 1, "#d8d2c0"); if (R.chance(.55)) dropship(x, z); else for (let k = 0; k < 3; k++) prop(R.pick(["crates", "container", "barrels"]), x + R.range(-6, 6), z + R.range(-6, 6), R.chance(.5) ? 1 : 0, .2, [[]]); return true; };
  // a block with a smaller one on top, so the roofs make steps
  const stack = (x, z, w, d) => { if (!place(x, z, w / 2, d / 2)) return false; const c = R.pick(PANEL), t = R.pick(TRIMS), h1 = R.pick([4, 5]), ox = R.sign() * w * .18, oz = R.sign() * d * .14; prefab(x, z, w, d, h1, 0, c, t); prefab(x + ox, z + oz, w * .6, d * .66, R.pick([3.5, 4.5]), h1, c, t); S(x - ox * 2.4, z - oz * 2.6, 2.4, h1 / 2, 2.4, "#565e64"); return true; };
  const block = (x, z, w, d, h = R.pick([7, 8, 9, 11])) => { if (!place(x, z, w / 2, d / 2)) return false; prefab(x, z, w, d, h); return true; };
  const LOTS = { pads: 0, n: 0 }, lot = (x, z) => { const az = R.chance(.5), F = COLONY || HIGH ? 1.6 : 1, kind = R.w([["kick", 3], ["wall", 1.5], ["pipe", COLONY ? 3 : 1.5], ["block", COLONY ? 3 : 5], ["stack", 3], ["tanks", COLONY ? 2 : .7], ["pad", LOTS.pads < 3 ? .8 : 0], ["hab", 2 * F], ["mast", .8 * F], ["reactor", .7 * F], ["hangar", .9 * F], ["solar", 1 * F], ["green", .9 * F], ["crane", .8 * F]]); let ok = false;
    if (kind === "kick") { const len = R.pick([16, 20, 24]), h = R.pick([8, 9, 10]); ok = runwall(x + (az ? -3.85 : 0), z + (az ? 0 : -3.85), len, az, h); if (ok) runwall(x + (az ? 3.85 : len * .35), z + (az ? len * .35 : 3.85), len, az, h, true); }
    else if (kind === "wall") ok = runwall(x, z, R.pick([18, 24, 30]), az); else if (kind === "pipe") ok = pipeline(x, z, R.pick([18, 26, 34]), az); else if (kind === "tanks") ok = tankfarm(x, z); else if (kind === "pad") { ok = pad(x, z); if (ok) LOTS.pads++; }
    else if (kind === "hab") ok = hab(x, z); else if (kind === "mast") ok = mast(x, z); else if (kind === "reactor") ok = reactor(x, z); else if (kind === "hangar") ok = hangar(x, z, az); else if (kind === "solar") ok = solar(x, z); else if (kind === "green") ok = greenhouse(x, z, az); else if (kind === "crane") ok = crane(x, z, az);
    else if (kind === "stack") ok = stack(x, z, R.range(11, 15), R.range(9, 12)); else ok = block(x, z, R.range(9, 15), R.range(8, 12));
    if (!ok) ok = block(x, z, R.range(7, 10), R.range(6, 9), R.pick([5, 7, 8, 10])); if (!ok) ok = block(x, z, R.range(5, 6.5), R.range(5, 6.5), R.pick([4, 6, 8])); if (ok) LOTS.n++; return ok; };
  /* ---------- the newer colony and ship pieces ----------
     White hull plating, dark seams and cyan running lights: the look of the Frontier's newer settlements and its ships.
     Each piece has something to climb or run on as well as something to look at. */
  const C = (x, z, w, h, d, dy = 0) => P.push(["gc", x, z, w, h, d, dy]), Y = (x, z, r, h, col, dy = 0, sol = 0, seg = 10) => P.push(["cy", x, z, r, h, col, dy, sol, seg]);
  const SCI = ["#d8dde0", "#c4ccd2", "#b0bcc4", "#e2e0d8"], SEAM = "#2a3138", HAZ = "#c9a23a";
  const at = (x, z, az) => (u, v) => (az ? [x + v, z + u] : [x + u, z + v]), sz = (az) => (w, d) => (az ? [d, w] : [w, d]);
  // a habitat module: a round, stepped pod with a lit band, an airlock and a mast on its roof
  const hab = (x, z) => { if (!place(x, z, 8.5, 7)) return false; const c = R.pick(SCI), r = R.range(5, 6.2);
    Y(x, z, r, 3.6, c, 0, 1, 8); Y(x, z, r - .7, .4, SEAM, 3.6, 0, 8); Y(x, z, r - 1.5, 1.4, c, 4, 1, 8); Y(x, z, r - 3.2, 1, c, 5.4, 1, 8);
    for (const sd of [-1, 1]) { C(x, z + sd * (r - .05), r * .8, .25, .12, 2.3); C(x + sd * (r - .05), z, .12, .25, r * .8, 2.3); }
    const sd = R.sign(); S(x + sd * (r + 1.3), z, 2.8, 3, 3.2, c); D(x + sd * (r + 2.75), z, .12, 2.2, 1.6, SEAM); C(x + sd * (r + 2.8), z, .1, .2, 1.6, 2.5);
    D(x, z, .15, 3, .15, FRAME, 6.4); C(x, z, .35, .35, .35, 9.4); if (R.chance(.6)) prop(R.pick(["crates", "barrels"]), x - sd * (r + 1.5), z + R.range(-3, 3), R.chance(.5) ? 1 : 0, .1, [[]]); return true; };
  // a comms mast: a lattice tower with three landings, a dish and a beacon on top
  const mast = (x, z) => { if (!place(x, z, 3, 3, 1.5)) return false;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S(x + a * 1.4, z + b * 1.4, .35, 13, .35, FRAME);
    for (let y = 2; y < 13; y += 2.6) { D(x, z - 1.4, 2.8, .18, .18, FRAME, y); D(x, z + 1.4, 2.8, .18, .18, FRAME, y); D(x - 1.4, z, .18, .18, 2.8, FRAME, y + 1.3); D(x + 1.4, z, .18, .18, 2.8, FRAME, y + 1.3); }
    S(x - 1.1, z, 2.4, .3, 3.6, "#6c747a", null, 4.2); S(x + 1.1, z, 2.4, .3, 3.6, "#6c747a", null, 8.4); S(x, z, 4.2, .3, 4.2, "#6c747a", null, 12.6); D(x, z, 4.3, .5, 4.3, HAZ, 12.9);
    Y(x + .6, z, .25, 1.2, FRAME, 12.9, 0, 6); Y(x + .6, z, 2.1, .3, "#e2e0d8", 14.1, 0, 12); D(x - 1, z, .14, 3.4, .14, FRAME, 12.9); C(x - 1, z, .4, .4, .4, 16.3); return true; };
  // a reactor: a tall drum with lit bands and fins, a catwalk round its middle and stairs up to it
  const reactor = (x, z) => { if (!place(x, z, 9.5, 8)) return false; const c = R.pick(["#8f989e", "#a1a7a8", "#b0bcc4"]);
    D(x, z, 11, .08, 11, HAZ, .02); Y(x, z, 4.6, 10, c, 0, 1, 12); for (const y of [2.4, 7.6]) for (const sd of [-1, 1]) { C(x, z + sd * 4.55, 2.6, .35, .12, y); C(x + sd * 4.55, z, .12, .35, 2.6, y); }
    for (const sd of [-1, 1]) { D(x + sd * 5, z, 1.4, 8, .35, FRAME, .5); D(x, z + sd * 5, .35, 8, 1.4, FRAME, .5); }
    Y(x, z, 3.6, .6, SEAM, 10, 0, 12); C(x, z, 2.2, .2, 2.2, 10.6);
    for (const sd of [-1, 1]) { S(x, z + sd * 5.9, 13.4, .3, 1.6, "#6c747a", null, 5); S(x + sd * 5.9, z, 1.6, .3, 10.2, "#6c747a", null, 5); D(x, z + sd * 6.7, 13.4, .9, .1, HAZ, 5.3); }
    for (let i = 0; i < 4; i++) S(x + 7.6, z - 5.4 + i * 1.6, 1.6, 1.25 * (i + 1), 1.6, "#565e64"); return true; };
  // a hangar: two long walls and a stepped roof, open at both ends, with a mech cradle inside lit cyan. Mechs fit inside.
  const hangar = (x, z, az = R.chance(.5)) => { const L = 26, W = 18, H = 9.5; const [hw, hd] = sz(az)(W / 2 + 1, L / 2); if (!place(x, z, hw, hd, 2)) return false; const p = at(x, z, az), q = sz(az), c = R.pick(SCI);
    for (const sd of [-1, 1]) { const [a, b] = p(0, sd * (W / 2 - .5)), [w, d] = q(L, 1); S(a, b, w, H, d, c); { const [w2, d2] = q(L + .2, .5); D(a, b, w2, .6, d2 + .2, R.pick(TRIMS), H - 1.4); } for (let u = -L / 2 + 2; u <= L / 2 - 2; u += 6) { const [a2, b2] = p(u, sd * (W / 2 - 1.1)), [w3, d3] = q(.5, .3); D(a2, b2, w3, H, d3, FRAME); } }
    { const [a, b] = p(0, 0), [w, d] = q(L, 8); S(a, b, w, .5, d, c, { roof: true, stripe: false, base: c, cap: SEAM }, H + 1.6); }
    for (const sd of [-1, 1]) { const [a, b] = p(0, sd * 6.5), [w, d] = q(L, 5); S(a, b, w, .5, d, c, { roof: true, stripe: false, base: c, cap: SEAM }, H); }
    for (const u of [-L / 2, L / 2]) { const [a, b] = p(u, 0), [w, d] = q(.6, W); D(a, b, w, .8, d, HAZ, H - .6); }
    for (let u = -L / 2 + 3; u < L / 2; u += 6) { const [a, b] = p(u, 0), [w, d] = q(.4, 7); C(a, b, w, .12, d, H + 1.45); }
    for (const v of [-3.2, 3.2]) { const [a, b] = p(-L / 2 + 6, v); D(a, b, .6, 8, .6, FRAME); } { const [a, b] = p(-L / 2 + 6, 0), [w, d] = q(.8, 7); D(a, b, w, .6, d, FRAME, 7.6); C(a, b, w * .5, .12, d * .9, 7.5); }
    { const [a, b] = p(L / 2 - 5, R.range(-4, 4)); prop(R.pick(["crates", "container", "barrels"]), a, b, az ? 0 : 1, .1, [[]]); } plan.lit++; { const [a, b] = p(0, 0); P.push(["li", a, b, H + 1.4]); } return true; };
  // a solar field: rows of dark panels on short posts, low enough to run across the tops
  const solar = (x, z) => { if (!place(x, z, 9, 6.5, 1.5)) return false;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const px = x - 6 + i * 4, pz = z - 3.6 + j * 3.6; D(px, pz, .2, 1.4, .2, FRAME); S(px, pz, 3.6, .2, 2.6, "#1f2e46", null, 1.4); D(px, pz, 3.62, .05, .08, "#5f86a8", 1.61); D(px, pz, .08, .05, 2.62, "#5f86a8", 1.61); }
    S(x + 8.6, z, 1.6, 2, 2.4, "#c4ccd2"); C(x + 9.45, z, .1, .2, 1.2, 1.5); return true; };
  // a greenhouse: a long glass roof on a low wall, grow lights inside, rows of green, open at the ends
  const greenhouse = (x, z, az = R.chance(.5)) => { const L = 20, W = 8; const [hw, hd] = sz(az)(W / 2, L / 2); if (!place(x, z, hw + .5, hd + .5)) return false; const p = at(x, z, az), q = sz(az);
    for (const sd of [-1, 1]) { const [a, b] = p(0, sd * (W / 2 - .2)), [w, d] = q(L, .4); S(a, b, w, 1, d, "#c4ccd2"); for (let u = -L / 2; u <= L / 2; u += 4) { const [a2, b2] = p(u, sd * (W / 2 - .2)); D(a2, b2, .25, 4, .25, FRAME, 1); } }
    { const [a, b] = p(0, 0), [w, d] = q(L, W); S(a, b, w, .2, d, "#4a6a78", { roof: true, stripe: false, base: "#4a6a78", cap: "#4a6a78" }, 4.6); const [w2, d2] = q(L, .3); D(a, b, w2, .3, d2, FRAME, 4.8); }
    for (const v of [-2.2, 0, 2.2]) { const [a, b] = p(0, v), [w, d] = q(L - 3, 1); D(a, b, w, .8, d, R.pick(["#4f7a3a", "#5d8a42", "#3f6a34"])); const [w2, d2] = q(L - 4, .2); C(a, b, w2, .08, d2, 3.9); } return true; };
  // a crane gantry: four legs and two long beams to run along, a trolley hanging over the containers it is moving
  const crane = (x, z, az = R.chance(.5)) => { const SP = 16, LN = 12; const [hw, hd] = sz(az)(SP / 2 + .6, LN / 2 + .6); if (!place(x, z, hw, hd, 2)) return false; const p = at(x, z, az), q = sz(az), c = R.pick([HAZ, "#d2691e", "#c4ccd2"]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) { const [px, pz] = p(b * LN / 2, a * SP / 2); S(px, pz, 1, 12, 1, c); }
    for (const b of [-1, 1]) { const [px, pz] = p(b * LN / 2, 0), [w, d] = q(1.2, SP + 1); S(px, pz, w, 1, d, c, null, 12); }
    { const tv = R.range(-4, 4), [px, pz] = p(0, tv), [w, d] = q(LN, 2.4); S(px, pz, w, 1.2, d, FRAME, null, 11.8); D(px, pz, .1, 5, .1, SEAM, 6.8); C(px, pz, .5, .3, .5, 11.5); }
    for (const v of [-4, 3]) { const [px, pz] = p(R.range(-2, 2), v); prop("container", px, pz, az ? 0 : 1, .1, [[]]); } return true; };
  // a light pylon: a tall post with hazard bands and a cyan lamp, for lining roads and pads
  const pylon = (x, z) => { if (!fits(x - .6, z - .6, x + .6, z + .6, .4)) return false; occ.push([x - .5, z - .5, x + .5, z + .5]); S(x, z, .7, 6.5, .7, "#c4ccd2"); D(x, z, .74, .4, .74, HAZ, .6); D(x, z, .74, .4, .74, HAZ, 5.2); C(x, z, .8, .5, .8, 6.5); return true; };
  // a console: a desk of screens, lit from the front
  const consoleBox = (x, z, az) => { if (!fits(x - 1, z - 1, x + 1, z + 1, .3)) return false; occ.push([x - .9, z - .9, x + .9, z + .9]); const [w, d] = sz(az)(1.8, .9); S(x, z, w, 1.1, d, "#5f676d"); D(x, z, w * .9, .5, d * .3, SEAM, 1.1); C(x, z, w * .8, .35, d * .34, 1.2); return true; };
  /* ship compartments: what fills the decks between the bulkheads */
  // a crew room: four walls with a door in two of them, a roof, bunks and a console. Mechs cannot go in.
  const crewRoom = (x, z) => { const hw = 6, hd = 4.5, H = 4.6; if (!place(x, z, hw + .5, hd + .5, 2)) return false; const c = R.pick(["#8f959a", "#7d858a", "#a1a7a8"]);
    for (const sd of [-1, 1]) { S(x - 3.8, z + sd * hd, 4.4, H, .5, c); S(x + 3.8, z + sd * hd, 4.4, H, .5, c); D(x, z + sd * hd, 3.2, 1.6, .5, c, H - 1.6); S(x + sd * hw, z, .5, H, hd * 2, c); }
    S(x, z, hw * 2 + .5, .4, hd * 2 + .5, "#4a5258", { roof: true, stripe: false, base: "#4a5258", cap: "#4a5258" }, H); plan.halls.push([x - hw, z - hd, x + hw, z + hd, H]);
    for (const sd of [-1, 1]) { D(x + sd * 4.2, z - 2.6, 2.6, .9, 1.2, "#3f6f9a"); D(x + sd * 4.2, z - 2.6, 2.6, .9, 1.2, "#3f6f9a", 1.8); C(x + sd * (hw - .3), z + 1, .1, .3, 2, 2.6); } consoleBox(x, z + 2.8, 0); plan.lit++; P.push(["li", x, z, H - .3]); return true; };
  // a cryo bay: a row of pods on a plinth, each with a lit face
  const cryo = (x, z, az = R.chance(.5)) => { const n = 5, L = n * 2.2; const [hw, hd] = sz(az)(L / 2 + .5, 1.4); if (!place(x, z, hw, hd, 1.5)) return false; const p = at(x, z, az), q = sz(az);
    { const [w, d] = q(L + 1, 2.4); S(x, z, w, .5, d, "#5f676d"); }
    for (let i = 0; i < n; i++) { const [a, b] = p(-L / 2 + 1.1 + i * 2.2, 0); Y(a, b, .8, 2.3, "#d8dde0", .5, 1, 8); const [c1, c2] = p(-L / 2 + 1.1 + i * 2.2, .8); C(c1, c2, .5, 1.4, .5, 1); } return true; };
  // a cargo rack: two shelves to climb and run along, crates on them
  const rack = (x, z, az = R.chance(.5)) => { const L = R.pick([10, 14]); const [hw, hd] = sz(az)(L / 2, 1.2); if (!place(x, z, hw, hd, 1.5)) return false; const p = at(x, z, az), q = sz(az);
    for (const y of [2.4, 4.8]) { const [w, d] = q(L, 2.2); S(x, z, w, .25, d, "#6c747a", null, y); }
    for (let u = -L / 2; u <= L / 2; u += L / 2) for (const v of [-1, 1]) { const [a, b] = p(u, v); D(a, b, .25, 5.1, .25, FRAME); }
    for (let u = -L / 2 + 1.2; u < L / 2 - .5; u += 2.2) for (const y of [0, 2.65, 5.05]) if (R.chance(.55)) { const [a, b] = p(u, 0); S(a, b, 1.5, 1.3, 1.5, R.pick(["#6f7d4a", "#8a6a40", "#5f676d", "#3f6f9a"]), null, y); } return true; };
  // a mech cradle: the frame a Titan stands in for repairs, gantry posts and a lit beam
  const cradle = (x, z, az = R.chance(.5)) => { const [hw, hd] = sz(az)(5, 4); if (!place(x, z, hw, hd, 1.5)) return false; const p = at(x, z, az), q = sz(az);
    { const [w, d] = q(9, 7); D(x, z, w, .06, d, HAZ, .02); } for (const u of [-4, 4]) { const [a, b] = p(u, -2.5); S(a, b, .8, 9, .8, FRAME); } { const [a, b] = p(0, -2.5), [w, d] = q(9, 1.4); S(a, b, w, .6, d, FRAME, 9); C(a, b, w * .8, .12, d * .6, 8.9); } { const [a, b] = p(0, -2.5), [w, d] = q(8, 1.2); S(a, b, w, .3, d, "#6c747a", null, 4.5); }
    consoleBox(...p(4.2, 2), az); return true; };
  const COVER = [["container", 2.5], ["barrier", 2], ["crates", 2.5], ["sandbag", 1.5], ["barrels", 1.2], ["hesco", 1.2], ["container2", 1], ["wall", 1], ["piperack", .8], ["tank", .6]];

  /* ---------- a district ---------- */
  for (const d of plan.districts) { if (CUSTOM) { plan.paint.push({ x0: d.x - 12, z0: d.z - 12, x1: d.x + 12, z1: d.z + 12, k: "apron" }); if (d.roof) { hall(d, null, (u0, v0, u1, v1) => [d.x + Math.min(u0, u1), d.z + Math.min(v0, v1), d.x + Math.max(u0, u1), d.z + Math.max(v0, v1)]); plan.lit++; P.push(["li", d.x, d.z, 4.9]); } else { plan.lit++; P.push(["lp", d.x - 7, d.z - 7, 1, 0]); } continue; }
    const kit = d.kit, r = d.r, hs = kit.sw / 2, W = (u, v) => (d.ax ? [d.x + v, d.z + u] : [d.x + u, d.z + v]), rect = (u0, v0, u1, v1) => { const a = W(u0, v0), b = W(u1, v1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
    const rotOf = (fu, fv) => (d.ax ? Math.atan2(fv, fu) : Math.atan2(fu, fv)), turned = (alongU) => (alongU ? d.ax : 1 - d.ax);   // is a thing laid along this street turned a quarter turn on the map
    const pt = (k, q, extra) => plan.paint.push({ x0: q[0], z0: q[1], x1: q[2], z1: q[3], k, ...extra });
    pt(URB ? "apron" : kit.ground, [d.x - r - 3, d.z - r - 3, d.x + r + 3, d.z + r + 3]);
    const main = rect(-r - 3, -hs, r + 3, hs), cross = rect(-hs + .5, -r - 3, hs - .5, r + 3), sq = d.roof ? rect(-13, -10, 13, 10) : rect(-10, -10, 10, 10);
    pt(kit.street, main, { ax: d.ax, c: d.ax ? d.x : d.z, hw: hs }); pt(kit.street === "runway" ? "asphalt" : kit.street, cross, { ax: 1 - d.ax, c: d.ax ? d.z : d.x, hw: hs - .5 }); pt(d.roof ? "apron" : kit.walk === "dirt" ? "dirt" : "pave", sq, {});
    const mine = [main, cross, sq]; keep.push(...mine);
    if (d.roof) hall(d, W, rect);
    if (URB) {   // a frontier district: a block, a stack, tanks or a pad in each corner between the two streets, and cover laid round the point
      for (const su of [-1, 1]) for (const sv of [-1, 1]) { const u0 = hs + (d.roof ? 9 : 3), v0 = hs + (d.roof ? 6 : 3), lu = R.range(11, 16), lv = R.range(9, 13), q = rect(su * u0, sv * v0, su * (u0 + lu), sv * (v0 + lv)); if (R.chance(.5)) block((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, q[2] - q[0], q[3] - q[1], R.pick([8, 9, 11, 12])); else stack((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, q[2] - q[0], q[3] - q[1]); }   // a building on each corner of the crossing
      { const cs = []; for (let u = -r + 5; u <= r - 5; u += 13) for (let v = -r + 5; v <= r - 5; v += 13) cs.push(W(u + R.range(-3, 3), v + R.range(-3, 3))); for (let i = cs.length - 1; i > 0; i--) { const j = R.int(0, i); [cs[i], cs[j]] = [cs[j], cs[i]]; } for (const [x, z] of cs) lot(x, z); }   // and the rest of the ground built on, lot by lot
      for (let i = 0, n = 0; i < 40 && n < 6 && !d.roof; i++) { const a = R.range(0, 6.283), rad = R.range(5.5, 10.5); if (prop(R.w(COVER.slice(0, 6)), d.x + Math.cos(a) * rad, d.z + Math.sin(a) * rad, R.chance(.5) ? 1 : 0, .9, [occ])) n++; }
      for (let i = 0, n = 0; i < 90 && n < 8 + r * .4; i++) { const [x, z] = W(R.range(-r, r), R.range(-r, r)); if (prop(R.w(COVER), x, z, R.chance(.5) ? 1 : 0, .9)) n++; }
      if (d.roof) { plan.lit++; P.push(["li", d.x, d.z, 4.9]); } else { const [x, z] = W(-hs - .8, -hs - .8); plan.lit++; P.push(["lp", x, z, d.ax ? 0 : 1, d.ax ? 1 : 0]); occ.push([x - .2, z - .2, x + .2, z + .2]); }
      continue; }
    // the landmark stands on one corner of the square
    if (!d.roof) { const [x, z] = W(R.sign() * (hs + 7.5), R.sign() * (hs + 7.5)), g = gen(R.pick(kit.mark), x, z, R.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), "timber", .3, [occ]); if (g) d.blds.push([x, z, g.hw, g.hd]); }
    // buildings along both sides of both streets, fronts to the street
    for (const alongU of [true, false]) for (const dir of [-1, 1]) for (const side of [-1, 1]) { let t = (alongU ? (d.roof ? 15 : 11.5) : 12.5) + R.range(0, 3), fails = 0; const off = (alongU ? hs : hs - .5) + (kit.walk === "dirt" ? R.range(1.5, 5) : 1.8);
      while (t < r - 3 && fails < 6) { const type = R.w(kit.front), sd = R.int(0, 3), model = "gen:" + type + ":" + sd, dm = api.dims(model); if (!dm) { fails++; continue; } const w = dm[0], dp = dm[2]; if (t + w > r + 2 || dp > r - off) { fails++; continue; }
        const along = dir * (t + w / 2), across = side * (off + dp / 2), [x, z] = alongU ? W(along, across) : W(across, along), g = gen(type, x, z, alongU ? rotOf(0, -side) : rotOf(-side, 0), state(), .4, undefined, sd);
        if (!g) { fails++; t += 2; continue; } d.blds.push([x, z, g.hw, g.hd]); pt(kit.walk, [x - g.hw - 1.6, z - g.hd - 1.6, x + g.hw + 1.6, z + g.hd + 1.6], {});
        const gap = R.chance(kit.tight) ? R.range(.9, 2.2) : kit.tight ? R.range(3, 6.5) : R.range(6, 14);
        if (gap > 2.6 && R.chance(.7)) { const a2 = dir * (t + w + gap / 2), c2 = side * (off + R.range(1, dp * .7)), [px, pz] = alongU ? W(a2, c2) : W(c2, a2); prop(R.w(kit.wall), px, pz, R.chance(.5) ? 1 : 0, .15); }
        t += w + gap; } }
    // the ground behind: more buildings, then fields where the kit has them
    for (let i = 0, n = 0; i < 40 && n < kit.yardN * (r / 40) * (r / 40); i++) { const [x, z] = W(R.range(-r + 4, r - 4), R.range(-r + 4, r - 4)), g = gen(R.w(kit.yard), x, z, R.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), state(), 2.2); if (g) { n++; d.blds.push([x, z, g.hw, g.hd]); } }
    for (let i = 0, n = 0; i < 30 && n < (kit.fields || 0); i++) { const fw = R.range(12, 20), fd = R.range(10, 16), [x, z] = W(R.range(-r + 8, r - 8), R.range(-r + 8, r - 8)); if (Math.abs(x - d.x) + fw / 2 > r + 3 || Math.abs(z - d.z) + fd / 2 > r + 3 || !fits(x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2, 1)) continue; n++;
      const fr = [x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2]; pt("field", fr, { ax: R.chance(.5) ? 1 : 0, c: R.int(0, 2) }); keep.push(fr); mine.push(fr);
      for (const [fx, fz, rr, len] of [[x, z - fd / 2, 0, fw], [x, z + fd / 2, 0, fw], [x - fw / 2, z, 1, fd], [x + fw / 2, z, 1, fd]]) for (let u = -len / 2 + 2.5; u < len / 2 - 2; u += 5) if (R.chance(.72)) { const px = fx + (rr ? 0 : u), pz = fz + (rr ? u : 0), hw = rr ? .15 : 2.5, hd = rr ? 2.5 : .15; if (!fits(px - hw, pz - hd, px + hw, pz + hd, 0, [occ])) continue; occ.push([px - hw, pz - hd, px + hw, pz + hd]); S(px, pz, rr ? .12 : 5, 1.05, rr ? 5 : .12, WOOD, { hide: true }); D(px, pz, rr ? .06 : 5, .1, rr ? 5 : .06, WOOD2, .95); D(px, pz, rr ? .06 : 5, .1, rr ? 5 : .06, WOOD2, .5); for (const e of [-2.5, 0]) D(px + (rr ? 0 : e), pz + (rr ? e : 0), .14, 1.2, .14, WOOD); }
      for (let k = 0; k < 3; k++) prop("bales", x + R.range(-fw / 2 + 2, fw / 2 - 2), z + R.range(-fd / 2 + 2, fd / 2 - 2), R.chance(.5) ? 1 : 0, .2, [occ]); }
    // round the square: cover to fight from, never in the very middle
    for (let i = 0, n = 0; i < 40 && n < 7 && !d.roof; i++) { const a = R.range(0, 6.283), rad = R.range(5.5, 10.5), x = d.x + Math.cos(a) * rad, z = d.z + Math.sin(a) * rad, name = R.w(kit.sq); if (name === "veh" ? vehicle(kit, x, z, R.range(0, 6.283), [occ]) : prop(name, x, z, R.chance(.5) ? 1 : 0, .9, [occ])) n++; }
    // along the kerbs: parked and wrecked vehicles, lamps, a road block on the way in
    for (const alongU of [true, false]) { const h2 = alongU ? hs : hs - .5; for (let t = -r; t < r; t += R.range(6, 10)) { if (Math.abs(t) < 13) continue; const side = R.sign();
        if (R.chance(kit.park) && h2 > 3) { const [x, z] = alongU ? W(t, side * (h2 - 1.25)) : W(side * (h2 - 1.25), t); vehicle(kit, x, z, turned(alongU) ? 0 : Math.PI / 2, [occ]); }
        else if (R.chance(.3)) { const [x, z] = alongU ? W(t, side * (h2 + .7)) : W(side * (h2 + .7), t), [fx, fz] = alongU ? W(0, -side) : W(-side, 0), dx = Math.sign(Math.round(fx - d.x)), dzz = Math.sign(Math.round(fz - d.z)); if (fits(x - .3, z - .3, x + .3, z + .3, .1, [occ])) { occ.push([x - .2, z - .2, x + .2, z + .2]); if (kit.street === "track") PROPS.pole().put(x, z, turned(alongU) ? 0 : 1); else PROPS.lamp().put(x, z, 0, dx, dzz); } } }
      for (const dir of [-1, 1]) if (R.chance(.55) && h2 > 3) { const t = dir * R.range(r * .55, r * .8), tr = turned(alongU) ? 0 : 1, a = alongU ? W(t, -h2 + 1.6) : W(-h2 + 1.6, t), b = alongU ? W(t + 3.2, h2 - 1.6) : W(h2 - 1.6, t + 3.2); prop("barrier", a[0], a[1], tr, .1, [occ]); prop(R.pick(["barrier", "sandbag"]), b[0], b[1], tr, .1, [occ]); } }
    if (d.roof) { plan.lit++; P.push(["li", d.x, d.z, 4.9]); } else { const [x, z] = W(-hs - .8, -hs - .8); plan.lit++; P.push(["lp", x, z, d.ax ? 0 : 1, d.ax ? 1 : 0]); occ.push([x - .2, z - .2, x + .2, z + .2]); }
    // against the walls: bins, crates, drums, whatever the kit keeps there
    for (const [bx, bz, hw, hd] of d.blds) for (let k = R.int(0, 3); k > 0; k--) { const sd = R.int(0, 3), name = R.w(kit.wall), q = .9, x = sd === 0 ? bx - hw - q : sd === 1 ? bx + hw + q : bx + R.range(-hw, hw) * .8, z = sd === 2 ? bz - hd - q : sd === 3 ? bz + hd + q : bz + R.range(-hd, hd) * .8; if (fits(x - 1, z - 1, x + 1, z + 1, 0, [mine])) prop(name, x, z, sd < 2 ? 1 : 0, .05, [occ]); }
    // in the open
    for (let i = 0, n = 0; i < 120 && n < 10 + r * .8; i++) { const [x, z] = W(R.range(-r, r), R.range(-r, r)); if (prop(R.w(kit.open), x, z, R.chance(.5) ? 1 : 0, .7)) n++; }
    if (R.chance(.6)) for (let i = 0; i < 12; i++) { const [x, z] = W(R.range(-r + 3, r - 3), R.range(-r + 3, r - 3)); if (prop("tower", x, z, 0, 1.5)) break; }
  }

  /* ---------- along the roads ---------- */
  const inDistrict = (x, z, m) => plan.districts.some((d) => Math.abs(x - d.x) < d.r + m && Math.abs(z - d.z) < d.r + m) || (Math.abs(x) < 34 + m && (z > 104 - m || z < -146 + m));
  for (const rd of plan.roads) { const ux = (rd.bx - rd.ax) / rd.len, uz = (rd.bz - rd.az) / rd.len, nx = -uz, nz = ux, rot = Math.atan2(ux, uz); let side = R.sign();
    for (let t = 7; t < rd.len - 5; t += R.range(8, 15)) { const x = rd.ax + ux * t, z = rd.az + uz * t, k = R(); side = -side;
      if (URB || CUSTOM) { if (!CUSTOM && k > .8 && k < .9 && rd.len > 40) { const r90 = Math.abs(ux) > Math.abs(uz) ? 1 : 0; prop("barrier", x + nx * 2, z + nz * 2, r90, .1, [occ]); prop(R.pick(["sandbag", "crates"]), x - nx * 2 + ux * 3.5, z - nz * 2 + uz * 3.5, r90, .1, [occ]); } continue; }
      if (k < .3) { const px = x + nx * side * (rd.hw + 2.2), pz = z + nz * side * (rd.hw + 2.2); if (fits(px - .3, pz - .3, px + .3, pz + .3, .2, [occ])) { occ.push([px - .2, pz - .2, px + .2, pz + .2]); PROPS.pole().put(px, pz, Math.abs(ux) > Math.abs(uz) ? 1 : 0); } }
      else if (k < .5) gen(R.w(KITS.town.veh.concat(KITS.works.veh)), x + nx * side * (rd.hw - .6), z + nz * side * (rd.hw - .6), rot + R.range(-.5, .5), R.w([["damaged", 1], ["ruined", 1.4]]), .3, [occ]);
      else if (k < .57) gen("billboard", x + nx * side * (rd.hw + 6), z + nz * side * (rd.hw + 6), rot + (side > 0 ? -1 : 1) * Math.PI / 2 * 0 + R.pick([0, Math.PI]), state(), .3, [occ]);
      else if (k < .7) plan.rocks.push([x + nx * side * (rd.hw + R.range(2, 6)), z + nz * side * (rd.hw + R.range(2, 6)), R.range(5, 12)]);
      else if (k < .8) plan.bushes.push([R.pick(["dry", "leafy", "round"]), x + nx * side * (rd.hw + R.range(1, 4)), z + nz * side * (rd.hw + R.range(1, 4)), R.range(.8, 1.3), 0]);
      else if (k < .86 && rd.len > 40) { const r90 = Math.abs(ux) > Math.abs(uz) ? 1 : 0; prop("barrier", x + nx * 2, z + nz * 2, r90, .1, [occ]); prop("sandbag", x - nx * 2 + ux * 3.5, z - nz * 2 + uz * 3.5, r90, .1, [occ]); } } }

  /* ---------- the urban layer, for City blocks and Ship boarding ----------
     These two are laid out for the way pilots move. Every road becomes a lane wide enough for a mech (15 metres between
     faces) lined with tall flat-sided blocks to run along, with alleys between them. Blockhouses, the same hollow halls
     the roofed points use, stand off the lanes for pilots and troops to go into and clear.
     A ship adds a hull down both sides, bulkheads across it between the sectors with wide doorways, and a deck overhead,
     so nothing can come down from the sky: no mechs and no pods. Every point on a ship is inside. */
  if (FLAT && !CUSTOM) { const LANE = 7.5, tones = SHIP ? ["#5f676d", "#4a5258", "#6c747a", "#565e64"] : ["#8a5a44", "#7d858a", "#9a8f80", "#6f6a62", "#76634c", "#5f676d"], near = (x, z, r) => plan.roads.some((rd) => { const t = clamp(((x - rd.ax) * (rd.bx - rd.ax) + (z - rd.az) * (rd.bz - rd.az)) / (rd.len * rd.len), 0, 1); return Math.hypot(x - lerp(rd.ax, rd.bx, t), z - lerp(rd.az, rd.bz, t)) < r; });
    plan.houses = []; const tower = (x, z, w, d, h, col) => { if (Math.abs(x) + w / 2 > 112 || z + d / 2 > 100 || z - d / 2 < -142 || !fits(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 1.2) || near(x, z, LANE + Math.max(w, d) / 2 - .5)) return false; occ.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]); if (URB) { prefab(x, z, w, d, h); return true; } S(x, z, w, h, d, col); D(x, z, w + .3, .35, d + .3, "#3c4046", h);
      if (!SHIP) for (let y = 3; y < h - 1; y += 3) { D(x, z, w + .06, .9, d * .7, "#2a3038", y); D(x, z, w * .7, .9, d + .06, "#2a3038", y); } else { G(x, z, w + .08, .12, d + .08, h * .55); } return true; };
    // blocks down both sides of every lane
    /* Rooftop routes. Blocks along a lane are 7 to 10 metres high. Behind every second one a flight of steps climbs to the
       roof (each step a jump high), and where two neighbours stand close and near the same height a plank joins their
       roofs, so a pilot can get up and run the length of a street above the mechs. */
    for (const rd of plan.roads) { const ux = (rd.bx - rd.ax) / rd.len, uz = (rd.bz - rd.az) / rd.len, alongZ = Math.abs(uz) > Math.abs(ux), straight = Math.min(Math.abs(ux), Math.abs(uz)) < .2; for (const sd of [-1, 1]) { let t = 6, prev = null, n = 0; while (t < rd.len - 6) { const len = URB && R.chance(.3) ? R.pick([22, 26, 30]) : R.pick([9, 12, 15]), dep = R.pick([6, 8, 10]), h = SHIP ? R.pick([6, 8, 9]) : R.pick([7, 8, 9, 10]), off = LANE + dep / 2 + .4, cx = rd.ax + ux * (t + len / 2) - uz * off * sd, cz = rd.az + uz * (t + len / 2) + ux * off * sd, w = alongZ ? dep : len, d = alongZ ? len : dep, gap = R.pick([3.5, 4, 5]);
          if (tower(cx, cz, w, d, h, R.pick(tones))) { n++;
            if (straight && n % 2 === 1) { const k = Math.max(5, Math.floor(len / 1.5)), out = alongZ ? Math.sign(cx - (rd.ax + ux * (t + len / 2))) || sd : Math.sign(cz - (rd.az + uz * (t + len / 2))) || sd; for (let i = 0; i < k; i++) { const a = -len / 2 + (i + .5) * (len / k), sh = h * (i + 1) / (k + 1), sx = alongZ ? cx + out * (dep / 2 + .8) : cx + a, sz = alongZ ? cz + a : cz + out * (dep / 2 + .8); if (fits(sx - .8, sz - .8, sx + .8, sz + .8, 0)) S(sx, sz, alongZ ? 1.5 : len / k, sh, alongZ ? len / k : 1.5, "#565e64"); } }   // steps up the far side
            if (prev && straight && Math.abs(prev.h - h) <= 2 && prev.gap <= 5) { const y = Math.min(prev.h, h) - .3, mid = t - prev.gap / 2, bx = rd.ax + ux * mid - uz * off * sd, bz = rd.az + uz * mid + ux * off * sd; S(bx, bz, alongZ ? 2 : prev.gap + 1, .3, alongZ ? prev.gap + 1 : 2, "#76634c", null, y); }
            prev = { h, gap }; } else prev = null; t += len + gap; } } }
    // blockhouses to go into: tried at spots beside the lanes between one sector and the next
    const want = size === "s" ? 4 : size === "m" ? 6 : 8; let made = 0; for (let i = 0; i < 300 && made < want; i++) { const x = R.range(-96, 96), z = R.range(-128, 88), turn = R.chance(.5), hw = turn ? 9 : 12, hd = turn ? 12 : 9; if (!fits(x - hw - 4, z - hd - 4, x + hw + 4, z + hd + 4, 0) || near(x, z, LANE + Math.max(hw, hd)) || !near(x, z, 34)) continue;
      hall({ last: false, kn: SHIP ? "works" : R.pick(["town", "works", "farm"]) }, null, (u0, v0, u1, v1) => (turn ? [x + Math.min(v0, v1), z + Math.min(u0, u1), x + Math.max(v0, v1), z + Math.max(u0, u1)] : [x + Math.min(u0, u1), z + Math.min(v0, v1), x + Math.max(u0, u1), z + Math.max(v0, v1)])); plan.yards.push([x, z, 13]); plan.houses.push([x, z]); made++; }
    plan.blockhouses = made;
    if (URB) { /* Filling in. The ground between the districts and beside the lanes is tried spot by spot for a frontier piece,
         so the field is built up from one base to the other. Pairs of blast walls 6.5 metres apart make a corridor to
         run and kick through; the outer edge of the field is a broken line of high wall, good for one long run. */
      const lim = size === "s" ? 86 : size === "m" ? 100 : 108, cells = []; for (let gx = -lim + 8; gx <= lim - 8; gx += 15) for (let gz = -134; gz <= 94; gz += 15) cells.push([gx + R.range(-5, 5), gz + R.range(-5, 5)]); for (let i = cells.length - 1; i > 0; i--) { const j = R.int(0, i); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      for (const [x, z] of cells) { if (inDistrict(x, z, 0)) continue; if (lot(x, z)) { plan.paint.push({ x0: x - 10, z0: z - 10, x1: x + 10, z1: z + 10, k: R.chance(.7) ? "apron" : "pave" }); if (R.chance(.7)) prop(R.w(COVER), x + R.range(-9, 9), z + R.range(-9, 9), R.chance(.5) ? 1 : 0, .8); } } plan.infill = LOTS.n;
      for (const sd of [-1, 1]) for (let z = -138; z < 96; z += 40) { const len = 32, cz = z + 18 + R.range(-2, 2); runwall(sd * (lim + 6), cz, len, true, R.pick([11, 12, 13]), true); } }
    if (SHIP) { const HX = 120, Z0 = -186, Z1 = 150, HH = 14, hull = "#4a5258", DOORS = size === "l" ? [-84, 0, 84] : [-60, 60];
      for (let z = Z0; z < Z1; z += 28) for (const sd of [-1, 1]) { S(sd * HX, z + 14, 3, HH, 28, hull); G(sd * (HX - 1.6), z + 14, .12, .25, 22, 4); }   // the hull, down both sides
      for (let x = -HX; x < HX; x += 30) { S(x + 15, Z0, 30, HH, 3, hull); S(x + 15, Z1, 30, HH, 3, hull); }
      for (let k = 0; k + 1 < plan.sectors.length; k++) { const z = Math.round((plan.sectors[k].z + plan.sectors[k + 1].z) / 2); for (let x = -HX + 2; x < HX - 2; x += 6) { const cx = x + 3; if (near(cx, z, 9) || DOORS.some((dx) => Math.abs(cx - dx) < 8) || !fits(cx - 3, z - 1, cx + 3, z + 1, .5)) continue; S(cx, z, 6, HH, 1.6, "#565e64"); occ.push([cx - 3, z - .8, cx + 3, z + .8]); } }   // bulkheads between the sectors, open where a lane runs through and at two more doorways
      for (let x = -HX; x < HX; x += 40) for (let z = Z0; z < Z1; z += 42) { S(x + 20, z + 21, 40, .6, 42, "#3c4046", { roof: true, stripe: false, base: "#3c4046", cap: "#3c4046" }, HH); G(x + 20, z + 21, .5, .14, 30, HH - .2); }   // the deck overhead, lit down its length
      /* The hangar, placed by hand: a catwalk 5 metres up along each side of the hull for the whole length, with steps
         up to it every 56 metres; dropships parked in the first bay; and painted frames round the bulkhead doorways. */
      for (const sd of [-1, 1]) { for (let z = Z0 + 4; z < Z1 - 4; z += 28) { S(sd * (HX - 4), z + 14, 5, .4, 28, "#6c747a", null, 5); D(sd * (HX - 6.4), z + 14, .12, 1, 28, "#c9733a", 5.4); }
        for (let z = Z0 + 30; z < Z1 - 20; z += 56) for (let i = 0; i < 5; i++) S(sd * (HX - 8.2), z + i * 1.6, 3, (i + 1), 1.6, "#565e64"); }
      { const z0 = plan.sectors[0].z + (flip ? -1 : 1) * 30, ship = (x, z) => { if (!fits(x - 8, z - 5, x + 8, z + 5, 1) || near(x, z, 12)) return; occ.push([x - 8, z - 5, x + 8, z + 5]); S(x, z, 14, 2.8, 4.4, "#7d858a", null, 1.4); S(x - 4, z, 5, 1.6, 9.5, "#6c747a", null, 2.2); S(x + 5.5, z, 2, 2.2, .6, "#5f676d", null, 4.2); for (const sx of [-4, 3]) for (const sz of [-1.7, 1.7]) S(x + sx, z + sz, .5, 1.4, .5, "#3c4046"); D(x - 7.1, z, .3, 1, 2.6, "#2a3038", 2.4); G(x + 7.1, z, .2, .6, 1.6, 2.2); }; for (const x of [-92, -64, 64, 92]) ship(x, z0); }
      for (let k = 0; k + 1 < plan.sectors.length; k++) { const z = Math.round((plan.sectors[k].z + plan.sectors[k + 1].z) / 2); for (const x of DOORS) { D(x - 8.4, z, .8, HH, 2, "#c9733a"); D(x + 8.4, z, .8, HH, 2, "#c9733a"); D(x, z, 17.6, .8, 2, "#c9733a", 9); } }
      /* Making it read as a ship: ribs down the hull every 7 metres, beams across the deckhead, pipe runs and cyan panels
         along the walls, painted lane lines on the deck, and the decks between the bulkheads filled with crew rooms,
         cryo bays, cargo racks, mech cradles and consoles. Two reactors stand at the stern. */
      for (let z = Z0 + 3; z < Z1; z += 7) for (const sd of [-1, 1]) D(sd * (HX - 2.1), z, 1.2, HH, .8, "#3c4046");
      for (let z = Z0 + 7; z < Z1; z += 14) D(0, z, HX * 2 - 4, .9, .7, "#3c4046", HH - 1);
      for (const sd of [-1, 1]) { for (const [y, c] of [[2.6, "#7d6a52"], [3.3, "#5f676d"], [10.2, "#8a3a2a"]]) D(sd * (HX - 2.9), (Z0 + Z1) / 2, .5, .5, Z1 - Z0 - 6, c, y); for (let z = Z0 + 10; z < Z1 - 6; z += 14) C(sd * (HX - 1.55), z, .1, 1.8, 3.2, 7.4); }
      for (const x of DOORS) for (const sd of [-1, 1]) D(x + sd * 7.5, (Z0 + Z1) / 2, .35, .04, Z1 - Z0 - 8, HAZ, .02);
      { let n = 0; for (const x of [-40, 40]) if (reactor(x, Z0 + 18)) n++; plan.reactors = n; }
      { const cells = []; for (let gx = -HX + 16; gx <= HX - 16; gx += 16) for (let gz = Z0 + 14; gz <= Z1 - 14; gz += 16) cells.push([gx + R.range(-3, 3), gz + R.range(-3, 3)]); for (let i = cells.length - 1; i > 0; i--) { const j = R.int(0, i); [cells[i], cells[j]] = [cells[j], cells[i]]; }
        const SHIPK = [["room", 3], ["cryo", 2], ["rack", 3], ["cradle", 2], ["hangar", .8], ["tanks", .8], ["console", 1.5]]; let n = 0;
        for (const [x, z] of cells) { if (inDistrict(x, z, 2) || DOORS.some((dx) => Math.abs(x - dx) < 12)) continue; const k = R.w(SHIPK), az = R.chance(.5);
          const ok = k === "room" ? crewRoom(x, z) : k === "cryo" ? cryo(x, z, az) : k === "rack" ? rack(x, z, az) : k === "cradle" ? cradle(x, z, az) : k === "hangar" ? hangar(x, z, az) : k === "tanks" ? tankfarm(x, z) : consoleBox(x, z, az);
          if (ok) { n++; if (R.chance(.5)) consoleBox(x + R.range(-7, 7), z + R.range(-7, 7), R.chance(.5)); } } plan.shipFill = n; }
      plan.paint.unshift({ x0: -HX, z0: Z0, x1: HX, z1: Z1, k: "apron" }); } }
  /* ---------- the highlands: ground at many heights, rock you can climb, a bunker on high ground and one under it ----------
     Built the way a Titanfall field is built. Each lane has more than one way through it: the road for the mechs, and
     for pilots a line of walls to wall-run, a raised duct, a ridge path or a tunnel through the rock. High ground has a
     blockhouse on it to fight from; low ground has a bunker dug into it. Rock is stacked in steps a pilot can climb. */
  if (HIGH) { const ROCK = ["#6f6a62", "#7a756c", "#625d56", "#585348", "#807563"], rk = () => R.pick(ROCK), loc = (x, z) => api.hills(x, z) * .5 + 2;
    const clear = (x, z, hw, hd, m = 3) => fits(x - hw, z - hd, x + hw, z + hd, m) && !nearRoad(x, z, Math.max(hw, hd) + 5) && !inDistrict(x, z, Math.max(hw, hd) + 5) && Math.abs(x) + hw < 140 && z - hd > -178 && z + hd < 138;
    const flatten = (x, z, hw, hd, h, bl) => plan.zones.push([x - hw, z - hd, x + hw, z + hd, h, bl]);
    // a crag: rock stacked in steps no taller than a pilot can pull up onto, each a little narrower than the one below
    const crag = (x, z, w, d, h) => { let y = 0, ww = w, dd = d, ox = 0, oz = 0; while (y < h - .4) { const t = Math.min(2.3, h - y); S(x + ox, z + oz, ww, t, dd, rk(), null, y); y += t; ox += R.range(-.5, .5); oz += R.range(-.5, .5); ww *= R.range(.66, .82); dd *= R.range(.66, .82); if (ww < 1.6 || dd < 1.6) break; } };
    const tries = (n, f) => { let made = 0; for (let i = 0; i < 400 && made < n; i++) if (f()) made++; return made; };
    const big = size === "l" ? 1 : size === "m" ? .75 : .5, gaps = plan.sectors.slice(0, -1).map((sec, k) => (sec.z + plan.sectors[k + 1].z) / 2);
    // 1. high ground: a raised shelf with a blockhouse on it and crags round its edge
    plan.mesas = tries(Math.round(2 + 3 * big), () => { const x = R.range(-128, 128), z = R.range(-160, 118); if (!clear(x, z, 18, 18, 4)) return false; const h = Math.round(loc(x, z) + R.pick([7, 9, 11, 13]));
      flatten(x, z, 15, 15, h, 13); occ.push([x - 19, z - 19, x + 19, z + 19]); const turn = R.chance(.5);
      hall({ last: false, kn: R.pick(["works", "town", "farm"]) }, null, (u0, v0, u1, v1) => (turn ? [x + Math.min(v0, v1), z + Math.min(u0, u1), x + Math.max(v0, v1), z + Math.max(u0, u1)] : [x + Math.min(u0, u1), z + Math.min(v0, v1), x + Math.max(u0, u1), z + Math.max(v0, v1)]));
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (R.chance(.7)) crag(x + a * 13.5, z + b * 13.5, R.range(4, 6), R.range(4, 6), R.pick([4.6, 6.9]));
      P.push(["sb", x + R.range(-10, 10), z + (turn ? 12.5 : -12.5), 4.2, turn ? 0 : 1]); plan.lit++; P.push(["fb", x + 10, z - 10]); return true; });
    // 2. a tunnel through the rock: a ridge of stone across a lane with a lit passage under it, and steps up its sides to the top
    plan.tunnels = tries(Math.round(1 + 2 * big), () => { const x = R.pick([-1, 1]) * R.range(30, 128), z = R.pick(gaps) + R.range(-10, 10); if (!fits(x - 11, z - 16, x + 11, z + 16, 2) || inDistrict(x, z, 14) || nearRoad(x, z, 12) || Math.abs(x) > 130) return false; const h0 = Math.round(loc(x, z));
      flatten(x, z, 10, 16, h0, 8); occ.push([x - 11, z - 16, x + 11, z + 16]); const L = 28, IN = 6, WT = 5, H = 8;
      for (const sd of [-1, 1]) { S(x + sd * (IN / 2 + WT / 2), z, WT, H, L, rk()); crag(x + sd * (IN / 2 + WT + 1.6), z + R.range(-6, 6), 3.6, 7, 6.9); crag(x + sd * (IN / 2 + WT + 1.4), z + R.range(-8, 8) * -1, 3.4, 5, 4.6); }
      S(x, z, IN + .2, 3, L, rk(), { roof: true, stripe: false, base: "#625d56", cap: "#6f6a62" }, H - 3); plan.halls.push([x - IN / 2, z - L / 2, x + IN / 2, z + L / 2, H - 3]);
      for (let u = -L / 2 + 4; u < L / 2; u += 8) { plan.lit++; P.push(["li", x, z + u, H - 3.3]); } G(x - IN / 2 + .1, z, .1, .2, L - 4, 2.6); G(x + IN / 2 - .1, z, .1, .2, L - 4, 2.6);
      for (const u of [-7, 5]) prop(R.pick(["crates", "barrels", "sandbag"]), x + R.range(-1.4, 1.4), z + u, 1, .1); return true; });
    // 3. a bunker dug into the ground: a pit with concrete walls and a slab over it, and stairs down at the open end
    plan.bunkers = tries(Math.round(1 + 2 * big), () => { const x = R.range(-110, 110), z = R.range(-150, 110), az = R.chance(.5); if (!clear(x, z, 11, 11, 3)) return false; const top = Math.round(loc(x, z)), dp = 4.6, fl = top - dp, hw = 9, hd = 9;
      flatten(x, z, hw, hd, fl, 2.5); flatten(x, z, hw + 4, hd + 4, top, 6); occ.push([x - hw - 3, z - hd - 3, x + hw + 3, z + hd + 3]); const W = (u, v) => (az ? [x + v, z + u] : [x + u, z + v]), Wd = (lu, lv) => (az ? [lv, lu] : [lu, lv]);
      for (const sd of [-1, 1]) { const [a, b] = W(0, sd * (hd - .4)), [w, d] = Wd(hw * 2, .8); S(a, b, w, dp + .3, d, CON); }
      { const [a, b] = W(-(hw - .4), 0), [w, d] = Wd(.8, hd * 2); S(a, b, w, dp + .3, d, CON); }
      { const [a, b] = W(-2.5, 0), [w, d] = Wd(hw * 2 - 5, hd * 2); S(a, b, w, .6, d, CON2, { roof: true, stripe: false, base: CON2, cap: CON }, dp - .3); const q = [Math.min(a - w / 2, a + w / 2), Math.min(b - d / 2, b + d / 2), Math.max(a - w / 2, a + w / 2), Math.max(b - d / 2, b + d / 2)]; plan.halls.push([q[0], q[1], q[2], q[3], dp - .3]); }
      for (let i = 0; i < 6; i++) { const [a, b] = W(hw - 1 - i * .9, 0), [w, d] = Wd(.9, 3.4); S(a, b, w, .75 * (i + 1), d, "#8f959a"); }   // the stairs, rising to the open end
      for (const u of [-5, 0]) { plan.lit++; const [a, b] = W(u, 0); P.push(["li", a, b, dp - .6]); } { const [a, b] = W(-4, -4); prop("crates", a, b, 0, .1); } { const [a, b] = W(-1, 4); prop("barrels", a, b, 0, .1); }
      { const [a, b] = W(-2.5, 0); D(a, b, 2, 1.2, 2, "#5f676d", dp + .3); G(a, b, .6, .15, .6, dp + 1.5); } return true; });
    // 4. ridge paths along the flanks: a raised strip of ground beside the field, for a pilot who wants to go round
    for (const sd of [-1, 1]) for (let k = 0; k < gaps.length; k++) if (R.chance(.65)) { const x = sd * R.range(118, 132), z = gaps[k], h = Math.round(loc(x, z) + R.pick([3, 5])); if (!fits(x - 6, z - 20, x + 6, z + 20, 2)) continue; flatten(x, z, 5, 20, h, 9); for (const u of [-14, 0, 14]) if (R.chance(.6)) crag(x - sd * 6.5, z + u, 3, 4, R.pick([4.6, 6.9])); }
    // 5. wall-run lines: panels set alternately left and right of a line, so a pilot can run one, jump, and catch the next
    const runline = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), az = Math.abs(z1 - z0) > Math.abs(x1 - x0), n = Math.floor(len / 9); let sd = R.sign(), made = 0;
      for (let i = 0; i < n; i++) { const t = (i + .5) / n, cx = lerp(x0, x1, t), cz = lerp(z0, z1, t), px = az ? cx + sd * 2.9 : cx, pz = az ? cz : cz + sd * 2.9, w = az ? .9 : 7, d = az ? 7 : .9, h = R.pick([5, 5.5, 6, 6.5]);
        if (!fits(px - w / 2, pz - d / 2, px + w / 2, pz + d / 2, .8) || nearRoad(px, pz, 6) || inDistrict(px, pz, 2)) { sd = -sd; continue; } occ.push([px - w / 2, pz - d / 2, px + w / 2, pz + d / 2]);
        const c = R.pick(WALLC); S(px, pz, w, h, d, c); D(px, pz, w + .2, .3, d + .2, FRAME, h); D(px, pz, w + .06, .35, d + .06, "#c9733a", .7); if (R.chance(.4)) G(px, pz, az ? w + .05 : 3, .16, az ? 3 : d + .05, h - 1); sd = -sd; made++; } return made; };
    for (let k = 0; k < gaps.length; k++) { const a = plan.sectors[k], b = plan.sectors[k + 1]; for (const ia of a.pts) { const da = plan.districts[ia]; let best = null, bd = 1e9; for (const ib of b.pts) { const db = plan.districts[ib], dd = Math.abs(db.x - da.x); if (dd < bd) { bd = dd; best = db; } }
        if (!best) continue; const off = R.sign() * R.range(14, 22); runline(da.x + off, da.z + (best.z > da.z ? da.r + 4 : -da.r - 4), best.x + off, best.z + (best.z > da.z ? -best.r - 4 : best.r + 4)); } }
    // 6. raised ducts and frontier blocks between the lanes: more to run along, more kinds of building
    tries(Math.round(3 + 4 * big), () => { const x = R.range(-120, 120), z = R.pick(gaps) + R.range(-14, 14), az = R.chance(.5); return !inDistrict(x, z, 6) && pipeline(x, z, R.pick([18, 24, 30]), az, R.pick([3.6, 4.2, 5])); });
    tries(Math.round(4 + 6 * big), () => { const x = R.range(-125, 125), z = R.range(-165, 120); return !inDistrict(x, z, 10) && lot(x, z); });
    // 7. ruins, rock and filler, so no stretch of ground is bare
    tries(Math.round(10 + 10 * big), () => { const x = R.range(-135, 135), z = R.range(-170, 128); if (!clear(x, z, 4, 4, 1)) return false; const az = R.chance(.5), c = R.pick(["#8a7d6a", "#7d858a", "#76634c", "#a39c8c"]), len = R.range(5, 9);
      for (let u = -len / 2; u < len / 2 - .5; u += 1.5) { const hh = R.chance(.25) ? 0 : R.range(1, 4.2); if (hh) S(x + (az ? 0 : u + .75), z + (az ? u + .75 : 0), az ? .5 : 1.5, hh, az ? 1.5 : .5, c); } occ.push([x - 4.5, z - 4.5, x + 4.5, z + 4.5]); if (R.chance(.5)) plan.rocks.push([x + R.range(-4, 4), z + R.range(-4, 4), R.range(3, 6)]); return true; });
    tries(Math.round(3 + 4 * big), () => { const x = R.range(-125, 125), z = R.range(-165, 120); return !inDistrict(x, z, 10) && R.pick([hab, hab, mast, solar, greenhouse, crane])(x, z); });
    const FILL = [["rock", 4], ["tree", 3], ["bush", 4], ["crates", 1.4], ["barrels", 1], ["container", 1], ["sandbag", 1.2], ["hesco", 1], ["wall", 1.2], ["tank", .5], ["piperack", .5]];
    for (let i = 0; i < 260 * (.6 + big * .6); i++) { const x = R.range(-140, 140), z = R.range(-175, 132); if (inDistrict(x, z, 3) || nearRoad(x, z, 5)) continue; prop(R.w(FILL), x, z, R.chance(.5) ? 1 : 0, .4); }
    for (let i = 0; i < 26 * (.5 + big); i++) { const x = R.range(-140, 140), z = R.range(-175, 132); if (!clear(x, z, 3, 3, 1)) continue; crag(x, z, R.range(3, 5.5), R.range(3, 5.5), R.pick([2.3, 4.6, 4.6, 6.9])); occ.push([x - 3, z - 3, x + 3, z + 3]); } }

  // light pylons along the roads of the newer colonies, so the routes between points are lit
  if (COLONY || HIGH || CITY) { let n = 0; for (const rd of plan.roads) for (let t = 14; t < rd.len - 10; t += 24) { const ux = (rd.bx - rd.ax) / rd.len, uz = (rd.bz - rd.az) / rd.len, sd = (Math.round(t / 24) % 2) ? 1 : -1, x = rd.ax + ux * t - uz * 7 * sd, z = rd.az + uz * t + ux * 7 * sd; if (!inDistrict(x, z, 2) && !nearRoad(x, z, 5.5) && pylon(x, z)) n++; } plan.pylons = n; }
  /* ---------- out in the hills: small places with their own reason to be there ---------- */
  const OUT = { camp: 12, farmstead: 14, fuelstop: 13, relay: 11, checkpoint: 14, crash: 19, tankfarm: 13 }, kinds = Object.keys(OUT); plan.outposts = []; for (let i = kinds.length - 1; i > 0; i--) { const j = R.int(0, i); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  for (let i = 0; i < 400 && !FLAT && plan.outposts.length < (size === "s" ? 5 : 4); i++) { const kind = kinds[plan.outposts.length % kinds.length], hr = OUT[kind], x = R.range(-138, 138), z = R.range(-140, 96);
    if (inDistrict(x, z, hr + 20) || plan.outposts.some((o) => Math.hypot(o.x - x, o.z - z) < 48) || plan.roads.some((rd) => { const t = clamp(((x - rd.ax) * (rd.bx - rd.ax) + (z - rd.az) * (rd.bz - rd.az)) / (rd.len * rd.len), 0, 1); return Math.hypot(x - lerp(rd.ax, rd.bx, t), z - lerp(rd.az, rd.bz, t)) < hr + 12; })) continue;
    const h0 = api.hills(x, z); if (h0 > 24 || Math.abs(api.hills(x + 10, z) - h0) > 4 || Math.abs(api.hills(x, z + 10) - h0) > 4) continue; const h = Math.round(h0 * 2) / 2;
    plan.outposts.push({ x, z, kind, r: hr }); plan.zones.push([x - hr, z - hr, x + hr, z + hr, h, 16]); plan.paint.push({ x0: x - hr + 1, z0: z - hr + 1, x1: x + hr - 1, z1: z + hr - 1, k: kind === "fuelstop" || kind === "tankfarm" ? "apron" : "dirt" }); plan.yards.push([x, z, hr - 1]);
    const q = () => R.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), at = (name, ox, oz, r90 = R.chance(.5) ? 1 : 0) => prop(name, x + ox + R.range(-.6, .6), z + oz + R.range(-.6, .6), r90, .2, [occ]), some = (list, n) => { for (let k = 0, got = 0; k < n * 4 && got < n; k++) if (at(R.pick(list), R.range(-hr + 2, hr - 2), R.range(-hr + 2, hr - 2))) got++; };
    if (kind === "camp") { plan.lit++; P.push(["fb", x, z]); occ.push([x - .5, z - .5, x + .5, z + .5]); at("tent", -5, -2, 0); at("tent", 5, -3, 0); at("tent", 0, 6, 1); some(["crates", "barrels", "sandbag", "hesco", "crates"], 6); gen(R.pick(["humvee", "technical", "pickup"]), x + 7, z + 5, R.range(0, 6), "timber", .3, [occ]); }
    else if (kind === "farmstead") { gen(R.pick(["house", "cabin"]), x - 5, z - 4, 0, state(), .3, [occ]); gen("barn", x + 6, z + 2, Math.PI / 2, state(), .3, [occ]); gen("silo", x + 9, z - 8, 0, "timber", .3, [occ]); gen("tractor", x - 2, z + 6, R.range(0, 6), state(), .3, [occ]); some(["bales", "fence", "fence", "crates", "tree", "bales"], 9); }
    else if (kind === "fuelstop") { gen("gasstation", x, z, q(), state(), .3, [occ]); gen("billboard", x - 10, z - 9, q(), "timber", .3, [occ]); for (let k = 0; k < 3; k++) vehicle(KITS.town, x + R.range(-9, 9), z + R.range(-9, 9), R.range(0, 6), [occ]); some(["dumpster", "barrels", "crates", "barrier", "pallets"], 6); }
    else if (kind === "relay") { gen("celltower", x, z, 0, "timber", .3, [occ]); at("container", -5, 4); at("ac", 3, 3); at("ac", 4.5, 3); gen("pickup", x + 5, z - 5, R.range(0, 6), state(), .3, [occ]); some(["wall", "wall", "crates", "barrels", "rock"], 6); }
    else if (kind === "checkpoint") { at("tower", 0, 0, 0); for (const [ox, oz, r90] of [[-7, -9, 0], [0, -9, 0], [7, -9, 0], [-10, -3, 1], [10, -3, 1], [-10, 4, 1], [10, 4, 1], [-6, 9, 0], [6, 9, 0]]) at("hesco", ox, oz, r90); at("tent", -5, 3, 1); gen(R.pick(["humvee", "technical"]), x + 5, z + 3, R.range(0, 6), "timber", .3, [occ]); some(["crates", "barrels", "sandbag"], 5); }
    else if (kind === "crash") { gen("airliner", x, z, R.range(0, 6.28), "ruined", .3, [occ]); gen("firetruck", x + 12, z + 10, R.range(0, 6), "damaged", .3, [occ]); gen("ambulance", x - 12, z + 11, R.range(0, 6), "damaged", .3, [occ]); some(["rubble", "rubble", "crates", "barrier", "rubble"], 9); }
    else { for (const [ox, oz] of [[-6, -5], [6, -5], [0, 6]]) gen("fueltank", x + ox, z + oz, 0, state(), .3, [occ]); some(["tank", "piperack", "barrels", "container", "wall", "crates"], 8); gen("boxtruck", x + 9, z + 8, R.range(0, 6), state(), .3, [occ]); }
  }

  /* ---------- a field from the editor: every piece where it was put ---------- */
  if (CUSTOM) { plan.houses = []; plan.paint.unshift({ x0: -124, z0: -190, x1: 124, z1: 152, k: ["apron", "pave", "dirt", "grass"].includes(DZ.ground) ? DZ.ground : "apron" }); const SZ = { blockS: [8, 6, 6], blockM: [12, 9, 8], blockL: [16, 12, 11], tower: [8, 8, 15] };
    for (const it of (DZ.items || []).slice(0, 600)) { const x = +it.x || 0, z = mz(+it.z || 0), az = !!it.r, t = it.t, sz = SZ[t];
      if (sz) { const w = az ? sz[1] : sz[0], dd = az ? sz[0] : sz[1]; occ.push([x - w / 2, z - dd / 2, x + w / 2, z + dd / 2]); prefab(x, z, w, dd, sz[2]); }
      else if (t === "stack") stack(x, z, az ? 11 : 14, az ? 14 : 11); else if (/^wall\d\d$/.test(t)) runwall(x, z, +t.slice(4), az, 9, true); else if (t === "pipe" || t === "pipelow") pipeline(x, z, 24, az, t === "pipe" ? 4.2 : 0); else if (t === "tanks") tankfarm(x, z, az); else if (t === "pad") pad(x, z); else if (t === "dropship") dropship(x, z);
      else if (t === "hall") { hall({ last: false, kn: "works" }, null, (u0, v0, u1, v1) => (az ? [x + Math.min(v0, v1), z + Math.min(u0, u1), x + Math.max(v0, v1), z + Math.max(u0, u1)] : [x + Math.min(u0, u1), z + Math.min(v0, v1), x + Math.max(u0, u1), z + Math.max(v0, v1)])); plan.yards.push([x, z, 13]); plan.houses.push([x, z]); }
      else if (t === "tree" || t === "rock" || PROPS[t === "lowwall" ? "wall" : t]) prop(t === "lowwall" ? "wall" : t, x, z, az ? 1 : 0, 0, [[]]); } }

  /* ---------- the two bases: dressed at the sides, the middle left clear for troops ---------- */
  for (const [bz, f] of [[128, -1], [-166, 1]]) for (const sd of [-1, 1]) { const lists = [occ]; prop("tent", sd * 20, bz - f * 3, 1, .2, lists); prop("tent", sd * 20, bz - f * 10, 1, .2, lists); prop("container", sd * 27, bz + f * 4, 1, .2, lists); prop("hesco", sd * 16, bz + f * 18, 0, .2, lists); prop("hesco", sd * 24, bz + f * 17, 0, .2, lists); prop("crates", sd * 14, bz + f * 2, 0, .2, lists); prop("tower", sd * 29, bz + f * 14, 0, .2, lists); gen(R.pick(["humvee", "technical", "boxtruck"]), sd * 15, bz - f * 12, R.range(0, 6), "timber", .3, lists); prop("barrels", sd * 25, bz - f * 4, 0, .2, lists); }

  /* ---------- what the ground is at a spot: a painted kind, or nothing where the land is left as it grew ---------- */
  plan.kindAt = (x, z) => { for (let i = plan.paint.length - 1; i >= 0; i--) { const p = plan.paint[i]; if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return p; } for (const rd of plan.roads) { const t = clamp(((x - rd.ax) * (rd.bx - rd.ax) + (z - rd.az) * (rd.bz - rd.az)) / (rd.len * rd.len), 0, 1), px = lerp(rd.ax, rd.bx, t), pz = lerp(rd.az, rd.bz, t), dd = Math.hypot(x - px, z - pz); if (dd < rd.hw) return { k: rd.k, road: 1, cc: ((x - px) * -(rd.bz - rd.az) + (z - pz) * (rd.bx - rd.ax)) / rd.len, al: t * rd.len, hw: rd.hw }; } return null; };
  plan.surface = (x, z, n, n2) => { const p = plan.kindAt(x, z); if (!p) return null; const cc = p.road ? p.cc : p.ax === undefined ? 0 : (p.ax ? x : z) - p.c, al = p.road ? p.al : p.ax ? z : x, hw = p.hw || 4;
    switch (p.k) {
      case "asphalt": return Math.abs(cc) < .3 && Math.floor(al / 1.5 + 100) % 3 === 0 && n2 < .8 ? "#b9a582" : Math.abs(cc) > hw - .5 && n2 < .6 ? "#7d7a72" : n2 > .72 ? "#33302e" : n > .55 ? "#454240" : "#3e3b39";
      case "runway": return Math.abs(cc) < .5 && Math.floor(al / 3 + 100) % 2 === 0 ? "#d8d2c0" : Math.abs(Math.abs(cc) - hw + 1.2) < .35 ? "#d8d2c0" : n2 > .8 ? "#262524" : n > .5 ? "#353332" : "#2f2e2d";
      case "track": return Math.abs(Math.abs(cc) - 1) < .35 ? "#4f4434" : n > .5 ? "#6c5a44" : "#5c4c3a";
      case "pave": { const fx = Math.abs(x - Math.round(x / 2) * 2), fz = Math.abs(z - Math.round(z / 2) * 2); return fx < .25 || fz < .25 ? "#6c6962" : n2 > .8 ? "#757168" : n > .5 ? "#8a867c" : "#7f7b72"; }
      case "apron": { const fx = Math.abs(x - Math.round(x / 4) * 4), fz = Math.abs(z - Math.round(z / 4) * 4); return fx < .3 || fz < .3 ? "#55534f" : n2 > .8 ? "#5c5a56" : n > .6 ? "#6f6d68" : "#66645f"; }
      case "field": { const row = Math.floor((p.ax ? x : z) / 1.2 + 500) % 2; return p.c === 0 ? (row ? "#8a7a3a" : "#6a5a34") : p.c === 1 ? (row ? "#5c6a40" : "#4a4230") : (row ? "#a08c46" : "#7a6a3a"); }
      case "grass": return n2 > .7 ? "#6a6842" : ["#4f5a3c", "#5c6a40", "#66704a", "#55603a", "#4a5636"][Math.floor(n * 4.99)];
      default: return n2 > .66 ? "#63603e" : ["#5c4c3a", "#64533f", "#6c5a44", "#544636", "#4f4434"][Math.floor(n * 4.99)]; } };
  if (SHIP) { plan.trees.length = 0; plan.bushes.length = 0; plan.rocks.length = 0; }
  plan.soft = (x, z) => { if (SHIP) return false; const p = plan.kindAt(x, z); return !!p && (p.k === "dirt" || p.k === "grass") && !p.road; };   // where grass and brush may grow inside a built place
  plan.name = CUSTOM ? (DZ.name || "Custom field") : THEMES[theme] + " " + (kp[1] || "");
  return plan;
}
