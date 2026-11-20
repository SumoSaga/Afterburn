/* Afterburn: the Titan, an original humanoid walker about six metres tall.
   A skeleton of joints (hips, two legs of thigh, shin and foot, a torso that turns at the waist, two arms of upper arm
   and forearm, hands) carrying limbs that swell and taper like a body's, rounded armour, joints, pistons and stowage,
   built from the pieces in mf/parts.js. It carries a 40 mm rifle in
   both hands the way a rifleman does, and a blade on its back for close work. The chest is a hollow shell with a hatch
   hinged at its top, so a pilot can really go in through the front. A rocket pod sits on the left shoulder.
   It is posed every frame from a few numbers: how fast it walks, how far it
   kneels, how far the hatch is open, where it aims, recoil, a punch. Built in metres, facing -z, drawn at U. */
import { THREE, U, clamp, lerp, charMat, grad } from "./engine.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { build, box as B, hull as H, drum as C, loft as Lf, ball as Bl } from "./parts.js";

const SCHEMES = {
  you: { frame: "#34373a", plate: "#b9b3a4", plate2: "#8f8a80", accent: "#c45a1e", dark: "#1e2022", glow: [.5, 2.6, 3.2], steel: "#a3a8ab", canvas: "#7a6a4c", cream: "#e2dac4" },
  foe: { frame: "#1e2022", plate: "#4a4e52", plate2: "#36393c", accent: "#b0312a", dark: "#141516", glow: [3.4, .5, .3], steel: "#7c8084", canvas: "#4a4336", cream: "#b9b3a4" },
};
const L1 = 1.3, L2 = 1.35, ANK = .27, HIP_Y = 2.85, HIP_X = .66, KNEEL = 1.25, SH_X = 1.5, SH_Y = 1.74, A1 = 1.5, A2 = 1.45;
/* The mech's body is a rigged model (models/mech.glb, a Mixamo skeleton with no animations of its own). The walker below
   is still built and posed as before, but with a model loaded its own plates are hidden and it becomes the puppeteer:
   each frame the model's hips, spine, legs and arms are bent to follow it, so every pose the game already knows
   (walking, kneeling, aiming, recoil, the punch, the doomed limp) carries over. The rifle and blade stay as they were.
   If the file cannot be loaded the old walker is drawn instead. */
const MODEL_H = 5.8, MODEL = { scene: null, mats: {} };
try { const g = await new GLTFLoader().loadAsync(new URL("../models/mech.glb?v=" + (globalThis.AB_BUILD || ""), import.meta.url).href); let map = null; g.scene.traverse((o) => { if (o.isMesh && o.material.map) map = o.material.map; });
  const mk = (col, key) => { const m = new THREE.MeshToonMaterial({ map, color: col, gradientMap: grad }); m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.a = 0.5;"); }; m.customProgramCacheKey = () => key; return m; };
  MODEL.mats = { you: mk("#ffffff", "mfMechA"), foe: mk("#b98f86", "mfMechB"), husk: mk("#2a2624", "mfMechH") }; MODEL.scene = g.scene; } catch (e) { console.warn("mech model not loaded, using the built walker", e); }
const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

export function makeRig(team, o = {}) {
  const S = { ...(SCHEMES[team] || SCHEMES.you), grit: .85, gritScale: 1.9, ...o }, Sm = { ...S, mud: .75 }, glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...S.glow) }), hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, .7) });
  const root = new THREE.Group(); root.scale.setScalar(U);
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
    B(.16, .5, .2, 0, -.44, -.62, "dark", .3), C(.32, .3, 0, -.34, -1.2, "plate", "x", 12), C(.33, .07, 0, -.34, -1.2, "accent", "x", 12),
    C(.2, 1.1, 0, .02, -2.3, "plate2", "z", 10), B(.14, .4, .18, 0, -.36, -2.15, "dark", -.15), C(.11, 1.5, 0, .02, -3.4, "dark", "z", 10), C(.17, .32, 0, .02, -4.1, "frame", "z", 10), C(.19, .06, 0, .02, -3.98, "steel", "z", 10),
    C(.045, 1.6, 0, -.14, -2.9, "steel", "z", 6), B(.08, .12, .9, 0, .4, -1.2, "dark"), B(.1, .16, .14, 0, .5, -.9, "dark"), B(.1, .2, .1, 0, .5, -1.56, "dark"), [.05, .05, .02, 0, .52, -1.62, "glow"], Lf([[-.14, .3, .34], [.14, .3, .34]], 0, 0, -.3, "canvas", 8, .5, Math.PI / 2), B(.04, .2, 1.9, .2, -.1, -1.4, "dark"), C(.2, .2, .26, .0, -1.2, "plate2", "x", 10)], S, glowMat);
  const muzzle = joint(gun, 0, .02, -4.3), flash = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .8), hot); flash.visible = false; muzzle.add(flash);
  // the blade: carried across the back, and in the left hand for the moment it is swung
  const bladeParts = (len) => [B(.16, .5, .16, 0, .25, 0, "dark"), B(.6, .1, .2, 0, 0, 0, "steel"), H(.34, len, .08, 0, -len / 2, 0, "steel", { sx: 1 }), H(.34, .5, .08, 0, -len - .25, 0, "steel", { sx: 1 }, Math.PI, 0, 0), [.06, len * .9, .1, 0, -len / 2, 0, "glow"]];
  const bladeBack = new THREE.Object3D(); bladeBack.position.set(.2, 2.3, 1.62); bladeBack.rotation.set(0, 0, .5); torso.add(bladeBack); build(bladeBack, bladeParts(2.3), S, glowMat);
  const bladeHand = new THREE.Object3D(); bladeHand.position.set(0, -.3, -.1); bladeHand.rotation.set(-1.2, 0, 0); armL.hand.add(bladeHand); build(bladeHand, bladeParts(2.3), S, glowMat); bladeHand.visible = false;
  const pod = joint(torso, -1.56, 2.92, -.7);
  const husk = new THREE.MeshToonMaterial({ color: "#1c1a18", gradientMap: grad, side: THREE.DoubleSide });

  const DOWN = new THREE.Vector3(0, -1, 0), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  // bend one arm so its hand is at T (in the torso's own space), elbow toward the pole
  function reach(A, T, px, py, pz) { const S0 = A.up.position, l1 = A1, l2 = A2 + .12; v1.copy(T).sub(S0); let d = v1.length(); v1.divideScalar(d || 1); d = clamp(d, Math.abs(l1 - l2) + .05, l1 + l2 - .02);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)); v2.set(px, py, pz).addScaledVector(v1, -(px * v1.x + py * v1.y + pz * v1.z)); if (v2.lengthSq() < 1e-6) v2.set(0, -1, 0); v2.normalize();
    v3.copy(v1).multiplyScalar(a).addScaledVector(v2, h);   // the elbow, from the shoulder
    q1.setFromUnitVectors(DOWN, v2.copy(v3).normalize()); A.up.quaternion.copy(q1); v2.copy(v1).multiplyScalar(d).sub(v3).normalize(); q2.setFromUnitVectors(DOWN, v2); A.fore.quaternion.copy(q1).invert().multiply(q2); }
  const GRIP = new THREE.Vector3(0, -.5, -.62), FORE = new THREE.Vector3(0, -.42, -2.15), tR = new THREE.Vector3(), tL = new THREE.Vector3(), hang = new THREE.Vector3(), swing = new THREE.Vector3(), BLADE = .62;
  const rig = { root, hips, torso, hatch, muzzle, pod, flash, gun, phase: Math.random(), aimYaw: 0, aimPitch: 0, low: 0,
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
      const rec = s.recoil || 0, pu = s.punch || 0, lowTo = Math.max(limp, kn * .85); rig.low += (lowTo - rig.low) * (1 - Math.exp(-dt * 5)); const low = rig.low, up = 1 - low;
      // a rifleman's stance: the body turned off the line of fire, left shoulder forward, the rifle across it and pointing where it looks
      torso.rotation.set(-kn * .2 - limp * .45 + rec * .03 + .05 * up, (rig.aimYaw - BLADE * up) * (1 - limp) + pu * .7 - hips.rotation.y, -hips.rotation.z * .6, "YXZ");
      hatch.rotation.x = clamp(s.hatch || 0, 0, 1) * 1.95;
      gun.position.set(1.34 - low * .1, 1.5 - low * .5 + w * .03 * amt, -.72 + low * .1); gun.rotation.set(rig.aimPitch * up - low * .95 + rec * .05, BLADE * up + low * .15, w * .03 * amt - low * .2, "YXZ"); gun.translateZ(rec * .24); gun.updateMatrix();
      tR.copy(GRIP).applyMatrix4(gun.matrix); tL.copy(FORE).applyMatrix4(gun.matrix);
      if (pu > 0) { swing.set(.3 - pu * 1.2, 2.3 - pu * 1.2, -2.3); tL.lerp(swing, Math.min(1, pu * 2.2)); }   // the left hand lets go of the rifle and brings the blade across
      if (limp) { hang.set(-SH_X - .2, SH_Y - 2.6, .3); tL.lerp(hang, .9); }
      reach(armR, tR, .9, -1, .5); reach(armL, tL, -.8, -1, .2 - pu);
      bladeHand.visible = pu > .04; bladeBack.visible = !bladeHand.visible;
      flash.visible = rec > .75; if (flash.visible) flash.rotation.z = Math.random() * 3;
    },
    // what is left when the reactor goes: a burnt shell down on one knee
    wreck() { root.traverse((o) => { if (!o.isMesh) return; if (o.material === charMat) { o.material = husk; } else o.visible = false; }); rig.pose(.5, { kneel: 1, limp: true, hatch: .7 }); },
  };
  if (MODEL.scene) puppet(rig, { legs, armR, armL, bladeBack, bladeHand, gun, team });
  rig.pose(.016, {});
  return rig;
}
export const TITAN = { HIP_Y, KNEEL, CHEST: HIP_Y + .35 + 1.45 };

/* hang the model on a walker and make the walker drive it */
function puppet(rig, P) {
  const root = rig.root, box = new THREE.Group(), mdl = cloneSkinned(MODEL.scene); box.rotation.y = Math.PI; box.scale.setScalar(MODEL_H); box.add(mdl); root.add(box);
  let skin = null; mdl.traverse((o) => { if (o.isSkinnedMesh) { skin = o; o.material = MODEL.mats[P.team] || MODEL.mats.you; o.frustumCulled = false; o.castShadow = true; } });
  const keep = new Set(); for (const k of [P.gun, P.bladeBack, P.bladeHand]) k.traverse((o) => keep.add(o)); box.traverse((o) => keep.add(o));
  root.traverse((o) => { if (o.isMesh && !keep.has(o)) { o.visible = false; o.userData.shell = true; } });
  P.bladeBack.position.set(.3, 2.5, 1.22); P.gun.scale.setScalar(.82);
  const bone = (n) => mdl.getObjectByName("mixamorig" + n), V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const a = V(), b = V(), c = V(), d = V(), qa = Q(), qb = Q(), qc = Q(), qBox = Q(), qRoot = Q(), UNIT = new THREE.Vector3(1, 1, 1);
  root.updateMatrixWorld(true); box.getWorldQuaternion(qBox); const qBoxI0 = qBox.clone().invert();
  // how a bone sits at rest, in the model's own frame, and which way it points to the next joint
  const rest = (bn, child) => { const r = { b: bn, q: bn.getWorldQuaternion(Q()).premultiply(qBoxI0), d: null, len: 0 }; if (child) { bn.getWorldPosition(a); child.getWorldPosition(b); r.len = b.distanceTo(a) / root.scale.x; r.d = b.clone().sub(a).normalize().applyQuaternion(qBoxI0); } return r; };
  const side = (n) => { const L = bone("Left" + n), R = bone("Right" + n); return root.worldToLocal(L.getWorldPosition(V())).x > 0 ? [R, L] : [L, R]; };   // [the one on -x, the one on +x]
  const hipsB = bone("Hips"), R = { hips: rest(hipsB), spine: rest(bone("Spine")) };
  const up = side("UpLeg"), lo = side("Leg"), ft = side("Foot"), ar = side("Arm"), fa = side("ForeArm"), ha = side("Hand");
  const LEG = [0, 1].map((i) => ({ up: rest(up[i], lo[i]), lo: rest(lo[i], ft[i]), ft: rest(ft[i]) })), ARM = [0, 1].map((i) => ({ up: rest(ar[i], fa[i]), lo: rest(fa[i], ha[i]) }));
  const hip0 = root.worldToLocal(hipsB.getWorldPosition(V())), hipLift = hip0.y - (HIP_Y - .06), ankLift = root.worldToLocal(ft[0].getWorldPosition(V())).y - ANK;
  // turn a bone so it sits as the walker's joint does (full), or so it points along a line (aim)
  const full = (r, j) => { j.getWorldQuaternion(qa).multiply(qc.copy(qRoot).invert()).multiply(qBox).multiply(r.q); r.b.parent.getWorldQuaternion(qb).invert(); r.b.quaternion.copy(qb.multiply(qa)); };
  const aim = (r, dir) => { c.copy(dir).normalize().applyQuaternion(qc.copy(qBox).invert()); qa.setFromUnitVectors(r.d, c).multiply(r.q).premultiply(qBox); r.b.parent.getWorldQuaternion(qb).invert(); r.b.quaternion.copy(qb.multiply(qa)); };
  // two bones from A to T, the middle joint pushed toward the pole. All in world units.
  const limb = (r1, r2, T, pole) => { const s = root.scale.x, l1 = r1.len * s, l2 = r2.len * s; r1.b.getWorldPosition(a); b.copy(T).sub(a); let dist = b.length(); b.divideScalar(dist || 1); dist = clamp(dist, Math.abs(l1 - l2) + .01 * s, l1 + l2 - .01 * s);
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)); d.copy(pole).addScaledVector(b, -pole.dot(b)); if (d.lengthSq() < 1e-8) d.set(0, -1, 0); d.normalize();
    d.multiplyScalar(h).addScaledVector(b, x); aim(r1, d); b.multiplyScalar(dist).sub(d); aim(r2, b); };
  const T = V(), pole = V(), pose0 = rig.pose;
  rig.model = box;
  rig.pose = (dt, s) => { pose0(dt, s); P.bladeBack.visible = P.bladeHand.visible = false; root.updateMatrixWorld(true); root.getWorldQuaternion(qRoot); box.getWorldQuaternion(qBox);
    T.copy(rig.hips.position); T.y += hipLift; root.localToWorld(T); hipsB.position.copy(hipsB.parent.worldToLocal(T)); full(R.hips, rig.hips); full(R.spine, rig.torso);
    P.legs.forEach((L, i) => { const k = L.sd > 0 ? 1 : 0, G = LEG[k]; L.foot.getWorldPosition(T); root.worldToLocal(T); T.y += ankLift; root.localToWorld(T); pole.set(0, 0, -1).applyQuaternion(qRoot); limb(G.up, G.lo, T, pole); full(G.ft, L.foot); });
    for (const A of [P.armR, P.armL]) { const k = A.sd > 0 ? 1 : 0, G = ARM[k]; A.hand.getWorldPosition(T); rig.torso.getWorldQuaternion(qa); pole.set(A.sd * .9, -1, .6).applyQuaternion(qa); limb(G.up, G.lo, T, pole); } };
  rig.wreck = () => { rig.pose(.5, { kneel: 1, limp: true, hatch: .7 }); skin.material = MODEL.mats.husk; P.gun.visible = false; P.bladeBack.visible = P.bladeHand.visible = false; root.traverse((o) => { if (o.isMesh && o.userData.shell) o.visible = false; }); };
}
