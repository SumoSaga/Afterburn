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

export const THEMES = { city: "City blocks", ship: "Ship boarding", mixed: "Mixed country", town: "Town", works: "Works", airfield: "Airfield", farm: "Farmland" };
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
const MIX = { city: ["town", "town", "works", "town", "town"], ship: ["works", "airfield", "works", "airfield"], mixed: null, town: ["town", "town", "town", "farm", "works"], works: ["works", "works", "works", "town", "airfield"], airfield: ["airfield", "works", "airfield", "town", "works"], farm: ["farm", "farm", "farm", "town", "works"] };

export function planMap(key, api) {
  const kp = key.split("-"), theme = THEMES[kp[0]] ? kp[0] : "mixed", size = (kp[2] || "sa")[0], flip = (kp[2] || "sa")[1] === "d", R = rng(hashStr(kp[0] + "-" + kp[1] + "-" + size + (api.salt ? "~" + api.salt : ""))), wear = R.range(.25, .7);
  const plan = { key, theme, zones: [], sites: [], districts: [], roads: [], prims: [], gens: [], trees: [], bushes: [], rocks: [], paint: [], yards: [], lit: 0 };
  const P = plan.prims, occ = [], keep = [], count = {}, CITY = theme === "city", SHIP = theme === "ship", FLAT = CITY || SHIP; plan.indoor = SHIP;   // City blocks and Ship boarding are built on level ground for pilots: see the urban layer below
  const fits = (x0, z0, x1, z1, m = 0, lists = [occ, keep]) => { for (const L of lists) for (const o of L) if (x0 - m < o[2] && x1 + m > o[0] && z0 - m < o[3] && z1 + m > o[1]) return false; return true; };
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
  const SPEC = { s: { bands: [[42, 30, 2], [120, 30, 2], [206, 34, 1]], xr: [36, 44] }, m: { bands: [[30, 25, 2], [88, 25, 2], [146, 25, 2], [206, 28, 1]], xr: [34, 62] }, l: { bands: [[30, 25, 2], [88, 25, 3], [146, 25, 2], [206, 24, 2]], xr: [40, 66] } }[size] || null;
  const zOf = (a) => (flip ? -146 + a : 104 - a), even = (v) => Math.round(v / 2) * 2, defH = flip ? 0 : 2, atkZ = flip ? -152 : 126, defZ = flip ? 126 : -152, HALLCOL = { town: "#8a5a44", works: "#5f676d", airfield: "#8a8e92", farm: "#76634c" };
  const kits = MIX[theme] ? MIX[theme].slice() : ["town", "works", "airfield", "farm", R.pick(["town", "works", "farm"])]; for (let i = kits.length - 1; i > 0; i--) { const j = R.int(0, i); [kits[i], kits[j]] = [kits[j], kits[i]]; }
  const used = {}; plan.sectors = []; plan.atk = flip ? "foe" : "you"; plan.size = size; let li = 0;
  SPEC.bands.forEach(([a, r, n], k) => { const last = k === SPEC.bands.length - 1, z = even(zOf(a)), xs = n === 1 ? [0] : n === 3 ? [-84, even(R.range(-4, 4)), 84] : last ? [-28, 28] : [-even(R.range(SPEC.xr[0], SPEC.xr[1])), even(R.range(SPEC.xr[0], SPEC.xr[1]))];
    const h = FLAT ? 0 : last ? defH : Math.round(clamp(api.hills(0, z) * .3 - 1, 0, 6)), roofAt = n === 1 ? 0 : n === 3 ? 1 : R.int(0, 1), sec = { k, z, pts: [], gapX: n === 3 ? 42 : n === 1 ? 20 : 0, last }; plan.sectors.push(sec);
    xs.forEach((x, i) => { const kn = kits[li % kits.length], kit = KITS[kn], name = "ABCDEFGHIJ"[li], roof = SHIP || i === roofAt; let label; do label = last ? (n === 1 ? "The citadel" : i ? "Citadel east" : "Citadel west") : R.pick(kit.names); while (used[label] && Object.keys(used).length < 12); used[label] = 1;
      const d = { name, label, x, z, r, h, kn, kit, ax: R.chance(.5) ? 1 : 0, blds: [], sector: k, roof, last }; plan.districts.push(d); sec.pts.push(li); plan.sites.push([name, x, z, label, k, roof ? 1 : 0]); plan.zones.push([x - r - 3, z - r - 3, x + r + 3, z + r + 3, h, 24]); plan.yards.push([x, z, r + 3]); li++; }); });
  plan.homes = plan.sectors.map((sec, k) => ({ atk: k === 0 ? [0, atkZ] : [plan.sectors[k - 1].gapX, plan.sectors[k - 1].z], def: sec.last ? [0, defZ] : [plan.sectors[k + 1].gapX, plan.sectors[k + 1].z] }));
  plan.zones.push([-34, 104, 34, 150, 0, 26], [-34, -190, 34, -146, FLAT ? 0 : 2, 26]); if (FLAT) plan.zones.push([-124, -190, 124, 152, 0, 30]); keep.push([-10, 100, 10, 150], [-10, -190, 10, -142]);

  /* ---------- roads: out of a district by the street that points the right way, then straight to the next ---------- */
  const exitOf = (d, tx, tz) => { const ex = d.r + 3, c = [[ex, 0], [-ex, 0], [0, ex], [0, -ex]]; let b = c[0], bs = -1e9; for (const q of c) { const sc = q[0] * (tx - d.x) + q[1] * (tz - d.z); if (sc > bs) { bs = sc; b = q; } } return [d.x + b[0], d.z + b[1], d.h]; };
  const road = (a, b, k) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 3) return; const n = Math.max(2, Math.round(len / 6)), mid = api.hills((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) * .5; plan.roads.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], k, hw: k === "track" ? 2.4 : 3.6, len });
    for (let i = 1; i < n; i++) { const t = i / n, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), base = lerp(a[2], b[2], sm(t)); plan.zones.push([x - 4.5, z - 4.5, x + 4.5, z + 4.5, base + (len > 30 ? clamp((mid - base) * .5, -2, 5) * Math.sin(Math.PI * t) : 0), 13]); } };
  const link = (d1, d2) => road(exitOf(d1, d2.x, d2.z), exitOf(d2, d1.x, d1.z), d1.kit.street === "track" && d2.kit.street === "track" ? "track" : "asphalt"), DS = (k) => plan.sectors[k].pts.map((i) => plan.districts[i]);
  const baseEdge = (z0, d) => [clamp(d.x, -26, 26), z0, z0 > 0 ? 0 : 2], aEdge = flip ? -146 : 104, dEdge = flip ? 104 : -146;
  for (const d of DS(0)) road(baseEdge(aEdge, d), exitOf(d, d.x, aEdge + (flip ? -200 : 200)), "asphalt"); for (const d of DS(plan.sectors.length - 1)) road(baseEdge(dEdge, d), exitOf(d, d.x, dEdge + (flip ? 200 : -200)), "asphalt");
  for (let k = 0; k < plan.sectors.length; k++) { const row = DS(k); for (let i = 0; i + 1 < row.length; i++) link(row[i], row[i + 1]); if (k + 1 < plan.sectors.length) { const nx = DS(k + 1), seen = new Set(); for (const d of row) { const t = nx.reduce((b, q) => (Math.abs(q.x - d.x) < Math.abs(b.x - d.x) ? q : b)); seen.add(t); link(d, t); } for (const q of nx) if (!seen.has(q)) link(row.reduce((b, d) => (Math.abs(q.x - d.x) < Math.abs(b.x - d.x) ? d : b)), q); } }

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
    occ.push(rect(-HL - .6, -HW - .6, HL + .6, HW + .6)); for (const sd of [-1, 1]) keep.push(rect(sd * dl - 3, sd * HW, sd * dl + 3, sd * (HW + 6)), rect(sd * HL, -3, sd * (HL + 6), 3)); }

  /* ---------- a district ---------- */
  for (const d of plan.districts) { const kit = d.kit, r = d.r, hs = kit.sw / 2, W = (u, v) => (d.ax ? [d.x + v, d.z + u] : [d.x + u, d.z + v]), rect = (u0, v0, u1, v1) => { const a = W(u0, v0), b = W(u1, v1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
    const rotOf = (fu, fv) => (d.ax ? Math.atan2(fv, fu) : Math.atan2(fu, fv)), turned = (alongU) => (alongU ? d.ax : 1 - d.ax);   // is a thing laid along this street turned a quarter turn on the map
    const pt = (k, q, extra) => plan.paint.push({ x0: q[0], z0: q[1], x1: q[2], z1: q[3], k, ...extra });
    pt(kit.ground, [d.x - r - 3, d.z - r - 3, d.x + r + 3, d.z + r + 3]);
    const main = rect(-r - 3, -hs, r + 3, hs), cross = rect(-hs + .5, -r - 3, hs - .5, r + 3), sq = d.roof ? rect(-13, -10, 13, 10) : rect(-10, -10, 10, 10);
    pt(kit.street, main, { ax: d.ax, c: d.ax ? d.x : d.z, hw: hs }); pt(kit.street === "runway" ? "asphalt" : kit.street, cross, { ax: 1 - d.ax, c: d.ax ? d.z : d.x, hw: hs - .5 }); pt(d.roof ? "apron" : kit.walk === "dirt" ? "dirt" : "pave", sq, {});
    const mine = [main, cross, sq]; keep.push(...mine);
    if (d.roof) hall(d, W, rect);
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
  if (FLAT) { const LANE = 7.5, tones = SHIP ? ["#5f676d", "#4a5258", "#6c747a", "#565e64"] : ["#8a5a44", "#7d858a", "#9a8f80", "#6f6a62", "#76634c", "#5f676d"], near = (x, z, r) => plan.roads.some((rd) => { const t = clamp(((x - rd.ax) * (rd.bx - rd.ax) + (z - rd.az) * (rd.bz - rd.az)) / (rd.len * rd.len), 0, 1); return Math.hypot(x - lerp(rd.ax, rd.bx, t), z - lerp(rd.az, rd.bz, t)) < r; });
    const tower = (x, z, w, d, h, col) => { if (Math.abs(x) + w / 2 > 112 || z + d / 2 > 100 || z - d / 2 < -142 || !fits(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 1.2) || near(x, z, LANE + Math.max(w, d) / 2 - .5)) return false; occ.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]); S(x, z, w, h, d, col); D(x, z, w + .3, .35, d + .3, "#3c4046", h);
      if (!SHIP) for (let y = 3; y < h - 1; y += 3) { D(x, z, w + .06, .9, d * .7, "#2a3038", y); D(x, z, w * .7, .9, d + .06, "#2a3038", y); } else { G(x, z, w + .08, .12, d + .08, h * .55); } return true; };
    // blocks down both sides of every lane
    for (const rd of plan.roads) { const ux = (rd.bx - rd.ax) / rd.len, uz = (rd.bz - rd.az) / rd.len, alongZ = Math.abs(uz) > Math.abs(ux); for (const sd of [-1, 1]) { let t = 6; while (t < rd.len - 6) { const len = R.pick([9, 12, 15]), dep = R.pick([6, 8, 10]), h = SHIP ? R.pick([6, 8, 9]) : R.pick([8, 10, 12, 14]), off = LANE + dep / 2 + .4, cx = rd.ax + ux * (t + len / 2) - uz * off * sd, cz = rd.az + uz * (t + len / 2) + ux * off * sd;
          tower(cx, cz, alongZ ? dep : len, alongZ ? len : dep, h, R.pick(tones)); t += len + R.pick([3.5, 4, 5]); } } }
    // blockhouses to go into: tried at spots beside the lanes between one sector and the next
    const want = size === "s" ? 4 : size === "m" ? 6 : 8; let made = 0; for (let i = 0; i < 300 && made < want; i++) { const x = R.range(-96, 96), z = R.range(-128, 88), turn = R.chance(.5), hw = turn ? 9 : 12, hd = turn ? 12 : 9; if (!fits(x - hw - 4, z - hd - 4, x + hw + 4, z + hd + 4, 0) || near(x, z, LANE + Math.max(hw, hd)) || !near(x, z, 34)) continue;
      hall({ last: false, kn: SHIP ? "works" : R.pick(["town", "works", "farm"]) }, null, (u0, v0, u1, v1) => (turn ? [x + Math.min(v0, v1), z + Math.min(u0, u1), x + Math.max(v0, v1), z + Math.max(u0, u1)] : [x + Math.min(u0, u1), z + Math.min(v0, v1), x + Math.max(u0, u1), z + Math.max(v0, v1)])); plan.yards.push([x, z, 13]); made++; }
    plan.blockhouses = made;
    if (SHIP) { const HX = 120, Z0 = -186, Z1 = 150, HH = 14, hull = "#4a5258";
      for (let z = Z0; z < Z1; z += 28) for (const sd of [-1, 1]) { S(sd * HX, z + 14, 3, HH, 28, hull); G(sd * (HX - 1.6), z + 14, .12, .25, 22, 4); }   // the hull, down both sides
      for (let x = -HX; x < HX; x += 30) { S(x + 15, Z0, 30, HH, 3, hull); S(x + 15, Z1, 30, HH, 3, hull); }
      for (let k = 0; k + 1 < plan.sectors.length; k++) { const z = Math.round((plan.sectors[k].z + plan.sectors[k + 1].z) / 2); for (let x = -HX + 2; x < HX - 2; x += 6) { const cx = x + 3; if (near(cx, z, 9) || Math.abs(Math.abs(cx) - 60) < 8 || !fits(cx - 3, z - 1, cx + 3, z + 1, .5)) continue; S(cx, z, 6, HH, 1.6, "#565e64"); occ.push([cx - 3, z - .8, cx + 3, z + .8]); } }   // bulkheads between the sectors, open where a lane runs through and at two more doorways
      for (let x = -HX; x < HX; x += 40) for (let z = Z0; z < Z1; z += 42) { S(x + 20, z + 21, 40, .6, 42, "#3c4046", { roof: true, stripe: false, base: "#3c4046", cap: "#3c4046" }, HH); G(x + 20, z + 21, .5, .14, 30, HH - .2); }   // the deck overhead, lit down its length
      plan.paint.unshift({ x0: -HX, z0: Z0, x1: HX, z1: Z1, k: "apron" }); } }
  /* ---------- out in the hills: small places with their own reason to be there ---------- */
  const OUT = { camp: 12, farmstead: 14, fuelstop: 13, relay: 11, checkpoint: 14, crash: 19, tankfarm: 13 }, kinds = Object.keys(OUT); plan.outposts = []; for (let i = kinds.length - 1; i > 0; i--) { const j = R.int(0, i); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  for (let i = 0; i < 400 && !SHIP && plan.outposts.length < (size === "s" ? 5 : 4); i++) { const kind = kinds[plan.outposts.length % kinds.length], hr = OUT[kind], x = R.range(-138, 138), z = R.range(-140, 96);
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
  plan.name = THEMES[theme] + " " + (kp[1] || "");
  return plan;
}
