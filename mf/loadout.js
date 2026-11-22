/* ---------- Titan chassis and hardpoints ----------
   Hayden's Titan Role and Loadout spec. A Titan is one of three chassis, and each chassis sets the hull, the dashes, the
   speed and a passive trait. On top of that a player fills four hardpoints from that chassis' own pool: a primary weapon,
   ordnance on Q, a defensive or utility kit on E and a core on X. One universal chassis kit goes on any of them.
   The faction still decides the body you see (the Directorate walks Kestrels, Centurions and Bastions, the Coalition
   Jackals, Nomads and Furnaces); what is bolted onto that body is the loadout. Numbers are on the outline's scale, where a
   bar of hull is 2,500. */

export const CHASSIS = {
  light: { name: "Recon / Interceptor", short: "Recon", hull: 7500, dash: 3, dashCd: 4.5, speed: 8.5, trait: "optics",
    traitName: "Predator Optics", traitDesc: "Pilots and troops moving within 25 metres of you are marked for you, and you hear a pilot climb onto your hull a second sooner.",
    role: "Hunts flanking pilots, picks off drop beacons and breaks into the enemy's snipers and artillery at the back." },
  medium: { name: "Vanguard / Line-Breaker", short: "Vanguard", hull: 10000, dash: 2, dashCd: 6, speed: 6.5, trait: "uplink",
    traitName: "Combined-Arms Uplink", traitDesc: "Your side's troops within 20 metres of you shoot 15 percent truer and take points a quarter faster.",
    role: "Walks in with the troops, contests open points and changes its answer mid-fight between armour and infantry." },
  heavy: { name: "Siege / Anchor", short: "Siege", hull: 12500, dash: 1, dashCd: 8, speed: 4.8, trait: "bulkhead",
    traitName: "Reactive Bulkhead", traitDesc: "Blasts that hit you from the front do a quarter less, and nothing knocks you back while you are dug in.",
    role: "Shuts down narrow lanes with fire and suppression, breaks walls and turrets, and holds the final sector." } };

// Slot 1: primary weapons. mag is the rounds in a load; alt says the right mouse button does something with this gun.
export const PRIM = {
  rail: { cls: "light", name: "Plasma Rail-Carbine", mag: 6, desc: "Hold the trigger to charge and let go to fire. 450 at a tap, 1,400 after a full second. Pierces thin cover and punishes pilots in the air." },
  flak: { cls: "light", name: "Leadwall Flak-Scattergun", mag: 5, desc: "Nine heavy pellets, up to 900 close in and little past 40 metres. Shreds pilots, drones and a mech's back." },
  arcrep: { cls: "light", name: "Rapid Arc-Repeater", mag: 40, desc: "A fast electric gun, 85 a round. It does half again as much to shields and stuns the turrets it hits." },
  auto: { cls: "medium", name: "M-44 30mm Autocannon", mag: 24, desc: "A steady automatic, 220 a round from a load of 24, accurate enough for pilots in the air and a mech's weak spots." },
  tracker: { cls: "medium", name: "40mm Tracker Cannon", mag: 12, desc: "Explosive rounds, 320 each. Every hit on a mech puts a lock on it, and at three locks your salvo pods and Salvo Core home in on it." },
  splitter: { cls: "medium", name: "Splitter Energy Rifle", mag: 30, alt: true, desc: "Full-auto energy fire at 200 a shot. Hold the right mouse button to split each shot into three beams across, for sweeping pilots off a wall." },
  slag: { cls: "heavy", name: "T-203 Thermite Slag Launcher", mag: 4, desc: "Lobs slag that does 1,100 where it lands and leaves a fire that burns 1,200 more over three seconds." },
  vulcan: { cls: "heavy", name: "Rotary Vulcan", mag: 120, alt: true, desc: "Spins up the longer you hold it, 140 a round from a belt of 120. The right mouse button switches the barrels between close spread and long precision." },
  howitzer: { cls: "heavy", name: "Heavy Concussion Howitzer", mag: 3, desc: "A slow demolition cannon, 900 a shell with a heavy shove. Turrets, barriers and placed guns take 1.75 times as much." } };

// Slot 2: ordnance on Q
export const ORDQ = {
  cluster: { cls: "light", name: "Cluster Micro-Missiles", cd: 12, desc: "A pod that bursts where it lands and throws six smaller charges around it. Good for flushing pilots out of rooms." },
  arcwave: { cls: "light", name: "Arc Shockwave", cd: 10, desc: "A wave along the ground in front of you. It takes every shield it touches and slows the turning of the mechs it hits for 2.5 seconds." },
  tether: { cls: "light", name: "Tether Snare Trap", cd: 14, desc: "An anchor mine. The first enemy mech within 6 metres is held nearly still for 4 seconds." },
  salvo: { cls: "medium", name: "Tracking Salvo Pods", cd: 12, desc: "Eight guided rockets, 1,600 in all, that arc over low cover. With three Tracker locks on a mech they go to it wherever you aim." },
  laser: { cls: "medium", name: "Shoulder Laser Beam", cd: 12, desc: "An instant beam, 1,400 to a mech, and enough to put down a pilot or a trooper it passes through." },
  siphon: { cls: "medium", name: "Energy Siphon Claw", cd: 16, desc: "A tether that pulls up to 1,500 shield off an enemy mech and onto yours." },
  gas: { cls: "heavy", name: "Flammable Gas Canisters", cd: 12, charges: 2, desc: "Sets down a canister, two at a time. Slag or fire turns it into a wide fire pool." },
  power: { cls: "heavy", name: "Power Shot Blast", cd: 10, desc: "Close in, a shrapnel blast in front of you for 1,200 that throws mechs and pilots back. Past 25 metres, a piercing slug for 1,500." },
  smokeb: { cls: "heavy", name: "Smoke and Sensor-Blind Barrage", cd: 16, desc: "Six canisters of thick smoke down the lane you are looking at. Turrets inside are blind for 10 seconds." } };

// Slot 3: defensive and utility kits on E
export const DEFE = {
  phase: { cls: "light", name: "Phase Shift", cd: 8, desc: "A 15 metre blink forward, straight through mechs, mines and strikes." },
  vtol: { cls: "light", name: "VTOL Jump-Thrusters", cd: 14, desc: "Three seconds in the air on thrusters, high enough to fire over a two-storey building." },
  buckler: { cls: "light", name: "Directional Aegis Buckler", cd: 12, desc: "A forearm shield that comes up fast and soaks 1,500 for 2.5 seconds." },
  vortex: { cls: "medium", name: "Vortex Catch-Shield", cd: 18, desc: "For 6 seconds you take a quarter of what is shot at you, and a ward goes up in front of you." },
  pwall: { cls: "medium", name: "Deployable Particle Wall", cd: 18, desc: "Drops a wide energy wall 8 metres in front of you for 6 seconds. Your troops and pilots behind it take half." },
  sonar: { cls: "medium", name: "Sonar Pulse and Rearm Uplink", cd: 18, desc: "A pulse that shows hidden pilots, troops and mines within 40 metres, and makes your dashes and ordnance ready again." },
  furnace: { cls: "heavy", name: "Thermal Furnace Shield", cd: 16, desc: "A white-hot gauntlet shield that soaks 3,000 for 5 seconds and scorches enemy mechs within 4 metres, 400 a second." },
  gunshield: { cls: "heavy", name: "Barrel-Mounted Gun-Shield", cd: 16, desc: "A 3,500 shield on the gun for 6 seconds. You walk slower behind it." },
  anchor: { cls: "heavy", name: "Hydraulic Anchor Mode", cd: 18, desc: "Locks your legs for 5 seconds: no knockback, a quarter less damage, and the Vulcan spins up twice as fast. You cannot move." } };

// Slot 4: cores on X. Each is the ultimate of one of the chassis' two signature builds.
export const CORES = {
  overclock: { cls: "light", name: "Overclock Core", build: "Ghost Assassin", desc: "For 8 seconds your dashes are back at once and come back twice as fast, and your melee does 1,400 a swing." },
  orbital: { cls: "light", name: "Flight and Orbital Lock Core", build: "Overwatch Sniper", desc: "Lifts you into a hover and paints up to three targets in view for strikes from orbit, 3,500 each." },
  upgrade: { cls: "medium", name: "Upgrade and Aegis Core", build: "Frontline Escort", desc: "A full 2,500 shield, a ward 15 metres across for your troops for 8 seconds, and a plate of armour that stays: each use takes 6 percent off what you take, up to three." },
  salvocore: { cls: "medium", name: "Salvo Core", build: "Mid-Range Artillery Lock", desc: "A steady barrage of 22 guided missiles, 5,500 in all, wherever you aim, or onto a mech with three Tracker locks." },
  meltdown: { cls: "heavy", name: "Flame and Meltdown Core", build: "Area-Denial Pyromancer", desc: "A wave of molten thermite around you: 4,500 to mechs close by and five seconds of burning ground." },
  smart: { cls: "heavy", name: "Smart Suppression Core", build: "Immovable Bastion", desc: "For 8 seconds your primary needs no ammo and steers itself onto the nearest pilot, trooper or mech in front of you." } };

// The universal chassis kit: one per Titan, any chassis
export const UKITS = {
  turbo: { name: "Turbo Engine", desc: "One more dash charge." },
  overcore: { name: "Overcore", desc: "Your Titan lands with a fifth of its core already charged, and a battery put in adds another tenth." },
  smoke: { name: "Counter-Ready Smoke", desc: "Two charges of electric smoke instead of one, and the cloud is wider and shocks enemy troops inside it." },
  eject: { name: "Auto-Eject", desc: "The moment your Titan is doomed you are thrown high and clear, unseen for 2.5 seconds." },
  coax: { name: "Sensor-Linked Coax", desc: "A small gun on the shoulder that shoots enemy troops and drones within 30 metres on its own." } };

// The two signature builds of each chassis, as one-click presets in the garage
export const BUILDS = {
  light: [{ name: "Ghost Assassin", prim: "flak", q: "arcwave", e: "phase", x: "overclock", kit: "turbo" }, { name: "Overwatch Sniper", prim: "rail", q: "tether", e: "vtol", x: "orbital", kit: "coax" }],
  medium: [{ name: "Frontline Escort", prim: "auto", q: "siphon", e: "pwall", x: "upgrade", kit: "overcore" }, { name: "Mid-Range Artillery Lock", prim: "tracker", q: "salvo", e: "sonar", x: "salvocore", kit: "coax" }],
  heavy: [{ name: "Area-Denial Pyromancer", prim: "slag", q: "gas", e: "furnace", x: "meltdown", kit: "turbo" }, { name: "Immovable Bastion", prim: "vulcan", q: "power", e: "gunshield", x: "smart", kit: "smoke" }] };

// what the machine's Titans of each chassis do with themselves (engagement ranges in metres)
export const AIROLE = {
  light: { min: 6, opt: 20, max: 60, pilots: .9, flank: 1, anchor: 0 },
  medium: { min: 8, opt: 32, max: 70, pilots: .5, flank: .5, anchor: 0, escort: 1 },
  heavy: { min: 10, opt: 35, max: 75, pilots: .35, flank: .2, anchor: 1 } };

const SLOTS = { prim: PRIM, q: ORDQ, e: DEFE, x: CORES };
export const slotPool = (slot, cls) => Object.keys(SLOTS[slot]).filter((k) => SLOTS[slot][k].cls === cls);

// a loadout that is whole and legal for its chassis; anything missing or from another chassis falls back to the first build
export function fixLoadout(cls, lo) { cls = CHASSIS[cls] ? cls : "medium"; const b = BUILDS[cls][0], o = { ...b, ...(lo || {}) }; delete o.name;
  for (const s of ["prim", "q", "e", "x"]) if (!SLOTS[s][o[s]] || SLOTS[s][o[s]].cls !== cls) o[s] = b[s]; if (!UKITS[o.kit]) o.kit = b.kit; return o; }

export const buildOf = (cls, lo) => { const b = BUILDS[cls].find((q) => q.prim === lo.prim && q.q === lo.q && q.e === lo.e && q.x === lo.x); return b ? b.name : "Custom"; };

// the loadout as the spec's JSON schema, for sharing and for builders
const ID = { light: "RECON_INTERCEPTOR", medium: "VANGUARD_LINEBREAKER", heavy: "SIEGE_ANCHOR" }, TR = { optics: "PREDATOR_OPTICS", uplink: "COMBINED_ARMS_UPLINK", bulkhead: "REACTIVE_BULKHEAD" };
const up = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
export function loadoutSchema(cls, lo, name = "") { const c = CHASSIS[cls], a = AIROLE[cls];
  return { titanLoadoutSchema: { loadoutId: "titan_" + cls + "_" + up(name || buildOf(cls, lo)).toLowerCase(), chassisClass: ID[cls],
    frameStats: { maxHullHp: c.hull, segmentHp: 2500, doomedHp: 2500, dashCharges: c.dash, dashRechargeSec: c.dashCd, sprintSpeedMps: c.speed, passiveTrait: TR[c.trait] },
    hardpoints: { primaryWeapon: "WPN_" + up(PRIM[lo.prim].name), ordnanceSlotQ: "ORD_" + up(ORDQ[lo.q].name), defensiveSlotE: "DEF_" + up(DEFE[lo.e].name), coreUltimateX: "CORE_" + up(CORES[lo.x].name), universalKit: "KIT_" + up(UKITS[lo.kit].name) },
    aiBehaviorProfile: { engagementRangeMeters: { min: a.min, optimal: a.opt, max: a.max }, pilotPriority: a.pilots } } }; }

// read a shared loadout back: the schema above, or our own short form
export function readLoadout(text) { let j; try { j = JSON.parse(text); } catch (e) { return null; } if (j && j.cls && j.lo) return { cls: CHASSIS[j.cls] ? j.cls : "medium", lo: fixLoadout(j.cls, j.lo) };
  const s = j && j.titanLoadoutSchema; if (!s) return null; const cls = Object.keys(ID).find((k) => ID[k] === s.chassisClass) || "medium", h = s.hardpoints || {}, find = (T, pre, v) => Object.keys(T).find((k) => pre + up(T[k].name) === v);
  return { cls, lo: fixLoadout(cls, { prim: find(PRIM, "WPN_", h.primaryWeapon), q: find(ORDQ, "ORD_", h.ordnanceSlotQ), e: find(DEFE, "DEF_", h.defensiveSlotE), x: find(CORES, "CORE_", h.coreUltimateX), kit: find(UKITS, "KIT_", h.universalKit) }) }; }
