/* Afterburn: what the pilot sees of themself: two arms, two gloved hands, and whatever they are holding.
   Everything here lives in the small scene drawn over the world (the camera is at the origin, looking down -z).
   The weapon hangs on a rig that is pushed about by springs: recoil throws it back and up and it snaps home, it trails
   the view a little when you turn, it dips when you land and drops to a carry when you sprint. The right hand stays on
   the grip. The left hand rides the foregrip until a move needs it:
   - a reload: the rifle rolls over, the hand strips the magazine, goes down for a fresh one, seats it with a slap and
     racks the handle;
   - a swap: the weapon drops away and the other is brought up and settles;
   - a grenade: the hand goes to the belt, comes up, cocks back and throws;
   - the knife: the rifle is swung out of the way and the left hand cuts across.
   Each move is a set of key poses on a clock from 0 to 1, eased so that the fast parts are fast and the stops are hard.
   game.js owns the rules (ammunition, timers, what gets hit); this file only shows them. */
import { THREE, gunScene, gunMat, clamp, lerp, rnd } from "./engine.js";
import { loadModel, cloneSkinned } from "./puppet.js";
import { build, box as B, drum as C, loft as Lf, ball as Bl } from "./parts.js";

const S = { gun: "#3d444a", gun2: "#4b5258", dark: "#1c1d1f", mag: "#2e3236", suit: "#6f745c", wrap: "#8c917a", shell: "#d6cfb8", accent: "#c45a1e", steel: "#9aa0a4", grit: .75, gritScale: 26 };
const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(.35, 1.25, 1.5) }), hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .8, .4) });
const root = new THREE.Group(); gunScene.add(root);
const rig = new THREE.Group(); root.add(rig);
const X = Math.PI / 2;

/* ---------- the weapons, built along -z from the grip ---------- */
function charger(mat = gunMat) { const g = new THREE.Group(); build(g, [B(.06, .09, .34, 0, .022, -.1, "gun"), Lf([[.1, .075, .085], [.4, .06, .07]], 0, .025, 0, "gun2", 8, .5, -X), C(.016, .3, 0, .03, -.55, "dark", "z", 8), ...[0, 1, 2, 3].map((i) => B(.085, .085, .012, 0, .03, -.3 - i * .045, "dark")),
    C(.03, .08, 0, .03, -.7, "gun", "z", 10), B(.036, .095, .046, 0, -.058, .032, "dark", -.3), B(.044, .075, .2, 0, .004, .2, "gun2"), B(.048, .095, .03, 0, 0, .31, "dark"), B(.03, .03, .06, 0, .1, -.04, "dark"), ...DOT(-.04, .04), B(.045, .1, .07, 0, -.05, -.1, "accent")], S, glow, mat);
  const coil = new THREE.Mesh(new THREE.BoxGeometry(.045, .045, .11), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 2.4, 3) })); coil.position.set(0, .03, -.62); g.add(coil);
  g.userData = { coil, sightY: .148, fore: new THREE.Vector3(0, -.01, -.3), well: new THREE.Vector3(0, -.09, -.1), top: new THREE.Vector3(.035, .05, .06), muzzle: new THREE.Vector3(0, .03, -.75) }; return g; }
/* Every weapon is its own build, so each one reads at a glance: the rifle's long handguard, the SMG's wire stock and
   stick magazine, the shotgun's wooden pump, the launcher's drum. A gun is a body, a magazine (the piece that comes out
   or is fed on a reload) and a bolt (the piece that runs on each shot: a bolt, a slide, a pump), and it carries the
   marks the hands and the moves work from. The magazine that drops and the one in your hand are the gun's own. */
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]), WOOD = "#6b4a2c", TAN = "#94835f", OLIVE = "#56613f", BRASS = "#b38a3c", BLUE = "#33566f", RED = "#9a3226";
// grips rake back: a negative tilt about x swings the bottom of the grip toward the stock (+z), as on a real gun
const GRIP = () => B(.036, .095, .046, 0, -.058, .032, "dark", -.3), TRIG = () => B(.012, .012, .07, 0, -.022, -.01, "dark");
const DOT = (z = -.06, y = 0) => [B(.042, .008, .052, 0, .088 + y, z, "dark"), B(.005, .04, .03, -.02, .108 + y, z, "dark"), B(.005, .04, .03, .02, .108 + y, z, "dark"), B(.044, .005, .03, 0, .129 + y, z, "dark"), B(.0055, .0055, .002, 0, .108 + y, z, "glow")];
const SCOPE = (len, r, z) => [C(r, len, 0, .118, z, "dark", "z", 10), C(r + .007, .04, 0, .118, z - len / 2, "gun", "z", 10), C(r + .004, .03, 0, .118, z + len / 2, "gun", "z", 10), B(.02, .03, .03, 0, .092, z - .05, "dark"), B(.02, .03, .03, 0, .092, z + .05, "dark")];
function mk(mat, body, o) { const g = new THREE.Group(); build(g, body, S, glow, mat);
  const d = { sightY: o.sightY || .108, fore: V(o.fore), well: V(o.well || [0, -.09, -.07]), top: V(o.top || [.035, .05, .06]), muzzle: V(o.muzzle), magLen: o.magLen || 0 }; if (o.grip) d.grip = V(o.grip);
  if (o.mag) { const at = o.magAt || [0, -.075], mag = new THREE.Group(); mag.position.set(at[0], -.018, at[1]); mag.rotation.x = o.magTilt ?? -.12; g.add(mag); build(mag, o.mag, S, glow, mat); d.mag = mag;
    const bolt = new THREE.Group(); bolt.position.set(0, 0, .04); g.add(bolt); build(bolt, (o.bolt || [B(.03, .014, .03, .03, .05, .04, "steel")]).map((p) => ({ ...p, z: p.z - .04 })), S, glow, mat); d.bolt = bolt;
    if (o.drops) d.loose = () => { const m = new THREE.Group(); build(m, o.mag, S, glow, mat); return m; }; }
  if (o.coil) { const c = new THREE.Mesh(new THREE.BoxGeometry(o.coil[3], o.coil[3], o.coil[4] || o.coil[3]), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 2.4, 3) })); c.position.set(o.coil[0], o.coil[1], o.coil[2]); g.add(c); d.coil = c; }
  g.userData = d; return g; }
const TUBE = { shotgun: 1, grenadier: 1, maglauncher: 1, revolver: 1 }, PISTOL = { pistol: 1, mpistol: 1 };   // how each kind reloads: fed from below, a magazine up the grip, or a magazine rolled in
const MAKE = {
  // Assault Rifle: a long ribbed handguard with an orange stripe, a curved magazine, a solid stock
  carbine: (m) => mk(m, [B(.05, .078, .3, 0, .022, -.08, "gun"), B(.036, .014, .28, 0, .066, -.1, "dark"), B(.058, .062, .24, 0, .024, -.35, "gun2"), B(.06, .012, .2, 0, -.002, -.35, "accent"), ...[0, 1, 2, 3].map((i) => B(.06, .03, .014, 0, .04, -.27 - i * .05, "dark")),
    C(.012, .2, 0, .028, -.57, "dark", "z", 8), C(.019, .05, 0, .028, -.66, "gun", "z", 8), B(.012, .034, .012, 0, .075, -.45, "dark"), GRIP(), TRIG(), B(.042, .07, .2, 0, .004, .2, "gun2"), B(.046, .09, .03, 0, 0, .31, "dark"), B(.03, .02, .06, 0, .083, -.06, "dark"), ...DOT()],
    { fore: [0, -.01, -.34], muzzle: [0, .028, -.69], magLen: .12, drops: true, mag: [B(.03, .07, .052, 0, -.035, 0, "mag"), B(.03, .065, .052, 0, -.092, -.012, "mag", -.22), B(.034, .014, .056, 0, -.124, -.02, "dark", -.22), B(.032, .01, .054, 0, -.03, 0, "steel")] }),
  // SMG: short and square, a wire stock, a fat shroud, a long stick magazine and a grip under the barrel
  smg: (m) => mk(m, [B(.052, .072, .2, 0, .022, -.05, TAN), B(.036, .012, .2, 0, .064, -.05, "dark"), C(.03, .15, 0, .028, -.225, "gun", "z", 8), ...[0, 1, 2].map((i) => C(.033, .012, 0, .028, -.18 - i * .04, "dark", "z", 8)), C(.016, .03, 0, .028, -.315, "dark", "z", 8),
    B(.008, .008, .2, -.022, .045, .17, "steel"), B(.008, .008, .2, .022, .045, .17, "steel"), B(.052, .075, .012, 0, .02, .275, "dark"), B(.03, .085, .034, 0, -.052, -.17, "dark", -.1), B(.02, .02, .03, .04, .05, -.1, "steel"), GRIP(), TRIG(), ...DOT(-.04)],
    { fore: [0, -.05, -.17], muzzle: [0, .028, -.33], magLen: .17, drops: true, magTilt: 0, magAt: [0, -.07], mag: [B(.026, .17, .04, 0, -.085, 0, "mag"), B(.03, .014, .044, 0, -.168, 0, "accent"), B(.028, .01, .042, 0, -.03, 0, "steel")] }),
  // Shotgun: a barrel over a tube, a wooden stock and a wooden pump that runs on every shot, shells in a rack on the side
  shotgun: (m) => mk(m, [B(.054, .08, .24, 0, .022, -.04, "gun"), C(.02, .44, 0, .046, -.38, "dark", "z", 8), C(.017, .36, 0, .004, -.34, "gun2", "z", 8), B(.05, .074, .02, 0, .025, -.53, "steel"), B(.01, .008, .42, 0, .07, -.36, "dark"), B(.007, .009, .007, 0, .082, -.58, "glow"), B(.04, .006, .012, 0, .066, .06, "dark"), B(.006, .03, .012, -.017, .082, .06, "dark"), B(.006, .03, .012, .017, .082, .06, "dark"), B(.04, .006, .012, 0, .098, .06, "dark"),
    B(.044, .078, .24, 0, -.008, .21, WOOD, -.08), B(.048, .1, .03, 0, -.02, .33, "dark"), B(.036, .095, .046, 0, -.058, .032, WOOD, -.3), TRIG(), B(.012, .05, .13, -.033, .03, -.04, "dark"), ...[0, 1, 2, 3].map((i) => C(.009, .046, -.043, .03, -.085 + i * .03, RED, "y", 6))],
    { sightY: .082, fore: [0, -.02, -.33], muzzle: [0, .046, -.6], magLen: .035, magTilt: 0, magAt: [0, -.06], mag: [B(.03, .01, .07, 0, -.004, 0, "steel")], bolt: [B(.052, .05, .14, 0, .002, -.33, WOOD), ...[0, 1, 2].map((i) => B(.056, .052, .012, 0, .002, -.29 - i * .04, "dark"))] }),
  // Marksman Rifle: a slim long barrel, a scope, a stock with a hole for the thumb, a folded bipod
  longrifle: (m) => mk(m, [B(.046, .07, .3, 0, .022, -.08, "gun"), B(.044, .05, .24, 0, .024, -.34, OLIVE), C(.011, .42, 0, .028, -.62, "dark", "z", 8), B(.03, .03, .05, 0, .028, -.84, "dark"), ...SCOPE(.19, .021, -.04),
    B(.04, .03, .24, 0, .03, .2, OLIVE), B(.036, .03, .17, 0, -.055, .2, OLIVE, -.3), B(.046, .11, .03, 0, -.01, .32, "dark"), B(.042, .02, .1, 0, .056, .18, "dark"), B(.008, .008, .17, -.018, -.012, -.4, "steel"), B(.008, .008, .17, .018, -.012, -.4, "steel"), GRIP(), TRIG()],
    { sightY: .152, fore: [0, -.01, -.3], muzzle: [0, .028, -.87], magLen: .09, drops: true, mag: [B(.032, .09, .06, 0, -.045, 0, "mag"), B(.036, .012, .064, 0, -.09, 0, "dark")] }),
  // Grenadier: a six-chamber drum ahead of the grip, a short fat barrel, a grip under it and a frame stock
  grenadier: (m) => mk(m, [B(.05, .07, .14, 0, .02, .01, "gun"), B(.02, .014, .2, 0, .094, -.1, "gun"), C(.031, .2, 0, .034, -.31, "dark", "z", 8), C(.036, .03, 0, .034, -.4, "gun2", "z", 8), B(.032, .085, .036, 0, -.05, -.28, "dark", -.1), B(.03, .02, .1, 0, -.004, -.27, "gun2"),
    B(.02, .02, .2, 0, .034, .19, "gun2"), B(.02, .02, .18, 0, -.03, .19, "gun2", -.32), B(.046, .11, .026, 0, 0, .3, "dark"), GRIP(), TRIG(), ...DOT(-.04, .014)],
    { sightY: .122, fore: [0, -.05, -.28], muzzle: [0, .034, -.42], magLen: .16, magTilt: 0, magAt: [0, -.13], mag: [C(.057, .11, 0, .052, 0, OLIVE, "z", 6), C(.06, .016, 0, .052, .03, "accent", "z", 6), ...[0, 1, 2, 3, 4, 5].map((i) => C(.013, .006, Math.cos(i * 1.047) * .034, .052 + Math.sin(i * 1.047) * .034, -.056, "dark", "z", 6))] }),
  // Heavy Sniper: a thick barrel with a big brake, a large scope, an orange cheek rest and a bolt handle out the side
  sniper: (m) => mk(m, [B(.06, .09, .34, 0, .024, -.08, "gun"), C(.018, .56, 0, .03, -.53, "dark", "z", 8), C(.027, .2, 0, .03, -.36, "gun2", "z", 8), B(.072, .04, .07, 0, .03, -.83, "dark"), B(.076, .012, .014, 0, .03, -.815, "steel"), B(.076, .012, .014, 0, .03, -.845, "steel"), ...SCOPE(.26, .028, -.05),
    B(.05, .09, .22, 0, 0, .21, "gun2"), B(.044, .03, .12, 0, .06, .18, "accent"), B(.054, .11, .03, 0, 0, .33, "dark"), B(.02, .05, .02, 0, -.065, .27, "dark"), B(.008, .008, .2, -.02, -.02, -.34, "steel"), B(.008, .008, .2, .02, -.02, -.34, "steel"), GRIP(), TRIG()],
    { sightY: .152, fore: [0, -.02, -.3], muzzle: [0, .03, -.88], magLen: .1, drops: true, magTilt: 0, mag: [B(.04, .1, .075, 0, -.05, 0, "mag"), B(.044, .014, .08, 0, -.1, 0, "dark"), B(.042, .01, .03, 0, -.05, 0, "accent")], bolt: [B(.05, .012, .012, .05, .05, .04, "steel"), B(.02, .02, .02, .08, .04, .04, "dark")] }),
  // Sidearm: all slide. The slide runs back on each shot and the magazine comes out of the grip
  pistol: (m) => mk(m, [B(.032, .03, .17, 0, .02, -.05, "gun"), C(.01, .03, 0, .046, -.16, "dark", "z", 8), B(.01, .008, .06, 0, -.02, -.03, "dark"), B(.01, .03, .008, 0, -.006, -.06, "dark"), B(.02, .012, .06, 0, .0, -.1, "dark"), B(.034, .1, .05, 0, -.05, .035, "dark", -.3), B(.038, .06, .03, 0, -.05, .035, TAN, -.3)],
    { sightY: .078, fore: [-.012, -.07, .03], muzzle: [0, .046, -.18], well: [0, -.12, .07], top: [.03, .05, 0], magLen: .1, drops: true, magTilt: -.3, magAt: [0, .03], mag: [B(.026, .1, .034, 0, -.05, 0, "mag"), B(.032, .012, .044, 0, -.1, 0, "steel")],
      bolt: [B(.036, .036, .2, 0, .052, -.05, "gun2"), B(.038, .008, .06, 0, .052, .02, "dark"), B(.005, .012, .005, 0, .078, -.14, "glow"), B(.008, .016, .006, -.012, .078, .04, "dark"), B(.008, .016, .006, .012, .078, .04, "dark"), B(.038, .012, .05, 0, .045, -.1, "accent")] }),
  // Magnetic Grenade Launcher: two fat tubes one over the other, ringed with orange magnets
  maglauncher: (m) => mk(m, [B(.06, .1, .18, 0, .025, -.03, "gun"), C(.028, .3, 0, .056, -.27, "gun2", "z", 8), C(.028, .3, 0, -.004, -.27, "gun2", "z", 8), ...[0, 1, 2].map((i) => B(.07, .104, .016, 0, .026, -.2 - i * .07, "accent")), C(.031, .02, 0, .056, -.42, "dark", "z", 8), C(.031, .02, 0, -.004, -.42, "dark", "z", 8),
    B(.062, .01, .1, 0, .05, -.03, "glow"), B(.04, .06, .12, 0, .005, .14, "gun2"), B(.05, .1, .03, 0, .0, .21, "dark"), GRIP(), TRIG(), ...DOT(-.04, .006)],
    { sightY: .114, fore: [0, -.04, -.26], muzzle: [0, .026, -.44], magLen: .13, magTilt: 0, magAt: [0, -.06], mag: [B(.05, .012, .1, 0, -.02, 0, "steel"), B(.02, .02, .02, 0, -.03, .04, "dark")] }),
  // LMG: a heavy receiver, a box of belt hung under it, a perforated shroud, a carry handle and a bipod folded under the barrel
  lmg: (m) => mk(m, [B(.064, .09, .3, 0, .022, -.06, "gun"), B(.04, .014, .3, 0, .072, -.06, "dark"), C(.034, .26, 0, .03, -.34, OLIVE, "z", 8), ...[0, 1, 2, 3, 4].map((i) => C(.036, .012, 0, .03, -.24 - i * .045, "dark", "z", 8)), C(.014, .14, 0, .03, -.54, "dark", "z", 8), C(.022, .05, 0, .03, -.62, "gun", "z", 8),
    B(.012, .05, .12, 0, .1, -.08, "dark"), B(.012, .012, .12, 0, .125, -.08, "dark"), B(.008, .008, .2, -.02, -.005, -.42, "steel"), B(.008, .008, .2, .02, -.005, -.42, "steel"), B(.04, .08, .2, 0, .006, .2, OLIVE), B(.046, .1, .03, 0, 0, .31, "dark"), B(.044, .018, .14, 0, .002, -.33, "accent"), GRIP(), TRIG(), ...DOT(-.1, .03)],
    { sightY: .138, fore: [0, -.03, -.3], muzzle: [0, .03, -.65], magLen: .14, drops: true, magTilt: 0, magAt: [.01, -.03], mag: [B(.09, .11, .1, .02, -.06, 0, OLIVE), B(.094, .014, .104, .02, -.01, 0, "dark"), B(.02, .03, .03, -.03, -.01, 0, BRASS)], bolt: [B(.012, .02, .04, .04, .05, .02, "steel")] }),
  // Machine Pistol: a stubby block with a long magazine through the grip and a short folded front grip
  mpistol: (m) => mk(m, [B(.038, .05, .17, 0, .022, -.04, TAN), B(.034, .02, .17, 0, .056, -.04, "dark"), C(.012, .04, 0, .03, -.15, "dark", "z", 8), B(.024, .05, .026, 0, -.028, -.1, "dark", -.1), B(.034, .1, .046, 0, -.05, .035, "dark", -.3), B(.004, .008, .004, 0, .07, -.12, "glow"), B(.008, .014, .006, -.012, .072, .03, "dark"), B(.008, .014, .006, .012, .072, .03, "dark")],
    { sightY: .072, fore: [0, -.06, -.1], muzzle: [0, .03, -.17], well: [0, -.12, .07], top: [.03, .05, 0], magLen: .16, drops: true, magTilt: -.3, magAt: [0, .03], mag: [B(.026, .17, .034, 0, -.085, 0, "mag"), B(.032, .014, .044, 0, -.17, 0, "accent")], bolt: [B(.034, .026, .08, 0, .052, .0, "gun2")] }),
  // Revolver: a long barrel with a rib, a six-shot cylinder that swings out to load, a big hammer and a wooden grip
  revolver: (m) => mk(m, [B(.036, .05, .09, 0, .03, -.0, "gun"), C(.014, .2, 0, .045, -.16, "gun2", "z", 8), B(.012, .012, .2, 0, .064, -.16, "dark"), B(.005, .014, .006, 0, .078, -.25, "glow"), B(.012, .018, .02, -.012, .076, .03, "dark"), B(.012, .018, .02, .012, .076, .03, "dark"), B(.012, .03, .03, 0, .06, .05, "steel", -.4), B(.034, .1, .048, 0, -.045, .045, WOOD, -.35), B(.01, .02, .05, 0, -.01, -.01, "dark")],
    { sightY: .078, fore: [-.012, -.07, .03], muzzle: [0, .045, -.27], well: [0, .02, -.04], top: [.03, .05, 0], magLen: .03, magTilt: 0, magAt: [0, -.01], mag: [C(.03, .06, 0, .048, 0, "steel", "z", 6), ...[0, 1, 2, 3, 4, 5].map((i) => C(.007, .004, Math.cos(i * 1.047) * .017, .048 + Math.sin(i * 1.047) * .017, -.031, BRASS, "z", 6))], bolt: [B(.012, .03, .02, 0, .062, .045, "dark")] }),
  charge: (m) => charger(m),
  // Arc Disruptor Cannon: two coiled prongs with the charge held between them, tanks along the top
  arccannon: (m) => mk(m, [B(.07, .09, .3, 0, .025, -.08, "gun"), B(.016, .03, .32, -.04, .03, -.38, "steel"), B(.016, .03, .32, .04, .03, -.38, "steel"), ...[0, 1, 2].flatMap((i) => [-.04, .04].map((x) => C(.024, .03, x, .03, -.3 - i * .07, BRASS, "z", 6))),
    C(.026, .18, -.022, .098, -.06, BLUE, "z", 8), C(.026, .18, .022, .098, -.06, BLUE, "z", 8), B(.01, .01, .2, .04, -.02, -.1, "dark"), B(.072, .012, .2, 0, .0, -.08, "accent"), B(.044, .075, .18, 0, .004, .19, "gun2"), B(.05, .1, .03, 0, 0, .29, "dark"), GRIP(), TRIG(), B(.02, .06, .03, 0, .072, -.14, "dark"), ...DOT(-.14, .04)],
    { sightY: .148, fore: [0, -.03, -.2], muzzle: [0, .03, -.56], coil: [0, .03, -.5, .04] }),
  // Seeker Launcher: a square tube on the shoulder, a sight box on its left with a lamp that comes up as it locks
  seeker: (m) => mk(m, [B(.09, .09, .62, 0, .05, -.15, OLIVE), B(.11, .11, .05, 0, .05, -.47, "dark"), B(.1, .07, .05, 0, .035, .17, "dark"), C(.03, .05, 0, .05, -.51, RED, "z", 8, .006), B(.092, .02, .05, 0, .05, -.3, "accent"), B(.092, .02, .05, 0, .05, 0, "accent"),
    B(.03, .06, .11, -.065, .09, -.1, "gun"), B(.022, .04, .004, -.065, .09, -.157, "glow"), B(.032, .085, .036, 0, -.04, -.26, "dark", -.1), B(.036, .095, .046, 0, -.045, .032, "dark", -.3), TRIG(), B(.03, .03, .05, 0, .11, -.2, "dark"), ...DOT(-.2, .03)],
    { sightY: .138, fore: [0, -.04, -.26], grip: [0, -.05, .04], muzzle: [0, .05, -.54], coil: [-.065, .128, -.1, .014] }) };
/* The assault rifle is a model (models/rifle.glb): one mesh, no moving parts of its own. Its magazine is cut away from the
   rest by where its triangles lie (below the well, between the grip and the front of the well), so it can come out, and
   it is given a top so it looks whole in the hand. The model is 1 unit long with its muzzle toward +z; here it is turned
   to point along -z with the grip at the origin, like the built guns, and carries the same marks they do (where the
   hands go, the muzzle, the sight line), so the reload, the recoil and everything else written for them plays on it. */
const RM = await loadModel("rifle.glb", "mfRifle"), RSC = .9, RMATS = {};
function modelRifle(mat) { if (!RM) return null; let src = null; RM.scene.traverse((o) => { if (o.isMesh) src = o; }); const key = mat === gunMat ? "held" : "prop", tex = RMATS[key] || (RMATS[key] = RM.mk("#ffffff", key, mat === gunMat ? "0.6" : "0.5"));
  const pos = src.geometry.attributes.position, idx = src.geometry.index.array, body = [], mag = [];
  for (let i = 0; i < idx.length; i += 3) { let cy = 0, zl = 9, zh = -9, yh = -9; for (let k = 0; k < 3; k++) { const v = idx[i + k], y = pos.getY(v), z = pos.getZ(v); cy += y / 3; zl = Math.min(zl, z); zh = Math.max(zh, z); yh = Math.max(yh, y); }
    (cy < .128 && zl > -.08 && zh < .035 && yh < .145 ? mag : body).push(idx[i], idx[i + 1], idx[i + 2]); }
  const M = new THREE.Matrix4().makeRotationY(Math.PI).scale(new THREE.Vector3(RSC, RSC, RSC)).setPosition(0, .028 - .31 * RSC, -.12), geo = (ix) => { const g = src.geometry.clone(); g.setIndex(ix); g.applyMatrix4(M); return g; }, bodyG = geo(body), magGeo = geo(mag), part = (g) => { const m = new THREE.Mesh(g, tex); m.frustumCulled = false; return m; };
  const g = new THREE.Group(); g.add(part(bodyG));
  const top = [B(.03, .07, .074, .004, -.125, -.1, "dark", -.44)], magG = new THREE.Group(); magG.position.set(0, -.018, 0); { const m = part(magGeo); m.position.y = .018; magG.add(m); } const cap = new THREE.Group(); cap.position.y = .018; magG.add(cap); build(cap, top, S, glow, mat); g.add(magG);
  const bolt = new THREE.Group(); bolt.position.set(.046, .052, .04); g.add(bolt); build(bolt, [B(.014, .014, .034, 0, 0, 0, "steel")], S, glow, mat);
  // a magazine on its own, centred, for the hand and for the one that falls
  const loose = () => { const o = new THREE.Group(), m = part(magGeo); m.position.set(0, .19, .1); o.add(m); const c = new THREE.Group(); c.position.set(0, .19, .1); o.add(c); build(c, top, S, glow, mat); return o; };
  g.userData = { sightY: .128, mag: magG, bolt, loose, grip: new THREE.Vector3(.004, -.105, .05), fore: new THREE.Vector3(0, -.06, -.27), well: new THREE.Vector3(0, -.19, -.1), top: new THREE.Vector3(.046, .052, .06), muzzle: new THREE.Vector3(0, .028, -.12 - .5 * RSC), magLen: .12 }; return g; }
// the rifle for a figure to carry: built along +z from the butt of its stock, about 0.75 m long
export function carriedRifle(mat) { const r = modelRifle(mat); if (!r) return null; const s = .75 / RSC, o = new THREE.Group(); r.rotation.y = Math.PI; r.scale.setScalar(s); r.position.set(0, -.028 * s, (.5 * RSC - .12) * s); o.add(r); return o; }
// a fresh copy of a gadget the left hand can hold (grenades, kit), for the garage and its pictures
export function heldProp(k) { if (!HELD[k]) return null; const g = new THREE.Group(); build(g, HELD[k], S, glow, gunMat); return g; }
export const gunProp = (kind, mat) => (kind === "carbine" && modelRifle(mat)) || (MAKE[kind] || MAKE.carbine)(mat);   // the same guns as the ones in your hands, for standing about in the garage
const GUNS = {}; for (const k in MAKE) GUNS[k] = (k === "carbine" && modelRifle(gunMat)) || MAKE[k](gunMat);
for (const k in GUNS) { GUNS[k].visible = false; rig.add(GUNS[k]); }

/* ---------- arms: the hand is at the arm's origin and the forearm runs back along +z toward the elbow ---------- */
function arm(sd) { const a = new THREE.Group(); build(a, [Bl(.088, .055, .105, 0, 0, 0, "dark"), B(.06, .012, .05, 0, .03, .0, "shell"),
    Lf([[.03, .086, .074], [.08, .098, .088]], 0, 0, 0, "dark", 10, 0, X), Lf([[.07, .09, .08], [.2, .108, .1], [.5, .125, .118]], 0, 0, 0, "suit", 10, 0, X), Lf([[.11, .108, .1], [.26, .128, .12]], 0, 0, 0, "wrap", 10, 0, X), Lf([[.13, .05, .13, 0, .0], [.24, .06, .15]], sd * .05, 0, 0, "shell", 8, .3, X),
    Lf([[.105, .112, .104], [.118, .112, .104]], 0, 0, 0, "dark", 10, 0, X), Lf([[.25, .132, .124], [.264, .132, .124]], 0, 0, 0, "dark", 10, 0, X)], S, glow, gunMat); 
  /* Blocky fingers that move: four fingers of two blocks each, hinged at the knuckle and the middle joint, and a thumb.
     curl 0 is an open hand and 1 a fist. The first finger (next to the thumb) can squeeze a little more by itself. */
  const fingers = [-.03, -.01, .01, .03].map((x) => { const p = new THREE.Group(), d = new THREE.Group(); p.position.set(x, -.008, -.04); d.position.set(0, 0, -.04); p.add(d); a.add(p); build(p, [B(.0175, .021, .042, 0, 0, -.02, "dark")], S, glow, gunMat); build(d, [B(.0165, .019, .036, 0, 0, -.018, "dark"), B(.0167, .006, .02, 0, .0098, -.02, "wrap")], S, glow, gunMat); return { p, d, first: x * sd > .02 }; });
  const thumb = new THREE.Group(); thumb.position.set(sd * .046, -.006, -.012); a.add(thumb); build(thumb, [B(.022, .024, .056, 0, 0, -.026, "dark")], S, glow, gunMat);
  a.userData.setHand = (curl, trig = 0) => { for (const f of fingers) { const c = clamp(f.first ? curl * .75 + trig : curl, 0, 1.25); f.p.rotation.x = -c * 1.15; f.d.rotation.x = -c * 1.3; } thumb.rotation.set(-curl * .5, sd * (.75 - curl * .35), 0); };
  a.userData.setHand(.9); a.userData.built = a.children.slice(); root.add(a); return a; }
const TUNE = { tiltR: 0, tiltL: 0 }, HAND = { L: .88, R: 1 }; globalThis.__armTune = TUNE;
const armR = arm(1), armL = arm(-1), elbowR = new THREE.Vector3(.36, -.52, .3), elbowL = new THREE.Vector3(-.42, -.6, .22);
/* The arms you see are the pilot model's own (models/pilot.glb): the same suit, bracers and gloves other players see on
   you, with fingers that close. Each built arm above stays as the thing the moves steer (a point at the palm, the forearm
   running back toward the elbow); the model's arm is hung on it so its palm sits on that point and its forearm lies
   along that line, and the built arm's own pieces are hidden. Only the triangles that belong to one arm are kept from the
   model. Fingers are curled bone by bone toward the palm: closed on the grip and the handguard, the first finger
   squeezing on a shot, the left hand opening when it lets go to fetch something and closing again on what it holds. */
const PM = await loadModel("pilot.glb", "mfPilot", "#c08f84"), FING = ["Index", "Middle", "Ring", "Pinky"], ARMS = {};
function modelArm(driver, sideName) { if (!PM) return null; const box = new THREE.Group(), mdl = cloneSkinned(PM.scene); box.scale.setScalar(1.84); box.add(mdl); let skin = null; mdl.traverse((o) => { if (o.isSkinnedMesh) skin = o; });
  // keep only this arm: triangles whose corners all hang mostly on its bones
  const names = skin.skeleton.bones.map((b) => b.name), mine = names.map((n) => n.startsWith("mixamorig" + sideName) && /Arm|Hand/.test(n)), si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight, idx = skin.geometry.index.array, keep = [];
  const own = (v) => { let w = 0; for (let k = 0; k < 4; k++) if (mine[si.getComponent(v, k)]) w += sw.getComponent(v, k); return w > .5; };
  for (let i = 0; i < idx.length; i += 3) if (own(idx[i]) && own(idx[i + 1]) && own(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  const g = skin.geometry.clone(); g.setIndex(keep); skin.geometry = g; skin.material = ARMS.mat || (ARMS.mat = PM.mk("#ffffff", "arm", "0.6")); skin.frustumCulled = false;
  // where the hand is at rest, and which way is which
  box.updateMatrixWorld(true); const bone = (n) => mdl.getObjectByName("mixamorig" + sideName + n), wp = (n) => bone(n).getWorldPosition(new THREE.Vector3());
  const H = wp("Hand"), E = wp("ForeArm"), O = H.clone().lerp(wp("HandMiddle1"), .55), Z0 = E.clone().sub(H).normalize(), palm = wp("HandIndex1").sub(H).cross(wp("HandPinky1").sub(H)).normalize(); if (sideName === "Left") palm.negate();
  const Y0 = palm.clone().negate(); Y0.addScaledVector(Z0, -Y0.dot(Z0)).normalize(); const X0 = Y0.clone().cross(Z0), M0 = new THREE.Matrix4().makeBasis(X0, Y0, Z0).setPosition(O), hold = new THREE.Group(); hold.matrixAutoUpdate = false; hold.matrix.copy(M0).invert(); hold.add(box); driver.add(hold);
  for (const m of driver.userData.built) m.visible = false;
  // each finger bone: how it sits at rest and the line it folds about
  const fold = (n) => { const b = bone(n), nx = b.children[0]; if (!b || !nx) return null; const f = nx.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize(), ax = f.cross(palm).normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()); return { b, q0: b.quaternion.clone(), ax }; };
  const fingers = FING.map((f) => [1, 2, 3].map((i) => fold("Hand" + f + i)).filter(Boolean)), thumb = [1, 2, 3].map((i) => fold("HandThumb" + i)).filter(Boolean), q = new THREE.Quaternion(), wrist = { b: bone("Hand"), q0: bone("Hand").quaternion.clone(), ax: X0.clone().applyQuaternion(bone("Hand").getWorldQuaternion(new THREE.Quaternion()).invert()) };
  const bend = (j, a) => j.b.quaternion.copy(j.q0).multiply(q.setFromAxisAngle(j.ax, a));
  // curl: how closed the hand is (0 open, 1 a fist). trig: the first finger's own squeeze. tilt: the wrist bent toward the palm
  return { hold, curl: 0, set(curl, trig = 0, tilt = 0) { fingers.forEach((F, i) => { const c = i === 0 ? curl * .7 + trig : curl; F.forEach((j, k) => bend(j, c * [1.15, 1.35, .9][k])); }); thumb.forEach((j, k) => bend(j, curl * [.35, .5, .5][k])); bend(wrist, tilt); } }; }
ARMS.R = modelArm(armR, "Right"); ARMS.L = modelArm(armL, "Left");
// what the left hand can be holding
const held = { mag: new THREE.Group(), knife: new THREE.Group() }, HELD = { frag: [Bl(.058, .07, .058, 0, -.01, -.06, OLIVE), B(.062, .01, .062, 0, -.01, -.06, "dark"), C(.014, .03, 0, .03, -.06, "steel", "y", 6), B(.012, .05, .03, .03, .0, -.06, "steel")],
  arc: [C(.028, .08, 0, -.01, -.06, BLUE, "y", 8), C(.031, .012, 0, .0, -.06, "glow", "y", 8), C(.031, .012, 0, -.03, -.06, "glow", "y", 8), C(.02, .02, 0, .04, -.06, "steel", "y", 6)],
  therm: [B(.1, .012, .026, 0, -.01, -.06, "steel", 0, 0, .0), B(.026, .012, .1, 0, -.01, -.06, "steel"), B(.075, .012, .022, 0, -.01, -.06, "steel", 0, 0, .785), B(.075, .012, .022, 0, -.01, -.06, "steel", 0, 0, -.785), C(.022, .02, 0, -.01, -.06, RED, "y", 6), C(.012, .024, 0, -.01, -.06, "accent", "y", 6)],
  satchel: [B(.1, .07, .05, 0, -.02, -.07, TAN), B(.104, .012, .054, 0, -.0, -.07, "dark"), B(.02, .1, .056, -.03, -.02, -.07, "dark"), B(.03, .02, .01, .02, -.02, -.098, "steel"), B(.01, .01, .004, .02, -.02, -.105, "glow")],
  grapple: [B(.05, .04, .09, 0, -.01, -.06, "gun"), C(.02, .04, 0, -.01, -.12, "steel", "z", 6), B(.05, .008, .03, 0, -.01, -.15, "steel", 0, 0, .0), B(.008, .05, .03, 0, -.01, -.15, "steel"), B(.052, .008, .04, 0, .012, -.05, "glow")],
  stim: [C(.014, .11, 0, -.01, -.07, "steel", "z", 8), C(.017, .04, 0, -.01, -.06, "glow", "z", 8), C(.004, .04, 0, -.01, -.145, "steel", "z", 4), B(.03, .012, .012, 0, -.01, .0, "accent")],
  sonar: [C(.05, .012, 0, -.01, -.07, "gun", "y", 8), C(.036, .016, 0, -.01, -.07, "glow", "y", 8), C(.008, .05, 0, .02, -.07, "steel", "y", 4)],
  phase: [B(.06, .02, .08, 0, .02, .04, "gun"), B(.04, .008, .05, 0, .034, .04, "glow"), B(.064, .024, .012, 0, .02, .0, "accent")],
  shield: [C(.05, .03, 0, -.01, -.07, "gun", "y", 10), C(.042, .012, 0, .008, -.07, "glow", "y", 10), C(.012, .03, 0, .028, -.07, "steel", "y", 6), B(.07, .012, .02, 0, -.02, -.07, "accent")],
  decoy: [C(.04, .02, 0, -.01, -.07, "gun2", "y", 6), C(.03, .008, 0, .004, -.07, "glow", "y", 6), B(.006, .05, .006, 0, .03, -.07, "glow")] };
for (const k in HELD) { held[k] = new THREE.Group(); build(held[k], HELD[k], S, glow, gunMat); }
build(held.mag, [B(.03, .12, .052, 0, -.02, -.05, "mag", .5)], S, glow, gunMat);
build(held.knife, [B(.022, .03, .1, 0, -.02, -.04, "dark"), B(.05, .012, .012, 0, -.02, -.095, "steel"), B(.008, .044, .24, 0, -.02, -.22, "shell"), B(.008, .026, .07, 0, -.029, -.36, "shell", .25)], S, glow, gunMat);
for (const k in held) { held[k].visible = false; armL.add(held[k]); }
for (const k in GUNS) { const D = GUNS[k].userData; if (D.loose) { D.handMag = D.loose(); D.handMag.position.set(0, -.02, -.05); D.handMag.rotation.x = .5; D.handMag.visible = false; armL.add(D.handMag); } }   // a model's own magazine in the hand
const drops = [];   // magazines on their way to the floor

/* ---------- easing and key poses ---------- */
const out = (u) => 1 - Math.pow(1 - u, 3), back = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }, inn = (u) => u * u * u;
// keys: [time, value, ease into this key]. Returns the value at u.
function key(u, keys) { if (u <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) { const a = keys[i - 1], b = keys[i], k = (u - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * (b[2] || out)(clamp(k, 0, 1)); } return keys[keys.length - 1][1]; }
const key3 = (u, keys, o) => { for (let j = 0; j < 3; j++) o[j] = key(u, keys.map((q) => [q[0], q[1][j], q[2]])); return o; };
const spring = (s, k, c, dt) => { s.v += (-k * s.x - c * s.v) * dt; s.x += s.v * dt; };
const rec = { z: { x: 0, v: 0 }, p: { x: 0, v: 0 }, y: { x: 0, v: 0 }, r: { x: 0, v: 0 }, up: { x: 0, v: 0 } }, sway = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }, land = { x: 0, v: 0 }, jolt = { x: 0, v: 0 };
let cycle = 0, carry = 0, lastYaw = 0, lastPitch = 0, wasAir = false, shown = "", bobT = 0;
const gp = [0, 0, 0], gr = [0, 0, 0], lh = [0, 0, 0], lw = [0, 0, 0], tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
export const VM = { cam: { pitch: 0, roll: 0 }, muzzle: new THREE.Vector3(),
  // a shot: k is how hard it kicks
  kick(k) { rec.z.v += 2.6 * k; rec.p.v += 3.4 * k; rec.up.v += .9 * k; rec.y.v += (rnd() - .5) * 2.4 * k; rec.r.v += (rnd() - .5) * 3 * k; VM.cam.pitch += .006 * k; cycle = 1; const G = GUNS[shown], D = G && G.userData; if (D && D.mag && root.visible) { const m = new THREE.Group(); build(m, [B(.007, .007, .02, 0, 0, 0, "accent")], S, glow, gunMat); m.position.copy(D.top).applyMatrix4(rig.matrix); m.quaternion.copy(rig.quaternion); root.add(m); drops.push({ m, v: new THREE.Vector3(.5 + rnd() * .3, .45 + rnd() * .3, .1 + rnd() * .2), s: new THREE.Vector3(10 + rnd() * 20, 0, 10 + rnd() * 20), t: .25 }); } },   // the bolt cycles and a case is thrown out to the right
  // a hard stop somewhere in a move (a magazine seated, a handle let go): the whole rig jumps
  bump(k) { jolt.v += k; },
  /* st: { kind, visible, charge, reload (0..1 or -1), swap (0..1 or -1), swapFrom, nade (0..1 or -1), melee (0..1 or -1), speed, grounded, vy, sliding, mantle, roll, dip, yaw, pitch, firing } */
  step(dt, st) { root.visible = st.visible; if (!st.visible) return;
    let kind = st.kind; if (st.swap >= 0 && st.swap < .42) kind = st.swapFrom; if (kind !== shown) { for (const k in GUNS) GUNS[k].visible = k === kind; shown = kind; } const G = GUNS[kind], D = G.userData;
    // springs: recoil, the lag behind the view, landing
    spring(rec.z, 320, 26, dt); spring(rec.p, 300, 24, dt); spring(rec.up, 340, 28, dt); spring(rec.y, 240, 20, dt); spring(rec.r, 240, 20, dt); spring(jolt, 520, 30, dt);
    let dy = st.yaw - lastYaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; const dp = st.pitch - lastPitch; lastYaw = st.yaw; lastPitch = st.pitch;
    sway.x.v += clamp(dy, -.3, .3) * 55; sway.y.v += clamp(dp, -.3, .3) * 55; spring(sway.x, 150, 19, dt); spring(sway.y, 150, 19, dt);
    if (wasAir && st.grounded) land.v -= clamp(-st.vy0 * .22, 0, 3.2); wasAir = !st.grounded; spring(land, 190, 17, dt); if (!st.grounded) land.x += clamp(-st.vy * .0016, -.02, .02) * dt * 30;
    VM.cam.pitch += (0 - VM.cam.pitch) * (1 - Math.exp(-dt * 14)); VM.cam.roll += (rec.r.x * .1 - VM.cam.roll) * (1 - Math.exp(-dt * 12));
    const busy = st.reload >= 0 || st.swap >= 0 || st.nade >= 0 || st.melee >= 0 || st.kit >= 0, run = st.grounded && !st.sliding ? clamp(st.speed / 9, 0, 1) : 0;
    carry += ((st.speed > 7.2 && st.grounded && !st.sliding && !st.firing && !busy ? 1 : 0) - carry) * (1 - Math.exp(-dt * 9)); bobT += dt * (5 + st.speed * .9) * (run > 0 ? 1 : 0);
    // the move being played, if any, as offsets to the rifle and a place for the left hand
    gp[0] = gp[1] = gp[2] = gr[0] = gr[1] = gr[2] = lh[0] = lh[1] = lh[2] = 0; let free = 0, item = null, magOff = 0, magShow = true, boltZ = 0;
    /* Each kind of gun reloads its own way. A rifle rolls over and has its magazine swapped (the long form below).
       A tube gun (shotgun, grenadier, magnetic launcher) is tipped muzzle up and fed from below, one push after another,
       then pumped. A pistol barely turns: the magazine drops, the new one goes up the grip, the slide runs. */
    const style = TUBE[kind] ? "tube" : PISTOL[kind] ? "pistol" : "mag";
    if (st.reload >= 0 && D.mag && style === "tube") { const u = st.reload, feed = u > .16 && u < .78 ? (u - .16) / .62 : -1, n = D.magLen > .1 ? 4 : 3, f = feed < 0 ? 0 : Math.sin(feed * n * Math.PI);
      gr[0] = key(u, [[0, 0], [.12, .5], [.8, .5], [1, 0, back]]); gr[2] = key(u, [[0, 0], [.12, .28], [.8, .28], [1, 0]]); gp[1] = key(u, [[0, 0], [.12, .04], [.8, .04], [1, 0]]) + Math.max(0, f) * .012;
      lh[1] = feed < 0 ? 0 : -.2 + Math.abs(f) * .16; lh[2] = feed < 0 ? 0 : .14; boltZ = key(u, [[0, 0], [.84, 0], [.9, .05, inn], [.95, 0, inn], [1, 0]]); if (u > .82 && u < .96) lh[2] = key(u, [[.82, 0], [.9, .07, inn], [.96, 0, inn]]); }
    else if (st.reload >= 0 && D.mag && style === "pistol") { const u = st.reload; gr[2] = key(u, [[0, 0], [.15, .3], [.7, .3], [1, 0, back]]); gr[0] = key(u, [[0, 0], [.15, .18], [.7, .14], [1, 0]]); gp[1] = key(u, [[0, 0], [.15, .02], [.7, .02], [1, 0]]);
      key3(u, [[0, [0, 0, 0]], [.15, [0, -.3, .16]], [.45, [0, -.3, .16]], [.6, [0, -.06, .1], inn], [.7, [0, -.06, .1]], [.82, [.02, .05, .12]], [.9, [.02, .05, .16], inn], [1, [0, 0, 0]]], lh);
      magOff = key(u, [[0, 0], [.12, 0], [.22, -.3, inn], [.45, -.3], [.6, 0, inn], [1, 0]]); magShow = u < .22 || u > .45; boltZ = key(u, [[0, 0], [.82, 0], [.9, .04, inn], [.94, 0, inn], [1, 0]]); }
    else if (st.reload >= 0 && D.mag) { const u = st.reload; gr[2] = key(u, [[0, 0], [.1, .62], [.62, .62], [.68, .5], [.86, .5], [1, 0, back]]); gr[1] = key(u, [[0, 0], [.1, -.28], [.86, -.24], [1, 0, back]]); gr[0] = key(u, [[0, 0], [.1, .12], [.86, .1], [1, 0]]); gp[1] = key(u, [[0, 0], [.1, .03], [.86, .025], [1, 0]]); gp[0] = key(u, [[0, 0], [.1, -.045], [.86, -.04], [1, 0]]);
      key3(u, [[0, [0, 0, 0]], [.1, [0, 0, 0]], [.2, [0, -.075, .1]], [.27, [0, -.26, .14], inn], [.34, [0, -.5, .2]], [.5, [0, -.5, .2]], [.6, [0, -.2, .12]], [.655, [0, -.075, .1], inn], [.7, [0, -.075, .1]], [.79, [.035, .06, .2]], [.845, [.035, .06, .26], inn], [.88, [.035, .06, .2]], [1, [0, 0, 0]]], lh);
      magOff = key(u, [[0, 0], [.2, 0], [.27, -.19, inn], [.34, -.5], [.5, -.5], [.6, -.13], [.655, 0, inn], [1, 0]]); magShow = u < .3 || u > .5; boltZ = key(u, [[0, 0], [.79, 0], [.845, .045, inn], [.87, 0, inn], [1, 0]]); }
    else if (st.swap >= 0) { const u = st.swap; gp[1] = key(u, [[0, 0], [.4, -.42, inn], [.42, -.42], [1, 0, back]]); gr[0] = key(u, [[0, 0], [.4, -.9, inn], [.42, .7], [1, 0, back]]); gr[2] = key(u, [[0, 0], [.4, .35], [.42, -.3], [1, 0, back]]); gp[0] = key(u, [[0, 0], [.4, .05], [1, 0]]); }
    else if (st.nade >= 0) { const u = st.nade; free = key(u, [[0, 0], [.1, 1], [.78, 1], [1, 0]]); item = u > .16 && u < .5 ? "nade" : null; key3(u, [[0, [-.2, -.3, -.3]], [.16, [-.3, -.55, -.2]], [.34, [-.34, .0, -.12], back], [.42, [-.38, .06, -.02]], [.52, [-.04, .06, -.8], inn], [.68, [-.1, -.25, -.6]], [1, [-.2, -.3, -.3]]], lw);
      gp[0] = key(u, [[0, 0], [.2, .035], [.6, .03], [1, 0]]); gr[2] = key(u, [[0, 0], [.2, -.2], [.44, -.28], [.56, -.05, inn], [1, 0, back]]); gr[1] = key(u, [[0, 0], [.2, -.12], [.6, -.1], [1, 0]]); gr[0] = key(u, [[0, 0], [.42, .08], [.54, -.12, inn], [1, 0, back]]); }
    else if (st.kit >= 0) { const u = st.kit, jab = st.kitKind === "stim";   // the kit: the left hand comes up with the thing, uses it with a short hard push, and goes back
      free = key(u, [[0, 0], [.14, 1], [.8, 1], [1, 0]]); item = u > .08 && u < .86 ? "kit" : null; key3(u, jab ? [[0, [-.2, -.3, -.3]], [.2, [-.2, -.05, -.42], back], [.4, [-.2, -.02, -.42]], [.5, [.02, -.14, -.4], inn], [.7, [.02, -.14, -.4]], [1, [-.2, -.3, -.3]]] : [[0, [-.2, -.3, -.3]], [.22, [-.16, -.1, -.46], back], [.42, [-.16, -.08, -.44]], [.52, [-.12, -.06, -.62], inn], [.72, [-.14, -.1, -.5]], [1, [-.2, -.3, -.3]]], lw);
      gp[0] = key(u, [[0, 0], [.2, .04], [.75, .035], [1, 0]]); gr[1] = key(u, [[0, 0], [.2, -.16], [.75, -.14], [1, 0, back]]); gr[2] = key(u, [[0, 0], [.2, -.14], [.5, -.2], [1, 0, back]]); }
    else if (st.melee >= 0) { const u = st.melee; free = key(u, [[0, 0], [.08, 1], [.75, 1], [1, 0]]); item = u > .06 && u < .8 ? "knife" : null; key3(u, [[0, [-.3, -.4, -.3]], [.2, [-.42, -.02, -.3], back], [.42, [.12, -.1, -.62], inn], [.6, [.26, -.26, -.5]], [1, [-.2, -.3, -.3]]], lw);
      gp[0] = key(u, [[0, 0], [.18, .13], [.6, .12], [1, 0, back]]); gr[1] = key(u, [[0, 0], [.18, -.55], [.6, -.5], [1, 0, back]]); gr[2] = key(u, [[0, 0], [.18, -.2], [1, 0]]); gp[2] = key(u, [[0, 0], [.2, .05], [.42, -.03, inn], [1, 0]]); }
    // where the rifle is
    const bx = Math.cos(bobT) * .011 * run, by = Math.abs(Math.sin(bobT)) * .013 * run, ch = st.charge || 0;
    const A = st.ads || 0, sy = D.sightY || .1;
    rig.position.set((.155 + bx + st.roll * .22 - carry * .04) * (1 - A) + gp[0] + sway.x.x * .012 * (1 - A * .7) + (ch ? (rnd() - .5) * .004 * ch : 0), A * (-sy + .165 - by) + -.165 + by - st.dip * .3 - (st.sliding ? .03 : 0) + gp[1] - carry * .05 + land.x + rec.up.x * .012 - sway.y.x * .01 + jolt.x * .012, -.4 + A * .12 + rec.z.x * .06 * (1 - A * .4) + gp[2] + carry * .02);
    e.set(rec.p.x * .09 * (1 - A * .5) + gr[0] + (st.mantle ? .6 : 0) + carry * .22 - sway.y.x * .05 - land.x * 1.2 + jolt.x * .05, .03 * (1 - A) + gr[1] + rec.y.x * .03 + carry * .55 + sway.x.x * .06, st.roll * .6 + (st.sliding ? -.2 : 0) + gr[2] + rec.r.x * .05 + carry * .25 + sway.x.x * .05, "YXZ"); rig.quaternion.setFromEuler(e);
    cycle = Math.max(0, cycle - dt * 16); if (D.mag) { D.mag.position.y = -.018 + magOff; D.mag.visible = magShow; D.bolt.position.z = .04 + boltZ + Math.sin(cycle * Math.PI) * .04; } if (D.coil) { D.coil.scale.setScalar(.6 + ch * 1.6); D.coil.material.color.setRGB(.5 + ch * 2, 2.4 + ch * 3, 3 + ch * 4); }
    rig.updateMatrix(); VM.muzzle.copy(D.muzzle).applyMatrix4(rig.matrix);
    // the right hand on the grip; the left on the foregrip, or wherever the move has sent it
    (D.grip ? tmp.copy(D.grip) : tmp.set(0, -.062, .04)).applyMatrix4(rig.matrix); armR.position.copy(tmp); armR.lookAt(elbowR); armR.rotateZ(-1.25);
    tmp.copy(D.fore); tmp.x += lh[0]; tmp.y += lh[1]; tmp.z += lh[2]; tmp.applyMatrix4(rig.matrix); if (free > 0) { tmp2.set(lw[0], lw[1], lw[2]); tmp.lerp(tmp2, free); }
    armL.position.copy(tmp); armL.lookAt(elbowL); armL.rotateZ(lerp(1.35, .5, free));
    { // the hands: closed on the grip and the handguard, the trigger finger squeezing on a shot, the left hand opening as it lets go, reaching with the fingers wide, and closing on what it takes
      const k = 1 - Math.exp(-dt * 22), holding = !!item || (st.reload >= .5 && st.reload < .655), u = st.reload, grab = u >= .2 && u < .34, reach = (u >= .34 && u < .5) || (u >= .7 && u < .79), rack = u >= .79 && u < .88, away = free > .3 && !item;
      HAND.L += ((holding || grab || rack ? 1 : reach || away ? .12 : .88) - HAND.L) * k; HAND.R += ((st.swap >= 0 && st.swap < .42 ? .5 : 1) - HAND.R) * k; const trig = Math.sin(cycle * Math.PI) * .4 + (st.firing ? .14 : 0);
      if (ARMS.R) { ARMS.R.set(HAND.R, trig, TUNE.tiltR); ARMS.L.set(HAND.L, HAND.L * .3, TUNE.tiltL); } else { armR.userData.setHand(HAND.R, trig); armL.userData.setHand(HAND.L); } }
    { const inHand = st.reload >= .5 && st.reload < .655 && !!D.mag && !TUBE[kind] && !PISTOL[kind]; held.mag.visible = inHand && !D.handMag; for (const k in GUNS) { const hm = GUNS[k].userData.handMag; if (hm) hm.visible = inHand && GUNS[k] === G; } } for (const k in HELD) held[k].visible = (item === "nade" && k === (HELD[st.ord] ? st.ord : "frag")) || (item === "kit" && k === st.kitKind); held.knife.visible = item === "knife";
    if (st.reload >= 0 && D.mag && st.reload >= (PISTOL[kind] ? .22 : .27) && !VM._dropped && !TUBE[kind]) { VM._dropped = true; const m = D.loose ? D.loose() : new THREE.Group(); if (!D.loose) build(m, [B(.03, .12, .052, 0, 0, 0, "mag")], S, glow, gunMat); m.position.copy(D.well).applyMatrix4(rig.matrix); m.quaternion.copy(rig.quaternion); root.add(m); drops.push({ m, v: new THREE.Vector3(-.15, -.2, .1), s: new THREE.Vector3(rnd() * 6, rnd() * 6, rnd() * 6), t: 0 }); }
    if (st.reload < 0) VM._dropped = false;
    for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; d.v.y -= 4.5 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.s.x * dt; d.m.rotation.z += d.s.z * dt; if (d.t > .7) { root.remove(d.m); drops.splice(i, 1); } }
  } };
