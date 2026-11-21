/* Afterburn: the Titan, an original humanoid walker about six metres tall.
   A skeleton of joints (hips, two legs of thigh, shin and foot, a torso that turns at the waist, two arms of upper arm
   and forearm, hands) carrying limbs that swell and taper like a body's, rounded armour, joints, pistons and stowage,
   built from the pieces in mf/parts.js. It carries a 40 mm rifle in
   both hands the way a rifleman does, and a blade on its back for close work. The chest is a hollow shell with a hatch
   hinged at its top, so a pilot can really go in through the front. A rocket pod sits on the left shoulder.
   It is posed every frame from a few numbers: how fast it walks, how far it
   kneels, how far the hatch is open, where it aims, recoil, a punch. Built in metres, facing -z, drawn at U. */
import { THREE, U, clamp, lerp, charMat, grad } from "./engine.js";
import { loadModel, puppet as wear } from "./puppet.js";
import { MECH_BLOCKS } from "./mechblocks.js";
import { build, box as B, hull as H, drum as C, loft as Lf, ball as Bl } from "./parts.js";

const SCHEMES = {
  you: { frame: "#34373a", plate: "#b9b3a4", plate2: "#8f8a80", accent: "#c45a1e", dark: "#1e2022", glow: [.5, 2.6, 3.2], steel: "#a3a8ab", canvas: "#7a6a4c", cream: "#e2dac4" },
  foe: { frame: "#1e2022", plate: "#4a4e52", plate2: "#36393c", accent: "#b0312a", dark: "#141516", glow: [3.4, .5, .3], steel: "#7c8084", canvas: "#4a4336", cream: "#b9b3a4" },
};
/* The walker's body is Hayden's mech model rebuilt from blocks (mf/mechblocks.js, made by blocks.py): the model was cut into
   its rigid pieces (hips, chest, thighs, shins, feet, upper arms, forearms with hands) and each piece redrawn from 17 cm
   blocks in the model's own colours. The pieces hang on this skeleton's joints, so it keeps every pose it had, and the
   skeleton takes its measurements (leg and arm lengths, hip and shoulder widths, ankle height) from the model. The arms are
   drawn a fifth longer than the model's so both hands reach round the rifle. The plates this file builds are kept only
   as a fallback and are hidden. */
const MB = MECH_BLOCKS.medium, MD = MB.dims;   // the medium body; makeRig takes its own measurements from the body for the frame it is building
const L1 = MD.L1, L2 = MD.L2, ANK = MD.ANK, HIP_Y = MD.ANK + MD.L1 + MD.L2 - .1, HIP_X = MD.HIP_X, KNEEL = 1.25, SH_X = MD.SH_X, SH_Y = MD.SH_Y, A1 = MD.A1, A2 = MD.A2;
// The mech's body is a rigged model (models/mech.glb) worn over this walker: see mf/puppet.js. The walker is the fallback.
const MODEL = await loadModel("mech.glb", "mfMech");
/* The mech's rifle is a model too (models/titan-rifle.glb). It is one solid mesh lying corner to corner in its file, so it
   is turned here to point along -z from the butt of its stock, and its drum is cut away by where it sits (under the
   receiver, ahead of the grip) so it can come off in a reload. About 3.1 m long. */
const TRIFLE = await loadModel("titan-rifle.glb", "mfTRifle"), TS = 2.4, R2 = Math.SQRT1_2;
// the same rifle as the pilot sees it from the cockpit: marked as something held, so it is drawn over the world
export function cockpitRifle() { if (!TRIFLE) return null; return modelGun("you", TRIFLE.held || (TRIFLE.held = TRIFLE.mk("#ffffff", "held", "0.6"))); }
function modelGun(team, mat0) { let src = null; TRIFLE.scene.traverse((o) => { if (o.isMesh) src = o; }); const pos = src.geometry.attributes.position, idx = src.geometry.index.array, body = [], drum = [];
  for (let i = 0; i < idx.length; i += 3) { let ul = 9, uh = -9, zm = 0, zh = -9; for (let k = 0; k < 3; k++) { const v = idx[i + k], u = (pos.getX(v) + pos.getY(v)) * R2, z = pos.getZ(v); ul = Math.min(ul, u); uh = Math.max(uh, u); zm += z / 3; zh = Math.max(zh, z); }
    (ul > -.335 && uh < -.03 && zm < -.065 && zh < -.035 ? drum : body).push(idx[i], idx[i + 1], idx[i + 2]); }
  const M = new THREE.Matrix4().set(TS * R2, -TS * R2, 0, 0, 0, 0, TS, -.03 * TS, -TS * R2, -TS * R2, 0, -.68 * TS, 0, 0, 0, 1), mat = mat0 || TRIFLE.mats[team] || TRIFLE.mats.you;
  const part = (ix) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", pos.clone()); g.setAttribute("normal", src.geometry.attributes.normal.clone()); g.setAttribute("uv", src.geometry.attributes.uv.clone()); g.setIndex(ix); g.applyMatrix4(M); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.frustumCulled = false; return m; };
  const g = new THREE.Group(), mag = new THREE.Group(), dm = part(drum); g.add(part(body)); mag.add(dm); g.add(mag);
  const at = (u, z) => new THREE.Vector3(0, (z - .03) * TS, -(u + .68) * TS);
  return { g, mag, drum: dm, grip: at(-.4, -.1), fore: at(.05, -.1), well: at(-.18, -.15), muzzle: at(.675, .03) }; }
const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

export function makeRig(team, o = {}) {
  const MB = MECH_BLOCKS[o.cls] || MECH_BLOCKS.medium, MD = MB.dims, L1 = MD.L1, L2 = MD.L2, ANK = MD.ANK, HIP_Y = MD.ANK + MD.L1 + MD.L2 - .1, HIP_X = MD.HIP_X, SH_X = MD.SH_X, SH_Y = MD.SH_Y, A1 = MD.A1, A2 = MD.A2;   // each frame has its own body, cut from its own model
  const S = { ...(SCHEMES[team] || SCHEMES.you), grit: .85, gritScale: 1.9, ...o }, Sm = { ...S, mud: .75 }, glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...S.glow) }), hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, .7) });
  const size = 1, bulk = 1, gsc = o.cls === "light" ? .84 : o.cls === "heavy" ? 1.08 : 1; const root = new THREE.Group(); root.scale.setScalar(U * size);   // a light is smaller and leaner, a heavy bigger and broader
  // hips: a pelvis girdle with ball joints, a plate in front, guards at the sides, a bedroll slung behind
  const hips = joint(root, 0, HIP_Y, 0);
  build(hips, [Lf([[-.46, .6, .66], [-.12, 1.36, 1.0], [.26, 1.2, .92]], 0, 0, 0, "frame", 10, .45), C(.5, .3, 0, .36, 0, "dark", "y", 12),
    ...[-1, 1].flatMap((sd) => [Bl(.64, .64, .66, sd * HIP_X, 0, 0, "dark"), Bl(.34, .86, .9, sd * (HIP_X + .34), -.08, 0, "plate2"), B(.1, .1, .5, sd * (HIP_X + .5), -.3, 0, "accent")]),
    Lf([[-.52, .26, .14], [-.14, .56, .22], [.16, .5, .2]], 0, 0, -.5, "plate", 8, .3), B(.24, .07, .05, -.085, -.16, -.63, "accent", 0, .55), B(.24, .07, .05, .085, -.16, -.63, "accent", 0, -.55),
    C(.2, 1.0, 0, 0, .68, "canvas", "x", 10), B(.07, .44, .44, -.28, 0, .68, "dark"), B(.07, .44, .44, .28, 0, .68, "dark"), C(.3, .09, 1.06, .05, .3, "steel", "x", 12), C(.17, .1, 1.07, .05, .3, "dark", "x", 12), ...[-.4, .4].map((x) => C(.04, .05, x, .12, -.52, "steel", "z", 6))], S, glowMat);
  // legs: a thigh that swells and tapers, a knee cap, a calf with its bulge behind, a foot with a toe cap and a heel
  const legs = [-1, 1].map((sd) => {
    const thigh = joint(hips, sd * HIP_X, 0, 0), shin = joint(thigh, 0, -L1, 0), foot = joint(shin, 0, -L2, 0);
    build(thigh, [Lf([[-1.3, .44, .5], [-.92, .6, .68, 0, .03], [-.4, .76, .84, 0, .02], [.06, .62, .7]], 0, 0, 0, "frame"),
      Lf([[-1.08, .46, .2, 0, -.3], [-.62, .64, .28, 0, -.38], [-.14, .6, .26, 0, -.36]], 0, 0, 0, "plate", 8, .35), Lf([[-1.0, .2, .5], [-.55, .26, .66], [-.12, .24, .6]], sd * .38, 0, 0, "plate2", 8, .35), B(.4, .08, .04, 0, -.3, -.52, "accent"),
      B(.18, .44, .4, sd * .5, -.62, .1, "canvas"), B(.2, .06, .43, sd * .5, -.62, .1, "dark"), C(.09, .8, 0, -.5, .42, "dark", "y", 8), C(.05, .6, 0, -1.0, .42, "steel", "y", 8), Lf([[-.9, .5, .16, 0, -.42], [-.55, .56, .18, 0, -.47], [-.3, .5, .16, 0, -.44]], 0, 0, 0, "plate2", 8, .4), ...[-.2, .2].flatMap((x) => [C(.035, .05, x, -.38, -.56, "steel", "z", 6), C(.035, .05, x, -.84, -.52, "steel", "z", 6)]), C(.04, .9, -sd * .24, -.6, .32, "dark", "y", 6, .04, [0, sd * .08])], S, glowMat);
    build(shin, [Bl(.58, .58, .62, 0, 0, -.02, "dark"), Bl(.5, .6, .36, 0, .02, -.3, "plate2"), Lf([[-1.35, .34, .4], [-1.02, .44, .52, 0, .05], [-.5, .6, .74, 0, .12], [-.08, .5, .56]], 0, 0, 0, "frame"),
      Lf([[-1.27, .38, .2, 0, -.2], [-.72, .52, .28, 0, -.3], [-.22, .44, .24, 0, -.3]], 0, 0, 0, "plate", 8, .35), B(.3, .08, .04, 0, -.4, -.44, "accent"), C(.06, .9, sd * .22, -.66, .3, "dark", "y", 8), C(.035, .5, sd * .22, -1.08, .3, "steel", "y", 8), Lf([[-1.1, .3, .46, sd * .26], [-.6, .34, .56, sd * .3], [-.3, .3, .5, sd * .28]], 0, 0, 0, "plate2", 8, .4), ...[-.14, .14].map((x) => C(.03, .05, x, -.5, -.44, "steel", "z", 6)), B(.3, .05, .05, 0, -.78, -.4, "dark"), B(.3, .05, .05, 0, -.98, -.36, "dark")], Sm, glowMat);
    build(foot, [Bl(.5, .5, .52, 0, 0, 0, "dark"), B(.74, .2, 1.3, 0, -.17, -.2, "frame"), Bl(.84, .42, 1.0, 0, -.06, -.55, "plate"), Bl(.64, .44, .6, 0, -.06, .42, "plate2"), Bl(.5, .34, .5, 0, .14, -.22, "plate2", { half: true }), ...[-.24, 0, .24].map((x) => B(.16, .12, .2, x, -.2, -1.02, "dark"))], { ...S, mud: 1 }, glowMat);
    return { thigh, shin, foot, sd };
  });
  // the torso turns at the waist; its chest is a shell with a hole in the front that the hatch covers
  const torso = joint(hips, 0, .35, 0);
  build(torso, [Lf([[0, .95, .86], [.28, .78, .7], [.56, 1.3, 1.1]], 0, 0, 0, "dark", 10, .3), C(.44, .07, 0, .2, 0, "steel", "y", 12), C(.42, .07, 0, .34, 0, "steel", "y", 12),
    [2.3, 1.7, .16, 0, 1.35, .87, "plate2"], [.16, 1.7, 1.9, -1.07, 1.35, 0, "plate2"], [.16, 1.7, 1.9, 1.07, 1.35, 0, "plate2"], [2.3, .16, 1.9, 0, .58, 0, "frame"], [2.3, .16, 1.9, 0, 2.12, 0, "plate"],
    [.5, 1.7, .16, -.9, 1.35, -.87, "plate"], [.5, 1.7, .16, .9, 1.35, -.87, "plate"], [1.3, .44, .16, 0, .72, -.87, "plate"],
    // rounded armour laid over the shell, all of it outside the cabin: a domed roof, swelling flanks, breast plates either side of the hatch, a lip under it
    Bl(2.36, .9, 2.0, 0, 2.18, 0, "plate", { half: true }), Bl(1.5, .5, .56, 0, .74, -1.06, "plate2"),
    ...[-1, 1].flatMap((sd) => [Bl(.56, 1.5, 1.8, sd * 1.3, 1.34, 0, "plate"), Bl(.66, 1.32, .5, sd * .9, 1.46, -1.1, "plate"), B(.34, .1, .06, sd * .9, 1.04, -1.33, "accent"), C(.03, 1.0, sd * 1.56, 1.9, .1, "dark", "z", 6),
      Bl(1.1, 1.0, 1.24, sd * 1.56, 1.9, 0, sd > 0 ? "accent" : "plate"), Lf([[-.5, .2, .9], [0, .3, 1.16], [.36, .26, 1.0]], sd * 2.02, 1.5, 0, "plate2", 8, .3)]),
    ...[-1, 1].flatMap((sd) => [B(.07, .56, .8, sd * 1.6, 1.0, .25, "plate2"), ...[[.84, .56], [.84, -.06], [1.2, .56], [1.2, -.06]].map(([y, z]) => C(.035, .05, sd * 1.64, y, z, "steel", "x", 6)), C(.05, 1.1, sd * .84, 2.42, .72, "dark", "z", 6, .05, [-.35, 0]), B(.05, .7, .05, sd * .62, 3.0, -.16, "dark")]),
    ...[-.54, -.18, .18, .54].map((x, i) => Bl(.36, .22, .3, x, 1.0 + (i % 2) * .02, -1.34, "canvas")), B(1.3, .05, .05, 0, 3.34, -.16, "dark"), B(1.3, .05, .05, 0, 3.34, -.56, "dark"), B(.05, .05, .44, -.62, 3.34, -.36, "dark"), B(.05, .05, .44, .62, 3.34, -.36, "dark"),
    C(.17, .22, 1.2, 2.72, -.62, "dark", "z", 10), [.22, .22, .04, 1.2, 2.72, -.74, "glow"], ...[0, 1, 2, 3, 4].map((i) => B(.03, .16, .02, 1.3 + i * .07, 1.66, -1.34, "cream")), ...[-.5, -.25, 0, .25, .5].map((x, i) => B(.12, .1, .03, x, .52, -1.3, i % 2 ? "dark" : "accent", 0, .5)),
    B(.5, .34, .3, -.5, 2.0, 1.56, "canvas"), B(.4, .3, .3, .5, 2.0, 1.56, "plate2"), B(.44, .05, .34, .5, 2.0, 1.56, "dark"),
    C(.22, .05, -2.14, 1.52, 0, "cream", "x", 12), B(.07, .09, .36, -2.16, 1.52, 0, "accent"),
    // the head: a collar, a low domed housing with a visor that wraps round it and one eye, two whip aerials
    C(.56, .2, 0, 2.6, -.15, "dark", "y", 12), Bl(.8, .6, .92, 0, 2.86, -.16, "plate2"), { ...Bl(.84, .64, .96, 0, 2.86, -.16, "glow", { face: Math.PI, wide: 1.9, from: 1.3, to: 1.62 }) }, Bl(.3, .26, .3, .3, 2.72, -.5, "dark"), [.1, .1, .04, .3, 2.72, -.66, "glow"],
    B(.12, .16, .12, .4, 3.1, .26, "dark"), C(.018, 1.7, .4, 3.98, .26, "dark", "y", 4), C(.018, 1.0, -.36, 3.5, .3, "dark", "y", 4),
    // the engine pack on the back: a rounded housing, louvres, two stacks, vents that glow
    Bl(1.6, 1.4, .9, 0, 1.4, 1.14, "frame"), ...[0, 1, 2].map((i) => B(.9, .06, .1, 0, 1.2 + i * .2, 1.58, "dark", -.5)), [.2, .6, .06, -.5, 1.4, 1.5, "glow"], [.2, .6, .06, .5, 1.4, 1.5, "glow"],
    C(.12, 1.0, -.62, 2.4, 1.3, "dark", "y", 10, .12, [.22, 0]), C(.12, 1.0, .62, 2.4, 1.3, "dark", "y", 10, .12, [.22, 0]), C(.15, .1, -.62, 2.9, 1.41, "steel", "y", 10, .15, [.22, 0]), C(.15, .1, .62, 2.9, 1.41, "steel", "y", 10, .15, [.22, 0]),
    B(.3, .44, .17, -.56, .68, 1.5, "plate2"), B(.3, .44, .17, -.22, .68, 1.5, "plate2"), B(.5, .36, .28, .44, .68, 1.5, "canvas"),
    // rocket pod on the left shoulder: a rounded housing with six tubes
    Lf([[-.38, .9, 1.3], [0, 1.02, 1.4], [.38, .9, 1.3]], -1.56, 2.92, .1, "plate2", 8, .7), [.86, .6, .06, -1.56, 2.92, -.58, "dark"],
    ...[-.26, 0, .26].flatMap((dx) => [-.16, .16].flatMap((dy) => [C(.1, .1, -1.56 + dx, 2.92 + dy, -.62, "accent", "z", 10), C(.065, .12, -1.56 + dx, 2.92 + dy, -.64, "dark", "z", 10)])),
    // inside the cockpit: a seat and a few lit panels
    [.72, .5, .56, 0, .9, .42, "dark"], [.6, .8, .16, 0, 1.4, .7, "dark"], [.04, .3, .5, -.97, 1.5, -.15, "glow"], [.04, .3, .5, .97, 1.5, -.15, "glow"], [.5, .1, .04, 0, 1.0, -.76, "glow"]], S, glowMat);
  const hatch = joint(torso, 0, 2.06, -.96);
  build(hatch, [[1.36, 1.16, .2, 0, -.6, -.04, "plate"], Bl(1.2, 1.0, .3, 0, -.62, -.14, "plate2"), C(.06, 1.3, 0, -.02, -.02, "dark", "x", 8), B(.5, .08, .1, 0, -.22, -.26, "accent"), [.6, .08, .05, 0, -.42, -.29, "glow"]], S, glowMat);
  // arms: a ball at the shoulder, an upper arm and forearm that swell and taper, a gauntlet, and a hand with fingers and a thumb
  const arm = (sd) => { const up = joint(torso, sd * SH_X, SH_Y, 0), fore = joint(up, 0, -A1, 0), hand = joint(fore, 0, -A2, 0);
    build(up, [Bl(.7, .7, .74, 0, 0, 0, "dark"), Lf([[-A1, .4, .44], [-.9, .56, .62], [-.25, .64, .7], [.05, .5, .52]], 0, 0, 0, "frame"), Bl(.62, .86, .76, sd * .1, -.6, 0, "plate")], S, glowMat);
    build(fore, [Bl(.54, .54, .56, 0, 0, 0, "dark"), Lf([[-A2, .4, .44], [-1.0, .56, .6], [-.35, .54, .58], [0, .42, .44]], 0, 0, 0, "frame"), Lf([[-A2 + .12, .56, .6], [-.86, .72, .76], [-.5, .6, .64]], 0, 0, 0, "plate2", 10, .2), B(.1, .46, .1, sd * .37, -.86, 0, "accent"), Lf([[-1.2, .3, .5, sd * .3], [-.8, .36, .6, sd * .34], [-.5, .3, .5, sd * .3]], 0, 0, 0, "plate", 8, .4), C(.03, 1.0, -sd * .2, -.6, .3, "dark", "y", 6), ...[-.16, .16].map((z) => C(.03, .05, sd * .5, -.85, z, "steel", "x", 6))], S, glowMat);
    build(hand, [Bl(.5, .5, .4, 0, -.12, 0, "dark"), Bl(.56, .3, .5, 0, .04, 0, "plate"), ...[-.18, -.06, .06, .18].flatMap((x) => [B(.11, .26, .16, x, -.4, -.06, "frame"), B(.11, .14, .24, x, -.52, -.16, "frame")]), B(.13, .26, .16, sd * -.28, -.24, -.12, "frame", 0, sd * .4)], S, glowMat);
    return { up, fore, hand, sd }; };
  const armR = arm(1), armL = arm(-1);
  // the rifle: a 40 mm autocannon built like a rifle, held at the right shoulder with the left hand out on the foregrip.
  // Built pointing along -z from the butt of its stock.
  const gun = new THREE.Object3D(); torso.add(gun);
  build(gun, [Lf([[-.26, .2, .5], [0, .26, .62], [.2, .22, .5]], 0, -.02, -.28, "plate2", 8, .5), B(.3, .46, 1.5, 0, 0, -1.1, "frame"), Lf([[-.14, .32, 1.3], [.06, .26, 1.1]], 0, .26, -1.1, "plate", 8, .6),
    B(.16, .5, .2, 0, -.44, -.62, "dark", .3), 
    C(.2, 1.1, 0, .02, -2.3, "plate2", "z", 10), B(.14, .4, .18, 0, -.36, -2.15, "dark", -.15), C(.11, 1.5, 0, .02, -3.4, "dark", "z", 10), C(.17, .32, 0, .02, -4.1, "frame", "z", 10), C(.19, .06, 0, .02, -3.98, "steel", "z", 10),
    C(.045, 1.6, 0, -.14, -2.9, "steel", "z", 6), B(.08, .12, .9, 0, .4, -1.2, "dark"), B(.1, .16, .14, 0, .5, -.9, "dark"), B(.1, .2, .1, 0, .5, -1.56, "dark"), [.05, .05, .02, 0, .52, -1.62, "glow"], Lf([[-.14, .3, .34], [.14, .3, .34]], 0, 0, -.3, "canvas", 8, .5, Math.PI / 2), B(.04, .2, 1.9, .2, -.1, -1.4, "dark"), C(.2, .2, .26, .0, -1.2, "plate2", "x", 10)], S, glowMat);
  /* Each mech's primary gets pieces of its own on top of the plain rifle, so you can tell them apart across a field:
     rail-carbine (long, lit rails), Vulcan (a ring of barrels and a belt box), flak-shotgun (two short fat barrels),
     plasma repeater (lit coils), slag launcher (a wide tube and a tank). The Centurion keeps the plain autocannon. */
  { const X = { kestrel: [C(.07, 2.2, 0, .02, -4.9, "dark", "z", 8), B(.05, .05, 2.6, -.16, .12, -3.4, "glow"), B(.05, .05, 2.6, .16, .12, -3.4, "glow"), B(.12, .3, .5, 0, .34, -1.3, "dark")],
      bastion: [...[0, 1, 2, 3, 4, 5].map((i) => C(.075, 2.4, Math.cos(i * 1.047) * .2, .02 + Math.sin(i * 1.047) * .2, -3.6, "dark", "z", 6)), C(.34, .3, 0, .02, -2.5, "frame", "z", 10), C(.34, .16, 0, .02, -4.6, "steel", "z", 10), B(.7, .7, .9, -.5, -.3, -1.1, "plate2"), B(.72, .1, .92, -.5, .02, -1.1, "accent")],
      jackal: [C(.2, 1.1, -.17, .02, -3.2, "dark", "z", 8), C(.2, 1.1, .17, .02, -3.2, "dark", "z", 8), B(.8, .5, .7, 0, -.05, -2.3, "frame"), B(.82, .08, .3, 0, .22, -2.3, "accent")],
      nomad: [...[0, 1, 2].map((i) => C(.24, .12, 0, .02, -2.7 - i * .45, "glow", "z", 10)), B(.2, .2, .5, 0, .34, -1.4, "accent")],
      furnace: [C(.36, 2.0, 0, .02, -3.3, "dark", "z", 10), C(.4, .2, 0, .02, -4.2, "steel", "z", 10), C(.4, 1.0, .0, .62, -1.5, "plate2", "z", 10), C(.41, .12, 0, .62, -1.5, "accent", "z", 10), B(.1, .1, .1, 0, .02, -4.32, "glow")] }[o.mech];
    if (X) build(gun, X, S, glowMat); }
  const drumG = new THREE.Group(); gun.add(drumG); build(drumG, [C(.34, .34, 0, -.36, -1.2, "plate", "x", 12), C(.35, .08, 0, -.36, -1.2, "accent", "x", 12), B(.2, .16, .3, 0, -.14, -1.2, "dark")], S, glowMat);   // the drum, a piece of its own so a reload can take it off
  const muzzle = joint(gun, 0, .02, -4.3), flash = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .8), hot); flash.visible = false; muzzle.add(flash);
  // the blade: carried across the back, and in the left hand for the moment it is swung
  const bladeParts = (len) => [B(.16, .5, .16, 0, .25, 0, "dark"), B(.6, .1, .2, 0, 0, 0, "steel"), H(.34, len, .08, 0, -len / 2, 0, "steel", { sx: 1 }), H(.34, .5, .08, 0, -len - .25, 0, "steel", { sx: 1 }, Math.PI, 0, 0), [.06, len * .9, .1, 0, -len / 2, 0, "glow"]];
  const bladeBack = new THREE.Object3D(); bladeBack.position.set(.2, 2.3, 1.62); bladeBack.rotation.set(0, 0, .5); torso.add(bladeBack); build(bladeBack, bladeParts(2.3), S, glowMat);
  const bladeHand = new THREE.Object3D(); bladeHand.position.set(0, -.3, -.1); bladeHand.rotation.set(-1.2, 0, 0); armL.hand.add(bladeHand); build(bladeHand, bladeParts(2.3), S, glowMat); bladeHand.visible = false;
  const pod = joint(torso, -SH_X - .3, SH_Y + 1.1, -.5);
  const husk = new THREE.MeshToonMaterial({ color: "#1c1a18", gradientMap: grad, side: THREE.DoubleSide });

  const DOWN = new THREE.Vector3(0, -1, 0), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  // bend one arm so its hand is at T (in the torso's own space), elbow toward the pole
  function reach(A, T, px, py, pz) { const S0 = A.up.position, l1 = A1, l2 = A2 + .12; v1.copy(T).sub(S0); let d = v1.length(); v1.divideScalar(d || 1); d = clamp(d, Math.abs(l1 - l2) + .05, l1 + l2 - .02);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)); v2.set(px, py, pz).addScaledVector(v1, -(px * v1.x + py * v1.y + pz * v1.z)); if (v2.lengthSq() < 1e-6) v2.set(0, -1, 0); v2.normalize();
    v3.copy(v1).multiplyScalar(a).addScaledVector(v2, h);   // the elbow, from the shoulder
    q1.setFromUnitVectors(DOWN, v2.copy(v3).normalize()); A.up.quaternion.copy(q1); v2.copy(v1).multiplyScalar(d).sub(v3).normalize(); q2.setFromUnitVectors(DOWN, v2); A.fore.quaternion.copy(q1).invert().multiply(q2); }
  gun.scale.setScalar(gsc); const HOLD = { x: SH_X + .2, y: SH_Y - .38, z: -.05, blade: .55, grip: new THREE.Vector3(0, -.5, -.62), fore: new THREE.Vector3(0, -.42, -2.15), well: new THREE.Vector3(0, -.36, -1.2), mag: drumG, drum: drumG.children[0] }, hipL = new THREE.Vector3(-1.5, -.3, .5), drops = [], key = (u, K) => { if (u <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (u <= K[i][0]) { const a = K[i - 1], b = K[i], k = (u - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * (k * k * (3 - 2 * k)); } return K[K.length - 1][1]; }; let reWas = -1;
  const tR = new THREE.Vector3(), tL = new THREE.Vector3(), hang = new THREE.Vector3(), swing = new THREE.Vector3();
  torso.scale.set(bulk, 1, bulk); hips.scale.set(bulk, 1, bulk);
  { // the block body in place of the built plates
    const inKeep = (m) => { for (let q = m; q; q = q.parent) if (q === gun || q === bladeHand) return true; return false; }; root.traverse((m) => { if (m.isMesh && !inKeep(m)) m.visible = false; }); bladeBack.scale.setScalar(.001);
    const tone = (hex, k) => "#" + new THREE.Color(hex).multiplyScalar(k).getHexString(), S2 = { ...S, grit: .3, gritScale: 1.2 }; MB.palette.forEach((c, i) => { S2["c" + i] = tone(c, team === "foe" ? 1.05 : 1.5); }); if (MB.accent >= 0) S2["c" + MB.accent] = S.accent;   // a body whose model has a small bright trim takes the paint there; one without keeps its own colours
    const g = MB.g, put = (j, runs) => build(j, runs.map(([x, y, z, n, ci]) => B(g * 1.02, n * g * 1.01, g * 1.02, x * g, (y + (n - 1) / 2) * g, z * g, "c" + ci)), S2, glowMat);
    put(hips, MB.parts.hips); put(torso, MB.parts.torso); legs.forEach((L) => { const s = L.sd < 0 ? "L" : "R"; put(L.thigh, MB.parts["thigh" + s]); put(L.shin, MB.parts["shin" + s]); put(L.foot, MB.parts["foot" + s]); });
    for (const A of [armR, armL]) { const s = A.sd < 0 ? "L" : "R"; put(A.up, MB.parts["up" + s]); put(A.fore, MB.parts["fore" + s]); }
    // the hatch: a plate on the chest's front, hinged along its top, that swings up when a pilot climbs in
    let fz = 0; for (const r of MB.parts.torso) if (Math.abs(r[0] * g) < .45) fz = Math.min(fz, r[2] * g);
    let ty = -9, by = 9; for (const r of MB.parts.torso) if (Math.abs(r[0] * g) < .45 && r[2] * g < fz + g * 2.5) { ty = Math.max(ty, (r[1] + r[3] - .5) * g); by = Math.min(by, (r[1] - .5) * g); }
    const hh = clamp(ty - by, .7, 1.3), hw = Math.min(1.1, SH_X * 1.1);
    hatch.position.set(0, ty, fz - g * .75); build(hatch, [B(hw, hh, g * .5, 0, -hh / 2, 0, "c" + Math.max(0, MB.palette.length - 3)), B(hw * .8, .1, g * .6, 0, -.2, -.02, "accent"), B(hw * .45, .07, g * .7, 0, -hh + .2, -.02, "glow")], S2, glowMat); }
  const rig = { root, hips, torso, hatch, muzzle, pod, flash, gun, hold: HOLD, phase: Math.random(), aimYaw: 0, aimPitch: 0, low: 0,
    pose(dt, s) {
      const sp = Math.abs(s.speed || 0), sg = (s.speed || 0) < 0 ? -1 : 1, amt = clamp(sp / 1.4, 0, 1), kn = clamp(s.kneel || 0, 0, 1), limp = s.limp ? 1 : 0;
      rig.phase = (rig.phase + sp * dt / 3.6) % 1;
      const stride = clamp(sp / 5, 0, 1) * 2.0 * sg, bob = Math.abs(Math.sin(rig.phase * Math.PI * 2)) * .1 * amt, hipY = HIP_Y - .06 - KNEEL * kn - bob - limp * .5, w = Math.sin(rig.phase * Math.PI * 2);
      hips.position.y = hipY; hips.rotation.z = w * .045 * amt; hips.rotation.x = -kn * .08; hips.rotation.y = w * .07 * amt;
      legs.forEach((L, i) => { const p = (rig.phase + i * .5) % 1; let f, lift = 0;
        if (p < .62) f = stride / 2 - stride * (p / .62); else { const u = (p - .62) / .38, e = u * u * (3 - 2 * u); f = -stride / 2 + stride * e; lift = Math.sin(Math.PI * u) * .6 * amt; }
        f = lerp(f, i ? .75 : -.85, kn);   // kneeling: one foot forward, one knee toward the ground
        const fy = -(hipY - ANK) + lift, d = clamp(Math.hypot(f, fy), .5, L1 + L2 - .01), dir = Math.atan2(f, -fy);
        const k1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), k2 = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
        L.thigh.rotation.x = dir + k1; L.thigh.rotation.z = L.sd * .05; L.shin.rotation.x = -(Math.PI - k2); L.foot.rotation.x = -(L.thigh.rotation.x + L.shin.rotation.x) + (lift > 0 ? -.25 * Math.sin(Math.PI * clamp((p - .62) / .38, 0, 1)) : 0) - (i ? 0 : kn * .5); });
      // it turns to its aim heavily, a little behind the pilot's hand
      const kY = 1 - Math.exp(-dt * 6.5); rig.aimYaw += ((s.aimYaw || 0) - rig.aimYaw) * kY; rig.aimPitch += ((s.aimPitch || 0) - rig.aimPitch) * kY;
      const H = rig.hold, BLADE = H.blade, re = H.mag && s.reload >= 0 && !limp ? s.reload : -1, rec = s.recoil || 0, pu = s.punch || 0, lowTo = Math.max(limp, kn * .85); rig.low += (lowTo - rig.low) * (1 - Math.exp(-dt * 5)); const low = rig.low, up = 1 - low;
      // a rifleman's stance: the body turned off the line of fire, left shoulder forward, the rifle across it and pointing where it looks
      torso.rotation.set(-kn * .2 - limp * .45 + rec * .03 + .05 * up, (rig.aimYaw - BLADE * up) * (1 - limp) + pu * .7 - hips.rotation.y, -hips.rotation.z * .6, "YXZ");
      hatch.rotation.x = clamp(s.hatch || 0, 0, 1) * 1.95;
      /* A reload, the way a big walker does it: the rifle is swung up and rolled over so the drum faces out, the left hand
         leaves the handguard, takes the drum and pulls it down and off (it falls), goes to the hip for a fresh one, pushes
         it up into the well, and goes back to the handguard as the rifle comes down. re runs 0 to 1. */
      const rUp = re < 0 ? 0 : key(re, [[0, 0], [.12, 1], [.8, 1], [1, 0]]), hk = re < 0 ? 0 : key(re, [[0, 0], [.08, 0], [.2, 1], [.32, 1], [.42, 2], [.5, 2], [.6, 1], [.7, 1], [.84, 0], [1, 0]]), mOff = re < 0 ? 0 : re < .33 ? key(re, [[0, 0], [.22, 0], [.32, -.9]]) : key(re, [[.33, -1.4], [.58, -1.4], [.68, 0]]), seat = re < 0 ? 0 : key(re, [[.66, 0], [.685, 1], [.76, 0]]);
      gun.position.set(H.x - low * .1 - rUp * .1, H.y - low * .5 + w * .03 * amt + rUp * .12 + seat * .07, H.z + low * .1); gun.rotation.set(rig.aimPitch * up * (1 - rUp) - low * .95 + rec * .05 + rUp * .3, BLADE * up + low * .15 + rUp * .1, w * .03 * amt - low * .2 - rUp * .45, "YXZ"); gun.translateZ(rec * .24); gun.updateMatrix();
      tR.copy(H.grip).applyMatrix4(gun.matrix); tL.copy(H.fore).applyMatrix4(gun.matrix);
      if (H.mag) { H.mag.position.y = mOff; H.mag.visible = re < 0 || re < .33 || re > .52;
        if (re >= 0) { hang.copy(H.well); hang.y += mOff - .1; hang.applyMatrix4(gun.matrix); if (hk <= 1) tL.lerp(hang, hk); else tL.copy(hang).lerp(hipL, hk - 1); }
        if (re >= .33 && reWas < .33 && reWas >= 0 && root.parent) { const d = H.drum.clone(); H.mag.updateWorldMatrix(true, false); d.applyMatrix4(H.mag.matrixWorld); d.matrixAutoUpdate = true; d.matrix.decompose(d.position, d.quaternion, d.scale); root.parent.add(d); drops.push({ m: d, vy: 0, t: 0, floor: root.position.y + 4 }); }   // the spent drum goes to the ground
        reWas = re; }
      for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; d.vy -= 9.8 * U * dt; d.m.position.y = Math.max(d.floor, d.m.position.y + d.vy * dt); if (d.m.position.y > d.floor) d.m.rotation.x += dt * 2; if (d.t > 6) { d.m.removeFromParent(); drops.splice(i, 1); } }
      if (pu > 0) { swing.set(.3 - pu * 1.2, 2.3 - pu * 1.2, -2.3); tL.lerp(swing, Math.min(1, pu * 2.2)); }   // the left hand lets go of the rifle and brings the blade across
      if (limp) { hang.set(-SH_X - .2, SH_Y - 2.6, .3); tL.lerp(hang, .9); }
      reach(armR, tR, .9, -1, .5); reach(armL, tL, -.8, -1, .2 - pu);
      bladeHand.visible = pu > .04; bladeBack.visible = !bladeHand.visible;
      flash.visible = rec > .75; if (flash.visible) flash.rotation.z = Math.random() * 3;
    },
    // what is left when the reactor goes: a burnt shell down on one knee
    wreck() { root.traverse((o) => { if (!o.isMesh) return; if (o.material === charMat) { o.material = husk; } else o.visible = false; }); rig.pose(.5, { kneel: 1, limp: true, hatch: .7 }); },
  };
  if (MODEL) puppet(rig, { legs, armR, armL, bladeBack, bladeHand, gun, team });
  rig.pose(.016, {});
  return rig;
}
export const TITAN = { HIP_Y, KNEEL, CHEST: HIP_Y + .35 + 1.45 };

/* hang the model on a walker and make the walker drive it */
function puppet(rig, P) {
  const keep = [P.gun];
  if (TRIFLE) { const G = modelGun(P.team); P.gun.traverse((o) => { if (o.isMesh && o !== rig.flash) o.visible = false; }); P.gun.add(G.g); rig.muzzle.position.copy(G.muzzle);
    Object.assign(rig.hold, { x: 1.2, y: .95, z: -.05, blade: .55, grip: G.grip, fore: G.fore, well: G.well, mag: G.mag, drum: G.drum }); }   // carried low at the hip, both hands on it, the body turned a little off the line
  else P.gun.scale.setScalar(.82);
  const W = wear(MODEL, { root: rig.root, height: 5.8, turn: Math.PI, team: P.team, hips: rig.hips, hipY: HIP_Y - .06, ankle: ANK, fwd: [0, 0, -1], full: [["Spine", rig.torso]], keep, armScale: TRIFLE ? 1.2 : 1,
    legs: P.legs.map((L) => ({ foot: L.foot, sd: L.sd })), arms: [P.armR, P.armL].map((A) => ({ hand: A.hand, sd: A.sd, pole: [A.sd * .9, -1, .6], poleIn: rig.torso })) });
  const pose0 = rig.pose; rig.model = W.box;
  rig.pose = (dt, s) => { pose0(dt, s); P.bladeBack.visible = P.bladeHand.visible = false; W.update(); };   // no blade with the model on: the melee is a swing of the left arm
  rig.wreck = () => { rig.pose(.5, { kneel: 1, limp: true, hatch: .7 }); P.gun.visible = false; W.husk(); };
}
